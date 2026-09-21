import { PUBLIC_TOOL_NAMES, TOOL_IMPLEMENTATIONS, type ConfigSnapshot, type InstructionStateName } from '@rotaris/contracts';
import { Table as DesignTable, ToggleSwitch } from '../design-system/index.js';

/**
 * The inventories (REQ-CONFIG-276, REQ-CONFIG-277, REQ-TOOLS-165). Three columns — Name, Source,
 * Description — an explanatory empty state instead of an empty table, and no control that authors anything:
 * REQ-CONFIG-464 makes that a decision rather than a gap, so each empty state names the file or folder the user
 * would edit instead (REQ-CONFIG-437). Everything an entry says is carried in text, never by colour alone
 * (REQ-SHELL-149).
 *
 * **Instructions is no longer one of the read-only ones** (`PD-WORKSPACE-002`, narrowing REQ-CONFIG-276 and
 * REQ-CONFIG-277): it renders a fourth column carrying a per-file switch, and draws its own table rather than
 * `InventoryTable` because the shared one is exactly the three-column read-only shape the requirement fixes
 * and widening it would quietly widen Plugins and Tools too. It still authors nothing — the switch edits a
 * policy over files it neither creates nor deletes, and the empty state still names the file to write.
 *
 * Two of the four inventories REQ-CONFIG-276 names are here. **Hooks** has its own surface already
 * (REQ-CONFIG-354). **Plugins** is not built: REQ-TOOLS-165 requires the tab to list exactly the files the host
 * process would load and to name the personas whose `custom_tools:` list each one, so it stands on
 * REQ-TOOLS-161's loader (ADR-0025), which no code in this tree executes. Listing the folder without the loader
 * would advertise files the loader might reject, which that requirement forbids in as many words.
 */
export interface InventoryEntry {
  readonly name: string;
  readonly source: string;
  readonly description: string;
}

export function InventoryTable({ label, entries, empty }: { label: string; entries: readonly InventoryEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="text-secondary" data-testid="inventory-empty">{empty}</p>;
  return (
    <DesignTable className="table settings__grid" aria-label={label}>
      <thead><tr><th>Name</th><th>Source</th><th>Description</th></tr></thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.name} data-testid="inventory-row" data-name={e.name} data-source={e.source}>
            <td className="mono">{e.name}</td>
            <td className="text-secondary">{e.source}</td>
            <td title={e.description}>{e.description}</td>
          </tr>
        ))}
      </tbody>
    </DesignTable>
  );
}

/**
 * PD-WORKSPACE-002: the workspace's, the global directory's and the home- and machine-wide bases'
 * `AGENTS.md` / `CLAUDE.md` files where they exist, each described by its absolute path and carrying
 * a per-file on/off switch. Empty without a workspace. The snapshot carries the presence check plus
 * the on/off state, so this draws what it is given and probes nothing.
 */
export interface InstructionsSettingsProps {
  readonly snapshot: ConfigSnapshot | null;
  readonly workspace: string | null;
  /**
   * The PENDING policy, as the screen holds it — bound to this and not to the snapshot's rows, so a
   * choice the user has not saved yet does not snap back the moment the screen redraws (the same rule
   * the Skills category follows).
   */
  readonly pending?: Readonly<Record<string, InstructionStateName>> | undefined;
  /** A switch change joins the pending settings; Save writes it (PD-WORKSPACE-002). */
  readonly onToggle?: ((id: string, value: InstructionStateName) => void) | undefined;
}

export function InstructionsSettings({ snapshot, workspace, pending, onToggle }: InstructionsSettingsProps) {
  /*
   * A row's switch shows the per-file POLICY, never the row's `enabled` — those two differ exactly when
   * the master switch is off, and a switch drawn from `enabled` would then read off for every file while
   * the policy said on, so flipping one would write a value the file already held and the screen would
   * say nothing about why. The master switch is stated in words below instead (it is file-edited: the
   * desktop save does not write `inject_agents_md`, REQ-CONFIG-256).
   */
  const policy = snapshot?.instructionsPolicy.overrides ?? {};
  const injecting = snapshot?.injectAgentsMd ?? true;
  const rows = (snapshot?.instructions ?? []).map((f) => ({
    ...f,
    switchedOn: pending?.[f.id] ?? policy[f.id] ?? 'on',
  }));
  if (rows.length === 0) {
    return (
      <div className="settings__section">
        <h1 className="display">Instructions</h1>
        <p className="text-secondary">
          The instruction files reaching every agent built in this workspace. Switch a file off to keep it
          on disk while taking it out of what agents are given.
        </p>
        <p className="text-secondary" data-testid="inventory-empty">{workspace === null
          ? 'No workspace is open, so there are no instruction files to list.'
          : `No instruction files. Create AGENTS.md in ${workspace} to give every agent standing instructions, and AGENTS.override.md beside it for instructions that take precedence.`}</p>
      </div>
    );
  }
  return (
    <div className="settings__section">
      <h1 className="display">Instructions</h1>
      <p className="text-secondary">
        The instruction files reaching every agent built in this workspace — this project's pair, the
        global pair, and your own and machine-wide files. Switch a file off to keep it on disk while
        taking it out of what agents are given; the change applies on Save.
      </p>
      {injecting ? null : (
        <p className="text-secondary" data-testid="instructions-master-off">
          Injection is switched off for this workspace, so no instruction file is read whatever these
          switches say. Set <span className="mono">inject_agents_md: true</span> in{' '}
          <span className="mono">{workspace === null ? '.rotaris/agents.yaml' : `${workspace}/.rotaris/agents.yaml`}</span> to
          turn it back on.
        </p>
      )}
      <DesignTable className="table settings__grid" aria-label="Instruction files">
        <thead><tr><th>Name</th><th>Source</th><th>Description</th><th>Enabled</th></tr></thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} data-testid="inventory-row" data-name={f.name} data-source={f.source}>
              <td className="mono">{f.name}</td>
              <td className="text-secondary">{f.source}</td>
              <td title={f.path}>{f.path}</td>
              <td>
                <ToggleSwitch
                  checked={f.switchedOn === 'on'}
                  onChange={(value) => onToggle?.(f.id, value ? 'on' : 'off')}
                  label={`Enable ${f.id}`}
                  aria-description={`Controls whether ${f.path} is injected into newly created agents`}
                  disabled={workspace === null || onToggle === undefined}
                  data-testid="instruction-toggle"
                  data-id={f.id}
                  data-on={f.switchedOn === 'on' ? 'true' : 'false'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </DesignTable>
    </div>
  );
}

/**
 * REQ-CONFIG-277 / REQ-TOOLS-165: every built-in public tool name sorted alphabetically, source `built-in`, the
 * runtime target as description. **Populated unconditionally**, workspace or none — the requirement says so, and
 * it is the one thing here that is true before anything is configured.
 */
export function ToolsSettings() {
  const entries: InventoryEntry[] = [...PUBLIC_TOOL_NAMES]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      source: 'built-in',
      description: TOOL_IMPLEMENTATIONS[name] ?? 'Declared, with no executor registered in this build; agents are not offered it.',
    }));
  return (
    <div className="settings__section">
      <h1 className="display">Tools</h1>
      <p className="text-secondary">
        The tools this build implements. Which of them a given agent may call is settled by its persona and by the permission
        policy, not here — this is the catalogue the rest of that machinery draws from.
      </p>
      <InventoryTable label="Built-in tools" entries={entries} empty="This build registers no built-in tools." />
    </div>
  );
}
