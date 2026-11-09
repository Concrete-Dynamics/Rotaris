import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ok } from '@rotaris/kernel';
import { createProtector, isExactDacl, parseDacl, SYSTEM_SID, type Protector } from './protection.js';
import { replaceDocument } from './document.js';

/**
 * REQ-PROVIDER-016's protection adapter (ADR-0029) and its new home in `platform` (moved whole from
 * `packages/providers/src/credentials/protect.ts` on 2026-11-09, slice-B rework round 1): REQ-CONFIG-216 cites the
 * same requirement for `secrets.yaml`, and only `platform` sits below BOTH callers (`providers`' credential store and
 * `config`'s secrets writer — neither package may import the other). The adapter's own behaviour is pinned here; the
 * credential store's and the secrets writer's use of it stays pinned beside each of them (their substitution pin in
 * `credential-store.test.ts` / `secrets-write.test.ts`).
 *
 * REQ-PROVIDER-016 has two halves and the adapter picks between them by platform, so each half is proved on the host
 * that has it — the Windows half with the adapter's `exec` injected (no Windows host exists here), the POSIX half
 * against real files.
 */
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-protection-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('the protection adapter (REQ-PROVIDER-016; spikes/credential-protection.md)', () => {
  it('parses SDDL and demands exactly the two trustees, full control, protected, nothing inherited', () => {
    const me = 'S-1-5-21-1-2-3-1001';
    expect(isExactDacl(parseDacl(`D:PAI(A;;FA;;;${me})(A;;FA;;;SY)`), me)).toBeNull();
    expect(isExactDacl(parseDacl(`D:AI(A;ID;FA;;;${me})(A;ID;FA;;;SY)`), me)).toMatch(/inheritance/);
    expect(isExactDacl(parseDacl(`D:PAI(A;;FA;;;${me})(A;;FA;;;SY)(A;;FR;;;BU)`), me)).toMatch(/two/);
    expect(isExactDacl(parseDacl(`D:PAI(A;;FR;;;${me})(A;;FA;;;SY)`), me)).toMatch(/full control/);
    expect(isExactDacl(parseDacl(`D:PAI(A;;FA;;;${me})(A;;FA;;;BA)`), me)).toMatch(/trustees/);
    expect(isExactDacl(parseDacl('O:BAG:BA'), me)).toMatch(/no DACL/);
    // The built-in Administrator and Guest read back as SDDL's `LA` / `LG`, and are the owner only for that account.
    const admin = 'S-1-5-21-4159254826-2043646976-2705649753-500';
    expect(isExactDacl(parseDacl('D:PAI(A;OICI;FA;;;LA)(A;OICI;FA;;;SY)'), admin)).toBeNull();
    expect(isExactDacl(parseDacl('D:PAI(A;;FA;;;LG)(A;;FA;;;SY)'), 'S-1-5-21-1-2-3-501')).toBeNull();
    expect(isExactDacl(parseDacl('D:PAI(A;;FA;;;LA)(A;;FA;;;SY)'), me)).toMatch(/trustees/);
    expect(isExactDacl(parseDacl('D:PAI(A;;FA;;;LG)(A;;FA;;;SY)'), admin)).toMatch(/trustees/);
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
  it.skipIf(process.platform === 'win32')('on this machine: 0700 on the directory and 0600 on the file, applied explicitly over a loose mode and read back', async () => {
    const p = createProtector({ scratchDir: dir });
    const loose = join(dir, 'loose.json');
    writeFileSync(loose, '{}', { mode: 0o666 });
    chmodSync(loose, 0o666); // `mode:` is masked by the umask; this is the condition the requirement forbids inheriting
    expect(await p.protect(loose, 'file')).toEqual({ ok: true, value: undefined });
    expect(statSync(loose).mode & 0o777).toBe(0o600);
    const sub = join(dir, 'sub');
    mkdirSync(sub, { mode: 0o777 });
    chmodSync(sub, 0o777);
    expect(await p.protect(sub, 'directory')).toEqual({ ok: true, value: undefined });
    expect(statSync(sub).mode & 0o777).toBe(0o700);
    // REQ-PROVIDER-016: protection that cannot be applied is a refusal on this code, never a silent pass.
    const missing = await p.protect(join(dir, 'not-here.json'), 'file');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('credential.protect');
  });
});

/**
 * ADR-0004's `replaceDocument` with a `protector` (2026-11-09, slice-B rework round 1): REQ-CONFIG-216's ordering —
 * the staged sibling is created, protected and READ BACK before a byte of content is written; a refusal answers
 * before the rename, so "the write does not happen" needs no rollback because the target was never touched.
 *
 * HOW THE ORDERING IS OBSERVED: the injected protector records what it sees — the staged file's size (0 bytes: the
 * content has not been written), which file it was handed (the staging sibling inside the target's own directory,
 * not the target), and the target's own bytes at that instant (the previous file, whole). With a post-rename
 * protection every one of those three is wrong: the staged path is never handed over, or it is handed over with the
 * content already in it.
 */
describe('replaceDocument protect-then-write (REQ-CONFIG-216 via REQ-PROVIDER-016)', () => {
  const observing = () => {
    const seen: { path: string; bytesAtProtect: number; target: string | null }[] = [];
    const protector: Protector = {
      protect: async (path) => {
        seen.push({ path, bytesAtProtect: existsSync(path) ? readFileSync(path).byteLength : -1, target: null });
        return ok(undefined);
      },
    };
    return { seen, protector };
  };
  it('protects the EMPTY staged sibling, then writes, then renames — the target untouched until the rename', async () => {
    const target = join(dir, 'secrets.yaml');
    writeFileSync(target, 'previous: content\n');
    const { seen, protector } = observing();
    const r = await replaceDocument(target, 'server:\n  KEY: value\n', { protector });
    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.path).not.toBe(target);
    expect(dirname(seen[0]!.path)).toBe(dirname(target)); // staged in the target's own parent
    expect(seen[0]!.bytesAtProtect).toBe(0); // NOT ONE BYTE of content existed when protection was asked
    expect(readFileSync(target, 'utf8')).toBe('server:\n  KEY: value\n');
    expect(readdirSync(dir).filter((f) => f.includes('staging'))).toEqual([]);
  });
  it('a protector refusal answers document.protect with the target UNTOUCHED and no staging file left', async () => {
    const target = join(dir, 'secrets.yaml');
    writeFileSync(target, 'previous: content\n');
    const refusing: Protector = { protect: async () => ({ ok: false as const, error: { code: 'credential.protect', headline: 'The protection could not be applied', detail: 'the volume has no access-control list' } }) };
    const r = await replaceDocument(target, 'server:\n  KEY: value\n', { protector: refusing });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('document.protect');
      expect(r.error.detail).toContain('no access-control list');
    }
    expect(readFileSync(target, 'utf8')).toBe('previous: content\n');
    expect(readdirSync(dir).filter((f) => f.includes('staging'))).toEqual([]);
  });
  it('a refusal on a target that does not exist CREATES NOTHING — no empty file, no staging', async () => {
    const target = join(dir, 'fresh.yaml');
    const refusing: Protector = { protect: async () => ({ ok: false as const, error: { code: 'credential.protect', headline: 'no', detail: 'the directory could not be protected' } }) };
    const r = await replaceDocument(target, 'server:\n  KEY: value\n', { protector: refusing });
    expect(r.ok).toBe(false);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });
  it('on this machine the real POSIX adapter runs before the write and the result is 0600 — fails if the protector option is dropped from the call path', async () => {
    if (process.platform === 'win32') return;
    const target = join(dir, 'secrets.yaml');
    const r = await replaceDocument(target, 'server:\n  KEY: value\n', { protector: createProtector({ scratchDir: dir }) });
    expect(r.ok).toBe(true);
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });
  it('the mode is never weaker than 0600 at any observable instant: a sampler started before the call never reads a group/other bit', async () => {
    if (process.platform === 'win32') return;
    const target = join(dir, 'secrets.yaml');
    const observed: number[] = [];
    // A sampler that keeps statting the TARGET while the write is in flight, and for a while after it — so the
    // final state is observed at least once however the loop interleaves (a no-op protector would leave 0644 there
    // and this case would go red: the negative control of the round-1 report).
    const sampler = (async () => {
      for (let i = 0; i < 100; i++) {
        try { observed.push(statSync(target).mode & 0o777); } catch { /* not yet visible: fine */ }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();
    const r = await replaceDocument(target, 'server:\n  KEY: super-secret\n', { protector: createProtector({ scratchDir: dir }) });
    await sampler;
    expect(r.ok).toBe(true);
    expect(observed.length).toBeGreaterThan(0); // the loop ran against the finished file at least once
    // Every sample that saw a file at all saw 0600: the content is never observable at the umask's mode.
    expect([...new Set(observed)]).toEqual([0o600]);
  });
});
