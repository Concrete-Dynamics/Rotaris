/**
 * The top-level key table of `agents.yaml` by merge class (REQ-CONFIG-040..050; the "Primary configuration
 * document" table). A key in none of the four classes contributes nothing to the merge and is neither
 * rejected nor silently lost: the loader warns naming it and the file, and every writer leaves it in place
 * (REQ-CONFIG-040, REQ-CONFIG-233, REQ-CONFIG-477 ground 1).
 */
export const MODEL_SLOTS = ['default_summary_model', 'improvement_collector_model', 'retrospective_model', 'gatekeeper_model', 'small_model', 'medium_model', 'large_model', 'fallback_model'] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

/** REQ-CONFIG-070: exactly the three tier aliases. */
export const TIER_ALIASES = ['small_model', 'medium_model', 'large_model'] as const;
export type TierAlias = (typeof TIER_ALIASES)[number];
export function isTierAlias(name: string): name is TierAlias {
  return (TIER_ALIASES as readonly string[]).includes(name);
}

export const thinkingKeyOf = (slot: ModelSlot): `${ModelSlot}_thinking` => `${slot}_thinking`;

export const REPLACE_KEYS = [
  'default_persona',
  ...MODEL_SLOTS,
  ...MODEL_SLOTS.map(thinkingKeyOf),
  'worktree_storage_subpath',
  'inject_agents_md',
] as const;
export const NAMED_ENTRY_KEYS = ['personas', 'models', 'mcp_servers', 'unavailable_models'] as const;
export const SECTION_KEYS = ['runtime', 'verifier', 'compressor', 'circuit_breaker', 'transcript', 'display', 'initialization', 'project_init', 'requirements', 'skills', 'hooks', 'checkpoints', 'integration'] as const;
export const COMPUTED_KEYS = ['workspace_root', 'metadata_workspace_root', 'mcp_server_sources', 'resolved_persona_model_tiers'] as const;
/** Outside the layered model: read by a separate lookup over the same document, never merged (REQ-CONFIG-477 ground 1). */
export const SEPARATE_KEYS = ['rotaris'] as const;

export type KeyClass = 'replace' | 'named' | 'section' | 'computed' | 'separate' | 'unknown';

export function keyClass(key: string): KeyClass {
  if ((REPLACE_KEYS as readonly string[]).includes(key)) return 'replace';
  if ((NAMED_ENTRY_KEYS as readonly string[]).includes(key)) return 'named';
  if ((SECTION_KEYS as readonly string[]).includes(key)) return 'section';
  if ((COMPUTED_KEYS as readonly string[]).includes(key)) return 'computed';
  if ((SEPARATE_KEYS as readonly string[]).includes(key)) return 'separate';
  return 'unknown';
}

/** REQ-CONFIG-069: the reasoning-level vocabulary for slots and models; the per-role vocabulary adds two (REQ-CONFIG-079). */
export const REASONING_LEVELS = ['auto', 'low', 'medium', 'high', 'max'] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];
export const ROLE_REASONING_LEVELS = ['default', 'provider_default', ...REASONING_LEVELS] as const;
export type RoleReasoning = (typeof ROLE_REASONING_LEVELS)[number];

/** REQ-CONFIG-081: loader-owned synthetic entry prefixes; a user-authored entry under either is overwritten. */
export const STARTUP_SLOT_PREFIX = '__startup_slot__:' as const;
export const PERSONA_SYNTHETIC_PREFIX = '__persona__:' as const;
