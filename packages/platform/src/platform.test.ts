import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { millis, mintMachineId, FakeClock, type MachineId } from '@rotaris/kernel';
import { replaceDocument, replaceDocumentSync, exclusiveCreate, guardedRead, probePid, isLockLive, isLockForeign, canonicalPath, samePath, readOrMintMachineId, resolveUserDirs, dataLayout, claimInstance, endpointFor, nodeClocks, findExecutable, environmentWithout, PreferenceStore, resolvePreferenceRoot, coercePaneLayout, composerDraftKey } from './index.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-platform-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const M = mintMachineId('00000000000000000000000000000001');
const OTHER = mintMachineId('00000000000000000000000000000002');

describe('platform — per-user directories (REQ-STARTUP-145)', () => {
  it('on Windows both directories are under the LOCAL profile, never the roaming one', () => {
    const d = resolveUserDirs({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\U\\me\\AppData\\Local', APPDATA: 'C:\\U\\me\\AppData\\Roaming' }, home: 'C:\\U\\me' });
    expect(d.config).toBe(win32.join('C:\\U\\me\\AppData\\Local', 'rotaris', 'rotaris'));
    expect(d.data).toBe(win32.join('C:\\U\\me\\AppData\\Local', 'rotaris', 'data'));
    expect(d.config).not.toContain('Roaming');
    expect(d.data).not.toContain('Roaming');
  });
  it('REQ-CONFIG-001: the Windows global configuration directory is spelled %LOCALAPPDATA%\\rotaris\\rotaris\\, and it is not the data directory (D-04)', () => {
    // Until 2026-09-29 the `win32` case answered `<LOCALAPPDATA>\rotaris\config`, a name the requirement never spells
    // (`docs/defects/fixed/the-windows-global-configuration-directory-is-not-the-one-req-config-001-spells.md`).
    const d = resolveUserDirs({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, home: 'C:\\Users\\me' });
    expect(d.config).toBe('C:\\Users\\me\\AppData\\Local\\rotaris\\rotaris');
    expect(d.data).toBe('C:\\Users\\me\\AppData\\Local\\rotaris\\data');
    expect(d.config).not.toBe(d.data);
    // With LOCALAPPDATA unset the same spelling is composed from the home's own local profile.
    const unset = resolveUserDirs({ platform: 'win32', env: {}, home: 'C:\\Users\\me' });
    expect(unset.config).toBe('C:\\Users\\me\\AppData\\Local\\rotaris\\rotaris');
  });
  it('on Linux the XDG variables govern', () => {
    const d = resolveUserDirs({ platform: 'linux', env: { XDG_CONFIG_HOME: '/x/cfg', XDG_DATA_HOME: '/x/data' }, home: '/home/me' });
    // The expectation is spelled the way the PLATFORM PARAMETER spells it. `join` used to be the host's,
    // so on Windows it answered `\x\cfg\rotaris` and the proof disagreed with the repaired code rather
    // than with the defect — the same class the code was repaired for, in the assertion that measures it.
    expect(d.config).toBe('/x/cfg/rotaris');
    expect(d.data).toBe('/x/data/rotaris');
  });
  it('the sub-locations are spelled by the platform asked about, not the host asking (R3 separator residue)', () => {
    // The defect this pins: a bare host-bound `join` spelled the Windows answer with POSIX separators
    // whenever the question was asked off Windows. Production always agrees with its host, so this is
    // a proof-of-the-rule case — other-platform answers decided on every operating system.
    const win = { config: 'C:\\U\\me\\AppData\\Local\\rotaris\\rotaris', data: 'C:\\U\\me\\AppData\\Local\\rotaris\\data' } as const;
    const layout = dataLayout(win, 'win32');
    expect(layout.workspaces).toBe(win32.join(win.data, 'workspaces'));
    expect(layout.instanceRecord).toBe(win32.join(win.data, 'instance.json'));
    expect(layout.machineId).toBe(win32.join(win.data, 'machine-id'));
    expect(layout.tokens).toBe(win32.join(win.data, 'tokens'));
    const store = new PreferenceStore('X:\\proof', 'win32');
    expect(store.file).toBe(win32.join('X:\\proof', 'preferences.json'));
    // `environmentWithout` folds case on Windows however the host spells its own variables.
    expect(environmentWithout(['git_dir'], { GIT_DIR: '/x', PATH: '/bin' }, 'win32')).toEqual({ PATH: '/bin' });
    expect(environmentWithout(['git_dir'], { GIT_DIR: '/x', PATH: '/bin' }, 'linux')).toEqual({ GIT_DIR: '/x', PATH: '/bin' });
  });
});

describe('platform — the atomic document primitive (ADR-0004)', () => {
  it('replace leaves the previous complete document or the new one, and no staging file behind', async () => {
    const f = join(dir, 'doc.txt');
    writeFileSync(f, 'old');
    const r = await replaceDocument(f, 'new');
    expect(r.ok).toBe(true);
    expect(readFileSync(f, 'utf8')).toBe('new');
    expect(readdirSync(dir).filter((n) => n.includes('staging'))).toEqual([]);
  });
  it('replace creates the parent only when told to (REQ-TRACE-061)', async () => {
    const f = join(dir, 'deep', 'doc.txt');
    expect((await replaceDocument(f, 'x')).ok).toBe(false);
    expect((await replaceDocument(f, 'x', { createParent: true })).ok).toBe(true);
    expect(readFileSync(f, 'utf8')).toBe('x');
  });
  // docs/defects/fixed/replace-document-sync-throws-when-the-parent-cannot-be-created.md: the synchronous form called
  // `mkdirSync` outside its `try`, so a parent that could not be created threw out of a function whose contract is a
  // `Result`. Both forms answer the same refusal; the file standing in the parent's place is left as it was.
  it.each([
    ['replaceDocument', (t: string) => replaceDocument(t, 'x', { createParent: true })],
    ['replaceDocumentSync', (t: string) => replaceDocumentSync(t, 'x', { createParent: true })],
  ] as const)('%s answers err, never throws, when a regular file stands where the parent directory would go (ADR-0004)', async (_name, write) => {
    writeFileSync(join(dir, 'parent'), 'a file\n');
    for (const target of [join(dir, 'parent', 'doc.txt'), join(dir, 'parent', 'deeper', 'doc.txt')]) {
      const r = await write(target);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('document.parent');
        expect(r.error.detail).toMatch(/EEXIST|ENOTDIR/);
      }
    }
    expect(readFileSync(join(dir, 'parent'), 'utf8')).toBe('a file\n');
    expect(readdirSync(dir)).toEqual(['parent']);
  });
  // A refused permission is the other way a parent cannot be created; root is never refused, so the case is skipped there.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('replaceDocumentSync answers err when the parent may not be created (EACCES)', () => {
    mkdirSync(join(dir, 'locked'), { mode: 0o500 });
    try {
      const r = replaceDocumentSync(join(dir, 'locked', 'sub', 'doc.txt'), 'x', { createParent: true });
      expect(r.ok === false && r.error.code).toBe('document.parent');
    } finally {
      chmodSync(join(dir, 'locked'), 0o700);
    }
  });
  it('exclusive create mints once, and a second create reads what is there — not an error (D-29)', () => {
    const f = join(dir, 'id');
    const a = exclusiveCreate(f, 'first\n');
    const b = exclusiveCreate(f, 'second\n');
    expect(a.ok && a.value.minted).toBe(true);
    expect(b.ok && !b.value.minted && b.value.existing).toBe('first\n');
    expect(readFileSync(f, 'utf8')).toBe('first\n');
  });
  it('guarded read distinguishes absent, readable and unreadable', () => {
    const f = join(dir, 'g.json');
    expect(guardedRead(f, JSON.parse).state).toBe('absent');
    writeFileSync(f, '{"a":1}');
    const r = guardedRead<{ a: number }>(f, JSON.parse);
    expect(r.state === 'readable' && r.value.a).toBe(1);
    writeFileSync(f, '{not json');
    expect(guardedRead(f, JSON.parse).state).toBe('unreadable');
  });
});

describe('platform — liveness (REQ-SESSION-051 to REQ-SESSION-054)', () => {
  it('a pid ≤ 0 is dead; this process is alive; an absurd pid is dead', () => {
    expect(probePid(0)).toBe('dead');
    expect(probePid(-5)).toBe('dead');
    expect(probePid(process.pid)).toBe('alive');
    expect(probePid(2_147_483_000)).toBe('dead');
  });
  it('a lock naming another machine is live by construction (REQ-SESSION-056); a malformed one is live; a dead local pid is not', () => {
    const acquired_at = '2026-09-02T00:00:00.000Z';
    expect(isLockLive({ pid: 1, host: OTHER, acquired_at }, M, () => 'dead')).toBe(true);
    expect(isLockLive({ pid: 0, host: M, acquired_at }, M, () => 'dead')).toBe(true);
    expect(isLockLive({ pid: 1, host: '', acquired_at }, M, () => 'dead')).toBe(true);
    expect(isLockLive({ pid: 1, host: M, acquired_at }, M, () => 'dead')).toBe(false);
    expect(isLockLive({ pid: 1, host: M, acquired_at }, M, () => 'alive')).toBe(true);
    expect(isLockLive(null, M)).toBe(false);
    expect(isLockForeign({ pid: 1, host: OTHER, acquired_at }, M)).toBe(true);
  });
});

describe('platform — canonical path (W-27, OQ-49)', () => {
  it('two spellings of one existing directory are the same path', () => {
    const sub = join(dir, 'Store');
    mkdirSync(sub);
    expect(samePath(sub, join(dir, '.', 'Store', ''))).toBe(true);
    if (process.platform === 'win32') {
      expect(samePath(sub, sub.toLowerCase())).toBe(true);
      expect(canonicalPath(sub.toLowerCase())[0]).toBe(sub[0]!.toUpperCase());
    }
  });
  it('a Windows spelling asked off Windows still folds separators and case (R3 separator residue)', () => {
    // The defect this pins: `canonicalPath` answered a Windows spelling through the host's own realpath.
    // Resolution is the host's to know — no parameter can make `C:\ws\alpha` exist on a POSIX disk — so
    // the cross-platform rule is the fold, not the filesystem: separators normalised, case folded.
    expect(canonicalPath('C:\\ws\\alpha', 'win32')).toBe(win32.resolve('C:\\ws\\alpha'));
    expect(samePath('C:\\ws\\alpha', 'c:/ws/ALPHA/', 'win32')).toBe(true);
  });
});

describe('platform — machine identifier (REQ-SESSION-046)', () => {
  it('is minted once, read back identically, and is never the hostname', () => {
    const f = join(dir, 'machine-id');
    const a = readOrMintMachineId(f);
    const b = readOrMintMachineId(f);
    expect(a).toBe(b);
    expect(a).toMatch(/^m1-[0-9a-f]{32}$/);
    expect(a).not.toContain(process.env['COMPUTERNAME'] ?? '\u0000');
  });
  it('present but unreadable refuses rather than minting over it', () => {
    const f = join(dir, 'machine-id');
    writeFileSync(f, 'garbage\n');
    expect(() => readOrMintMachineId(f)).toThrow(/unreadable/);
  });
});

describe('platform — the instance claim (ADR-0055 alt I, REQ-STARTUP-161/162/164)', () => {
  const clocks = nodeClocks();
  it('the first launch becomes the instance; a second is handed over and acknowledged; a third after close claims afresh', async () => {
    const recordFile = join(dir, 'instance.json');
    const seen: unknown[] = [];
    const deps = (pid: number) => ({
      recordFile, endpointDir: dir, machineId: M as MachineId, pid, wall: clocks.wall, timers: clocks.timers,
      handOverIntervalMs: millis(5_000), onHandOver: (h: unknown) => seen.push(h),
    });
    const first = await claimInstance(deps(process.pid));
    expect(first.outcome).toBe('instance');
    if (first.outcome !== 'instance') return;
    expect(existsSync(recordFile)).toBe(true);
    expect(JSON.parse(readFileSync(recordFile, 'utf8')).host).toBe(M);

    const second = await claimInstance(deps(process.pid), { workspace: 'C:\\ws' });
    expect(second.outcome).toBe('handed-over');
    expect(seen).toEqual([{ workspace: 'C:\\ws' }]);

    await first.close();
    expect(existsSync(recordFile)).toBe(false);
    const third = await claimInstance(deps(process.pid));
    expect(third.outcome).toBe('instance');
    if (third.outcome === 'instance') await third.close();
  });
  it('a record naming a dead process is reclaimed exactly once and the launch becomes the instance (REQ-STARTUP-164 (3))', async () => {
    const recordFile = join(dir, 'instance.json');
    writeFileSync(recordFile, JSON.stringify({ pid: 2_147_483_000, host: M, acquired_at: '2026-09-02T00:00:00.000Z', endpoint: '\\\\.\\pipe\\rotaris-nobody' }));
    const r = await claimInstance({
      recordFile, endpointDir: dir, machineId: M as MachineId, pid: process.pid, wall: clocks.wall, timers: clocks.timers,
      handOverIntervalMs: millis(500), onHandOver: () => {},
    });
    expect(r.outcome).toBe('instance');
    if (r.outcome === 'instance') await r.close();
  });
  it('a record naming a live process that does not answer is reclaimed after the bound, not waited on for ever', async () => {
    const recordFile = join(dir, 'instance.json');
    // This process is alive and listens on nothing at that endpoint.
    writeFileSync(recordFile, JSON.stringify({ pid: process.pid, host: M, acquired_at: '2026-09-02T00:00:00.000Z', endpoint: process.platform === 'win32' ? '\\\\.\\pipe\\rotaris-silent-' + process.pid : join(dir, 'silent.sock') }));
    const t0 = Date.now();
    const r = await claimInstance({
      recordFile, endpointDir: dir, machineId: M as MachineId, pid: process.pid, wall: clocks.wall, timers: clocks.timers,
      handOverIntervalMs: millis(300), onHandOver: () => {},
    });
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(r.outcome).toBe('instance');
    if (r.outcome === 'instance') await r.close();
  });
  it('the hand-over socket lives outside a deep data directory: endpointFor honours the socket directory', () => {
    // A unix socket path is capped at 108 bytes; a data root nested under a proof profile already overflows it.
    // The pure function's contract is that the socket is addressed under the shallow directory while every
    // other file stays under the data root. Whether a host actually LISTENS on a unix path is the host's
    // own business (on Windows a `.sock` name is not listenable at all) and is not asserted here.
    const deep = join(dir, 'a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40));
    const shallow = join(dir, 'sock');
    const endpoint = endpointFor(deep, process.pid, 'linux', shallow);
    expect(endpoint.startsWith(`${shallow}/`)).toBe(true);
    expect(endpoint.length).toBeLessThan(108);
    // The default is unchanged: without a socket directory the endpoint lives under the data root.
    expect(endpointFor(deep, process.pid, 'linux').startsWith(`${deep}/`)).toBe(true);
    // A win32 endpoint names a pipe, never the socket directory.
    expect(endpointFor(deep, process.pid, 'win32', shallow).startsWith('\\\\.\\pipe\\')).toBe(true);
  });

  it('the socket separator is the platform asked about, not the host asking (R3 separator residue)', () => {
    // Found 2026-09-22 by sweeping every platform-parameterised function for a host-bound `node:path`
    // export: this one joined with the HOST's separator, so a POSIX endpoint asked on Windows came back
    // `…\instance-1-ab.sock` — a name no POSIX machine would ever bind. The case above could not see it,
    // because it compared against the host's own `sep` and so agreed with the defect on every machine.
    const endpoint = endpointFor('/var/lib/rotaris', 4242, 'linux', '/run/user/1000');
    expect(endpoint).toMatch(/^\/run\/user\/1000\/instance-4242-[0-9a-f]{8}\.sock$/);
    expect(endpoint).not.toContain('\\');
    expect(endpointFor('/var/lib/rotaris', 4242, 'darwin')).toMatch(/^\/var\/lib\/rotaris\/instance-4242-/);
  });
});

describe('platform — spawn helper', () => {
  it('environmentWithout drops the named variables and nothing else', () => {
    const env = environmentWithout(['GIT_DIR'], { GIT_DIR: '/x', PATH: '/bin', HOME: '/h' });
    expect(env['GIT_DIR']).toBeUndefined();
    expect(env['PATH']).toBe('/bin');
  });
});

describe('platform — FakeClock drives the document ladder without real waiting', () => {
  it('a ladder with delays is honoured through the Timers port', async () => {
    const clock = new FakeClock();
    const f = join(dir, 'x.txt');
    writeFileSync(f, 'old');
    // No contention here, so the first attempt succeeds and no timer is ever scheduled.
    const r = await replaceDocument(f, 'new', { ladder: { delays: [millis(50), millis(100)] }, timers: clock });
    expect(r.ok && r.value.attempts).toBe(1);
    expect(clock.pendingCount()).toBe(0);
  });
});

describe('platform — desktop preferences (ADR-0042)', () => {
  it('uses the private proof root first and the machine-local application pair on Windows', () => {
    expect(resolvePreferenceRoot({ platform: 'win32', env: { ROTARIS_PREFERENCES_ROOT: 'X:\\proof', LOCALAPPDATA: 'X:\\local' }, home: 'X:\\home' })).toBe('X:\\proof');
    expect(resolvePreferenceRoot({ platform: 'win32', env: { LOCALAPPDATA: 'X:\\local' }, home: 'X:\\home' })).toBe(win32.join('X:\\local', 'Rotaris', 'Rotaris'));
  });

  it('reads defaults without creating a file, preserves a stale theme, and flushes a theme write synchronously', () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    expect(store.read('appearance/theme')).toBeUndefined();
    expect(existsSync(store.file)).toBe(false);
    mkdirSync(root, { recursive: true });
    writeFileSync(store.file, '{"appearance/theme":"future-theme"}\n');
    expect(store.read('appearance/theme')).toBe('future-theme');
    expect(readFileSync(store.file, 'utf8')).toContain('future-theme');
    store.writeThemeSync('nocturne');
    expect(JSON.parse(readFileSync(store.file, 'utf8'))['appearance/theme']).toBe('nocturne');
  });

  it('reports a preference root it cannot create in the primitive\'s own words, on the synchronous theme save as on the ordinary write', async () => {
    const root = join(dir, 'preferences');
    writeFileSync(root, 'a file\n');
    const store = new PreferenceStore(root);
    // Before 2026-10-04 the theme save threw the raw `mkdirSync` error (EEXIST), not the refusal the write path reports.
    expect(() => store.writeThemeSync('nocturne')).toThrow(/^The destination folder could not be created: .*EEXIST/);
    await expect(store.write('ui/reduced_motion', true)).rejects.toThrow(/^The destination folder could not be created: .*EEXIST/);
    expect(readFileSync(root, 'utf8')).toBe('a file\n');
  });

  it('coerces the registered values and round-trips ordinary writes atomically', async () => {
    const store = new PreferenceStore(join(dir, 'preferences'));
    await store.write('interface/settingsTab', 'interface');
    await store.write('ui/reduced_motion', true);
    expect(store.read('interface/settingsTab')).toBe('interface');
    expect(store.read('ui/reduced_motion')).toBe(true);
    // REQ-SHELL-069: a pane layout round-trips; a wrong version, pane count or shape reads as nothing stored
    await store.write('panels/overview', { version: 1, panes: 2, sizes: [700, 340] });
    expect(store.read('panels/overview')).toEqual({ version: 1, panes: 2, sizes: [700, 340] });
    expect(coercePaneLayout({ version: 2, panes: 2, sizes: [1, 2] }, 2)).toBeUndefined();
    expect(coercePaneLayout({ version: 1, panes: 3, sizes: [1, 2, 3] }, 2)).toBeUndefined();
    expect(coercePaneLayout({ version: 1, panes: 2, sizes: [1, 'x'] }, 2)).toBeUndefined();
    expect(coercePaneLayout(null, 2)).toBeUndefined();
  });

  /**
   * Part AB — REQ-SHELL-159 / REQ-CHAT-015 / REQ-NOTIFY-066: the per-workspace composer draft, the first
   * PARAMETRISED row of REQ-SHELL-006's closed table.
   */
  it('keys the composer draft by workspace, round-trips it character for character, and keeps one workspace out of another', async () => {
    const store = new PreferenceStore(join(dir, 'preferences'));
    const a = composerDraftKey('C:\\ws\\alpha', 'win32');
    const b = composerDraftKey('C:\\ws\\beta', 'win32');
    expect(a).toMatch(/^workspaces\/[0-9a-f]{16}\/composerDraft$/);
    expect(a).not.toBe(b);
    // The canonical spelling decides, so the same workspace typed differently is the same draft (REQ-CHAT-015).
    expect(composerDraftKey('c:/ws/ALPHA/', 'win32')).toBe(a);
    // An absent key reads as REQ-SHELL-159's declared default, the empty string, without creating a file.
    expect(store.read(a)).toBe('');
    const typed = '  line one\nline two\ttabbed\n\némoji 🌱 and a trailing space \n';
    await store.write(a, typed);
    expect(new PreferenceStore(join(dir, 'preferences')).read(a)).toBe(typed);
    expect(new PreferenceStore(join(dir, 'preferences')).read(b)).toBe('');
    // The key set stays closed: a key that is neither in the table nor a member of the family does not exist.
    expect(() => store.read('workspaces/not-a-digest/composerDraft' as never)).toThrow(/REQ-SHELL-006/);
    expect(() => store.read('composer/draft' as never)).toThrow(/REQ-SHELL-006/);
  });

  it('registers the Workspace divider as an ordinary pane layout (REQ-CHAT-010 / REQ-SHELL-069)', async () => {
    const store = new PreferenceStore(join(dir, 'preferences'));
    await store.write('panels/workspace', { version: 1, panes: 2, sizes: [520, 210] });
    expect(store.read('panels/workspace')).toEqual({ version: 1, panes: 2, sizes: [520, 210] });
  });
});

describe('findExecutable on Windows (REQ-MCP-037; the merge of Parts R and S, 2026-09-05)', () => {
  it('an extensionless file beside its .cmd twin is never the answer on win32 — PATHEXT decides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-pathext-'));
    try {
      // Node's own directory holds `npx` (a POSIX shell script) beside `npx.cmd`; only the latter starts on Windows.
      writeFileSync(join(dir, 'npx'), '#!/bin/sh');
      writeFileSync(join(dir, 'npx.cmd'), '@echo off');
      // PATHEXT names the extension in UPPER case and Windows matches it without regard to case, so on Windows
      // this second write lands on the SAME file. On a case-sensitive filesystem it is a second name, and it is
      // what makes the Windows rule decidable here at all: without it the lookup below found nothing (Linux, 2026-09-16).
      writeFileSync(join(dir, 'npx.CMD'), '@echo off');
      const env = { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
      // PATHEXT's own spelling of the extension comes back (`.CMD`); the wrap compares without regard to case.
      expect(findExecutable('npx', env, 'win32')?.toLowerCase()).toBe(join(dir, 'npx.cmd').toLowerCase());
      expect(findExecutable('npx.cmd', env, 'win32')).toBe(join(dir, 'npx.cmd'));
      // The POSIX leg needs a POSIX-spelled PATH: this one holds the host's temporary directory, and on Windows
      // that carries a drive letter, which the POSIX rule splits on as an entry separator. The rule under test is
      // the platform parameter's, so the leg runs where the host can spell an input it accepts.
      if (!dir.includes(':')) expect(findExecutable('npx', env, 'linux')).toBe(join(dir, 'npx'));
      expect(findExecutable('nothing-here', env, 'win32')).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
