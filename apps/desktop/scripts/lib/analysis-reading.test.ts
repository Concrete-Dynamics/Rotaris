/**
 * The live run's reading of the improvement passes it lets finish (fin42, N58): the capture's wait, each pass's outcome
 * against the notice it owes, and the retrospective's instruction-file line.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { INDICATOR, passOutcome, postRunVerdict, retrospectiveInstructionFiles, runsStarted, settledAfterMs, settledWait, unauthorizedRequests } from './analysis-reading.mjs';

describe('analysis reading (live-run `ask`, REQ-LIBRARY-123..127, PD-LIBRARY-002)', () => {
  it('the wait holds only once the named pass was seen and no indicator stands', () => {
    const wait = settledWait('post_run');
    expect(wait.startsWith('js:')).toBe(true);
    // The expression evaluated the way the capture does, over a stand-in document and window.
    let shown: { pass: string } | null = null;
    const win: Record<string, unknown> = {};
    const document = { querySelector: (s: string) => (s === INDICATOR && shown !== null ? { getAttribute: () => shown!.pass } : null) };
    const run = () => Boolean(new Function('document', 'window', `return ${wait.slice(3)};`)(document, win));
    expect(run()).toBe(false); // nothing seen yet
    shown = { pass: 'retrospective' };
    expect(run()).toBe(false); // another pass is not this one
    shown = null;
    expect(run()).toBe(false);
    shown = { pass: 'post_run' };
    expect(run()).toBe(false); // seen, still running
    shown = null;
    expect(run()).toBe(true);
    expect(() => settledWait('other')).toThrow();
  });

  it('reads how long the wait took, and null when it ran out', () => {
    expect(settledAfterMs(`[main] info    capture: wait for js:(() => { … })() satisfied after 81234 ms`)).toBe(81234);
    expect(settledAfterMs(`[main] info    capture: wait for js:(() => { … })() timed out after 780000 ms`)).toBeNull();
  });

  it('an outcome is matched to the notice it owes: proposals, a timeout with its limit, an empty pass, none', () => {
    expect(passOutcome({ proposals: [{}, {}], notes: null }, [{ text: 'iSuccess2 improvement proposals readyDetailsCollected in impart_x.' }])).toMatchObject({ outcome: 'proposals', proposals: 2, noticeMatches: true });
    expect(passOutcome({ proposals: [{}], notes: null }, [{ text: '1 retrospective proposal ready' }], { retrospective: true })).toMatchObject({ outcome: 'proposals', noticeMatches: true });
    const timedOut = passOutcome({ proposals: [], notes: 'collector timed out after 300 seconds' }, [{ text: 'Improvement analysis complete — no proposalsDetailsThe review of this run reached its 300-second limit before it proposed anything. Settings › Runtime › Improvement analysis timeout allows it longer.' }]);
    expect(timedOut).toMatchObject({ outcome: 'timed-out', limitS: 300, noticeMatches: true });
    expect(passOutcome({ proposals: [], notes: 'collector timed out after 300 seconds' }, [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }])).toMatchObject({ outcome: 'timed-out', noticeMatches: false });
    expect(passOutcome({ proposals: [], notes: 'Suppressed duplicate proposals already covered by: impart_a.' }, [{ text: 'The retrospective found nothing to proposeDetailsNothing was proposed in impart_b.' }], { retrospective: true })).toMatchObject({ outcome: 'empty', noticeMatches: true });
    expect(passOutcome(null, [])).toEqual({ outcome: 'none', proposals: 0, notes: null, noticeMatches: null });
  });

  it('the live `ask` verdict: proposals or a timeout pass, an analyst that proposed nothing is a NOTE, no artifact or two fail', () => {
    const notice = [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }];
    expect(postRunVerdict(1, passOutcome({ proposals: [{}], notes: null }, []))).toBe('pass');
    expect(postRunVerdict(1, passOutcome({ proposals: [], notes: 'collector timed out after 300 seconds' }, []))).toBe('pass');
    // REQ-LIBRARY-124's no-proposals outcome, notes null: the model found nothing over a one-file run, not a product failure.
    const empty = passOutcome({ proposals: [], notes: null }, notice);
    expect(empty).toMatchObject({ outcome: 'empty', noticeMatches: true });
    expect(postRunVerdict(1, empty)).toBe('note');
    expect(postRunVerdict(0, passOutcome(null, []))).toBe('fail');
    expect(postRunVerdict(2, passOutcome({ proposals: [{}], notes: null }, []))).toBe('fail');
  });

  it('the retrospective\'s instruction files: the root\'s alone, a file from another base, and none at all', () => {
    expect(retrospectiveInstructionFiles('run host: retrospective: 1 of 3 enabled instruction file(s) at the workspace root (workspace:AGENTS.md) for /w')).toEqual({ handed: 1, enabled: 3, ids: ['workspace:AGENTS.md'], rootOnly: true });
    expect(retrospectiveInstructionFiles('run host: retrospective: 2 of 2 enabled instruction file(s) at the workspace root (workspace:AGENTS.md, user-agents:AGENTS.md) for /w')?.rootOnly).toBe(false);
    expect(retrospectiveInstructionFiles('run host: retrospective: 0 of 1 enabled instruction file(s) at the workspace root for /w')).toEqual({ handed: 0, enabled: 1, ids: [], rootOnly: true });
    expect(retrospectiveInstructionFiles('no such line')).toBeNull();
  });

  /*
   * The live run at ce5f952 (F4): ask-retrospective PASSed "one retrospective artifact …" and "the notice on screen is the one the
   * retrospective's outcome owes" over an artifact whose notes read "collector crashed: Unauthorized" and the notice "The
   * retrospective found nothing to propose". A crashed collector is no outcome a pass owes: it never reached the model.
   */
  it('a crashed collector is its own outcome: no notice matches it, and the post-run verdict fails on it', () => {
    const crashed = passOutcome({ proposals: [], notes: 'collector crashed: Unauthorized' }, [{ text: 'iThe retrospective found nothing to proposeDetailsNothing was proposed in impart_dL3YK5Xd.CopyDismiss' }], { retrospective: true });
    expect(crashed).toMatchObject({ outcome: 'crashed', crashed: true, noticeMatches: false });
    expect(postRunVerdict(1, passOutcome({ proposals: [], notes: 'collector crashed: Unauthorized' }, [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }]))).toBe('fail');
    // Not a crash: the timed-out, the suppressed-duplicates and the null notes keep their outcomes.
    expect(passOutcome({ proposals: [], notes: 'Suppressed duplicate proposals already covered by: impart_a.' }, [], { retrospective: true }).outcome).toBe('empty');
  });

  it('reads the run host\'s unauthenticated model requests and the runs a launch started (F2\'s shape: no run before the retrospective)', () => {
    const log = [
      '[main 2026-10-13T23:10:22.440Z] info    run host: credentials: leased for openai-compatible--katalyst (workspace /w)',
      '[main 2026-10-13T23:10:22.488Z] info    run host: model request POST http://127.0.0.1:36079/chat/completions (no authorization header)',
    ].join('\n');
    expect(unauthorizedRequests(log)).toBe(1);
    expect(unauthorizedRequests('run host: model request POST http://127.0.0.1:1/chat/completions')).toBe(0);
    expect(runsStarted(log)).toBe(0);
    expect(runsStarted('[main] info    run host: session 0791fa1e-70df-4a20-95c4-906ceb8aa71b started; row 0 recorded; the run is executing')).toBe(1);
  });
});

describe('live-run\'s ask scenario puts the analyst timeout back whatever happens', () => {
  it('restores the workspace file in a finally, as cutoff restores its limit', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const ask = text.slice(text.indexOf("if (wanted.includes('ask')) {"), text.indexOf('// ── 3. One real run'));
    expect(ask).toMatch(/const agentsBeforeAsk = readFileSync\(agentsFile, 'utf8'\);[\s\S]*?\n  try \{\n/);
    expect(ask).toMatch(/\n  \} finally \{\n    writeFileSync\(agentsFile, agentsBeforeAsk\);\n  \}\n/);
  });
});
