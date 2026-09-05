/**
 * REQ-PROVIDER-081 — the ordered preference per tier over model-family name fragments, and the secondary
 * fallback list consulted when no preferred fragment matches. BUILD DATA: the lists are not normative;
 * the invariants and the tie-break in `slots.ts` are. Matching is case-insensitive against the model id.
 */
export interface TierPreferences {
  readonly preferred: readonly string[];
  readonly fallback: readonly string[];
}
export type Tier = 'large' | 'medium' | 'small';

export const TIER_PREFERENCES: Readonly<Record<Tier, TierPreferences>> = Object.freeze({
  large: {
    preferred: ['opus', 'gpt-5', 'gpt-4.1', 'sonnet', 'gpt-4o', 'deepseek-reasoner', 'o3'],
    fallback: ['claude', 'gpt', 'deepseek', 'gemini', 'llama', 'mistral', 'qwen'],
  },
  medium: {
    preferred: ['sonnet', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini', 'o4-mini', 'deepseek-chat', 'gemini-2.5-pro'],
    fallback: ['claude', 'gpt', 'deepseek', 'gemini', 'llama', 'mistral', 'qwen'],
  },
  small: {
    preferred: ['haiku', 'gpt-5-nano', 'gpt-4.1-nano', 'gpt-4o-mini', 'flash', 'deepseek-chat', 'mini'],
    fallback: ['claude', 'gpt', 'deepseek', 'gemini', 'llama', 'mistral', 'qwen'],
  },
});

/** The shape test: non-empty lists of non-empty lower-case fragments. */
export function validateTierPreferences(prefs: Readonly<Record<Tier, TierPreferences>> = TIER_PREFERENCES): string[] {
  const problems: string[] = [];
  for (const tier of ['large', 'medium', 'small'] as const) {
    const p = prefs[tier];
    if (p.preferred.length === 0) problems.push(`${tier}: no preferred fragments`);
    for (const f of [...p.preferred, ...p.fallback]) if (f.length === 0 || f !== f.toLowerCase()) problems.push(`${tier}: fragment '${f}' must be non-empty and lower-case`);
  }
  return problems;
}
