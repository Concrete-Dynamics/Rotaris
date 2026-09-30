import { INTENT_CATEGORIES, isIntentCategory, type IntentCategory, type IntentGrant } from '@rotaris/contracts';
import type { IntentMappingRead } from '@rotaris/config';

/**
 * REQ-ORCH-016/017/018: the intent-to-tools gate for the entry role. Exactly the two simplest intents
 * grant the direct-work bundle; every other intent applies no mapping entry and the configured
 * coordination-only restrictions stay in force. A `single` override grants the bundle whatever the
 * intent (REQ-ORCH-025); `swarm` is not an input. The bundle itself is resolved by capability against
 * the registry's declarations at the run-host root (agent-tools' `directWorkBundle`), not here.
 *
 * Reading recorded for REQ-ORCH-017's "no tool restriction being applied": a mapping that cannot be used
 * — unknown intent key, malformed value, unreadable file — is a mapping with no usable entry, so nothing
 * is granted and the role's configured restrictions stand exactly as they would for an intent the mapping
 * does not name. The failure never widens what the role may do.
 */
export const BUILT_IN_INTENT_MAPPING: Readonly<Record<IntentCategory, IntentGrant>> = Object.freeze({
  explicit_trivial: 'direct-work', single_file_change: 'direct-work',
  question: 'none', exploration: 'none', problem_resolution: 'none', small_feature: 'none', moderate_feature: 'none', large_feature: 'none',
  refactor: 'none', architectural: 'none', requirements: 'none', whole_project: 'none', ambiguous: 'none',
});

export interface ResolvedIntentMapping {
  readonly mapping: Readonly<Record<IntentCategory, IntentGrant>>;
  readonly source: 'built-in' | 'file';
  readonly warning: string;
}

/** The mapping in force: the file's over the built-in when it is whole; otherwise the built-in with a warning (fail safe). */
export function resolveIntentMapping(read: IntentMappingRead): ResolvedIntentMapping {
  if (read.kind === 'absent') return { mapping: BUILT_IN_INTENT_MAPPING, source: 'built-in', warning: '' };
  if (read.kind === 'invalid') return { mapping: BUILT_IN_INTENT_MAPPING, source: 'built-in', warning: `the intent-to-tools mapping was not applied: ${read.reason} (REQ-ORCH-017)` };
  const unknown = Object.keys(read.mapping).filter((k) => !isIntentCategory(k));
  if (unknown.length > 0) return { mapping: BUILT_IN_INTENT_MAPPING, source: 'built-in', warning: `the intent-to-tools mapping was not applied: unknown intent ${unknown.length === 1 ? 'key' : 'keys'} ${unknown.map((k) => `'${k}'`).join(', ')}; expected one of ${INTENT_CATEGORIES.join(', ')} (REQ-ORCH-017)` };
  const mapping = { ...BUILT_IN_INTENT_MAPPING } as Record<IntentCategory, IntentGrant>;
  for (const [k, v] of Object.entries(read.mapping)) mapping[k as IntentCategory] = v;
  return { mapping, source: 'file', warning: '' };
}

export function intentGrant(intent: IntentCategory, override: 'single' | 'swarm' | null, mapping: Readonly<Record<IntentCategory, IntentGrant>>): IntentGrant {
  if (override === 'single') return 'direct-work';
  return mapping[intent] ?? 'none';
}
