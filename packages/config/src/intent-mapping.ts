import { guardedRead } from '@rotaris/platform';
import { INTENT_GRANTS, type IntentGrant } from '@rotaris/contracts';
import { parseConfig, plainOf, typeNameOf } from './document.js';

/**
 * REQ-ORCH-016/017: the user-inspectable intent-to-tools mapping. Decision 5 of the plan: the built-in
 * mapping is data in the engine, and `<config>/intent-tools.yaml` may override it as a mapping of intent
 * identifier to `direct-work` or `none`. Anything else — an unreadable file, a non-mapping, a value that
 * is not one of the two (an obsolete instruction-text entry included) — is reported so the engine can
 * fail safe with a warning. Unknown intent keys are the engine's to reject against the taxonomy.
 */
export type IntentMappingRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'value'; readonly mapping: Readonly<Record<string, IntentGrant>> }
  | { readonly kind: 'invalid'; readonly reason: string };

export function readIntentMapping(path: string): IntentMappingRead {
  const r = guardedRead(path, (raw) => raw);
  if (r.state === 'absent') return { kind: 'absent' };
  if (r.state === 'unreadable') return { kind: 'invalid', reason: `the mapping file could not be read: ${r.reason}` };
  const parsed = parseConfig(r.value);
  if (!parsed.ok) return { kind: 'invalid', reason: `the mapping file is not valid YAML: ${parsed.error.reason}` };
  const root = parsed.value.root;
  if (root === null) return parsed.value.topLevelType === 'null' ? { kind: 'value', mapping: {} } : { kind: 'invalid', reason: `the mapping must be a mapping of intent to grant, got ${parsed.value.topLevelType}` };
  const mapping: Record<string, IntentGrant> = {};
  for (const pair of root.items) {
    const key = String(plainOf(pair.key as never) ?? '');
    const value = plainOf(pair.value as never);
    if (typeof value !== 'string' || !(INTENT_GRANTS as readonly string[]).includes(value)) {
      return { kind: 'invalid', reason: `intent '${key}' maps to ${typeof value === 'string' ? `'${value.slice(0, 60)}'` : typeNameOf(pair.value)}; expected one of: ${INTENT_GRANTS.join(', ')} (instruction text is not accepted)` };
    }
    mapping[key] = value as IntentGrant;
  }
  return { kind: 'value', mapping };
}
