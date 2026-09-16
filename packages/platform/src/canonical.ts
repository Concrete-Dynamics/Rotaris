import { realpathSync } from 'node:fs';
import { posix, win32 } from 'node:path';

/**
 * Constraint W-27 / OQ-49 — what makes two directory strings the same
 * directory. Two processes reaching one store by two spellings of one path
 * silently destroy each other's writes (measured, spike 19), and the failure
 * depends on how the path is spelled (ESC-15 correction). ADR-0058 rule 6:
 * the store resolves to exactly one canonical spelling and every opener
 * uses it.
 *
 * Canonical here means: absolute, symlinks and junctions resolved by the
 * platform's own realpath, trailing separator removed, and on Windows the
 * drive letter upper-cased and the whole spelling compared case-insensitively
 * (NTFS is case-insensitive by default; a spelling that differs only by case
 * is the same directory).
 *
 * What it does not do: it does not attempt to unify a UNC spelling with a
 * mapped-drive spelling of the same share. That is OQ-49's open half, and a
 * store on a share is refused for other reasons (ESC-15).
 */
export function canonicalPath(p: string, platform: NodeJS.Platform = process.platform): string {
  // The platform is a PARAMETER: `C:\\ws\\alpha` and `c:/ws/ALPHA/` are one directory under the Windows rule
  // whatever host asks the question, so the separator and the resolver come from the parameter, not from the host.
  const { resolve, sep } = platform === 'win32' ? win32 : posix;
  let abs = resolve(p);
  try {
    abs = realpathSync.native(abs);
  } catch {
    // A path that does not exist yet keeps its resolved spelling; the caller decides whether that is an error.
  }
  if (abs.length > 1 && abs.endsWith(sep)) abs = abs.slice(0, -1);
  if (platform === 'win32') {
    if (/^[a-z]:/.test(abs)) abs = abs[0]!.toUpperCase() + abs.slice(1);
  }
  return abs;
}

/** Equality under the canonical rule. On Windows this is case-insensitive. */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const ca = canonicalPath(a, platform);
  const cb = canonicalPath(b, platform);
  return platform === 'win32' ? ca.toLowerCase() === cb.toLowerCase() : ca === cb;
}

/** A key for a Map keyed by directory identity (ADR-0002: the workspace service is keyed by resolved path). */
export function pathKey(p: string, platform: NodeJS.Platform = process.platform): string {
  const c = canonicalPath(p, platform);
  return platform === 'win32' ? c.toLowerCase() : c;
}
