import { TIER_PREFERENCES, type Tier, type TierPreferences } from './tiers.data.js';

/**
 * REQ-PROVIDER-081/082 — automatic tier assignment and slot closure, PURE and TOTAL (ADR-0032): the same
 * catalogue yields the same picks whatever order discovery returned it in. Invariants: an id containing
 * `mini` or `nano` is never the large pick; the medium pick is never the large pick; the small pick is
 * never one of the two; a tier with no match is left empty and the closure order of 082 fills it; a slot
 * still empty takes the single deterministic choice — the available model with the lowest qualified id.
 */
export interface AssignableModel {
  readonly qualifiedId: string;
  readonly id: string;
  readonly available: boolean;
}

export interface TierPicks { readonly large: string | null; readonly medium: string | null; readonly small: string | null }

export interface SlotPicks {
  readonly large_model: string | null;
  readonly medium_model: string | null;
  readonly small_model: string | null;
  readonly default_summary_model: string | null;
  readonly fallback_model: string | null;
  readonly picks: TierPicks;
}

/** REQ-PROVIDER-077's server-side suggestions (hosted provider only; kept as an input so the function stays total). */
export interface SlotSuggestions { readonly small?: string; readonly medium?: string; readonly large?: string; readonly fallback?: string }

const byId = (a: AssignableModel, b: AssignableModel) => (a.qualifiedId < b.qualifiedId ? -1 : a.qualifiedId > b.qualifiedId ? 1 : 0);

function pickTier(models: readonly AssignableModel[], prefs: TierPreferences, exclude: ReadonlySet<string>, forbid: (id: string) => boolean): string | null {
  const candidates = models.filter((m) => m.available && !exclude.has(m.qualifiedId) && !forbid(m.id.toLowerCase()));
  for (const list of [prefs.preferred, prefs.fallback]) {
    for (const fragment of list) {
      const hits = candidates.filter((m) => m.id.toLowerCase().includes(fragment)).sort(byId);
      if (hits.length > 0) return hits[0]!.qualifiedId;
    }
  }
  return null;
}

export function pickTiers(models: readonly AssignableModel[], prefs: Readonly<Record<Tier, TierPreferences>> = TIER_PREFERENCES): TierPicks {
  const large = pickTier(models, prefs.large, new Set(), (id) => id.includes('mini') || id.includes('nano'));
  const medium = pickTier(models, prefs.medium, new Set(large ? [large] : []), () => false);
  const small = pickTier(models, prefs.small, new Set([large, medium].filter((x): x is string => x !== null)), () => false);
  return { large, medium, small };
}

export function assignSlots(models: readonly AssignableModel[], suggestions: SlotSuggestions = {}, prefs: Readonly<Record<Tier, TierPreferences>> = TIER_PREFERENCES): SlotPicks {
  const picks = pickTiers(models, prefs);
  const available = models.filter((m) => m.available).sort(byId);
  const lowest = available[0]?.qualifiedId ?? null;
  const known = new Set(models.map((m) => m.qualifiedId));
  const suggest = (s: string | undefined) => (s !== undefined && known.has(s) ? s : null);
  const first = (...xs: (string | null)[]) => xs.find((x) => x !== null) ?? lowest;
  const large = suggest(suggestions.large) ?? first(picks.large, picks.medium, picks.small);
  const medium = suggest(suggestions.medium) ?? first(picks.medium, picks.small, picks.large);
  const small = suggest(suggestions.small) ?? first(picks.small, picks.medium, picks.large);
  const summary = first(picks.medium, picks.small, picks.large);
  const fallback = suggest(suggestions.fallback) ?? picks.small;
  return { large_model: large, medium_model: medium, small_model: small, default_summary_model: summary, fallback_model: fallback, picks };
}
