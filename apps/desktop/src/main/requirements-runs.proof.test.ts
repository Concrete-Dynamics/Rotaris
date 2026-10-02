import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Actor, BoardProjection, CommandOutcome, LaunchPreview, ProcessEvent, ProcessReply, ReqId, Refusal, RunHostRequest, RunReaped, TransitionOutcome } from '@rotaris/contracts';
import { mintWorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { INTERRUPTED, createInThreadExecutor, createTraceabilityEngine, fsArtifactIo, requirementWorktreePath, slotReason } from '@rotaris/workspace';
import { createDeliveryService, type DeliveryService } from '../workspace-service/delivery.js';
import { createRequirementsRuns, type RequirementsRuns } from './requirements-runs.js';

/**
 * Part AP — the proof suite driven by `apps/desktop/scripts/requirements-runs-proof.mjs` (spec 08 §Runs Started from
 * the Board, §Delivery Queue; ADR-0041's second execution; REQ-TRACE-463..483, REQ-GIT-137/140).
 *
 * It runs the REAL delivery service of the workspace service over a REAL store and Part AJ's REAL traceability engine
 * (in-thread executor), against a REAL scratch Git repository holding a copy of the fixture requirement store, with
 * main's REAL run coordinator above it. Only the run host is scripted — it records every request it receives together
 * with the live configuration state in force at that moment, which is how the elevation's confinement is measured
 * rather than asserted (REQ-TRACE-470/471).
 *
 * Skipped in an ordinary `pnpm test`: the script provides the repository, the copy and the two directories, and
 * provisioning real worktrees under a parallel suite would be neither fast nor meaningful. The five assertions are
 * the ones the plan's row names, and the proof script reads them back by these `it` titles.
 */
const out = process.env['ROTARIS_REQUIREMENTS_RUNS_PROOF'];
const fixtureRoot = process.env['ROTARIS_REQUIREMENTS_RUNS_WORKSPACE'];

const USER: Actor = { kind: 'user', person: 'proof' };
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 5)); };

describe.skipIf(!out || !fixtureRoot)('requirements-runs-proof — runs from the board, end to end', () => {
  const workspaceRoot = fixtureRoot!;
  const results: Record<string, unknown> = {};
  let resolved: ResolvedStore;
  let delivery: DeliveryService;
  let runs: RequirementsRuns;
  /** Every run-host request, with the live configuration state that was in force when it arrived (REQ-TRACE-471). */
  const hostRequests: { readonly request: RunHostRequest; readonly liveState: unknown }[] = [];
  /** Every service command the coordinator spoke, with what came back (the reap's statements are read from here). */
  const serviceCalls: { readonly name: string; readonly value: unknown }[] = [];
  let liveState: unknown = {};
  // The refused start and the reason it leaves on the queue entry (REQ-TRACE-463) are proven in
  // `requirements-runs.test.ts` against the faked service; here every start is taken.
  const acceptStarts = true;
  let minted = 0;
  let emit: (event: ProcessEvent) => void = () => undefined;
  let exit: (code: number) => void = () => undefined;
  let firstSession = '';
  let firstWorktree = '';

  const host = async (request: RunHostRequest): Promise<ProcessReply> => {
    hostRequests.push({ request, liveState });
    if (request.kind === 'config.liveState') { liveState = request.state; return { kind: 'ack' }; }
    if (request.kind === 'session.start') {
      if (!acceptStarts) return { kind: 'refused', code: 'session.no-model', headline: 'No model configured', detail: 'the proof refused this start on purpose' };
      return { kind: 'session.started', sessionId: request.sessionId ?? `minted-${(minted += 1)}` };
    }
    return { kind: 'ack' };
  };
  // A person's reads and acts arrive through main's relay, which stamps the coordinator's standing disclosure beside the actor (REQ-TRACE-472/478).
  const board = async (): Promise<BoardProjection> => (await delivery.handle({ name: 'requirements.board', workspace: workspaceRoot }, USER, runs.standingDisclosure())).value as BoardProjection;
  const act = async (id: ReqId, action: 'release' | 'resume' | 'reject', payload?: Readonly<Record<string, string>>): Promise<{ readonly ok: boolean; readonly value?: TransitionOutcome; readonly error?: Refusal }> =>
    (await delivery.handle({ name: 'requirements.act', workspace: workspaceRoot, id, action, ...(payload === undefined ? {} : { payload }) }, USER, runs.standingDisclosure())).value as { ok: boolean; value?: TransitionOutcome; error?: Refusal };

  /** The workspace service and main's coordinator as a start builds them; the restart assertion builds a second pair over the same store. */
  let start: (prefs?: { readonly suppressed?: boolean }) => void = () => undefined;

  beforeAll(async () => {
    const storeDir = join(out!, 'store');
    const configDir = join(out!, 'config');
    mkdirSync(storeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    const clocks = nodeClocks();
    resolved = openWorkspaceStore(storeDir, mintWorkspaceId('000000000000000000000000000000ap'.replace(/[^0-9a-f]/g, '0')), workspaceRoot);
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    start = (prefs = {}) => {
      delivery = createDeliveryService({ db: resolved.db, workspaceRoot, engine, clocks, configDir, log: () => undefined });
      runs = createRequirementsRuns({
        currentWorkspace: () => workspaceRoot,
        currentWorkspaceId: () => 'proof-workspace',
        service: (root, request) => {
          if (request.kind !== 'requirements.command') return Promise.resolve({ kind: 'refused', code: 'proof.unexpected', headline: `unexpected request ${request.kind}` } as ProcessReply);
          expect(root).toBe(workspaceRoot);
          expect(request.actor).toEqual({ kind: 'system' });
          return delivery.handle(request.command, request.actor, request.disclosure).then((answer): ProcessReply => {
            serviceCalls.push({ name: request.command.name, value: answer.value });
            return { kind: 'requirements.result', value: answer.value, ...(answer.changed === undefined ? {} : { changed: answer.changed }) };
          });
        },
        runHost: { request: host, onEvent: (fn) => { emit = fn; return () => undefined; } },
        onRunHostExit: (fn) => { exit = fn; },
        preferences: { read: (key) => key === 'requirements/fullPermissionRuns' || (key === 'requirements/fullPermissionNoticeSuppressed' && prefs.suppressed === true), write: async () => undefined },
        mintSessionId: () => `proof-session-${(minted += 1)}`,
        broadcast: () => undefined,
        log: () => undefined,
      });
    };
    start();
    // The board is read once before anything is measured, so the engine's parse is not timed into the first launch.
    await board();
  });
  afterAll(() => {
    if (out !== undefined && Object.keys(results).length > 0) writeFileSync(join(out, 'suite-results.json'), JSON.stringify(results, null, 2));
    resolved.db.close();
    forgetSpelling(resolved.dir);
  });

  it('release → disclosure → accept: the run starts in a new worktree with the permissive preset, and the composer\'s next run does not', async () => {
    // REQ-TRACE-472/474: the disclosure is due, and it states the worktree and branch the run will be confined to.
    const answered = await runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' });
    expect(answered.ok).toBe(true);
    const preview = (answered as Extract<CommandOutcome, { ok: true }>).value as LaunchPreview;
    expect(preview.disclosure).toBe('due');
    expect(preview.permissions).toBe('permissive');
    expect(preview.repository).toEqual({ ok: true });
    expect(preview.branch).toBe('rotaris/req/req-101/u1');
    expect(preview.worktreePath).toBe(requirementWorktreePath(workspaceRoot, 'rotaris/req/req-101/u1'));
    // Nothing is provisioned by a preview.
    expect(existsSync(preview.worktreePath)).toBe(false);

    // Accepting it: the act carries the disclosure, the writer's beforeCommit provisions, the card moves to ready.
    const released = await act('REQ-101', 'release', { disclosure: 'accepted' });
    expect(released.ok).toBe(true);
    expect(released.value!.to).toBe('ready');
    expect(existsSync(join(preview.worktreePath, 'rotaris-traceability.json'))).toBe(true);
    firstWorktree = preview.worktreePath;

    const report = await runs.dispatch();
    expect(report.abandoned).toEqual([]);
    expect(report.started.map((s) => s.id)).toEqual(['REQ-101']);
    firstSession = report.started[0]!.sessionId;

    // REQ-TRACE-470/471: the board grant belongs to this start request.
    const started = hostRequests.find((h) => h.request.kind === 'session.start');
    expect(started).toBeDefined();
    expect(started!.request).toHaveProperty('boardPermissions', 'permissive');
    expect(started!.liveState).toEqual({});
    expect((started!.request as { effectiveRoot?: string }).effectiveRoot).toBe(preview.worktreePath);
    expect(hostRequests.map((h) => h.request.kind)).toEqual(['session.start']);

    // The composer carries its ordinary configuration on the next start.
    await host({ kind: 'session.start', workspaceId: 'proof-workspace', prompt: 'the composer\'s next run', sessionId: 'composer-run' } as RunHostRequest);
    expect(hostRequests[hostRequests.length - 1]!.liveState).toEqual({});
    expect(hostRequests[hostRequests.length - 1]!.request).not.toHaveProperty('boardPermissions');
    results.launch = { branch: preview.branch, worktree: preview.worktreePath, session: firstSession, boardPermissions: 'permissive', composerLiveState: {} };
  });

  it('the run row carries the session id while the unit runs', async () => {
    const projection = await board();
    const card = projection.cards.find((c) => c.id === 'REQ-101');
    expect(card).toBeDefined();
    expect(card!.column).toBe('running');
    expect(card!.run?.sessionId).toBe(firstSession);
    expect(card!.run?.unit).toBe('u1');
    expect(card!.run?.interrupted).toBe(false);
    // REQ-TRACE-475: the live run declares which requirement and which unit it came from.
    expect(runs.live()).toEqual([{ sessionId: firstSession, id: 'REQ-101', unit: 'u1', waitingOnPerson: false, permissions: 'permissive' }]);
    // REQ-TRACE-466: a pending approval on the live run puts the fact on the run row, and clearing it takes it off.
    const snapshot = (approvals: number): ProcessEvent => ({ kind: 'publish.snapshot', payload: { v: 1, sessionId: firstSession, seq: approvals + 1, session: { pendingApprovals: Array.from({ length: approvals }, (_, i) => ({ request_id: `r${i}` })), pendingQuestions: [] } as never } } as ProcessEvent);
    emit(snapshot(1));
    await settle();
    expect((await board()).cards.find((c) => c.id === 'REQ-101')!.run?.waitingOnPerson).toBe(true);
    emit(snapshot(0));
    await settle();
    expect((await board()).cards.find((c) => c.id === 'REQ-101')!.run?.waitingOnPerson).toBe(false);
    results.running = { column: card!.column, sessionId: card!.run?.sessionId, unit: card!.run?.unit, waitingObserved: true };
  });

  it('the run host dies mid-run: the restart reports "interrupted, work retained" and the worktree is still there', async () => {
    exit(1);
    await settle();
    const reaped = serviceCalls.filter((c) => c.name === 'requirements.run.reap').at(-1)?.value as readonly RunReaped[] | undefined;
    expect(reaped).toBeDefined();
    expect(reaped!.map((r) => r.id)).toEqual(['REQ-101']);
    expect(reaped![0]!.statement).toContain(INTERRUPTED);
    expect(reaped![0]!.sessionId).toBe(firstSession);
    expect(reaped![0]!.held).toBe(true);
    // REQ-GIT-140/142: the work is retained — the worktree and its branch are untouched.
    expect(existsSync(join(firstWorktree, 'rotaris-traceability.json'))).toBe(true);
    const projection = await board();
    const card = projection.cards.find((c) => c.id === 'REQ-101')!;
    expect(card.column).toBe('blocked');
    expect(card.blocker?.kind).toBe('run-failure');
    expect(card.run?.interrupted).toBe(true);
    expect(runs.live()).toEqual([]);
    results.interrupted = { statement: reaped![0]!.statement, column: card.column, blocker: card.blocker?.kind, worktreePresent: true };
  });

  it('automatic scheduling off: a candidate back in the released column is never dispatched on its own, and the queue quotes the scheduler\'s reason', async () => {
    // REQ-TRACE-463: a run-time block returns to ready when it is cleared.
    const resumed = await act('REQ-101', 'resume');
    expect(resumed.ok).toBe(true);
    expect(resumed.value!.to).toBe('ready');
    const projection = await board();
    // REQ-CONFIG-196: the configured default is `manual`, and the queue says so.
    expect(projection.queue.automatic).toBe(false);
    const report = await runs.dispatch();
    expect(report.started).toEqual([]);
    expect(report.abandoned).toEqual([]);
    const after = await board();
    const entry = after.queue.entries.find((e) => e.id === 'REQ-101');
    expect(entry).toBeDefined();
    expect(entry!.state).toBe('deferred');
    // The reason is the scheduler's own, unaltered. On this route the launch the reap forgot is the first thing
    // missing, so the undisclosed stall is what the queue states (see ADR-0041's note, finding AP-3).
    expect(entry!.reason).toMatch(/have not been disclosed/);
    results.manual = { automatic: projection.queue.automatic, dispatched: report.started.length, reason: entry!.reason };
  });

  it('concurrency 2 holds a third release as deferred with the scheduler\'s reason quoted', async () => {
    const projection = await board();
    expect(projection.queue.concurrency).toBe(2);
    for (const id of ['REQ-102', 'REQ-103', 'REQ-105']) {
      const released = await act(id, 'release', { disclosure: 'accepted' });
      expect(released.ok, `${id} released: ${released.error?.reason ?? ''}`).toBe(true);
    }
    const report = await runs.dispatch();
    expect(report.abandoned).toEqual([]);
    expect(report.started).toHaveLength(2);
    const after = await board();
    const dispatched = new Set(report.started.map((s) => s.id));
    const third = ['REQ-102', 'REQ-103', 'REQ-105'].find((id) => !dispatched.has(id))!;
    const entry = after.queue.entries.find((e) => e.id === third)!;
    expect(entry.state).toBe('deferred');
    expect(entry.reason).toBe(slotReason(2, 2));
    expect(after.queue.entries.filter((e) => e.state === 'executing')).toHaveLength(2);
    results.concurrency = { concurrency: after.queue.concurrency, started: [...dispatched], deferred: third, reason: entry.reason };
  });

  /**
   * Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md` (REQ-TRACE-472/482/464): a release
   * with the queue stopped provisions the unit's tree and rests in `ready`; the restart loses the launch, which the
   * workspace service held in memory only. The queue's "Disclose and start" sends the release with the disclosure; the
   * service takes over the tree the store recorded (real Git, `takeOverUnitWorktree`), and the run begins on it.
   */
  it('a card resting in ready across a restart is disclosed and started from the queue, on the worktree its release provisioned', async () => {
    const worktreesOf = (id: string): string[] => execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: workspaceRoot }).toString().split(/\n/).filter((l) => l.startsWith(`branch refs/heads/rotaris/req/${id.toLowerCase()}/`));
    await delivery.handle({ name: 'requirements.queue.set', workspace: workspaceRoot, stop: true }, USER, runs.standingDisclosure());
    const released = await act('REQ-106', 'release', { disclosure: 'accepted' });
    expect(released.ok, released.error?.reason).toBe(true);
    expect(released.value!.to).toBe('ready');
    const tree = requirementWorktreePath(workspaceRoot, 'rotaris/req/req-106/u1');
    expect(existsSync(tree)).toBe(true);
    expect(worktreesOf('REQ-106')).toHaveLength(1);
    // The quit and the relaunch: a new workspace service and a new coordinator over the same store, nothing in memory.
    // The runs the previous instance left running are reaped as the restart reaps them (REQ-TRACE-476), which frees the slots.
    const requestsBefore = hostRequests.length;
    start();
    const before = await board();
    expect(before.cards.find((c) => c.id === 'REQ-106')!.column).toBe('ready');
    // REQ-TRACE-480: the stop is not persisted; REQ-TRACE-472: the entry asks for the disclosure and nothing begins without it.
    expect(before.queue.stopped).toBe(false);
    const waiting = before.queue.entries.find((e) => e.id === 'REQ-106')!;
    expect(waiting.state).toBe('deferred');
    expect(waiting.reason).toMatch(/have not been disclosed and accepted/);
    expect((await runs.dispatch()).started).toEqual([]);
    // "Disclose and start": the queue's release with the accepted disclosure, as the pane sends it.
    const set = await delivery.handle({ name: 'requirements.queue.set', workspace: workspaceRoot, release: 'REQ-106', disclosure: 'accepted' }, USER, runs.standingDisclosure());
    expect((set.value as BoardProjection['queue']).entries.find((e) => e.id === 'REQ-106')!.state).toBe('next');
    const report = await runs.dispatch();
    expect(report.abandoned).toEqual([]);
    expect(report.started.map((s) => s.id)).toEqual(['REQ-106']);
    const startRequest = hostRequests.slice(requestsBefore).find((h) => h.request.kind === 'session.start')!;
    expect((startRequest.request as { effectiveRoot?: string }).effectiveRoot).toBe(tree);
    expect(startRequest.request).toHaveProperty('boardPermissions', 'permissive');
    // REQ-TRACE-464: the tree was taken over, never provisioned a second time.
    expect(worktreesOf('REQ-106')).toHaveLength(1);
    const card = (await board()).cards.find((c) => c.id === 'REQ-106')!;
    expect(card.column).toBe('running');
    expect(card.run?.unit).toBe('u1');
    results.restartRelease = { deferredBefore: waiting.reason, started: report.started.map((s) => s.id), worktree: tree, worktreesForUnit: worktreesOf('REQ-106').length };
  });
  /**
   * The verifier's second finding on the same note (REQ-TRACE-472/482). The concurrency assertion's third release rests in
   * `ready` with its tree, through the restart above and one more. Its launch is rebuilt undisclosed, because the service
   * cannot read the preferences. Meanwhile the person has accepted the disclosure permanently, and the workspace schedules
   * automatically. Main stamps its standing disclosure on every command it sends the service, so the queue the board
   * publishes names the card next (repair round 2: it read "deferred … open it to see the disclosure" while the claim
   * took it, REQ-TRACE-478) and the scheduler picks it up with no release. The run begins, elevated, on the tree its
   * release provisioned.
   */
  it('a card resting in ready is picked up by automatic scheduling after a restart once the disclosure is suppressed permanently, on its recorded tree', async () => {
    const id = (results['concurrency'] as { deferred: ReqId }).deferred;
    const worktreesOf = (req: string): string[] => execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: workspaceRoot }).toString().split(/\n/).filter((l) => l.startsWith(`branch refs/heads/rotaris/req/${req.toLowerCase()}/`));
    const tree = requirementWorktreePath(workspaceRoot, `rotaris/req/${id.toLowerCase()}/u1`);
    expect(existsSync(tree)).toBe(true);
    expect((await board()).cards.find((c) => c.id === id)!.column).toBe('ready');
    // REQ-TRACE-480: automatic scheduling is written into the workspace configuration, so the relaunch reads it.
    await delivery.handle({ name: 'requirements.queue.set', workspace: workspaceRoot, automatic: true }, USER, runs.standingDisclosure());
    const requestsBefore = hostRequests.length;
    start({ suppressed: true });
    const before = await board();
    expect(before.queue.automatic).toBe(true);
    expect(before.cards.find((c) => c.id === id)!.column).toBe('ready');
    // REQ-TRACE-478: the queue a person reads is the scheduler's own — the card it takes next, with no disclosure asked for.
    const entry = before.queue.entries.find((e) => e.id === id);
    expect(entry).toMatchObject({ state: 'next' });
    expect(entry?.reason).toBeUndefined();
    // The relaunch's own kick: main's post-open slot dispatches for the workspace just opened (defect note
    // `an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`, REQ-TRACE-476/482).
    const report = await runs.opened(workspaceRoot, 'proof-workspace');
    expect(report.abandoned).toEqual([]);
    expect(report.started.map((s) => s.id)).toContain(id);
    const startRequest = hostRequests.slice(requestsBefore).find((h) => h.request.kind === 'session.start' && (h.request as { effectiveRoot?: string }).effectiveRoot === tree);
    expect(startRequest, `no session.start on ${id}'s recorded tree`).toBeDefined();
    expect(startRequest!.request).toHaveProperty('boardPermissions', 'permissive');
    // REQ-TRACE-464: taken over, never provisioned a second time.
    expect(worktreesOf(id)).toHaveLength(1);
    const card = (await board()).cards.find((c) => c.id === id)!;
    expect(card.column).toBe('running');
    expect(card.run?.unit).toBe('u1');
    results.restartAutomatic = { id, entryBefore: entry, started: report.started.map((s) => s.id), worktree: tree, worktreesForUnit: worktreesOf(id).length, permissions: 'permissive' };
  });
  /**
   * Defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md` (REQ-TRACE-423/482/464/497). The card the
   * seventh assertion started finishes and is reviewed; the review rejects it, which returns it to `ready` keeping u1's
   * branch and tree for inspection. Its next unit is u2, which no run-starting action provisioned. The launch held was
   * u1's: the claim handed it out again, the session began in the rejected unit's tree, and the run row was refused by
   * `delivery_runs`' primary key. Now the held launch is spent, and the claim provisions u2 (real Git) and records its row.
   */
  it('a rejected card back in ready begins its next unit on a fresh worktree, the rejected unit\'s worktree kept', async () => {
    const id = (results['restartAutomatic'] as { id: ReqId }).id;
    const worktreesOf = (req: string): string[] => execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: workspaceRoot }).toString().split(/\n/).filter((l) => l.startsWith(`branch refs/heads/rotaris/req/${req.toLowerCase()}/`));
    const u1 = requirementWorktreePath(workspaceRoot, `rotaris/req/${id.toLowerCase()}/u1`);
    const live = runs.live().find((l) => l.id === id);
    expect(live, `${id} has no live board run`).toBeDefined();
    // The run host's own terminal event (REQ-TRACE-477): the coordinator settles the row, and the card awaits review.
    emit({ kind: 'run.result', sessionId: live!.sessionId, result: { execution_status: 'completed', summary: 'the unit is done' } } as unknown as ProcessEvent);
    for (let i = 0; i < 200 && (await board()).cards.find((c) => c.id === id)!.column !== 'review'; i += 1) await settle();
    expect((await board()).cards.find((c) => c.id === id)!.column).toBe('review');
    const rejected = await act(id, 'reject', { reason: 'not what the specification asks' });
    expect(rejected.ok, rejected.error?.reason).toBe(true);
    expect(rejected.value!.to).toBe('ready');
    // REQ-TRACE-389/422: rejecting provisions nothing; REQ-TRACE-408: nor does reading the board.
    expect(worktreesOf(id)).toHaveLength(1);
    expect((await board()).queue.entries.find((e) => e.id === id)).toMatchObject({ state: 'next', unit: 'u2' });
    expect(worktreesOf(id)).toHaveLength(1);
    const requestsBefore = hostRequests.length;
    const report = await runs.dispatch();
    expect(report.abandoned).toEqual([]);
    expect(report.started.filter((s) => s.id === id).map((s) => s.unit)).toEqual(['u2']);
    const startRequest = hostRequests.slice(requestsBefore).find((h) => h.request.kind === 'session.start');
    const begun = startRequest?.request as { effectiveRoot?: string; worktree?: { worktree_path: string; branch: string } } | undefined;
    // The unit's branch is the configured template's (the second cycle of the card carries its suffix, as a re-run's does).
    const u2Branch = begun?.worktree?.branch ?? '';
    expect(u2Branch.startsWith(`rotaris/req/${id.toLowerCase()}/u2`), u2Branch).toBe(true);
    const u2 = requirementWorktreePath(workspaceRoot, u2Branch);
    expect(begun?.effectiveRoot).toBe(u2);
    expect(u2).not.toBe(u1);
    // REQ-TRACE-423: u1's tree and branch kept; REQ-TRACE-464: u2 has exactly one.
    expect(existsSync(join(u1, 'rotaris-traceability.json'))).toBe(true);
    expect(existsSync(join(u2, 'rotaris-traceability.json'))).toBe(true);
    expect(worktreesOf(id).sort()).toEqual([`branch refs/heads/rotaris/req/${id.toLowerCase()}/u1`, `branch refs/heads/${u2Branch}`]);
    const card = (await board()).cards.find((c) => c.id === id)!;
    expect(card.column).toBe('running');
    expect(card.run?.unit).toBe('u2');
    results.rejectNextUnit = { id, started: report.started, worktreeU1: u1, worktreeU2: u2, branchU2: u2Branch, worktrees: worktreesOf(id).length };
  });
});
