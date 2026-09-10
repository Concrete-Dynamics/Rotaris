import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
  const board = async (): Promise<BoardProjection> => (await delivery.handle({ name: 'requirements.board', workspace: workspaceRoot }, USER)).value as BoardProjection;
  const act = async (id: ReqId, action: 'release' | 'resume', payload?: Readonly<Record<string, string>>): Promise<{ readonly ok: boolean; readonly value?: TransitionOutcome; readonly error?: Refusal }> =>
    (await delivery.handle({ name: 'requirements.act', workspace: workspaceRoot, id, action, ...(payload === undefined ? {} : { payload }) }, USER)).value as { ok: boolean; value?: TransitionOutcome; error?: Refusal };

  beforeAll(async () => {
    const storeDir = join(out!, 'store');
    const configDir = join(out!, 'config');
    mkdirSync(storeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    const clocks = nodeClocks();
    resolved = openWorkspaceStore(storeDir, mintWorkspaceId('000000000000000000000000000000ap'.replace(/[^0-9a-f]/g, '0')), workspaceRoot);
    const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
    delivery = createDeliveryService({ db: resolved.db, workspaceRoot, engine, clocks, configDir, log: () => undefined });
    runs = createRequirementsRuns({
      currentWorkspace: () => workspaceRoot,
      currentWorkspaceId: () => 'proof-workspace',
      service: (root, request) => {
        if (request.kind !== 'requirements.command') return Promise.resolve({ kind: 'refused', code: 'proof.unexpected', headline: `unexpected request ${request.kind}` } as ProcessReply);
        expect(root).toBe(workspaceRoot);
        expect(request.actor).toEqual({ kind: 'system' });
        return delivery.handle(request.command, request.actor).then((answer): ProcessReply => {
          serviceCalls.push({ name: request.command.name, value: answer.value });
          return { kind: 'requirements.result', value: answer.value, ...(answer.changed === undefined ? {} : { changed: answer.changed }) };
        });
      },
      runHost: { request: host, onEvent: (fn) => { emit = fn; return () => undefined; } },
      onRunHostExit: (fn) => { exit = fn; },
      preferences: { read: (key) => key === 'requirements/fullPermissionRuns', write: async () => undefined },
      mintSessionId: () => `proof-session-${(minted += 1)}`,
      broadcast: () => undefined,
      log: () => undefined,
    });
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

    // REQ-TRACE-470/471: the start was made under the elevated live state, and only that one start was.
    const started = hostRequests.find((h) => h.request.kind === 'session.start');
    expect(started).toBeDefined();
    expect(started!.liveState).toEqual({ runtime: { permission_mode: 'autonomous' } });
    expect((started!.request as { effectiveRoot?: string }).effectiveRoot).toBe(preview.worktreePath);
    expect(hostRequests.map((h) => h.request.kind)).toEqual(['config.liveState', 'session.start', 'config.liveState']);

    // The composer's next run reaches the same run host and does NOT get the preset: the live state was put back.
    await host({ kind: 'session.start', workspaceId: 'proof-workspace', prompt: 'the composer\'s next run', sessionId: 'composer-run' } as RunHostRequest);
    expect(hostRequests[hostRequests.length - 1]!.liveState).toEqual({});
    results.launch = { branch: preview.branch, worktree: preview.worktreePath, session: firstSession, elevated: started!.liveState, composerLiveState: {} };
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
});
