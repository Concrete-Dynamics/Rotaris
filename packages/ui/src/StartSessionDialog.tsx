import { useEffect, useId, useMemo, useState } from 'react';
import { confinementMessage, NO_CONFINEMENT_DISCLOSURE, SANDBOX_MODE_NAMES, validateBranchName, type ConfinementVerdict, type SandboxModeName } from '@rotaris/contracts';
import { Button as DesignButton, Checkbox as DesignCheckbox, Input as DesignInput, Select as DesignSelect } from './design-system/index.js';

/**
 * REQ-SHELL-125's "Start session" dialog (≥ 460 px wide): Git worktree isolation with its branch (REQ-GIT-118, the
 * default `rotaris/session/<id>` shown before it is accepted, validated by REQ-GIT-009's whole rule set), an attach to
 * an existing worktree through the platform's folder chooser (REQ-GIT-158, mutually exclusive with isolation so
 * REQ-GIT-021's first refusal is unreachable), and the sandbox mode — the three values of REQ-SANDBOX-048 in that
 * order, preselected to the configured value (REQ-TOOLS-114) — with REQ-SANDBOX-130's disclosure as text on a host
 * that cannot confine anything (ADR-0022). Cancel clears nothing. REQ-GIT-119 (isolation mandatory while another
 * run is active) is carried by `runActive`; on this single-run host REQ-SHELL-125's refusal fires before the dialog.
 */
export interface LaunchOptions {
  readonly isolation: { readonly branch: string } | null;
  readonly attach: { readonly path: string; readonly branch: string } | null;
  readonly sandboxMode: SandboxModeName;
  /**
   * REQ-ORCH-152: the run-start mode the accepted session starts under. It is a PERSISTENT setting and not a
   * per-launch option — the dialog writes `runtime.run_start_mode` through the caller exactly as the composer's
   * control does (REQ-CONFIG-476), so the value chosen here governs the next run started in this workspace
   * wherever it is started from.
   */
  readonly runStartMode: 'auto' | 'plan';
}

export interface StartSessionDialogProps {
  /** The id main minted; the default branch is derived from it (REQ-GIT-007). */
  readonly sessionId: string;
  readonly runActive: boolean;
  readonly defaultSandboxMode: SandboxModeName;
  /** REQ-ORCH-152 / REQ-CONFIG-476: the persisted run-start mode, preselected; `auto` by default. */
  readonly defaultRunStartMode?: 'auto' | 'plan' | undefined;
  /**
   * ADR-0022 (Part AR): this HOST's own availability verdict, not a hardcoded answer. `null` while
   * the probe has not returned — the dialog then behaves as it does for an unavailable host, the
   * fail-closed side (REQ-SANDBOX-068).
   *
   * REQ-SANDBOX-119: on a host where the probe reports unavailable, the control is disabled and
   * cleared, and the mechanism's reason AND remediation appear both in the tooltip and as text
   * visible WITHOUT hovering, since a tooltip alone does not count as informing the user.
   * REQ-SANDBOX-120: where the workspace CONFIGURATION itself demands confinement on such a host, the
   * control stays at the configured value and disabled, so the host never appears to switch the
   * setting off; the run then fails before the agent loop begins.
   */
  readonly confinement: ConfinementVerdict | null;
  /** REQ-SANDBOX-107's corrective sentence, or empty when such work can proceed. */
  readonly advisory?: string | undefined;
  readonly onChooseAttach: () => Promise<{ ok: true; path: string; branch: string } | { ok: true; cancelled: true } | { ok: false; reason: string }>;
  readonly onAccept: (options: LaunchOptions) => void;
  readonly onCancel: () => void;
}

export const ISOLATION_HINT = 'Choose an isolated Git worktree when this task may run beside other sessions.';
export const ISOLATION_REQUIRED_HINT = 'Another run is already active, so this session gets its own Git worktree. Two runs sharing one working tree would overwrite each other\'s edits.';
export const ISOLATION_REQUIRED_TOOLTIP = 'Required while another run is active.';
/**
 * REQ-SANDBOX-130's disclosure, re-exported from its one home in `@rotaris/contracts`. It was
 * declared here first, when this dialog was the only surface that carried it; REQ-SANDBOX-130 names
 * TWO surfaces and requires the fact be "a single one and the same on both", so a second literal in
 * the settings card would have been two texts one edit apart.
 */
export { NO_CONFINEMENT_DISCLOSURE };

/**
 * REQ-SANDBOX-107: the advisory the dialog produces before launch whenever the session being started
 * would be unattended. Empty when such work can proceed — confinement active, or the permissive mode
 * opted into. It ADVISES rather than blocks: `ask` is the shipped default, so blocking would block
 * every workspace that has not been configured.
 */
export function unattendedAdvisory(input: { readonly permissionMode: string; readonly confinementActive: boolean; readonly allowUnsandboxedAutonomous: boolean }): string {
  if (input.permissionMode !== 'autonomous') return '';
  if (input.confinementActive || input.allowUnsandboxedAutonomous) return '';
  return `This session would start unattended in 'autonomous' mode with no confinement active, so it is tightened to 'ask' — and because nothing can answer an approval prompt for it, every tool call would then be refused. To let it proceed, either set runtime.permission_mode: autonomous together with runtime.allow_unsandboxed_autonomous: true, or enable runtime.sandbox_mode on a host that can confine.`;
}

export function defaultSessionBranch(sessionId: string): string {
  return `rotaris/session/${sessionId}`;
}

export function StartSessionDialog({ sessionId, runActive, defaultSandboxMode, defaultRunStartMode = 'auto', confinement, advisory = '', onChooseAttach, onAccept, onCancel }: StartSessionDialogProps) {
  const confinementAvailable = confinement?.available === true;
  const titleId = useId();
  const [isolation, setIsolation] = useState(runActive);
  const [branch, setBranch] = useState(() => defaultSessionBranch(sessionId));
  const [attach, setAttach] = useState<{ path: string; branch: string } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [sandboxMode, setSandboxMode] = useState<SandboxModeName>(defaultSandboxMode);
  const [runStartMode, setRunStartMode] = useState<'auto' | 'plan'>(defaultRunStartMode);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !choosing) { event.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, choosing]);
  const branchCheck = useMemo(() => (isolation ? validateBranchName(branch, { derived: false }) : null), [isolation, branch]);
  const branchError = branchCheck && !branchCheck.ok ? branchCheck.error : null;
  const choose = async () => {
    setChoosing(true);
    setAttachError(null);
    const r = await onChooseAttach();
    setChoosing(false);
    if (!r.ok) { setAttachError(r.reason); return; }
    if ('cancelled' in r) return;
    setAttach({ path: r.path, branch: r.branch });
    setIsolation(false);
  };
  const accept = () => {
    if (branchError !== null || choosing) return;
    onAccept({ isolation: isolation && branchCheck?.ok ? { branch: branchCheck.name } : null, attach, sandboxMode, runStartMode });
  };
  const isolationLocked = runActive || attach !== null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog start-session" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="start-session-dialog" onSubmit={(event) => { event.preventDefault(); accept(); }}>
        <h2 id={titleId} className="dialog-title">Start session</h2>
        <p className="dialog-body">Two optional choices for the session the next message starts. The workspace is the one this window has open.</p>
        {/* UIR-004: a card with the system's section kicker, where the browser default fieldset drew a
            hairline rectangle notched by a sentence-case legend — an idiom used nowhere else here. */}
        <section className="card start-session__group">
          <div className="card-kicker">Git worktree</div>
          <DesignCheckbox className="check start-session__check" title={runActive ? ISOLATION_REQUIRED_TOOLTIP : undefined} data-testid="start-session-isolation" checked={isolation} disabled={isolationLocked} onChange={(event) => setIsolation(event.currentTarget.checked)} label="Run in an isolated Git worktree" />
          <p className="start-session__hint text-secondary" data-testid="start-session-hint">{runActive ? ISOLATION_REQUIRED_HINT : ISOLATION_HINT}</p>
          <label className="field">
            <span className="field-label">Branch</span>
            <DesignInput className="input mono" data-testid="start-session-branch" value={branch} disabled={!isolation} onChange={(event) => setBranch(event.currentTarget.value)} />
          </label>
          {branchError !== null && <p className="composer__error" role="alert" data-testid="start-session-branch-error">{branchError}</p>}
          <div className="start-session__attach">
            <DesignButton type="button" className="btn btn-secondary" disabled={choosing} data-testid="start-session-attach" onClick={() => { void choose(); }}>{choosing ? 'Choosing…' : 'Attach to an existing worktree…'}</DesignButton>
            {attach !== null && (<>
              <span className="mono start-session__attach-path" data-testid="start-session-attach-path">{attach.path} · {attach.branch}</span>
              <DesignButton type="button" className="btn btn-ghost" onClick={() => setAttach(null)}>Clear</DesignButton>
            </>)}
          </div>
          {attachError !== null && <p className="composer__error" role="alert" data-testid="start-session-attach-error">{attachError}</p>}
        </section>
        <section className="card start-session__group">
          <div className="card-kicker">Sandbox mode</div>
          <DesignSelect
            className="input select start-session__select" aria-label="Sandbox mode" data-testid="start-session-sandbox"
            value={sandboxMode} disabled={!confinementAvailable}
            // REQ-SANDBOX-119: the reason AND the remediation in the tooltip...
            title={confinementAvailable || confinement === null ? undefined : confinementMessage(confinement)}
            // ...and in the accessible description, so the two channels agree (REQ-CHAT-007).
            aria-description={confinementAvailable || confinement === null ? undefined : confinementMessage(confinement)}
            onChange={(event) => setSandboxMode(event.currentTarget.value as SandboxModeName)}
          >
            {SANDBOX_MODE_NAMES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </DesignSelect>
          {/* REQ-SANDBOX-119: ...and as text visible WITHOUT hovering, a tooltip alone not counting as informing the user. */}
          {!confinementAvailable && confinement !== null && confinement.reason !== '' && (
            <p className="start-session__hint text-secondary" data-testid="start-session-sandbox-reason">{confinementMessage(confinement)}</p>
          )}
          {/* REQ-SANDBOX-130: shown for attended and unattended sessions alike, and whatever mode is selected. */}
          {!confinementAvailable && <p className="start-session__disclosure text-secondary" data-testid="start-session-disclosure">{NO_CONFINEMENT_DISCLOSURE}</p>}
          {/* REQ-SANDBOX-107: the advisory, beside the disclosure and never suppressing it. */}
          {advisory !== '' && <p className="start-session__hint text-secondary" role="status" data-testid="start-session-advisory">{advisory}</p>}
        </section>
        {/* REQ-ORCH-152: the second of the two places the mode is offered; REQ-ORCH-153 states what `plan` does. */}
        <section className="card start-session__group">
          <div className="card-kicker">Run-start mode</div>
          <DesignSelect className="input select start-session__select" aria-label="Run-start mode" data-testid="start-session-run-start-mode" value={runStartMode} onChange={(event) => setRunStartMode(event.currentTarget.value as 'auto' | 'plan')}>
            <option value="auto">auto — start work straight away</option>
            <option value="plan">plan — produce a plan and wait for a decision</option>
          </DesignSelect>
          <p className="start-session__hint text-secondary" data-testid="start-session-run-start-hint">In <code>plan</code> mode nothing that writes files or runs commands happens until you approve the plan. Questions and exploration are never held.</p>
        </section>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" disabled={choosing} onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="submit" className="btn btn-primary" disabled={branchError !== null || choosing} data-testid="start-session-accept">Start session</DesignButton>
        </div>
      </form>
    </div>
  );
}
