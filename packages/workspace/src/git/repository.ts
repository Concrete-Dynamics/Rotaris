import { millis, type Clocks } from '@rotaris/kernel';
import type { RepositoryState } from '@rotaris/contracts';
import { invokeGit, type GitResult } from './invoke.js';

/**
 * REQ-MONITOR-168 / REQ-GIT-102 / REQ-GIT-103: the repository card's reads. Whether Git exists is asked of Git
 * (`--version`, 15 s); whether the folder is a repository is asked of Git, not the filesystem; every read is bounded
 * at 15 s and a read that fails or is abandoned contributes its empty value and its name to `failed`. A refresh
 * therefore always ends in a state and never in a dialog or a throw.
 */
export const GIT_READ_TIMEOUT = millis(15_000);

export interface RepositoryReadDeps {
  readonly clocks: Clocks;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly executable?: string;
  readonly timeoutMs?: ReturnType<typeof millis>;
}

const EMPTY: RepositoryState = { gitAvailable: false, isRepository: false, branch: null, base: null, ahead: 0, behind: 0, touched: 0, uncommitted: 0, failed: [], readMs: 0 };

const okText = (r: GitResult): string | null => (r.outcome === 'exited' && r.status === 0 ? r.stdout.trim() : null);

/** `git status --porcelain`: one line per touched path; a line whose index or work-tree column is set is uncommitted. */
export function countStatus(porcelain: string): { touched: number; uncommitted: number } {
  const lines = porcelain.split(/\r?\n/).filter((l) => l.length >= 3);
  let uncommitted = 0;
  for (const l of lines) if (l[0] !== ' ' && l[0] !== '?' || l[1] !== ' ' && l[1] !== '?') uncommitted += 1;
  return { touched: lines.length, uncommitted };
}

export async function readRepository(workspaceRoot: string, deps: RepositoryReadDeps): Promise<RepositoryState> {
  const started = Number(deps.clocks.monotonic.now());
  const elapsed = () => Math.round(Number(deps.clocks.monotonic.now()) - started);
  const failed: string[] = [];
  const timeoutMs = deps.timeoutMs ?? GIT_READ_TIMEOUT;
  const read = async (name: string, args: readonly string[]): Promise<string | null> => {
    const r = await invokeGit({ args, workspaceRoot, timeoutMs, timers: deps.clocks.timers, clock: deps.clocks.monotonic, ...(deps.env ? { env: deps.env } : {}), ...(deps.executable ? { executable: deps.executable } : {}) });
    const text = okText(r);
    if (text === null) failed.push(name);
    return text;
  };
  const version = await read('version', ['--version']);
  if (version === null) return { ...EMPTY, failed, readMs: elapsed() };
  const inside = await read('is-inside-work-tree', ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return { ...EMPTY, gitAvailable: true, failed, readMs: elapsed() };
  const branch = await read('branch', ['rev-parse', '--abbrev-ref', 'HEAD']);
  // A branch with no upstream is not a failed read: the base is simply absent and the counts are zero.
  const upstream = await invokeGit({ args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], workspaceRoot, timeoutMs, timers: deps.clocks.timers, clock: deps.clocks.monotonic, ...(deps.env ? { env: deps.env } : {}), ...(deps.executable ? { executable: deps.executable } : {}) });
  const base = okText(upstream);
  let ahead = 0;
  let behind = 0;
  if (base !== null) {
    const counts = await read('ahead-behind', ['rev-list', '--left-right', '--count', `${base}...HEAD`]);
    const m = counts === null ? null : /^(\d+)\s+(\d+)$/.exec(counts);
    if (m) { behind = Number(m[1]); ahead = Number(m[2]); }
    else if (counts !== null) failed.push('ahead-behind');
  }
  // `--no-optional-locks`: a read must not refresh or rewrite the index (REQ-GIT-004/030; found on ADR-0039's first execution, see view.ts).
  const status = await read('status', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all']);
  const counted = status === null ? { touched: 0, uncommitted: 0 } : countStatus(status);
  return { gitAvailable: true, isRepository: true, branch, base, ahead, behind, ...counted, failed, readMs: elapsed() };
}
