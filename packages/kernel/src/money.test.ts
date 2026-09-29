import { describe, expect, it } from 'vitest';
import { addAmounts, amountFromText, formatAmount, isAmount, isZeroAmount, multiplyAmount } from './money.js';

/**
 * PD-MONITOR-001 needs three operations on money and REQ-PROVIDER-121 fixes how: addition and, since
 * revision 2, multiplication by a whole token count, both in exact decimal arithmetic and never in binary
 * floating point, and an amount rendered half-up to two decimal places or four below one hundredth.
 * ADR-0031, accepted narrowed (R-049), keeps the representation this module already had.
 */
describe('kernel — exact decimal money (PD-MONITOR-001, REQ-PROVIDER-121, ADR-0031)', () => {
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

  it('REQ-PROVIDER-121: renders half-up to two places, and to four below one hundredth', () => {
    expect(formatAmount('1.005')).toBe('1.01');
    expect(formatAmount('1.004')).toBe('1.00');
    expect(formatAmount('0.01')).toBe('0.01');
    expect(formatAmount('0.009999')).toBe('0.0100');
    expect(formatAmount('0.0012')).toBe('0.0012');
    expect(formatAmount('0.00005')).toBe('0.0001');
    expect(formatAmount('0.0001')).toBe('0.0001');
    expect(formatAmount('0')).toBe('0.00');
    expect(formatAmount('7')).toBe('7.00');
    expect(formatAmount('not money')).toBeNull();
  });

  it('REQ-SHELL-045, REQ-PROVIDER-121 (ESC-42 option b): a cost greater than zero that four places would render as zero renders as the floor < 0.0001, never as zero', () => {
    expect(formatAmount('0.000001')).toBe('< 0.0001');
    expect(formatAmount('0.00004999')).toBe('< 0.0001');
    // 50 tokens at a configured 0.0000001 — the case that made the contradiction reachable (PD-MONITOR-001 revision 2).
    expect(formatAmount('0.0000050')).toBe('< 0.0001');
    expect(formatAmount('0.000000000000000001')).toBe('< 0.0001');
    // The floor's edge: half-up still reaches 0.0001 at exactly half of it, so the floor is only ever below 0.00005.
    expect(formatAmount('0.00005')).toBe('0.0001');
  });

  it('ESC-42: zero at any scale is still 0.00, and an amount below zero is rounded as before and never floored', () => {
    expect(formatAmount('0')).toBe('0.00');
    expect(formatAmount('0.0000')).toBe('0.00');
    expect(formatAmount('0.00000000')).toBe('0.00');
    expect(formatAmount('-0.000001')).toBe('0.0000');
    expect(formatAmount('-0.0012')).toBe('-0.0012');
  });

  it('multiplies a price by a whole token count exactly, at the price\'s own scale', () => {
    expect(multiplyAmount('0.000003', 1234)).toBe('0.003702');
    expect(multiplyAmount('0.0000025', 0)).toBe('0.0000000');
    expect(multiplyAmount('15', 3)).toBe('45');
    // The product a double gets wrong.
    expect(0.1 * 3).not.toBe(0.3);
    expect(multiplyAmount('0.1', 3)).toBe('0.3');
    expect(multiplyAmount('0.0000003', 1_000_000)).toBe('0.3000000');
    expect(multiplyAmount('not a price', 10)).toBeNull();
    expect(() => multiplyAmount('0.1', 1.5)).toThrow(RangeError);
    expect(() => multiplyAmount('0.1', -1)).toThrow(RangeError);
  });

  it('reads a number\'s text as the decimal it states, exponent forms included, and keeps its scale', () => {
    for (const spelling of ['0.000003', '3e-6', '3E-6', '.000003', '+0.000003', '0.3e-5']) expect(amountFromText(spelling)).toBe('0.000003');
    expect(amountFromText('2.5e-7')).toBe('0.00000025');
    // The digits written are the scale kept: `30e-7` states one place more than `3e-6`.
    expect(amountFromText('30e-7')).toBe('0.0000030');
    expect(amountFromText('1.5E+2')).toBe('150');
    expect(amountFromText('0.50')).toBe('0.50');
    expect(amountFromText('007.5')).toBe('7.5');
    expect(amountFromText('5.')).toBe('5');
    expect(amountFromText('-0.1')).toBe('-0.1');
    expect(amountFromText(' 0.1 ')).toBe('0.1');
    for (const notDecimal of ['', '.', 'e5', '0x1F', '0o17', '.inf', '.nan', '1e', '1.2.3', 'free', '1e999']) expect(amountFromText(notDecimal)).toBeNull();
  });
});
