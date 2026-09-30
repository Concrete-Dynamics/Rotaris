/**
 * REQ-SHELL-145, REQ-SHELL-160 (a): the part of a rendered text that `theme-proof` reads its contrast from.
 *
 * The ratio is measured from painted pixels, so the proof may only read pixels that show the text. A text box the
 * window edge or a scroll container cuts off is only partly painted. Reading the whole box reads pixels that belong to
 * something else, or to nothing. Reading a sliver of it reads a glyph's anti-aliased edge, which never reaches the
 * text's own colour. The status strip scrolls horizontally, and its last item used to be measured as two device-pixel
 * columns at the window's right edge. Where the branch label and the theme's name placed it decided whether that
 * item passed. That defect is recorded in
 * `docs/defects/fixed/theme-proofs-text-contrast-verdict-depends-on-the-checkouts-path.md`.
 *
 * The probe inside the page MEASURES: the text's box and the boxes that clip it. It computes the on-screen part with
 * `clipRect`, whose source is injected into the page, so the page and the tests run the same code. This module
 * DECIDES what is read.
 */

/**
 * The part of `rect` inside every one of `clips`, or `null` when nothing of it is left. Every box is
 * `{ x, y, width, height }` in CSS pixels. The function is self-contained, because `theme-proof` injects its source
 * into the page.
 */
export function clipRect(rect, clips) {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  for (const clip of clips) {
    left = Math.max(left, clip.x);
    top = Math.max(top, clip.y);
    right = Math.min(right, clip.x + clip.width);
    bottom = Math.min(bottom, clip.y + clip.height);
  }
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** A clip that sub-pixel layout moves by less than this still counts as showing the whole extent. */
export const CLIP_TOLERANCE = 0.5;

/**
 * What to read for one text of the proof's metadata: `{ rect }`, the on-screen part to measure, or `{ skip }`, the
 * reason it is not measured.
 *
 * A text counts as shown along an axis when at least one em of it is on screen, or the whole of it where it is
 * shorter than an em. An em is the font size, which holds at least one whole glyph. A fragment smaller than that is
 * a glyph's edge, not the text's colour. A metadata record written before `shown` existed reads as wholly shown.
 */
export function textSample(text) {
  const shown = text.shown === undefined ? text.rect : text.shown;
  if (shown === null) return { skip: 'no part of it is on screen' };
  const em = Number.isFinite(text.fontSize) && text.fontSize > 0 ? text.fontSize : 0;
  const needWidth = Math.min(text.rect.width, em) - CLIP_TOLERANCE;
  const needHeight = Math.min(text.rect.height, em) - CLIP_TOLERANCE;
  if (shown.width < needWidth || shown.height < needHeight) {
    const size = (box) => `${box.width.toFixed(1)}×${box.height.toFixed(1)}`;
    return { skip: `less than a glyph of it is on screen (${size(shown)} of ${size(text.rect)} CSS px)` };
  }
  return { rect: shown };
}
