import { displayCapToFile, EDITABLE_SLOTS, type ConfigSnapshot, type DesktopSavePayload, type DisplaySavePayload, type DisplayView, type LiveStatePayload, type ModelSlotName, type SkillInvocationModeName, type SkillLoadModeName, type SkillsSavePayload } from '@rotaris/contracts';

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
  /**
   * REQ-CONFIG-472: the Display category's four tool-row fields — workspace configuration, committed by Save
   * like the rest of destination 1, and read from here by the transcript the moment a control moves, so what is
   * drawn follows the pending value while Save decides what the file says.
   */
  readonly display: DisplayView;
  /**
   * REQ-CONFIG-166..169 (ADR-0063): the `skills:` section as the screen holds it — the master switch and both
   * override maps, keyed by REQ-WORKSPACE-054's normalized skill name. The maps hold only skills SOME layer
   * states a policy for, which is what makes REQ-CONFIG-258's sparse write computable: a name present in
   * `saved` and absent from a higher layer is the case where a baseline must be written out explicitly.
   */
  readonly skills: {
    readonly enabled: boolean;
    readonly overrides: Readonly<Record<string, SkillLoadModeName>>;
    readonly invocationOverrides: Readonly<Record<string, SkillInvocationModeName>>;
  };
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
    display: { ...snapshot.display },
    skills: { enabled: snapshot.skills.enabled, overrides: { ...snapshot.skills.overrides }, invocationOverrides: { ...snapshot.skills.invocation_overrides } },
    roles: {},
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * REQ-CONFIG-419/423: a reload caused elsewhere (a sign-in's snapshot, the composer's write) repopulates every field the
 * user has NOT changed and keeps every field they have — field by field against the previous saved values, so a stale
 * pending copy never masks the file's new values. The slice's first execution found the whole pending state kept.
 */
export function rebasePending(previousSaved: PendingSettings, pending: PendingSettings, fresh: PendingSettings): PendingSettings {
  const slots = {} as Record<ModelSlotName, string | null>;
  const thinking = {} as Record<ModelSlotName, string | null>;
  for (const slot of SLOT_KEYS) {
    slots[slot] = pending.slots[slot] !== previousSaved.slots[slot] ? pending.slots[slot] : fresh.slots[slot];
    thinking[slot] = pending.slotThinking[slot] !== previousSaved.slotThinking[slot] ? pending.slotThinking[slot] : fresh.slotThinking[slot];
  }
  const runtime = { ...fresh.runtime };
  for (const key of Object.keys(runtime) as (keyof PendingSettings['runtime'])[]) if (pending.runtime[key] !== previousSaved.runtime[key]) (runtime as Record<string, unknown>)[key] = pending.runtime[key];
  const display = { ...fresh.display };
  for (const key of Object.keys(display) as (keyof DisplayView)[]) if (pending.display[key] !== previousSaved.display[key]) (display as Record<string, unknown>)[key] = pending.display[key];
  // ADR-0063: the skills block rebases as a whole rather than per key. A per-key rebase would need a third
  // state per skill ("the user removed an override"), which nothing produces: the screen only ever sets a
  // mode, and the sparse write below is what turns a baseline choice into a removal.
  return {
    slots, slotThinking: thinking, runtime, display,
    skills: sameValue(pending.skills, previousSaved.skills) ? fresh.skills : pending.skills,
    circuitBreakerEnabled: pending.circuitBreakerEnabled !== previousSaved.circuitBreakerEnabled ? pending.circuitBreakerEnabled : fresh.circuitBreakerEnabled,
    compressorThresholdPercentage: pending.compressorThresholdPercentage !== previousSaved.compressorThresholdPercentage ? pending.compressorThresholdPercentage : fresh.compressorThresholdPercentage,
    delegationStrategy: pending.delegationStrategy !== previousSaved.delegationStrategy ? pending.delegationStrategy : fresh.delegationStrategy,
    roles: pending.roles,
  };
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
  | { readonly kind: 'display'; readonly key: keyof DisplayView; readonly value: DisplayView[keyof DisplayView] }
  | { readonly kind: 'skillsEnabled'; readonly value: boolean }
  | { readonly kind: 'skillLoad'; readonly name: string; readonly value: SkillLoadModeName }
  | { readonly kind: 'skillInvocation'; readonly name: string; readonly value: SkillInvocationModeName }
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
    case 'display':
      // REQ-CONFIG-419: repopulating a control from the stored value emits no change and cannot dirty the form.
      return pending.display[change.key] === change.value ? pending : { ...pending, display: { ...pending.display, [change.key]: change.value } };
    // ADR-0063 — REQ-WORKSPACE-068: a policy change marks settings dirty and is written by Save. The setters do
    // not validate the value: `SkillLoadModeName` is a closed type, and the run host and the writer both reject an
    // unsupported one with REQ-WORKSPACE-068's own sentences, so a bad value cannot reach a file through here.
    case 'skillsEnabled':
      return pending.skills.enabled === change.value ? pending : { ...pending, skills: { ...pending.skills, enabled: change.value } };
    case 'skillLoad':
      return pending.skills.overrides[change.name] === change.value ? pending : { ...pending, skills: { ...pending.skills, overrides: { ...pending.skills.overrides, [change.name]: change.value } } };
    case 'skillInvocation':
      return pending.skills.invocationOverrides[change.name] === change.value ? pending : { ...pending, skills: { ...pending.skills, invocationOverrides: { ...pending.skills.invocationOverrides, [change.name]: change.value } } };
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
  // REQ-CONFIG-256/472: written per field and under the file's own key names, with unlimited stored as 0 (REQ-CONFIG-172).
  const display: DisplaySavePayload = {};
  if (pending.display.show_tool_results !== saved.display.show_tool_results) display.show_tool_results = pending.display.show_tool_results;
  if (pending.display.show_tool_inputs !== saved.display.show_tool_inputs) display.show_tool_inputs = pending.display.show_tool_inputs;
  if (pending.display.tool_result_lines !== saved.display.tool_result_lines) display.tool_result_max_lines = displayCapToFile(pending.display.tool_result_lines);
  if (pending.display.tool_input_lines !== saved.display.tool_input_lines) display.tool_input_max_lines = displayCapToFile(pending.display.tool_input_lines);
  if (Object.keys(display).length > 0) out.display = display;
  /*
   * REQ-CONFIG-256/258 (ADR-0063): the three `skills` keys, written SPARSELY. Only a mode differing from the
   * baseline lands in a map — EXCEPT where a lower layer states a policy for that skill, in which case the
   * baseline is written out explicitly so the choice the user made in the higher scope is what the merge
   * produces. Omitting it there would silently leave the lower layer's override winning and make returning one
   * skill to the baseline impossible from this screen.
   *
   * `saved` holding a key is exactly "a lower layer states a policy", because the snapshot's maps are the
   * MERGED result: a name present there came from some file. `null` is the writer's delete.
   */
  const skills: SkillsSavePayload = {};
  if (pending.skills.enabled !== saved.skills.enabled) skills.enabled = pending.skills.enabled;
  const overrides: Record<string, SkillLoadModeName | null> = {};
  for (const [name, mode] of Object.entries(pending.skills.overrides)) {
    if (mode === saved.skills.overrides[name]) continue;
    overrides[name] = mode === 'name-only' && saved.skills.overrides[name] === undefined ? null : mode;
  }
  // A skill the file stated and the screen no longer holds: its key is removed.
  for (const name of Object.keys(saved.skills.overrides)) if (pending.skills.overrides[name] === undefined) overrides[name] = null;
  const invocation: Record<string, SkillInvocationModeName | null> = {};
  for (const [name, mode] of Object.entries(pending.skills.invocationOverrides)) {
    if (mode === saved.skills.invocationOverrides[name]) continue;
    invocation[name] = mode === 'default' && saved.skills.invocationOverrides[name] === undefined ? null : mode;
  }
  for (const name of Object.keys(saved.skills.invocationOverrides)) if (pending.skills.invocationOverrides[name] === undefined) invocation[name] = null;
  if (Object.keys(overrides).length > 0) skills.overrides = overrides;
  if (Object.keys(invocation).length > 0) skills.invocationOverrides = invocation;
  if (Object.keys(skills).length > 0) out.skills = skills;
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
