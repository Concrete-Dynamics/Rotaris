import { describe, expect, it } from 'vitest';
import { millis } from '../time.js';
import { FakeClock } from './fake.js';

/**
 * The controlled clock every engine test drives its timers with (ADR-0006: engine code reads time from the ports
 * alone, `rotaris/no-bare-timers`). R-091 (`docs/architecture/hardening.md` §3.5 row 7, F3): what a test may rely on
 * when it advances one.
 */
describe('kernel — FakeClock', () => {
  it('fires two timers due at one instant in the order they were registered', () => {
    const clock = new FakeClock();
    const fired: string[] = [];
    clock.after(millis(100), () => fired.push('first'));
    clock.after(millis(100), () => fired.push('second'));
    clock.after(millis(100), () => fired.push('third'));
    clock.advance(100);
    expect(fired).toEqual(['first', 'second', 'third']);
  });

  it('never fires a timer cancelled before its instant, and no longer counts it as pending', () => {
    const clock = new FakeClock();
    const fired: string[] = [];
    const cancelled = clock.after(millis(50), () => fired.push('cancelled'));
    clock.after(millis(50), () => fired.push('kept'));
    expect(clock.pendingCount()).toBe(2);
    clock.advance(49);
    cancelled.cancel();
    expect(clock.pendingCount()).toBe(1);
    clock.advance(1_000);
    expect(fired).toEqual(['kept']);
    // Cancelling again, or after the timer would have fired, is harmless.
    cancelled.cancel();
    expect(clock.pendingCount()).toBe(0);
  });

  it('a timer cancelled by another firing at the same instant does not fire', () => {
    const clock = new FakeClock();
    const fired: string[] = [];
    let later: { cancel(): void } | null = null;
    clock.after(millis(10), () => { fired.push('canceller'); later?.cancel(); });
    later = clock.after(millis(10), () => fired.push('cancelled'));
    clock.advance(10);
    expect(fired).toEqual(['canceller']);
  });

  it('reads its deadline as the time inside a callback, and the target once the advance is done', () => {
    const clock = new FakeClock(1_000);
    const seen: number[] = [];
    clock.after(millis(30), () => seen.push(clock.now()));
    clock.after(millis(70), () => seen.push(clock.now()));
    clock.advance(100);
    expect(seen).toEqual([1_030, 1_070]);
    expect(clock.now()).toBe(1_100);
  });

  it('fires a timer a callback schedules within the same advance when it falls due inside it, and holds one that does not', () => {
    const clock = new FakeClock();
    const fired: string[] = [];
    clock.after(millis(10), () => {
      fired.push('outer');
      clock.after(millis(0), () => fired.push('zero'));
      clock.after(millis(5), () => fired.push('inner'));
      clock.after(millis(500), () => fired.push('next advance'));
    });
    clock.advance(20);
    expect(fired).toEqual(['outer', 'zero', 'inner']);
    expect(clock.pendingCount()).toBe(1);
    clock.advance(490);
    expect(fired).toEqual(['outer', 'zero', 'inner', 'next advance']);
  });

  it('reads a negative delay as now: it fires on the next advance, even one of zero', () => {
    const clock = new FakeClock();
    const fired: string[] = [];
    clock.after(millis(-5), () => fired.push('late'));
    clock.advance(0);
    expect(fired).toEqual(['late']);
  });

  it('fires a periodic timer once per period crossed, and stops when cancelled', () => {
    const clock = new FakeClock();
    let ticks = 0;
    const handle = clock.every(millis(25), () => { ticks += 1; });
    clock.advance(24);
    expect(ticks).toBe(0);
    clock.advance(76);
    expect(ticks).toBe(4);
    handle.cancel();
    clock.advance(1_000);
    expect(ticks).toBe(4);
  });

  it('moves the monotonic and the wall reading together, from their own starts', () => {
    const clock = new FakeClock(500, 1_756_684_800_000);
    expect(clock.monotonic.now()).toBe(500);
    expect(clock.wall.instant()).toBe(1_756_684_800_000);
    clock.advance(250);
    expect(clock.monotonic.now()).toBe(750);
    expect(clock.wall.instant()).toBe(1_756_684_800_250);
    // The three ports are the clock itself, so a test reasons about one number.
    expect(clock.timers).toBe(clock);
  });
});
