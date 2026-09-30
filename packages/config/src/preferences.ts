import { isPlainMap, type PlainMap } from './merge.js';
import { MODEL_SLOTS, PERSONA_SYNTHETIC_PREFIX, STARTUP_SLOT_PREFIX, thinkingKeyOf, type ModelSlot } from './keys.js';
import type { LoadedConfiguration } from './load.js';
import { BUILT_IN_ROLE_TIERS } from './defaults.js';
import { syntheticOriginOf } from './slots.js';

/**
 * What an editor reads back (REQ-CONFIG-253..255): a slot from the RAW file first — a raw string naming
 * another slot followed recursively with cycle detection, a concrete name returned as-is, anything else
 * from the resolved configuration with synthetic names unwrapped — and a role's preference record with
 * its origin, so a surface can show "inherited" and offer "back to default".
 */
export type Origin = 'workspace' | 'global' | 'discovered' | 'built-in';

export interface SlotPreference {
  readonly slot: ModelSlot;
  /** The value an editor shows: raw when the file states one, resolved (unwrapped) otherwise; null when nothing resolves. */
  readonly value: string | null;
  readonly origin: Origin;
  /** REQ-CONFIG-254: the raw reasoning level, `auto` kept apart from unset. */
  readonly thinking: string | null;
}

/**
 * A written null overrides nothing (REQ-CONFIG-041) and is read here as unstated, so the editor shows the value the
 * lower layer supplies rather than an empty field — the starter file's twelve nulls (REQ-CONFIG-025) made every slot
 * read as the workspace's with no value on the slice's first execution. A non-string, non-null value stays null.
 */
function rawSlot(raw: PlainMap | null, slot: string): string | null | undefined {
  if (!raw) return undefined;
  const v = raw[slot];
  return v === undefined || v === null ? undefined : typeof v === 'string' ? v : null;
}

/** REQ-CONFIG-253: follow slot names through the raw file; a cycle yields no value. */
export function followRawSlot(raw: PlainMap | null, slot: string): string | null | undefined {
  const seen = new Set<string>();
  let current: string | null | undefined = rawSlot(raw, slot);
  while (typeof current === 'string' && (MODEL_SLOTS as readonly string[]).includes(current)) {
    if (seen.has(current)) return null;
    seen.add(current);
    current = rawSlot(raw, current);
  }
  return current;
}

export function slotPreferences(config: LoadedConfiguration): readonly SlotPreference[] {
  const ws = config.raw.workspace.agents;
  const g = config.raw.global.agents;
  return MODEL_SLOTS.map((slot) => {
    const fromWorkspace = followRawSlot(ws, slot);
    const fromGlobal = fromWorkspace === undefined ? followRawSlot(g, slot) : undefined;
    const thinkingKey = thinkingKeyOf(slot);
    const thinkingRaw = ws && typeof ws[thinkingKey] === 'string' ? (ws[thinkingKey] as string) : g && typeof g[thinkingKey] === 'string' ? (g[thinkingKey] as string) : null;
    // A raw value the file states — a concrete name, or null because the chain is a cycle or written null — is the file's.
    if (fromWorkspace !== undefined) return { slot, value: fromWorkspace, origin: 'workspace', thinking: thinkingRaw };
    if (fromGlobal !== undefined) return { slot, value: fromGlobal, origin: 'global', thinking: thinkingRaw };
    const resolved = config.slots[slot];
    // REQ-CONFIG-341: a value the snapshot layer supplied is `discovered`.
    const origin: Origin = resolved !== null && config.discoveredSlots[slot] === resolved ? 'discovered' : 'built-in';
    // REQ-CONFIG-253: a synthetic copy unwraps to the `models:` key the loader recorded it was copied from — never to another
    // key that happens to name the same provider model (REQ-CONFIG-094: two keys are two entries).
    return { slot, value: resolved === null ? null : syntheticOriginOf(resolved, config.syntheticOrigins), origin, thinking: thinkingRaw };
  });
}

export interface RolePreference {
  readonly role: string;
  /** Absent when the role is not overridden in either file. */
  readonly rawModel: string | null;
  readonly modelOrigin: Origin;
  /** REQ-CONFIG-255: a role-level synthetic unwrapped, a slot-level synthetic left wrapped. */
  readonly effectiveModel: string;
  readonly inherited: boolean;
  /** The built-in default (a tier) so a surface can offer "back to default"; null for a role the files defined. */
  readonly builtInDefault: string | null;
  readonly rawThinking: string | null;
  readonly thinkingOrigin: Origin;
  /** REQ-CONFIG-071: the tier the role referenced before substitution, if any. */
  readonly tier: string | null;
  readonly tools: readonly string[];
}

function rawRoleField(raw: PlainMap | null, role: string, field: string): string | null | undefined {
  const personas = raw?.['personas'];
  if (!isPlainMap(personas)) return undefined;
  const entry = personas[role];
  if (!isPlainMap(entry) || !Object.prototype.hasOwnProperty.call(entry, field)) return undefined;
  const v = entry[field];
  return typeof v === 'string' ? v : null;
}

export function rolePreferences(config: LoadedConfiguration): readonly RolePreference[] {
  const ws = config.raw.workspace.agents;
  const g = config.raw.global.agents;
  return Object.entries(config.personas).map(([role, persona]) => {
    const wsModel = rawRoleField(ws, role, 'model');
    const gModel = wsModel === undefined ? rawRoleField(g, role, 'model') : undefined;
    const wsThinking = rawRoleField(ws, role, 'thinking');
    const gThinking = wsThinking === undefined ? rawRoleField(g, role, 'thinking') : undefined;
    // REQ-CONFIG-255: the role-level synthetic unwrapped to the key it was copied from, as the slot read-back does.
    const effective = persona.model.startsWith(PERSONA_SYNTHETIC_PREFIX) ? syntheticOriginOf(persona.model, config.syntheticOrigins) : persona.model;
    const builtIn = (BUILT_IN_ROLE_TIERS as Readonly<Record<string, string>>)[role] ?? null;
    return {
      role,
      rawModel: wsModel !== undefined ? wsModel : gModel !== undefined ? gModel : null,
      modelOrigin: wsModel !== undefined ? 'workspace' : gModel !== undefined ? 'global' : 'built-in',
      effectiveModel: effective.startsWith(STARTUP_SLOT_PREFIX) ? effective : effective,
      inherited: wsModel === undefined && gModel === undefined,
      builtInDefault: builtIn,
      rawThinking: wsThinking !== undefined ? wsThinking : gThinking !== undefined ? gThinking : null,
      thinkingOrigin: wsThinking !== undefined ? 'workspace' : gThinking !== undefined ? 'global' : 'built-in',
      tier: config.resolvedPersonaModelTiers[role] ?? null,
      tools: persona.tools,
    };
  });
}
