import { describe, expect, it } from 'vitest';
import type { ProcessEvent, ProcessReply, RunClaim, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
import { approvalWaitOf, createRequirementsRuns, outcomeOf } from './requirements-runs.js';

/**
 * Part AP — main's run coordinator (REQ-TRACE-463..477, 470..474) over a faked workspace service and a faked run host:
 * the preview folds the two preferences in; a dispatch claims, elevates for the one start and restores, records the
 * session id, and abandons with the reason when the start is refused; the run host's ending settles the row and the
 * next candidate follows; the run host's exit reaps with an empty live set; a person's copy of a run command never
 * originates here (the actor is always the system).
 */
function harness(opts: { claims?: RunClaim[]; startReply?: ProcessReply; prefs?: { runs?: boolean; suppressed?: boolean }; preview?: Record<string, unknown>; current?: { readonly root: string; readonly id: string } } = {}) {
  const claims = [...(opts.claims ?? [])];
  const sent: WorkspaceServiceRequest[] = [];
  /** The workspace root each service request was addressed to, in order. */
  const roots: string[] = [];
  const hostSent: RunHostRequest[] = [];
  const broadcasts: unknown[] = [];
  const written: [string, boolean][] = [];
  let onEvent: (e: ProcessEvent) => void = () => undefined;
  let onExit: (code: number) => void = () => undefined;
  const prefs = { runs: opts.prefs?.runs ?? true, suppressed: opts.prefs?.suppressed ?? false };
  const runs = createRequirementsRuns({
    // `current`: the most recently focused window's workspace, when a case puts the focus on another one.
    currentWorkspace: () => opts.current?.root ?? 'C:\\ws',
    currentWorkspaceId: () => opts.current?.id ?? 'ws-id',
    service: (root, req) => {
      if (opts.current === undefined) expect(root).toBe('C:\\ws');
      roots.push(root);
      sent.push(req);
      if (req.kind !== 'requirements.command') return Promise.resolve({ kind: 'refused', code: 'x', headline: 'not a requirements command' });
      expect(req.actor).toEqual({ kind: 'system' });
      const c = req.command;
      switch (c.name) {
        case 'requirements.run.preview': return Promise.resolve({ kind: 'requirements.result', value: { id: c.id, action: c.action, unit: 'u1', branch: 'rotaris/req/req-101/u1', worktreePath: 'C:\\ws\\.rotaris\\requirements\\worktrees\\rotaris-req-req-101-u1', workspaceUnattended: false, startsNow: true, repository: { ok: true }, approvalTimeoutSeconds: 0, ...opts.preview } });
        case 'requirements.run.claim': return Promise.resolve({ kind: 'requirements.result', value: claims.shift() ?? null });
        case 'requirements.run.started': return Promise.resolve({ kind: 'requirements.result', value: { ok: true }, changed: { generation: 3, affected: [c.id] } });
        case 'requirements.run.abandon': return Promise.resolve({ kind: 'requirements.result', value: { released: true }, changed: { generation: 3, affected: [c.id] } });
        case 'requirements.run.ended': return Promise.resolve({ kind: 'requirements.result', value: { settled: true, id: 'REQ-101', unit: 'u1', to: 'review' }, changed: { generation: 4, affected: ['REQ-101'] } });
        case 'requirements.run.waiting': return Promise.resolve({ kind: 'requirements.result', value: { noted: true }, changed: { generation: 5, affected: ['REQ-101'] } });
        case 'requirements.run.reap': return Promise.resolve({ kind: 'requirements.result', value: [], changed: { generation: 6, affected: null } });
        default: return Promise.resolve({ kind: 'requirements.result', value: null });
      }
    },
    runHost: {
      request: (req) => { hostSent.push(req); if (req.kind === 'session.start') return Promise.resolve(opts.startReply ?? { kind: 'session.started', sessionId: req.sessionId ?? 'minted' }); return Promise.resolve({ kind: 'ack' }); },
      onEvent: (fn) => { onEvent = fn; return () => undefined; },
    },
    onRunHostExit: (fn) => { onExit = fn; },
    preferences: { read: (k) => (k === 'requirements/fullPermissionRuns' ? prefs.runs : prefs.suppressed), write: async (k, v) => { written.push([k, v]); if (k === 'requirements/fullPermissionNoticeSuppressed') prefs.suppressed = v; } },
    mintSessionId: () => 'sess-1',
    broadcast: (p) => { broadcasts.push(p); },
    log: () => undefined,
  });
  return { runs, sent, roots, hostSent, broadcasts, written, event: (e: ProcessEvent) => onEvent(e), exit: (code: number) => onExit(code) };
}
const CLAIM: RunClaim = { id: 'REQ-101', unit: 'u1', worktree: { ref: 'REQ-101/u1', path: 'C:\\ws\\.rotaris\\requirements\\worktrees\\rotaris-req-req-101-u1', branch: 'rotaris/req/req-101/u1', baseBranch: 'main', baseRevision: 'abc' }, prompt: 'Implement REQ-101', permissions: 'permissive' };

describe('the launch preview (REQ-TRACE-472/473/474, 467/468)', () => {
  it('is due by default, suppressed after a permanent acceptance, off when the elevation is switched off, silent where the workspace is unattended', async () => {
    const h = harness();
    const due = await h.runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' });
    expect(due).toMatchObject({ ok: true, value: { disclosure: 'due', permissions: 'permissive', approvalWait: { seconds: 0, unlimited: true }, branch: 'rotaris/req/req-101/u1' } });
    await h.runs.handle({ kind: 'requirements.runs', op: 'suppress', suppressed: true });
    expect(h.written).toEqual([['requirements/fullPermissionNoticeSuppressed', true]]);
    expect(await h.runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' })).toMatchObject({ ok: true, value: { disclosure: 'suppressed', permissions: 'permissive' } });
    expect(await harness({ prefs: { runs: false } }).runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' })).toMatchObject({ ok: true, value: { disclosure: 'off', permissions: 'workspace' } });
    expect(await harness({ preview: { workspaceUnattended: true } }).runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' })).toMatchObject({ ok: true, value: { disclosure: 'unattended', permissions: 'workspace' } });
    expect(approvalWaitOf(300)).toEqual({ seconds: 300, unlimited: false });
  });
});

describe('the dispatch (REQ-TRACE-464/470/471/463)', () => {
  it('REQ-TRACE-472: every command to the service carries the standing disclosure the two preferences make — due, suppressed after a permanent acceptance, off with the elevation switched off', async () => {
    const claimOf = (h: ReturnType<typeof harness>) => h.sent.find((r) => r.kind === 'requirements.command' && r.command.name === 'requirements.run.claim');
    const due = harness();
    await due.runs.dispatch();
    expect(claimOf(due)).toMatchObject({ command: { name: 'requirements.run.claim' }, disclosure: 'due' });
    const suppressed = harness({ prefs: { suppressed: true } });
    await suppressed.runs.dispatch();
    expect(claimOf(suppressed)).toMatchObject({ disclosure: 'suppressed' });
    const off = harness({ prefs: { runs: false, suppressed: true } });
    await off.runs.dispatch();
    expect(claimOf(off)).toMatchObject({ disclosure: 'off' });
    expect(off.runs.standingDisclosure()).toBe('off');
    await off.runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' });
    expect(off.sent.every((r) => r.kind === 'requirements.command' && r.disclosure === 'off')).toBe(true);
  });
  it('REQ-TRACE-472/478: a permanent acceptance tells the service at once, so the queue it publishes stops asking for the disclosure', async () => {
    const h = harness();
    await h.runs.handle({ kind: 'requirements.runs', op: 'suppress', suppressed: true });
    expect(h.sent).toEqual([{ kind: 'requirements.command', workspaceRoot: 'C:\\ws', command: { name: 'requirements.board', workspace: 'C:\\ws' }, actor: { kind: 'system' }, disclosure: 'suppressed' }]);
  });
  it('claims, carries the grant on one start, then records the session id', async () => {
    const h = harness({ claims: [CLAIM] });
    const report = await h.runs.dispatch();
    expect(report).toEqual({ started: [{ id: 'REQ-101', unit: 'u1', sessionId: 'sess-1' }], abandoned: [] });
    expect(h.hostSent.map((r) => r.kind)).toEqual(['session.start']);
    expect(h.hostSent[0]).toMatchObject({ kind: 'session.start', boardPermissions: 'permissive', workspaceId: 'ws-id', sessionId: 'sess-1', prompt: 'Implement REQ-101', effectiveRoot: CLAIM.worktree.path, worktree: { worktree_path: CLAIM.worktree.path, branch: 'rotaris/req/req-101/u1', base_branch: 'main', base_revision: 'abc', created_by_session: false } });
    const names = h.sent.map((r) => (r.kind === 'requirements.command' ? r.command.name : r.kind));
    expect(names).toEqual(['requirements.run.claim', 'requirements.run.started', 'requirements.run.claim']);
    expect(h.sent[1]).toMatchObject({ command: { name: 'requirements.run.started', id: 'REQ-101', unit: 'u1', sessionId: 'sess-1', permissions: 'permissive' } });
    expect(h.broadcasts).toHaveLength(1);
    expect(h.runs.live()).toEqual([{ sessionId: 'sess-1', id: 'REQ-101', unit: 'u1', waitingOnPerson: false, permissions: 'permissive' }]);
  });
  it('a workspace-permission claim never touches the live state (REQ-TRACE-471)', async () => {
    const h = harness({ claims: [{ ...CLAIM, permissions: 'workspace' }] });
    await h.runs.dispatch();
    expect(h.hostSent.map((r) => r.kind)).toEqual(['session.start']);
    expect(h.hostSent[0]).not.toHaveProperty('boardPermissions');
  });
  it('a refused start records the run host\'s reason and abandons the launch', async () => {
    const h = harness({ claims: [CLAIM], startReply: { kind: 'refused', code: 'session.no-model', headline: 'No model configured', detail: 'Choose a model in Settings before starting a run.' } });
    const report = await h.runs.dispatch();
    expect(report).toEqual({ started: [], abandoned: [{ id: 'REQ-101', unit: 'u1', reason: 'No model configured: Choose a model in Settings before starting a run.' }] });
    expect(h.hostSent.map((r) => r.kind)).toEqual(['session.start']);
    expect(h.sent.map((r) => (r.kind === 'requirements.command' ? r.command.name : r.kind))).toEqual(['requirements.run.claim', 'requirements.run.abandon', 'requirements.run.claim']);
    expect(h.runs.live()).toEqual([]);
  });
  /**
   * Defect note `an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md` (REQ-TRACE-476/482):
   * nothing dispatched when a workspace opened, so after a relaunch an automatic queue started nothing until a person
   * acted. Main's post-open slot now kicks the coordinator once per open, for the workspace just opened.
   */
  it('REQ-TRACE-476/482: a workspace open with a claimable candidate starts it, with no command from a renderer', async () => {
    const h = harness({ claims: [CLAIM] });
    const report = await h.runs.opened('C:\\ws', 'ws-id');
    expect(report).toEqual({ started: [{ id: 'REQ-101', unit: 'u1', sessionId: 'sess-1' }], abandoned: [] });
    expect(h.hostSent.filter((r) => r.kind === 'session.start')).toHaveLength(1);
    expect(h.sent.map((r) => (r.kind === 'requirements.command' ? r.command.name : r.kind))).toEqual(['requirements.run.claim', 'requirements.run.started', 'requirements.run.claim']);
  });
  it('REQ-TRACE-482/408: a workspace open with nothing claimable starts nothing and asks the service for one claim alone', async () => {
    const h = harness();
    expect(await h.runs.opened('C:\\ws', 'ws-id')).toEqual({ started: [], abandoned: [] });
    expect(h.hostSent).toEqual([]);
    expect(h.sent.map((r) => (r.kind === 'requirements.command' ? r.command.name : r.kind))).toEqual(['requirements.run.claim']);
  });
  it('REQ-TRACE-476: the open\'s dispatch is for the workspace just opened, whichever window holds the focus', async () => {
    const h = harness({ claims: [CLAIM], current: { root: 'D:\\other', id: 'other-id' } });
    await h.runs.opened('C:\\ws', 'ws-id');
    expect(new Set(h.roots)).toEqual(new Set(['C:\\ws']));
    expect(h.hostSent.find((r) => r.kind === 'session.start')).toMatchObject({ workspaceId: 'ws-id' });
  });
  it('two kicks at once share one dispatch, so a claim is never started twice', async () => {
    const h = harness({ claims: [CLAIM] });
    const [a, b] = await Promise.all([h.runs.dispatch(), h.runs.dispatch()]);
    expect(a).toBe(b);
    expect(h.hostSent.filter((r) => r.kind === 'session.start')).toHaveLength(1);
  });
});

describe('the run\'s lifetime (REQ-TRACE-466/476/477)', () => {
  const result = (execution_status: string, summary = 'Done.', error: string | null = null, sessionId = 'sess-1'): ProcessEvent => ({ kind: 'run.result', sessionId, result: { status: 'ok', session_id: sessionId, stop_reason: 'completed', summary, iterations_completed: 1, tokens: { input: 1, output: 1, total: 2 }, cost: { total: '0' }, error, execution_status, severity: 'information' } });
  it('the run host\'s terminal result settles the row with the classified outcome and the next candidate follows', async () => {
    const h = harness({ claims: [CLAIM] });
    await h.runs.dispatch();
    h.event(result('completed'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const names = h.sent.map((r) => (r.kind === 'requirements.command' ? r.command.name : r.kind));
    expect(names.slice(3)).toEqual(['requirements.run.ended', 'requirements.run.claim']);
    expect(h.sent[3]).toMatchObject({ command: { name: 'requirements.run.ended', sessionId: 'sess-1', outcome: 'completed', detail: 'Done.' } });
    expect(h.runs.live()).toEqual([]);
    expect(outcomeOf('stopped')).toBe('cancelled');
    expect(outcomeOf('failed')).toBe('failed');
    expect(outcomeOf('interrupted')).toBe('failed');
  });
  it('a result for a session this coordinator does not own is ignored', async () => {
    const h = harness();
    h.event(result('completed', 'Done.', null, 'someone-else'));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.sent).toEqual([]);
  });
  it('a snapshot with a pending approval or question marks the run as waiting on a person, once per flip', async () => {
    const h = harness({ claims: [CLAIM] });
    await h.runs.dispatch();
    const snapshot = (approvals: number): ProcessEvent => ({ kind: 'publish.snapshot', payload: { v: 1, sessionId: 'sess-1', seq: 1, session: { pendingApprovals: Array.from({ length: approvals }, (_, i) => ({ request_id: `r${i}` })), pendingQuestions: [] } as never } });
    h.event(snapshot(1)); h.event(snapshot(1)); h.event(snapshot(0));
    await new Promise((r) => setTimeout(r, 0));
    const waits = h.sent.filter((r) => r.kind === 'requirements.command' && r.command.name === 'requirements.run.waiting').map((r) => (r as { command: { waiting: boolean } }).command.waiting);
    expect(waits).toEqual([true, false]);
  });
  it('the run host\'s exit reaps with an empty live set and forgets every board run', async () => {
    const h = harness({ claims: [CLAIM] });
    await h.runs.dispatch();
    h.exit(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.sent[h.sent.length - 1]).toMatchObject({ command: { name: 'requirements.run.reap', live: [] } });
    expect(h.runs.live()).toEqual([]);
  });
  it('closing the application ends every board run it owns as the quit (REQ-TRACE-464; PD-ORCH-005 clauses 3 and 15)', async () => {
    const h = harness({ claims: [CLAIM] });
    await h.runs.dispatch();
    await h.runs.quitAll('the window closed');
    // The quit, never the stop control's `cancel`: a stop request keeps its first reason, so a `cancel` sent ahead of the
    // run host's `shutdown` would rest the run by `stop` (docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md).
    expect(h.hostSent[h.hostSent.length - 1]).toEqual({ kind: 'session.control', request: { op: 'announceShutdown', sessionId: 'sess-1', args: {} } });
    expect(h.hostSent.some((r) => r.kind === 'session.control' && r.request.op === 'cancel')).toBe(false);
  });
  it('an unlimited approval wait is released by the quit, not by the budget (REQ-TRACE-469)', async () => {
    // `approvalTimeoutSeconds: 0` is REQ-TRACE-467/468's unlimited wait, and the run is blocked on a person when the quit arrives.
    const h = harness({ claims: [CLAIM], preview: { approvalTimeoutSeconds: 0 } });
    expect(await h.runs.handle({ kind: 'requirements.runs', op: 'preview', id: 'REQ-101', action: 'release' })).toMatchObject({ ok: true, value: { approvalWait: { seconds: 0, unlimited: true } } });
    await h.runs.dispatch();
    h.event({ kind: 'publish.snapshot', payload: { v: 1, sessionId: 'sess-1', seq: 1, session: { pendingApprovals: [{ request_id: 'r0' }], pendingQuestions: [] } as never } });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.runs.live()).toMatchObject([{ sessionId: 'sess-1', waitingOnPerson: true }]);
    // Nothing ever answers that approval: the quit goes out and returns on its own, rather than sitting out a budget with no end.
    const at = Date.now();
    await h.runs.quitAll('the last window closed');
    expect(Date.now() - at).toBeLessThan(5_000);
    expect(h.hostSent[h.hostSent.length - 1]).toEqual({ kind: 'session.control', request: { op: 'announceShutdown', sessionId: 'sess-1', args: {} } });
    expect(h.sent.some((r) => r.kind === 'requirements.command' && r.command.name === 'requirements.run.ended')).toBe(false);
  });
});
