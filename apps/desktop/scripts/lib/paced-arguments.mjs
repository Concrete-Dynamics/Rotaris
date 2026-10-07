/**
 * The live run's reading of the `faults-args` launch: the recording proxy paces every streamed piece of a tool call's
 * arguments (its `pace` rule), so one model step streams a `write_file` for longer than the stall threshold, and the
 * product must not call that agent stalled while it streams (REQ-ORCH-089, REQ-MONITOR-119; the repair of
 * `docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md`). Before the repair the adapter forwarded
 * none of the pieces, and the duress live runs' child was warned stalled 94 s into a 97 s `write_file`.
 *
 * Nothing here is product code. It runs only from the live run.
 */

/**
 * The paced windows among a scenario's traffic records: one per call whose `paced` figure says the proxy held back at
 * least one argument piece, `{ at, events, firstAt, lastAt, spanMs }` with the instants in epoch milliseconds, longest first.
 */
export function pacedWindows(records) {
  return records
    .filter((r) => r !== null && typeof r === 'object' && r.paced !== undefined && Number(r.paced.events) > 0 && Number.isFinite(r.paced.firstAt) && Number.isFinite(r.paced.lastAt))
    .map((r) => ({ at: String(r.at ?? ''), events: Number(r.paced.events), firstAt: r.paced.firstAt, lastAt: r.paced.lastAt, spanMs: r.paced.lastAt - r.paced.firstAt }))
    .sort((a, b) => b.spanMs - a.spanMs);
}

/** REQ-MONITOR-117's evaluation interval for a threshold: a sixth of it, never under 1 s or over 5 s. */
export function evaluationIntervalMs(thresholdMs) {
  return Math.max(1_000, Math.min(thresholdMs / 6, 5_000));
}

/**
 * Whether a window can show anything: arguments streamed for less than the threshold and one evaluation interval leave no
 * build's watch a silence of the threshold to find, so such a window is no evidence either way.
 */
export function conclusive(window, thresholdMs) {
  return window.spanMs >= thresholdMs + evaluationIntervalMs(thresholdMs);
}

/**
 * The `stall` issues written while an agent streamed paced arguments: an issue recorded after a window's first piece and
 * no later than its last piece plus one evaluation interval. A watch fed every piece cannot find the threshold's silence
 * in that span, since the pieces arrive a fraction of a second apart; a watch fed none finds it once the threshold has
 * passed since the agent's last event before the stream. One evaluation interval is allowed at each end for an evaluation
 * that read the silence just before the first piece, or just after the last. Each is returned with the window it falls
 * in. `issues` are `{ kind, recorded_at, actor, message }` as the live run reads them.
 */
export function stallsWhileStreaming(issues, windows, thresholdMs) {
  const slack = evaluationIntervalMs(thresholdMs);
  const found = [];
  for (const issue of issues) {
    if (issue?.kind !== 'stall') continue;
    const at = Date.parse(String(issue.recorded_at ?? ''));
    if (!Number.isFinite(at)) continue;
    const window = windows.find((w) => at >= w.firstAt + slack && at <= w.lastAt + slack);
    if (window !== undefined) found.push({ issue, window });
  }
  return found;
}
