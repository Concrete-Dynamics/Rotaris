import { useState, type ReactNode } from 'react';
import { isBusy, type SessionRecord, type Theme, type ThemeName } from '@rotaris/contracts';
import { HooksSettings, type HooksSettingsProps } from './HooksSettings.js';
import { ModelsSettings, PersonasSettings, RuntimeSettings, SaveBar, type ConfigSettingsProps } from './settings/ConfigSettings.js';
import { DisplaySettings, type DisplaySettingsProps } from './settings/DisplaySettings.js';
import { InstructionsSettings, ToolsSettings, type InstructionsSettingsProps } from './settings/Inventories.js';
import { AboutSettings, type AboutSettingsProps } from './settings/About.js';
import { McpSettings, type McpSettingsProps } from './settings/McpSettings.js';
import { SkillsSettings, type SkillsSettingsProps } from './settings/SkillsSettings.js'; // ADR-0063
import { ProjectInitSettings, TraceabilitySettings, type ProjectInitSettingsProps, type TraceabilitySettingsProps } from './settings/ProjectSettings.js'; // Part AJ2, Part AS
import type { PlaybookCatalogue } from '@rotaris/contracts';
import { useShellState } from './shell-state.js';
import { RUNTIME_CATEGORY_LABEL } from './settings/config-state.js';
import { Button as DesignButton, Select as DesignSelect } from './design-system/index.js';

/**
 * The Settings view: the thirteen categories in REQ-CONFIG-268's order with
 * REQ-CONFIG-269's identifiers, as a vertical navigation list (REQ-SHELL-153:
 * the selected entry marked by a rule down its left edge and described so in
 * words), and the Project category hosting REQ-SESSION-201's two actions —
 * back up the session store, restore one. Structure from docs/spec; language
 * from docs/design/system. A disabled action names the condition that
 * disables it (REQ-NOTIFY-008).
 *
 * REQ-CONFIG-270: Save, Discard and the save-status indicator are rendered
 * **once, above the category body**, so no category's own content can push
 * them out of view and every category shows them. Part AG moved them here
 * from inside Models, Personas and Runtime.
 *
 * Part AG draws Display (REQ-CONFIG-403/472), Instructions and Tools
 * (REQ-CONFIG-276/277) and About (REQ-CONFIG-398, REQ-SHELL-138..143);
 * ADR-0063 draws **Skills** (REQ-WORKSPACE-067, 068, 069, 151).
 *
 * **Plugins** is the one category still the placeholder, and it waits on a
 * mechanism rather than on drawing: REQ-TOOLS-161's loader (ADR-0025), without
 * which REQ-TOOLS-165's rule that the tab list exactly what the loader accepts
 * can never be kept. Listing the folder without the loader would advertise
 * files the loader might reject, which that requirement forbids in as many
 * words.
 */
export const SETTINGS_CATEGORIES = [
  { id: 'models', label: 'Models' },
  { id: 'personas', label: 'Personas' },
  { id: 'runtime', label: RUNTIME_CATEGORY_LABEL },
  { id: 'interface', label: 'Interface' },
  { id: 'display', label: 'Display' },
  { id: 'skills', label: 'Skills' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'tools', label: 'Tools' },
  { id: 'project', label: 'Project' },
  { id: 'about', label: 'About' },
] as const;
export type SettingsCategoryId = (typeof SETTINGS_CATEGORIES)[number]['id'];

export interface SettingsViewProps {
  readonly session: SessionRecord | null;
  readonly workspace: string | null;
  readonly onBackup: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onRestore: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * OQ-281 (ruled 2026-10-14 under R-072), REQ-SESSION-202: this window's open holds `workspace.store-missing` — the place for
   * the store exists and the store is not in it. The restore stays offered (and is admitted by main), and the deliberate
   * "Start a new session store…" appears beside it, only now.
   */
  readonly storeMissing?: boolean | undefined;
  readonly onEstablishStore?: (() => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** ADR-0015: the Hooks category's data and actions, owned by the renderer root. */
  readonly hooks?: HooksSettingsProps | undefined;
  /** REQ-ORCH-026: the built-in playbook catalogue — every slot, every variant, the text — listed under Personas. */
  readonly playbooks?: PlaybookCatalogue | null | undefined;
  readonly themes?: readonly Theme[] | undefined;
  readonly activeTheme?: ThemeName | undefined;
  readonly onTheme?: ((name: ThemeName) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly reducedMotion?: boolean | undefined;
  readonly onReducedMotion?: ((value: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly initialCategory?: SettingsCategoryId | undefined;
  readonly onCategory?: ((id: SettingsCategoryId) => void) | undefined;
  /** ADR-0037: destination 1 — the configuration the Models, Personas and Runtime categories edit. */
  readonly config?: ConfigSettingsProps | undefined;
  /** ADR-0034 (Part S): the MCP Servers category, answered by the run host. */
  readonly mcp?: McpSettingsProps | undefined;
  /** REQ-CONFIG-403 (Part AG): the Display category's two desktop preferences and their writers. */
  readonly display?: Omit<DisplaySettingsProps, 'config'> | undefined;
  /** REQ-SHELL-138..143 (Part AG): the About page's local data and its two openers. */
  readonly about?: AboutSettingsProps | undefined;
  /** Part R: the Interface category's further preference controls (the agent pop-out toggle), supplied by the renderer root. */
  readonly interfaceExtras?: ReactNode;
  /** Part AJ2: the Project category's traceability card (REQ-TRACE-508..511), its two commands supplied by the renderer root. */
  readonly traceability?: TraceabilitySettingsProps | undefined;
  /** ADR-0063: the Skills category — the catalog the run host answered and the four things the tab can do. */
  readonly skills?: Omit<SkillsSettingsProps, 'workspace'> | undefined;
  /** PD-WORKSPACE-002: the Instructions category — the pending per-file switches and their setter. */
  readonly instructions?: Omit<InstructionsSettingsProps, 'snapshot' | 'workspace'> | undefined;
  /** Part AS: the Project category's initialization card (REQ-WORKSPACE-114/115). */
  readonly projectInit?: ProjectInitSettingsProps | undefined;
}

export function SettingsView({ session, workspace, onBackup, onRestore, storeMissing = false, onEstablishStore, hooks, playbooks, themes = [], activeTheme, onTheme, reducedMotion = false, onReducedMotion, initialCategory = 'models', onCategory, config, mcp, display, about, interfaceExtras, traceability /* Part AJ2 */, skills /* ADR-0063 */, instructions /* PD-WORKSPACE-002 */, projectInit /* Part AS */ }: SettingsViewProps) {
  const [chosen, setChosen] = useState<SettingsCategoryId>(initialCategory);
  // A category a notice action asked for (REQ-NOTIFY-223) selects itself until the user picks another; no effect, no cascade.
  const wanted = useShellState((s) => s.settingsCategory);
  const take = useShellState((s) => s.takeSettingsCategory);
  const category: SettingsCategoryId = wanted !== null && SETTINGS_CATEGORIES.some((c) => c.id === wanted) ? (wanted as SettingsCategoryId) : chosen;
  const setCategory = (id: SettingsCategoryId) => { take(); setChosen(id); onCategory?.(id); };
  const [busyAction, setBusyAction] = useState<'backup' | 'restore' | 'establish' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeName | undefined>(activeTheme);
  const runActive = session !== null && isBusy(session.executionStatus);
  const noWorkspace = workspace === null;
  const disabledReason = noWorkspace ? 'Open a workspace first.' : runActive ? 'Finish the active run first.' : null;

  const act = async (which: 'backup' | 'restore' | 'establish') => {
    setBusyAction(which);
    setMessage(null);
    const r = await (which === 'backup' ? onBackup() : which === 'restore' ? onRestore() : (onEstablishStore?.() ?? Promise.resolve({ ok: true as const })));
    setBusyAction(null);
    if (!r.ok) setMessage(r.reason);
  };

  const chooseTheme = async (name: ThemeName) => {
    setSelectedTheme(name);
    const result = await onTheme?.(name);
    if (result && !result.ok) setMessage(result.reason);
  };

  const chooseMotion = async (value: boolean) => {
    const result = await onReducedMotion?.(value);
    if (result && !result.ok) setMessage(result.reason);
  };

  return (
    <div className="settings">
      <nav className="settings__categories" aria-label="Settings categories">
        <ul className="nav-list" role="listbox" aria-label="Categories">
          {SETTINGS_CATEGORIES.map((c) => {
            const selected = c.id === category;
            return (
              <li key={c.id}>
                <DesignButton
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-description={selected ? 'Selected, marked with a rule down its left edge.' : 'Not selected.'}
                  className={`nav-list__item${selected ? ' is-selected' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </DesignButton>
              </li>
            );
          })}
        </ul>
      </nav>
      <section className="settings__body" aria-label={SETTINGS_CATEGORIES.find((c) => c.id === category)!.label}>
        {/* REQ-CONFIG-270: one bar, above every category's content, acting on the whole set of pending changes. */}
        {config && <SaveBar dirty={config.dirty} serviceAvailable={config.serviceAvailable} onSave={config.onSave} onDiscard={config.onDiscard} />}
        {category === 'interface' ? (
          <div className="settings__section">
            <h1 className="display">Interface</h1>
            <h2 className="settings__heading">Appearance</h2>
            <div className="settings__action">
              <label htmlFor="theme-select">Theme</label>
              <DesignSelect
                id="theme-select"
                className="input select settings__select"
                aria-label="Theme"
                aria-description="Choose the colour theme used by every Rotaris window."
                value={selectedTheme}
                onChange={(event) => { void chooseTheme(event.currentTarget.value as ThemeName); }}
              >
                {themes.map((theme) => <option key={theme.name} value={theme.name}>{theme.label}</option>)}
              </DesignSelect>
              <span className="text-secondary settings__hint">{themes.find((theme) => theme.name === selectedTheme)?.description ?? 'Choose a registered theme.'}</span>
            </div>
            <div className="settings__action">
              <span>Reduce motion</span>
              <DesignButton type="button" className={`toggle${reducedMotion ? ' is-on' : ''}`} role="switch" aria-label="Reduce motion" aria-checked={reducedMotion} onClick={() => { void chooseMotion(!reducedMotion); }} />
              <span className="text-secondary settings__hint">Every animation collapses to its end state. The operating-system setting is inherited until you choose here.</span>
            </div>
            {interfaceExtras}
            <div className="settings__action">
              <DesignButton type="button" className="btn btn-secondary" onClick={() => setMessage('Panel sizes already use their declared defaults; no divider is registered yet.')}>Reset panel sizes</DesignButton>
              <span className="text-secondary settings__hint">Restores every resizable pane to its default size and takes effect immediately.</span>
            </div>
            {message && <div className="composer__error" role="status">{message}</div>}
          </div>
        ) : category === 'project' ? (
          <div className="settings__section">
            <h1 className="display">Project</h1>
            <h2 className="settings__heading">Session store</h2>
            <p className="text-secondary">
              This workspace's sessions live in a store on this machine, found by the identifier in <code className="mono">.rotaris/workspace-id</code>.
              Copying or syncing the workspace folder does not carry them; a backup does.
            </p>
            <div className="settings__actions">
              <div className="settings__action">
                <DesignButton type="button" className="btn btn-secondary" disabled={busyAction !== null || noWorkspace} title={noWorkspace ? disabledReason ?? undefined : undefined} onClick={() => { void act('backup'); }}>
                  {busyAction === 'backup' ? 'Backing up…' : 'Back up session store…'}
                </DesignButton>
                <span className="text-secondary settings__hint">One file, the whole store. Valid while a run is live.{noWorkspace ? ` ${disabledReason}` : ''}</span>
              </div>
              <div className="settings__action">
                <DesignButton type="button" className="btn btn-secondary" disabled={busyAction !== null || disabledReason !== null} title={disabledReason ?? undefined} onClick={() => { void act('restore'); }}>
                  {busyAction === 'restore' ? 'Restoring…' : 'Restore session store…'}
                </DesignButton>
                <span className="text-secondary settings__hint">
                  {storeMissing
                    ? 'The store is not in its place. Restoring moves what is in that place aside, keeps it, and puts the backup\'s sessions there.'
                    : 'Replaces this workspace\'s store with a backup; the previous store is kept. Refused while a run is live.'}
                  {disabledReason ? ` ${disabledReason}` : ''}
                </span>
              </div>
              {/* OQ-281: offered only while the open holds a place with no store; main asks first, Cancel the default. */}
              {storeMissing && onEstablishStore ? (
                <div className="settings__action" data-ui="settings-establish-store">
                  <DesignButton type="button" className="btn btn-secondary" disabled={busyAction !== null} onClick={() => { void act('establish'); }}>
                    {busyAction === 'establish' ? 'Starting…' : 'Start a new session store…'}
                  </DesignButton>
                  <span className="text-secondary settings__hint">Starts an empty store in that place and recovers nothing that may have been there; what is in the place now is moved aside and kept.</span>
                </div>
              ) : null}
            </div>
            {message && <div className="composer__error" role="alert">{message}</div>}
            {/* Part AS — REQ-WORKSPACE-114's "Project initialization" card, above the traceability one: it is the
                state a user comes to this category to see, and REQ-WORKSPACE-101's classification sentence lives on it. */}
            {projectInit ? <ProjectInitSettings {...projectInit} /> : null}
            {/* Part AJ2 — the traceability card (REQ-TRACE-508..511), a card of this category as REQ-CONFIG-390 shapes one. */}
            {traceability ? <TraceabilitySettings {...traceability} /> : null}
          </div>
        ) : category === 'hooks' && hooks ? (
          <HooksSettings {...hooks} />
        ) : category === 'mcp' && mcp ? (
          <McpSettings {...mcp} />
        ) : category === 'skills' && skills ? (
          <SkillsSettings {...skills} workspace={workspace} />
        ) : category === 'models' && config ? (
          <ModelsSettings {...config} />
        ) : category === 'runtime' && config ? (
          <RuntimeSettings {...config} />
        ) : category === 'display' && display ? (
          <DisplaySettings {...display} config={config} />
        ) : category === 'instructions' ? (
          <InstructionsSettings snapshot={config?.snapshot ?? null} workspace={workspace} {...instructions} />
        ) : category === 'tools' ? (
          <ToolsSettings />
        ) : category === 'about' && about ? (
          <AboutSettings {...about} />
        ) : category === 'personas' ? (
          <div className="settings__section">
            {config ? <PersonasSettings {...config} /> : <h1 className="display">Personas</h1>}
            <h2 className="settings__heading">Playbook catalogue</h2>
            <p className="text-secondary">
              Every role's instructions carry a playbook of eight slots chosen by role, classified intent and model tier. This is the built-in catalogue —
              what an override in <code className="mono">playbooks/</code> (your global configuration directory or this workspace's <code className="mono">.rotaris/</code>) may re-word: a slot, a variant identifier, its text. An override may not add a slot or a variant.
            </p>
            {playbooks ? Object.entries(playbooks).map(([slot, variants]) => (
              <section key={slot} className="playbooks__slot" aria-label={`Slot ${slot}`}>
                <h3 className="mono">{slot}</h3>
                {Object.entries(variants).map(([variant, text]) => (
                  <div key={variant} className="playbooks__variant"><span className="mono text-secondary">{variant}</span><span>{text}</span></div>
                ))}
              </section>
            )) : <p className="text-secondary">Reading the catalogue…</p>}
          </div>
        ) : (
          <div className="view__empty">
            <h1 className="display">{SETTINGS_CATEGORIES.find((c) => c.id === category)!.label}</h1>
            {/* Plugins says what it is waiting for, because it is not waiting to be drawn. */}
            <p className="text-secondary">
              {category === 'plugins'
                ? 'This build loads no tool plugins yet. The inventory lists what the host process would load, so it appears with the plugin loader — a list of files nothing can load would say less than nothing.'
                : 'Not drawn yet. Structure from REQ-CONFIG-268; language from docs/design/system.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
