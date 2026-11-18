import type { ConfigSnapshot } from '@rotaris/contracts';
import { Button as DesignButton } from '../design-system/index.js';
import type { HooksSettingsProps } from '../HooksSettings.js';
import type { ConfigSettingsProps } from './ConfigSettings.js';
import type { McpSettingsProps } from './McpSettings.js';
import { SETTINGS_PAGES, type SettingsPageId } from './pages.js';
import { projectInitCard } from './project-init.js';
import type { ProjectInitSettingsProps } from './ProjectSettings.js';
import type { SkillsSettingsProps } from './SkillsSettings.js';

/**
 * PD-CONFIG-012 clause 2: the Setup page. It states three things and holds no setting of its own: what stands between
 * this workspace and a run (or waits on the user), what differs from the built-in defaults, and what the workspace
 * holds. Every line opens the page that holds what it names.
 */
export interface SetupAttention {
  readonly id: string;
  /** `blocks`: a run cannot start. `waits`: something declared cannot work until the user acts. */
  readonly kind: 'blocks' | 'waits';
  readonly title: string;
  readonly detail: string;
  readonly page: SettingsPageId;
  readonly action: string;
}

/** What needs attention, the blocking items first; each from a fact another page already draws. */
export function setupAttention(input: {
  readonly config?: ConfigSettingsProps | undefined;
  readonly mcp?: McpSettingsProps | undefined;
  readonly projectInit?: ProjectInitSettingsProps | undefined;
  readonly storeHeld: 'missing' | 'corrupt' | null;
  readonly providerSignedIn: boolean | null;
}): readonly SetupAttention[] {
  const out: SetupAttention[] = [];
  const snapshot = input.config?.snapshot ?? null;
  if (snapshot !== null && !snapshot.loadOk) out.push({ id: 'config', kind: 'blocks', title: 'Configuration could not be loaded', detail: snapshot.fatal ?? '', page: 'models', action: 'Open Models' });
  if (input.providerSignedIn === false) out.push({ id: 'provider', kind: 'blocks', title: 'No model provider is signed in', detail: 'Runs cannot start until one is.', page: 'models', action: 'Add a provider' });
  if (input.storeHeld === 'missing') out.push({ id: 'store', kind: 'blocks', title: 'The session store is not in its place', detail: 'Restore a backup or start a new store.', page: 'store', action: 'Open Session store' });
  if (input.storeHeld === 'corrupt') out.push({ id: 'store', kind: 'blocks', title: 'The session store failed its integrity check', detail: 'Restore a backup or set the damaged store aside.', page: 'store', action: 'Open Session store' });
  const search = input.mcp?.listing?.rows.find((row) => row.name === 'web_search') ?? null;
  if (search !== null && search.unresolved.length > 0) out.push({ id: 'web-search', kind: 'waits', title: 'Web search needs a key', detail: search.availabilityDetail, page: 'tools', action: 'Set up' });
  const init = input.projectInit?.state ?? null;
  if (init !== null) {
    const card = projectInitCard(init.view, init.labels);
    if (card.state === 'failed') out.push({ id: 'init', kind: 'waits', title: 'Project initialization did not finish', detail: card.headline, page: 'initialization', action: 'Open' });
    if (card.state === 'pending') out.push({ id: 'init', kind: 'waits', title: 'Project initialization has not run', detail: card.headline, page: 'initialization', action: 'Open' });
  }
  return out;
}

/** The labels of the runtime keys the pages draw; a key with no label is stated as the file writes it. */
const RUNTIME_LABELS: Readonly<Record<string, readonly [string, SettingsPageId]>> = {
  max_depth: ['Depth cap', 'delegation'], max_active_children: ['Fan-out limit', 'delegation'], child_timeout: ['Per-agent timeout', 'delegation'],
  max_iterations: ['Iteration cap', 'delegation'], run_start_mode: ['Run-start mode', 'delegation'], keep_going: ['Keep going', 'delegation'],
  permission_mode: ['Permission mode', 'permissions'], allow_outside_workspace: ['Allow outside workspace', 'permissions'],
  sandbox_mode: ['Sandbox mode', 'permissions'], sandbox_writable_roots: ['Writable roots', 'permissions'], sandbox_network_access: ['Allow network in sandbox', 'permissions'],
  egress_policy: ['Egress policy', 'permissions'], egress_allow: ['Allowed hosts', 'permissions'], egress_deny: ['Denied hosts', 'permissions'],
  improvement_collector_enabled: ['Improvement loop', 'review'], improvement_collector_timeout: ['Improvement analysis timeout', 'review'],
  memory_diagnostics_enabled: ['Memory diagnostics', 'delegation'],
};
const stated = (value: unknown): string => Array.isArray(value) ? `${value.length} ${value.length === 1 ? 'entry' : 'entries'}` : typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value);

export interface SetupChange { readonly label: string; readonly value: string; readonly scope: 'workspace' | 'global'; readonly page: SettingsPageId; readonly code: boolean }

/** What a configuration file states in place of a built-in default: slots, roles and the runtime mapping, as the snapshot reports their origin. */
export function changedFromDefaults(snapshot: ConfigSnapshot | null): readonly SetupChange[] {
  if (snapshot === null || !snapshot.loadOk) return [];
  const out: SetupChange[] = [];
  for (const slot of snapshot.slots) {
    if ((slot.origin === 'workspace' || slot.origin === 'global') && slot.value !== null) out.push({ label: slot.slot, value: slot.value, scope: slot.origin, page: 'models', code: true });
  }
  for (const role of snapshot.roles) {
    if ((role.modelOrigin === 'workspace' || role.modelOrigin === 'global') && role.rawModel !== null) out.push({ label: `${role.role}: model`, value: role.rawModel, scope: role.modelOrigin, page: 'personas', code: true });
    if ((role.thinkingOrigin === 'workspace' || role.thinkingOrigin === 'global') && role.rawThinking !== null) out.push({ label: `${role.role}: reasoning`, value: role.rawThinking, scope: role.thinkingOrigin, page: 'personas', code: true });
  }
  for (const scope of ['workspace', 'global'] as const) {
    const raw = snapshot.rawRuntime[scope];
    if (raw === null) continue;
    for (const [key, value] of Object.entries(raw)) {
      if (scope === 'global' && snapshot.rawRuntime.workspace !== null && key in snapshot.rawRuntime.workspace) continue;
      const named = RUNTIME_LABELS[key];
      out.push({ label: named?.[0] ?? key, value: stated(value), scope, page: named?.[1] ?? 'delegation', code: named === undefined });
    }
  }
  return out;
}

export interface SetupCount { readonly label: string; readonly value: string; readonly page: SettingsPageId }

/** What the workspace holds, as the pages that list it count it; a count not yet read is left out. */
export function workspaceCounts(input: { readonly config?: ConfigSettingsProps | undefined; readonly mcp?: McpSettingsProps | undefined; readonly skills?: Omit<SkillsSettingsProps, 'workspace'> | undefined; readonly hooks?: HooksSettingsProps | undefined }): readonly SetupCount[] {
  const out: SetupCount[] = [];
  const snapshot = input.config?.snapshot ?? null;
  if (snapshot !== null && snapshot.loadOk) {
    out.push({ label: 'Personas', value: String(snapshot.roles.length), page: 'personas' });
    out.push({ label: 'Instruction files', value: String(snapshot.instructions.length), page: 'instructions' });
  }
  const skills = input.skills?.state ?? null;
  if (skills !== null) out.push({ label: 'Portable skills', value: skills.skipped.length === 0 ? String(skills.skills.length) : `${skills.skills.length}, ${skills.skipped.length} skipped`, page: 'instructions' });
  const rows = input.mcp?.listing?.rows ?? null;
  if (rows !== null) out.push({ label: 'Tool servers', value: `${rows.length}, ${rows.filter((r) => r.enabled && !r.overridden).length} on`, page: 'tools' });
  return out;
}

export function SetupPage({ attention, changed, counts, onOpen }: { readonly attention: readonly SetupAttention[]; readonly changed: readonly SetupChange[]; readonly counts: readonly SetupCount[]; readonly onOpen: (page: SettingsPageId) => void }) {
  const pageLabel = (id: SettingsPageId) => SETTINGS_PAGES.find((p) => p.id === id)!.label;
  return (
    <div className="settings__section setup" data-testid="settings-setup">
      {attention.length === 0
        ? <p className="setup__clear" role="status" data-testid="setup-clear"><i className="ph ph-check-circle" aria-hidden="true" />Nothing needs attention.</p>
        : (
          <ul className="setup__attention" aria-label="Needs attention">
            {attention.map((item) => (
              <li key={item.id} className="setup__item" data-setup-item={item.id} data-kind={item.kind}>
                <i className={`ph ${item.kind === 'blocks' ? 'ph-x-circle' : 'ph-warning'} setup__glyph`} role="img" aria-label={item.kind === 'blocks' ? 'Blocks runs' : 'Needs attention'} title={item.kind === 'blocks' ? 'Blocks runs' : 'Needs attention'} />
                <span className="setup__title" title={item.detail}>{item.title}</span>
                <DesignButton type="button" className="btn btn-secondary" aria-description={item.detail} onClick={() => onOpen(item.page)}>{item.action}</DesignButton>
              </li>
            ))}
          </ul>
        )}
      <div className="setup__columns">
        <section aria-labelledby="setup-changed">
          <h2 className="settings__subtitle" id="setup-changed">Changed</h2>
          {changed.length === 0
            ? <p className="text-tertiary setup__none" data-testid="setup-unchanged">Everything is at its built-in default.</p>
            : (
              <ul className="setup__list">
                {changed.map((c) => (
                  <li key={`${c.scope}:${c.label}`}>
                    <DesignButton type="button" className="setup__line" aria-description={`Set in the ${c.scope} configuration. Opens ${pageLabel(c.page)}.`} onClick={() => onOpen(c.page)}>
                      <span className={c.code ? 'mono' : undefined}>{c.label}</span>
                      <span className="setup__value"><span className="mono">{c.value}</span><i className={`ph ${c.scope === 'workspace' ? 'ph-folder' : 'ph-user'}`} role="img" aria-label={c.scope === 'workspace' ? 'Set for this workspace' : 'Set in your global configuration'} title={c.scope === 'workspace' ? 'Set for this workspace' : 'Set in your global configuration'} /></span>
                    </DesignButton>
                  </li>
                ))}
              </ul>
            )}
        </section>
        <section aria-labelledby="setup-workspace">
          <h2 className="settings__subtitle" id="setup-workspace">Workspace</h2>
          <ul className="setup__list">
            {counts.map((c) => (
              <li key={c.label}>
                <DesignButton type="button" className="setup__line" aria-description={`Opens ${pageLabel(c.page)}.`} onClick={() => onOpen(c.page)}>
                  <span>{c.label}</span><span className="setup__value mono">{c.value}</span>
                </DesignButton>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
