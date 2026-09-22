import { SKILLS_DISABLED_MESSAGE, type ImprovementArtifactRecord, type ProcessReply, type RunHostRequest } from '@rotaris/contracts';
import { asSessionId, millis, toIsoUtc, type WorkspaceId } from '@rotaris/kernel';
import { openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { analyzeImprovement, captureRetrospectiveJob, CATALOGUE, relativeTime, timelineId } from '@rotaris/engine';
import { renderUnavailability } from '@rotaris/agent-tools';
import { clearHooksDecision, decideHooks, hooksSummaryFor, setHookToggle } from './hooks.js';
import { REFS_ASK_BOUND } from './checkpoints.js';
import type { McpHost } from './mcp.js';
import { deleteSession, exportRecords, exportTrajectories, repairSessions, sessionFiles } from './session-actions.js';
import { CHECKPOINTS_DEFAULTS, type LiveState } from '@rotaris/config';
import { improvementCollectorOf, retrospectiveOf } from './configuration.js';
import { launchSession } from './launch.js';
import { randomUUID } from 'node:crypto';
// The step-driven stand-in every proof runs against (`scripted-client.ts`); no provider, no key, no network.

/**
 * RUN HOST — one utilityProcess, forked after `app.ready`, living exactly as
 * long as the application (ADR-0002 #2). It holds every session lock this
 * application takes, and therefore everything that writes a session: the
 * session writers, the projection owners they feed, and the runs
 * (ADR-0008, ADR-0013, ADR-0043).
 *
 * It is HANDED a resolved store path and never reads the identifier file
 * (W-18). A publication leaves here already stamped; main relays it.
 *
 * ADR-0058 step 3b: the refusal of new runs is a lease this process expires
 * itself, so a workspace service that died releases the workspace by doing
 * nothing.
 *
 * WHERE THE MODEL AND THE RUNTIME COME FROM — the configuration files, loaded
 * per run start with the live state on top (ADR-0036/0037, `configuration.ts`).
 * `ROTARIS_MODEL_DIALECT=scripted` selects a built-in scripted client for every
 * model (verification only). A fatal file or an unreachable entry model refuses
 * the run before it starts (REQ-EVENTS-021, REQ-CONFIG-478).
 */
import { type RunHost } from './host.js';

/**
 * THE RUN HOST'S DISPATCH — one request in, one reply out, over everything `createRunHost` built.
 *
 * It answers `RunHostRequest` and nothing else, and it is total over that union by the same discipline main's
 * command table follows: a kind the contract declares and this file does not answer refuses rather than throwing,
 * because the reply is what the caller is waiting on.
 *
 * The host arrives as an argument rather than as a closure over module scope, which is the whole point: this file
 * can be imported without starting a run host, and a caller can hand it one that was built for a test.
 */
export async function dispatch(req: RunHostRequest, h: RunHost): Promise<ProcessReply> {
  const {
    clocks,
    lease,
    stores,
    ask,
    log,
    asState,
    presenters,
    presenter,
    hostEnv,
    configDir,
    configured,
    leased,
    sessionRoots,
    configuredRuns,
    runBearers,
    improvementContexts,
    improvementControllers,
    mcp,
    confinement,
    settleConfinement,
    configurationDeps,
    skills,
    configure,
    leaseReports,
    continuationLeaseForSession,
    leaseForWorkspace,
    configuredFor,
    sessions,
    sessionActions,
    terminalHost,
  } = h;
  switch (req.kind) {
    case 'hello':
      return { kind: 'hello', process: 'run-host', pid: process.pid };
    case 'ping':
      return { kind: 'pong' };
    case 'workspace.opened': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const db = openStore(req.storeFile);
      const dal = new StoreDal(db);
      stores.set(req.workspaceId, { file: req.storeFile, root: req.workspaceRoot, db, dal });
      const t = dal.totals();
      log(`opened ${req.storeFile} (${t.sessions} sessions, ${t.rows} rows)`);
      // REQ-WORKSPACE-058 (ADR-0063): "discovery runs automatically on workspace open with no user action".
      // Warmed off the reply so it cannot delay the open; a failure here is logged and costs nothing, because
      // the next ask discovers on a cold cache anyway.
      queueMicrotask(() => { try { skills.catalog(req.workspaceRoot); } catch (cause) { log(`skills: discovery on workspace open failed: ${String(cause)}`, 'warn'); } });
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    /*
     * ADR-0063 — portable skills. All four answer with the same `skills.state` shape, so no caller has to ask
     * again to redraw, and `loaded` names the skill for the toast. None persists anything: REQ-WORKSPACE-073
     * and REQ-WORKSPACE-151 both scope their effect to the session and leave `skills.overrides` exactly as it
     * was, which is why the row a surface draws keeps showing the PERSISTED policy.
     */
    case 'skills.read':
      return { kind: 'skills.state', state: skills.state(req.workspaceRoot, req.sessionId) };
    case 'skills.rescan': {
      // REQ-WORKSPACE-069: re-read from disk, re-project, change no policy, mark nothing dirty.
      const before = skills.state(req.workspaceRoot, req.sessionId).skills.length;
      skills.rescan(req.workspaceRoot);
      const state = skills.state(req.workspaceRoot, req.sessionId);
      log(`skills: rescanned ${req.workspaceRoot} — ${before} → ${state.skills.length}`);
      return { kind: 'skills.state', state };
    }
    case 'skills.forceLoad': {
      const r = skills.forceLoad(req.workspaceRoot, req.sessionId, req.name);
      if (!r.ok) return { kind: 'refused', code: r.reason === 'disabled' ? 'skills.disabled' : 'skills.unknown', headline: r.reason === 'disabled' ? SKILLS_DISABLED_MESSAGE : r.reason };
      return { kind: 'skills.state', state: skills.state(req.workspaceRoot, req.sessionId), loaded: r.name };
    }
    case 'skills.loadFile': {
      const r = skills.loadFile(req.workspaceRoot, req.sessionId, req.path);
      // REQ-WORKSPACE-151: a failure is reported with the reason REQ-WORKSPACE-057 gives and leaves the catalog unchanged.
      if (!r.ok) return { kind: 'refused', code: 'skills.load-failed', headline: r.reason };
      return { kind: 'skills.state', state: skills.state(req.workspaceRoot, req.sessionId), loaded: r.name };
    }
    case 'workspace.refuseRuns':
      lease.refuse(req.workspaceId as WorkspaceId, millis(req.leaseMs));
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    case 'workspace.renewLease':
      lease.renew(req.workspaceId as WorkspaceId, millis(req.leaseMs));
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    case 'workspace.closeStore': {
      const s = stores.get(req.workspaceId);
      if (s?.db) { s.db.close(); forgetSpelling(s.file); s.db = null; s.dal = null; }
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.release': {
      lease.release(req.workspaceId as WorkspaceId);
      const s = stores.get(req.workspaceId);
      if (s && !s.db) { s.db = openStore(s.file); s.dal = new StoreDal(s.db); }
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.closing': {
      const s = stores.get(req.workspaceId);
      if (s) for (const [artifactId, context] of improvementContexts) {
        if (context.run.cfg.workspaceRoot !== s.root) continue;
        improvementControllers.get(artifactId)?.abort();
        improvementControllers.delete(artifactId);
        improvementContexts.delete(artifactId);
      }
      if (s?.db) { s.db.close(); forgetSpelling(s.file); }
      stores.delete(req.workspaceId);
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'circuit_breaker.status': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      return { kind: 'circuit_breaker.status', enabled: (run?.cfg.circuitBreaker.enabled ?? false) && process.env['ROTARIS_CIRCUIT_BREAKER'] !== 'off' };
    }
    case 'config.liveState': {
      // ADR-0037 Tier B: main hands over the settings store's current values; the next run start reads them.
      h.liveState = req.state as LiveState;
      return { kind: 'ack' };
    }
    case 'session.list': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return { kind: 'session.list', sessions: sessions.list(s.dal, s.root) };
    }
    case 'session.resume': {
      // REQ-MONITOR-249/252/258: multi-session host — loading/focusing another session stays available
      // while a run is active. Only the target session itself is guarded, inside Sessions.resume
      // (already-live → run-active, lock held elsewhere → lock-held); a blanket activeRunCount gate
      // here would forbid every focus switch and every 2nd concurrent start.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      sessionRoots.set(req.sessionId, s.root);
      const resumed = sessions.resume(s.dal, s.root, asSessionId(req.sessionId));
      if (!resumed.ok) return { kind: 'refused', code: `session.${resumed.error.code}`, headline: 'The session could not be loaded', detail: resumed.error.reason };
      return { kind: 'session.resumed', sessionId: resumed.value.sessionId, settledChildren: resumed.value.settledChildren };
    }
    case 'session.start': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return launchSession(req, {
        workspaceRoot: s.root, attended: presenters.attended, configuration: configurationDeps, settleConfinement,
        leaseCredentials: async (providers) => {
          const answer = await ask({ kind: 'credentials.lease', providerIds: [...providers] }, millis(5_000)).catch((e: Error) => { log(`credentials: main did not answer the lease (${e.message})`, 'warn'); return null; });
          const bearers = answer?.kind === 'credentials.leased' ? answer.bearers : {};
          // REQ-PROVIDER-068's opening report, said once per workspace root and then only when it changes.
          leaseReports.report(s.root, answer?.kind === 'credentials.leased' ? answer.report : null, (m) => log(m));
          return bearers;
        },
        start: (setup, bearers) => {
          // Publish the setup only when its credential lease has settled. Deferred run ports use the session key.
          const sessionId = req.sessionId ?? randomUUID();
          sessionRoots.set(sessionId, s.root);
          const previousSetup = configuredRuns.get(sessionId);
          const previousBearers = runBearers.get(sessionId);
          const restore = () => {
            if (previousSetup) configuredRuns.set(sessionId, previousSetup); else configuredRuns.delete(sessionId);
            if (previousBearers) runBearers.set(sessionId, previousBearers); else runBearers.delete(sessionId);
          };
          configuredRuns.set(sessionId, setup);
          runBearers.set(sessionId, bearers);
          configured.set(s.root, setup);
          leased.set(s.root, bearers);
          /*
           * REQ-WORKSPACE-058 (ADR-0063): **session creation** clears the catalog cache, so skills are
           * re-discovered from disk at each new session, and adopts any gesture the user made before this
           * session existed (OQ-58's pending bucket). It sits HERE and not in `configure`, which also runs for
           * every continuation: a continuation is a further run of an existing session, not a new one, and
           * clearing the cache there would re-read the tree on every prompt for no rule that asks for it.
           */
          skills.onSessionCreated(s.root, sessionId);
          mcp.newConfiguration(setup.cfg);
          void mcp.prepare(setup.cfg, s.root).catch((e: unknown) => log(`mcp: discovery ahead of the run failed: ${String(e)}`, 'warn'));
          if (req.effectiveRoot !== undefined && req.effectiveRoot !== s.root) log(`session ${sessionId} is isolated: the run works in ${req.effectiveRoot}${req.worktree ? ` on branch ${req.worktree.branch}` : ''}; the record stays under ${s.root}`);
          try {
            // REQ-WORKSPACE-060 (ADR-0063): the session's context units reach the launch as a getter, read at every
            // agent construction. REQ-WORKSPACE-050: the catalog from the BASE workspace, the context files from the
            // root the run EXECUTES in — the worktree's own `AGENTS.md` where the branch changed it.
            const executionRoot = req.worktree?.worktree_path ?? req.effectiveRoot ?? s.root;
            const r = sessions.start(s.dal!, s.root, req.prompt, { setup: { ...setup, contextUnits: () => skills.contextUnits(s.root, sessionId, executionRoot) }, sessionId, runType: req.runType ?? 'task_run', ...(req.worktree === undefined ? {} : { worktree: req.worktree }), ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }), ...(req.attachments === undefined ? {} : { attachments: req.attachments }), ...(req.initialTodo === undefined ? {} : { initialTodo: req.initialTodo }) });
            if (r.ok) log(`session ${r.value} started; row 0 recorded; the run is executing`);
            else restore();
            return r;
          } catch (cause) {
            restore();
            throw cause;
          }
        },
      });
    }
    /**
     * PD-LIBRARY-002 (ADR-0065 decision 5): the pass a person started. It has no run to inherit a model, a
     * credential or a store handle from, so it resolves each by the run-free paths this host already owns —
     * `configuredFor` for the configuration, `leaseForWorkspace` for the bearers — and captures against the
     * store main already opened for the workspace. Nothing is written here: the job goes back to main, which
     * enqueues it on the one coordinator both passes share.
     */
    case 'retrospective.capture': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const setup = configuredFor(s.root);
      if (setup === null) return { kind: 'refused', code: 'retrospective.no-configuration', headline: 'The workspace configuration could not be loaded' };
      const collector = retrospectiveOf(setup.cfg, setup.scripted);
      if (collector === null) return { kind: 'refused', code: 'retrospective.no-model', headline: 'No retrospective analyst is configured' };
      const leaseRefusal = await leaseForWorkspace(s.root);
      if (leaseRefusal) return leaseRefusal;
      // REQ-LIBRARY-019/030: the prior proposals are evidence, and a history that could not be read is a source
      // reported unavailable rather than one silently missing.
      const historyReply = await ask({ kind: 'improvements.command', workspaceRoot: s.root, command: { action: 'list' } }, millis(10_000)).catch((cause: Error) => {
        log(`retrospective: the proposal history could not be read (${cause.message})`, 'warn');
        return null;
      });
      const prior = historyReply?.kind === 'improvements.result' ? (historyReply.value as ImprovementArtifactRecord[]).map((record) => record.artifact) : [];
      const job = captureRetrospectiveJob(s.dal, {
        workspaceId: req.workspaceId, workspaceRoot: s.root, generatedAt: toIsoUtc(clocks.wall.instant()),
        timeoutSeconds: setup.cfg.runtime.retrospective_timeout, collectorModel: collector.key,
        priorArtifactsAvailable: historyReply?.kind === 'improvements.result', priorArtifacts: prior,
        // PD-LIBRARY-002 pointed this read at REQ-WORKSPACE-041's discovery BY NAME, and `PD-WORKSPACE-002`
        // has since widened that rule and put a switch on every file. The run host owns the policy, so it
        // decides the set here and the engine reads what it is handed — one computation shared with the
        // injection, which is what the two readers had stopped being (OQ-65).
        instructionFiles: skills.instructionFiles(s.root, undefined, 'retrospective'),
      });
      if (job === null) return { kind: 'refused', code: 'retrospective.no-evidence', headline: 'This workspace has no history to look back over yet' };
      log(`retrospective: captured ${job.artifact_id} over ${job.considered_session_ids.length} session(s) for ${s.root}`);
      return { kind: 'retrospective.captured', job };
    }
    case 'improvement.analyze': {
      /*
       * Both passes analyse through one function (ADR-0065 decision 1). A post-run job carries the run that
       * captured it; a retrospective has none, so it resolves the workspace's configuration afresh — and its
       * model comes from its own slot, never the sibling's.
       */
      const context = improvementContexts.get(req.job.artifact_id);
      const run = context?.run ?? (req.job.pass === 'retrospective' ? configuredFor(req.job.workspace_root) : null);
      if (!run) return { kind: 'refused', code: 'improvement.expired', headline: 'The captured improvement job is no longer available' };
      const collector = req.job.pass === 'retrospective' ? retrospectiveOf(run.cfg, run.scripted) : improvementCollectorOf(run.cfg, run.scripted);
      if (collector === null) return { kind: 'refused', code: 'improvement.no-model', headline: 'No improvement analyst is configured' };
      const controller = new AbortController();
      improvementControllers.set(req.job.artifact_id, controller);
      try {
        const artifact = await analyzeImprovement(req.job, { backend: run.model.backend, model: collector.model, thinking: collector.thinking, timers: clocks.timers, credentialFor: run.model.config.credentialFor, warn: (message) => log(message, 'warn') }, controller.signal);
        return { kind: 'improvement.analyzed', artifact };
      } finally {
        improvementControllers.delete(req.job.artifact_id);
        improvementContexts.delete(req.job.artifact_id);
      }
    }
    case 'improvement.cancel': {
      improvementControllers.get(req.artifactId)?.abort();
      improvementControllers.delete(req.artifactId);
      improvementContexts.delete(req.artifactId);
      return { kind: 'ack' };
    }
    case 'session.continue': {
      // REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause or continue a paused session; nothing is appended.
      // REQ-PROVIDER-066 (the continuation lease): refresh the bearers before the run resolves its setup.
      const leaseRefusal = await continuationLeaseForSession(req.sessionId);
      if (leaseRefusal) return leaseRefusal;
      const r = sessions.continueSession(asSessionId(req.sessionId), req.action);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The session could not be continued', detail: r.error.reason };
      log(`session ${req.sessionId} ${req.action}: ${r.value.resumed ? 'a continuation run is executing' : 'left paused'}${r.value.messageLimit === null ? '' : ` (message limit ${r.value.messageLimit})`}`);
      return { kind: 'session.continued', sessionId: req.sessionId, resumed: r.value.resumed, messageLimit: r.value.messageLimit };
    }
    case 'session.planEdit': {
      // REQ-ORCH-154: the edit is recorded and nothing else moves — the gate stays held on the same cycle.
      const r = sessions.planEdit(asSessionId(req.sessionId), req.text);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The plan could not be edited', detail: r.error.reason };
      return { kind: 'ack' };
    }
    case 'session.planDecision': {
      // REQ-ORCH-153: the three answers, exactly; approve and revise launch the next segment, cancel launches nothing.
      // REQ-PROVIDER-066 (the continuation lease): an approve or revise launches a segment — refresh first.
      const leaseRefusal = await continuationLeaseForSession(req.sessionId);
      if (leaseRefusal) return leaseRefusal;
      const r = sessions.planDecision(asSessionId(req.sessionId), req.decision, req.changes ?? '');
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The plan decision could not be applied', detail: r.error.reason };
      log(`session ${req.sessionId} plan cycle ${r.value.cycle}: ${req.decision}${r.value.relaunched ? ' — a further segment is executing' : ' — the run came to rest'}`);
      return { kind: 'session.planResolved', sessionId: req.sessionId, cycle: r.value.cycle, relaunched: r.value.relaunched };
    }
    case 'session.planRearm': {
      // PD-ORCH-003: the release is dropped and nothing else moves. No run is launched and no gate opens here —
      // the next prompt in this session is the run the mode governs again.
      const r = sessions.planRearm(asSessionId(req.sessionId));
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The plan gate could not be re-armed', detail: r.error.reason };
      log(`session ${req.sessionId}: the plan gate is re-armed — the next run is held`);
      return { kind: 'ack' };
    }
    case 'session.prompt': {
      // REQ-PROVIDER-066 (the continuation lease): a prompt on a resumed session launches a run — refresh first.
      const leaseRefusal = await continuationLeaseForSession(req.sessionId);
      if (leaseRefusal) return leaseRefusal;
      const r = sessions.prompt(asSessionId(req.sessionId), req.prompt, req.attachments ?? []);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: r.error.code === 'run-active' ? r.error.reason : 'The prompt could not be recorded', detail: r.error.reason };
      return { kind: 'ack' };
    }
    case 'session.readAttachment': {
      const r = sessions.readAttachment(asSessionId(req.sessionId), req.path, req.digest);
      return r.ok ? { kind: 'session.attachment', base64: r.base64 } : { kind: 'refused', code: 'session.attachment-unavailable', headline: r.reason };
    }
    case 'session.control':
      // Part AO: `forceCompression` settles once every live conversation has (REQ-MONITOR-092), so the control is awaited.
      return { kind: 'control.result', result: await sessions.controlAsync(req.request) };
    // Part U — the session browser's actions (REQ-SESSION-182); `session-actions.ts` holds the mechanism.
    case 'session.repair': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return repairSessions(sessionActions, s.dal, s.root, req.sessionId);
    }
    case 'session.delete': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return deleteSession(sessionActions, s.dal, s.root, req.sessionId);
    }
    case 'session.export': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return exportRecords(sessionActions, s.dal, s.root, req.sessionId, req.destination);
    }
    case 'session.exportTrajectory': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return exportTrajectories(sessionActions, s.dal, s.root, req.sessionIds, req.destination);
    }
    case 'session.files': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return sessionFiles(sessionActions, s.dal, s.root, req.sessionId);
    }
    case 'timeline.append': {
      // Part V / REQ-NOTIFY-268: through the live writer where the session is live (its ordinal counter), else one transaction under the store.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const sid = asSessionId(req.sessionId);
      const live = sessions.writer(sid);
      if (live) {
        const r = live.appendTimeline(req.name, req.actor, req.message, req.metadata, req.severity ?? 'info');
        return r.ok ? { kind: 'timeline.appended', sessionId: req.sessionId, ordinal: r.value } : { kind: 'refused', code: `timeline.${r.error.code}`, headline: 'The timeline entry could not be written', detail: 'reason' in r.error ? r.error.reason : r.error.code };
      }
      const dal = s.dal;
      if (!dal.getSession(sid)) return { kind: 'refused', code: 'session.unknown', headline: 'No session with that id exists in this workspace' };
      try {
        const at = toIsoUtc(clocks.wall.instant());
        const ordinal = dal.transaction(() => { const o = dal.nextTimelineOrdinal(sid); dal.insertTimeline(sid, o, at, req.name, req.actor, req.message, JSON.stringify(req.metadata), timelineId(), req.severity ?? 'info'); return o; });
        return { kind: 'timeline.appended', sessionId: req.sessionId, ordinal };
      } catch (cause) {
        return { kind: 'refused', code: 'timeline.write', headline: 'The timeline entry could not be written', detail: String(cause) };
      }
    }
    // Part X — the saved prompts (REQ-LIBRARY-137/138/139). Session-less, like `session.list`: the run host owns the
    // workspace's store, and the two lists belong to the workspace rather than to any session. Every rule about an
    // entry is the DAL's; this case is the boundary and nothing else. A store failure comes back as a refusal, which
    // main turns into REQ-LIBRARY-138's persistent notice while the window keeps its lists in memory.
    case 'prompts.read':
    case 'prompts.push':
    case 'prompts.take': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const dal = s.dal;
      try {
        if (req.kind === 'prompts.read') return { kind: 'prompts.state', state: asState(dal.readPrompts()) };
        if (req.kind === 'prompts.push') return { kind: 'prompts.state', state: asState(dal.pushPrompt(req.list, req.text, toIsoUtc(clocks.wall.instant())).lists) };
        // REQ-LIBRARY-107: `remove` decides, and it is the caller's explicit choice — "Use" keeps, "Use and remove" pops.
        const text = req.remove ? dal.popPrompt(req.list, req.index) : dal.promptAt(req.list, req.index);
        return { kind: 'prompts.taken', text, state: asState(dal.readPrompts()) };
      } catch (cause) {
        return { kind: 'refused', code: 'prompts.write', headline: 'Could not save prompt history', detail: String(cause) };
      }
    }
    // Part Y — the Library's Artifacts tab (REQ-LIBRARY-108/131..136). The store and the session's files are this
    // process's (ADR-0002, ADR-0058); the tab reads the LOADED session and nothing else (REQ-LIBRARY-136).
    case 'artifacts.list': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const loaded = sessions.loadedSessionId();
      const store = loaded ? sessions.artifactsOf(loaded) : null;
      if (!loaded || !store) return { kind: 'artifacts.state', state: { sessionId: null, artifacts: [], warnings: [] } };
      const hydrated = store.hydrate();
      const now = clocks.wall.instant();
      return {
        kind: 'artifacts.state',
        state: {
          sessionId: loaded,
          // REQ-LIBRARY-136: superseded artifacts are hidden from the Library table.
          artifacts: hydrated.records.filter((r) => r.supersededBy === null).map((r) => ({
            id: r.id, slug: r.slug, title: r.title, kind: r.kind, status: r.status,
            persona: r.sourcePersona ?? '', producer: r.createdBy || r.canonicalName || '', summary: r.summary,
            createdAt: r.createdAt, createdLabel: relativeTime(r.createdAt, now), edited: r.editedAt !== null,
            tags: [...r.tags], importance: r.importance, supersededBy: r.supersededBy,
          })),
          warnings: [...hydrated.warnings],
        },
      };
    }
    case 'artifacts.body': {
      const loaded = sessions.loadedSessionId();
      const store = loaded ? sessions.artifactsOf(loaded) : null;
      // REQ-LIBRARY-136: opening an artifact from the Library requires it to belong to the loaded session.
      if (!store) return { kind: 'refused', code: 'artifacts.no-session', headline: 'Artifact not found in the loaded session.' };
      const record = store.lookup(req.ref);
      if (!record) return { kind: 'refused', code: 'artifacts.unknown', headline: `Unknown artifact: '${req.ref}'` };
      const body = store.body(record.id);
      // REQ-LIBRARY-134: a load failure leaves the editor read-only with the stated message; the record stays listed.
      if (!body.ok) return { kind: 'refused', code: 'artifacts.body', headline: body.error.reason };
      return {
        kind: 'artifacts.body', id: record.id, slug: record.slug, title: record.title, kind_: record.kind, status: record.status,
        producer: record.createdBy || record.canonicalName || '', persona: record.sourcePersona ?? '', edited: record.editedAt !== null,
        body: body.value.text, fallback: body.value.fallback,
      };
    }
    case 'artifacts.save': {
      const loaded = sessions.loadedSessionId();
      const store = loaded ? sessions.artifactsOf(loaded) : null;
      if (!store) return { kind: 'refused', code: 'artifacts.no-session', headline: 'Artifact not found in the loaded session.' };
      const r = store.editBody(req.ref, req.body);
      // REQ-LIBRARY-133: the footer shows `Save failed: <err>` on failure; the reason travels as the refusal's headline.
      if (!r.ok) return { kind: 'refused', code: `artifacts.${r.error.code}`, headline: r.error.reason };
      log(`artifact ${r.value.id} edited by hand at ${r.value.editedAt} (REQ-LIBRARY-094)`);
      return { kind: 'artifacts.saved', id: r.value.id, editedAt: r.value.editedAt };
    }
    case 'hooks.summary': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      return { kind: 'hooks.summary', summary: hooksSummaryFor({ workspaceRoot: s.root, globalDir: configDir, env: hostEnv, dal: s.dal, sessionId: req.sessionId }) };
    }
    case 'hooks.decide': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const r = await decideHooks(s.root, configDir, req.trusted, toIsoUtc(clocks.wall.instant()));
      if (!r.ok) return { kind: 'refused', code: 'hooks.decision', headline: 'The decision could not be recorded', detail: r.error.reason };
      log(`hooks: workspace ${s.root} ${req.trusted ? 'allowed' : 'refused'} (${r.value.fingerprint.slice(0, 12)}…)`);
      return { kind: 'ack' };
    }
    case 'hooks.clearDecision': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const r = clearHooksDecision(s.root);
      return r.ok ? { kind: 'ack' } : { kind: 'refused', code: 'hooks.clear', headline: 'The stored decision could not be removed', detail: r.error.reason };
    }
    case 'playbooks.catalogue':
      // REQ-ORCH-026: the built-in catalogue, user-inspectable — every slot, every variant, the built-in text.
      return { kind: 'playbooks.catalogue', catalogue: CATALOGUE };
    case 'hooks.setToggle': {
      const r = await setHookToggle(hostEnv, configDir, req.agent, req.hookId, req.on);
      return r.ok ? { kind: 'ack' } : { kind: 'refused', code: 'hooks.policy', headline: 'The hook policy could not be saved', detail: r.error.reason };
    }
    case 'runs.active':
      // ADR-0013: the registry's predicate. Sessions are not keyed by workspace yet; the count is instance-wide.
      return { kind: 'runs.count', workspaceId: req.workspaceId, count: sessions.activeRunCount() };
    case 'checkpoint.list': {
      // REQ-GIT-050: rows only, no Git; REQ-GIT-092/093's verdict stamped on; REQ-GIT-094's repair on this open.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const r = sessions.checkpointListing(s.dal, s.root, asSessionId(req.sessionId));
      if (!r.ok) return { kind: 'refused', code: `checkpoint.${r.error.code}`, headline: r.error.reason };
      if (r.value.repaired) log(`session ${req.sessionId} was still marked '${r.value.repaired.previous}', but ${r.value.repaired.reason}; marked interrupted (REQ-GIT-094)`, 'warn');
      return { kind: 'checkpoint.list', listing: { ...r.value, includeUntracked: configuredFor(s.root)?.cfg.checkpoints.include_untracked ?? CHECKPOINTS_DEFAULTS.include_untracked } };
    }
    case 'checkpoint.recordSafety': {
      // REQ-GIT-058 gate 5: the pre-restore row through the one transaction; rows first, then the trimmed refs, then the event.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const keep = Math.max(1, configuredFor(s.root)?.cfg.checkpoints.max_per_session ?? CHECKPOINTS_DEFAULTS.max_per_session);
      const listing = sessions.checkpointListing(s.dal, s.root, asSessionId(req.sessionId));
      if (!listing.ok) return { kind: 'refused', code: `checkpoint.${listing.error.code}`, headline: listing.error.reason };
      const r = sessions.recordSafetyCheckpoint(s.dal, asSessionId(req.sessionId), { sequence: req.sequence, ref: req.ref, commit: req.commit, iteration: 0, childName: '', files: req.files, kind: 'pre_restore' }, keep);
      if (!r.ok) return { kind: 'refused', code: `checkpoint.${r.error.code}`, headline: r.error.reason };
      if (r.value.trimmed.length > 0) {
        const pruned = await ask({ kind: 'checkpoint.prune', workspaceRoot: s.root, treeRoot: listing.value.treeRoot, sessionId: req.sessionId, refs: [...r.value.trimmed] }, REFS_ASK_BOUND).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
        log(`checkpoints: the safety checkpoint trimmed ${r.value.trimmed.length} row(s) to ${keep}; ${pruned.kind === 'checkpoint.pruned' ? `${pruned.deleted} ref(s) deleted` : `their refs could not be deleted (${pruned.kind === 'refused' ? pruned.headline : pruned.kind})`}`);
      }
      r.value.publish();
      log(`checkpoints: safety checkpoint ${req.sequence} recorded for session ${req.sessionId} (${req.files.length} file(s))`);
      return { kind: 'checkpoint.recorded', sequence: req.sequence, trimmed: [...r.value.trimmed] };
    }
    case 'checkpoint.recordRestore': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const r = sessions.recordRestore(s.dal, asSessionId(req.sessionId), { sequence: req.sequence, restored: req.restored, safetySequence: req.safetySequence, changedPaths: req.changedPaths, blockedReason: req.blockedReason, forced: req.forced, treeRoot: req.treeRoot, dirtyPaths: req.dirtyPaths, ref: req.ref, commit: req.commit });
      if (!r.ok) return { kind: 'refused', code: `checkpoint.${r.error.code}`, headline: r.error.reason };
      log(`checkpoints: restore of checkpoint ${req.sequence} on session ${req.sessionId} recorded as ${req.restored ? `restored (${req.changedPaths} file(s), safety ${req.safetySequence ?? 'none'})` : `refused: ${req.blockedReason}`}`);
      return { kind: 'ack' };
    }
    case 'presenter.register':
      presenters.register(req.windowId);
      return { kind: 'ack' };
    case 'presenter.revoke':
      presenters.revoke(req.windowId);
      return { kind: 'ack' };
    case 'presenter.pollReply':
      presenters.pollReplied(req.windows);
      return { kind: 'ack' };
    case 'approval.shown':
      return presenter.shown(req.requestId, req.ok, req.error) ? { kind: 'ack' } : { kind: 'refused', code: 'approval.unknown', headline: 'No present-request waits for that id' };
    case 'session.attach':
      return sessions.attach(asSessionId(req.sessionId)) ? { kind: 'ack' } : { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
    case 'session.detach':
      return { kind: 'ack' };
    case 'session.reconcile':
      return sessions.reconcile(asSessionId(req.sessionId)) ? { kind: 'ack' } : { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
    case 'session.pageOlder': {
      const page = sessions.pageOlder(asSessionId(req.sessionId), req.beforeIndex);
      if (!page) return { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
      return { kind: 'session.page', sessionId: req.sessionId, rows: page.rows, oldest: page.oldest };
    }
    case 'mcp.list': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      return { kind: 'mcp.list', listing: mcp.list(run.cfg) };
    }
    case 'mcp.probe': {
      // REQ-MCP-092: one server per request, so the category probes sequentially and every request stays under main's bound.
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      const names = req.name === undefined ? Object.keys(run.cfg.mcp.servers) : [req.name];
      const results: { name: string; health: Awaited<ReturnType<McpHost['probeOne']>> }[] = [];
      for (const name of names) { const health = await mcp.probeOne(run.cfg, name); log(`mcp: probe of '${name}' → ${health.state}${health.state === 'healthy' ? ` (${health.toolCount} tools)` : health.detail ? ` (${health.detail})` : ''} in ${(health.elapsedMs ?? 0).toFixed(0)} ms`); results.push({ name, health }); }
      return { kind: 'mcp.probe', results };
    }
    case 'mcp.setEnabled':
      mcp.setEnabled(req.name, req.enabled);
      return { kind: 'ack' };
    case 'mcp.secrets': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      return { kind: 'mcp.secrets', view: mcp.secrets(run.cfg, req.server ?? null) };
    }
    /**
     * ADR-0022 / REQ-SANDBOX-129: the settings label's read, and its re-check. The probe runs here,
     * in the run host, off every interface thread; the label enters its checking state the moment
     * the request is sent and shows the new verdict when this reply arrives, so neither the settings
     * surface nor any other view blocks for the up-to-5.0-second trial. A fresh verdict governs
     * sessions started AFTERWARDS and never changes the confinement fact recorded for a session
     * already running (REQ-SANDBOX-094, REQ-SANDBOX-096).
     */
    case 'confinement.status': {
      if (req.recheck !== true) return { kind: 'confinement.status', verdict: await settleConfinement() };
      const verdict = await confinement.recheck();
      log(`confinement: re-checked — ${verdict.available ? `available (${verdict.backend})` : `unavailable — ${renderUnavailability(verdict).replace(/\n/g, ' ')}`}`);
      return { kind: 'confinement.status', verdict };
    }
    // ADR-0035 (Part T) / REQ-MCP-099/112: the project setup — the steps run here; the reply is the status as it stands.
    case 'mcp.setup': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root) ?? (configure(s.root, true).ok ? configuredFor(s.root) : null);
      // Part AS: `applicable` (REQ-WORKSPACE-090) is read off the same resolution every other answer is.
      if (req.action === 'status') return { kind: 'mcp.setup', status: mcp.setupStatus(run?.cfg ?? null) };
      if (req.action === 'cancel') return { kind: 'mcp.setup', status: mcp.cancelSetup() };
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      const started = mcp.startSetup(run.cfg, s.root);
      if (!started.ok) return { kind: 'refused', code: 'mcp.setup.running', headline: started.reason };
      return { kind: 'mcp.setup', status: started.status };
    }
    // Part AL — the live h.terminal's requests (ADR-0021, REQ-TOOLS-128, REQ-SHELL-106/107); the mechanism is `run-host/h.terminal.ts`.
    case 'terminal.streams':
    case 'terminal.sendKeys':
    case 'terminal.resize':
    case 'terminal.interrupt':
    case 'terminal.endInput':
    case 'terminal.kill':
    case 'terminal.audit':
      return terminalHost.handle(req);
    case 'shutdown': {
      // ADR-0014 / REQ-MONITOR-255: every run asked to stop before any is waited on; the reply follows their h.terminal results.
      for (const controller of improvementControllers.values()) controller.abort();
      improvementControllers.clear();
      improvementContexts.clear();
      presenters.stop();
      // REQ-MCP-053: an outstanding discovery never delays exit — its children are killed first, so a port waiting on it proceeds at once.
      void mcp.discovery.closeAll();
      await sessions.closeAll();
      // REQ-MCP-066: the session connections closed at exit, within the budget.
      await mcp.closeAll();
      // REQ-TOOLS-111: every background session ended and every h.terminal resource closed before the host goes.
      await h.terminal?.dispose();
      for (const s of stores.values()) { try { s.db?.close(); } catch { /* */ } }
      stores.clear();
      clocks.timers.after(millis(0), () => process.exit(0));
      return { kind: 'ack' };
    }
  }
}
