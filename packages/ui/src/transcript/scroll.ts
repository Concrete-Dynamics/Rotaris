/**
 * Telling the pane's own scroll from the reader's (REQ-CHAT-070, REQ-CHAT-072).
 *
 * A `scroll` event carries no origin. The pane used to answer the question with a boolean set before it
 * scrolled itself and cleared by the next event, whoever caused it — so a reader's scroll that landed
 * between the pin and the pin's own event was consumed as the pane's, the follow was never released, and
 * the pane pinned again on its next render. What the pane actually knows is not *that* it scrolled but
 * **where it scrolled to**, and a position survives the race a flag loses.
 */

/** Sub-pixel: `scrollTop` is fractional under a device pixel ratio, so a readback rarely compares exact. */
export const SCROLL_ORIGIN_EPSILON = 0.5;

/**
 * Whether a scroll event at `actual` is the one the pane caused by setting `expected`.
 *
 * `expected` is `null` when the pane has nothing outstanding — every event is then the reader's. A reader
 * who happens to land on exactly the position the pane was moving to is indistinguishable, and that costs
 * nothing: the follow state computed from that position is the same either way.
 *
 * @param expected the position the pane last set, read back after the assignment, or `null`
 * @param actual the element's `scrollTop` as the event sees it
 * @param epsilon tolerance in CSS pixels
 */
export function isOwnScroll(expected: number | null, actual: number, epsilon: number = SCROLL_ORIGIN_EPSILON): boolean {
  if (expected === null) return false;
  return Math.abs(actual - expected) <= epsilon;
}
