import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTATION_CONFIG_DEFAULT, type ConfigSnapshot } from '@rotaris/contracts';
import { ModelsSettings, PersonasSettings, type ConfigSettingsProps } from './ConfigSettings.js';
import { applyChange, isDirty, modelChangeClearsThinking, pendingFrom, reasoningChoice, roleReasoningOptions, slotModelPick, type PendingChange } from './config-state.js';

/**
 * REQ-CONFIG-332 with REQ-CONFIG-091/093/202/254/340: a slot's reasoning-strength options are the levels the SELECTED
 * model offers, read from the model catalog and nowhere else, with the unset entry first and a stored level the catalog
 * no longer offers appended under its own name; a model offering none leaves the unset entry alone, disabled, with the
 * tooltip. Until this repair the control offered `low/medium/high/max` to EVERY model (the fixed list in
 * `ConfigSettings.tsx`), so the owner's locally hosted `ds41` — whose endpoint understands low/high/max only, stated as
 * a `reasoning_effort_map` — was offered levels it does not have and withheld the ones it does.
 *
 * The render is a real render (`react-dom/server` over `ModelsSettings`), because a helper-only check carries no wiring
 * claim: what is asserted is the `<option value=…>` set of the ds41 row as markup.
 */

const runtime = { max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto' as const, memory_diagnostics_enabled: false, sandbox_mode: 'off' as const, sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask' as const, network_allowed_hosts: [], network_denied_hosts: [] };

const snapshotWith = (over: Partial<ConfigSnapshot> = {}): ConfigSnapshot => ({
  workspaceRoot: '/ws', loadOk: true, fatal: null,
  slots: [
    { slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: null },
    { slot: 'small_model', value: 'gpt-4o-mini', origin: 'default', thinking: null },
  ],
  models: ['ds41', 'gpt-4o-mini'], imageInputModels: [],
  modelReasoning: { ds41: ['low', 'high', 'max'], 'gpt-4o-mini': [] },
  roles: [],
  runtime,
  rawRuntime: { workspace: null, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60,
  display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, dictation: DICTATION_CONFIG_DEFAULT, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
  files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
  ...over,
});

const outcome = async () => ({ ok: true as const });

/** The `<option value=…>` values of the select whose accessible name is `Reasoning strength for <slot>`. */
function optionValues(markup: string, slot: string): string[] {
  const select = new RegExp(`<select[^>]*aria-label="Reasoning strength for ${slot}"[^>]*>([\\s\\S]*?)</select>`).exec(markup)?.[1] ?? '';
  return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]!);
}

function selectTag(markup: string, slot: string): string {
  return new RegExp(`<select[^>]*aria-label="Reasoning strength for ${slot}"[^>]*>`).exec(markup)?.[0] ?? '';
}

function render(snapshot: ConfigSnapshot, pending = pendingFrom(snapshot), onChange: (change: PendingChange) => void = () => {}): string {
  const props: ConfigSettingsProps = { snapshot, pending, dirty: false, loading: false, error: null, serviceAvailable: true, onChange, onSave: outcome, onDiscard: () => {}, onSetField: outcome };
  return renderToStaticMarkup(createElement(ModelsSettings, props));
}

describe('REQ-CONFIG-332 — the slot reasoning control offers exactly the model’s levels', () => {
  it('the ds41 case: a model whose effort map offers low/high/max renders Provider default, low, high, max — and nothing else', () => {
    const markup = render(snapshotWith());
    expect(optionValues(markup, 'large_model')).toEqual(['', 'low', 'high', 'max']);
    // Never `medium` (the endpoint does not understand it) and never `xhigh` (its map offers no such KEY: xhigh is a
    // level of the widened vocabulary since PD-CONFIG-006, and only an entry declaring it offers it).
    expect(optionValues(markup, 'large_model')).not.toContain('medium');
    expect(optionValues(markup, 'large_model')).not.toContain('xhigh');
    // The unset entry keeps its label and is the selection when nothing is stored.
    expect(markup).toContain('Provider default</option>');
    expect(markup).toMatch(/<option value="" selected="">Provider default<\/option>/);
    // The full set still reads back as the five entries (the vocabulary’s own order).
    const full = render(snapshotWith({ modelReasoning: { ds41: ['low', 'medium', 'high', 'max'], 'gpt-4o-mini': [] } }));
    expect(optionValues(full, 'large_model')).toEqual(['', 'low', 'medium', 'high', 'max']);
  });

  it('a model declaring `off` and `xhigh` renders them under their own names — the levels the old five clipped away (PD-CONFIG-006)', () => {
    const markup = render(snapshotWith({ modelReasoning: { ds41: ['off', 'low', 'high', 'xhigh', 'max'], 'gpt-4o-mini': [] } }));
    expect(optionValues(markup, 'large_model')).toEqual(['', 'off', 'low', 'high', 'xhigh', 'max']);
    // Displayed literally, under its own name.
    expect(markup).toContain('<option value="off">off</option>');
    expect(markup).toContain('<option value="xhigh">xhigh</option>');
  });

  it('a capability record of low/high renders Provider default, low, high only', () => {
    const markup = render(snapshotWith({ modelReasoning: { ds41: ['low', 'high'], 'gpt-4o-mini': [] } }));
    expect(optionValues(markup, 'large_model')).toEqual(['', 'low', 'high']);
  });

  it('a model offering no levels renders the unset entry alone, disabled, with the tooltip (REQ-CONFIG-332)', () => {
    const markup = render(snapshotWith({ modelReasoning: { ds41: ['low', 'high', 'max'], 'gpt-4o-mini': [] } }));
    expect(optionValues(markup, 'small_model')).toEqual(['']);
    const tag = selectTag(markup, 'small_model');
    expect(tag).toContain('disabled');
    expect(tag).toContain('no configurable thinking strength');
  });

  it('a model offering exactly one level stays editable — the endpoint’s own level must be selectable', () => {
    const markup = render(snapshotWith({ modelReasoning: { ds41: ['high'], 'gpt-4o-mini': [] } }));
    expect(optionValues(markup, 'large_model')).toEqual(['', 'high']);
    expect(selectTag(markup, 'large_model')).not.toContain('disabled');
  });

  it('a stored level the catalog no longer offers is appended under its own name and shown as the selection (REQ-CONFIG-332/093)', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'medium' }] });
    const markup = render(snapshot);
    // `medium` is appended (it is not among the offered low/high/max) and the control selects it.
    expect(optionValues(markup, 'large_model')).toEqual(['', 'low', 'high', 'max', 'medium']);
    expect(markup).toMatch(/<option value="medium" selected="">Medium<\/option>/);
    // A stored `auto` is appended under its own label and never as the unset entry (REQ-CONFIG-254).
    const auto = render(snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'auto' }] }));
    expect(optionValues(auto, 'large_model')).toEqual(['', 'low', 'high', 'max', 'auto']);
    expect(auto).toContain('<option value="auto" selected="">Auto (stored)</option>');
  });

  it('a stored value resolving to no entry falls back to the first entry (the unset one) rather than showing nothing (REQ-CONFIG-332)', () => {
    // Not reachable through the appending rule (it appends every non-null stored value); pinned as the derivation’s own
    // contract for a level list the panel does not carry, so the select can never be left showing an entry that is not there.
    expect(reasoningChoice(['low', 'high'], null)).toEqual({ levels: ['low', 'high'], selection: '', editable: true, appended: null });
    expect(reasoningChoice([], 'low').selection).toBe('low');
    expect(reasoningChoice(['low', 'high'], 'low').selection).toBe('low');
  });

  it('re-selecting the current level does not dirty the form (REQ-CONFIG-335)', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'high' }] });
    const saved = pendingFrom(snapshot);
    expect(applyChange(saved, { kind: 'slotThinking', slot: 'large_model', value: 'high' })).toBe(saved);
    expect(isDirty(saved, applyChange(saved, { kind: 'slotThinking', slot: 'large_model', value: 'high' }))).toBe(false);
  });
});

describe('REQ-CONFIG-334 — a model change clears a now-unoffered strength, disclosed and never silent', () => {
  it('changing the slot’s model to one that does not offer the stored strength clears it and states which one and why', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'high' }], modelReasoning: { ds41: ['low', 'high', 'max'], 'gpt-4o-mini': [] } });
    const saved = pendingFrom(snapshot);
    // The user picks gpt-4o-mini, which offers nothing: `high` is cleared and the clearing recorded.
    const change = slotModelPick('large_model', 'gpt-4o-mini', 'ds41', saved.slots.large_model, [], 'high');
    const pending = applyChange(saved, change);
    expect(pending.slotThinking.large_model).toBeNull();
    expect(pending.clearedThinking.large_model).toBe('high');
    const markup = render(snapshot, pending);
    const row = new RegExp('<tbody>[\\s\\S]*?<tr>[\\s\\S]*?</tr>').exec(markup)?.[0] ?? markup;
    expect(row).toContain('was cleared because the newly chosen model does not offer it');
    expect(row).toContain('High');
    // The selection falls back to the unset entry; the cleared strength is not kept as the selection.
    expect(optionValues(markup, 'large_model')).toEqual(['']);
    // The disclosure is in the accessible description too, not only in the visible hint.
    expect(selectTag(markup, 'large_model')).toContain('cleared because the newly chosen model does not offer it');
  });

  it('a model change that keeps the stored strength offered clears nothing and discloses nothing', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'high' }] });
    const saved = pendingFrom(snapshot);
    const change = slotModelPick('large_model', 'other', 'ds41', saved.slots.large_model, ['low', 'high'], 'high');
    const pending = applyChange(saved, change);
    expect(pending.slotThinking.large_model).toBe('high');
    expect(pending.clearedThinking.large_model).toBeUndefined();
  });

  it('a model change clears a strength the new model does not offer even when it offers others, and next a change that clears nothing drops the earlier note', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'a', origin: 'workspace', thinking: 'max' }] });
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, slotModelPick('large_model', 'b', 'a', saved.slots.large_model, ['low', 'high'], 'max'));
    expect(pending.slotThinking.large_model).toBeNull();
    expect(pending.clearedThinking.large_model).toBe('max');
    pending = applyChange(pending, slotModelPick('large_model', 'c', 'a', 'b', ['low', 'high', 'max'], null));
    expect(pending.clearedThinking.large_model).toBeUndefined();
  });

  it('the stored level auto is exempt and is never cleared by a model change (REQ-CONFIG-093/332/334)', () => {
    expect(modelChangeClearsThinking([], 'auto')).toBeNull();
    expect(modelChangeClearsThinking(['low'], 'auto')).toBeNull();
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'auto' }] });
    const saved = pendingFrom(snapshot);
    const pending = applyChange(saved, slotModelPick('large_model', 'gpt-4o-mini', 'ds41', saved.slots.large_model, [], 'auto'));
    expect(pending.slotThinking.large_model).toBe('auto');
    expect(pending.clearedThinking.large_model).toBeUndefined();
  });

  it('a pick that does not move the model in effect is a plain set: the file’s own value is not “cleared” (REQ-CONFIG-332’s repopulation rule)', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'medium' }] });
    const saved = pendingFrom(snapshot);
    // The user picks the leave-as-configured entry while the file already resolves to ds41: nothing moves, so the
    // stored `medium` — appended by the repopulation rule — stands and no disclosure is written.
    const pending = applyChange(saved, slotModelPick('large_model', null, 'ds41', saved.slots.large_model, [], 'medium'));
    expect(pending.slots.large_model).toBeNull();
    expect(pending.slotThinking.large_model).toBe('medium');
    expect(pending.clearedThinking.large_model).toBeUndefined();
  });

  it('choosing a level afterwards drops the disclosure: the row no longer states a level the user has just replaced', () => {
    const snapshot = snapshotWith({ slots: [{ slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: 'high' }] });
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, slotModelPick('large_model', 'gpt-4o-mini', 'ds41', saved.slots.large_model, [], 'high'));
    expect(pending.clearedThinking.large_model).toBe('high');
    pending = applyChange(pending, { kind: 'slotThinking', slot: 'large_model', value: 'low' });
    expect(pending.slotThinking.large_model).toBe('low');
    expect(pending.clearedThinking.large_model).toBeUndefined();
  });
});

describe('REQ-CONFIG-340 — the role reasoning column reads the same set through the slot map', () => {
  const roleSnapshot = snapshotWith({
    roles: [{ role: 'tester', rawModel: 'large_model', modelOrigin: 'workspace', effectiveModel: 'ds41', inherited: false, builtInDefault: 'medium_model', rawThinking: 'high', thinkingOrigin: 'workspace', tier: null, tools: [], declaredTools: [] }],
    slots: [
      { slot: 'large_model', value: 'ds41', origin: 'workspace', thinking: null },
      { slot: 'small_model', value: 'gpt-4o-mini', origin: 'default', thinking: null },
    ],
  });

  it('a role pointing at a tier gets that tier’s model’s levels: default, provider_default, then the model’s own', () => {
    expect(roleReasoningOptions(['low', 'high', 'max'], 'default')).toEqual(['default', 'provider_default', 'low', 'high', 'max']);
  });

  it('an unrecognized stored value is appended, preserved and not dropped (REQ-CONFIG-340)', () => {
    expect(roleReasoningOptions(['low', 'high'], 'medium')).toEqual(['default', 'provider_default', 'low', 'high', 'medium']);
    expect(roleReasoningOptions([], 'auto')).toEqual(['default', 'provider_default', 'auto']);
  });

  it('renders the resolved model’s levels in the role row’s reasoning select', () => {
    const props: ConfigSettingsProps = { snapshot: roleSnapshot, pending: pendingFrom(roleSnapshot), dirty: false, loading: false, error: null, serviceAvailable: true, onChange: () => {}, onSave: outcome, onDiscard: () => {}, onSetField: outcome };
    const markup = renderToStaticMarkup(createElement(PersonasSettings, props));
    const select = new RegExp('<select[^>]*aria-label="Reasoning for tester"[^>]*>([\\s\\S]*?)</select>').exec(markup)?.[1] ?? '';
    const values = [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]!);
    expect(values).toEqual(['default', 'provider_default', 'low', 'high', 'max']);
  });
});
