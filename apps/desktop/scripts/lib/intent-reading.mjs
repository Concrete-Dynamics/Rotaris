/**
 * The live run's intent-classifier reading, per launch (item N67; OQ-258, `PD-ORCH-011` revision 2, REQ-ORCH-007, REQ-ORCH-008,
 * REQ-ORCH-010, REQ-ORCH-011). Until it existed, how often the classifier fell back across a default pack, and on what, was read
 * by autopsying each session in turn (`autopsy.mjs` loads one session's launch audit), so OQ-258's live measure ("launch audits
 * read `fallback: true` less often") and its reopening limb ("3 or more cuts in 10 launches where the endpoint was not
 * queueing (bytes were received before the cut)") had no line of their own in the harness's output.
 *
 * Every figure comes from the record, never from the model's prose: the category, confidence, rung, fallback flag and reason
 * from each preserved session's launch audit (`launch_audits.payload`'s `run_intent`, `IntentResultSchema`); the time from the
 * run host's own log, because `run_intent` carries no elapsed field — from the `session <id> started` line to the next
 * `intent:` line, which is how long the run waited on its classification; and, for a cut, whether the endpoint had sent anything
 * from the recorded traffic (the aborted request ending at the cut), and, since OQ-332's ruling (2026-10-15, R-072), the tail of
 * the reasoning it had streamed, so OQ-258's first reopening limb ("a classification cut after its reasoning has named its category
 * and not reopened that choice") is read from the NOTE without an autopsy.
 *
 * Nothing here is product code. It runs only from the live run, and `intent-reading.test.ts` pins it.
 */

/** The run host's intent line (`run-host/intent.ts`): since PD-MONITOR-002 `… info    run host: intent: …`. */
const INTENT_LINE = /run host:? (?:info: )?intent: /;
/** A log line's own timestamp (`[main 2026-10-13T12:19:13.182Z] …`). */
const STAMP = /^\[[a-z-]+ (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\]/;

/** REQ-ORCH-007's fallback reason when the call outlasted REQ-ORCH-008's bound ("the classification call timed out after 12 s"). */
export const CUT_REASON = /timed out after/;

/** One launch's intent from its launch audit's payload (`launch_audits.payload`), or null where it holds none. */
export function auditIntent(payloadJson) {
  if (typeof payloadJson !== 'string' || payloadJson === '') return null;
  try {
    const intent = JSON.parse(payloadJson)?.run_intent;
    if (intent === null || typeof intent !== 'object' || typeof intent.category !== 'string') return null;
    return {
      category: intent.category,
      confidence: typeof intent.confidence === 'number' ? intent.confidence : null,
      reason: typeof intent.reason === 'string' ? intent.reason : '',
      fallback: intent.fallback === true,
      carriedOver: intent.carried_over === true,
      rung: typeof intent.rung === 'string' ? intent.rung : null,
    };
  } catch { return null; }
}

/**
 * How long one session's run waited on its classification, read from its launch's log: the instant of the run host's
 * `session <id> started` line and of the first `intent:` line after it. Null where either is missing (a log the scenario
 * overwrote, a run that never started).
 */
export function classificationTiming(log, sessionId) {
  if (typeof log !== 'string' || typeof sessionId !== 'string' || sessionId === '') return null;
  const lines = log.split('\n');
  const startAt = lines.findIndex((l) => l.includes(`run host: session ${sessionId} started`));
  if (startAt < 0) return null;
  const intentAt = lines.findIndex((l, i) => i > startAt && INTENT_LINE.test(l));
  if (intentAt < 0) return null;
  const started = Date.parse(STAMP.exec(lines[startAt])?.[1] ?? '');
  const classified = Date.parse(STAMP.exec(lines[intentAt])?.[1] ?? '');
  if (Number.isNaN(started) || Number.isNaN(classified)) return null;
  return { startedAt: started, classifiedAt: classified, elapsedMs: classified - started };
}

/** How many of a cut's last reasoning characters the NOTE prints (OQ-332): enough to see a category settled or still weighed. */
export const REASONING_TAIL_CHARS = 300;

/**
 * The last `chars` characters of the reasoning one recorded streamed response carried, whitespace collapsed to single spaces so the
 * NOTE stays on one line, prefixed `…` where it was shortened; '' where it carried none. The stream is the OpenAI-compatible SSE
 * the recorder kept verbatim (`data: {…}` chunks); the reasoning is each chunk's `delta.reasoning` (the registered self-hosted
 * endpoint's field) or `delta.reasoning_content` (the other spelling endpoints use). The model's text is quoted, never interpreted:
 * nothing here reads a category out of it (OQ-332 rejected taking the category a cut's reasoning named).
 */
export function reasoningTail(body, chars = REASONING_TAIL_CHARS) {
  if (typeof body !== 'string' || body === '') return '';
  const pieces = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') continue;
    let chunk;
    try { chunk = JSON.parse(data); } catch { continue; }
    for (const choice of Array.isArray(chunk?.choices) ? chunk.choices : []) {
      const delta = choice?.delta ?? {};
      const piece = typeof delta.reasoning === 'string' ? delta.reasoning : typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
      if (piece !== '') pieces.push(piece);
    }
  }
  const text = pieces.join('').replace(/\s+/g, ' ').trim();
  return text.length <= chars ? text : `…${text.slice(-chars).trimStart()}`;
}

/**
 * For a cut: what the endpoint had sent before it, from the scenario's recorded traffic (`model-traffic.jsonl`'s records,
 * `{ at, ms, outcome, responseBody }`). The cut request is the aborted one that started inside the classification's window and
 * ended nearest its end. `bytes` is the length of what it received; 0 is OQ-258's queueing endpoint. `tail` is the end of the
 * reasoning it received (`reasoningTail`, OQ-332), '' where it received none. Null where no record fits.
 */
export function cutTraffic(records, timing) {
  if (!Array.isArray(records) || timing === null) return null;
  const candidates = records
    .map((r) => ({ at: Date.parse(String(r?.at ?? '')), ms: Number(r?.ms), outcome: r?.outcome, body: typeof r?.responseBody === 'string' ? r.responseBody : '' }))
    .filter((r) => !Number.isNaN(r.at) && Number.isFinite(r.ms) && r.outcome === 'aborted' && r.at >= timing.startedAt - 1_000 && r.at <= timing.classifiedAt);
  if (candidates.length === 0) return null;
  const nearest = candidates.reduce((best, r) => (Math.abs(r.at + r.ms - timing.classifiedAt) < Math.abs(best.at + best.ms - timing.classifiedAt) ? r : best));
  return { bytes: nearest.body.length, ms: nearest.ms, tail: reasoningTail(nearest.body) };
}

/**
 * The reading over every preserved session: `launches` is `{ scenario, sessionId, payload, log, traffic }[]` (`payload` the
 * launch audit's JSON, `log` the launch's `app.log`, `traffic` its recorded requests or null). Returns each launch's row and the
 * counts OQ-258 reads: `classified` (launches whose audit carries an intent), `fallbacks`, `cuts` (fallbacks at the bound),
 * `cutsWithBytes` (cuts the endpoint had answered into, so not a queueing endpoint's) and `carried` (intents carried over,
 * unclassified, PD-ORCH-005 revision 7 clause 40).
 */
export function classifierReading(launches) {
  const rows = [];
  for (const launch of launches ?? []) {
    const intent = auditIntent(launch.payload);
    if (intent === null) continue;
    const timing = classificationTiming(launch.log, launch.sessionId);
    const cut = intent.fallback && CUT_REASON.test(intent.reason);
    rows.push({ scenario: launch.scenario, sessionId: launch.sessionId, ...intent, cut, elapsedMs: timing?.elapsedMs ?? null, traffic: cut ? cutTraffic(launch.traffic, timing) : null });
  }
  const cuts = rows.filter((r) => r.cut);
  return {
    rows,
    classified: rows.length,
    fallbacks: rows.filter((r) => r.fallback).length,
    cuts: cuts.length,
    cutsWithBytes: cuts.filter((r) => r.traffic !== null && r.traffic.bytes > 0).length,
    carried: rows.filter((r) => r.carriedOver).length,
  };
}

const seconds = (ms) => (ms === null ? 'time unread' : `${(ms / 1000).toFixed(1)} s`);

/**
 * One row as the NOTE's detail prints it: `edit small_feature 0.92 via json_schema, 3.4 s`; a cut also gives its bytes received
 * and, where the endpoint streamed reasoning into it, that reasoning's tail (OQ-332).
 */
export function classifierRowText(row) {
  const cutText = (traffic) => (traffic === null
    ? ', traffic unread'
    : `, ${traffic.bytes} byte(s) received before the cut${traffic.tail ? `, its reasoning ending "${traffic.tail}"` : ''}`);
  const how = row.fallback
    ? `FALLBACK (${row.reason})${row.cut ? cutText(row.traffic) : ''}`
    : row.carriedOver ? 'carried over, unclassified' : `${row.confidence === null ? 'no confidence' : row.confidence}${row.rung === null ? '' : ` via ${row.rung}`}`;
  return `${row.scenario} ${row.category} ${how}, ${seconds(row.elapsedMs)}`;
}

/**
 * The NOTE the live run prints: never a FAIL, because a fallback is REQ-ORCH-007 working and whether the endpoint queued is the
 * endpoint's. Its title gives the counts OQ-258 reads; it names the reopening limb where the cuts the endpoint had answered into
 * reach 3 in 10 launches (scaled to the launches read), for the record to decide whether the endpoint was queueing.
 */
export function classifierNote(reading) {
  const { classified, fallbacks, cuts, cutsWithBytes, carried } = reading;
  const limb = classified > 0 && cutsWithBytes * 10 >= 3 * classified;
  return {
    title: `intent classification over ${classified} launch(es): ${fallbacks} fell back (${cuts} cut at REQ-ORCH-008's bound, ${cutsWithBytes} after the endpoint had sent bytes)${carried > 0 ? `, ${carried} carried over` : ''} (OQ-258, PD-ORCH-011 revision 2)${limb ? ' — OQ-258\'s reopening limb: 3 or more cuts in 10 launches with bytes received' : ''}`,
    detail: reading.rows.map(classifierRowText).join('; ') || 'no launch audit carried an intent',
  };
}
