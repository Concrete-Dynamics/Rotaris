import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { LAYOUT_CONFIG_FILE, defaultLayout, loadLayout } from './layout.js';

/**
 * Repository-root discovery (REQ-TRACE-048/049): walk upward from a starting directory, innermost first, and
 * return the first candidate where (a) the layout configuration file exists — tested before (b) — or (b) the store
 * directory exists AND at least one configured implementation root exists as a directory. "Configured" at a
 * candidate with no file means the default layout. With no candidate anywhere, fall back to the start directory:
 * REQ-TRACE-049's "current working directory" is read as the directory the caller supplied, since the service's own
 * cwd names nothing (REQ-TRACE-512 fixes the start as the open workspace).
 */
export interface RootFs {
  isFile(path: string): boolean;
  isDirectory(path: string): boolean;
}

export const nodeRootFs: RootFs = {
  isFile: (p) => { try { return statSync(p).isFile(); } catch { return false; } },
  isDirectory: (p) => { try { return statSync(p).isDirectory(); } catch { return false; } },
};

export function discoverRoot(start: string, fs: RootFs = nodeRootFs): string {
  let candidate = resolve(start);
  for (;;) {
    if (fs.isFile(join(candidate, LAYOUT_CONFIG_FILE))) return candidate;
    const layout = defaultLayout();
    if (fs.isDirectory(join(candidate, layout.requirementsDir)) && layout.implRoots.some((r) => fs.isDirectory(join(candidate, r)))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return resolve(start);
}

/** Convenience for the owner: the root, then the layout found there (or the default). */
export function discoverRootAndLayout(start: string): { readonly root: string; readonly load: ReturnType<typeof loadLayout> } {
  const root = discoverRoot(start);
  return { root, load: loadLayout(root) };
}

export function storeDirectoryExists(root: string, storeDir: string): boolean {
  return existsSync(join(root, storeDir));
}
