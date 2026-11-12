import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { err, failure, ok } from '@rotaris/kernel';
import { createProtector, type Protector } from '@rotaris/platform';
import { clearDictationCredential, decodeDictationCredential, dictationCredentialFile, encodeDictationCredential, maskedBearer, readDictationCredential, writeDictationCredential, type DictationCredentialDeps } from './credential.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-dictation-credential-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const okProtector: Protector = { protect: async () => ok(undefined) };
const refusing: Protector = { protect: async (p) => err(failure('credential.protect', `nope ${p}`, 'the volume has no access-control list')) };

function deps(protector: Protector = okProtector, log: string[] = []): DictationCredentialDeps {
  return { dir: join(dir, 'dictation'), protector, warn: (m) => log.push(`warn:${m}`) };
}

describe('PD-CONFIG-010 — the dictation endpoint credential', () => {
  it('stores one protected file beside the credential store, and reads the bearer back', async () => {
    const d = deps();
    expect(await writeDictationCredential(d, 'sk-dictation-1234')).toEqual({ ok: true, value: undefined });
    expect(dictationCredentialFile(d)).toBe(join(dir, 'dictation', 'credential.json'));
    expect(readFileSync(dictationCredentialFile(d), 'utf8')).toBe('{\n  "bearer": "sk-dictation-1234"\n}\n');
    expect(readDictationCredential(d)).toBe('sk-dictation-1234');
  });

  it('is absent, not an error, when nothing is stored, and a clear of nothing removes nothing', async () => {
    const d = deps();
    expect(readDictationCredential(d)).toBeNull();
    expect(await clearDictationCredential(d)).toEqual({ ok: true, value: { removed: false } });
  });

  it('replaces the stored bearer, and a clear removes it', async () => {
    const d = deps();
    await writeDictationCredential(d, 'first');
    await writeDictationCredential(d, 'second');
    expect(readDictationCredential(d)).toBe('second');
    expect(await clearDictationCredential(d)).toEqual({ ok: true, value: { removed: true } });
    expect(readDictationCredential(d)).toBeNull();
    expect(existsSync(dictationCredentialFile(d))).toBe(false);
  });

  it('treats a file that does not parse, or holds no bearer, as absent and says so without naming a value', () => {
    const log: string[] = [];
    const d = deps(okProtector, log);
    mkdirSync(join(dir, 'dictation'), { recursive: true });
    writeFileSync(join(dir, 'dictation', 'credential.json'), 'not json');
    expect(readDictationCredential(d)).toBeNull();
    expect(log.join(' ')).toContain('could not be read');
    expect(log.join(' ')).not.toContain('not json');
    expect(() => decodeDictationCredential('{"bearer":""}')).toThrow();
    expect(() => decodeDictationCredential('{"bearer":42}')).toThrow();
    expect(encodeDictationCredential('x')).toBe('{\n  "bearer": "x"\n}\n');
  });

  it('writes nothing when the protection cannot be applied, and leaves the previous file in place', async () => {
    const d = deps();
    await writeDictationCredential(d, 'kept');
    const refused = await writeDictationCredential(deps(refusing), 'replacement');
    expect(refused.ok).toBe(false);
    expect(readDictationCredential(d)).toBe('kept');
  });

  it('protects the staged file BEFORE a byte is written, and leaves no staged file behind (REQ-PROVIDER-016)', async () => {
    const seen: { path: string; kind: string; bytes: number }[] = [];
    const spy: Protector = { protect: async (path, kind) => { seen.push({ path, kind, bytes: kind === 'file' ? readFileSync(path).byteLength : -1 }); return ok(undefined); } };
    const d = deps(spy);
    expect(await writeDictationCredential(d, 'sk-live')).toEqual({ ok: true, value: undefined });
    expect(seen.filter((v) => v.kind === 'directory')).toHaveLength(1);
    const staged = seen.filter((v) => v.kind === 'file');
    expect(staged).toHaveLength(1);
    expect(staged[0]!.bytes).toBe(0);
    expect(readdirSync(join(dir, 'dictation')).filter((f) => f.includes('staging'))).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('on this machine: the directory is 0700 and the credential 0600', async () => {
    const d = deps(createProtector({ scratchDir: dir }));
    expect(await writeDictationCredential(d, 'sk-live')).toEqual({ ok: true, value: undefined });
    expect(statSync(join(dir, 'dictation')).mode & 0o777).toBe(0o700);
    expect(statSync(dictationCredentialFile(d)).mode & 0o777).toBe(0o600);
  });

  it('shows REQ-TOOLS-171\'s one mask and never the bearer, and no length of it', () => {
    expect(maskedBearer('sk-dictation-1234')).toBe('***');
    expect(maskedBearer('sk-dictation-1234')).not.toContain('sk-dictation');
    expect(maskedBearer('short')).toBe(maskedBearer('a-much-longer-bearer-value'));
    expect(maskedBearer(null)).toBeNull();
  });
});
