import { describe, expect, it } from 'vitest';
import { parseStrategyChosen, strategyChosenBody } from './config.js';

describe('PD-ORCH-020 clause 6: the strategy-choice row, written once and read once', () => {
  it('writes the sentence the run has always written', () => {
    expect(strategyChosenBody({ strategy: 'lead', reason: 'a bug to find and fix', fallback: false })).toBe('Strategy chosen: lead (a bug to find and fix)');
    expect(strategyChosenBody({ strategy: 'lead', reason: 'the call timed out after 12 s', fallback: true })).toBe('Strategy chosen: lead (not chosen: the call timed out after 12 s)');
    expect(strategyChosenBody({ strategy: 'orchestrator', reason: 'x', fallback: false, kept: true })).toBe('Strategy chosen: orchestrator (kept from the previous run)');
    expect(strategyChosenBody({ strategy: 'single', reason: '', fallback: false })).toBe('Strategy chosen: single');
  });

  it('reads back the strategy and the reason at their offsets, a reason with brackets of its own included', () => {
    const body = strategyChosenBody({ strategy: 'orchestrator', reason: 'a whole project (three packages)', fallback: false });
    const parsed = parseStrategyChosen(body);
    expect(parsed?.strategy.text).toBe('orchestrator');
    expect(parsed?.reason?.text).toBe('a whole project (three packages)');
    expect(body.slice(parsed!.reason!.start, parsed!.reason!.start + parsed!.reason!.text.length)).toBe(parsed!.reason!.text);
    expect(parseStrategyChosen('Strategy chosen: single')?.reason).toBeNull();
  });

  it('refuses any other text', () => {
    expect(parseStrategyChosen('Strategy chosen: swarm (never chosen)')).toBeNull();
    expect(parseStrategyChosen('Strategy chosen: lead and more')).toBeNull();
    expect(parseStrategyChosen('Context compressed')).toBeNull();
  });
});
