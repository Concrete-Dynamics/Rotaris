import type { Instant, Millis } from '../time.js';

/**
 * The two clock ports and the timer port of ADR-0006.
 *
 * Engine code reads time from these and from nothing else; a lint rule
 * (`rotaris/no-bare-timers`) forbids `Date.now`, `performance.now`,
 * `setTimeout` and `setInterval` in engine packages. A controlled clock can
 * therefore drive every coalescing tick, watchdog and backoff in a test
 * without patching globals.
 */
export interface MonotonicClock {
  now(): Millis;
}

export interface WallClock {
  instant(): Instant;
}

export interface TimerHandle {
  cancel(): void;
}

export interface Timers {
  /** Fire once after `delay`. */
  after(delay: Millis, fn: () => void): TimerHandle;
  /** Fire every `period`. */
  every(period: Millis, fn: () => void): TimerHandle;
}

export interface Clocks {
  readonly monotonic: MonotonicClock;
  readonly wall: WallClock;
  readonly timers: Timers;
}
