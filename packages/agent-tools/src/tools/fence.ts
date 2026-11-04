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
 * (`docs/archive/defects/realpathof-drops-a-character-from-a-relative-path.md`). The falsified premise, kept beside
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

/**
 * How the platform's default file system tells two spellings of a name apart: the rule the fence compares resolved
 * paths under (REQ-TOOLS-129; R-091, `hardening.md` §3.4 row 5, bundle D3).
 *
 * - `foldsCase`: NTFS (Windows) and APFS (macOS, in its default form) open `Secret` for `secret`; ext4 and the other
 *   Linux file systems do not, so `/work/Secret` and `/work/secret` are two files there.
 * - `foldsUnicode`: APFS is normalisation-insensitive, so the NFC and the NFD spelling of one name are one file on
 *   macOS; NTFS and ext4 keep the code points as given, so there they are two.
 * - `backslashSeparates`: Windows reads `\` as a separator; on POSIX it is a character of a name, so `/work\x` is a
 *   file named `work\x` beside `/work`, never under it.
 *
 * Until 2026-11-04 every path was lower-cased and every backslash read as a separator on every platform, so on Linux a
 * sibling of the root differing from it by case alone (`/Work/x` beside `/work`), or a name made of the root's name, a
 * backslash and more, read as inside. The rule is the platform's DEFAULT file system's: a case-sensitive APFS volume or
 * a Windows directory marked case-sensitive still folds, and there a sibling that differs from the root by case alone
 * still reads as inside (`docs/defects/the-fence-folds-case-on-a-case-sensitive-volume-of-a-platform-that-folds-by-default.md`).
 */
export interface PathRule {
  readonly foldsCase: boolean;
  readonly foldsUnicode: boolean;
  readonly backslashSeparates: boolean;
}

/** The path rule of `platform`'s default file system. The fence takes `process.platform`'s unless a caller injects one. */
export function pathRuleFor(platform: NodeJS.Platform): PathRule {
  if (platform === 'win32') return { foldsCase: true, foldsUnicode: false, backslashSeparates: true };
  if (platform === 'darwin') return { foldsCase: true, foldsUnicode: true, backslashSeparates: false };
  return { foldsCase: false, foldsUnicode: false, backslashSeparates: false };
}

export const PLATFORM_PATH_RULE: PathRule = pathRuleFor(process.platform);

/** One spelling per file under `rule`: separators as `/`, no trailing one, case and normalisation folded where it folds them. */
export function pathKey(p: string, rule: PathRule = PLATFORM_PATH_RULE): string {
  let k = rule.backslashSeparates ? p.replace(/\\/g, '/') : p;
  k = k.replace(/\/+$/, '');
  if (rule.foldsUnicode) k = k.normalize('NFC');
  if (rule.foldsCase) k = k.toLowerCase();
  return k;
}

/** Whether `candidate` is `root` or lies under it past one separator, both already resolved, compared under `rule`. */
export function isInside(root: string, candidate: string, rule: PathRule = PLATFORM_PATH_RULE): boolean {
  const r = pathKey(root, rule);
  const c = pathKey(candidate, rule);
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
export function checkFence(cfg: FenceConfig, input: string, access: 'read' | 'write', rule: PathRule = PLATFORM_PATH_RULE): FenceVerdict {
  const rootReal = realPathOf(cfg.workspaceRoot);
  const candidate = resolveInWorkspace(cfg, input);
  const resolved = realPathOf(candidate);
  const inside = isInside(rootReal, resolved, rule);
  const rel = inside ? relPosix(rootReal, resolved) : resolved;
  if (inside) return { ok: true, resolved, rel: rel === '' ? '.' : rel, inside: true, readOnlyRoot: false };
  const underReadOnly = cfg.additionalReadOnlyRoots.some((r) => isInside(realPathOf(r), resolved, rule));
  if (underReadOnly && access === 'read') return { ok: true, resolved, rel, inside: false, readOnlyRoot: true };
  if (cfg.allowOutsideWorkspace && !underReadOnly) return { ok: true, resolved, rel, inside: false, readOnlyRoot: false };
  return { ok: false, resolved, message: `Path '${resolved}' is outside workspace root '${rootReal}'` };
}
