import { realpathSync } from 'node:fs';
import { posix, win32 } from 'node:path';

/**
 * Path rules shared by the Git reads and the worktree writes.
 *
 * REQ-GIT-003: a path is excluded when its FIRST component relative to the tree root is `.rotaris`, compared
 * case-insensitively over the ASCII letters, and the test is applied to the path as the tree names it — never to
 * what it points at. REQ-GIT-106/109: a worktree is "active" and a binding is joined by RESOLVED path, so two
 * spellings of one directory compare equal.
 */
export function excludedPath(path: string): boolean {
  const first = path.replace(/^[\\/]+/, '').split(/[\\/]/, 1)[0] ?? '';
  return first.toLowerCase() === '.rotaris';
}

/** Separators to `/`, no trailing separator, ASCII case folded on win32 (a case-insensitive filesystem). */
export function normalisePath(path: string, platform: NodeJS.Platform = process.platform): string {
  let p = path.replace(/\\/g, '/');
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * The resolved, normalised spelling; a path that does not exist resolves lexically so it still compares.
 *
 * The lexical resolution follows the PLATFORM PARAMETER, as `canonicalPath` already does: a host-bound
 * `resolve` prefixed a Windows spelling with the POSIX host's own working directory, so `C:\ws\alpha`
 * compared equal to nothing a Windows machine would ever produce. Symlink resolution stays the HOST's
 * and is attempted only when the two agree — no parameter can make a Windows path exist on a POSIX disk.
 */
export function resolvedPath(path: string, platform: NodeJS.Platform = process.platform): string {
  const { resolve } = platform === 'win32' ? win32 : posix;
  let real = resolve(path);
  if (platform === process.platform) {
    try { real = realpathSync.native(path); } catch { /* absent or unreadable: the lexical resolution stands */ }
  }
  return normalisePath(real, platform);
}

export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  return resolvedPath(a, platform) === resolvedPath(b, platform);
}
