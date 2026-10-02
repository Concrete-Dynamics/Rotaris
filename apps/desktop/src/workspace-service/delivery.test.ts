import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintWorkspaceId, ok, err } from '@rotaris/kernel';
import type { Actor, BoardProjection, TraceabilityEngine, TransitionOutcome, Refusal } from '@rotaris/contracts';
import { forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { fixtureParse, fixtureReport } from '@rotaris/workspace';
import { ENGINE_NOT_MERGED, createDeliveryService, deliveryServiceFor, type DeliveryService, type RunGitPort } from './delivery.js'; // Part AP: `RunGitPort`

/**
 * The delivery service (Part AK): the composition check, the coalesced engine read, one value per generation,
 * `changed` only after a committed write, and the stated refusals for what other parts build.
 */
const A = mintWorkspaceId('000000000000000000000000000000ae');
const USER: Actor = { kind: 'user', person: 'owner' };
const SYSTEM: Actor = { kind: 'system' };
let root: string;
/**
 * The workspace root is a REAL directory of this test's own, not a spelling. It was the literal `C:\ws`, and
 * the service writes a scheduling change into `<workspace>/.rotaris/agents.yaml` — so the suite left `C:\ws`
 * behind on whatever machine ran it: at the drive root on Windows, and as a directory literally named `C:\ws`
 * inside the checkout on Linux and macOS, where a backslash is an ordinary filename character (found 2026-09-16).
 */
let ws: string;
let r: ResolvedStore;
let clock: FakeClock;
let parses = 0;
const engine: TraceabilityEngine = {
  ...ENGINE_NOT_MERGED,
  parseStore: async () => { parses += 1; return ok(fixtureParse()); },
  sweep: async () => ok({ sites: [], modules: [], tests: [], durationMs: 1 }),
  verify: async () => ok(fixtureReport()),
};
// Part AP: a release now provisions a worktree inside the writer's `beforeCommit` (REQ-TRACE-464); this suite's workspace is no repository, so Git is faked here.
const FAKE_GIT: RunGitPort = { checkRepository: async () => ({ ok: true, head: 'abc123' }), takeOver: async () => err('no tree to take over in this suite'), provision: async (a) => ok({ ref: `${a.id}/${a.unit}`, path: join(ws, '.rotaris', 'requirements', 'worktrees', a.unit), branch: `rotaris/req/${a.id.toLowerCase()}/${a.unit}`, baseBranch: 'main', baseRevision: 'abc123' }) };
const service = (e: TraceabilityEngine = engine): DeliveryService => createDeliveryService({ db: r.db, workspaceRoot: ws, engine: e, clocks: clock, log: () => undefined, configDir: root, git: FAKE_GIT });

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-svc-')); ws = mkdtempSync(join(tmpdir(), 'rotaris-svc-ws-')); r = openWorkspaceStore(root, A, ws); clock = new FakeClock(); parses = 0; });
afterEach(() => { r.db.close(); forgetSpelling(r.dir); rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

describe('createDeliveryService', () => {
  it('REQ-TRACE-348/349: two board reads of one generation return the same value; a cold board reads the source once', async () => {
    const s = service();
    const [a, b] = await Promise.all([s.handle({ name: 'requirements.board', workspace: 'x' }, USER), s.handle({ name: 'requirements.board', workspace: 'x' }, USER)]);
    expect(a.value).toBe(b.value);
    expect(parses).toBe(1);
    const board = a.value as BoardProjection;
    expect(board.generation).toBe(1);
    expect(board.workspace).toBe(ws);
    expect(board.cards).toHaveLength(7);
    expect(a.changed).toBeUndefined();
  });
  it('REQ-TRACE-388/405: an accepted action moves the generation and names the affected requirement; a refusal changes nothing', async () => {
    const s = service();
    const acted = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release' }, USER);
    expect((acted.value as { ok: boolean; value: TransitionOutcome }).value).toMatchObject({ from: 'backlog', to: 'ready', historyEntry: 1 });
    expect(acted.changed).toEqual({ generation: 2, affected: ['REQ-101'] });
    const board = (await s.handle({ name: 'requirements.board', workspace: 'x' }, USER)).value as BoardProjection;
    expect(board.generation).toBe(2);
    expect(board.cards.find((c) => c.id === 'REQ-101')!.column).toBe('ready');
    const refused = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'accept' }, USER);
    expect((refused.value as { ok: boolean; error: Refusal }).ok).toBe(false);
    expect(refused.changed).toBeUndefined();
    expect(s.generation).toBe(2);
    const unknown = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-999', action: 'release' }, USER);
    expect((unknown.value as { error: Refusal }).error.reason).toBe('REQ-999 is not in this requirement store; nothing was written.');
    const kept = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'keep-worktree' }, USER);
    expect(kept.changed).toBeUndefined();
  });
  it('detail, reachable, refresh and the queue answer from the store; operations and source writes are stated refusals', async () => {
    const s = service();
    await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release' }, USER);
    const d = (await s.handle({ name: 'requirements.detail', workspace: 'x', id: 'REQ-101' }, USER)).value as { card: { column: string }; history: { action: string }[]; prose: string };
    expect(d.card.column).toBe('ready');
    expect(d.history.map((h) => h.action)).toEqual(['release']);
    expect(d.prose).toBe('The prose of REQ-101.');
    const reach = (await s.handle({ name: 'requirements.reachable', workspace: 'x', id: 'REQ-101', from: 'ready', to: 'backlog' }, USER)).value as { reachable: boolean; consequence?: string };
    expect(reach.reachable).toBe(true);
    expect(reach.consequence).toMatch(/^Returning/);
    const refreshed = await s.handle({ name: 'requirements.refresh', workspace: 'x' }, USER);
    expect(refreshed.changed).toEqual({ generation: 3, affected: null });
    expect(parses).toBe(2);
    const q = await s.handle({ name: 'requirements.queue.set', workspace: 'x', automatic: true, concurrency: 3 }, USER);
    expect(q.value).toMatchObject({ automatic: true, concurrency: 3, stopped: false });
    const stopped = await s.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    expect((stopped.value as { stopped: boolean }).stopped).toBe(true);
    for (const cmd of [
      { name: 'requirements.source.write' as const, workspace: 'x', document: '# x' },
      { name: 'requirements.source.previewLocation' as const, workspace: 'x' },
    ]) {
      const out = await s.handle(cmd, USER);
      expect((out.value as { ok: boolean }).ok).toBe(false);
      expect(out.changed).toBeUndefined();
    }
    // Part AJ2 — the two operation arms run the injected engine now (REQ-TRACE-508..512) and answer in the operation
    // reply's one shape: this fake's `check` fails as ENGINE_NOT_MERGED does, stated, with the generation unmoved; and a
    // fake without a cancel has nothing to stop. (This test file is outside Part AJ′'s row: handoff §8, a ruling request.)
    const op = await s.handle({ name: 'requirements.operation', workspace: 'x', operation: 'check' }, USER);
    expect(op.value).toMatchObject({ kind: 'traceability.result', operation: 'check', root: ws, result: { ok: false, error: { kind: 'failed', cause: 'Part AJ is not merged into this build' } } });
    expect(op.changed).toBeUndefined();
    const cancel = await s.handle({ name: 'requirements.cancel', workspace: 'x', operation: 'check' }, USER);
    expect(cancel.value).toEqual({ kind: 'traceability.cancelled', cancelled: false });
    expect(cancel.changed).toBeUndefined();
  });
  it('an engine that is not merged yields a board with no source and the cause stated, and still opens (REQ-TRACE-231)', async () => {
    const s = service(ENGINE_NOT_MERGED);
    const board = (await s.handle({ name: 'requirements.board', workspace: 'x' }, USER)).value as BoardProjection;
    expect(board.source).toEqual({ kind: 'none' });
    expect(board.cards).toEqual([]);
    expect(board.parseErrors[0]!.message).toBe('the traceability engine failed: Part AJ is not merged into this build');
  });
  it('REQ-TRACE-476: a run row left running by a previous instance is reaped on the first pass and reported interrupted, work retained', async () => {
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-101', 1, 'running', NULL, NULL, ?, 1, 't', ?)").run('h'.repeat(32), JSON.stringify({ schemaVersion: 1, state: 'running', snapshotHash: 'h'.repeat(32), updatedAt: 't', units: 1 }));
    r.db.prepare("INSERT INTO delivery_runs (req_id, unit, session_id, worktree_ref, permissions, status, stage, outcome, started_at, ended_at) VALUES ('REQ-101', 'u1', 'sess-old', NULL, '', 'running', 'implementing', NULL, 't', NULL)").run();
    const s = service();
    const board = (await s.handle({ name: 'requirements.board', workspace: 'x' }, USER)).value as BoardProjection;
    expect(s.reaped).toHaveLength(1);
    expect(s.reaped[0]!.statement).toMatch(/^interrupted, work retained/);
    const c = board.cards.find((x) => x.id === 'REQ-101')!;
    expect(c.column).toBe('blocked');
    expect(c.returnTo).toBe('ready');
    expect(c.run?.interrupted).toBe(true);
  });
  /**
   * Defect note `a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`: with the queue
   * stopped a release provisions u1 and rests in `ready`; held out of `ready` and resumed, the resume derived the same
   * unit and provisioned it again, the real `createWorktree` refused the existing path, the soft failure replaced the
   * launch with one that had no worktree, and no claim could ever take the card. REQ-TRACE-464: "The run SHALL take
   * over the worktree already provisioned for it and SHALL never provision a second one."
   */
  const provisioningGit = () => {
    const made = new Set<string>();
    const calls: string[] = [];
    const takenOver: { path: string; branch: string }[] = [];
    const port: RunGitPort = {
      checkRepository: async () => ({ ok: true, head: 'abc123' }),
      takeOver: async (a) => { takenOver.push({ path: a.path, branch: a.branch }); return made.has(a.path) ? ok({ ref: `${a.id}/${a.unit}`, path: a.path, branch: a.branch, baseBranch: 'main', baseRevision: 'abc123' }) : err(`nothing at ${a.path}`); },
      provision: async (a) => {
        const path = join(ws, '.rotaris', 'requirements', 'worktrees', a.unit);
        calls.push(a.unit);
        // REQ-GIT-140 / REQ-GIT-008, as the real unit answers it: an existing directory fails rather than being reused.
        if (existsSync(path)) return err(`Worktree path already exists: ${path}`);
        mkdirSync(path, { recursive: true });
        made.add(path);
        return ok({ ref: `${a.id}/${a.unit}`, path, branch: `rotaris/req/${a.id.toLowerCase()}/${a.unit}`, baseBranch: 'main', baseRevision: 'abc123' });
      },
    };
    return { port, calls, takenOver };
  };
  it('REQ-TRACE-464/453/463: a card held out of ready and resumed takes over the worktree its release provisioned — one provisioning, no stall, a claimable launch on u1', async () => {
    const { port, calls } = provisioningGit();
    const s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port });
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    const released = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    expect((released.value as { value: TransitionOutcome }).value).toMatchObject({ from: 'backlog', to: 'ready' });
    const held = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'hold', payload: { reason: 'Waiting on a vendor answer' } }, USER);
    expect((held.value as { value: TransitionOutcome }).value).toMatchObject({ from: 'ready', to: 'blocked' });
    const resumed = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'resume', payload: { disclosure: 'accepted' } }, USER);
    const outcome = (resumed.value as { ok: boolean; value: TransitionOutcome & { dispatch?: string } });
    expect(outcome.ok).toBe(true);
    expect(outcome.value).toMatchObject({ from: 'blocked', to: 'ready' });
    // No "no run began": the resume took the launch over rather than stalling on a second provisioning.
    expect(outcome.value.dispatch).toBeUndefined();
    expect(calls).toEqual(['u1']);
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', start: true }, USER);
    const claim = (await s.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value as { id: string; unit: string; worktree: { path: string; branch: string } } | null;
    expect(claim).not.toBeNull();
    expect(claim).toMatchObject({ id: 'REQ-101', unit: 'u1', worktree: { path: join(ws, '.rotaris', 'requirements', 'worktrees', 'u1'), branch: 'rotaris/req/req-101/u1' } });
  });
  it('REQ-TRACE-464: after a restart lost the launch, the resume takes over the tree the store recorded for the same unit rather than provisioning it again', async () => {
    const { port, calls, takenOver } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'hold', payload: { reason: 'Waiting on a vendor answer' } }, USER);
    // The restart: a new service over the same store, with nothing in memory (REQ-TRACE-479: the stop is not persisted).
    const after = createDeliveryService(deps);
    const resumed = await after.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'resume', payload: { disclosure: 'accepted' } }, USER);
    const outcome = (resumed.value as { ok: boolean; value: TransitionOutcome & { dispatch?: string } });
    expect(outcome.value).toMatchObject({ from: 'blocked', to: 'ready' });
    expect(outcome.value.dispatch).toBeUndefined();
    expect(calls).toEqual(['u1']);
    expect(takenOver).toEqual([{ path: join(ws, '.rotaris', 'requirements', 'worktrees', 'u1'), branch: 'rotaris/req/req-101/u1' }]);
    const claim = (await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value as { unit: string; worktree: { path: string } } | null;
    expect(claim).toMatchObject({ unit: 'u1', worktree: { path: join(ws, '.rotaris', 'requirements', 'worktrees', 'u1') } });
  });
  it('deliveryServiceFor keeps one service per open store', () => {
    const deps = { workspaceRoot: ws, engine, clocks: clock, log: () => undefined };
    expect(deliveryServiceFor(r, deps)).toBe(deliveryServiceFor(r, deps));
  });
  it('REQ-TRACE-402: a writer without the declaration is refused with the comparison named — proven on the guard, not here, since the composition is fixed', () => {
    // The service always composes the real writer; the guard test covers `assertWriterDeclares` against a bare object.
    expect(() => service()).not.toThrow();
    void err;
  });
});
