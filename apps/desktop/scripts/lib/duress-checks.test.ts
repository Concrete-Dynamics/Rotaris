/**
 * The live run's `duress` readings (live-run findings H-a, H-b, H-d, H-h; R-067), each pinned against the shape the
 * first execution recorded — pack `.live-run/runs/2026-09-29T03-06-14-929Z`, session `379f1490`. Each case names what
 * the unrepaired check answered there, so the case fails on the old reading.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — the readers are plain ESM beside the script that runs them.
import { PRODUCT_SHARE_BOUND, PROGRESSING_TAIL_MS, attributeWait, childrenThatRanCommands, toolIntervals, waitsOnChildren, commandsReading, compressionNote, compressionTrigger, deadlineReading, overrunReading, saysSomething, silentFailedChildren, trafficCall, usageOf, waitRanOutAt } from './duress-checks.mjs';

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
    ['a cut_off block with its timeout error (PD-ORCH-004)', { final_response: '', cut_off: { changed_paths: ['a.md'] }, errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }] }],
    ['its final response', { final_response: 'Done.' }],
  ])('REQ-ORCH-110: a failed child speaks through %s', (_name, report) => {
    expect(saysSomething(report)).toBe(true);
  });

  it('REQ-ORCH-110: the eighty-second defect\'s shape — failed, an error naming the abort, no words, no cut_off — is silent; the first repair counted its error entry as something to say', () => {
    const aborted = {
      given_name: 'x', state: 'failed',
      report: { status: 'failed', summary: 'Used read_file, terminal.', final_response: '', last_response: '', errors: [{ type: 'model', message: 'The request was aborted.' }] },
    };
    expect(silentFailedChildren([aborted], reportOf).map((c: { given_name: string }) => c.given_name)).toEqual(['x']);
  });

  it.each([
    ['a timeout that was not making progress (REQ-ORCH-088\'s report, no cut_off)', [{ type: 'timeout', message: 'Child timed out after 1200s' }]],
    ['a raise (`child_exception`)', [{ type: 'child_exception', message: 'boom' }]],
    ['no activity (`incomplete_execution`)', [{ type: 'incomplete_execution', message: 'no_activity' }]],
  ])('REQ-ORCH-110: an error entry alone is nothing to say — %s', (_name, errors) => {
    expect(saysSomething({ status: 'failed', final_response: '', last_response: '', errors })).toBe(false);
  });

  it('REQ-ORCH-110: a failed child with no report, or an empty one, is silent; a succeeded child is not asked', () => {
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

  it('asks only a child with a report: `f`, paused at the 2026-09-30 deadline quit with no report, is unsettled, not mute', () => {
    const settled = { ...b, state: 'succeeded', report: { commands: [{ command: 'node --test', exit_code: 0 }] } };
    const silentOne = { ...b, canonical_name: 'g--x', state: 'succeeded', report: { commands: [] } };
    const f = { canonical_name: 'f--verify-the-whole-result--write-docs-verification.md', given_name: 'f: verify', state: 'paused', tool_calls: 40, report: null };
    const all = [...calls, { agent_name: 'g--x', tool_name: 'terminal' }, { agent_name: f.canonical_name, tool_name: 'terminal' }];
    const r = commandsReading([settled, silentOne, f], all, (c: { report: Report | null }) => c.report ?? {});
    expect(r.asked).toEqual([settled, silentOne]);
    expect(r.mute).toEqual([silentOne]);
    expect(r.unsettled).toEqual([f]);
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

  it('says which calls the largest prompt is the largest of, and whose count it is', () => {
    const note = compressionNote({ largestPrompt: 77_043, trigger: compressionTrigger({ contextTokens: 262_144 }), calls: { withUsage: 213, total: 218 } });
    expect(note).toContain('the largest prompt of the 213 calls that carried usage (5 did not) was 77,043 tokens');
    expect(note).toContain("the endpoint's `prompt_tokens`, not the product's own chars_per_token estimate (REQ-CONFIG-132)");
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

  it('reads the usage the recorder kept from the whole body before the body\'s own, which the cap may have cut (U6)', () => {
    const capped = { at: '2026-10-03T06:40:01.000Z', ms: 90_000, outcome: 'complete', usage: { prompt_tokens: 93_461, completion_tokens: 10_191, reasoning_tokens: 9_870 }, responseBody: `data: {"choices":[{"delta":{"content":"x"}}]}\n…[truncated: 1009144 bytes total]` };
    expect(usageOf(capped)).toEqual({ promptTokens: 93_461, completionTokens: 10_191, reasoningTokens: 9_870 });
    // A record the recorder wrote before 2026-10-03 has no `usage`: its body is read as before.
    expect(usageOf({ responseBody: '"usage":{"prompt_tokens":5,"completion_tokens":2}' })).toEqual({ promptTokens: 5, completionTokens: 2, reasoningTokens: null });
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
    expect(a).toEqual({ waitMs: 100_000, endpointMs: 55_000, toolsMs: 15_000, launchMs: 5_000, productMs: 25_000, quietTailMs: 15_000, requests: 2, openAtQuit: 0, longestOpenAtQuitMs: 0 });
    expect(a.endpointMs + a.toolsMs + a.launchMs + a.productMs).toBe(a.waitMs);
  });

  /*
   * Finding H7 of the duress live run at 27a5127: the coordinator's `wait_for_tasks` was open for nearly the whole run, so
   * every gap between its children's steps was filed as "tools" and the PASS line read "tools alone 18 s … the product with
   * nothing in flight 2 s" where the children's own tools took 12.1 s and the product 7.9 s. A wait on children runs no tool
   * of its own: an instant it alone holds is the children's, and they had nothing in flight.
   */
  it('H7 (27a5127): a parent\'s wait on its children is counted as what the children were doing, never as tools', () => {
    const calls = [
      // The coordinator waits from t(10) to t(90) while its child steps: a request, a terminal call, a request.
      { tool_name: 'wait_for_tasks', args: { task_ids: [] }, endedAt: t(90), elapsedMs: 80_000 },
      { tool_name: 'terminal', args: { command: 'node --test' }, endedAt: t(50), elapsedMs: 10_000 },
      // A foreground delegate waits on its child the same way; a background one returns at once and is a tool like any other.
      { tool_name: 'delegate', args: { persona: 'tester', task_name: 'x', task: 'y', run_in_background: false }, endedAt: t(95), elapsedMs: 3_000 },
      { tool_name: 'delegate', args: { persona: 'tester', task_name: 'x', task: 'y' }, endedAt: t(8), elapsedMs: 1_000 },
    ];
    expect(calls.map(waitsOnChildren)).toEqual([true, false, true, false]);
    const a = attributeWait({
      startedAt: t(0), endedAt: t(100),
      requests: [{ start: t(10), end: t(30) }, { start: t(60), end: t(80) }],
      tools: toolIntervals(calls),
    });
    // Tools: the terminal call (40 to 50) and the background delegate (7 to 8). Product: 30 to 40, 50 to 60, 80 to 100.
    expect(a).toMatchObject({ endpointMs: 40_000, toolsMs: 11_000, launchMs: 7_000, productMs: 42_000 });
    expect(a.endpointMs + a.toolsMs + a.launchMs + a.productMs).toBe(a.waitMs);
    // The line names the rule, so a reader comparing it with an earlier pack knows why "tools alone" shrank.
    const r = deadlineReading({ timedOut: false, attribution: a, budgetMs: 200_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(r.detail).toContain('tools alone 11 s (a wait on children counted as what the children were doing)');
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

  /** The quit at 2,402 s: the seam's wait ran out there, and the application exited at 2,406 s. */
  const quitAt = t(2402);

  it('a stream hung from early in the wait and cut off by the quit is not progress: the overrun is the product\'s, and the detail names the open request', () => {
    const hung = { requests: [{ start: t(10), end: t(299), outcome: 'complete' }, { start: t(300), end: t(2406), outcome: 'aborted' }], tools: [{ start: t(5), end: t(9) }] };
    // What the first repair read: the cut-off request's end — the quit — counted as the run's latest progress.
    const unguarded = attributeWait({ startedAt: t(0), endedAt: t(2406), requests: hung.requests.map(({ start, end }) => ({ start, end })), tools: hung.tools });
    expect(unguarded.quietTailMs).toBe(0);
    const a = attributeWait({ startedAt: t(0), endedAt: t(2406), quitAt, ...hung });
    expect(a).toMatchObject({ endpointMs: 2_395_000, quietTailMs: 2_107_000, openAtQuit: 1, longestOpenAtQuitMs: 2_106_000 });
    const r = deadlineReading({ timedOut: true, attribution: a, budgetMs: 2_400_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(r.outcome).toBe('product');
    expect(r.detail).toContain('nothing had ended on its own for 2,107 s when the launch ended; 1 request still open when the wait ran out, the longest open for 2,106 s, cut off by the quit');
  });

  it('the 2026-09-30 shape — the last completed request 30.6 s before the end, one cut off by the quit, two the product aborted mid-run — is still the window\'s bound, and names the one', () => {
    const a = attributeWait({
      startedAt: t(0), endedAt: t(2406), quitAt,
      requests: [
        { start: t(7), end: t(680), outcome: 'complete' }, { start: t(680), end: t(682), outcome: 'aborted' }, { start: t(682), end: t(2375.4), outcome: 'complete' },
        { start: t(2375.5), end: t(2406), outcome: 'aborted' },
      ],
      tools: [],
    });
    expect(a).toMatchObject({ quietTailMs: 30_600, openAtQuit: 1, longestOpenAtQuitMs: 30_500 });
    const r = deadlineReading({ timedOut: true, attribution: a, budgetMs: 2_400_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(r.outcome).toBe('window');
    expect(r.detail).toContain('the last request or tool call to end on its own ended 31 s before the launch did; 1 request still open when the wait ran out, the longest open for 31 s');
  });

  it('a request the endpoint completed counts wherever it ended; a tool call ended at the quit does not; a stall is never an end; without the instant, the quit\'s outcomes do not count', () => {
    const late = attributeWait({ startedAt: t(0), endedAt: t(2406), quitAt, requests: [{ start: t(5), end: t(2404), outcome: 'complete' }], tools: [{ start: t(2403), end: t(2405) }] });
    expect(late.quietTailMs).toBe(2_000);
    const toolAtQuit = attributeWait({ startedAt: t(0), endedAt: t(2406), quitAt, requests: [{ start: t(5), end: t(1000), outcome: 'complete' }], tools: [{ start: t(1000), end: t(2405) }] });
    expect(toolAtQuit.quietTailMs).toBe(1_406_000);
    const stalled = attributeWait({ startedAt: t(0), endedAt: t(2406), quitAt, requests: [{ start: t(5), end: t(100), outcome: 'complete' }, { start: t(100), end: t(2300), outcome: 'stalled' }], tools: [] });
    expect(stalled).toMatchObject({ quietTailMs: 2_306_000, openAtQuit: 0 });
    const noInstant = attributeWait({ startedAt: t(0), endedAt: t(2406), requests: [{ start: t(5), end: t(100), outcome: 'complete' }, { start: t(100), end: t(2406), outcome: 'in-flight at close' }], tools: [] });
    expect(noInstant).toMatchObject({ quietTailMs: 2_306_000, openAtQuit: 1 });
  });

  it('reads the instant the wait ran out from the seam\'s timed-out line, and nothing from a log without one', () => {
    const log = '[main 2026-09-30T06:10:09.517Z] info    capture: png-at 1440000\n[main 2026-09-30T06:10:09.600Z] info    capture: wait for result timed out after 2400000 ms\n';
    expect(waitRanOutAt(log)).toBe(Date.parse('2026-09-30T06:10:09.600Z'));
    expect(waitRanOutAt('[main 2026-09-30T06:10:09.600Z] info    capture: result')).toBeNull();
    expect(waitRanOutAt(undefined)).toBeNull();
  });

  it('without recorded traffic an overrun stays a failure and says it cannot be attributed; a run inside the wait passes with its figures', () => {
    expect(deadlineReading({ timedOut: true, attribution: firstExecution, budgetMs: 2_400_000, traffic: false }).outcome).toBe('product');
    const inside = deadlineReading({ timedOut: false, attribution: firstExecution, budgetMs: 3_000_000, traffic: true, usage: { completionTokens: 1, reasoningTokens: 0 } });
    expect(inside.outcome).toBe('inside');
    expect(inside.detail).toContain('endpoint generating');
  });
});

describe('a launch\'s overrun is read from its pack: the swarm launch takes the duress run\'s reading (acceptance finding L8)', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 14, 14, 15, 0) + s * 1000).toISOString();
  const ms = (s: number) => Date.parse(at(s));
  /** A record as `model-traffic.jsonl` holds it: its start, its duration and how it ended. */
  const record = (start: number, end: number, outcome: string, completionTokens = 100) => ({ at: at(start), ms: (end - start) * 1000, outcome, usage: { prompt_tokens: 1000, completion_tokens: completionTokens, reasoning_tokens: 10 } });
  const timedOutLog = (s: number) => `[main ${at(0)}] info    capture: prompt submitted\n[main ${at(s)}] info    capture: wait for result timed out after 840000 ms\n`;
  /** The b9e3005 shape: a coordinator that kept asking the endpoint and running tools the whole 840 s, and one request the quit cut. */
  const wandering = {
    log: timedOutLog(842), startedAt: ms(0), endedAt: ms(846), budgetMs: 840_000, recorded: true, raise: 'LIVE_RUN_EDIT_WAIT_MS',
    records: [...Array.from({ length: 40 }, (_, k) => record(5 + k * 20, 5 + k * 20 + 19, 'complete')), record(810, 846, 'aborted')],
    calls: [
      { tool_name: 'read_file', args: {}, endedAt: ms(24), elapsedMs: 1_000 },
      { tool_name: 'wait_for_tasks', args: { task_ids: [] }, endedAt: ms(700), elapsedMs: 400_000 },
      { tool_name: 'terminal', args: { command: 'node --test' }, endedAt: ms(805), elapsedMs: 2_000 },
    ],
  };

  it('a run the model kept working to the end of its wait is the window\'s bound, and names the variable that widens this launch\'s wait', () => {
    const r = overrunReading(wandering);
    expect(r.outcome).toBe('window');
    expect(r.detail).toMatch(/^846 s of 840 s: endpoint generating/);
    expect(r.detail).toContain('41 requests, 4,100 output tokens of which 410 reasoning');
    expect(r.detail).toContain('1 request still open when the wait ran out');
    expect(r.detail).toContain('raise LIVE_RUN_EDIT_WAIT_MS');
    expect(r.detail).not.toContain('LIVE_RUN_DURESS_MS');
    // The duress run's own reading still names its own variable.
    expect(overrunReading({ ...wandering, raise: undefined }).detail).toContain('raise LIVE_RUN_DURESS_MS');
  });

  it('a run that stopped moving long before its wait ran out is still the product\'s, and so is an overrun with nothing recorded', () => {
    const stopped = overrunReading({ ...wandering, records: [record(5, 300, 'complete'), record(300, 846, 'aborted')], calls: [] });
    expect(stopped.outcome).toBe('product');
    expect(stopped.detail).toContain('nothing had ended on its own for 546 s');
    expect(overrunReading({ ...wandering, recorded: false }).outcome).toBe('product');
    expect(overrunReading({ ...wandering, records: [] }).outcome).toBe('product');
  });

  it('a launch whose capture saw its result reached it inside the wait', () => {
    const r = overrunReading({ ...wandering, log: `[main ${at(500)}] info    capture: wait for result satisfied after 500000 ms\n`, endedAt: ms(504) });
    expect(r.outcome).toBe('inside');
  });

  it('a launch that ended with its wait neither satisfied nor run out reads `ended`, not inside (accept1-5)', () => {
    const r = overrunReading({ ...wandering, log: `[main ${at(0)}] info    capture: prompt submitted\n`, endedAt: ms(120) });
    expect(r.outcome).toBe('ended');
    expect(r.detail).toBe('the launch ended after 120 s of 840 s with its capture\'s wait neither satisfied nor run out — the application exited or crashed before the result');
  });

  it('a launch whose log holds no info line reads `unread`, never `ended`: its threshold dropped the capture\'s lines (--app-log-level=warning or error)', () => {
    // What the duress launch's log holds at `--app-log-level=warning`: main's warnings, and none of the capture's `info` lines.
    const warningsOnly = `[main ${at(1)}] warn    run host: mcp code-intelligence slow to start\n[main ${at(830)}] warn    workspace service: a slow scan\n`;
    for (const log of [warningsOnly, `[main ${at(830)}] error   run host: exited 1\n`, '']) {
      const r = overrunReading({ ...wandering, log, endedAt: ms(846) });
      expect(r.outcome).toBe('unread');
      expect(r.detail).toBe('the launch\'s application log holds no info line, so its threshold was above info (--app-log-level=warning or error) and the capture\'s wait lines were never recorded: the deadline cannot be read');
    }
    // A log at info or debug still reads as before, whichever line its capture wrote.
    expect(overrunReading({ ...wandering, log: `[main ${at(0)}] debug   capture: prompt typed\n[main ${at(0)}] info    capture: prompt submitted\n`, endedAt: ms(120) }).outcome).toBe('ended');
  });

  it('live-run.mjs reads the delegation-swarm launch\'s overrun through it, not through a bare timed-out check', () => {
    const script = readFileSync(join(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const swarm = script.slice(script.indexOf('// ── delegation-swarm:'), script.indexOf("results.scenarios['delegation-swarm']"));
    expect(swarm.length).toBeGreaterThan(0);
    expect(swarm).not.toMatch(/check\(!\/capture: wait for result timed out\/\.test\(swarmLog\)/);
    expect(swarm).toMatch(/overrunReading\(\{[^}]*log: swarmLog[^}]*raise: 'LIVE_RUN_EDIT_WAIT_MS'/s);
    expect(swarm).toContain("if (swarmDeadline.outcome === 'window') noted(");
  });
});
