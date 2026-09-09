/**
 * Part AM — REQ-SHELL-101's wheel arithmetic (ADR-0047 consequence 4: "a stateful detail that is easy to lose in a
 * refactor; it is specified and it needs a test with sub-notch deltas"). One standard notch scrolls exactly three
 * rows; a high-resolution or fractional delta scrolls in the same proportion; the fractional remainder is accumulated
 * across events so slow continuous scrolling loses no motion and eventually advances a row. Direction follows the
 * delta's sign; clamping at both ends is the emulator's (`scrollLines` never wraps).
 */
export const ROWS_PER_NOTCH = 3;
/** Chromium reports one standard notch as 100 px in `DOM_DELTA_PIXEL` mode. */
export const PIXELS_PER_NOTCH = 100;

export const DELTA_PIXEL = 0;
export const DELTA_LINE = 1;
export const DELTA_PAGE = 2;

export class WheelAccumulator {
  private remainder = 0;

  /** Whole rows to scroll for this event (sign = direction); the fraction is kept for the next event. */
  rows(deltaY: number, deltaMode: number, screenRows: number): number {
    const proposed = deltaMode === DELTA_LINE ? deltaY : deltaMode === DELTA_PAGE ? deltaY * screenRows : deltaY * ROWS_PER_NOTCH / PIXELS_PER_NOTCH;
    // Rounded to the ninth place before truncating so ten tenths of a notch make exactly three rows, not 2.999… → 2.
    const total = Math.round((this.remainder + proposed) * 1e9) / 1e9;
    const whole = Math.trunc(total);
    this.remainder = total - whole;
    // `Math.trunc(-0.3)` is `-0`, which a caller comparing to zero should never have to know about.
    return whole === 0 ? 0 : whole;
  }

  reset(): void { this.remainder = 0; }

  get pending(): number { return this.remainder; }
}
