import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, err, failure, millis, ok } from '@rotaris/kernel';
import * as platform from '@rotaris/platform';
import { LOCK_BUSY, lockNotReclaimed, withLock, type LockDeps } from './lock.js';
import { ProjectSettingsStore } from '../project-settings.js';

/**
 * REQ-PROVIDER-152 / REQ-PROVIDER-018: the busy refusal is for a lock that exists and is held past the 5 s bound.
 * A lock file that cannot be created at all is reported as what it is, at once, and never as a store being updated
 * (docs/defects/fixed/the-credential-lock-reports-a-busy-store-when-the-lock-file-cannot-be-created.md).
 */
vi.mock('@rotaris/platform', async (importOriginal) => {
  const real = await importOriginal<typeof platform>();
  return { ...real, exclusiveCreate: vi.fn(real.exclusiveCreate) };
});

/** Lock paths whose removal is refused, as a stale lock in a folder the account may not write into would be (`EACCES`). */
const refuseRemoval = new Set<string>();
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof fs>();
  const rmSync: typeof real.rmSync = (path, options) => {
    if (refuseRemoval.has(String(path))) throw Object.assign(new Error(`EACCES: permission denied, unlink '${String(path)}'`), { code: 'EACCES' });
    real.rmSync(path, options);
  };
  return { ...real, rmSync, default: { ...real, rmSync } };
});

let dir: string;
let clock: FakeClock;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-lock-')); clock = new FakeClock(); });
afterEach(() => { refuseRemoval.clear(); rmSync(dir, { recursive: true, force: true }); vi.mocked(platform.exclusiveCreate).mockClear(); });

const lockDeps = (over: Partial<LockDeps> = {}): LockDeps => ({ pid: process.pid, startedAt: '2026-10-06T00:00:00.000Z', timers: clock, monotonic: clock, ...over });

describe('a lock file that cannot be created is not a busy store (REQ-PROVIDER-152, REQ-PROVIDER-018)', () => {
  it('a regular file where the lock\'s folder would go: refused at once, naming the lock and the cause, never busy', async () => {
    writeFileSync(join(dir, 'f'), 'not a folder');
    const lock = join(dir, 'f', 'tokens', 'deepseek.lock');
    let ran = false;
    const r = await withLock(lock, lockDeps(), async () => { ran = true; return ok('ran'); });
    expect(ran).toBe(false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.create');
      expect(r.error.headline).not.toBe(LOCK_BUSY);
      expect(r.error.headline).not.toMatch(/being updated|in a moment/i);
      expect(r.error.headline).toContain(lock);
      expect(r.error.headline).toContain('Nothing was changed');
      expect(r.error.detail).toMatch(/EEXIST|ENOTDIR/);
    }
    expect(clock.now()).toBe(0);
  });

  it('a folder standing at the lock\'s own path: refused at once as an unusable lock, never busy', async () => {
    const lock = join(dir, 'x.lock');
    mkdirSync(lock);
    const r = await withLock(lock, lockDeps({ probe: () => 'alive' }), async () => ok('ran'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.create');
      expect(r.error.headline).not.toBe(LOCK_BUSY);
      expect(r.error.detail).toMatch(/EISDIR/);
    }
    expect(existsSync(lock)).toBe(true);
    expect(clock.now()).toBe(0);
  });

  it('a write that fails after the create (a full disk) is reported as the failure it is', async () => {
    vi.mocked(platform.exclusiveCreate).mockReturnValueOnce(err(failure('document.exclusive.write', 'Could not write the created document', 'Error: ENOSPC: no space left on device, write')));
    const r = await withLock(join(dir, 'z.lock'), lockDeps(), async () => ok('ran'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.create');
      expect(r.error.headline).not.toBe(LOCK_BUSY);
      expect(r.error.detail).toContain('ENOSPC');
    }
  });

  it('a lock released between the create and the read of its holder is taken on the next attempt, not refused', async () => {
    const enoent = Object.assign(new Error('ENOENT: no such file or directory, open'), { code: 'ENOENT' });
    vi.mocked(platform.exclusiveCreate).mockReturnValueOnce(err(failure('document.exclusive.read', 'The existing document could not be read', String(enoent), enoent)));
    const lock = join(dir, 'w.lock');
    const p = withLock(lock, lockDeps({ pollMs: millis(50) }), async () => ok('ran'));
    for (let i = 0; i < 2; i++) { await Promise.resolve(); clock.advance(50); await Promise.resolve(); }
    const r = await p;
    expect(r).toEqual({ ok: true, value: 'ran' });
    expect(vi.mocked(platform.exclusiveCreate)).toHaveBeenCalledTimes(2);
    expect(existsSync(lock)).toBe(false);
  });

  it('a held lock still answers busy, and only after the bound', async () => {
    const lock = join(dir, 'h.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid + 1, started_at: 'now' }));
    const p = withLock(lock, lockDeps({ probe: () => 'alive', boundMs: millis(200), pollMs: millis(50) }), async () => ok('ran'));
    for (let i = 0; i < 6; i++) { await Promise.resolve(); clock.advance(50); await Promise.resolve(); }
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock');
      expect(r.error.headline).toBe(LOCK_BUSY);
    }
    expect(clock.now()).toBeGreaterThanOrEqual(200);
  });

  it('the provider snapshot under a regular file: the upsert reports the lock it could not create, not a busy store', async () => {
    writeFileSync(join(dir, 'config'), 'not a folder');
    const path = join(dir, 'config', 'project_settings.yaml');
    const s = new ProjectSettingsStore({ path, lock: lockDeps(), timers: clock, warn: () => {} });
    const r = await s.upsertProvider({ id: 'p', display_name: 'P', authenticated: true, discovered_at: '2026-10-06T00:00:00.000Z', models: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.create');
      expect(r.error.headline).not.toBe(LOCK_BUSY);
      expect(r.error.headline).toContain(`${path}.lock`);
    }
  });
});

describe('a lock file that cannot be removed is reported, never thrown (REQ-PROVIDER-152, REQ-PROVIDER-018, ADR-0044)', () => {
  // docs/defects/fixed/the-credential-lock-throws-when-a-lock-file-cannot-be-removed.md
  it('a dead holder\'s lock the reclaim cannot remove: refused at once as a value naming the lock and the cause', async () => {
    const lock = join(dir, 'd.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid + 1, started_at: 'then' }));
    refuseRemoval.add(lock);
    let ran = false;
    const r = await withLock(lock, lockDeps({ probe: () => 'dead' }), async () => { ran = true; return ok('ran'); });
    expect(ran).toBe(false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.reclaim');
      expect(r.error.headline).toContain('Nothing was changed');
      expect(r.error.headline).toContain(lock);
      expect(r.error.headline).toContain('left by a process that is no longer running');
      expect(r.error.headline).not.toBe(LOCK_BUSY);
      expect(r.error.detail).toContain('EACCES');
    }
    expect(existsSync(lock)).toBe(true);
    expect(clock.now()).toBe(0);
  });

  it('this instance\'s own lock the reclaim cannot remove is named as its own, never as a process that is no longer running', async () => {
    // A release the removal refused leaves the lock with this process's pid; a reclaim that is refused too must not
    // tell the user the holder is gone, and says every credential update is refused until the lock is removed.
    const lock = join(dir, 'o.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, started_at: 'now' }));
    refuseRemoval.add(lock);
    const probe = vi.fn(() => 'alive' as const);
    const r = await withLock(lock, lockDeps({ probe }), async () => ok('ran'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.reclaim');
      expect(r.error.headline).toBe(lockNotReclaimed(lock, r.error.detail ?? '', 'own'));
      expect(r.error.headline).not.toContain('no longer running');
      expect(r.error.headline).toContain('Every credential update is refused until it is removed.');
    }
    expect(clock.now()).toBe(0);
  });

  it('a lock whose record names no holder, refused removal: named as such, never as a process that is no longer running', async () => {
    const lock = join(dir, 'u.lock');
    writeFileSync(lock, 'not a record');
    refuseRemoval.add(lock);
    const r = await withLock(lock, lockDeps(), async () => ok('ran'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('credential.lock.reclaim');
      expect(r.error.headline).toContain('whose record names no holder');
      expect(r.error.headline).not.toContain('no longer running');
    }
  });

  it('a release the removal refuses keeps the operation\'s own result, and the next operation reclaims the lock as its own', async () => {
    const lock = join(dir, 'r.lock');
    const r = await withLock(lock, lockDeps(), async () => { refuseRemoval.add(lock); return ok('saved'); });
    expect(r).toEqual({ ok: true, value: 'saved' });
    expect(existsSync(lock)).toBe(true);
    refuseRemoval.clear();
    const again = await withLock(lock, lockDeps(), async () => ok('again'));
    expect(again).toEqual({ ok: true, value: 'again' });
    expect(existsSync(lock)).toBe(false);
  });

  it('the provider snapshot over a dead holder\'s lock the reclaim cannot remove: the upsert answers the failure, never rejects', async () => {
    const path = join(dir, 'project_settings.yaml');
    writeFileSync(`${path}.lock`, JSON.stringify({ pid: process.pid + 1, started_at: 'then' }));
    refuseRemoval.add(`${path}.lock`);
    const s = new ProjectSettingsStore({ path, lock: lockDeps({ probe: () => 'dead' }), timers: clock, warn: () => {} });
    const r = await s.upsertProvider({ id: 'p', display_name: 'P', authenticated: true, discovered_at: '2026-10-06T00:00:00.000Z', models: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('credential.lock.reclaim');
    expect(existsSync(path)).toBe(false);
  });
});
