import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { millis, mintMachineId, FakeClock, type MachineId } from '@rotaris/kernel';
import { replaceDocument, exclusiveCreate, guardedRead, probePid, isLockLive, isLockForeign, canonicalPath, samePath, readOrMintMachineId, resolveUserDirs, claimInstance, nodeClocks, findExecutable, environmentWithout, PreferenceStore, resolvePreferenceRoot, coercePaneLayout, composerDraftKey } from './index.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-platform-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const M = mintMachineId('00000000000000000000000000000001');
const OTHER = mintMachineId('00000000000000000000000000000002');

describe('platform — per-user directories (REQ-STARTUP-145)', () => {
  it('on Windows both directories are under the LOCAL profile, never the roaming one', () => {
    const d = resolveUserDirs({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\U\\me\\AppData\\Local', APPDATA: 'C:\\U\\me\\AppData\\Roaming' }, home: 'C:\\U\\me' });
    expect(d.config.startsWith('C:\\U\\me\\AppData\\Local\\rotaris')).toBe(true);
    expect(d.data.startsWith('C:\\U\\me\\AppData\\Local\\rotaris')).toBe(true);
    expect(d.data).not.toContain('Roaming');
  });
  it('on Linux the XDG variables govern', () => {
    const d = resolveUserDirs({ platform: 'linux', env: { XDG_CONFIG_HOME: '/x/cfg', XDG_DATA_HOME: '/x/data' }, home: '/home/me' });
    expect(d.config).toBe(join('/x/cfg', 'rotaris'));
    expect(d.data).toBe(join('/x/data', 'rotaris'));
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
    expect(resolvePreferenceRoot({ platform: 'win32', env: { LOCALAPPDATA: 'X:\\local' }, home: 'X:\\home' })).toBe(join('X:\\local', 'Rotaris', 'Rotaris'));
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
      const env = { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
      // PATHEXT's own spelling of the extension comes back (`.CMD`); the wrap compares without regard to case.
      expect(findExecutable('npx', env, 'win32')?.toLowerCase()).toBe(join(dir, 'npx.cmd').toLowerCase());
      expect(findExecutable('npx.cmd', env, 'win32')).toBe(join(dir, 'npx.cmd'));
      expect(findExecutable('npx', env, 'linux')).toBe(join(dir, 'npx'));
      expect(findExecutable('nothing-here', env, 'win32')).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
