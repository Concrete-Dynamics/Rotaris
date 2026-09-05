import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { err, millis, ok, type Clocks, type Millis, type Result } from '@rotaris/kernel';
import { invokeGit, renderGitCommand, type GitResult } from './invoke.js';
import { resolvedPath, samePath } from './paths.js';
// REQ-GIT-009 lives in contracts so the dialog's live check and this creation run one rule set (REQ-GIT-116).
export { normalBranchForm, validateBranchName, derivedWorktreeDirectory, type BranchCheck } from '@rotaris/contracts';

/**
 * ADR-0038's first WRITES: worktree creation, removal and the attach check (REQ-GIT-005..013, 110, 111), each
 * invocation through `invokeGit` and abandoned at 30 s (REQ-GIT-013). Everything above the helper is a pure mapping
 * from the raw result to the text a requirement fixes: the failure-text ladder of REQ-GIT-013, the long-path
 * replacement of REQ-GIT-012 (the ONE place Git's wording is replaced), the three collision phrases of REQ-GIT-010,
 * and the branch-name rules of REQ-GIT-009 — every one testable with no repository present.
 */
export const GIT_WRITE_TIMEOUT = millis(30_000);

export interface WorktreeDeps {
  readonly clocks: Clocks;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly executable?: string;
  readonly timeoutMs?: Millis;
  readonly platform?: NodeJS.Platform;
}

/** REQ-GIT-013: cannot start, then stderr, else stdout, else the fixed sentence; a timeout names the rendered command. */
export function gitFailureText(result: GitResult, args: readonly string[]): string {
  switch (result.outcome) {
    case 'cannot-start': return `Could not run Git: ${result.reason}`;
    case 'refused': return `Could not run Git: ${result.reason}`;
    case 'timed-out': return `Git timed out after 30s: ${renderGitCommand(args)}`;
    case 'exited': {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      return stderr !== '' ? stderr : stdout !== '' ? stdout : 'git command failed';
    }
  }
}

const LONG_PATH_PHRASES = ['filename too long', 'file name too long', 'filename or extension is too long'];

/** REQ-GIT-012: the one replacement of Git's wording — two lines, the complete Git text on the second; null when no phrase matches. */
export function longPathText(workspace: string, detail: string): string | null {
  const lower = detail.toLowerCase();
  if (!LONG_PATH_PHRASES.some((p) => lower.includes(p))) return null;
  return [
    `This worktree could not be created: a file in it needs a path longer than Windows allows (260 characters). Two things fix it — enable long paths in Git with \`git config --global core.longpaths true\`, or move the workspace somewhere shorter than ${workspace}. Rotaris does not change your Git configuration for you.`,
    `Git reported: ${detail}`,
  ].join('\n');
}

/** REQ-GIT-010: exactly the three phrases, case-insensitively; every other failure is not a collision. */
export function isBranchCollision(text: string): boolean {
  return /a branch named .* already exists/i.test(text) || /already checked out/i.test(text) || /already used by worktree/i.test(text);
}

export const COLLISION_ATTEMPTS = 50;

/** REQ-GIT-005: `<workspace>/.rotaris/<subpath>/<sessionId>`; the subpath relative, without `..`, and resolving inside `.rotaris`. */
export function sessionWorktreePath(workspaceRoot: string, subpath: string | undefined, sessionId: string): Result<string, string> {
  const sub = (subpath ?? 'worktrees').trim() === '' ? 'worktrees' : (subpath ?? 'worktrees').trim();
  const rotaris = resolve(workspaceRoot, '.rotaris');
  if (isAbsolute(sub) || /^[A-Za-z]:/.test(sub) || sub.split(/[\\/]/).includes('..')) return err('Worktree storage path must stay inside .rotaris.');
  const target = resolve(rotaris, sub, sessionId);
  const rel = relative(rotaris, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return err('Worktree storage path must stay inside .rotaris.');
  return ok(target);
}

export interface CreateWorktreeArgs {
  readonly root: string;
  readonly branch: string;
  readonly path: string;
  readonly baseRevision?: string | undefined;
  readonly collisionSafe: boolean;
  /** `session` takes REQ-GIT-008's refusal for an existing path; `manual` takes REQ-GIT-110's for a non-empty directory. */
  readonly route: 'session' | 'manual';
}
export interface CreatedWorktree { readonly path: string; readonly branch: string; readonly baseBranch: string; readonly baseRevision: string }

function isNonEmptyDirectory(path: string): boolean {
  try { return statSync(path).isDirectory() && readdirSync(path).length > 0; } catch { return false; }
}

async function run(args: readonly string[], cwd: string, deps: WorktreeDeps): Promise<{ result: GitResult; args: readonly string[] }> {
  const result = await invokeGit({ args, workspaceRoot: cwd, timeoutMs: deps.timeoutMs ?? GIT_WRITE_TIMEOUT, timers: deps.clocks.timers, clock: deps.clocks.monotonic, ...(deps.env ? { env: deps.env } : {}), ...(deps.executable ? { executable: deps.executable } : {}) });
  return { result, args };
}
const okText = (r: GitResult): string | null => (r.outcome === 'exited' && r.status === 0 ? r.stdout.trim() : null);

/**
 * REQ-GIT-006..010/012: the workspace must be the root of its own worktree and not detached; the path must be free;
 * then `worktree add -b <branch> <path> <base>`. Collision-safe creation suffixes `-2`..`-50` on exactly REQ-GIT-010's
 * phrases and propagates every other failure unchanged, after REQ-GIT-012's replacement where it applies.
 */
export async function createWorktree(a: CreateWorktreeArgs, deps: WorktreeDeps): Promise<Result<CreatedWorktree, string>> {
  const platform = deps.platform ?? process.platform;
  if (a.route === 'session' ? existsSync(a.path) : (existsSync(a.path) && !statSync(a.path).isDirectory())) return err(`Worktree path already exists: ${a.path}`);
  if (a.route === 'manual' && isNonEmptyDirectory(a.path)) return err(`Worktree path is not empty: ${a.path}`);
  const top = await run(['rev-parse', '--show-toplevel'], a.root, deps);
  const topText = okText(top.result);
  if (topText === null) return err(gitFailureText(top.result, top.args));
  if (resolvedPath(topText, platform) !== resolvedPath(a.root, platform)) return err('Workspace must be the root of its Git worktree.');
  const head = await run(['rev-parse', '--abbrev-ref', 'HEAD'], a.root, deps);
  const headText = okText(head.result);
  if (headText === null) return err(gitFailureText(head.result, head.args));
  if (headText === 'HEAD') return err('Detached HEAD cannot host an isolated session or integration.');
  const baseBranch = headText;
  const revision = await run(['rev-parse', a.baseRevision ?? 'HEAD'], a.root, deps);
  const baseRevision = okText(revision.result);
  if (baseRevision === null) return err(gitFailureText(revision.result, revision.args));
  const attempts = a.collisionSafe ? COLLISION_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const branch = attempt === 1 ? a.branch : `${a.branch}-${attempt}`;
    const added = await run(['worktree', 'add', '-b', branch, a.path, baseRevision], a.root, deps);
    if (added.result.outcome === 'exited' && added.result.status === 0) return ok({ path: a.path, branch, baseBranch, baseRevision });
    const text = gitFailureText(added.result, added.args);
    if (a.collisionSafe && added.result.outcome === 'exited' && isBranchCollision(text)) continue;
    return err(longPathText(a.root, text) ?? text);
  }
  return err(`Could not find a free branch name for ${a.branch} after ${COLLISION_ATTEMPTS} attempts.`);
}

export interface RemoveWorktreeArgs { readonly root: string; readonly path: string; readonly force: boolean }
export type RemoveFailure = { readonly error: string; readonly needsForce: boolean };

/** Git's own phrase for a tree it will not remove without `--force` (quoted from a real run in the test). */
export function needsForceText(text: string): boolean {
  return /contains modified or untracked files/i.test(text);
}

/** REQ-GIT-111: the registration, then the directory if it remains; `needsForce` only for the one refusal force would cure. */
export async function removeWorktree(a: RemoveWorktreeArgs, deps: WorktreeDeps): Promise<Result<{ readonly path: string }, RemoveFailure>> {
  const removed = await run(['worktree', 'remove', ...(a.force ? ['--force'] : []), a.path], a.root, deps);
  if (!(removed.result.outcome === 'exited' && removed.result.status === 0)) {
    const text = gitFailureText(removed.result, removed.args);
    return err({ error: text, needsForce: !a.force && needsForceText(text) });
  }
  if (existsSync(a.path)) {
    try { rmSync(a.path, { recursive: true, force: true }); } catch (cause) { return err({ error: `The worktree was unregistered but its directory could not be deleted: ${String(cause instanceof Error ? cause.message : cause)}`, needsForce: false }); }
  }
  return ok({ path: a.path });
}

export interface AttachCheckArgs { readonly root: string; readonly path: string }
export interface Attachable { readonly path: string; readonly branch: string; readonly baseBranch: string; readonly baseRevision: string }

/** REQ-GIT-011: exists, is a directory, and shares the workspace's common directory; the binding facts come back. */
export async function checkAttach(a: AttachCheckArgs, deps: WorktreeDeps): Promise<Result<Attachable, string>> {
  const platform = deps.platform ?? process.platform;
  if (!existsSync(a.path)) return err(`Worktree directory does not exist: ${a.path}`);
  if (!statSync(a.path).isDirectory()) return err('Attached path is not a worktree of this workspace repository.');
  const mine = okText((await run(['rev-parse', '--path-format=absolute', '--git-common-dir'], a.root, deps)).result);
  const theirs = okText((await run(['rev-parse', '--path-format=absolute', '--git-common-dir'], a.path, deps)).result);
  if (mine === null || theirs === null || !samePath(mine, theirs, platform)) return err('Attached path is not a worktree of this workspace repository.');
  const branch = okText((await run(['rev-parse', '--abbrev-ref', 'HEAD'], a.path, deps)).result) ?? 'HEAD';
  const baseBranch = okText((await run(['rev-parse', '--abbrev-ref', 'HEAD'], a.root, deps)).result) ?? 'HEAD';
  const baseRevision = okText((await run(['rev-parse', 'HEAD'], a.root, deps)).result) ?? '';
  return ok({ path: a.path, branch, baseBranch, baseRevision });
}
