import { EDITABLE_SLOTS, type ConfigSnapshot, type DesktopSavePayload, type LiveStatePayload, type ModelSlotName } from '@rotaris/contracts';

/**
 * The pending settings state (REQ-CONFIG-279..287, 417..426): destination 1's values as the screen holds
 * them, the last-saved snapshot they are compared against, and the dirty flag that governs the FILE and
 * nothing else. Every setter is equality-guarded so a repopulation cannot dirty the form (REQ-CONFIG-335,
 * REQ-CONFIG-419); Discard restores the last saved values (REQ-CONFIG-285).
 */
export interface PendingSettings {
  readonly slots: Readonly<Record<ModelSlotName, string | null>>;
  readonly slotThinking: Readonly<Record<ModelSlotName, string | null>>;
  readonly runtime: {
    readonly max_depth: number;
    readonly max_active_children: number;
    readonly max_iterations: number;
    readonly allow_outside_workspace: boolean;
    readonly permission_mode: string;
    readonly improvement_collector_enabled: boolean;
    readonly keep_going: boolean;
    readonly run_start_mode: 'auto' | 'plan';
  };
  readonly circuitBreakerEnabled: boolean;
  readonly compressorThresholdPercentage: number;
  readonly delegationStrategy: 'orchestrator' | 'swarm' | 'single';
  /** Role edits keyed by role, per field scoped (REQ-CONFIG-259); an entry exists only once the user touched the role. */
  readonly roles: Readonly<Record<string, { readonly scope: 'workspace' | 'global'; readonly model?: string | null; readonly thinking?: string | null; readonly unsetModel?: boolean; readonly unsetThinking?: boolean }>>;
}

const SLOT_KEYS: readonly ModelSlotName[] = ['default_summary_model', 'improvement_collector_model', 'gatekeeper_model', 'small_model', 'medium_model', 'large_model', 'fallback_model'];

/** The pending state a snapshot populates: the file's values, so the form starts clean by definition (REQ-CONFIG-425). */
export function pendingFrom(snapshot: ConfigSnapshot): PendingSettings {
  const slots = {} as Record<ModelSlotName, string | null>;
  const thinking = {} as Record<ModelSlotName, string | null>;
  for (const slot of SLOT_KEYS) {
    const view = snapshot.slots.find((s) => s.slot === slot);
    slots[slot] = view?.value ?? null;
    thinking[slot] = view?.thinking ?? null;
  }
  return {
    slots, slotThinking: thinking,
    runtime: {
      max_depth: snapshot.runtime.max_depth, max_active_children: snapshot.runtime.max_active_children, max_iterations: snapshot.runtime.max_iterations,
      allow_outside_workspace: snapshot.runtime.allow_outside_workspace, permission_mode: snapshot.runtime.permission_mode,
      improvement_collector_enabled: snapshot.runtime.improvement_collector_enabled, keep_going: snapshot.runtime.keep_going, run_start_mode: snapshot.runtime.run_start_mode,
    },
    circuitBreakerEnabled: snapshot.circuitBreakerEnabled,
    compressorThresholdPercentage: snapshot.compressorThresholdPercentage,
    delegationStrategy: snapshot.delegationStrategy,
    roles: {},
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** REQ-CONFIG-280/335: dirty is a difference from the last saved values, never a setter call. */
export function isDirty(saved: PendingSettings, pending: PendingSettings): boolean {
  return !sameValue(saved, pending);
}

export type PendingChange =
  | { readonly kind: 'slot'; readonly slot: ModelSlotName; readonly value: string | null }
  | { readonly kind: 'slotThinking'; readonly slot: ModelSlotName; readonly value: string | null }
  | { readonly kind: 'runtime'; readonly key: keyof PendingSettings['runtime']; readonly value: PendingSettings['runtime'][keyof PendingSettings['runtime']] }
  | { readonly kind: 'circuitBreaker'; readonly value: boolean }
  | { readonly kind: 'compressorThreshold'; readonly value: number }
  | { readonly kind: 'delegationStrategy'; readonly value: PendingSettings['delegationStrategy'] }
  | { readonly kind: 'role'; readonly role: string; readonly scope: 'workspace' | 'global'; readonly model?: string | null; readonly thinking?: string | null; readonly unsetModel?: boolean; readonly unsetThinking?: boolean };

/** Apply one change; returns the same object when nothing changed (the equality guard). */
export function applyChange(pending: PendingSettings, change: PendingChange): PendingSettings {
  switch (change.kind) {
    case 'slot':
      if (pending.slots[change.slot] === change.value) return pending;
      return { ...pending, slots: { ...pending.slots, [change.slot]: change.value } };
    case 'slotThinking':
      if (pending.slotThinking[change.slot] === change.value) return pending;
      return { ...pending, slotThinking: { ...pending.slotThinking, [change.slot]: change.value } };
    case 'runtime':
      if (pending.runtime[change.key] === change.value) return pending;
      return { ...pending, runtime: { ...pending.runtime, [change.key]: change.value } };
    case 'circuitBreaker':
      return pending.circuitBreakerEnabled === change.value ? pending : { ...pending, circuitBreakerEnabled: change.value };
    case 'compressorThreshold':
      return pending.compressorThresholdPercentage === change.value ? pending : { ...pending, compressorThresholdPercentage: change.value };
    case 'delegationStrategy':
      return pending.delegationStrategy === change.value ? pending : { ...pending, delegationStrategy: change.value };
    case 'role': {
      const current = pending.roles[change.role] ?? { scope: change.scope };
      const next = { ...current, scope: change.scope, ...(change.model !== undefined ? { model: change.model, unsetModel: false } : {}), ...(change.thinking !== undefined ? { thinking: change.thinking, unsetThinking: false } : {}), ...(change.unsetModel ? { unsetModel: true } : {}), ...(change.unsetThinking ? { unsetThinking: true } : {}) };
      if (sameValue(current, next)) return pending;
      return { ...pending, roles: { ...pending.roles, [change.role]: next } };
    }
  }
}

/**
 * REQ-CONFIG-256: what a save writes — only the keys that differ from the last saved values; a slot only
 * when non-empty; a companion set to unset removes the key.
 */
export function savePayload(saved: PendingSettings, pending: PendingSettings): DesktopSavePayload {
  const out: { -readonly [K in keyof DesktopSavePayload]: DesktopSavePayload[K] } = {};
  const slots: Partial<Record<ModelSlotName, string | null>> = {};
  const thinking: Partial<Record<ModelSlotName, 'auto' | 'low' | 'medium' | 'high' | 'max' | null>> = {};
  for (const slot of EDITABLE_SLOTS) {
    if (pending.slots[slot] !== saved.slots[slot] && pending.slots[slot] !== null && pending.slots[slot] !== '') slots[slot] = pending.slots[slot];
    if (pending.slotThinking[slot] !== saved.slotThinking[slot]) thinking[slot] = (pending.slotThinking[slot] ?? null) as 'auto' | 'low' | 'medium' | 'high' | 'max' | null;
  }
  if (Object.keys(slots).length > 0) out.slots = slots;
  if (Object.keys(thinking).length > 0) out.slotThinking = thinking;
  const runtime: Record<string, unknown> = {};
  for (const key of Object.keys(pending.runtime) as (keyof PendingSettings['runtime'])[]) if (pending.runtime[key] !== saved.runtime[key]) runtime[key] = pending.runtime[key];
  if (Object.keys(runtime).length > 0) out.runtime = runtime;
  if (pending.circuitBreakerEnabled !== saved.circuitBreakerEnabled) out.circuitBreakerEnabled = pending.circuitBreakerEnabled;
  if (pending.compressorThresholdPercentage !== saved.compressorThresholdPercentage) out.compressorThresholdPercentage = pending.compressorThresholdPercentage;
  if (pending.delegationStrategy !== saved.delegationStrategy) out.delegationStrategy = pending.delegationStrategy;
  if (Object.keys(pending.roles).length > 0) {
    out.roles = Object.fromEntries(Object.entries(pending.roles).map(([role, e]) => [role, {
      scope: e.scope,
      ...(e.model !== undefined && !e.unsetModel ? { model: e.model } : {}),
      ...(e.thinking !== undefined && !e.unsetThinking ? { thinking: e.thinking as 'default' } : {}),
      ...(e.unsetModel ? { unsetModel: true } : {}),
      ...(e.unsetThinking ? { unsetThinking: true } : {}),
    }]));
  }
  return out;
}

/** ADR-0037 Tier B: the live state a run start reads — the screen's current values, saved or not (REQ-CONFIG-262). */
export function liveStateOf(pending: PendingSettings): LiveStatePayload {
  const slots: Partial<Record<ModelSlotName, string | null>> = {};
  for (const slot of EDITABLE_SLOTS) if (pending.slots[slot] !== null && pending.slots[slot] !== '') slots[slot] = pending.slots[slot];
  return {
    slots,
    runtime: { ...pending.runtime },
    circuitBreakerEnabled: pending.circuitBreakerEnabled,
    compressorThresholdPercentage: pending.compressorThresholdPercentage,
    delegationStrategy: pending.delegationStrategy,
  };
}

/** REQ-CONFIG-446: a stored value outside the offered range is shown clamped to the nearest stop, never rewritten. */
export function clampForDisplay(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
