import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSync, chmodSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LADDER_MS, replaceAtomically } from './replace.mjs';

/**
 * The immutable-attribute refusal, for the uid that ignores directory mode bits. Root bypasses DAC, so a
 * write-denied parent does not refuse its rename; a file marked immutable, however, root cannot rename over
 * either — EPERM, the same transient class the Windows handle raises and the ladder retries. Setting the flag
 * needs exactly the privilege that ignores the mode bits, so an unprivileged user cannot set it and does not
 * need to: for that uid the parent's mode still refuses. `chattr` is Linux, `chflags` macOS; anywhere else, or
 * without the privilege, this returns false and the caller falls back to the mode-bit refusal.
 */
const IMMUTABLE_SET = process.platform === 'linux' ? (['chattr', '+i'] as const) : process.platform === 'darwin' ? (['chflags', 'uchg'] as const) : null;
const IMMUTABLE_CLEAR = process.platform === 'linux' ? (['chattr', '-i'] as const) : process.platform === 'darwin' ? (['chflags', 'nouchg'] as const) : null;
function makeImmutable(path: string): boolean {
  if (!IMMUTABLE_SET) return false;
  try { execFileSync(IMMUTABLE_SET[0], [IMMUTABLE_SET[1], path], { stdio: 'ignore' }); return true; } catch { return false; }
}
function clearImmutable(path: string): void {
  if (!IMMUTABLE_CLEAR) return;
  try { execFileSync(IMMUTABLE_CLEAR[0], [IMMUTABLE_CLEAR[1], path], { stdio: 'ignore' }); } catch { /* best effort */ }
}

/**
 * OQ-41 — the contended replacement of a toolchain artifact, which the register recorded as unstaged: "the
 * contended case — a test session in the same checkout on Windows — was not staged and the residue stands".
 * It is staged here, with a REAL holder rather than a stubbed `fs`: on Windows an open descriptor is what makes
 * the rename fail (constraint D-06, measured), and elsewhere a real filesystem refusal that holds for the uid
 * running the test — a write-denied parent for an unprivileged user, an immutable target for root, which
 * ignores mode bits. Both are the transient class the ladder exists to retry, so the REAL ladder runs to
 * exhaustion for either uid; neither skips (a `chmod 0o555` refusal that root silently rename-through was the
 * defect these two notes recorded).
 *
 * REQ-TRACE-061's ladder, REQ-TRACE-502's complete-file guarantee, and the outcome the amendment fixes: a
 * recoverable error with the previous file retained, never a partial one and never a silent success.
 */
describe('REQ-TRACE-061 / REQ-TRACE-502 (OQ-41): the toolchain artifact is replaced whole or not at all', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-trace-replace-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  /**
   * The real refusal, holding for the uid running the test: an open descriptor on Windows; an immutable target
   * for a uid that ignores mode bits (root), so the rename is refused with EPERM; a write-denied parent for an
   * unprivileged uid, so the staging write is refused with EACCES. All three are transient codes, so the ladder
   * runs to its five attempts whichever refusal is in force.
   */
  const refuse = (target: string): (() => void) => {
    if (process.platform === 'win32') { const fd = openSync(target, 'r'); return () => closeSync(fd); }
    if (makeImmutable(target)) return () => clearImmutable(target);
    const before = statSync(dir).mode;
    chmodSync(dir, 0o555);
    return () => chmodSync(dir, before);
  };

  it('the ladder is five attempts behind four delays, and it is this domain\'s own figures', () => {
    expect(LADDER_MS).toEqual([50, 100, 200, 400]);
    expect(LADDER_MS.reduce((a, b) => a + b, 0)).toBe(750);
  });

  it('replaces at the first attempt when nothing contends, leaving no staged file behind', () => {
    const target = join(dir, 'requirements.ts');
    writeFileSync(target, 'previous');
    expect(replaceAtomically(target, 'next')).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe('next');
    expect(readdirSync(dir)).toEqual(['requirements.ts']);
  });

  it('a contended replacement exhausts the ladder, reports it, and leaves the previous artifact exactly as it stood', () => {
    const target = join(dir, 'requirements.ts');
    writeFileSync(target, 'previous');
    const before = readFileSync(target, 'utf8');
    const release = refuse(target);
    try {
      expect(() => replaceAtomically(target, 'next')).toThrow(/after 5 attempt\(s\)\); it was left exactly as it stood/);
    } finally { release(); }
    // REQ-TRACE-061: the previous file is retained, byte for byte, and the staged file is gone.
    expect(readFileSync(target, 'utf8')).toBe(before);
    expect(readdirSync(dir)).toEqual(['requirements.ts']);
  });
});
