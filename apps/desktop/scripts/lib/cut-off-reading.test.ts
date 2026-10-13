/**
 * The live `cutoff` scenario's readings (fin42, N50): the tag's line mirrored from the product, OQ-217's facts head and
 * summary opening, the D9 relay, and an offer taken by a later root.
 */
import { describe, expect, it } from 'vitest';
import { timeoutLine as productLine } from '@rotaris/ui';
import { OUTCOME_HEAD as productHead } from '@rotaris/engine';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { OUTCOME_HEAD, TAG_EVAL, cutOffChildren, firstSentence, offerTaken, runFailedRelays, tagReading, timeoutLine } from './cut-off-reading.mjs';

const report = (o: Record<string, unknown>) => JSON.stringify({ errors: [{ type: 'timeout', message: 'Child timed out after 60s' }], ...o });

describe('cut-off reading (live-run `cutoff`, PD-CONFIG-003 revisions 3 and 4, OQ-217, PD-ORCH-004)', () => {
  it('the line it expects is the product\'s, in the minutes and the seconds forms, and so is the facts head', () => {
    for (const [seconds, progress] of [[60, true], [120, false], [2700, true], [3, true], [1, false]] as const) {
      expect(timeoutLine(seconds, progress)).toBe(productLine({ limitSeconds: seconds, makingProgress: progress }));
    }
    expect(timeoutLine(60, true)).toBe('Cut off at its per-agent timeout of 1 minute while making progress. Settings › Runtime › Per-agent timeout sets this limit for runs started from now.');
    expect(OUTCOME_HEAD).toBe(productHead);
  });

  it('reads each child its limit cut off: progress, offer, the facts head, and the summary\'s opening', () => {
    const body = `{"messages":[{"role":"user","content":"… names the agent (alpha) …\\n\\nFacts:\\n${OUTCOME_HEAD} failed — Child timed out after 60s. Cut off while making progress …"}]}`;
    const children = [
      { canonical_name: 'alpha', task_id: 'bg_0000000a', state: 'failed', report: report({ summary: 'This agent was stopped at its time limit while writing docs/walkthrough.md. It had read three files.', cut_off: { statement: 'Cut off while making progress: …', continuation_offer: 'Continuation offer: … continuation_of: "bg_0000000a" …' } }) },
      { canonical_name: 'beta', task_id: 'bg_0000000b', state: 'failed', report: report({ summary: 'The run failed because the child timed out after 60s.', cut_off: { statement: 'Cut off while making progress: …', continuation_offer: null } }) },
      { canonical_name: 'gamma', task_id: 'bg_0000000c', state: 'succeeded', report: JSON.stringify({ errors: [], summary: 'Done.' }) },
      { canonical_name: 'delta', task_id: 'bg_0000000d', state: 'failed', report: JSON.stringify({ errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }], summary: 'x' }) },
    ];
    const cut = cutOffChildren(children, 60, [body]);
    expect(cut.map((c: { name: string }) => c.name)).toEqual(['alpha', 'beta']);
    expect(cut[0]).toMatchObject({ makingProgress: true, statesLimit: true, opensAsRunFailed: false, factsHead: true, opening: 'This agent was stopped at its time limit while writing docs/walkthrough.md.' });
    expect(typeof cut[0].offer).toBe('string');
    expect(cut[1]).toMatchObject({ offer: null, opensAsRunFailed: true, factsHead: false });
  });

  it('a first sentence ends at its full stop, not inside a file name or a figure', () => {
    expect(firstSentence('alpha was stopped at its 1.5 minute limit while editing src/a.js. Then more.')).toBe('alpha was stopped at its 1.5 minute limit while editing src/a.js.');
    expect(firstSentence('no stop at all')).toBe('no stop at all');
  });

  it('D9: a child_result entry relaying "The run failed" is found; one stating the agent\'s outcome is not', () => {
    const timeline = [
      { name: 'child_result', message: 'Child alpha reported failed: The run failed because the child timed out after 60s' },
      { name: 'child_result', message: 'Child beta reported failed: This agent was stopped at its time limit while …' },
      { name: 'iteration_end', message: 'The run failed' },
    ];
    expect(runFailedRelays(timeline).map((e: { message: string }) => e.message)).toEqual(['Child alpha reported failed: The run failed because the child timed out after 60s']);
  });

  it('an offer counts as taken by a later root only when a root other than the cut-off child\'s parent delegated it', () => {
    const children = [
      { canonical_name: 'alpha', task_id: 'bg_0000000a', state: 'failed', parent_id: 'bg_root0001', continuation_of: null },
      { canonical_name: 'alpha-2', task_id: 'bg_0000000e', state: 'succeeded', parent_id: 'bg_root0002', continuation_of: 'bg_0000000a' },
    ];
    expect(offerTaken(children, 'bg_0000000a', ['bg_root0001', 'bg_root0002'])).toMatchObject({ taken: true, byLaterRoot: true, continuation: { name: 'alpha-2', parent: 'bg_root0002' } });
    expect(offerTaken([{ ...children[0] }, { ...children[1], parent_id: 'bg_root0001' }], 'bg_0000000a', ['bg_root0001'])).toMatchObject({ taken: true, byLaterRoot: false });
    expect(offerTaken([children[0]], 'bg_0000000a', ['bg_root0001'])).toEqual({ taken: false, continuation: null, byLaterRoot: false });
  });

  it('reads the tag evaluation\'s answer from the capture log, past another evaluation\'s', () => {
    const line = timeoutLine(60, true);
    const log = [
      `[main] info    capture: eval-at 400000 (() => {…})() → {"kind":"other","x":1}`,
      `[main] info    capture: eval-at 400000 ${TAG_EVAL.slice(0, 40)} → ${JSON.stringify({ kind: 'cutoff-tag', text: 'timed out', title: line, description: line })}`,
    ].join('\n');
    expect(tagReading(log)).toEqual({ kind: 'cutoff-tag', text: 'timed out', title: line, description: line });
    expect(tagReading('capture: nothing here')).toBeNull();
  });
});
