// @ts-check
/**
 * REQ-SHELL-145, REQ-SHELL-160: how much of what `theme-proof` discovered its contrast verdict actually measured.
 *
 * The contrast item used to pass when no measured text fell below its floor, at least one text in the whole run was
 * measured, and every capture was coherent. The texts it skipped (smaller than two pixels, animating when the frame was
 * taken, no part on screen, less than a glyph on screen: `textSample` and the loop in `theme-proof.mjs`) were counted
 * and never bounded, so a regression that pushed one surface's text off screen, or left it animating at capture, passed
 * on the rail and the status strip alone
 * (`docs/defects/fixed/theme-proofs-contrast-verdict-sets-no-bound-on-the-texts-it-skips.md`).
 *
 * The verdict now also needs, for every capture (a primary view or a Settings category):
 *  - at least one MEASURED text inside the surface's own root (the view's root element, or the Settings view's), so a
 *    surface whose own text is gone from the screen is a failure rather than a pass on the shell around it;
 *  - at most `MAX_SKIPPED_SHARE.surface` of the texts discovered inside that root skipped;
 * and, over the whole run, at most `MAX_SKIPPED_SHARE.overall` of every discovered text skipped. The skips are counted
 * by reason, so a reader sees which rule removed the texts.
 *
 * Nothing here is product code. It runs only from the proof and its test.
 */

/** The reasons a text is skipped, by key, with the start of the sentence the proof writes for each. */
export const SKIP_REASONS = Object.freeze({
  tiny: 'smaller than two pixels',
  animating: 'the element was animating when the frame was taken',
  offscreen: 'no part of it is on screen',
  sliver: 'less than a glyph of it is on screen',
});

/**
 * The bounds, from the skip share the runs of 2026-10-01 showed (stated with the measurements in `theme-proof.mjs`'s
 * header): every share there was far below them, so a bound is crossed by a regression and not by an ordinary run.
 */
export const MAX_SKIPPED_SHARE = Object.freeze({ overall: 0.1, surface: 0.25 });

/**
 * The key of a skip sentence, or `other` for one this module does not know (which still counts as a skip).
 * @param {string} why
 * @returns {keyof typeof SKIP_REASONS | 'other'}
 */
export function skipKind(why) {
  for (const [key, start] of Object.entries(SKIP_REASONS)) if (why.startsWith(start)) return /** @type {keyof typeof SKIP_REASONS} */ (key);
  return 'other';
}

/**
 * @typedef {{ inSurface: boolean, skip: string | null }} CoverageText one discovered text: whether it sits inside the
 *   capture's own surface root, and why it was skipped (`null` when it was measured)
 * @typedef {{ name: string, texts: readonly CoverageText[] }} CoverageSurface one capture
 */

/**
 * @param {readonly CoverageText[]} texts
 */
function count(texts) {
  /** @type {Record<string, number>} */
  const byReason = {};
  let skipped = 0;
  for (const text of texts) {
    if (text.skip === null) continue;
    skipped += 1;
    const kind = skipKind(text.skip);
    byReason[kind] = (byReason[kind] ?? 0) + 1;
  }
  return { discovered: texts.length, measured: texts.length - skipped, skipped, share: texts.length === 0 ? 0 : skipped / texts.length, byReason };
}

/**
 * The coverage of a run's contrast reading, and whether it is enough for a verdict. `failures` says, per surface and
 * overall, which bound was crossed; `pass` is true when there are none and at least one surface was read.
 * @param {readonly CoverageSurface[]} surfaces
 * @param {{ overall: number, surface: number }} [bounds]
 */
export function contrastCoverage(surfaces, bounds = MAX_SKIPPED_SHARE) {
  const failures = [];
  const perSurface = surfaces.map((surface) => {
    const all = count(surface.texts);
    const own = count(surface.texts.filter((text) => text.inSurface));
    if (own.measured === 0) failures.push(`${surface.name}: no text inside the surface was measured (${own.discovered} discovered there, ${own.skipped} skipped)`);
    else if (own.share > bounds.surface) failures.push(`${surface.name}: ${own.skipped} of the ${own.discovered} texts inside the surface were skipped (${(own.share * 100).toFixed(1)}% > ${(bounds.surface * 100).toFixed(0)}%)`);
    return { name: surface.name, ...all, surface: own };
  });
  const overall = count(surfaces.flatMap((surface) => surface.texts));
  if (overall.share > bounds.overall) failures.push(`overall: ${overall.skipped} of the ${overall.discovered} texts discovered were skipped (${(overall.share * 100).toFixed(1)}% > ${(bounds.overall * 100).toFixed(0)}%)`);
  if (surfaces.length === 0) failures.push('no surface was read');
  return { pass: failures.length === 0, bounds, ...overall, surfaces: perSurface, failures };
}
