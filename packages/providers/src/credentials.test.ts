import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { FakeClock, millis, ok, err, failure } from '@rotaris/kernel';
import { CredentialStore, credentialStatus, decodeCredential, headerValidKey, KEY_CONTROL, KEY_NOT_ASCII } from './credentials/store.js';
import { createProtector, isExactDacl, parseDacl, SYSTEM_SID, type Protector } from './credentials/protect.js';
import { LOCK_BUSY, withLock, type LockDeps } from './credentials/lock.js';

let dir: string;
let clock: FakeClock;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-tokens-')); clock = new FakeClock(); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const lockDeps = (over: Partial<LockDeps> = {}): LockDeps => ({ pid: process.pid, startedAt: '2026-09-05T00:00:00.000Z', timers: clock, monotonic: clock, ...over });
const okProtector: Protector = { protect: async () => ok(undefined) };
const refusing: Protector = { protect: async (p) => err(failure('credential.protect', `nope ${p}`, 'the volume has no access-control list')) };

function store(protector: Protector = okProtector, log: string[] = []) {
  return new CredentialStore({ dir: join(dir, 'tokens'), protector, lock: lockDeps(), random: () => 'r1', warn: (m) => log.push(`warn:${m}`), info: (m) => log.push(`info:${m}`) });
}
const cred = { access_token: 'sk-or-v1-abc', refresh_token: '', expires_at: 0, account_id: null, extra: { provider_family: 'openai-compatible', api_base: 'https://openrouter.ai/api/v1' } };

describe('the credential store (ADR-0029; REQ-PROVIDER-014/017/018/019)', () => {
  it('writes one JSON file per provider, five keys, two-space indented, and reads it back', async () => {
    const s = store();
    expect((await s.save('openai-compatible--openrouter', cred)).ok).toBe(true);
    const text = readFileSync(join(dir, 'tokens', 'openai-compatible--openrouter.json'), 'utf8');
    expect(text).toBe(`${JSON.stringify(cred, null, 2)}\n`);
    expect(s.load('openai-compatible--openrouter')).toEqual(cred);
    expect(s.exists('openai-compatible--openrouter')).toBe(true);
    expect(s.list()).toEqual(['openai-compatible--openrouter']);
    expect(s.strayEntries()).toEqual([]);
  });
  it('tolerates a missing expiry, account id and extras; a corrupt file warns naming the id only (REQ-PROVIDER-017)', () => {
    const log: string[] = [];
    const s = store(okProtector, log);
    mkdirSync(join(dir, 'tokens'));
    writeFileSync(join(dir, 'tokens', 'deepseek.json'), '{"access_token":"k","refresh_token":""}');
    expect(s.load('deepseek')).toEqual({ access_token: 'k', refresh_token: '', expires_at: 0, account_id: null, extra: {} });
    writeFileSync(join(dir, 'tokens', 'codex.json'), '{"access_token":"SECRETVALUE"');
    expect(s.load('codex')).toBeNull();
    expect(log.some((l) => l.includes('codex') && !l.includes('SECRETVALUE'))).toBe(true);
    expect(() => decodeCredential('[]')).toThrow();
  });
  it('status is a function of the credential and the clock (REQ-PROVIDER-010/011)', () => {
    expect(credentialStatus(null, 100)).toBe('unauthenticated');
    expect(credentialStatus({ ...cred, expires_at: 0 }, 1e12)).toBe('authenticated');
    expect(credentialStatus({ ...cred, expires_at: 100 }, 100)).toBe('expired');
    expect(credentialStatus({ ...cred, expires_at: 100 }, 99)).toBe('authenticated');
    expect(credentialStatus({ ...cred, access_token: '' }, 1)).toBe('unauthenticated');
  });
  it('a protection failure writes nothing and names the store path (REQ-PROVIDER-016)', async () => {
    const s = store(refusing);
    const r = await s.save('deepseek', cred);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.headline).toContain('No credential was stored');
      expect(r.error.headline).toContain(join(dir, 'tokens'));
    }
    expect(existsSync(join(dir, 'tokens', 'deepseek.json'))).toBe(false);
    expect(s.strayEntries()).toEqual([]);
  });
  it('a failed write leaves the previous file and no temp file (REQ-PROVIDER-018)', async () => {
    const s = store();
    await s.save('deepseek', cred);
    let calls = 0;
    const flaky: Protector = { protect: async (_p, k) => (k === 'file' && ++calls === 1 ? err(failure('x', 'boom')) : ok(undefined)) };
    const s2 = new CredentialStore({ dir: join(dir, 'tokens'), protector: flaky, lock: lockDeps(), random: () => 'r2', warn: () => {}, info: () => {} });
    const r = await s2.save('deepseek', { ...cred, access_token: 'new' });
    expect(r.ok).toBe(false);
    expect(s2.load('deepseek')?.access_token).toBe('sk-or-v1-abc');
    expect(readdirSync(join(dir, 'tokens')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
  it('delete removes the file and logs; a missing file is not an error (REQ-PROVIDER-019)', async () => {
    const log: string[] = [];
    const s = store(okProtector, log);
    await s.save('deepseek', cred);
    expect(await s.delete('deepseek')).toEqual({ ok: true, value: { removed: true } });
    expect(log).toContain('info:Deleted stored tokens for deepseek');
    expect(await s.delete('deepseek')).toEqual({ ok: true, value: { removed: false } });
    expect(s.strayEntries()).toEqual([]);
  });
  it('refuses an id that is not a provider identifier', async () => {
    const s = store();
    expect((await s.save('../escape', cred)).ok).toBe(false);
    expect(s.exists('../escape')).toBe(false);
  });
  it('header validation (REQ-PROVIDER-062)', () => {
    expect(headerValidKey(' sk-abc ')).toEqual({ ok: true, value: 'sk-abc' });
    expect(headerValidKey('sk-ébc')).toEqual({ ok: false, error: KEY_NOT_ASCII });
    expect(headerValidKey('sk-a\u0007bc')).toEqual({ ok: false, error: KEY_CONTROL });
  });
});

describe('the adjacent lock (REQ-PROVIDER-152)', () => {
  it('serialises: a live holder blocks until the bound, then fails with the retryable message', async () => {
    const lock = join(dir, 'x.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid + 1, started_at: 'now' }));
    const deps = lockDeps({ probe: () => 'alive', boundMs: millis(200), pollMs: millis(50) });
    const p = withLock(lock, deps, async () => ok('ran'));
    for (let i = 0; i < 6; i++) { await Promise.resolve(); clock.advance(50); await Promise.resolve(); }
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.headline).toBe(LOCK_BUSY);
      expect(r.error.headline).not.toMatch(/instance/i);
    }
    expect(existsSync(lock)).toBe(true);
  });
  it('reclaims a lock whose holder is provably gone, and a malformed one; releases on every path', async () => {
    const lock = join(dir, 'y.lock');
    writeFileSync(lock, JSON.stringify({ pid: 999_999, started_at: 'then' }));
    const r = await withLock(lock, lockDeps({ probe: () => 'dead' }), async () => ok('ran'));
    expect(r).toEqual({ ok: true, value: 'ran' });
    expect(existsSync(lock)).toBe(false);
    writeFileSync(lock, 'garbage');
    const r2 = await withLock(lock, lockDeps({ probe: () => 'alive' }), async () => { throw new Error('inside'); }).catch((e: Error) => e.message);
    expect(r2).toBe('inside');
    expect(existsSync(lock)).toBe(false);
  });
});

describe('the protection adapter (REQ-PROVIDER-016; spikes/credential-protection.md)', () => {
  it('parses SDDL and demands exactly the two trustees, full control, protected, nothing inherited', () => {
    const me = 'S-1-5-21-1-2-3-1001';
    expect(isExactDacl(parseDacl(`D:PAI(A;;FA;;;${me})(A;;FA;;;SY)`), me)).toBeNull();
    expect(isExactDacl(parseDacl(`D:AI(A;ID;FA;;;${me})(A;ID;FA;;;SY)`), me)).toMatch(/inheritance/);
    expect(isExactDacl(parseDacl(`D:PAI(A;;FA;;;${me})(A;;FA;;;SY)(A;;FR;;;BU)`), me)).toMatch(/two/);
    expect(isExactDacl(parseDacl(`D:PAI(A;;FR;;;${me})(A;;FA;;;SY)`), me)).toMatch(/full control/);
    expect(isExactDacl(parseDacl(`D:PAI(A;;FA;;;${me})(A;;FA;;;BA)`), me)).toMatch(/trustees/);
    expect(isExactDacl(parseDacl('O:BAG:BA'), me)).toMatch(/no DACL/);
    expect(parseDacl(`D:PAI(A;;FA;;;${SYSTEM_SID})`)?.aces[0]?.sid).toBe(SYSTEM_SID);
  });
  it('the Windows adapter runs /reset, then /inheritance:r /grant:r with SID literals, then reads back — and refuses when the read-back is not exact', async () => {
    const calls: string[][] = [];
    let sddl = 'D:PAI(A;;FA;;;S-1-5-21-9-9-9-1001)(A;;FA;;;SY)';
    const exec = async (cmd: string, args: readonly string[]) => {
      calls.push([cmd, ...args]);
      if (cmd.endsWith('whoami.exe')) return { status: 0, stdout: '"host\\me","S-1-5-21-9-9-9-1001"\r\n', stderr: '' };
      if (args.includes('/save')) { writeFileSync(args[args.indexOf('/save') + 1]!, Buffer.concat([Buffer.from('\uFEFF', 'utf16le'), Buffer.from(`name\r\n${sddl}\r\n`, 'utf16le')])); return { status: 0, stdout: '', stderr: '' }; }
      return { status: 0, stdout: '', stderr: '' };
    };
    const p = createProtector({ platform: 'win32', env: { SystemRoot: 'C:\\W' }, exec, scratchDir: dir, random: () => 'z' });
    expect(await p.protect(join(dir, 'f.json'), 'file')).toEqual({ ok: true, value: undefined });
    const icacls = calls.filter((c) => c[0]!.endsWith('icacls.exe')).map((c) => c.slice(2));
    expect(icacls[0]).toEqual(['/reset']);
    expect(icacls[1]).toEqual(['/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-21-9-9-9-1001:F']);
    expect(icacls[2]?.[0]).toBe('/save');
    expect(readdirSync(dir).filter((f) => f.startsWith('.acl-'))).toEqual([]);
    sddl = 'D:PAI(A;;FA;;;S-1-5-21-9-9-9-1001)(A;;FA;;;SY)(A;;FR;;;BU)';
    const r = await p.protect(join(dir, 'g.json'), 'file');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toMatch(/two/);
    calls.length = 0;
    await p.protect(join(dir, 'd'), 'directory');
    expect(calls.some((c) => c.includes('*S-1-5-18:(OI)(CI)F'))).toBe(true);
    expect(calls.some((c) => c[0]!.endsWith('whoami.exe'))).toBe(false);
  });
  it.skipIf(process.platform !== 'win32')('on this machine: a foreign explicit ACE planted before a save does not survive it (the spike\'s finding)', async () => {
    const s = new CredentialStore({ dir: join(dir, 'tokens'), protector: createProtector({ scratchDir: dir }), lock: lockDeps(), random: () => 'live', warn: () => {}, info: () => {} });
    expect((await s.ensureDirectory()).ok).toBe(true);
    const target = join(dir, 'tokens', 'deepseek.json');
    writeFileSync(target, '{}');
    execFileSync('icacls.exe', [target, '/grant', '*S-1-5-32-545:R'], { windowsHide: true, stdio: 'ignore' });
    const r = await s.save('deepseek', cred);
    expect(r).toEqual({ ok: true, value: undefined });
    const p = createProtector({ scratchDir: dir });
    // The saved file is a renamed temp: protected before it was written, so a second protect is a no-op that must still read back exact.
    expect(await p.protect(target, 'file')).toEqual({ ok: true, value: undefined });
    expect(s.strayEntries()).toEqual([]);
  });
});
