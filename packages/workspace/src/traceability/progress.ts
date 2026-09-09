import type { MonotonicClock } from '@rotaris/kernel';
import type { PassPhase, ProgressReport } from '@rotaris/contracts';

/**
 * The progress protocol (REQ-TRACE-210 to REQ-TRACE-216, REQ-TRACE-351): plain values, two kinds of report, every
 * report naming its phase outright. A phase report carries the number of items the phase will report (0 = one
 * indivisible step) and precedes that phase's first item report; an item report carries a 1-based position, the
 * total, an optional detail and the deadline in seconds — ABSENT where the wait is unlimited, never zero (213).
 *
 * Dispatch is defensive and absent-by-default (215): no sink means no reporting work at all; a sink that throws is
 * reported to `onHookError` (named) and stepped over, and nothing here can alter what a pass concludes.
 *
 * The engine's own passes report `reading` (the store parse) and `coverage` (the sweep), both as phase-only steps
 * (216); `checks`, `recording` and `adopting` belong to the delivery pass beside this engine (ADR-0041).
 */
export type ProgressSink = ((report: ProgressReport) => void) | undefined;

export interface ProgressHost {
  readonly sink: ProgressSink;
  readonly onHookError?: (hook: string, error: unknown) => void;
}

function dispatch(host: ProgressHost | undefined, report: ProgressReport): void {
  if (host?.sink === undefined) return;
  try { host.sink(report); } catch (e) { host.onHookError?.(`progress(${report.kind}:${report.phase})`, e); }
}

export function reportPhase(host: ProgressHost | undefined, phase: PassPhase, total: number): void {
  dispatch(host, { kind: 'phase', phase, total });
}

export function reportItem(host: ProgressHost | undefined, phase: PassPhase, label: string, position: number, total: number, detail?: string, deadlineSeconds?: number): void {
  const r: { kind: 'item'; phase: PassPhase; label: string; position: number; total: number; detail?: string; deadlineSeconds?: number } = { kind: 'item', phase, label, position, total };
  if (detail !== undefined) r.detail = detail;
  if (deadlineSeconds !== undefined && deadlineSeconds > 0) r.deadlineSeconds = deadlineSeconds;
  dispatch(host, r);
}

/** REQ-TRACE-351: throttle only above 20 items in a phase; minimum publication interval 0.1 s. */
export const THROTTLE_ABOVE_ITEMS = 20;
export const MIN_PUBLICATION_INTERVAL_MS = 100;

/**
 * A sink that throttles item reports of phases with more than 20 items to one per 0.1 s, always publishing a phase
 * change and a phase's last item. Phases with 20 items or fewer pass through untouched.
 */
export function throttledSink(sink: ProgressSink, clock: MonotonicClock): ProgressSink {
  if (sink === undefined) return undefined;
  let phaseTotal = 0;
  let lastPublished = Number.NEGATIVE_INFINITY;
  return (report) => {
    if (report.kind === 'phase') {
      phaseTotal = report.total;
      lastPublished = Number.NEGATIVE_INFINITY;
      sink(report);
      return;
    }
    if (phaseTotal <= THROTTLE_ABOVE_ITEMS || report.position >= report.total) { sink(report); lastPublished = Number(clock.now()); return; }
    const now = Number(clock.now());
    if (now - lastPublished >= MIN_PUBLICATION_INTERVAL_MS) { sink(report); lastPublished = now; }
  };
}
