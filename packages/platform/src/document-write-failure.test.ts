import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as Fs from 'node:fs';

/**
 * ADR-0004: exclusive create answers a `Result` on every failure, including a write that fails after the create (a full
 * disk), and removes the partial file it minted best-effort (REQ-TRACE-061). A full disk cannot be produced on demand, so
 * `writeSync` is made to refuse with ENOSPC for the descriptors this test arms
 * (`docs/defects/fixed/the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md`).
 */
const refuse = { armed: false };
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  const writeSync = ((...args: Parameters<typeof real.writeSync>) => {
    if (refuse.armed) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    return (real.writeSync as (...a: unknown[]) => number)(...args);
  }) as typeof real.writeSync;
  return { ...real, default: { ...real, writeSync }, writeSync };
});

const { exclusiveCreate } = await import('./document.js');

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-document-write-')); });
afterEach(() => { refuse.armed = false; rmSync(dir, { recursive: true, force: true }); });

describe('the document primitive — a write that fails after an exclusive create (ADR-0004)', () => {
  it('answers document.exclusive.write, never throws, and leaves no partial document to be read as established', () => {
    const target = join(dir, 'id');
    refuse.armed = true;
    let thrown: unknown;
    let r: ReturnType<typeof exclusiveCreate> | undefined;
    try { r = exclusiveCreate(target, 'first\n'); } catch (e) { thrown = e; }
    refuse.armed = false;
    expect(thrown).toBeUndefined();
    expect(r?.ok === false && r.error.code).toBe('document.exclusive.write');
    expect(r?.ok === false && r.error.detail).toMatch(/ENOSPC/);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
    // The next create mints, rather than reading a truncated document as the one already established (D-29).
    const again = exclusiveCreate(target, 'second\n');
    expect(again.ok && again.value.minted).toBe(true);
  });
});
