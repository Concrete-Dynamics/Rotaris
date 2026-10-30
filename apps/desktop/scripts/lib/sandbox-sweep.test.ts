/**
 * The live run's startup sweep, told a leftover from a concurrent live run
 * (`docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md`).
 *
 * The sweep used to delete every directory under `$TMPDIR/rotaris-live-run/` not marked `KEPT`, so a run that started
 * second deleted a running sibling's workspace, store and key. The first case below is that sibling; it fails on the
 * old rule. The rest keep what the sweep is for — no stranded credential — for every kind of leftover.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEPT_FILE, LIVE_RUN_CEILING_MS, OWNER_FILE, readOwner, stampTime, sweepSandboxes, sweepVerdict, writeOwner } from './sandbox-sweep.mjs';

const LIVE_RUN = resolve(import.meta.dirname, '..', 'live-run.mjs');
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const HOUR = 3_600_000;
const LIVE = 4_001;
const DEAD = 4_002;
const probe = (pid: number): boolean => pid === LIVE;

const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const c of children.splice(0)) c.kill();
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** A sweep root, and a sandbox in it shaped as `live-run.mjs` leaves one: a workspace, and a key in the store. */
function root(): string {
  const r = mkdtempSync(join(tmpdir(), 'rotaris-sweep-'));
  roots.push(r);
  return r;
}
function sandbox(r: string, name: string, owner?: { pid: number; startedAt: number }): string {
  const dir = join(r, name);
  mkdirSync(join(dir, 'workspace'), { recursive: true });
  mkdirSync(join(dir, 'local', 'tokens'), { recursive: true });
  writeFileSync(join(dir, 'local', 'tokens', 'katalyst.json'), '{"key":"k"}');
  if (owner) writeOwner(dir, { pid: owner.pid, startedAt: new Date(owner.startedAt) });
  return dir;
}
const name = (at: number): string => new Date(at).toISOString().replace(/[:.]/g, '-');
const dropCredentials = (dir: string): void => rmSync(join(dir, 'local', 'tokens'), { recursive: true, force: true });
const hasKey = (dir: string): boolean => existsSync(join(dir, 'local', 'tokens', 'katalyst.json'));
const sweep = (r: string, extra: Partial<Parameters<typeof sweepSandboxes>[1]> = {}) =>
  sweepSandboxes(r, { dropCredentials, now: NOW, probe, ownPid: 1, warn: () => undefined, ...extra });

describe('the live run\'s startup sweep leaves a concurrent run\'s sandbox alone (docs/proofs/live-run.md)', () => {
  it('leaves a sandbox whose OWNER is a live process — its workspace, its store and its key', () => {
    const r = root();
    const sibling = sandbox(r, name(NOW - 60_000), { pid: LIVE, startedAt: NOW - 60_000 });
    const out = sweep(r);
    expect(out).toEqual([{ dir: sibling, action: 'leave', reason: `a live run (pid ${LIVE}) is using it` }]);
    expect(existsSync(join(sibling, 'workspace'))).toBe(true);
    expect(hasKey(sibling)).toBe(true);
  });

  it('reads a real running process as live through the default probe', () => {
    const r = root();
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    children.push(child);
    const sibling = sandbox(r, name(Date.now()), { pid: child.pid!, startedAt: Date.now() });
    sweepSandboxes(r, { dropCredentials, warn: () => undefined });
    expect(hasKey(sibling)).toBe(true);
  });

  it('removes a sandbox whose OWNER is gone, and one past the ceiling whatever the probe says (a reused pid)', () => {
    const r = root();
    const dead = sandbox(r, name(NOW - 60_000), { pid: DEAD, startedAt: NOW - 60_000 });
    const stale = sandbox(r, name(NOW - LIVE_RUN_CEILING_MS - HOUR), { pid: LIVE, startedAt: NOW - LIVE_RUN_CEILING_MS - HOUR });
    const out = sweep(r);
    expect(out.map((o) => o.action)).toEqual(['remove', 'remove']);
    expect(existsSync(dead)).toBe(false);
    expect(existsSync(stale)).toBe(false);
  });

  it('honours KEPT only for a leftover: its credentials go, the rest stays', () => {
    const r = root();
    const kept = sandbox(r, name(NOW - HOUR), { pid: DEAD, startedAt: NOW - HOUR });
    writeFileSync(join(kept, KEPT_FILE), 'kept by --keep\n');
    expect(sweep(r)[0]!.action).toBe('drop-credentials');
    expect(existsSync(join(kept, 'workspace'))).toBe(true);
    expect(hasKey(kept)).toBe(false);
  });

  it('leaves an ownerless sandbox made within the ceiling (a run on an older copy of the script) and removes an older one', () => {
    const r = root();
    const recent = sandbox(r, name(NOW - 2 * HOUR));
    const old = sandbox(r, name(NOW - LIVE_RUN_CEILING_MS - HOUR));
    const unnamed = sandbox(r, 'not-a-stamp');
    const past = (NOW - LIVE_RUN_CEILING_MS - HOUR) / 1000;
    utimesSync(unnamed, past, past);
    const out = sweep(r);
    expect(Object.fromEntries(out.map((o) => [o.dir, o.action]))).toEqual({ [recent]: 'leave', [old]: 'remove', [unnamed]: 'remove' });
    expect(hasKey(recent)).toBe(true);
  });

  it('reports a sandbox it cannot remove and goes on to the next', () => {
    const r = root();
    const first = sandbox(r, name(NOW - HOUR), { pid: DEAD, startedAt: NOW - HOUR });
    const second = sandbox(r, name(NOW - HOUR + 1), { pid: DEAD, startedAt: NOW - HOUR });
    const warnings: string[] = [];
    const removed: string[] = [];
    sweep(r, { warn: (m) => warnings.push(m), remove: (d) => { if (d === first) throw new Error('EPERM'); removed.push(d); } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('EPERM');
    expect(removed).toEqual([second]);
    expect(hasKey(first)).toBe(false);
  });

  it('takes an OWNER naming this very process for a leftover, and an unreadable OWNER for none', () => {
    const r = root();
    const mine = sandbox(r, name(NOW - HOUR), { pid: 77, startedAt: NOW - HOUR });
    expect(sweepVerdict(mine, name(NOW - HOUR), { now: NOW, probe: () => true, ownPid: 77 }).action).toBe('remove');
    writeFileSync(join(mine, OWNER_FILE), 'not json');
    expect(readOwner(mine)).toBeNull();
    expect(sweepVerdict(mine, name(NOW - HOUR), { now: NOW, probe: () => true, ownPid: 77 }).action).toBe('leave');
  });

  it('reads back the instant live-run.mjs names its sandbox by, and what writeOwner wrote', () => {
    const at = Date.parse('2026-09-29T12:20:57.909Z');
    expect(stampTime(name(at))).toBe(at);
    expect(stampTime('KEPT')).toBeNull();
    const r = root();
    const dir = sandbox(r, 'x', { pid: 123, startedAt: at });
    expect(readOwner(dir)).toEqual({ pid: 123, startedAt: at });
  });
});

describe('live-run.mjs sweeps through this rule and marks its own sandbox before filling it', () => {
  const text = readFileSync(LIVE_RUN, 'utf8');

  it('has no sweep loop of its own over the sandbox root', () => {
    expect(text).not.toMatch(/readdirSync\(SANDBOX_ROOT\)/);
    expect(text).toMatch(/sweepSandboxes\(SANDBOX_ROOT, \{ dropCredentials \}\)/);
  });

  it('writes OWNER right after making the sandbox, before the workspace goes in', () => {
    const made = text.indexOf('mkdirSync(sandbox, { recursive: true });');
    const owned = text.indexOf('writeOwner(sandbox);');
    const filled = text.indexOf('mkdirSync(workspace, { recursive: true });');
    expect(made).toBeGreaterThan(-1);
    expect(owned).toBeGreaterThan(made);
    expect(filled).toBeGreaterThan(owned);
  });
});
