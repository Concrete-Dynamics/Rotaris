import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { derivedWorktreeDirectory, validateBranchName } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput } from './design-system/index.js';

/**
 * REQ-GIT-115/116: the "New worktree" dialog. The Directory field auto-derives from the branch as
 * `<parent of the workspace>/<branch with each / replaced by ->` until the user edits it by hand; validation is live
 * and is the WHOLE rule set of REQ-GIT-009 (the same function creation runs), with five distinguishable messages;
 * creation is disabled while any applies. A creation failure shows `Could not create worktree` with the reported text.
 */
export interface WorktreeDialogProps {
  readonly workspaceRoot: string;
  /** The branches the worktree table shows now (REQ-GIT-116: a branch that already has a worktree is refused here). */
  readonly existingBranches: readonly string[];
  readonly existingPaths: readonly string[];
  /** Whether a directory exists and is non-empty, asked of main (the renderer has no filesystem). */
  readonly probePath?: ((path: string) => Promise<{ exists: boolean; nonEmpty: boolean } | null>) | undefined;
  readonly onCreate: (branch: string, path: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onClose: () => void;
}

const foldPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** REQ-GIT-116's five cases, in the order they are checked; null when creation may proceed. */
export function worktreeDialogMessage(branch: string, directory: string, existingBranches: readonly string[], existingPaths: readonly string[], probe: { exists: boolean; nonEmpty: boolean } | null): string | null {
  if (branch.trim() === '') return 'Enter a branch name.';
  const check = validateBranchName(branch, { derived: false });
  if (!check.ok) return `This is not a usable Git branch name: it ${check.detail}.`;
  if (existingBranches.includes(check.name)) return `The branch ${check.name} already has a worktree.`;
  if (directory.trim() === '') return 'Choose a directory for the worktree.';
  if (existingPaths.some((p) => foldPath(p) === foldPath(directory)) || (probe?.exists && probe.nonEmpty)) return 'That directory already exists; choose a new, empty path.';
  return null;
}

export function WorktreeDialog({ workspaceRoot, existingBranches, existingPaths, probePath, onCreate, onClose }: WorktreeDialogProps) {
  const titleId = useId();
  const [branch, setBranch] = useState('');
  const [directory, setDirectory] = useState('');
  const [edited, setEdited] = useState(false);
  // The probe remembers which directory it answered for; an answer for another directory is ignored, never cleared in an effect.
  const [probe, setProbe] = useState<{ directory: string; exists: boolean; nonEmpty: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const branchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { branchRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  const effectiveDirectory = edited ? directory : branch.trim() === '' ? '' : derivedWorktreeDirectory(workspaceRoot, branch.trim());
  // The existence probe is asked of main, debounced, and applied only when it still names the current directory.
  useEffect(() => {
    if (!probePath || effectiveDirectory.trim() === '') return;
    const wanted = effectiveDirectory;
    const t = setTimeout(() => { void probePath(wanted).then((r) => { if (r) setProbe({ directory: wanted, ...r }); }); }, 200);
    return () => clearTimeout(t);
  }, [effectiveDirectory, probePath]);
  const message = useMemo(() => worktreeDialogMessage(branch, effectiveDirectory, existingBranches, existingPaths, probe !== null && probe.directory === effectiveDirectory ? probe : null), [branch, effectiveDirectory, existingBranches, existingPaths, probe]);
  const create = async () => {
    if (message !== null || busy) return;
    setBusy(true);
    setFailure(null);
    const r = await onCreate(branch.trim(), effectiveDirectory);
    setBusy(false);
    if (r.ok) onClose(); else setFailure(r.reason);
  };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="dialog worktree-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="worktree-dialog" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <h2 id={titleId} className="dialog-title">New worktree</h2>
        <p className="dialog-body">Create an isolated branch directory for a separate Rotaris session.</p>
        <label className="field">
          <span className="field-label">Branch</span>
          <DesignInput ref={branchRef} className="input mono" data-testid="worktree-branch" placeholder="feature/short-name" value={branch} disabled={busy} onChange={(event) => setBranch(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span className="field-label">Directory</span>
          <DesignInput className="input mono" data-testid="worktree-directory" value={effectiveDirectory} disabled={busy} onChange={(event) => { setEdited(true); setDirectory(event.currentTarget.value); }} />
        </label>
        <p className={message ? 'worktree-dialog__message' : 'worktree-dialog__message worktree-dialog__message--ok'} role="status" data-testid="worktree-message">{message ?? `The worktree will be created beside the workspace, not under .rotaris/.`}</p>
        {failure !== null && (
          <div className="worktree-dialog__failure" role="alert" data-testid="worktree-failure">
            <span className="worktree-dialog__failure-title">Could not create worktree</span>
            <pre className="notice__detail mono">{failure}</pre>
          </div>
        )}
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</DesignButton>
          <DesignButton type="submit" className="btn btn-primary" disabled={message !== null || busy} data-testid="worktree-create">{busy ? 'Creating…' : 'Create'}</DesignButton>
        </div>
      </form>
    </div>
  );
}
