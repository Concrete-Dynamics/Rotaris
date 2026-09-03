import { useState } from 'react';
import { isBusy, type SessionRecord } from '@rotaris/contracts';

/**
 * The Settings view, at the point the mechanism has reached: the thirteen
 * categories in REQ-CONFIG-268's order with REQ-CONFIG-269's identifiers, as
 * a vertical navigation list (REQ-SHELL-153: the selected entry marked by a
 * rule down its left edge and described so in words), and the Project
 * category hosting REQ-SESSION-201's two actions — back up the session store,
 * restore one. The rest of the categories are drawing work against
 * docs/design/README.md §3.2. Structure from docs/spec; language from
 * docs/design/system. A disabled action names the condition that disables it
 * (REQ-NOTIFY-008).
 */
export const SETTINGS_CATEGORIES = [
  { id: 'models', label: 'Models' },
  { id: 'personas', label: 'Personas' },
  { id: 'runtime', label: 'Runtime' },
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
}

export function SettingsView({ session, workspace, onBackup, onRestore }: SettingsViewProps) {
  // REQ-CONFIG-271: the selected category persists user-wide; until the preference store lands, `models` is the start.
  const [category, setCategory] = useState<SettingsCategoryId>('models');
  const [busyAction, setBusyAction] = useState<'backup' | 'restore' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runActive = session !== null && isBusy(session.executionStatus);
  const noWorkspace = workspace === null;
  const disabledReason = noWorkspace ? 'Open a workspace first.' : runActive ? 'Finish the active run first.' : null;

  const act = async (which: 'backup' | 'restore') => {
    setBusyAction(which);
    setMessage(null);
    const r = await (which === 'backup' ? onBackup() : onRestore());
    setBusyAction(null);
    if (!r.ok) setMessage(r.reason);
  };

  return (
    <div className="settings">
      <nav className="settings__categories" aria-label="Settings categories">
        <ul className="nav-list" role="listbox" aria-label="Categories">
          {SETTINGS_CATEGORIES.map((c) => {
            const selected = c.id === category;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-description={selected ? 'Selected, marked with a rule down its left edge.' : 'Not selected.'}
                  className={`nav-list__item${selected ? ' is-selected' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <section className="settings__body" aria-label={SETTINGS_CATEGORIES.find((c) => c.id === category)!.label}>
        {category === 'project' ? (
          <div className="settings__section">
            <h1 className="display">Project</h1>
            <h2 className="settings__heading">Session store</h2>
            <p className="text-secondary">
              This workspace's sessions live in a store on this machine, found by the identifier in <code className="mono">.rotaris/workspace-id</code>.
              Copying or syncing the workspace folder does not carry them; a backup does.
            </p>
            <div className="settings__actions">
              <div className="settings__action">
                <button type="button" className="btn btn-secondary" disabled={busyAction !== null || noWorkspace} title={noWorkspace ? disabledReason ?? undefined : undefined} onClick={() => { void act('backup'); }}>
                  {busyAction === 'backup' ? 'Backing up…' : 'Back up session store…'}
                </button>
                <span className="text-secondary settings__hint">One file, the whole store. Valid while a run is live.{noWorkspace ? ` ${disabledReason}` : ''}</span>
              </div>
              <div className="settings__action">
                <button type="button" className="btn btn-secondary" disabled={busyAction !== null || disabledReason !== null} title={disabledReason ?? undefined} onClick={() => { void act('restore'); }}>
                  {busyAction === 'restore' ? 'Restoring…' : 'Restore session store…'}
                </button>
                <span className="text-secondary settings__hint">Replaces this workspace's store with a backup; the previous store is kept. Refused while a run is live.{disabledReason ? ` ${disabledReason}` : ''}</span>
              </div>
            </div>
            {message && <div className="composer__error" role="alert">{message}</div>}
          </div>
        ) : (
          <div className="view__empty">
            <h1 className="display">{SETTINGS_CATEGORIES.find((c) => c.id === category)!.label}</h1>
            <p className="text-secondary">Not drawn yet. Structure from REQ-CONFIG-268; language from docs/design/system.</p>
          </div>
        )}
      </section>
    </div>
  );
}
