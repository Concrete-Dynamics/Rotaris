/**
 * The live run's `duress` readings (live-run findings H-a, H-b, H-d, H-h; R-067), each pinned against the shape the
 * first execution recorded — pack `.live-run/runs/2026-09-29T03-06-14-929Z`, session `379f1490`. Each case names what
 * the unrepaired check answered there, so the case fails on the old reading.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the readers are plain ESM beside the script that runs them.
import { PRODUCT_SHARE_BOUND, PROGRESSING_TAIL_MS, attributeWait, childrenThatRanCommands, compressionNote, compressionTrigger, deadlineReading, saysSomething, silentFailedChildren, trafficCall, usageOf } from './duress-checks.mjs';

type Report = Record<string, unknown>;
const reportOf = (c: { report: Report | null }) => c.report ?? {};

describe('a failed child with something to say is not silent (H-a; REQ-ORCH-110, PD-ORCH-004)', () => {
  /** Child `d` as the store held it: cut off at its 1,200 s ceiling, `final_response` empty as REQ-ORCH-110 requires. */
  const cutOff = {
    given_name: 'd: reconcile docs/api.md against docs/overview.md', state: 'failed',
    report: {
      status: 'failed', final_response: '', last_response: '\n\nOne accuracy point shared by both: the …',
      cut_off: { changed_paths: ['docs/api.md', 'docs/overview.md'], continuation_offer: 'Continue …' },
      errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }],
    },
  };

  it('REQ-ORCH-110: the cut-off child of 2026-09-29 is not counted silent — the old `final_response === \'\'` test counted it', () => {
    expect(String(cutOff.report.final_response) === '').toBe(true); // what the unrepaired check read
    expect(silentFailedChildren([cutOff], reportOf)).toEqual([]);
  });

  it.each([
    ['its last response alone', { final_response: '', last_response: 'I read three files.' }],
    ['a cut_off block alone (PD-ORCH-004)', { final_response: '', cut_off: { changed_paths: [] } }],
    ['an error entry alone', { final_response: '', errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }] }],
    ['its final response', { final_response: 'Done.' }],
  ])('REQ-ORCH-110: a failed child speaks through %s', (_name, report) => {
    expect(saysSomething(report)).toBe(true);
  });

  it('REQ-ORCH-110: a failed child whose report carries no words, no cut-off and no error is silent — the eighty-second defect\'s observable', () => {
    const mute = { given_name: 'x', state: 'failed', report: { status: 'failed', summary: 'Used read_file.', final_response: '', last_response: '  ', errors: [] } };
    const none = { given_name: 'y', state: 'failed', report: null };
    const fine = { given_name: 'z', state: 'succeeded', report: {} };
    expect(silentFailedChildren([mute, none, fine], reportOf).map((c: { given_name: string }) => c.given_name)).toEqual(['x', 'y']);
  });
});

describe('a child\'s terminal calls are found under its canonical name (H-b)', () => {
  const b = { canonical_name: 'b--add-test-extra.test.js-and-get-node---test-green', given_name: 'b: add test/extra.test.js and get node --test green', tool_calls: 24 };
  const a = { canonical_name: 'a--document-exported-functions-in-docs-api.md', given_name: 'a: document exported functions in docs/api.md', tool_calls: 18 };
  const calls = [
    { agent_name: b.canonical_name, tool_name: 'terminal' },
    { agent_name: a.canonical_name, tool_name: 'read_file' },
    { agent_name: 'orchestrator', tool_name: 'terminal' },
  ];

  it('finds `b`, which ran 12 commands on 2026-09-29 — matching on the given name found no child at all', () => {
    expect(calls.some((call) => call.agent_name === b.given_name)).toBe(false); // what the unrepaired check compared
    expect(childrenThatRanCommands([a, b], calls)).toEqual([b]);
  });

  it('leaves out a child that made no tool call', () => {
    expect(childrenThatRanCommands([{ ...b, tool_calls: 0 }], calls)).toEqual([]);
  });
});

describe('a run that never compressed says how large its prompts grew against the trigger (H-d; REQ-CONFIG-134, REQ-CONFIG-132)', () => {
  it('REQ-CONFIG-134: the trigger is the smaller of the advertised window and default_threshold, times threshold_percentage', () => {
    expect(compressionTrigger({ contextTokens: 262_144 })).toEqual({ capacity: 262_144, thresholdPercentage: 60, tokens: 157_286, advertised: 262_144 });
    expect(compressionTrigger({ contextTokens: 1_000_000 }).capacity).toBe(265_000);
    expect(compressionTrigger({ contextTokens: null }).tokens).toBe(159_000);
    expect(compressionTrigger({ contextTokens: 100_000, thresholdPercentage: 80 }).tokens).toBe(80_000);
    expect(compressionTrigger({ contextTokens: null, defaultThreshold: 0 }).capacity).toBe(265_000);
  });

  it('names the 2026-09-29 run\'s largest prompt against the window and the trigger, and no iteration count', () => {
    const note = compressionNote({ largestPrompt: 64_038, trigger: compressionTrigger({ contextTokens: 262_144 }) });
    expect(note).toContain('64,038 tokens, 24 % of the model\'s 262,144-token window');
    expect(note).toContain('below the 60 % compression trigger, 157,286 tokens');
    expect(note).not.toMatch(/iteration/);
    expect(note).not.toContain('(s)');
  });

  it('says so when a prompt reached the trigger and nothing compressed, and when no prompt size was recorded', () => {
    expect(compressionNote({ largestPrompt: 200_000, trigger: compressionTrigger({ contextTokens: 262_144 }) })).toContain('at or above the 60 % compression trigger');
    expect(compressionNote({ largestPrompt: null, trigger: compressionTrigger({}) })).toContain('traffic not recorded');
  });

  it('reads a streamed call\'s usage chunk from the recorded body', () => {
    const record = {
      at: '2026-09-29T03:06:36.923Z', ms: 1986, outcome: 'complete',
      responseBody: 'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":9012,"total_tokens":9124,"completion_tokens":112,"completion_tokens_details":{"reasoning_tokens":62}}}\n\ndata: [DONE]',
    };
    expect(usageOf(record)).toEqual({ promptTokens: 9012, completionTokens: 112, reasoningTokens: 62 });
    expect(trafficCall(record)).toMatchObject({ start: Date.parse(record.at), end: Date.parse(record.at) + 1986, promptTokens: 9012 });
    expect(usageOf({ responseBody: '' })).toEqual({ promptTokens: null, completionTokens: null, reasoningTokens: null });
  });
});

describe('an overrun says where the time went (H-h)', () => {
  const t = (s: number) => 1_000_000 + s * 1000;

  it('divides every instant of the wait into endpoint, tools, launch and product, endpoint first', () => {
    const a = attributeWait({
      startedAt: t(0), endedAt: t(100),
      requests: [{ start: t(5), end: t(40) }, { start: t(30), end: t(60) }], // overlapping: parallel children
      tools: [{ start: t(55), end: t(70) }, { start: t(80), end: t(85) }],
    });
    expect(a).toEqual({ waitMs: 100_000, endpointMs: 55_000, toolsMs: 15_000, launchMs: 5_000, productMs: 25_000, quietTailMs: 15_000, requests: 2 });
    expect(a.endpointMs + a.toolsMs + a.launchMs + a.productMs).toBe(a.waitMs);
  });

  it('clips intervals to the launch and ignores a record with no interval', () => {
    const a = attributeWait({ startedAt: t(10), endedAt: t(20), requests: [{ start: t(0), end: t(15) }, { start: Number.NaN, end: t(18) }], tools: [] });
    expect(a).toMatchObject({ endpointMs: 5_000, launchMs: 0, productMs: 5_000, requests: 1 });
  });

  /** The 2026-09-29 run in figures: 2,405.7 s, a request open for all but a few seconds of it, one ending 2.8 s before the quit. */
  const firstExecution = attributeWait({
    startedAt: t(0), endedAt: t(2405.7),
    requests: [{ start: t(4.7), end: t(1200) }, { start: t(1199), end: t(2402.9) }],
    tools: [{ start: t(1200), end: t(1201) }],
  });

  it('an overrun of a progressing run the endpoint held is the window\'s bound — the first execution\'s FAIL gave only "2406 s of 2400 s"', () => {
    const r = deadlineReading({ timedOut: true, attribution: firstExecution, budgetMs: 2_400_000, traffic: true, usage: { completionTokens: 225_207, reasoningTokens: 132_973 } });
    expect(r.outcome).toBe('window');
    expect(r.detail).toMatch(/^2,406 s of 2,400 s: endpoint generating 2,398 s \(100 %; 2 requests, 225,207 output tokens of which 132,973 reasoning\)/);
    expect(r.detail).toContain('launch 5 s');
    expect(r.detail).toContain('LIVE_RUN_DURESS_MS');
  });

  it('an overrun in which the product held more than a tenth of the wait with nothing in flight is the product\'s', () => {
    const a = attributeWait({ startedAt: t(0), endedAt: t(1000), requests: [{ start: t(1), end: t(500) }, { start: t(700), end: t(995) }], tools: [] });
    expect(a.productMs / a.waitMs).toBeGreaterThan(PRODUCT_SHARE_BOUND);
    const r = deadlineReading({ timedOut: true, attribution: a, budgetMs: 1_000_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(r.outcome).toBe('product');
    expect(r.detail).toContain('the product with nothing in flight 205 s (21 %)');
  });

  it('an overrun of a run that had stopped moving is the product\'s, however the rest divides', () => {
    const a = attributeWait({ startedAt: t(0), endedAt: t(1000), requests: [{ start: t(1), end: t(1000 - PROGRESSING_TAIL_MS / 1000 - 30) }], tools: [] });
    const r = deadlineReading({ timedOut: true, attribution: a, budgetMs: 1_000_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(r.outcome).toBe('product');
    expect(r.detail).toContain('nothing had been in flight for 150 s');
  });

  it('without recorded traffic an overrun stays a failure and says it cannot be attributed; a run inside the wait passes with its figures', () => {
    expect(deadlineReading({ timedOut: true, attribution: firstExecution, budgetMs: 2_400_000, traffic: false }).outcome).toBe('product');
    const inside = deadlineReading({ timedOut: false, attribution: firstExecution, budgetMs: 3_000_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(inside.outcome).toBe('inside');
    expect(inside.detail).toContain('endpoint generating');
  });
});
