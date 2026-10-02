import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  /**
   * Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md`: a release with the queue stopped
   * provisions u1 and rests in `ready`; a restart loses the launch while the store keeps the card in `ready` and the
   * tree's row. The queue's "Disclose and start" sends `requirements.queue.set {release, disclosure}`, which recorded
   * the disclosure only on a launch it already held, so the entry stayed deferred as undisclosed and no claim took the
   * card. REQ-TRACE-472 (accepting is what lets the run start), REQ-TRACE-482 (released, it begins), REQ-TRACE-464
   * (the run takes over the worktree already provisioned for it and never provisions a second one).
   */
  it('REQ-TRACE-472/482/464: after a restart lost the launch of a card resting in ready, the queue\'s disclosure release takes over the recorded tree and the claim begins u1 on it', async () => {
    const { port, calls, takenOver } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    // The restart: a new service over the same store (REQ-TRACE-480: the stop is not persisted).
    const after = createDeliveryService(deps);
    const board = (await after.handle({ name: 'requirements.board', workspace: 'x' }, USER)).value as BoardProjection;
    expect(board.cards.find((c) => c.id === 'REQ-101')!.column).toBe('ready');
    const entry = (q: { entries: readonly { id: string; state: string; reason?: string }[] }) => q.entries.find((e) => e.id === 'REQ-101');
    // Before the user accepts, the entry still asks for the disclosure: nothing begins without it (REQ-TRACE-472/497).
    expect(entry(board.queue)).toMatchObject({ state: 'deferred', reason: 'The permissions of the run for REQ-101 have not been disclosed and accepted; open it from the queue to see the disclosure and start it.' });
    expect((await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value).toBeNull();
    const released = await after.handle({ name: 'requirements.queue.set', workspace: 'x', release: 'REQ-101', disclosure: 'accepted' }, USER);
    expect(entry(released.value as BoardProjection['queue'])).toMatchObject({ state: 'next' });
    const claim = (await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value as { id: string; unit: string; worktree: { path: string; branch: string }; permissions: string } | null;
    expect(claim).toMatchObject({ id: 'REQ-101', unit: 'u1', worktree: { path: join(ws, '.rotaris', 'requirements', 'worktrees', 'u1'), branch: 'rotaris/req/req-101/u1' }, permissions: 'permissive' });
    expect(calls).toEqual(['u1']);
    expect(takenOver.map((t) => t.path)).toContain(join(ws, '.rotaris', 'requirements', 'worktrees', 'u1'));
  });
  it('REQ-TRACE-464/482: under an unattended workspace with automatic scheduling, the first pass after a restart takes the recorded tree over and the scheduler claims the card with no release', async () => {
    const { port, calls } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    writeFileSync(join(root, 'agents.yaml'), 'runtime:\n  permission_mode: autonomous\nrequirements:\n  scheduling:\n    mode: automatic\n');
    const after = createDeliveryService(deps);
    const claim = (await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value as { id: string; unit: string; worktree: { path: string }; permissions: string } | null;
    expect(claim).toMatchObject({ id: 'REQ-101', unit: 'u1', worktree: { path: join(ws, '.rotaris', 'requirements', 'worktrees', 'u1') }, permissions: 'workspace' });
    expect(calls).toEqual(['u1']);
  });
  /**
   * Verifier's finding, repair round 1: the recovery ran only on the pass that did the restart reap, whether or not the
   * store parsed there. A first parse that failed (a document mid-edit when the app opened) used it up, and no later
   * pass recovered the card, so an unattended automatic workspace never claimed it for the rest of the session.
   */
  it('REQ-TRACE-482/464: a first parse that fails does not use up the recovery; the next pass that parses recovers the card and the scheduler claims it', async () => {
    const { port, calls } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    writeFileSync(join(root, 'agents.yaml'), 'runtime:\n  permission_mode: autonomous\nrequirements:\n  scheduling:\n    mode: automatic\n');
    let failOnce = true;
    const flaky: TraceabilityEngine = { ...engine, parseStore: async (root_, o) => { if (failOnce) { failOnce = false; return err({ kind: 'layout', message: 'the store is mid-edit' } as never); } return engine.parseStore(root_, o); } };
    const after = createDeliveryService({ ...deps, engine: flaky });
    await after.handle({ name: 'requirements.board', workspace: 'x' }, USER);
    await after.handle({ name: 'requirements.refresh', workspace: 'x' }, USER);
    const claim = (await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value as { id: string; unit: string; worktree: { path: string } } | null;
    expect(claim).toMatchObject({ id: 'REQ-101', unit: 'u1', worktree: { path: join(ws, '.rotaris', 'requirements', 'worktrees', 'u1') } });
    expect(calls).toEqual(['u1']);
  });
  /**
   * Verifier's finding, repair round 1: the recovery recorded every recovered launch as undisclosed, and the service
   * never learnt main's standing disclosure (the two preferences REQ-TRACE-472 names). A card released with the
   * disclosure suppressed permanently, or with the elevation switched off, in a workspace that schedules automatically
   * but is not unattended, was never claimed after a restart. Main now stamps its standing disclosure on every command
   * it sends (the envelope's `disclosure`, the third argument here).
   */
  it('REQ-TRACE-472/482: after a restart, a claim carrying a permanently suppressed disclosure starts the card permissive; one carrying the elevation off starts it on the workspace\'s own mode; one with the disclosure due starts nothing', async () => {
    const { port, calls } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'suppressed' } }, USER);
    writeFileSync(join(root, 'agents.yaml'), 'requirements:\n  scheduling:\n    mode: automatic\n');
    const due = createDeliveryService(deps);
    expect((await due.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, 'due')).value).toBeNull();
    const suppressed = createDeliveryService(deps);
    const s = (await suppressed.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, 'suppressed')).value as { id: string; unit: string; permissions: string } | null;
    expect(s).toMatchObject({ id: 'REQ-101', unit: 'u1', permissions: 'permissive' });
    const off = createDeliveryService(deps);
    const o = (await off.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, 'off')).value as { id: string; unit: string; permissions: string } | null;
    expect(o).toMatchObject({ id: 'REQ-101', unit: 'u1', permissions: 'workspace' });
    expect(calls).toEqual(['u1']);
  });
  /**
   * Verifier's finding, repair round 2: the standing disclosure reached the claim alone, so the queue the board
   * published was still computed as if the disclosure were due. After a restart, under automatic scheduling with the
   * disclosure suppressed permanently, the entry read "deferred … open it from the queue to see the disclosure and start
   * it" while the next claim took the card with no disclosure shown — the queue no longer showed the scheduler's own
   * order and reason (REQ-TRACE-478), and promised a disclosure REQ-TRACE-472 suppresses.
   */
  it('REQ-TRACE-478/472: after a restart, the queue the board publishes under a suppressed disclosure shows the card next, and the claim takes the card the queue named', async () => {
    const { port, calls } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'suppressed' } }, USER);
    writeFileSync(join(root, 'agents.yaml'), 'requirements:\n  scheduling:\n    mode: automatic\n');
    const after = createDeliveryService(deps);
    const board = (await after.handle({ name: 'requirements.board', workspace: 'x' }, USER, 'suppressed')).value as BoardProjection;
    const entry = board.queue.entries.find((e) => e.id === 'REQ-101');
    expect(entry).toMatchObject({ state: 'next' });
    expect(entry?.reason).toBeUndefined();
    const claim = (await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, 'suppressed')).value as { id: string; unit: string; permissions: string } | null;
    expect(claim).toMatchObject({ id: 'REQ-101', unit: 'u1', permissions: 'permissive' });
    expect(calls).toEqual(['u1']);
  });
  it('REQ-TRACE-478/472: a standing disclosure that moves republishes the queue under it, and the reply carries the move for channel 10; one that holds changes nothing', async () => {
    const { port } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    writeFileSync(join(root, 'agents.yaml'), 'requirements:\n  scheduling:\n    mode: automatic\n');
    const after = createDeliveryService(deps);
    const entry = (b: BoardProjection) => b.queue.entries.find((e) => e.id === 'REQ-101');
    const first = await after.handle({ name: 'requirements.board', workspace: 'x' }, USER, 'due');
    expect(entry(first.value as BoardProjection)).toMatchObject({ state: 'deferred', reason: 'The permissions of the run for REQ-101 have not been disclosed and accepted; open it from the queue to see the disclosure and start it.' });
    expect(first.changed).toBeUndefined();
    const same = await after.handle({ name: 'requirements.board', workspace: 'x' }, USER, 'due');
    expect(same.value).toBe(first.value);
    expect(same.changed).toBeUndefined();
    // A permanent acceptance in another window: main's next command carries `suppressed`.
    const moved = await after.handle({ name: 'requirements.board', workspace: 'x' }, SYSTEM, 'suppressed');
    const g = (first.value as BoardProjection).generation + 1;
    expect(moved.changed).toEqual({ generation: g, affected: null });
    expect((moved.value as BoardProjection).generation).toBe(g);
    expect(entry(moved.value as BoardProjection)).toMatchObject({ state: 'next' });
    // A command that names no disclosure keeps the last one held.
    const kept = await after.handle({ name: 'requirements.board', workspace: 'x' }, USER);
    expect(kept.value).toBe(moved.value);
  });
  it('REQ-TRACE-472: with the elevation switched off when the claim is made, a launch accepted earlier starts on the workspace\'s own mode', async () => {
    const { port } = provisioningGit();
    const s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port });
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', start: true }, USER);
    const c = (await s.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, 'off')).value as { id: string; permissions: string } | null;
    expect(c).toMatchObject({ id: 'REQ-101', permissions: 'workspace' });
  });
  it('REQ-TRACE-464/463: a recorded tree that cannot be taken over is stated on the entry, and nothing is provisioned from the queue', async () => {
    const { port, calls } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', stop: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    rmSync(join(ws, '.rotaris', 'requirements', 'worktrees', 'u1'), { recursive: true, force: true });
    const after = createDeliveryService(deps);
    const released = await after.handle({ name: 'requirements.queue.set', workspace: 'x', release: 'REQ-101', disclosure: 'accepted' }, USER);
    const e = (released.value as BoardProjection['queue']).entries.find((x) => x.id === 'REQ-101');
    expect(e).toMatchObject({ state: 'deferred' });
    expect(e?.reason).toBe('The last start of REQ-101 did not begin: REQ-101 unit u1 has no recorded worktree on disk to take over, and a start from the queue provisions none: restore the tree, or hold the card and resume it from the board, which provisions one. Release it from the queue to try again.');
    expect((await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value).toBeNull();
    expect(calls).toEqual(['u1']);
  });
  /**
   * Defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md` (REQ-TRACE-423/482/464/497): a run of
   * u1 ends and the review rejects it (or the run ends classified `cancelled`, as one stopped at its iteration limit
   * is), so the card rests in `ready` with its `Units` fact at 1 and the next unit is u2. The launch the service held
   * was u1's, and nothing provisioned u2: the claim handed u1 out again and `run.started` threw on `delivery_runs`'
   * primary key under `automatic`, and the queue's release stated a stall under `manual`. The held launch of an earlier
   * unit is spent; the claim provisions the card's current unit when the store records no tree for it, and records the
   * row at once, so u1's tree stays intact (REQ-TRACE-423) and u2 gets one tree (REQ-TRACE-464).
   */
  const u = (unit: string) => join(ws, '.rotaris', 'requirements', 'worktrees', unit);
  const runToEnd = async (s: DeliveryService, outcome: 'completed' | 'cancelled') => {
    const first = (await s.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value as { unit: string } | null;
    expect(first).toMatchObject({ unit: 'u1' });
    await s.handle({ name: 'requirements.run.started', workspace: 'x', id: 'REQ-101', unit: 'u1', sessionId: 'sess-1', permissions: 'permissive' }, SYSTEM);
    const ended = (await s.handle({ name: 'requirements.run.ended', workspace: 'x', sessionId: 'sess-1', outcome, detail: `the run ended ${outcome}` }, SYSTEM)).value as { settled: boolean; to?: string };
    expect(ended).toMatchObject({ settled: true, to: outcome === 'completed' ? 'review' : 'ready' });
    if (outcome === 'completed') {
      const rejected = await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'reject', payload: { reason: 'not what was asked' } }, USER);
      expect((rejected.value as { value: TransitionOutcome }).value).toMatchObject({ from: 'review', to: 'ready' });
    }
  };
  const startsU2 = async (s: DeliveryService, calls: readonly string[], disclosure?: 'suppressed') => {
    const claim = (await s.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, disclosure)).value as { id: string; unit: string; worktree: { path: string; branch: string } } | null;
    expect(claim).toMatchObject({ id: 'REQ-101', unit: 'u2', worktree: { path: u('u2'), branch: 'rotaris/req/req-101/u2' } });
    expect(calls).toEqual(['u1', 'u2']);
    // REQ-TRACE-423: the rejected unit's tree is kept for inspection.
    expect(existsSync(u('u1'))).toBe(true);
    const started = (await s.handle({ name: 'requirements.run.started', workspace: 'x', id: 'REQ-101', unit: 'u2', sessionId: 'sess-2', permissions: 'permissive' }, SYSTEM)).value as { ok: boolean };
    expect(started.ok).toBe(true);
    const d = (await s.handle({ name: 'requirements.detail', workspace: 'x', id: 'REQ-101' }, USER)).value as { card: { column: string; run?: { unit: string } }; runs: { unit: string; worktree?: string }[] };
    expect(d.card.column).toBe('running');
    expect(d.card.run?.unit).toBe('u2');
    expect(d.runs.map((x) => [x.unit, x.worktree])).toEqual([['u1', u('u1')], ['u2', u('u2')]]);
  };
  it('REQ-TRACE-423/482/464: under manual, a rejected card released from the queue begins u2 on a fresh tree, u1\'s tree kept', async () => {
    const { port, calls } = provisioningGit();
    const s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port });
    await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    await runToEnd(s, 'completed');
    // REQ-TRACE-482: under manual nothing begins until the person releases it from the queue.
    expect((await s.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value).toBeNull();
    expect(calls).toEqual(['u1']);
    const released = await s.handle({ name: 'requirements.queue.set', workspace: 'x', release: 'REQ-101', disclosure: 'accepted' }, USER);
    const entry = (released.value as BoardProjection['queue']).entries.find((e) => e.id === 'REQ-101');
    expect(entry).toMatchObject({ state: 'next', unit: 'u2' });
    expect(entry?.reason).toBeUndefined();
    await startsU2(s, calls);
  });
  it('REQ-TRACE-423/482/464/497: under automatic, the claim after a reject begins u2 on a fresh tree, never the rejected unit again', async () => {
    const { port, calls } = provisioningGit();
    const s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port });
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', automatic: true }, USER);
    await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    await runToEnd(s, 'completed');
    const board = (await s.handle({ name: 'requirements.board', workspace: 'x' }, USER)).value as BoardProjection;
    expect(board.queue.entries.find((e) => e.id === 'REQ-101')).toMatchObject({ state: 'next', unit: 'u2' });
    // The read provisions nothing (REQ-TRACE-408), and neither did the reject (REQ-TRACE-389/422).
    expect(calls).toEqual(['u1']);
    await startsU2(s, calls);
  });
  it('REQ-TRACE-482/464: a run ending classified cancelled (stopped at its iteration limit) rests in ready, and the next claim begins u2 on a fresh tree', async () => {
    const { port, calls } = provisioningGit();
    const s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port });
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', automatic: true }, USER);
    await s.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    await runToEnd(s, 'cancelled');
    await startsU2(s, calls);
  });
  it('REQ-TRACE-464: a restart between the claim that provisioned u2 and its start takes u2\'s recorded tree over rather than provisioning it twice', async () => {
    const { port, calls, takenOver } = provisioningGit();
    const deps = { db: r.db, workspaceRoot: ws, engine, clocks: clock, log: () => undefined, configDir: root, git: port };
    const before = createDeliveryService(deps);
    await before.handle({ name: 'requirements.queue.set', workspace: 'x', automatic: true }, USER);
    await before.handle({ name: 'requirements.act', workspace: 'x', id: 'REQ-101', action: 'release', payload: { disclosure: 'accepted' } }, USER);
    await runToEnd(before, 'completed');
    expect((await before.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value).toMatchObject({ unit: 'u2' });
    expect(calls).toEqual(['u1', 'u2']);
    // The relaunch: nothing in memory; the store holds u2's row, written at the claim.
    const after = createDeliveryService(deps);
    const claim = (await after.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM, 'suppressed')).value as { unit: string; worktree: { path: string } } | null;
    expect(claim).toMatchObject({ unit: 'u2', worktree: { path: u('u2') } });
    expect(calls).toEqual(['u1', 'u2']);
    expect(takenOver.map((t) => t.path)).toContain(u('u2'));
  });
  it('a claim before the first pass, under manual with nothing armed, answers null without parsing the store; under automatic it parses', async () => {
    const s = service();
    expect((await s.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value).toBeNull();
    expect(parses).toBe(0);
    await s.handle({ name: 'requirements.queue.set', workspace: 'x', automatic: true }, USER);
    const fresh = service();
    parses = 0;
    expect((await fresh.handle({ name: 'requirements.run.claim', workspace: 'x' }, SYSTEM)).value).toBeNull();
    expect(parses).toBe(1);
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
