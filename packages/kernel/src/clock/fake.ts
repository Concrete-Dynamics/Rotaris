import { instant, millis, type Instant, type Millis } from '../time.js';
import type { Clocks, MonotonicClock, TimerHandle, Timers, WallClock } from './ports.js';

/**
 * A controlled clock for tests. Time advances only when told to, and timers
 * fire in deadline order as it does. Both ports read the same source so a
 * test can reason about one number.
 */
export class FakeClock implements MonotonicClock, WallClock, Timers, Clocks {
  private t: number;
  private wallOffset: number;
  private seq = 0;
  private pending: { at: number; seq: number; fn: () => void; period: number | undefined; cancelled: boolean }[] = [];

  constructor(startMonotonic = 0, startWall = 1_756_684_800_000 /* 2025-09-01T00:00:00Z */) {
    this.t = startMonotonic;
    this.wallOffset = startWall - startMonotonic;
  }

  get monotonic(): MonotonicClock {
    return this;
  }
  get wall(): WallClock {
    return this;
  }
  get timers(): Timers {
    return this;
  }

  now(): Millis {
    return millis(this.t);
  }
  instant(): Instant {
    return instant(this.t + this.wallOffset);
  }

  after(delay: Millis, fn: () => void): TimerHandle {
    return this.schedule(delay, fn, undefined);
  }
  every(period: Millis, fn: () => void): TimerHandle {
    return this.schedule(period, fn, period);
  }

  private schedule(delay: number, fn: () => void, period: number | undefined): TimerHandle {
    const entry = { at: this.t + Math.max(0, delay), seq: this.seq++, fn, period, cancelled: false };
    this.pending.push(entry);
    return { cancel: () => { entry.cancelled = true; } };
  }

  /** Advance by `by` milliseconds, firing every timer whose deadline is reached, in order. */
  advance(by: number): void {
    const target = this.t + by;
    for (;;) {
      const due = this.pending
        .filter((p) => !p.cancelled && p.at <= target)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.t = due.at;
      if (due.period !== undefined) {
        due.at += due.period;
        due.seq = this.seq++;
      } else {
        due.cancelled = true;
      }
      due.fn();
    }
    this.t = target;
    this.pending = this.pending.filter((p) => !p.cancelled);
  }

  pendingCount(): number {
    return this.pending.filter((p) => !p.cancelled).length;
  }
}
