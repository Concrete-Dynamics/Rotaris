import type { CommandOutcome, DispatchReport, LaunchPreview, LiveBoardRun, ProcessEvent, ProcessReply, ReqId, RequirementsChanged, RequirementsCommandPayload, RequirementsRunsCommand, RunClaim, RunLaunchPreview, RunOutcome, RunPermissions, RunHostRequest, WorkspaceServiceRequest, WorktreeBinding } from '@rotaris/contracts';
import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { millis, type Millis } from '@rotaris/kernel';

/**
 * Part AP — main's run coordinator for the board (spec 08 §Runs Started from the Board, §Delivery Queue; ADR-0041's
 * second execution; REQ-TRACE-463..477). It is the SYSTEM actor of the `requirements.run.*` family: it claims the
 * scheduler's next dispatch from the workspace service, starts the session through the run host's existing
 * `session.start` — the same coordinator that drives a session the user starts by hand (REQ-TRACE-464) — records the
 * session id onto the run row the moment the run host answers (the row is written in the service's one transaction,
 * ADR-0041), and settles the row from the run host's own terminal event (REQ-TRACE-477). It also owns the two desktop
 * preferences of the elevation (REQ-TRACE-472/473) and answers the renderer's `requirements.runs` command, which is how a
 * surface asks for a launch preview, kicks a dispatch after an act or a queue change, suppresses the disclosure
 * permanently, or lists the board runs this process owns (REQ-TRACE-475).
 *
 * REQ-TRACE-470/471: the authorized board grant travels on this run's session.start.
 * The run host applies both permission fields to its captured configuration.
 */
export interface RequirementsRunsDeps {
  /** The workspace this instance has open, canonical, or undefined; and its run-host id. */
  readonly currentWorkspace: () => string | undefined;
  readonly currentWorkspaceId: () => string | undefined;
  /** Sends to the workspace service of `workspaceRoot`; undefined when none is running. */
  readonly service: (workspaceRoot: string, req: WorkspaceServiceRequest, bound: Millis) => Promise<ProcessReply> | undefined;
  readonly runHost: { request(req: RunHostRequest, bound: Millis): Promise<ProcessReply>; onEvent(fn: (e: ProcessEvent) => void): () => void };
  /** The run host process's exit: every board run it held is gone, and the reap runs with an empty live set (REQ-TRACE-476, SR-2). */
  readonly onRunHostExit: (fn: (code: number) => void) => void;
  readonly preferences: { read(key: 'requirements/fullPermissionRuns' | 'requirements/fullPermissionNoticeSuppressed'): boolean; write(key: 'requirements/fullPermissionRuns' | 'requirements/fullPermissionNoticeSuppressed', value: boolean): Promise<void> };
  readonly mintSessionId: () => string;
  /** Channel 10 to every live window (persist before publish: the service committed before it answered `changed`). */
  readonly broadcast: (payload: RequirementsChanged & { readonly v: typeof CONTRACT_SCHEMA_VERSION }) => void;
  readonly log: (message: string) => void;
}
export interface RequirementsRuns {
  handle(command: RequirementsRunsCommand): Promise<CommandOutcome>;
  /** Claims and starts every dispatch the scheduler offers now; serialised, so two kicks never start one claim twice. */
  dispatch(): Promise<DispatchReport>;
  live(): readonly LiveBoardRun[];
  /**
   * REQ-TRACE-464: closing the application cancels the board's runs rather than orphaning them. Best effort, bounded.
   * REQ-TRACE-469: this same cancel is what releases an unlimited approval wait — see the note on the implementation.
   */
  cancelAll(reason: string): Promise<void>;
}

const BOUND_SERVICE = millis(60_000);
const BOUND_START = millis(30_000);
const BOUND_SHORT = millis(5_000);

/** REQ-TRACE-477: the run host's terminal `execution_status`, classified for the row. */
export function outcomeOf(executionStatus: string): RunOutcome {
  if (executionStatus === 'completed') return 'completed';
  if (executionStatus === 'stopped' || executionStatus === 'cancelling') return 'cancelled';
  return 'failed';
}

/** REQ-TRACE-468: an unlimited wait is rendered as one, never as "0 seconds". */
export function approvalWaitOf(seconds: number): LaunchPreview['approvalWait'] {
  return { seconds, unlimited: seconds <= 0 };
}

export function createRequirementsRuns(deps: RequirementsRunsDeps): RequirementsRuns {
  interface Live { readonly id: ReqId; readonly unit: string; readonly permissions: RunPermissions; waiting: boolean }
  const runs = new Map<string, Live>();
  let dispatching: Promise<DispatchReport> | undefined;

  const ask = async (root: string, command: RequirementsCommandPayload, bound: Millis = BOUND_SERVICE): Promise<{ readonly value: unknown; readonly changed?: { readonly generation: number; readonly affected: readonly ReqId[] | null } } | { readonly refused: string }> => {
    const pending = deps.service(root, { kind: 'requirements.command', workspaceRoot: root, command: { ...command, workspace: root }, actor: { kind: 'system' } }, bound);
    if (pending === undefined) return { refused: 'The workspace service is not running' };
    let r: ProcessReply;
    try { r = await pending; } catch (e) { return { refused: e instanceof Error ? e.message : String(e) }; }
    if (r.kind !== 'requirements.result') return { refused: r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}` };
    if (r.changed !== undefined) {
      deps.broadcast({ v: CONTRACT_SCHEMA_VERSION, workspace: root, generation: r.changed.generation, affected: r.changed.affected });
      deps.log(`requirements: generation ${r.changed.generation} (${r.changed.affected === null ? 'whole board' : r.changed.affected.join(', ')}) after ${command.name} by the run coordinator`);
    }
    return { value: r.value, ...(r.changed === undefined ? {} : { changed: r.changed }) };
  };

  const preview = async (root: string, id: ReqId, action: RunLaunchPreview['action']): Promise<CommandOutcome> => {
    const a = await ask(root, { name: 'requirements.run.preview', workspace: root, id, action });
    if ('refused' in a) return { ok: false, code: 'requirements.preview', headline: 'The launch could not be previewed', detail: a.refused };
    const facts = a.value as RunLaunchPreview | { ok: false; error: { reason: string } };
    if ('ok' in facts && facts.ok === false) return { ok: false, code: 'requirements.preview', headline: 'The launch could not be previewed', detail: facts.error.reason };
    const f = facts as RunLaunchPreview;
    // REQ-TRACE-472/473/474: on by default; suppressed permanently by acceptance; off in settings; silent where the workspace already opted in.
    const elevationOn = deps.preferences.read('requirements/fullPermissionRuns');
    const suppressed = deps.preferences.read('requirements/fullPermissionNoticeSuppressed');
    const disclosure: LaunchPreview['disclosure'] = !elevationOn ? 'off' : f.workspaceUnattended ? 'unattended' : suppressed ? 'suppressed' : 'due';
    const permissions: RunPermissions = elevationOn && !f.workspaceUnattended ? 'permissive' : 'workspace';
    const value: LaunchPreview = { ...f, disclosure, permissions, approvalWait: approvalWaitOf(f.approvalTimeoutSeconds) };
    return { ok: true, value };
  };

  /** One claim → one `session.start`; the row is written the moment the run host answers, or the launch is abandoned with the reason (REQ-TRACE-463). */
  const startOne = async (workspaceId: string, claim: RunClaim): Promise<{ readonly started: true; readonly sessionId: string } | { readonly started: false; readonly reason: string }> => {
    const sessionId = deps.mintSessionId();
    const binding: WorktreeBinding = { worktree_path: claim.worktree.path, branch: claim.worktree.branch, base_branch: claim.worktree.baseBranch, base_revision: claim.worktree.baseRevision, created_by_session: false, merge_status: 'ready', integration_session_id: null };
    const elevate = claim.permissions === 'permissive';
    try {
      const r = await deps.runHost.request({ kind: 'session.start', workspaceId, prompt: claim.prompt, sessionId, effectiveRoot: claim.worktree.path, worktree: binding, ...(elevate ? { boardPermissions: 'permissive' as const } : {}) }, BOUND_START);
      if (r.kind !== 'session.started') return { started: false, reason: r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}` };
      if (r.sessionId !== sessionId) deps.log(`requirements: the run host minted ${r.sessionId} for the start that named ${sessionId}; the row carries the host's id`);
      return { started: true, sessionId: r.sessionId };
    } catch (e) {
      return { started: false, reason: e instanceof Error ? e.message : String(e) };
    }
  };

  const dispatch = (): Promise<DispatchReport> => {
    if (dispatching) return dispatching;
    dispatching = (async (): Promise<DispatchReport> => {
      const started: { id: ReqId; unit: string; sessionId: string }[] = [];
      const abandoned: { id: ReqId; unit: string; reason: string }[] = [];
      const root = deps.currentWorkspace();
      const workspaceId = deps.currentWorkspaceId();
      if (root === undefined || workspaceId === undefined) return { started, abandoned };
      // Bounded by the scheduler: a claim comes back only while a slot is free and a disclosed launch is next (REQ-TRACE-478/481/483).
      for (let guard = 0; guard < 64; guard += 1) {
        const c = await ask(root, { name: 'requirements.run.claim', workspace: root });
        if ('refused' in c) { deps.log(`requirements: no claim (${c.refused})`); break; }
        const claim = c.value as RunClaim | null;
        if (claim === null) break;
        const s = await startOne(workspaceId, claim);
        if (s.started) {
          runs.set(s.sessionId, { id: claim.id, unit: claim.unit, permissions: claim.permissions, waiting: false });
          // REQ-TRACE-464: the session id onto the run row while the run executes, in the service's one transaction.
          const rec = await ask(root, { name: 'requirements.run.started', workspace: root, id: claim.id, unit: claim.unit, sessionId: s.sessionId, permissions: claim.permissions });
          if ('refused' in rec) deps.log(`requirements: ${claim.id} unit ${claim.unit} started as ${s.sessionId} but the row was not written (${rec.refused})`);
          deps.log(`requirements: ${claim.id} unit ${claim.unit} started as session ${s.sessionId} in ${claim.worktree.path} with ${claim.permissions} permissions`);
          started.push({ id: claim.id, unit: claim.unit, sessionId: s.sessionId });
        } else {
          await ask(root, { name: 'requirements.run.abandon', workspace: root, id: claim.id, unit: claim.unit, reason: s.reason });
          deps.log(`requirements: the start of ${claim.id} unit ${claim.unit} did not begin: ${s.reason}`);
          abandoned.push({ id: claim.id, unit: claim.unit, reason: s.reason });
        }
      }
      return { started, abandoned };
    })().finally(() => { dispatching = undefined; });
    return dispatching;
  };

  // REQ-TRACE-477: a flow that terminates on its worker delivers its ending to the surface that was told it began; the next candidate follows under the scheduler.
  deps.runHost.onEvent((e) => {
    if (e.kind === 'run.result') {
      const live = runs.get(e.sessionId);
      if (live === undefined) return;
      runs.delete(e.sessionId);
      const root = deps.currentWorkspace();
      if (root === undefined) return;
      const outcome = outcomeOf(e.result.execution_status);
      const detail = `${e.result.summary}${e.result.error ? ` — ${e.result.error}` : ''}`.trim() || `the run ended ${e.result.execution_status}`;
      void ask(root, { name: 'requirements.run.ended', workspace: root, sessionId: e.sessionId, outcome, detail }).then(() => dispatch()).catch((x: unknown) => deps.log(`requirements: the ending of ${e.sessionId} was not recorded (${String(x)})`));
    } else if (e.kind === 'publish.snapshot') {
      // REQ-TRACE-466: waiting on a person = a pending approval or question on the live run; the fact rides the run row's stage.
      const live = runs.get(e.payload.sessionId);
      if (live === undefined) return;
      const waiting = e.payload.session.pendingApprovals.length > 0 || e.payload.session.pendingQuestions.length > 0;
      if (waiting === live.waiting) return;
      live.waiting = waiting;
      const root = deps.currentWorkspace();
      if (root === undefined) return;
      void ask(root, { name: 'requirements.run.waiting', workspace: root, sessionId: e.payload.sessionId, waiting }, BOUND_SHORT).catch(() => undefined);
    }
  });
  // REQ-TRACE-476 under SR-2: a run host that exited owned every board run; nothing is alive, and the reap settles the rows as interrupted with their work retained.
  deps.onRunHostExit((code) => {
    const root = deps.currentWorkspace();
    const held = [...runs.keys()];
    runs.clear();
    if (root === undefined) return;
    deps.log(`requirements: the run host exited (${code}) holding ${held.length} board run(s); reaping with an empty live set`);
    void ask(root, { name: 'requirements.run.reap', workspace: root, live: [] }).catch((x: unknown) => deps.log(`requirements: the reap after the run host's exit failed (${String(x)})`));
  });

  return {
    async handle(command) {
      const root = deps.currentWorkspace();
      if (root === undefined) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting its requirements' };
      switch (command.op) {
        case 'preview': {
          if (command.id === undefined || command.action === undefined) return { ok: false, code: 'requirements.preview', headline: 'A launch preview names the requirement and the action' };
          return preview(root, command.id, command.action);
        }
        case 'dispatch':
          return { ok: true, value: await dispatch() };
        case 'suppress': {
          // REQ-TRACE-472: accepting permanently suppresses the disclosure in subsequent launches; settings can switch the behaviour off (`fullPermissionRuns`).
          await deps.preferences.write('requirements/fullPermissionNoticeSuppressed', command.suppressed ?? true);
          return { ok: true, value: { suppressed: command.suppressed ?? true } };
        }
        case 'live':
          return { ok: true, value: [...runs.entries()].map(([sessionId, l]) => ({ sessionId, id: l.id, unit: l.unit, waitingOnPerson: l.waiting, permissions: l.permissions }) satisfies LiveBoardRun) };
      }
    },
    dispatch,
    live: () => [...runs.entries()].map(([sessionId, l]) => ({ sessionId, id: l.id, unit: l.unit, waitingOnPerson: l.waiting, permissions: l.permissions })),
    /**
     * REQ-TRACE-464 (closing the application) and REQ-TRACE-469 (an unlimited wait stays cancellable). The stop is the
     * run host's existing `session.control {op: 'cancel'}`, one per board run this process owns, issued at once and
     * bounded; it is never gated on what the run is doing, so a run blocked on an approval with no limit
     * (`runtime.approval_timeout_seconds` = 0, REQ-TRACE-467/468) is stopped without sitting out a budget that has no
     * end. The release itself is the engine's: `run.stop`'s FIRST act is to cancel whatever is blocked on a person
     * (REQ-MONITOR-012, `packages/engine/src/run/run.ts`), and every waiter then finishes `cancelled` whatever its
     * deadline (`approvals.cancelAll`) — REQ-TOOLS-055's "only an answer or a cancellation releases the wait", which is
     * measured in `packages/agent-tools/src/gate.test.ts`. What this branch measures is the coordinator's half
     * (`requirements-runs.test.ts`); what it does NOT offer is the button a person presses, which is REQ-TRACE-465's
     * stop control on a board this branch does not host — stated as not built in the ADR note and the handoff.
     */
    async cancelAll(reason) {
      const ids = [...runs.keys()];
      if (ids.length === 0) return;
      deps.log(`requirements: cancelling ${ids.length} board run(s): ${reason}`);
      await Promise.all(ids.map((sessionId) => deps.runHost.request({ kind: 'session.control', request: { op: 'cancel', sessionId, args: {} } }, BOUND_SHORT).catch(() => undefined)));
    },
  };
}
