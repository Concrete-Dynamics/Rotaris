import { isTierAlias, MODEL_SLOTS, PERSONA_SYNTHETIC_PREFIX, STARTUP_SLOT_PREFIX, TIER_ALIASES, type ModelSlot, type ReasoningLevel, type TierAlias } from './keys.js';
import type { ModelEntry } from './sections/models.js';
import type { PersonaEntry } from './sections/personas.js';

/**
 * Tier-alias substitution and reasoning synthesis (REQ-CONFIG-063..081), as PURE transforms over the
 * typed draft — ADR-0036 exports them because REQ-CONFIG-263 runs them at run start over live state with
 * no file involved (ADR-0037 Tier B). Every failure is a warning, never a load failure (REQ-CONFIG-078/080).
 */
export interface SlotDraft {
  slots: Record<ModelSlot, string | null>;
  slotThinking: Record<ModelSlot, ReasoningLevel | null>;
  models: Record<string, ModelEntry>;
  personas: Record<string, PersonaEntry>;
  compressorModel: string;
  circuitBreakerModel: string;
}

export interface SlotResolution {
  /** REQ-CONFIG-071: which roles referenced a tier before substitution. */
  readonly resolvedPersonaModelTiers: Readonly<Record<string, TierAlias>>;
  readonly warnings: readonly string[];
}

/** REQ-CONFIG-074: an alias registers only when the slot's own value is not itself an alias name. */
export function registeredAliases(slots: Readonly<Record<ModelSlot, string | null>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const tier of TIER_ALIASES) {
    const value = slots[tier];
    if (typeof value === 'string' && value !== '' && !isTierAlias(value)) out[tier] = value;
  }
  return out;
}

/** REQ-CONFIG-077: follow slot-to-slot chains to the concrete base name; a cycle or a dead end is null with the chain. */
export function resolveSlotBase(slots: Readonly<Record<ModelSlot, string | null>>, slot: ModelSlot): { base: string | null; chain: readonly string[]; cycle: boolean } {
  const chain: string[] = [slot];
  let current: string | null = slots[slot];
  const seen = new Set<string>([slot]);
  while (current !== null && (MODEL_SLOTS as readonly string[]).includes(current)) {
    if (seen.has(current)) return { base: null, chain: [...chain, current], cycle: true };
    seen.add(current);
    chain.push(current);
    current = slots[current as ModelSlot];
  }
  return { base: current, chain, cycle: false };
}

export function resolveSlotsAndReasoning(draft: SlotDraft): SlotResolution {
  const warnings: string[] = [];
  // REQ-CONFIG-067: an unset fallback resolves to whatever small_model resolves to, before referential validation.
  if (draft.slots.fallback_model === null || draft.slots.fallback_model === '') draft.slots.fallback_model = draft.slots.small_model;

  const aliases = registeredAliases(draft.slots);
  const substitute = (value: string | null): string | null => (value !== null && aliases[value] !== undefined ? aliases[value]! : value);

  // REQ-CONFIG-075/071: the original tier recorded before a role's model is substituted.
  const tiers: Record<string, TierAlias> = {};
  for (const [role, persona] of Object.entries(draft.personas)) if (isTierAlias(persona.model)) tiers[role] = persona.model;

  // REQ-CONFIG-073: every reference field; the literal alias survives where no substitution is registered.
  for (const slot of ['default_summary_model', 'improvement_collector_model', 'retrospective_model', 'gatekeeper_model', 'fallback_model'] as const) draft.slots[slot] = substitute(draft.slots[slot]);
  for (const [role, persona] of Object.entries(draft.personas)) {
    draft.personas[role] = { ...persona, model: substitute(persona.model) ?? persona.model, summary_model: substitute(persona.summary_model), fallback_model: substitute(persona.fallback_model) };
  }
  draft.compressorModel = substitute(draft.compressorModel) ?? draft.compressorModel;
  draft.circuitBreakerModel = substitute(draft.circuitBreakerModel) ?? draft.circuitBreakerModel;

  // REQ-CONFIG-076..078: slot reasoning synthesis under the reserved names, warnings only.
  for (const slot of MODEL_SLOTS) {
    const level = draft.slotThinking[slot];
    if (level === null) continue;
    const resolved = resolveSlotBase(draft.slots, slot);
    if (resolved.cycle) { warnings.push(`${slot}_thinking skipped: the slot alias chain is circular (${resolved.chain.join(' → ')})`); continue; }
    if (resolved.base === null) { warnings.push(`${slot}_thinking skipped: ${slot} resolves to no model`); continue; }
    const base = draft.models[resolved.base];
    if (!base) { warnings.push(`${slot}_thinking skipped: ${slot} names '${resolved.base}', which is not a configured model`); continue; }
    const name = `${STARTUP_SLOT_PREFIX}${slot}`;
    draft.models[name] = { ...base, thinking: level };
    draft.slots[slot] = name;
  }

  // REQ-CONFIG-079/080: per-role synthesis after substitution (REQ-CONFIG-036).
  for (const [role, persona] of Object.entries(draft.personas)) {
    const thinking = persona.thinking;
    if (thinking === null || thinking === 'default') { if (thinking === 'default') draft.personas[role] = { ...persona, thinking: null }; continue; }
    const base = draft.models[persona.model];
    if (!base) { warnings.push(`thinking for role ${role} skipped: '${persona.model}' is not a configured model`); continue; }
    const name = `${PERSONA_SYNTHETIC_PREFIX}${role}`;
    draft.models[name] = thinking === 'provider_default' ? { ...base, thinking: null, reasoning_effort: null } : { ...base, thinking };
    draft.personas[role] = { ...persona, model: name };
  }

  return { resolvedPersonaModelTiers: tiers, warnings };
}

/** REQ-CONFIG-253/255: a synthetic name unwrapped to the model it was copied from. */
export function unwrapSynthetic(name: string, models: Readonly<Record<string, ModelEntry>>): string {
  if (!name.startsWith(STARTUP_SLOT_PREFIX) && !name.startsWith(PERSONA_SYNTHETIC_PREFIX)) return name;
  const entry = models[name];
  if (!entry) return name;
  for (const [candidate, other] of Object.entries(models)) {
    if (candidate === name || candidate.startsWith(STARTUP_SLOT_PREFIX) || candidate.startsWith(PERSONA_SYNTHETIC_PREFIX)) continue;
    if (other.provider === entry.provider && other.model_id === entry.model_id) return candidate;
  }
  return name;
}
