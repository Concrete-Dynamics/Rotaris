import { useEffect, useId, useMemo, useState } from 'react';
import { SANDBOX_MODE_NAMES, validateBranchName, type SandboxModeName } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput, Select as DesignSelect } from './design-system/index.js';

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
}

export interface StartSessionDialogProps {
  /** The id main minted; the default branch is derived from it (REQ-GIT-007). */
  readonly sessionId: string;
  readonly runActive: boolean;
  readonly defaultSandboxMode: SandboxModeName;
  /** Whether this host can confine anything (ADR-0022: false on Windows). */
  readonly confinementAvailable: boolean;
  readonly onChooseAttach: () => Promise<{ ok: true; path: string; branch: string } | { ok: true; cancelled: true } | { ok: false; reason: string }>;
  readonly onAccept: (options: LaunchOptions) => void;
  readonly onCancel: () => void;
}

export const ISOLATION_HINT = 'Choose an isolated Git worktree when this task may run beside other sessions.';
export const ISOLATION_REQUIRED_HINT = 'Another run is already active, so this session gets its own Git worktree. Two runs sharing one working tree would overwrite each other\'s edits.';
export const ISOLATION_REQUIRED_TOOLTIP = 'Required while another run is active.';
/** REQ-SANDBOX-130: the one fact, in the product's own words, as text — never a colour or a disabled control. */
export const NO_CONFINEMENT_DISCLOSURE = 'This host cannot confine anything: every command an agent runs executes with the same operating-system privileges as the account running Rotaris, reaching whatever that account can read and whatever it can write, and no value of the sandbox mode changes that here. That is a stated limit of the product on this platform, not a fault to fix; the answer changes only when the workspace runs on a host Rotaris can confine.';

export function defaultSessionBranch(sessionId: string): string {
  return `rotaris/session/${sessionId}`;
}

export function StartSessionDialog({ sessionId, runActive, defaultSandboxMode, confinementAvailable, onChooseAttach, onAccept, onCancel }: StartSessionDialogProps) {
  const titleId = useId();
  const [isolation, setIsolation] = useState(runActive);
  const [branch, setBranch] = useState(() => defaultSessionBranch(sessionId));
  const [attach, setAttach] = useState<{ path: string; branch: string } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [sandboxMode, setSandboxMode] = useState<SandboxModeName>(defaultSandboxMode);
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
    onAccept({ isolation: isolation && branchCheck?.ok ? { branch: branchCheck.name } : null, attach, sandboxMode });
  };
  const isolationLocked = runActive || attach !== null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog start-session" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="start-session-dialog" onSubmit={(event) => { event.preventDefault(); accept(); }}>
        <h2 id={titleId} className="dialog-title">Start session</h2>
        <p className="dialog-body">Two optional choices for the session the next message starts. The workspace is the one this window has open.</p>
        <fieldset className="start-session__group">
          <legend className="field-label">Git worktree</legend>
          <label className="start-session__check" title={runActive ? ISOLATION_REQUIRED_TOOLTIP : undefined}>
            <DesignInput type="checkbox" data-testid="start-session-isolation" checked={isolation} disabled={isolationLocked} onChange={(event) => setIsolation(event.currentTarget.checked)} />
            <span>Run in an isolated Git worktree</span>
          </label>
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
        </fieldset>
        <fieldset className="start-session__group">
          <legend className="field-label">Sandbox mode</legend>
          <DesignSelect className="input select start-session__select" aria-label="Sandbox mode" data-testid="start-session-sandbox" value={sandboxMode} onChange={(event) => setSandboxMode(event.currentTarget.value as SandboxModeName)}>
            {SANDBOX_MODE_NAMES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </DesignSelect>
          {!confinementAvailable && <p className="start-session__disclosure text-secondary" data-testid="start-session-disclosure">{NO_CONFINEMENT_DISCLOSURE}</p>}
        </fieldset>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" disabled={choosing} onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="submit" className="btn btn-primary" disabled={branchError !== null || choosing} data-testid="start-session-accept">Start session</DesignButton>
        </div>
      </form>
    </div>
  );
}
