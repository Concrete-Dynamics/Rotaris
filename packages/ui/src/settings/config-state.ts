import { displayCapToFile, EDITABLE_SLOTS, type ConfigSnapshot, type DesktopSavePayload, type DisplaySavePayload, type DisplayView, type InstructionStateName, type LiveStatePayload, type ModelSlotName, type SkillInvocationModeName, type SkillLoadModeName, type SkillsSavePayload } from '@rotaris/contracts';

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
    /**
     * PD-CONFIG-003 / REQ-MONITOR-286: the per-agent timeout, in SECONDS as `runtime.child_timeout` stores it (REQ-CONFIG-113);
     * the control shows and takes whole minutes (`timeoutMinutesForDisplay`, `timeoutSecondsFromInput`).
     */
    readonly child_timeout: number;
    readonly max_iterations: number;
    readonly allow_outside_workspace: boolean;
    readonly permission_mode: string;
    readonly improvement_collector_enabled: boolean;
    /**
     * PD-CONFIG-003 revision 2: the improvement analysis timeout, in seconds as `runtime.improvement_collector_timeout` stores
     * it (REQ-CONFIG-118); the control clamps it to 10–600 (`improvementTimeoutForDisplay`, `improvementTimeoutFromInput`).
     */
    readonly improvement_collector_timeout: number;
    readonly keep_going: boolean;
    readonly run_start_mode: 'auto' | 'plan';
    /**
     * REQ-SANDBOX-113 (Part AR): the six sandbox and egress settings the runtime section edits, so
     * that no YAML has to be edited by hand. They defer to Save like every other runtime key, which
     * is REQ-SANDBOX-118's rule made structural: unsaved edits reach NOTHING, and a run started while
     * they are unsaved uses the configuration persisted on disk.
     */
    readonly sandbox_mode: string;
    readonly sandbox_writable_roots: readonly string[];
    readonly sandbox_allow_network: boolean;
    readonly network_egress_policy: string;
    readonly network_allowed_hosts: readonly string[];
    readonly network_denied_hosts: readonly string[];
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
  /**
   * PD-WORKSPACE-002: the `instructions:` section as the screen holds it — the per-file override map
   * keyed by stable file identity. Absent means `on`, which is what makes the sparse write computable:
   * a name present in `saved` and absent from a higher layer is the case where a baseline must be
   * written out explicitly.
   */
  readonly instructions: {
    readonly overrides: Readonly<Record<string, InstructionStateName>>;
  };
  /**
   * Role edits keyed by role and then by the scope each was made at (REQ-CONFIG-259: "Role edits carry a per-field scope";
   * REQ-CONFIG-341: an Unset records "a pending unset of (role, field, scope)"); an entry exists only once the user touched
   * the role. An edit of one field at one scope never moves or replaces an edit made at the other, so a model Unset at
   * Workspace survives a model picked at Global, and both reach the save (defect note
   * `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md`).
   */
  readonly roles: Readonly<Record<string, PendingRoleEdit>>;
}

/** One role's pending edits at one scope: the model's and the reasoning's, each a value or an unset. */
export interface PendingRoleFields {
  readonly model?: string | null;
  readonly unsetModel?: boolean;
  readonly thinking?: string | null;
  readonly unsetThinking?: boolean;
}

/** One role's pending edit (REQ-CONFIG-259/341): its field edits under the scope each was made at. */
export interface PendingRoleEdit {
  readonly workspace?: PendingRoleFields;
  readonly global?: PendingRoleFields;
}

const SLOT_KEYS: readonly ModelSlotName[] = ['default_summary_model', 'improvement_collector_model', 'retrospective_model', 'gatekeeper_model', 'small_model', 'medium_model', 'large_model', 'fallback_model'];

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
      max_depth: snapshot.runtime.max_depth, max_active_children: snapshot.runtime.max_active_children, child_timeout: snapshot.runtime.child_timeout, max_iterations: snapshot.runtime.max_iterations,
      allow_outside_workspace: snapshot.runtime.allow_outside_workspace, permission_mode: snapshot.runtime.permission_mode,
      improvement_collector_enabled: snapshot.runtime.improvement_collector_enabled, improvement_collector_timeout: snapshot.runtime.improvement_collector_timeout, keep_going: snapshot.runtime.keep_going, run_start_mode: snapshot.runtime.run_start_mode,
      sandbox_mode: snapshot.runtime.sandbox_mode, sandbox_writable_roots: snapshot.runtime.sandbox_writable_roots,
      sandbox_allow_network: snapshot.runtime.sandbox_allow_network, network_egress_policy: snapshot.runtime.network_egress_policy,
      network_allowed_hosts: snapshot.runtime.network_allowed_hosts, network_denied_hosts: snapshot.runtime.network_denied_hosts,
    },
    circuitBreakerEnabled: snapshot.circuitBreakerEnabled,
    compressorThresholdPercentage: snapshot.compressorThresholdPercentage,
    delegationStrategy: snapshot.delegationStrategy,
    display: { ...snapshot.display },
    skills: { enabled: snapshot.skills.enabled, overrides: { ...snapshot.skills.overrides }, invocationOverrides: { ...snapshot.skills.invocation_overrides } },
    instructions: { overrides: { ...snapshot.instructionsPolicy.overrides } },
    roles: {},
  };
}

/**
 * One field of a role row's Scope cell (REQ-CONFIG-341): the origin it draws, whether it offers Unset, and that Unset's
 * accessible name, which identifies the field and the role (`Unset model for tester`) where the visible text, "Unset",
 * is the same on every row and for both fields.
 */
export interface ScopeField {
  readonly origin: ConfigSnapshot['roles'][number]['modelOrigin'];
  readonly offerUnset: boolean;
  readonly unsetLabel: string;
}

/**
 * REQ-CONFIG-341: what a role row's Scope column draws, per field. A pending unset of the field marks its origin as
 * `default` — the click's own effect, before any save — and `default` is never an edit scope, so it offers no Unset.
 * Otherwise the field draws the origin the snapshot read back (REQ-CONFIG-031's layers) and offers Unset only where
 * that origin equals the selected edit scope. Discard restores the saved pending state, which holds no unset, so the
 * read-back origin and its Unset return with it.
 */
export function scopeCellOf(
  row: ConfigSnapshot['roles'][number],
  pending: PendingSettings,
  scope: 'workspace' | 'global',
): { readonly model: ScopeField; readonly reasoning: ScopeField } {
  const edit = pending.roles[row.role];
  const field = (name: 'model' | 'reasoning', origin: ScopeField['origin'], unset: boolean | undefined): ScopeField => {
    const unsetLabel = `Unset ${name} for ${row.role}`;
    return unset ? { origin: 'default', offerUnset: false, unsetLabel } : { origin, offerUnset: origin === scope, unsetLabel };
  };
  // The unset is the one recorded at the layer the field's value came from: that is the override it clears.
  const at = (origin: ScopeField['origin']) => (origin === 'workspace' || origin === 'global' ? edit?.[origin] : undefined);
  return { model: field('model', row.modelOrigin, at(row.modelOrigin)?.unsetModel), reasoning: field('reasoning', row.thinkingOrigin, at(row.thinkingOrigin)?.unsetThinking) };
}

/**
 * Structural equality over the pending state's plain data: equal values are equal whatever order an object holds its
 * keys in, an array's order is part of its value, and a key whose value is `undefined` counts as absent. The live run
 * at `1763f7f` found the earlier `JSON.stringify` comparison reading a rebased state as dirty because `rebasePending`
 * builds its keys in another order than `pendingFrom` (REQ-CONFIG-419; defect note
 * `a-sign-in-reload-marks-settings-unsaved-though-nothing-was-edited.md`).
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]));
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
  // By value, not by reference: a list the user edited and put back is untouched, so it takes the file's new value.
  for (const key of Object.keys(runtime) as (keyof PendingSettings['runtime'])[]) if (!sameValue(pending.runtime[key], previousSaved.runtime[key])) (runtime as Record<string, unknown>)[key] = pending.runtime[key];
  // REQ-CONFIG-423: for the permission mode alone the last write wins over an unsaved selection — a mode written elsewhere
  // (the composer's control, REQ-CONFIG-288) displaces what the user picked here and has not saved, so the control never
  // shows a mode no run operates under. A reload that did not change the mode keeps the selection (REQ-CONFIG-420).
  if (fresh.runtime.permission_mode !== previousSaved.runtime.permission_mode) runtime.permission_mode = fresh.runtime.permission_mode;
  const display = { ...fresh.display };
  for (const key of Object.keys(display) as (keyof DisplayView)[]) if (pending.display[key] !== previousSaved.display[key]) (display as Record<string, unknown>)[key] = pending.display[key];
  // ADR-0063: the skills block rebases as a whole rather than per key. A per-key rebase would need a third
  // state per skill ("the user removed an override"), which nothing produces: the screen only ever sets a
  // mode, and the sparse write below is what turns a baseline choice into a removal.
  return {
    slots, slotThinking: thinking, runtime, display,
    skills: sameValue(pending.skills, previousSaved.skills) ? fresh.skills : pending.skills,
    // PD-WORKSPACE-002: the instructions block rebases as a whole rather than per key, like the skills
    // block above and for the same reason — the screen only ever sets a state, and the sparse write below
    // is what turns a baseline choice into a removal.
    instructions: sameValue(pending.instructions, previousSaved.instructions) ? fresh.instructions : pending.instructions,
    circuitBreakerEnabled: pending.circuitBreakerEnabled !== previousSaved.circuitBreakerEnabled ? pending.circuitBreakerEnabled : fresh.circuitBreakerEnabled,
    compressorThresholdPercentage: pending.compressorThresholdPercentage !== previousSaved.compressorThresholdPercentage ? pending.compressorThresholdPercentage : fresh.compressorThresholdPercentage,
    delegationStrategy: pending.delegationStrategy !== previousSaved.delegationStrategy ? pending.delegationStrategy : fresh.delegationStrategy,
    roles: pending.roles,
  };
}

/**
 * The screen's form: the last-saved values and the pending ones, held together so that one update moves both. A reload
 * is rebased against the saved values the form holds at that moment — the result of the reload before it, however close
 * behind that one arrives. The hook used to read the previous saved values from a ref an effect refreshed after render,
 * so a second `config:changed` landing before that effect ran was rebased against the values from before the first and
 * read the first's new values as edits (REQ-CONFIG-419; `docs/defects/fixed/two-quick-configuration-reloads-mark-settings-unsaved.md`).
 */
export interface SettingsForm {
  readonly saved: PendingSettings;
  readonly pending: PendingSettings;
}

/**
 * REQ-CONFIG-419/423/425: adopt a snapshot's values. A read or a save (`keepPending` false) repopulates both halves and
 * leaves the form clean; a reload announced from elsewhere keeps the user's edits by `rebasePending`, against the saved
 * half of the form it is handed, which is why the caller folds every adoption through one state update.
 */
export function adoptSnapshot(form: SettingsForm | null, fresh: PendingSettings, keepPending: boolean): SettingsForm {
  return keepPending && form ? { saved: fresh, pending: rebasePending(form.saved, form.pending, fresh) } : { saved: fresh, pending: fresh };
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
  | { readonly kind: 'instructionToggle'; readonly id: string; readonly value: InstructionStateName }
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
    // PD-WORKSPACE-002 — a per-file switch marks settings dirty and is written by Save. The setter does
    // not validate the value: `InstructionStateName` is a closed type, and the writer rejects an
    // unsupported one, so a bad value cannot reach a file through here.
    case 'instructionToggle':
      return pending.instructions.overrides[change.id] === change.value ? pending : { ...pending, instructions: { overrides: { ...pending.instructions.overrides, [change.id]: change.value } } };
    case 'role': {
      // REQ-CONFIG-259/341: the change lands under its own scope; what the role holds at the other scope is untouched.
      const current: PendingRoleEdit = pending.roles[change.role] ?? {};
      const at: PendingRoleFields = current[change.scope] ?? {};
      const fields: PendingRoleFields = {
        ...at,
        ...(change.model !== undefined ? { model: change.model, unsetModel: false } : {}),
        ...(change.thinking !== undefined ? { thinking: change.thinking, unsetThinking: false } : {}),
        ...(change.unsetModel ? { unsetModel: true } : {}),
        ...(change.unsetThinking ? { unsetThinking: true } : {}),
      };
      const next: PendingRoleEdit = { ...current, [change.scope]: fields };
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
  /*
   * PD-WORKSPACE-002: the `instructions.overrides` map, written SPARSELY on the same terms. Only a state
   * differing from the baseline (`on`) lands in the map — EXCEPT where a lower layer states a policy for
   * that file, in which case the baseline is written out explicitly so the choice the user made in the
   * higher scope is what the merge produces.
   *
   * `saved` holding a key stands in for "a lower layer states a policy": the snapshot's map is the MERGED
   * result, so an identity present there came from *some* file, and the screen cannot see which. It
   * over-approximates in one direction only — a file the WORKSPACE already states gets its baseline
   * written back explicitly instead of its key removed, which leaves the file tidier than it could be and
   * never changes what the merge produces. The skills maps stand on the same proxy (REQ-CONFIG-258), and
   * splitting the two scopes apart in the snapshot is the change that would remove it from both at once.
   * `null` is the writer's delete.
   */
  const instructionOverrides: Record<string, InstructionStateName | null> = {};
  for (const [id, state] of Object.entries(pending.instructions.overrides)) {
    if (state === saved.instructions.overrides[id]) continue;
    instructionOverrides[id] = state === 'on' && saved.instructions.overrides[id] === undefined ? null : state;
  }
  // A file the file stated and the screen no longer holds: its key is removed.
  for (const id of Object.keys(saved.instructions.overrides)) if (pending.instructions.overrides[id] === undefined) instructionOverrides[id] = null;
  if (Object.keys(instructionOverrides).length > 0) out.instructions = { overrides: instructionOverrides };
  if (Object.keys(pending.roles).length > 0) {
    // REQ-CONFIG-259/341: each field's edit travels under the scope it was made at, and the writer applies it at that layer.
    const fieldsOf = (e: PendingRoleFields | undefined) => (e === undefined ? undefined : {
      ...(e.model !== undefined && !e.unsetModel ? { model: e.model } : {}),
      ...(e.unsetModel ? { unsetModel: true } : {}),
      ...(e.thinking !== undefined && !e.unsetThinking ? { thinking: e.thinking as 'default' } : {}),
      ...(e.unsetThinking ? { unsetThinking: true } : {}),
    });
    out.roles = Object.fromEntries(Object.entries(pending.roles).map(([role, e]) => {
      const w = fieldsOf(e.workspace);
      const g = fieldsOf(e.global);
      return [role, { ...(w === undefined ? {} : { workspace: w }), ...(g === undefined ? {} : { global: g }) }];
    }));
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

/**
 * The labels Settings renders for the Runtime category and its per-agent timeout control. They are named here, not
 * written inline, because PD-CONFIG-003 revision 3 has the agent surfaces name the control by its path, and "one wording"
 * means the path's segments are exactly what Settings shows (`perAgentTimeoutPath` in `agents.ts`).
 */
export const RUNTIME_CATEGORY_LABEL = 'Runtime';
export const PER_AGENT_TIMEOUT_LABEL = 'Per-agent timeout';

/** PD-CONFIG-003: the per-agent timeout control's widget clamp, in whole minutes. */
export const CHILD_TIMEOUT_MINUTES = { min: 1, max: 240 } as const;

/**
 * PD-CONFIG-003 with REQ-CONFIG-446: the minutes the per-agent timeout control shows for the stored seconds — rounded to a
 * whole minute and clamped to 1–240 for display only; the stored value itself is never rewritten by being shown.
 */
export function timeoutMinutesForDisplay(seconds: number): number {
  return clampForDisplay(Math.round(seconds / 60), CHILD_TIMEOUT_MINUTES.min, CHILD_TIMEOUT_MINUTES.max);
}

/** PD-CONFIG-003: the seconds a user's entry stores — whole minutes clamped to 1–240, times 60. */
export function timeoutSecondsFromInput(value: number): number {
  const minutes = Number.isFinite(value) ? Math.round(value) : CHILD_TIMEOUT_MINUTES.min;
  return clampForDisplay(minutes, CHILD_TIMEOUT_MINUTES.min, CHILD_TIMEOUT_MINUTES.max) * 60;
}

/**
 * PD-CONFIG-003: the line beneath the control when the stored seconds are not what it shows (a value that is not a whole
 * minute, or one outside 60–14,400 s): the exact figure, kept until the field is changed. `null` when the control shows it.
 */
export function storedTimeoutNote(seconds: number): string | null {
  return timeoutMinutesForDisplay(seconds) * 60 === seconds ? null : storedSecondsLine(seconds);
}

/** REQ-CONFIG-446's stated value, one wording for both timeout controls (PD-CONFIG-003 and its revision 2). */
function storedSecondsLine(seconds: number): string {
  return `Stored as ${seconds} seconds; kept until you change this field.`;
}

/** PD-CONFIG-003 revision 2: the improvement analysis timeout control's widget clamp, in whole seconds. */
export const IMPROVEMENT_TIMEOUT_SECONDS = { min: 10, max: 600 } as const;

/**
 * PD-CONFIG-003 revision 2 with REQ-CONFIG-446: the seconds the improvement analysis timeout control shows — clamped to 10–600
 * for display only; the stored value itself is never rewritten by being shown.
 */
export function improvementTimeoutForDisplay(seconds: number): number {
  return clampForDisplay(seconds, IMPROVEMENT_TIMEOUT_SECONDS.min, IMPROVEMENT_TIMEOUT_SECONDS.max);
}

/** PD-CONFIG-003 revision 2: the seconds a user's entry stores — whole seconds clamped to 10–600. */
export function improvementTimeoutFromInput(value: number): number {
  const seconds = Number.isFinite(value) ? Math.round(value) : IMPROVEMENT_TIMEOUT_SECONDS.min;
  return clampForDisplay(seconds, IMPROVEMENT_TIMEOUT_SECONDS.min, IMPROVEMENT_TIMEOUT_SECONDS.max);
}

/**
 * PD-CONFIG-003 revision 2: what one keystroke in the control does. A whole number within 10–600 is committed as typed; any
 * other text is held as the field's draft and committed, clamped, when the field loses focus (`improvementTimeoutFromInput`).
 * Clamping every keystroke made a value whose first digit lies below 10 untypable — "120" became 10, then 102, then 600 —
 * found by driving the built app.
 */
export function improvementTimeoutEdit(raw: string): { readonly commit: number } | { readonly draft: string } {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isInteger(n) && n >= IMPROVEMENT_TIMEOUT_SECONDS.min && n <= IMPROVEMENT_TIMEOUT_SECONDS.max ? { commit: n } : { draft: raw };
}

/** PD-CONFIG-003 revision 2: the line beneath the control when the stored seconds lie outside 10–600; `null` when it shows them. */
export function storedImprovementTimeoutNote(seconds: number): string | null {
  return improvementTimeoutForDisplay(seconds) === seconds ? null : storedSecondsLine(seconds);
}
