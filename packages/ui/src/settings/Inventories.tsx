import { PUBLIC_TOOL_NAMES, TOOL_IMPLEMENTATIONS, type ConfigSnapshot } from '@rotaris/contracts';

/**
 * The read-only inventories (REQ-CONFIG-276, REQ-CONFIG-277, REQ-TOOLS-165). Three columns — Name, Source,
 * Description — an explanatory empty state instead of an empty table, and no control that authors anything:
 * REQ-CONFIG-464 makes that a decision rather than a gap, so each empty state names the file or folder the user
 * would edit instead (REQ-CONFIG-437). Everything an entry says is carried in text, never by colour alone
 * (REQ-SHELL-149).
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
    <table className="table settings__grid" aria-label={label}>
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
    </table>
  );
}

/**
 * REQ-CONFIG-277: the workspace's `AGENTS.md` and `AGENTS.override.md` where they exist, source `workspace`,
 * each described by its absolute path. Empty without a workspace. The snapshot carries the presence check
 * (`instructionFiles` in `@rotaris/config`), so this draws what it is given and probes nothing.
 */
export function InstructionsSettings({ snapshot, workspace }: { snapshot: ConfigSnapshot | null; workspace: string | null }) {
  const entries: InventoryEntry[] = (snapshot?.instructions ?? []).map((f) => ({ name: f.name, source: 'workspace', description: f.path }));
  return (
    <div className="settings__section">
      <h1 className="display">Instructions</h1>
      <p className="text-secondary">
        The instruction files this workspace contributes to every agent it builds. This is an inventory, not an editor:
        which files exist is a matter of what is on disk, so add or change one in the workspace itself and it appears here.
      </p>
      <InventoryTable
        label="Instruction files"
        entries={entries}
        empty={workspace === null
          ? 'No workspace is open, so there are no instruction files to list.'
          : `No instruction files. Create AGENTS.md in ${workspace} to give every agent standing instructions, and AGENTS.override.md beside it for instructions that take precedence.`}
      />
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
