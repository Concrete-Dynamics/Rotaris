/**
 * The readings behind the live run's `duress` checks (`apps/desktop/scripts/live-run.mjs`, scenario 9), pure so that
 * `duress-checks.test.ts` can pin each one against the shape the first execution recorded (pack
 * `.live-run/runs/2026-09-29T03-06-14-929Z`, session `379f1490`). Each of the five was wrong there in a way a green
 * could not show:
 *
 *   H-a  a child cut off mid-work was counted as "failed with nothing to say" because its `final_response` was empty —
 *        which REQ-ORCH-110 requires of every child whose last assistant message was followed by tool activity;
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

/** A report field as text, whatever the store held (a missing field and `null` both read as ''). */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * What a child's report says for it, beyond its status. REQ-ORCH-110 puts the child's last words in `final_response`
 * only where no tool activity followed them, and in `last_response` otherwise; a child cut off at its ceiling carries
 * `cut_off` with its changed paths and the continuation offer (`PD-ORCH-004`) and an error naming the timeout. Any of
 * these is something to say. The summary is not counted: REQ-ORCH-110 makes one for every report, from the tools used
 * where there are no words, so it cannot tell a silent child from a speaking one.
 */
export function saysSomething(report) {
  const r = report !== null && typeof report === 'object' ? report : {};
  if (text(r.final_response) !== '' || text(r.last_response) !== '') return true;
  if (r.cut_off !== null && typeof r.cut_off === 'object') return true;
  return Array.isArray(r.errors) && r.errors.some((e) => text(e?.message) !== '');
}

/** The children that ended `failed` with nothing to say — the eighty-second defect's observable (H-a). */
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

/** The token counts one recorded call's streamed usage chunk carries; each is null where the record holds none. */
export function usageOf(record) {
  const body = typeof record?.responseBody === 'string' ? record.responseBody : '';
  const last = (field) => {
    let found = null;
    for (const m of body.matchAll(new RegExp(`"${field}"\\s*:\\s*(\\d+)`, 'g'))) found = Number(m[1]);
    return found;
  };
  return { promptTokens: last('prompt_tokens'), completionTokens: last('completion_tokens'), reasoningTokens: last('reasoning_tokens') };
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
export function compressionNote({ largestPrompt, trigger }) {
  const window = trigger.advertised === null ? `the ${n(trigger.capacity)}-token default capacity (the model advertises no input limit)` : `the model's ${n(trigger.advertised)}-token window`;
  const at = `the ${trigger.thresholdPercentage} % compression trigger, ${n(trigger.tokens)} tokens (REQ-CONFIG-134)`;
  if (largestPrompt === null) return `no recorded call carried its prompt size (traffic not recorded), so whether a prompt ever neared ${at} is unknown; the compressions aggregate is unasked`;
  if (largestPrompt < trigger.tokens) {
    return `the largest prompt any agent sent was ${n(largestPrompt)} tokens, ${pct(largestPrompt, trigger.advertised ?? trigger.capacity)} % of ${window} and below ${at} — the run never grew that far; the compressions aggregate is unasked`;
  }
  return `the largest prompt any agent sent was ${n(largestPrompt)} tokens, at or above ${at}, and no compression was recorded — worth reading beside the session log; the compressions aggregate is unasked`;
}

/**
 * The wait divided by what was in flight (H-h). Every instant of the launch, from its spawn to its exit, lands in
 * exactly one bucket, in this order of precedence:
 *   endpoint  at least one model request was open at the endpoint (the recorded traffic: each record's `at` and `ms`);
 *   tools     no request was open and at least one tool call was running (the store: each call's end and `elapsed_ms`);
 *   launch    before the first request or tool call — the application starting and the run being set up;
 *   product   the rest: the product between steps with nothing in flight, and the quit after the wait.
 * `quietTailMs` is how long before the launch ended the last request or tool call did: small when the run was still
 * progressing when the wait ran out, large when it had stopped moving.
 */
export function attributeWait({ startedAt, endedAt, requests, tools }) {
  const clip = (list) => list
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map((i) => ({ start: Math.max(i.start, startedAt), end: Math.min(i.end, endedAt) }))
    .filter((i) => i.end > i.start);
  const req = clip(requests);
  const tool = clip(tools);
  const waitMs = Math.max(0, endedAt - startedAt);
  if (req.length === 0 && tool.length === 0) return { waitMs, endpointMs: 0, toolsMs: 0, launchMs: waitMs, productMs: 0, quietTailMs: waitMs, requests: 0 };
  // One sweep over every boundary: between two consecutive boundaries nothing opens or closes.
  const points = [...new Set([startedAt, endedAt, ...req.flatMap((i) => [i.start, i.end]), ...tool.flatMap((i) => [i.start, i.end])])].sort((a, b) => a - b);
  const firstActivity = Math.min(...req.map((i) => i.start), ...tool.map((i) => i.start));
  const lastActivity = Math.max(...req.map((i) => i.end), ...tool.map((i) => i.end));
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
  return { waitMs, endpointMs, toolsMs, launchMs, productMs, quietTailMs: Math.max(0, endedAt - lastActivity), requests: req.length };
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
    `tools alone ${s(a.toolsMs)}`,
    `launch ${s(a.launchMs)}`,
    `the product with nothing in flight ${s(a.productMs)} (${pct(a.productMs, a.waitMs)} %)`,
  ];
  const head = `${s(a.waitMs)} of ${s(budgetMs)}`;
  if (!timedOut) return { outcome: 'inside', detail: traffic ? `${head}: ${parts.join(', ')}` : `${head} (traffic not recorded, so the time is not attributed)` };
  if (!traffic) return { outcome: 'product', detail: `${head}; traffic not recorded, so the time cannot be attributed to the endpoint or the product` };
  const progressing = a.quietTailMs <= PROGRESSING_TAIL_MS;
  const productBound = a.productMs > PRODUCT_SHARE_BOUND * a.waitMs;
  const tail = progressing ? `the last request or tool call ended ${s(a.quietTailMs)} before the launch did` : `nothing had been in flight for ${s(a.quietTailMs)} when the launch ended`;
  if (progressing && !productBound) return { outcome: 'window', detail: `${head}: ${parts.join(', ')}; ${tail} — raise LIVE_RUN_DURESS_MS to ask for the result on this endpoint` };
  return { outcome: 'product', detail: `${head}: ${parts.join(', ')}; ${tail}` };
}
