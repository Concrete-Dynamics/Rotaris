import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * REQ-TOOLS-129/130/132: the ONE workspace-boundary check. A relative path resolves against the
 * workspace root; the candidate is resolved to its real path (following symlinks and junctions, so a
 * link that escapes resolves outside); a path outside the root fails with the fixed message unless the
 * opt-out is on. A designated additional read-only root may be READ even though it lies outside the
 * fence; every write to one is refused.
 */
export interface FenceConfig {
  readonly workspaceRoot: string;
  /** REQ-TOOLS-130: `runtime.allow_outside_workspace`, default false. */
  readonly allowOutsideWorkspace: boolean;
  /** REQ-TOOLS-132: `runtime.additional_read_only_roots`, absolute paths. */
  readonly additionalReadOnlyRoots: readonly string[];
}

export type FenceVerdict =
  | { readonly ok: true; readonly resolved: string; readonly rel: string; readonly inside: boolean; readonly readOnlyRoot: boolean }
  | { readonly ok: false; readonly resolved: string; readonly message: string };

/**
 * The real path of `p`, resolving the nearest existing ancestor when `p` itself does not exist yet.
 *
 * The missing tail is rebuilt segment by segment with `basename`. Until 2026-09-28 it was rebuilt as
 * `existing.slice(parent.length)` less one leading separator, which is one character too few when the parent is
 * `.` — a relative path's walk ends there, `dirname('specs')` is `.`, and `'specs'.slice(1)` is `pecs`; so
 * `realPathOf('specs/index.md')` answered `<cwd>/pecs/index.md` and `realPathOf('D:/ws')` on POSIX `<cwd>/:/ws`
 * (`docs/defects/fixed/realpathof-drops-a-character-from-a-relative-path.md`). The falsified premise, kept beside
 * its replacement: "no production caller passes a relative path" — the policy's path scope did, on every
 * workspace-relative argument, until it joined the root first (REQ-TOOLS-018).
 */
export function realPathOf(p: string): string {
  let existing = p;
  const tail: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return p;
    tail.unshift(basename(existing));
    existing = parent;
  }
  let real: string;
  try {
    real = realpathSync.native(existing);
  } catch {
    real = resolve(existing);
  }
  return tail.length === 0 ? real : join(real, ...tail);
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function isInside(root: string, candidate: string): boolean {
  const r = norm(root);
  const c = norm(candidate);
  return c === r || c.startsWith(`${r}/`);
}

/** REQ-TOOLS-018/129: a relative path resolves against the workspace root; an absolute one stands. */
export function resolveInWorkspace(cfg: Pick<FenceConfig, 'workspaceRoot'>, input: string): string {
  return isAbsolute(input) ? resolve(input) : resolve(cfg.workspaceRoot, input);
}

/** Workspace-relative POSIX spelling of a path inside the root. */
export function relPosix(root: string, p: string): string {
  return relative(root, p).split(sep).join('/');
}

/** `write`: a read-only root never admits a write, and the opt-out does not change that. */
export function checkFence(cfg: FenceConfig, input: string, access: 'read' | 'write'): FenceVerdict {
  const rootReal = realPathOf(cfg.workspaceRoot);
  const candidate = resolveInWorkspace(cfg, input);
  const resolved = realPathOf(candidate);
  const inside = isInside(rootReal, resolved);
  const rel = inside ? relPosix(rootReal, resolved) : resolved;
  if (inside) return { ok: true, resolved, rel: rel === '' ? '.' : rel, inside: true, readOnlyRoot: false };
  const underReadOnly = cfg.additionalReadOnlyRoots.some((r) => isInside(realPathOf(r), resolved));
  if (underReadOnly && access === 'read') return { ok: true, resolved, rel, inside: false, readOnlyRoot: true };
  if (cfg.allowOutsideWorkspace && !underReadOnly) return { ok: true, resolved, rel, inside: false, readOnlyRoot: false };
  return { ok: false, resolved, message: `Path '${resolved}' is outside workspace root '${rootReal}'` };
}
