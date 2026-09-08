import { useState, type ReactNode } from 'react';
import { DELEGATION_STRATEGY_NAMES, EDITABLE_SLOTS, PERMISSION_PRESETS, REASONING_LEVEL_NAMES, ROLE_REASONING_NAMES, RUN_START_MODE_NAMES, type ConfigSnapshot, type ModelSlotName } from '@rotaris/contracts';
import { clampForDisplay, type PendingChange, type PendingSettings } from './config-state.js';

/**
 * The three configuration categories (structure from docs/spec, language from docs/design/system):
 * Models (REQ-CONFIG-329..335), Personas (REQ-CONFIG-336..341), Runtime (REQ-CONFIG-320..328, 471), and the
 * save bar (REQ-CONFIG-270, 279..285). Every control defers to Save except the advanced card's diagnostics
 * toggle, which writes per field at once (REQ-CONFIG-471). Nothing here names a file: the host commits
 * (REQ-CONFIG-279).
 *
 * **REQ-CONFIG-270 was met for three categories and asks for all thirteen.** The bar used to be rendered
 * inside Models, Personas and Runtime, so it left the screen whenever the user did — and Part AG's Display
 * category is a fourth that commits by Save. `SettingsView` now renders it once, above the category body,
 * where no category's own content can push it out of view; that is the requirement's own wording.
 */
export interface ConfigSettingsProps {
  readonly snapshot: ConfigSnapshot | null;
  readonly pending: PendingSettings | null;
  readonly dirty: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  /** REQ-CONFIG-281: with no configuration service a dirty form can be discarded but never saved. */
  readonly serviceAvailable: boolean;
  readonly onChange: (change: PendingChange) => void;
  readonly onSave: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onDiscard: () => void;
  /** REQ-CONFIG-441: the immediate per-field write into a scope. */
  readonly onSetField: (scope: 'workspace' | 'global', patch: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** REQ-CONFIG-329: the providers card, owned by the renderer root (main answers its commands). */
  readonly providersCard?: ReactNode;
}

type Outcome = { ok: true } | { ok: false; reason: string };

/** REQ-CONFIG-270/280..283: visible from every category; the state in words, colour only reinforcing it. */
export function SaveBar({ dirty, serviceAvailable, onSave, onDiscard }: Pick<ConfigSettingsProps, 'dirty' | 'serviceAvailable' | 'onSave' | 'onDiscard'>) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    const r = await onSave();
    setSaving(false);
    setFailure(r.ok ? null : r.reason);
  };
  return (
    <div className="save-bar" role="group" aria-label="Settings save status and actions">
      <span className={`save-bar__status${dirty ? ' is-dirty' : ''}`} role="status" aria-label="Settings save status">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
      {dirty && serviceAvailable && <button type="button" className="btn btn-primary btn-compact" disabled={saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : 'Save'}</button>}
      {dirty && <button type="button" className="btn btn-secondary btn-compact" onClick={onDiscard}>Discard</button>}
      {!serviceAvailable && dirty && <span className="text-secondary settings__hint">Settings are read-only in the current mode; changes can be discarded but not saved.</span>}
      {failure && <span className="composer__error" role="alert">Save failed: {failure} <button type="button" className="btn btn-link" onClick={() => { void save(); }}>Retry</button></span>}
    </div>
  );
}

const LEVEL_LABELS: Readonly<Record<string, string>> = { auto: 'Auto (stored)', low: 'Low', medium: 'Medium', high: 'High', max: 'Max', default: 'Default (inherit)', provider_default: 'Provider default' };

function Fatal({ snapshot }: { snapshot: ConfigSnapshot }) {
  return (
    <div className="card settings__fatal" role="alert">
      <div className="card-kicker">Configuration could not be loaded</div>
      <p className="card-body">{snapshot.fatal}</p>
      <p className="card-meta">Workspace file: <code className="mono">{snapshot.files.workspace}</code> · Global file: <code className="mono">{snapshot.files.global}</code></p>
    </div>
  );
}

/** REQ-CONFIG-329..335: the slots grid — slot, model, reasoning strength; "Provider default" for unset; a stored `auto` under its own label. */
export function ModelsSettings(props: ConfigSettingsProps) {
  const { snapshot, pending, onChange } = props;
  if (!snapshot || !pending) return <p className="text-secondary">{props.loading ? 'Reading the configuration…' : props.error ?? 'No configuration service.'}</p>;
  if (!snapshot.loadOk) return <Fatal snapshot={snapshot} />;
  const slotOf = (slot: ModelSlotName) => snapshot.slots.find((s) => s.slot === slot);
  return (
    <div className="settings__section">
      <h1 className="display">Models</h1>
      {snapshot.referential.length > 0 && (
        <div className="card settings__referential" role="status">
          <div className="card-kicker">Unresolved references</div>
          <ul className="card-body">{snapshot.referential.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <h2 className="settings__heading">Model slots</h2>
      <p className="text-secondary">Each slot names a configured model; a role may target a slot instead of a model. Edits are written to this workspace's configuration on Save.</p>
      <table className="table settings__grid" aria-label="Model slots">
        <thead><tr><th>Slot</th><th>Model</th><th>Reasoning strength</th></tr></thead>
        <tbody>
          {EDITABLE_SLOTS.map((slot) => {
            const view = slotOf(slot);
            const value = pending.slots[slot] ?? '';
            const thinking = pending.slotThinking[slot];
            const options = snapshot.models.includes(value) || value === '' ? snapshot.models : [value, ...snapshot.models];
            // REQ-CONFIG-332: the levels the model offers; no catalogue ships, so every configured model offers the five. A stored `auto` is appended under its own label (REQ-CONFIG-254).
            const levels: string[] = [...REASONING_LEVEL_NAMES.filter((l) => l !== 'auto'), ...(thinking === 'auto' ? ['auto'] : [])];
            return (
              <tr key={slot}>
                <td className="mono">{slot}<span className="text-tertiary settings__origin"> {view?.origin ?? 'built-in'}</span></td>
                <td>
                  <select className="input select" aria-label={`Model for ${slot}`} value={value} onChange={(e) => onChange({ kind: 'slot', slot, value: e.currentTarget.value === '' ? null : e.currentTarget.value })}>
                    <option value="">Leave as configured{view?.value ? ` (${view.value})` : ''}</option>
                    {options.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td>
                  <select className="input select" aria-label={`Reasoning strength for ${slot}`} aria-description={`Sets the reasoning or thinking strength used by ${slot}'s model.`} value={thinking ?? ''} onChange={(e) => onChange({ kind: 'slotThinking', slot, value: e.currentTarget.value === '' ? null : e.currentTarget.value })}>
                    <option value="">Provider default</option>
                    {levels.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l] ?? l}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 className="settings__heading">Providers</h2>
      {props.providersCard ?? <p className="text-secondary">The provider list is not available in this window.</p>}
    </div>
  );
}

/** REQ-CONFIG-336..341: the edit-scope selector, the six-column role table, the Scope column with Unset at the edited origin only. */
export function PersonasSettings(props: ConfigSettingsProps & { readonly children?: React.ReactNode }) {
  const { snapshot, pending, onChange } = props;
  const [scope, setScope] = useState<'workspace' | 'global'>('workspace');
  if (!snapshot || !pending) return <p className="text-secondary">{props.loading ? 'Reading the configuration…' : props.error ?? 'No configuration service.'}</p>;
  if (!snapshot.loadOk) return <Fatal snapshot={snapshot} />;
  const slotNames = ['small_model', 'medium_model', 'large_model'];
  // REQ-CONFIG-339: slot names first, then every catalogue model not also a slot name.
  const modelOptions = [...slotNames, ...snapshot.models.filter((m) => !slotNames.includes(m))];
  return (
    <div className="settings__section">
      <h1 className="display">Personas</h1>
      <div className="settings__action">
        <label htmlFor="persona-scope">Edit scope</label>
        <select id="persona-scope" className="input select settings__select" aria-label="Edit scope" aria-description="Settles whether edits to a role's model and reasoning are recorded for this workspace or for the user as a whole." value={scope} onChange={(e) => setScope(e.currentTarget.value as 'workspace' | 'global')}>
          <option value="workspace">Workspace</option>
          <option value="global">Global</option>
        </select>
        <span className="text-secondary settings__hint">Switching scope shows that scope's values; it copies nothing.</span>
      </div>
      <table className="table settings__grid" aria-label="Roles">
        <thead><tr><th>Persona</th><th>Role</th><th>Model</th><th>Reasoning</th><th>Scope</th><th>Tools</th></tr></thead>
        <tbody>
          {snapshot.roles.map((r) => {
            const edit = pending.roles[r.role];
            const model = edit?.unsetModel ? '' : edit?.model !== undefined ? edit.model ?? '' : r.rawModel ?? '';
            const thinking = edit?.unsetThinking ? 'default' : edit?.thinking !== undefined ? edit.thinking ?? 'default' : r.rawThinking ?? 'default';
            const levels = ROLE_REASONING_NAMES.includes(thinking as 'default') ? ROLE_REASONING_NAMES : [...ROLE_REASONING_NAMES, thinking];
            return (
              <tr key={r.role}>
                <td>{r.role}</td>
                <td className="mono">{r.role}</td>
                <td>
                  <select className="input select" aria-label={`Model for ${r.role}`} value={model} onChange={(e) => onChange({ kind: 'role', role: r.role, scope, model: e.currentTarget.value === '' ? null : e.currentTarget.value })}>
                    <option value="">{r.inherited ? `Inherited (${r.effectiveModel})` : `Unset (${r.builtInDefault ?? 'built-in'})`}</option>
                    {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td>
                  <select className="input select" aria-label={`Reasoning for ${r.role}`} value={thinking} onChange={(e) => onChange({ kind: 'role', role: r.role, scope, thinking: e.currentTarget.value })}>
                    {levels.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l] ?? l}</option>)}
                  </select>
                </td>
                <td className="settings__scope">
                  <div>model: <span className="text-secondary">{r.modelOrigin}</span>{r.modelOrigin === scope && <button type="button" className="btn btn-link btn-compact" title="Falls back to the lower-precedence value." onClick={() => onChange({ kind: 'role', role: r.role, scope, unsetModel: true })}>Unset</button>}</div>
                  <div>reasoning: <span className="text-secondary">{r.thinkingOrigin}</span>{r.thinkingOrigin === scope && <button type="button" className="btn btn-link btn-compact" title="Falls back to the lower-precedence value." onClick={() => onChange({ kind: 'role', role: r.role, scope, unsetThinking: true })}>Unset</button>}</div>
                </td>
                <td className="text-secondary settings__tools">{r.tools.join(', ') || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {props.children}
    </div>
  );
}

export function Toggle({ id, label, hint, on, onChange, disabled, testId }: { id: string; label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <div className="settings__action">
      <span id={`${id}-label`}>{label}</span>
      {/* REQ-CONFIG-323: the accessible description states enabled or disabled and is regenerated on every change. */}
      <button type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-labelledby={`${id}-label`} aria-description={`${label} is ${on ? 'enabled' : 'disabled'}.`} aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} {...(testId ? { 'data-testid': testId, 'data-on': on ? 'true' : 'false' } : {})} />
      <span className="text-secondary settings__hint">{hint}</span>
    </div>
  );
}

/** REQ-CONFIG-327: a warning prompt with Yes and Cancel, Cancel as the default. */
function Confirm({ title, body, onYes, onCancel }: { title: string; body: string; onYes: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="settings-confirm-title">
        <h2 id="settings-confirm-title" className="dialog-title">{title}</h2>
        <p className="dialog-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" autoFocus onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-warning" onClick={onYes}>Yes</button>
        </div>
      </div>
    </div>
  );
}

/** REQ-CONFIG-320..328 and 471, in the order the requirement fixes. The security policy card is not built: no confinement backend exists (ADR-0022). */
export function RuntimeSettings(props: ConfigSettingsProps) {
  const { snapshot, pending, onChange, onSetField } = props;
  const [confirm, setConfirm] = useState<'outside' | 'autonomous' | null>(null);
  const [advancedScope, setAdvancedScope] = useState<'workspace' | 'global'>('workspace');
  const [advancedMessage, setAdvancedMessage] = useState<string | null>(null);
  if (!snapshot || !pending) return <p className="text-secondary">{props.loading ? 'Reading the configuration…' : props.error ?? 'No configuration service.'}</p>;
  if (!snapshot.loadOk) return <Fatal snapshot={snapshot} />;
  const rt = pending.runtime;
  const raw = advancedScope === 'workspace' ? snapshot.rawRuntime.workspace : snapshot.rawRuntime.global;
  const writeDiagnostics = async (value: boolean) => {
    const r: Outcome = await onSetField(advancedScope, { runtime: { memory_diagnostics_enabled: value } });
    setAdvancedMessage(r.ok ? `memory_diagnostics_enabled is now ${value ? 'on' : 'off'} in the ${advancedScope} file.` : r.reason);
  };
  return (
    <div className="settings__section">
      <h1 className="display">Runtime</h1>
      <div className="settings__action">
        <label htmlFor="strategy">Delegation strategy</label>
        <select id="strategy" className="input select settings__select" aria-label="Delegation strategy" value={pending.delegationStrategy} onChange={(e) => onChange({ kind: 'delegationStrategy', value: e.currentTarget.value as PendingSettings['delegationStrategy'] })}>
          {DELEGATION_STRATEGY_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-secondary settings__hint">orchestrator coordinates through specialists; swarm lets roles fan out; single does the work in one role with no delegation.</span>
      </div>
      <div className="settings__action">
        <label htmlFor="run-start-mode">Run-start mode</label>
        <select id="run-start-mode" className="input select settings__select" aria-label="Run-start mode" aria-description="Decides whether a run produces a plan and waits for an answer before it changes anything." value={rt.run_start_mode} onChange={(e) => onChange({ kind: 'runtime', key: 'run_start_mode', value: e.currentTarget.value as 'auto' | 'plan' })}>
          {RUN_START_MODE_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-secondary settings__hint">Stored for the next run. The plan gate itself is not built in this version.</span>
      </div>
      <h2 className="settings__heading">Delegation limits</h2>
      <div className="settings__action">
        <label htmlFor="max-depth">Depth cap</label>
        <input id="max-depth" className="input settings__number" type="number" min={1} max={12} value={clampForDisplay(rt.max_depth, 1, 12)} onChange={(e) => onChange({ kind: 'runtime', key: 'max_depth', value: clampForDisplay(Number(e.currentTarget.value) || 1, 1, 12) })} />
        <label htmlFor="max-active">Fan-out limit</label>
        <input id="max-active" className="input settings__number" type="number" min={1} max={64} value={clampForDisplay(rt.max_active_children, 1, 64)} onChange={(e) => onChange({ kind: 'runtime', key: 'max_active_children', value: clampForDisplay(Number(e.currentTarget.value) || 1, 1, 64) })} />
      </div>
      <h2 className="settings__heading">Runtime policy</h2>
      <div className="card settings__card">
        <Toggle id="cb" label="Circuit breaker" hint="Watches every agent for repeated work and redirects it; escalates after three activations." on={pending.circuitBreakerEnabled} onChange={(v) => onChange({ kind: 'circuitBreaker', value: v })} />
        <Toggle id="outside" label="Allow outside workspace" hint="Lets agents read and change files outside the chosen workspace." on={rt.allow_outside_workspace} onChange={(v) => { if (v) setConfirm('outside'); else onChange({ kind: 'runtime', key: 'allow_outside_workspace', value: false }); }} />
        <Toggle id="improvement" label="Improvement loop" hint="One collection pass follows each finished run. Stored; the pass itself is not built in this version." on={rt.improvement_collector_enabled} onChange={(v) => onChange({ kind: 'runtime', key: 'improvement_collector_enabled', value: v })} />
        <Toggle id="keep-going" label="Keep going" hint="A run holds itself open while the last verification suite still has a failing or timed-out check; no budget is extended." on={rt.keep_going} onChange={(v) => onChange({ kind: 'runtime', key: 'keep_going', value: v })} />
        <div className="settings__action">
          <span>Permission mode</span>
          <div className="seg" role="radiogroup" aria-label="Permission mode, strictest first">
            {PERMISSION_PRESETS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={rt.permission_mode === m} className={`seg-opt${rt.permission_mode === m ? ' is-active' : ''}`} onClick={() => { if (m === 'autonomous') setConfirm('autonomous'); else onChange({ kind: 'runtime', key: 'permission_mode', value: m }); }}>{m}</button>
            ))}
          </div>
          <span className="text-secondary settings__hint">The preset a run starts from. Deferred to Save; it never reaches a live run — the composer's control does that.</span>
        </div>
        <div className="settings__action">
          <label htmlFor="threshold">Compression threshold</label>
          <input id="threshold" className="input settings__number" type="number" min={50} max={95} value={clampForDisplay(pending.compressorThresholdPercentage, 50, 95)} onChange={(e) => onChange({ kind: 'compressorThreshold', value: clampForDisplay(Number(e.currentTarget.value) || 50, 50, 95) })} /><span className="text-secondary">%</span>
          <label htmlFor="iterations">Iteration cap</label>
          <input id="iterations" className="input settings__number" type="number" min={1} max={500} value={clampForDisplay(rt.max_iterations, 1, 500)} onChange={(e) => onChange({ kind: 'runtime', key: 'max_iterations', value: clampForDisplay(Number(e.currentTarget.value) || 1, 1, 500) })} /><span className="text-secondary">iterations</span>
        </div>
        <p className="text-tertiary settings__hint">Secret redaction is always active; there is no way to disable it from this screen.</p>
      </div>
      <h2 className="settings__heading">Security policy</h2>
      <p className="text-secondary">No confinement backend exists on this platform, so the six confinement and egress values are read from the file and not edited here.</p>
      <h2 className="settings__heading">Advanced runtime</h2>
      <div className="card settings__card">
        <div className="settings__action">
          <label htmlFor="advanced-scope">Scope</label>
          <select id="advanced-scope" className="input select settings__select" aria-label="Runtime scope" value={advancedScope} onChange={(e) => setAdvancedScope(e.currentTarget.value as 'workspace' | 'global')}>
            <option value="workspace">Workspace</option>
            <option value="global">Global</option>
          </select>
          <span className="text-secondary settings__hint">The raw runtime mapping as the {advancedScope} file states it; a key absent here is stated elsewhere or inherited from the built-in defaults.</span>
        </div>
        <pre className="mono settings__raw" aria-label={`Raw runtime mapping of the ${advancedScope} file`}>{raw ? JSON.stringify(raw, null, 2) : '(no runtime: mapping in this file)'}</pre>
        <Toggle id="diagnostics" label="Memory diagnostics" hint="Written to the selected scope's file immediately and reloaded; outside Save and Discard — Discard does not undo it." on={snapshot.runtime.memory_diagnostics_enabled} disabled={!props.serviceAvailable} onChange={(v) => { void writeDiagnostics(v); }} />
        {advancedMessage && <div className="text-secondary settings__hint" role="status">{advancedMessage}</div>}
      </div>
      {confirm === 'outside' && <Confirm title="Allow access beyond the workspace?" body="Agents will then be able to read and change files outside the chosen workspace. This belongs on only where a task genuinely needs it." onCancel={() => setConfirm(null)} onYes={() => { setConfirm(null); onChange({ kind: 'runtime', key: 'allow_outside_workspace', value: true }); }} />}
      {confirm === 'autonomous' && <Confirm title="Start runs in autonomous mode?" body="Mutating tools inside the workspace will be invoked without asking, except for the destructive commands the starter rules always deny." onCancel={() => setConfirm(null)} onYes={() => { setConfirm(null); onChange({ kind: 'runtime', key: 'permission_mode', value: 'autonomous' }); }} />}
    </div>
  );
}

/** REQ-CONFIG-286: Save, Discard, Cancel in that order with Save as the default. */
/**
 * REQ-SHELL-073 / REQ-MONITOR-072 (Part R): the Interface category's "Agent pop-out" preference — off, an agent click
 * selects it in the inspector; on, it opens or raises the persona window. Written through the preference command at once
 * (ADR-0042), outside Save and Discard, like the theme and the motion setting beside it.
 */
export function AgentPopOutToggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="settings__action" data-testid="agent-pop-out">
      <span id="agent-pop-out-label">Agent pop-out</span>
      <button type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-labelledby="agent-pop-out-label" aria-checked={on} aria-description={`Agent pop-out is ${on ? 'enabled' : 'disabled'}.`} data-testid="agent-pop-out-toggle" onClick={() => onChange(!on)} />
      <span className="text-secondary settings__hint">On, clicking an agent opens or raises its persona window; off, a click selects it in the inspector only. Explicit Pop out always opens the window.</span>
    </div>
  );
}

export function UnsavedGuardDialog({ onSave, onDiscard, onCancel }: { onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title">
        <h2 id="unsaved-title" className="dialog-title">Save settings before leaving?</h2>
        <p className="dialog-body">There are unsaved settings changes. Save them, discard them, or stay on this screen.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" autoFocus onClick={onSave}>Save</button>
          <button type="button" className="btn btn-secondary" onClick={onDiscard}>Discard</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
