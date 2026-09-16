import { describe, expect, it } from 'vitest';
import { addAmounts, formatAmount, isAmount, isZeroAmount } from './money.js';

/**
 * PD-MONITOR-001 needs exactly two operations on money and REQ-PROVIDER-121 fixes both: addition in
 * exact decimal arithmetic, never binary floating point, and an amount rendered half-up to two
 * decimal places or four below one hundredth. ADR-0031's branded type, its library and its lint rule
 * stay blocked on OQ-21 and are not anticipated here.
 */
describe('engine — exact decimal money (PD-MONITOR-001, REQ-PROVIDER-121)', () => {
  it('adds at the wider scale and keeps every place the operands carried', () => {
    expect(addAmounts('0', '0.0012')).toBe('0.0012');
    expect(addAmounts('0.0012', '0.00034')).toBe('0.00154');
    expect(addAmounts('1.5', '2')).toBe('3.5');
    expect(addAmounts('0.00000001', '0.00000002')).toBe('0.00000003');
  });

  it('is exact where binary floating point is not — the sum the rule exists to protect', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addAmounts('0.1', '0.2')).toBe('0.3');
    // Ten thousand requests at a hundredth of a cent, which a double accumulates wrong.
    let total = '0';
    for (let i = 0; i < 10_000; i += 1) total = addAmounts(total, '0.0001');
    expect(total).toBe('1.0000');
  });

  it('leaves a total unmoved by a figure that is not an amount, in either direction', () => {
    expect(addAmounts('0.5', 'free')).toBe('0.5');
    expect(addAmounts('0.5', '1e-3')).toBe('0.5');
    expect(isAmount('1e-3')).toBe(false);
    expect(isAmount('0.0010')).toBe(true);
  });

  it('reads zero at any scale, so a total of 0.0000 is still no price established', () => {
    expect(isZeroAmount('0')).toBe(true);
    expect(isZeroAmount('0.0000')).toBe(true);
    expect(isZeroAmount('0.0001')).toBe(false);
    expect(isZeroAmount('nothing')).toBe(false);
  });

  it('renders half-up to two places, and to four below one hundredth so a small cost is never a zero', () => {
    expect(formatAmount('1.005')).toBe('1.01');
    expect(formatAmount('1.004')).toBe('1.00');
    expect(formatAmount('0.01')).toBe('0.01');
    expect(formatAmount('0.009999')).toBe('0.0100');
    expect(formatAmount('0.0012')).toBe('0.0012');
    expect(formatAmount('0.00005')).toBe('0.0001');
    expect(formatAmount('0.000001')).toBe('0.0000');
    expect(formatAmount('0')).toBe('0.00');
    expect(formatAmount('7')).toBe('7.00');
    expect(formatAmount('not money')).toBeNull();
  });
});
