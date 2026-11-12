import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok } from '@rotaris/kernel';
import type { Protector } from '@rotaris/platform';
import { dictationCommands } from './dictation.js';
import { dictationCredentialFile, type DictationCredentialDeps } from '../dictation/credential.js';

/**
 * PD-CONFIG-010, driven without a process behind it: the three credential commands answer the masked state alone, the value
 * travels inward and never back, and an empty value stores nothing. The facet's whole slice is the credential deps and the
 * log line, so this is the whole adapter.
 */
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-dictation-commands-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const okProtector: Protector = { protect: async () => ok(undefined) };

function facet(lines: string[] = []) {
  const dictationCredential: DictationCredentialDeps = { dir: join(dir, 'dictation'), protector: okProtector, warn: (m) => lines.push(`warn:${m}`) };
  return { handlers: dictationCommands({ services: new Map(), dictationCredential, log: (m) => lines.push(m) }), dictationCredential };
}

describe('the dictation credential commands — PD-CONFIG-010', () => {
  it('answers null while nothing is stored, and the one mask once something is', async () => {
    const { handlers } = facet();
    expect(await handlers['dictation.credential']({ kind: 'dictation.credential' }, {} as never)).toEqual({ ok: true, value: { masked: null } });
    expect(await handlers['dictation.setCredential']({ kind: 'dictation.setCredential', value: 'sk-live-1234' }, {} as never)).toEqual({ ok: true, value: { masked: '***' } });
    expect(await handlers['dictation.credential']({ kind: 'dictation.credential' }, {} as never)).toEqual({ ok: true, value: { masked: '***' } });
  });

  it('never carries the value back, in any answer', async () => {
    const { handlers } = facet();
    const stored = await handlers['dictation.setCredential']({ kind: 'dictation.setCredential', value: 'sk-live-1234' }, {} as never);
    const read = await handlers['dictation.credential']({ kind: 'dictation.credential' }, {} as never);
    const cleared = await handlers['dictation.clearCredential']({ kind: 'dictation.clearCredential' }, {} as never);
    for (const answer of [stored, read, cleared]) expect(JSON.stringify(answer)).not.toContain('sk-live-1234');
  });

  it('refuses an empty value and writes nothing', async () => {
    const { handlers, dictationCredential } = facet();
    const out = await handlers['dictation.setCredential']({ kind: 'dictation.setCredential', value: '   ' }, {} as never);
    expect(out).toMatchObject({ ok: false, code: 'dictation.credential-empty' });
    expect(await handlers['dictation.credential']({ kind: 'dictation.credential' }, {} as never)).toEqual({ ok: true, value: { masked: null } });
    expect(() => readFileSync(dictationCredentialFile(dictationCredential), 'utf8')).toThrow();
  });

  it('trims what it stores, replaces on a second set, and removes on a clear', async () => {
    const { handlers, dictationCredential } = facet();
    await handlers['dictation.setCredential']({ kind: 'dictation.setCredential', value: '  first  ' }, {} as never);
    expect(readFileSync(dictationCredentialFile(dictationCredential), 'utf8')).toBe('{\n  "bearer": "first"\n}\n');
    await handlers['dictation.setCredential']({ kind: 'dictation.setCredential', value: 'second' }, {} as never);
    expect(readFileSync(dictationCredentialFile(dictationCredential), 'utf8')).toContain('second');
    expect(await handlers['dictation.clearCredential']({ kind: 'dictation.clearCredential' }, {} as never)).toEqual({ ok: true, value: { masked: null, removed: true } });
    expect(await handlers['dictation.clearCredential']({ kind: 'dictation.clearCredential' }, {} as never)).toEqual({ ok: true, value: { masked: null, removed: false } });
  });

  it('leaves one log line per write, naming no value', async () => {
    const lines: string[] = [];
    const { handlers } = facet(lines);
    await handlers['dictation.setCredential']({ kind: 'dictation.setCredential', value: 'sk-live-1234' }, {} as never);
    await handlers['dictation.clearCredential']({ kind: 'dictation.clearCredential' }, {} as never);
    expect(lines.join('\n')).toContain('stored the dictation endpoint credential');
    expect(lines.join('\n')).toContain('removed the dictation endpoint credential');
    expect(lines.join('\n')).not.toContain('sk-live-1234');
  });
});
