import { useState } from 'react';
import {
  SKILL_INVOCATION_MODE_LABELS, SKILL_INVOCATION_MODE_NAMES, SKILL_LOAD_MODE_LABELS,
  type ConfigSnapshot, type SkillInvocationModeName, type SkillLoadModeName, type SkillRow, type SkillsState,
} from '@rotaris/contracts';
import { Button, Select, Table, TableCard, ToggleSwitch } from '../design-system/index.js';
import { Fatal } from './ConfigSettings.js';
import { collapseHome, elideMiddle } from '../workspace-label.js';

/**
 * The Settings **Skills** category (REQ-WORKSPACE-067, REQ-WORKSPACE-068, REQ-WORKSPACE-069,
 * REQ-WORKSPACE-151; ADR-0063). Structure from `docs/spec/`; the craft — a `TableCard` whose head carries
 * the kicker, the switch and the two actions, and compact per-row selects — from the mockup's Skills card,
 * read for craft and never for structure.
 *
 * **Two things the mockup draws that the specification rejects, and they are not drawn here.** Its Scope
 * column offers `persona · coder` / `session-wide`: REQ-WORKSPACE-065 makes policy per workspace and **never
 * per persona**, and its resolution record rules that out with reasons. Its In-context dot and its composer
 * chip: REQ-WORKSPACE-067 says the tab "SHALL show no per-agent in-context indicator and SHALL offer no
 * composer chip". What the user needs to know — which skills reach an agent and how — is the Load column
 * together with the `manual` scope label.
 *
 * **Seven columns, and why.** REQ-WORKSPACE-067 names six by adding Path and requires a per-row invocation
 * selector besides, drawn here as the mockup draws it. REQ-CONFIG-343 once said five; ESC-38 ruled for seven
 * on 2026-09-27 and REQ-CONFIG-343 now counts them.
 */
export interface SkillsSettingsProps {
  readonly state: SkillsState | null;
  readonly workspace: string | null;
  /**
   * REQ-CONFIG-279/472 — the PENDING policy, as the screen holds it. The selectors are bound to this and not
   * to `state`, which is the run host's projection of what the FILES say: a choice the user has not saved yet
   * has changed no file, so a control reading the projection snaps back the moment it is redrawn.
   *
   * Found by building (ADR-0063's first execution, finding 2): the proof chose three policies, the log recorded
   * all three as chosen, and every row still read its file value. It is the same rule the Display category
   * already follows — what is drawn follows the screen, and Save decides what the file says.
   */
  readonly pending?: {
    readonly enabled: boolean;
    readonly overrides: Readonly<Record<string, SkillLoadModeName>>;
    readonly invocationOverrides: Readonly<Record<string, SkillInvocationModeName>>;
  } | undefined;
  /** The user's home, for REQ-WORKSPACE-149's collapsing of a path shown in the interface. */
  readonly home?: string | undefined;
  /** REQ-WORKSPACE-068: a policy change joins the pending settings; Save writes it (REQ-CONFIG-256/258). */
  readonly onLoadMode: (name: string, mode: SkillLoadModeName) => void;
  readonly onInvocationMode: (name: string, mode: SkillInvocationModeName) => void;
  readonly onEnabled: (enabled: boolean) => void;
  /** REQ-WORKSPACE-069: re-read from disk. Changes no policy and marks nothing dirty. */
  readonly onRescan: () => Promise<{ ok: true; count: number } | { ok: false; reason: string }>;
  /** REQ-WORKSPACE-151: the platform chooser, then REQ-WORKSPACE-057's rules. A dismissal changes nothing. */
  readonly onLoadFile: () => Promise<{ ok: true; cancelled: boolean; name?: string } | { ok: false; reason: string }>;
  /**
   * OQ-279 / REQ-CONFIG-478: the configuration snapshot when it did not load. The policy this category edits is
   * configuration, and an unloaded one is not the shipped defaults, so the category draws the report as Models, Personas
   * and Runtime do, and no row, switch or action (the run host refuses every `skills.*` request meanwhile).
   */
  readonly fatal?: ConfigSnapshot | undefined;
}

export const SKILLS_EMPTY = 'No portable skills were discovered.';
export const ENABLE_SKILLS_LABEL = 'Enable skills';
export const ENABLE_SKILLS_NAME = 'Enable portable skills';
export const ENABLE_SKILLS_DESCRIPTION = 'Controls whether any portable skill is injected into newly created agents';
export const RESCAN_LABEL = 'Rescan skills';
export const RESCAN_DESCRIPTION = 'Re-reads skill files from disk for this workspace.';
export const LOAD_FILE_LABEL = 'Load skill file…';
export const LOAD_FILE_DESCRIPTION = 'Loads a skill file for this session only.';
/** REQ-WORKSPACE-067: the Source cell's tooltip for a skill that shadowed duplicates, its noun agreeing with how many (REQ-SHELL-044). */
export function shadowTooltip(shadowed: readonly string[]): string {
  return `Workspace skill wins. Ignored ${shadowed.length === 1 ? 'duplicate' : 'duplicates'}:\n${shadowed.join('\n')}`;
}

/** REQ-WORKSPACE-149: home collapsed, middle-elided to a single `…`, with the full path in tooltip and description. */
function pathLabel(path: string, home: string | undefined): string {
  const collapsed = collapseHome(path, home);
  // The budget is a character count rather than a rendered width: a table cell has no measurable width until
  // it is laid out, and REQ-WORKSPACE-149's elision is against "the rendered width available to the label",
  // which the CSS enforces. This keeps a very long path from setting the column's width on its own.
  return collapsed.length <= 64 ? collapsed : elideMiddle(collapsed, 64, (s) => s.length) ?? collapsed;
}

function SkillRowView({ row, home, load, invocation, onLoadMode, onInvocationMode }: { row: SkillRow; home: string | undefined; load: SkillLoadModeName; invocation: SkillInvocationModeName } & Pick<SkillsSettingsProps, 'onLoadMode' | 'onInvocationMode'>) {
  const full = row.path;
  const shown = pathLabel(full, home);
  const shadowTitle = row.shadowed.length === 0 ? undefined : shadowTooltip(row.shadowed);
  const triggers = row.triggers.join(', ');
  return (
    <tr data-testid="skill-row" data-name={row.name} data-scope={row.scope} data-load={load} data-invocation={invocation} data-saved-load={row.loadMode} data-forced={row.forcedThisSession ? 'yes' : 'no'}>
      <td className="mono">{row.name}</td>
      <td className="text-secondary" title={shadowTitle} aria-description={shadowTitle}>
        {row.scope}
        {/* REQ-SHELL-149: the marker is never the only channel — the tooltip and the accessible description
          * carry the same sentence, and the glyph is text rather than colour. */}
        {row.shadowed.length > 0 ? <span aria-hidden="true">{'  ⓘ'}</span> : null}
      </td>
      <td className="mono text-secondary settings__skill-path" title={full} aria-description={full}>{shown}</td>
      <td className="text-secondary">{triggers === '' ? '—' : triggers}</td>
      <td>
        <Select
          className="input select settings__skill-select"
          aria-label={`Invocation policy for ${row.name}`}
          value={invocation}
          onChange={(event) => onInvocationMode(row.name, event.currentTarget.value as SkillInvocationModeName)}
        >
          {SKILL_INVOCATION_MODE_NAMES.map((mode) => <option key={mode} value={mode}>{SKILL_INVOCATION_MODE_LABELS[mode]}</option>)}
        </Select>
      </td>
      <td>
        {/*
          * REQ-WORKSPACE-073: this shows the PERSISTED policy and never the session force, so a typed command
          * can never make the screen claim a workspace was reconfigured. The four options are in the order
          * REQ-WORKSPACE-067 lists them, which is not the order of the underlying vocabulary.
          */}
        <Select
          className="input select settings__skill-select"
          aria-label={`Load policy for ${row.name}`}
          value={load}
          onChange={(event) => onLoadMode(row.name, event.currentTarget.value as SkillLoadModeName)}
        >
          {(['name-only', 'on', 'user-invocable-only', 'off'] as const).map((mode) => <option key={mode} value={mode}>{SKILL_LOAD_MODE_LABELS[mode]}</option>)}
        </Select>
      </td>
      <td title={row.description} aria-description={row.description}>{row.description}</td>
    </tr>
  );
}

export function SkillsSettings({ state, workspace, home, pending, onLoadMode, onInvocationMode, onEnabled, onRescan, onLoadFile, fatal }: SkillsSettingsProps) {
  const [busy, setBusy] = useState<'rescan' | 'load' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (fatal !== undefined && !fatal.loadOk) return <Fatal snapshot={fatal} />;
  const skills = state?.skills ?? [];
  // The pending value where the screen holds one, else what the files resolved to.
  const enabled = pending?.enabled ?? state?.enabled ?? true;
  const noWorkspace = workspace === null;

  const rescan = async () => {
    setBusy('rescan');
    const r = await onRescan();
    setBusy(null);
    setMessage(r.ok ? `Rescanned skills: ${r.count} found.` : r.reason);
  };
  const loadFile = async () => {
    setBusy('load');
    const r = await onLoadFile();
    setBusy(null);
    // REQ-WORKSPACE-151: a dismissal returns no selection and changes nothing — including this line.
    if (r.ok && r.cancelled) return;
    setMessage(r.ok ? `Skill loaded for this session: ${r.name}.` : r.reason);
  };

  return (
    <div className="settings__section">
      <h1 className="display">Skills</h1>
      <p className="text-secondary">
        Portable skills are <code className="mono">SKILL.md</code> files this product reads rather than defines. They are
        discovered from this project and from your own skill folders; the policy below decides what each one puts in front
        of a newly created agent, and applies to this workspace rather than to any one persona.
      </p>
      <TableCard
        title="Portable skills"
        data-testid="skills-card"
        actions={
          <>
            <span className="text-secondary settings__hint">{ENABLE_SKILLS_LABEL}</span>
            <ToggleSwitch
              checked={enabled}
              onChange={onEnabled}
              label={ENABLE_SKILLS_NAME}
              aria-description={ENABLE_SKILLS_DESCRIPTION}
              disabled={noWorkspace}
              data-testid="skills-enabled"
            />
            <Button
              type="button" className="btn btn-secondary btn-compact" data-testid="skills-rescan"
              aria-description={RESCAN_DESCRIPTION} title={RESCAN_DESCRIPTION}
              disabled={noWorkspace || busy !== null} onClick={() => { void rescan(); }}
            >
              {busy === 'rescan' ? 'Rescanning…' : RESCAN_LABEL}
            </Button>
            <Button
              type="button" className="btn btn-secondary btn-compact" data-testid="skills-load-file"
              aria-description={LOAD_FILE_DESCRIPTION} title={LOAD_FILE_DESCRIPTION}
              disabled={noWorkspace || busy !== null} onClick={() => { void loadFile(); }}
            >
              {busy === 'load' ? 'Loading…' : LOAD_FILE_LABEL}
            </Button>
          </>
        }
      >
        {skills.length === 0 ? (
          <p className="text-secondary" data-testid="skills-empty">{noWorkspace ? 'No workspace is open, so there are no portable skills to list.' : SKILLS_EMPTY}</p>
        ) : (
          <Table className="table settings__grid" aria-label="Portable skills">
            <thead><tr><th>Skill</th><th>Source</th><th>Path</th><th>Trigger</th><th>Invocation</th><th>Load</th><th>Description</th></tr></thead>
            <tbody>
              {skills.map((row) => (
                <SkillRowView
                  key={row.name} row={row} home={home}
                  load={pending?.overrides[row.name] ?? row.loadMode}
                  invocation={pending?.invocationOverrides[row.name] ?? row.invocationMode}
                  onLoadMode={onLoadMode} onInvocationMode={onInvocationMode}
                />
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
      {/*
        * REQ-WORKSPACE-053: a file that could not be read is never silently absent. The table lists what was
        * discovered; this lists what was not, with the reason, so a user who expected a skill can see why.
        */}
      {(state?.skipped.length ?? 0) > 0 ? (
        <>
          <h2 className="settings__heading">Files that were skipped</h2>
          <Table className="table settings__grid" aria-label="Skipped skill files">
            <thead><tr><th>Path</th><th>Reason</th></tr></thead>
            <tbody>
              {state!.skipped.map((s) => (
                <tr key={s.path} data-testid="skill-skipped" data-path={s.path}>
                  <td className="mono text-secondary settings__skill-path" title={s.path} aria-description={s.path}>{pathLabel(s.path, home)}</td>
                  <td>{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : null}
      {message === null ? null : <div className="composer__error" role="status" data-testid="skills-message">{message}</div>}
    </div>
  );
}
