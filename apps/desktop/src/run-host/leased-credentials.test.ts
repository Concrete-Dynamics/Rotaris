import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { KEEP_FRESH_INTERVAL_MS, LeasedCredentials, type LeaseAnswer } from './leased-credentials.js';

describe('what main last leased (ADR-0030; REQ-PROVIDER-068, 070, 076)', () => {
  it('lays a renewed bearer over a run\'s own lease, and never grants a provider the run was not leased', () => {
    const leased = new LeasedCredentials();
    const run = { codex: 'at-1' };
    expect(leased.overlay(run)).toBe(run);
    leased.absorb(['codex', 'copilot'], { bearers: { codex: 'at-1', copilot: 'b-1' }, headers: { codex: { originator: 'x' } }, renewable: ['codex', 'copilot'] });
    expect(leased.overlay(run)).toBe(run);
    leased.absorb(['codex'], { bearers: { codex: 'at-2' }, headers: { codex: { originator: 'x' } }, renewable: ['codex'] });
    expect(leased.overlay(run)).toEqual({ codex: 'at-2' });
    expect(leased.headersFor('codex')).toEqual({ originator: 'x' });
    expect(leased.headersFor('copilot')).toBeUndefined();
    // An answer that no longer resolves a provider forgets it; a lease that got no answer changes nothing.
    leased.absorb(['codex'], null);
    expect(leased.overlay(run)).toEqual({ codex: 'at-2' });
    leased.absorb(['codex'], { bearers: {} });
    expect(leased.overlay(run)).toBe(run);
    expect(leased.headersFor('codex')).toBeUndefined();
  });

  it('asks again every 60 seconds while a run lasts, only for credentials with an expiry, and never after', async () => {
    const clock = new FakeClock();
    const leased = new LeasedCredentials();
    const asked: string[][] = [];
    const warnings: string[] = [];
    let live = false;
    let answer: LeaseAnswer | null = { bearers: { codex: 'at-2' }, renewable: ['codex'] };
    leased.keepFresh(clock, () => live, async (ids) => { asked.push([...ids]); if (answer === null) throw new Error('main is away'); return answer; }, (m) => warnings.push(m));
    const tick = async (): Promise<void> => { clock.advance(KEEP_FRESH_INTERVAL_MS); await new Promise((r) => setImmediate(r)); };
    live = true;
    await tick();
    expect(asked).toEqual([]); // nothing leased carries an expiry yet
    leased.absorb(['codex', 'deepseek'], { bearers: { codex: 'at-1', deepseek: 'key' }, renewable: ['codex'] });
    await tick();
    expect(asked).toEqual([['codex']]);
    expect(leased.overlay({ codex: 'at-1', deepseek: 'key' })).toEqual({ codex: 'at-2', deepseek: 'key' });
    answer = null;
    await tick();
    expect(warnings).toHaveLength(1);
    answer = { bearers: { codex: 'at-3' }, renewable: ['codex'] };
    await tick();
    expect(leased.overlay({ codex: 'at-1' })).toEqual({ codex: 'at-3' });
    live = false;
    const before = asked.length;
    await tick();
    expect(asked).toHaveLength(before);
    leased.stop();
    expect(clock.pendingCount()).toBe(0);
  });
});
