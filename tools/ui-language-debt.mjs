/**
 * The burn-down decision behind `check-ui-language.mjs`, as a pure function.
 *
 * The scan that produces the counts needs the whole tree; the rule that turns two count
 * maps into a verdict does not, and it is the half that has to be exactly right in both
 * directions — a ceiling that only catches growth quietly re-spends every allowance paid off.
 */

/**
 * @param normalized measured debt, `{ "path|category|signature": count }`
 * @param baseline the committed allowance, same shape
 * @returns `{ growth, stale }` — entries above the baseline, and entries the baseline still
 *          reserves that the code no longer spends. Both are verdict-bearing: growth is a new
 *          debt, stale is a payment the baseline has not been lowered to record.
 */
export function compareDebt(normalized, baseline) {
  const growth = Object.entries(normalized)
    .filter(([key, count]) => count > (baseline[key] ?? 0))
    .map(([key, count]) => ({ key, count, allowed: baseline[key] ?? 0 }));
  const stale = Object.entries(baseline)
    .filter(([key, count]) => (normalized[key] ?? 0) < count)
    .map(([key, count]) => ({ key, count: normalized[key] ?? 0, allowed: count }));
  return { growth, stale };
}

/** The committed file's shape, sorted so a diff reads as a burn-down rather than a reshuffle. */
export function baselineDocument(normalized) {
  return { version: 1, debt: Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b))) };
}
