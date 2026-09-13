import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSync, chmodSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LADDER_MS, replaceAtomically } from './replace.mjs';

/**
 * OQ-41 — the contended replacement of a toolchain artifact, which the register recorded as unstaged: "the
 * contended case — a test session in the same checkout on Windows — was not staged and the residue stands".
 * It is staged here, with a REAL holder rather than a stubbed `fs`: on Windows an open descriptor is what makes
 * the rename fail (constraint D-06, measured), and elsewhere a write-denied parent does.
 *
 * REQ-TRACE-061's ladder, REQ-TRACE-502's complete-file guarantee, and the outcome the amendment fixes: a
 * recoverable error with the previous file retained, never a partial one and never a silent success.
 */
describe('REQ-TRACE-061 / REQ-TRACE-502 (OQ-41): the toolchain artifact is replaced whole or not at all', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-trace-replace-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  /** The real refusal: an open descriptor on Windows, a write-denied parent elsewhere. */
  const refuse = (target: string): (() => void) => {
    if (process.platform === 'win32') { const fd = openSync(target, 'r'); return () => closeSync(fd); }
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
