import { instant, millis, toIsoUtc, type Clocks, type TimerHandle } from '@rotaris/kernel';
import type { ModelChoice } from './resilience.js';

/**
 * REQ-ORCH-091 (c)/(d), REQ-NOTIFY-083/087/263, REQ-MONITOR-192: the suspended wait. An agent parked on a
 * provider limit waits here on a decision keyed by that agent; the timer (clock port) resolves a wait whose
 * auto-resume is allowed; a `cancel` resolves it cancelled through the run's abort signal; a `setModel` resolves
 * every pending wait with the chosen model; keep waiting in an out-of-quota wait resolves the waits on its pair alone as a
 * retry (`retryOn`, PD-MONITOR-007). The registry holds the state the session record publishes, and
 * tells the run on every change so the snapshot goes out with it.
 */
export interface WaitState {
  readonly agent: string;
  readonly provider: string;
  readonly model: string;
  readonly exhausted: boolean;
  /** ISO-8601 UTC; null when auto-resume is not permitted (the wait is indefinite). */
  readonly resumeAt: string | null;
  readonly attempt: number;
  /** REQ-NOTIFY-092's wording for the condition. */
  readonly reason: string;
  /** REQ-ORCH-091 (d): why the last change-model choice could not be applied; null when none was refused. */
  readonly rejection: string | null;
}

export type WaitDecision = { readonly kind: 'resume' } | { readonly kind: 'cancelled' } | { readonly kind: 'model'; readonly key: string; readonly choice: ModelChoice };

interface Pending {
  state: WaitState;
  readonly resolve: (d: WaitDecision) => void;
  readonly timer: TimerHandle | null;
  readonly cleanup: () => void;
}

export class WaitRegistry {
  private readonly pending = new Map<string, Pending>();
  /** REQ-NOTIFY-093: the condition a cancelled wait carried, for the terminal notice. */
  cancelledReason: string | null = null;

  constructor(private readonly deps: { readonly clocks: Clocks; readonly onChange: () => void }) {}

  get size(): number {
    return this.pending.size;
  }

  /** The wait a surface shows: the oldest pending one. */
  current(): WaitState | null {
    const first = this.pending.values().next();
    return first.done ? null : first.value.state;
  }

  all(): readonly WaitState[] {
    return [...this.pending.values()].map((p) => p.state);
  }

  /**
   * Park `agent` until the timer fires (`waitMs` given), the run aborts, or a model is chosen. `resumeAt` is
   * computed here from the wall clock so the header counts down against the same instant the record carries.
   */
  enter(input: Omit<WaitState, 'resumeAt' | 'rejection'>, waitMs: number | null, signal: AbortSignal): Promise<WaitDecision> {
    const existing = this.pending.get(input.agent);
    if (existing) existing.resolve({ kind: 'cancelled' });
    return new Promise<WaitDecision>((resolveOuter) => {
      let settled = false;
      const resolve = (d: WaitDecision) => {
        if (settled) return;
        settled = true;
        const p = this.pending.get(input.agent);
        if (p) { p.timer?.cancel(); p.cleanup(); this.pending.delete(input.agent); }
        if (d.kind === 'cancelled') this.cancelledReason = input.reason;
        this.deps.onChange();
        resolveOuter(d);
      };
      const onAbort = () => resolve({ kind: 'cancelled' });
      const timer = waitMs === null ? null : this.deps.clocks.timers.after(millis(waitMs), () => resolve({ kind: 'resume' }));
      const resumeAt = waitMs === null ? null : toIsoUtc(instant(Number(this.deps.clocks.wall.instant()) + waitMs));
      this.pending.set(input.agent, { state: { ...input, resumeAt, rejection: null }, resolve, timer, cleanup: () => signal.removeEventListener('abort', onAbort) });
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
      this.deps.onChange();
    });
  }

  /** REQ-ORCH-091 (d): every parked agent resumes on the chosen model at once. Returns how many. */
  resolveWithModel(key: string, choice: ModelChoice): number {
    const parked = [...this.pending.values()];
    for (const p of parked) p.resolve({ kind: 'model', key, choice });
    return parked.length;
  }

  /**
   * OQ-188's ruling (R-071, PD-MONITOR-007 clause 1): keep waiting in a wait that never auto-resumes retries the pair it waits
   * on. Every agent parked out of quota on that one pair resumes on its own cell (`resume`, the ladder's retry of the same
   * pair); an agent parked on another pair, or in a timed wait, stays parked. Returns how many.
   */
  retryOn(provider: string, model: string): number {
    const parked = [...this.pending.values()].filter((p) => p.state.exhausted && p.state.provider === provider && p.state.model === model);
    for (const p of parked) p.resolve({ kind: 'resume' });
    return parked.length;
  }

  /**
   * PD-ORCH-005 clause 2: an accepted pause ends every wait at once. Nothing about it is the user's cancel, so each resumes;
   * the ladder sees the run at rest and makes no call. Returns how many.
   */
  releaseForRest(): number {
    const parked = [...this.pending.values()];
    for (const p of parked) p.resolve({ kind: 'resume' });
    return parked.length;
  }

  /** A change-model choice that could not be applied: the wait continues, the header names why. */
  reject(reason: string): void {
    for (const p of this.pending.values()) p.state = { ...p.state, rejection: reason };
    if (this.pending.size > 0) this.deps.onChange();
  }
}
