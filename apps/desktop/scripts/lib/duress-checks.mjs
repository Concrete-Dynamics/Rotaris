/**
 * The readings behind the live run's `duress` checks (`apps/desktop/scripts/live-run.mjs`, scenario 9), pure so that
 * `duress-checks.test.ts` can pin each one against the shape the first execution recorded (pack
 * `.live-run/runs/2026-09-29T03-06-14-929Z`, session `379f1490`). Each of the five was wrong there in a way a green
 * could not show:
 *
 *   H-a  a child cut off mid-work was counted as "failed with nothing to say" because its `final_response` was empty —
 *        which REQ-ORCH-110 requires of every child whose last assistant message was followed by tool activity (and an
 *        error entry alone is still nothing to say: the product writes one on every failed child);
 *   H-b  a child's terminal calls were looked for under its given name, and `tool_calls.agent_name` holds the
 *        canonical one, so no child was ever found to have run a command;
 *   H-d  a run that never compressed was said to have run too few iterations, when the question is how large its
 *        prompts grew against the compression trigger (REQ-CONFIG-134);
 *   H-h  an overrun was reported as two figures, with nothing saying where the time went.
 *
 * (H-c, the null-summary line of a session that never stopped, is the autopsy reader's: `autopsy-coherence.mjs`.)
 *
 * Nothing here is product code. It runs only from the live run.
 */
import { usageIn } from './model-traffic.mjs';

/** A report field as text, whatever the store held (a missing field and `null` both read as ''). */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * What a child's report says for it, beyond its status. REQ-ORCH-110 puts the child's last words in `final_response`
 * only where no tool activity followed them, and in `last_response` otherwise; a child cut off at its ceiling while it
 * was making progress carries `cut_off` with its changed paths and the continuation offer (`PD-ORCH-004`). Its words and
 * that block are something to say.
 *
 * An error entry ALONE is not. The product writes one on every failed child — `timeout`, the caught error, `model` with
 * the report's error headline, `incomplete_execution` (`packages/engine/src/children/orchestration.ts`, the status
 * decision in `execute`) and `child_exception` (`settleRaised`) — so counting it would leave the check nothing to find.
 * The eighty-second defect's children were exactly that shape: failed, an error naming the abort, no words and no
 * `cut_off`. A cut-off child's timeout error is counted with its `cut_off` block, where PD-ORCH-004 puts it (the
 * verifier's finding against the first repair, 2026-09-30). The summary is not counted either: REQ-ORCH-110 makes one for
 * every report, from the tools used where there are no words, so it cannot tell a silent child from a speaking one.
 */
export function saysSomething(report) {
  const r = report !== null && typeof report === 'object' ? report : {};
  if (text(r.final_response) !== '' || text(r.last_response) !== '') return true;
  return r.cut_off !== null && typeof r.cut_off === 'object';
}

/**
 * The children that ended `failed` with nothing to say — the eighty-second defect's observable: a failed child whose
 * report carries an error and nothing else (H-a).
 */
export function silentFailedChildren(children, reportOf) {
  return children.filter((c) => c.state === 'failed' && !saysSomething(reportOf(c)));
}

/**
 * The children that made a tool call and ran at least one `terminal` command. A `tool_calls` row names its agent by
 * the CANONICAL name (`b--add-test-…`), the one the children record carries as `canonical_name`; the given name
 * (`b: add test/…`) is what a person reads and never appears on a call (H-b).
 */
export function childrenThatRanCommands(children, calls) {
  const ran = new Set(calls.filter((call) => call.tool_name === 'terminal').map((call) => call.agent_name));
  return children.filter((c) => Number(c.tool_calls) > 0 && ran.has(c.canonical_name));
}

/**
 * The commands question, asked only of a child that has a report to list them in. A child paused at the deadline quit
 * (PD-ORCH-005 clause 3) or still running has no report yet — its `report` column is NULL until it settles — so
 * "reported none" is not a reading of it. The second live execution (2026-09-30) failed the check on exactly such a
 * child, `f`, paused mid-verification with 26 terminal calls and no report; those are `unsettled`, a NOTE.
 */
export function commandsReading(children, calls, reportOf) {
  const ran = childrenThatRanCommands(children, calls);
  const unsettled = ran.filter((c) => c.report === null || c.report === undefined || c.report === '');
  const asked = ran.filter((c) => !unsettled.includes(c));
  const mute = asked.filter((c) => (reportOf(c).commands ?? []).length === 0);
  return { asked, mute, unsettled };
}

/**
 * The token counts one recorded call's streamed usage chunk carries; each is null where the record holds none. The usage
 * the recorder kept from the whole body (`record.usage`, since 2026-10-03) comes first, because the recorded body is cut at
 * its cap and a long response's usage chunk, which comes last, went with the cut (finding U6:
 * `docs/defects/fixed/the-traffic-recorders-body-cap-drops-a-responses-usage-and-two-duress-figures-disagree-with-the-store.md`);
 * an older record is read from its body as before.
 */
export function usageOf(record) {
  const u = record?.usage !== null && typeof record?.usage === 'object' ? record.usage : usageIn(typeof record?.responseBody === 'string' ? record.responseBody : '');
  const figure = (v) => (typeof v === 'number' ? v : null);
  return { promptTokens: figure(u?.prompt_tokens), completionTokens: figure(u?.completion_tokens), reasoningTokens: figure(u?.reasoning_tokens) };
}

/** One recorded call as the interval it held the endpoint for, and its usage. */
export function trafficCall(record) {
  const start = Date.parse(record?.at ?? '');
  const ms = Number(record?.ms);
  return { start, end: Number.isFinite(start) && Number.isFinite(ms) ? start + ms : Number.NaN, outcome: record?.outcome ?? null, ...usageOf(record) };
}

/**
 * The compression trigger REQ-CONFIG-134 resolves: `capacity × threshold_percentage / 100`, the capacity being the
 * smaller of the model's advertised `max_input_tokens` and `default_threshold`, or `default_threshold` alone where the
 * model advertises none. The defaults are REQ-CONFIG-132's (60 %, 265,000). A model's explicit
 * `context_compression_threshold` would take precedence; the live run never writes one.
 */
export function compressionTrigger({ contextTokens = null, thresholdPercentage = 60, defaultThreshold = 265_000 } = {}) {
  const fallback = defaultThreshold > 0 ? defaultThreshold : 265_000;
  const capacity = typeof contextTokens === 'number' && contextTokens > 0 ? Math.min(contextTokens, fallback) : fallback;
  return { capacity, thresholdPercentage, tokens: Math.floor((capacity * thresholdPercentage) / 100), advertised: typeof contextTokens === 'number' && contextTokens > 0 ? contextTokens : null };
}

const n = (value) => Math.round(value).toLocaleString('en-US');
const pct = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

/**
 * Why a long run recorded no compression, in words the pack can be checked against (H-d). The largest prompt any
 * agent sent is read from the recorded traffic, because compression answers to the size of what one agent is about to
 * send, not to how many iterations the run completed — the first execution's only iteration never ended, so the old
 * note blamed "0 iteration(s)" for a run whose largest prompt was 64,038 tokens against a trigger of 157,286.
 */
export function compressionNote({ largestPrompt, trigger, calls = null }) {
  const window = trigger.advertised === null ? `the ${n(trigger.capacity)}-token default capacity (the model advertises no input limit)` : `the model's ${n(trigger.advertised)}-token window`;
  const at = `the ${trigger.thresholdPercentage} % compression trigger, ${n(trigger.tokens)} tokens (REQ-CONFIG-134)`;
  if (largestPrompt === null) return `no recorded call carried its prompt size (traffic not recorded), so whether a prompt ever neared ${at} is unknown; the compressions aggregate is unasked`;
  // Which calls the figure is the largest of, and whose count it is: a call aborted carries no usage chunk (one over the
  // recorder's body cap keeps its usage on the record since 2026-10-03, finding U6, where it lost it with the cut before);
  // and the product tests the trigger against its own estimate at `chars_per_token` (REQ-CONFIG-132), not against the
  // endpoint's count.
  const of = calls === null ? 'any agent sent' : `of the ${n(calls.withUsage)} calls that carried usage (${n(calls.total - calls.withUsage)} did not)`;
  const whose = "the endpoint's `prompt_tokens`, not the product's own chars_per_token estimate (REQ-CONFIG-132)";
  if (largestPrompt < trigger.tokens) {
    return `the largest prompt ${of} was ${n(largestPrompt)} tokens, ${pct(largestPrompt, trigger.advertised ?? trigger.capacity)} % of ${window} and below ${at} — the run never grew that far, by ${whose}; the compressions aggregate is unasked`;
  }
  return `the largest prompt ${of} was ${n(largestPrompt)} tokens, at or above ${at} by ${whose}, and no compression was recorded — worth reading beside the session log; the compressions aggregate is unasked`;
}

/**
 * The instant the capture seam's wait for the result ran out, from its timed-out line in the launch's log
 * (`[main <ISO instant>] info    capture: wait for result timed out …`); null when the wait did not run out or the line
 * carries no instant. What ends after it was ended by the quit that follows, not by the run.
 */
export function waitRanOutAt(log) {
  const m = /\[\w+ (\d{4}-\d\d-\d\dT[\d:.]+Z)\][^\n]*capture: wait for result timed out/.exec(typeof log === 'string' ? log : '');
  const at = m === null ? Number.NaN : Date.parse(m[1]);
  return Number.isFinite(at) ? at : null;
}

/** The traffic outcomes the quit gives a call it cuts off (`lib/model-traffic.mjs`'s `settle`). */
const CUT_BY_THE_QUIT = new Set(['aborted', 'in-flight at close']);

/**
 * Whether an interval ENDED ON ITS OWN, so that its end says the run was still moving. A request the endpoint finished
 * (`complete`) did, whenever it ended. A stall's first record (`stalled`) marks the silence beginning, never an end.
 * Otherwise an interval that ended before the wait ran out did; one that ended at or after it was ended by the quit,
 * and its end says only when the application exited — a stream hung from early in the wait and cut at the quit would
 * otherwise read as the run's latest progress (the verifier's finding against the first repair, 2026-09-30). Where the
 * instant the wait ran out is unknown, a request the quit's outcomes name is not counted.
 */
function endedOnItsOwn(interval, quitAt) {
  if (interval.outcome === 'complete') return true;
  if (interval.outcome === 'stalled') return false;
  if (quitAt !== null) return interval.end < quitAt;
  return !CUT_BY_THE_QUIT.has(interval.outcome);
}

/**
 * Whether a tool call waits on the caller's children rather than running anything itself: `wait_for_tasks` always, and a
 * `delegate` with `run_in_background: false`, which waits on its child the same way (REQ-TOOLS-153). Takes a call as
 * `live-run.mjs`'s `readToolCalls` reads it (`tool_name`, `args`).
 */
export function waitsOnChildren(call) {
  if (call?.tool_name === 'wait_for_tasks') return true;
  return call?.tool_name === 'delegate' && call.args !== null && typeof call.args === 'object' && call.args.run_in_background === false;
}

/**
 * The tool intervals `attributeWait` sweeps, from the session's finished tool calls (each call's end and `elapsed_ms`).
 * A wait on children is left out: it runs no tool, and an instant it alone holds belongs to what the children were doing
 * then — their requests, their tools, or nothing. Until 2026-10-06 every call was an interval, so the coordinator's
 * `wait_for_tasks`, open for nearly the whole duress run at 27a5127, filed each gap between its children's steps as "tools"
 * (18 s tools and 2 s product printed, 12.1 s and 7.9 s once it is left out;
 * `docs/defects/fixed/the-duress-time-split-counts-a-parents-wait-on-its-children-as-tools.md`, finding H7).
 */
export function toolIntervals(calls) {
  return calls
    .filter((c) => c.endedAt !== null && c.elapsedMs !== null && !waitsOnChildren(c))
    .map((c) => ({ start: c.endedAt - c.elapsedMs, end: c.endedAt }));
}

/**
 * The wait divided by what was in flight (H-h). Every instant of the launch, from its spawn to its exit, lands in
 * exactly one bucket, in this order of precedence:
 *   endpoint  at least one model request was open at the endpoint (the recorded traffic: each record's `at` and `ms`);
 *   tools     no request was open and at least one tool call was running (the store: each call's end and `elapsed_ms`,
 *             through `toolIntervals`, which leaves a wait on children out — it runs no tool);
 *   launch    before the first request or tool call — the application starting and the run being set up;
 *   product   the rest: the product between steps with nothing in flight, and the quit after the wait.
 * The buckets are OCCUPANCY, not a critical path: a request open while the run's next step waits on something else is
 * still counted to the endpoint.
 * `quietTailMs` is how long before the launch ended the last request or tool call that ENDED ON ITS OWN did (see
 * `endedOnItsOwn`; `quitAt` is the instant the wait ran out, `waitRanOutAt`): small when the run was still progressing
 * when the wait ran out, large when it had stopped moving — even with a request open the whole time. The requests the
 * quit cut off are counted in `openAtQuit`, the longest of them in `longestOpenAtQuitMs`.
 */
export function attributeWait({ startedAt, endedAt, requests, tools, quitAt = null }) {
  const clip = (list) => list
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map((i) => ({ start: Math.max(i.start, startedAt), end: Math.min(i.end, endedAt), outcome: i.outcome ?? null }))
    .filter((i) => i.end > i.start);
  const req = clip(requests);
  const tool = clip(tools);
  const waitMs = Math.max(0, endedAt - startedAt);
  const cutAtQuit = req.filter((i) => !endedOnItsOwn(i, quitAt) && i.outcome !== 'stalled');
  const openAtQuit = cutAtQuit.length;
  const longestOpenAtQuitMs = cutAtQuit.reduce((m, i) => Math.max(m, i.end - i.start), 0);
  if (req.length === 0 && tool.length === 0) return { waitMs, endpointMs: 0, toolsMs: 0, launchMs: waitMs, productMs: 0, quietTailMs: waitMs, requests: 0, openAtQuit, longestOpenAtQuitMs };
  // One sweep over every boundary: between two consecutive boundaries nothing opens or closes.
  const points = [...new Set([startedAt, endedAt, ...req.flatMap((i) => [i.start, i.end]), ...tool.flatMap((i) => [i.start, i.end])])].sort((a, b) => a - b);
  const firstActivity = Math.min(...req.map((i) => i.start), ...tool.map((i) => i.start));
  const settled = [...req, ...tool].filter((i) => endedOnItsOwn(i, quitAt));
  const lastSettled = settled.length === 0 ? startedAt : Math.max(...settled.map((i) => i.end));
  let endpointMs = 0; let toolsMs = 0; let launchMs = 0; let productMs = 0;
  for (let k = 0; k + 1 < points.length; k += 1) {
    const a = points[k]; const b = points[k + 1]; const span = b - a;
    if (a < startedAt || b > endedAt) continue;
    const open = (list) => list.some((i) => i.start <= a && i.end >= b);
    if (open(req)) endpointMs += span;
    else if (open(tool)) toolsMs += span;
    else if (b <= firstActivity) launchMs += span;
    else productMs += span;
  }
  return { waitMs, endpointMs, toolsMs, launchMs, productMs, quietTailMs: Math.max(0, endedAt - lastSettled), requests: req.length, openAtQuit, longestOpenAtQuitMs };
}

/** A run whose last request or tool call ended this close to the end of the launch was still moving when it ran out. */
export const PROGRESSING_TAIL_MS = 120_000;
/** The share of the wait the product may spend with nothing in flight before an overrun is laid at its door. */
export const PRODUCT_SHARE_BOUND = 0.1;

/**
 * The deadline check's reading (H-h). Three outcomes:
 *   `inside`  the run reached its result inside the wait — a pass, with where the time went beside it;
 *   `window`  the wait ran out while the run was still progressing and the product had nothing in flight for at most a
 *             tenth of it: the window was the bound, not the product — a NOTE, because a verdict that blames the
 *             product for the endpoint's throughput teaches its reader to ignore the check;
 *   `product` the wait ran out and either the run had stopped moving or the product held more than a tenth of it — a
 *             failure, naming the share.
 * Without recorded traffic nothing can be attributed, so an overrun stays a failure and says why.
 */
export function deadlineReading({ timedOut, attribution: a, budgetMs, traffic, usage }) {
  const s = (ms) => `${n(ms / 1000)} s`;
  const parts = [
    `endpoint generating ${s(a.endpointMs)} (${pct(a.endpointMs, a.waitMs)} %${usage ? `; ${a.requests} request${a.requests === 1 ? '' : 's'}, ${n(usage.completionTokens)} output tokens of which ${n(usage.reasoningTokens)} reasoning` : ''})`,
    `tools alone ${s(a.toolsMs)} (a wait on children counted as what the children were doing)`,
    `launch ${s(a.launchMs)}`,
    `the product with nothing in flight ${s(a.productMs)} (${pct(a.productMs, a.waitMs)} %)`,
  ];
  const head = `${s(a.waitMs)} of ${s(budgetMs)}`;
  if (!timedOut) return { outcome: 'inside', detail: traffic ? `${head}: ${parts.join(', ')}` : `${head} (traffic not recorded, so the time is not attributed)` };
  if (!traffic) return { outcome: 'product', detail: `${head}; traffic not recorded, so the time cannot be attributed to the endpoint or the product` };
  const progressing = a.quietTailMs <= PROGRESSING_TAIL_MS;
  const productBound = a.productMs > PRODUCT_SHARE_BOUND * a.waitMs;
  const cut = (a.openAtQuit ?? 0) > 0
    ? `${a.openAtQuit} request${a.openAtQuit === 1 ? '' : 's'} still open when the wait ran out, the longest open for ${s(a.longestOpenAtQuitMs)}, cut off by the quit and not counted as progress`
    : '';
  const tail = progressing
    ? `the last request or tool call to end on its own ended ${s(a.quietTailMs)} before the launch did${cut === '' ? '' : `; ${cut}`}`
    : cut === '' ? `nothing had been in flight for ${s(a.quietTailMs)} when the launch ended` : `nothing had ended on its own for ${s(a.quietTailMs)} when the launch ended; ${cut}`;
  if (progressing && !productBound) return { outcome: 'window', detail: `${head}: ${parts.join(', ')}; ${tail} — raise LIVE_RUN_DURESS_MS to ask for the result on this endpoint` };
  return { outcome: 'product', detail: `${head}: ${parts.join(', ')}; ${tail}` };
}
