/**
 * The live run's reading of PD-MONITOR-005 revision 2 (OQ-127's ruling, 2026-10-06) over a session's `stall` issues: the
 * issue is written only with its warning, at stall entry and then no more often than REQ-MONITOR-120 lets the warning
 * repeat, the stall timeout or 30 s, whichever is longer (`stallRepeat` in `packages/engine/src/children/stall.ts`). Before
 * the revision the build wrote one at every evaluation, REQ-MONITOR-117's cadence (5 s at the default 90 s threshold), and
 * the `faults-stall` scenario's check, which asked only that one existed, passed that too
 * (`docs/defects/fixed/the-faults-stall-check-does-not-assert-the-stall-issue-throttle.md`).
 *
 * **One stall, one silence.** A stall is a silence of one agent's watch; its start is fixed while it lasts (no event moves
 * the watch's last-event time during it), and each issue says how long the silence had lasted when it was written. So an
 * issue's `recorded_at` less its silence is the silence's start, and two issues of one agent whose starts agree are one
 * stall: the second is a repeat, and it may come no sooner than the throttle after the first. Issues of one agent whose
 * starts differ are two stalls, each opened by its own entry, and no throttle lies between them.
 *
 * **The threshold is read from the stall, not the configuration.** The live run does not know the entry persona's
 * `stall_timeout` or `runtime.child_stall_timeout`; the entry evaluation does. It finds the silence at or past the
 * threshold and less than one evaluation interval (at most 5 s, REQ-MONITOR-117) plus the silence's floor to a second past
 * it, so the threshold is at least the entry's silence less 6 s, and the throttle at least that or 30 s. A caller that does
 * know the threshold passes it.
 *
 * Nothing here is product code. It runs only from the live run.
 */

/** An issue's metadata as an object: the store keeps it as JSON text. */
function metadataOf(issue) {
  let meta = issue.metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = null; }
  }
  return meta !== null && typeof meta === 'object' ? meta : {};
}

/** The silence a `stall` issue states: its metadata's `silent_seconds`, else the figure in REQ-ORCH-089's words. */
export function stallSilenceSeconds(issue) {
  const meta = metadataOf(issue);
  if (Number.isFinite(meta.silent_seconds)) return meta.silent_seconds;
  const words = /appears stalled: no model event or token for (\d+) seconds/.exec(String(issue.message ?? ''));
  return words === null ? null : Number(words[1]);
}

/** Whose watch wrote the issue: its actor, and the task its metadata names (a child's `bg_…`, the root's own id). */
function watchOf(issue) {
  const meta = metadataOf(issue);
  const task = typeof meta.task_id === 'string' ? meta.task_id : '';
  return `${String(issue.actor ?? '')}\u0000${task}`;
}

/** REQ-MONITOR-117's longest evaluation interval plus the silence's floor to a whole second. */
const ENTRY_SLACK_MS = 6_000;
/** REQ-MONITOR-120's floor on the repeat. */
const REPEAT_FLOOR_MS = 30_000;

/**
 * The `stall` issues among `issues` (`{ kind, actor, recorded_at, message, metadata }` as the live run's `readIssues` reads
 * them), grouped into stalls, and every repeat written sooner than the throttle allows.
 *
 * - `stalls`: `{ actor, startMs, silences, throttleMs }` per stall, in the order its first issue was written; `silences` are
 *   the seconds each issue states.
 * - `tooSoon`: `{ actor, previous, next, gapMs, throttleMs }` for each repeat whose gap from the issue before it in the
 *   same stall is shorter than the throttle, less `toleranceMs` for the store's clock against the watch's.
 * - `unread`: `stall` issues with no silence or no time to read; they are not judged.
 */
export function stallIssueCadence(issues, { thresholdMs = null, toleranceMs = 1_500, sameStallMs = 3_000 } = {}) {
  const stalls = [];
  const tooSoon = [];
  const unread = [];
  const open = new Map();
  for (const issue of issues.filter((i) => i.kind === 'stall')) {
    const silence = stallSilenceSeconds(issue);
    const at = Date.parse(String(issue.recorded_at ?? ''));
    if (silence === null || !Number.isFinite(at)) {
      unread.push(issue);
      continue;
    }
    const startMs = at - silence * 1000;
    const watch = watchOf(issue);
    const current = open.get(watch);
    if (current !== undefined && Math.abs(startMs - current.startMs) <= sameStallMs) {
      const gapMs = at - current.lastAt;
      if (gapMs < current.throttleMs - toleranceMs) {
        tooSoon.push({ actor: issue.actor, previous: current.silences.at(-1), next: silence, gapMs, throttleMs: current.throttleMs });
      }
      current.silences.push(silence);
      current.lastAt = at;
      continue;
    }
    const threshold = thresholdMs ?? Math.max(0, silence * 1000 - ENTRY_SLACK_MS);
    const stall = { actor: issue.actor, startMs, silences: [silence], throttleMs: Math.max(threshold, REPEAT_FLOOR_MS), lastAt: at };
    open.set(watch, stall);
    stalls.push(stall);
  }
  return { stalls: stalls.map(({ lastAt: _lastAt, ...stall }) => stall), tooSoon, unread };
}
