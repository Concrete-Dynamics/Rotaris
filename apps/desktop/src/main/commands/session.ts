import { type CommandOutcome, type ProcessReply, type WorktreeBinding } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';
import type { ReportInput } from '../notices.js';

/**
 * REQ-NOTIFY-060/061: a sandboxed launch that was refused — the confinement gate answered before the run reached a
 * started state (`session.confinement`). The notice reproduces the refusal wording as received, unedited, as its message
 * AND its copyable detail, remediation included; its one action returns to the workspace view; it offers no retry.
 * REQ-SANDBOX-120's title stays the run host's. The same notice for a start, a prompt and a continue: the gate runs
 * before each, and none of them reaches a run.
 */
export function confinementRefusalNotice(r: { readonly headline: string; readonly detail?: string | undefined }): ReportInput {
  const wording = r.detail ?? r.headline;
  return { severity: 'error', title: r.headline, message: wording, detail: wording, persistent: true, action: { label: 'Open Workspace', action: { kind: 'open-view', view: 'workspace' } } };
}

/**
 * SESSIONS — starting one, resuming one, steering one, and the plan gate's two entries (ADR-0062,
 * REQ-ORCH-152..154). The run host owns the session; main names the window's workspace, forwards, and turns
 * a refusal into a notice where the surface has nowhere to show one.
 */
export function sessionCommands(
  ctx: Pick<CommandContext, 'capturing' | 'clocks' | 'dialogs' | 'log' | 'mainWindows' | 'notices' | 'pauseWindows' | 'quitting' | 'raiseNotice' | 'recoveryFor' | 'relay' | 'runFailures' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'session.continue' | 'session.planEdit' | 'session.planDecision' | 'session.planRearm' | 'session.start' | 'session.newId' | 'session.resume' | 'session.control' | 'session.prompt' | 'session.retry' | 'session.readAttachment' | 'session.subscribe' | 'session.unsubscribe' | 'session.release' | 'session.reconcile' | 'session.pageOlder'> {
  const { capturing, clocks, dialogs, log, mainWindows, notices, pauseWindows, quitting, raiseNotice, recoveryFor, relay, runFailures, runHost, services } = ctx;
  return {
    'session.continue': async (req) => {
      const r = await runHost.request({ kind: 'session.continue', sessionId: req.sessionId, action: req.action, ...(req.withoutPaused === true ? { withoutPaused: true } : {}) }, millis(10_000));
      if (r.kind !== 'session.continued') {
        if (r.kind === 'refused') { if (r.code === 'session.confinement') void notices.report(confinementRefusalNotice(r)); else raiseNotice('error', r.headline, r.detail); }
        return refusal(r, 'The session could not be continued');
      }
      const open = pauseWindows.get(req.sessionId);
      if (open && !open.isDestroyed()) open.close();
      log(`session ${req.sessionId} ${req.action}: ${r.resumed ? 'continued' : 'left paused'}`);
      return { ok: true, value: { resumed: r.resumed, messageLimit: r.messageLimit } };
    },
    /*
     * REQ-ORCH-153/154 (ADR-0062) and PD-ORCH-003: the plan gate's three entries, forwarded to the run host that
     * owns the session. They are session commands and not controls: the run is PARKED, so there is nothing live to
     * control and the answer must reach a session whose hosting process may have exited since the gate opened.
     */
    'session.planEdit': async (req) => {
      const r = await runHost.request({ kind: 'session.planEdit', sessionId: req.sessionId, text: req.text }, millis(10_000));
      return r.kind === 'ack' ? { ok: true, value: null } : refusal(r, 'The plan could not be edited');
    },
    'session.planDecision': async (req) => {
      const r = await runHost.request({ kind: 'session.planDecision', sessionId: req.sessionId, decision: req.decision, ...(req.changes === undefined ? {} : { changes: req.changes }) }, millis(10_000));
      if (r.kind !== 'session.planResolved') { if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail); return refusal(r, 'The plan decision could not be applied'); }
      log(`session ${req.sessionId} plan cycle ${r.cycle}: ${req.decision}${r.relaunched ? ' — a further segment is executing' : ' — the run came to rest'}`);
      return { ok: true, value: { cycle: r.cycle, relaunched: r.relaunched } };
    },
    'session.planRearm': async (req) => {
      const r = await runHost.request({ kind: 'session.planRearm', sessionId: req.sessionId }, millis(10_000));
      return r.kind === 'ack' ? { ok: true, value: null } : refusal(r, 'The plan gate could not be re-armed');
    },
    'session.start': async (req, { w }) => {
      if (!w.workspaceId) { log('run refused before start: no workspace is open'); return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting a run' }; }
      // REQ-GIT-021: the two conflicting choices, refused before anything is created (REQ-GIT-158 makes this unreachable from the dialog).
      if (req.isolation && req.attach) { log('run refused before start: isolation and attach together'); return { ok: false, code: 'session.worktree-options', headline: 'Choose either an isolated worktree or an existing worktree to attach, not both.' }; }
      /**
       * REQ-GIT-022/023 (Part O), the reading taken with a main-minted id: the binding is made BEFORE the run host is
       * asked for the session, so a binding failure leaves no session, no lock and no log — "deleted" by construction
       * rather than by a delete. The id the dialog showed (session.newId) is the id the session takes (REQ-GIT-007/118).
       */
      let binding: WorktreeBinding | undefined;
      let sessionId: string | undefined;
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      // REQ-MONITOR-251 / REQ-GIT-120: the 2nd+ concurrent launch is placed in a worktree. The dialog
      // locks isolation on (REQ-GIT-119), but a start arriving without an explicit tree — e.g. a retry
      // holding pre-dialog launch options — must not share the base tree with the live run, so main
      // force-creates the default isolated tree instead of refusing or colliding.
      let effectiveIsolation = req.isolation;
      const effectiveAttach = req.attach;
      let forcedSessionId: string | undefined;
      if (!effectiveIsolation && !effectiveAttach) {
        const active = await runHost.request({ kind: 'runs.active', workspaceId: w.workspaceId }, millis(5_000)).catch(() => null);
        if (active?.kind === 'runs.count' && active.count > 0) {
          forcedSessionId = mainWindows.takeMintedSession(w.wcId) ?? randomUUID();
          effectiveIsolation = { branch: `rotaris/session/${forcedSessionId}` };
          log(`concurrent start while ${active.count} run(s) active: force-creating isolated worktree ${effectiveIsolation.branch} (REQ-MONITOR-251)`);
        }
      }
      if (effectiveIsolation || effectiveAttach) {
        if (!svc) { log('run refused before start: the workspace service is not running'); return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' }; }
        sessionId = forcedSessionId ?? mainWindows.takeMintedSession(w.wcId) ?? randomUUID();
        const bindFailure = (r: ProcessReply): CommandOutcome => {
          const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
          const headline = `Error: could not create or attach the requested worktree: ${detail}`;
          raiseNotice('error', headline);
          log(`run refused before start: ${headline}`);
          return { ok: false, code: 'session.worktree', headline, detail };
        };
        /**
         * ADR-0019: the links reject on timeout or close (`ProcessLink.request`), so a rejection is a
         * refusal carrying the cause as its detail — never a throw out of the command, which the
         * renderer would meet as a rejected `invoke` and the composer as silence (R0-2).
         */
        const unreachable = (cause: Error) => ({ kind: 'refused' as const, code: 'link.unreachable', headline: 'The workspace service did not answer', detail: cause.message });
        if (effectiveIsolation) {
          const made = await svc.link.request({ kind: 'worktree.create', workspaceRoot: root, branch: effectiveIsolation.branch, collisionSafe: true, target: { kind: 'session', sessionId } }, millis(120_000)).catch(unreachable);
          if (made.kind !== 'worktree.created') return bindFailure(made);
          binding = { worktree_path: made.path, branch: made.branch, base_branch: made.baseBranch, base_revision: made.baseRevision, created_by_session: true, merge_status: 'ready', integration_session_id: null };
        } else if (effectiveAttach) {
          const checked = await svc.link.request({ kind: 'worktree.checkAttach', workspaceRoot: root, path: effectiveAttach.path }, millis(60_000)).catch(unreachable);
          if (checked.kind !== 'worktree.attachable') return bindFailure(checked);
          binding = { worktree_path: checked.path, branch: checked.branch, base_branch: checked.baseBranch, base_revision: checked.baseRevision, created_by_session: false, merge_status: 'ready', integration_session_id: null };
        }
      }
      // ADR-0019, as above: an unanswered run host refuses the start rather than throwing out of it.
      const r = await runHost.request({ kind: 'session.start', workspaceId: w.workspaceId, prompt: req.prompt, ...(req.attachments === undefined ? {} : { attachments: req.attachments }), ...(sessionId === undefined ? {} : { sessionId }), ...(binding === undefined ? {} : { effectiveRoot: binding.worktree_path, worktree: binding }), ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }) }, millis(10_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'run-host.unreachable', headline: 'The run host did not answer', detail: cause.message }));
      if (r.kind !== 'session.started') {
        // A tree this request created for a session that never came to exist is taken away again, so nothing is left behind (REQ-GIT-023).
        if (binding?.created_by_session && svc) {
          const path = binding.worktree_path;
          void svc.link.request({ kind: 'worktree.remove', workspaceRoot: root, path, force: true }, millis(60_000)).then((x) => log(`worktree ${path} removed after the refused start (${x.kind})`)).catch(() => undefined);
        }
        // REQ-NOTIFY-003: a refusal is also published as a persistent notice, so it outlives the composer's error line.
        // REQ-WORKSPACE-137: the two provider refusals carry an action leading to the Models settings.
        if (r.kind === 'refused') {
          if (r.code === 'session.confinement') void notices.report(confinementRefusalNotice(r));
          else raiseNotice('error', r.headline, r.detail, r.code === 'session.no-model' || r.code === 'session.provider-auth' ? recoveryFor('config.models') : undefined);
          log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`);
        }
        return refusal(r, 'The session could not be started');
      }
      if (binding) log(`session ${r.sessionId} bound to ${binding.worktree_path} on ${binding.branch} (${binding.created_by_session ? 'created by the session' : 'attached'})`);
      // REQ-NOTIFY-058 / REQ-NOTIFY-029: a starting run clears the standing notice only where it is unscoped or
      // scoped to this same session; a notice about another session survives, whatever order the events arrived in.
      await notices.clearForRunStart(r.sessionId);
      // REQ-SHELL-078: a new session starts — every persona window and its cache go.
      w.personaWindows.destroyAll('a new session started');
      return { ok: true, value: { sessionId: r.sessionId } };
    },
    'session.newId': (_req, { w }) => {
      // REQ-GIT-118: the id the launch dialog shows; the next isolated or attached start takes it.
      const sessionId = randomUUID();
      mainWindows.setMintedSession(w.wcId, sessionId);
      return { ok: true, value: { sessionId } };
    },
    'session.resume': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before loading a session' };
      // REQ-MONITOR-249/252/258: multi-session host — focusing another session (idle or already live
      // in the background) stays available while a run is active. The engine still refuses the one
      // case that must not proceed: resuming the session a run is already executing where a fresh
      // load would collide (REQ-MONITOR-256); the renderer treats that answer as a focus switch.
      const r = await runHost.request({ kind: 'session.resume', workspaceId: w.workspaceId, sessionId: req.sessionId }, millis(10_000));
      if (r.kind !== 'session.resumed') {
        if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail);
        return refusal(r, 'The session could not be loaded');
      }
      raiseNotice('info', `Loaded session ${r.sessionId}.`);
      // REQ-SHELL-078 read for a loaded session too: the windows were opened onto the previous session's agents and would otherwise show them (Part R's reading, ADR-0048 note).
      if (w.followedSessionId !== null && w.followedSessionId !== r.sessionId) w.personaWindows.destroyAll('a different session was loaded');
      return { ok: true, value: { sessionId: r.sessionId } };
    },
    'session.control': async (req, { senderId }) => {
      // PD-CHAT-002 revision 2 with PD-ORCH-005 clause 9: the question dock cancels its prompt as its window unloads
      // (REQ-CHAT-101). A dismissal the application's quit causes cancels nothing: the cancellation is not sent, the run
      // host's `shutdown` withdraws the question instead, and a withdrawn question is never an answer.
      if (req.request.op === 'cancelQuestions' && quitting()) {
        log(`question ${String(req.request.args['requestId'] ?? '')} left for the quit to withdraw: its dock closed with the application (PD-ORCH-005 clause 9)`);
        return { ok: true, value: { ok: true } };
      }
      // ADR-0010 channel 1 across ADR-0013's boundary: the same arguments, the same `{ok, value?}`.
      // Part AC's seam (verification only, ROTARIS_CAPTURE_PNG): ROTARIS_CAPTURE_QUESTION_STALE corrupts the request
      // id of a forwarded `answerQuestion` so that no wait carries it. REQ-CHAT-102's failed delivery is otherwise
      // a race between the click and the wait being released, which no script can hit reliably; the whole product
      // path — the stepper, the channel, the run host's routing — is exercised unchanged, only the id is stale.
      const forwarded = capturing && process.env['ROTARIS_CAPTURE_QUESTION_STALE'] && req.request.op === 'answerQuestion'
        ? { ...req.request, args: { ...req.request.args, requestId: `${String(req.request.args['requestId'])}-stale` } }
        : req.request;
      // Part AO: a manual compression settles only once every live conversation has (REQ-MONITOR-092), each pass bounded by
      // `compressor.timeout_seconds` (120 s by default, ADR-0060), so the 10 s bound every other control keeps would time this
      // reply out while the pass ran on; the default pass bound plus a margin is the reply's. A larger configured bound outlives it — stated, not hidden.
      const r = await runHost.request({ kind: 'session.control', request: forwarded }, millis(forwarded.op === 'forceCompression' ? 130_000 : 10_000));
      if (req.request.op === 'answerApproval' && r.kind === 'control.result') {
        // REQ-TOOLS-063: a delivered answer marks its dialog answered (the run host's close follows); an undeliverable one leaves it open.
        const d = dialogs.get(senderId);
        if (d && r.result.ok) d.answered = true;
        log(`approval ${String(req.request.args['requestId'])} answered ${String(req.request.args['option'])} → ${r.result.ok ? 'delivered' : 'undeliverable'}`);
      }
      if (req.request.op !== 'answerApproval') log(`control ${req.request.op} on ${req.request.sessionId} → ${r.kind === 'control.result' ? (r.result.ok ? `ok${r.result.value ? ` (${r.result.value})` : ''}` : 'false') : r.kind}`);
      return r.kind === 'control.result' ? { ok: true, value: r.result } : refusal(r, 'The control could not be delivered');
    },
    'session.prompt': async (req) => {
      const r = await runHost.request({ kind: 'session.prompt', sessionId: req.sessionId, prompt: req.prompt, ...(req.attachments === undefined ? {} : { attachments: req.attachments }) }, millis(10_000));
      // REQ-NOTIFY-061: a continuation refused at the confinement gate never reached a run; it is reported as a start's is.
      if (r.kind === 'refused' && r.code === 'session.confinement') { void notices.report(confinementRefusalNotice(r)); log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`); }
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The prompt could not be recorded');
    },
    'session.retry': async (req) => {
      // REQ-NOTIFY-045 (OQ-178): the engine resubmits the last submitted prompt with its images; a refusal carries its words.
      const r = await runHost.request({ kind: 'session.retry', sessionId: req.sessionId }, millis(10_000));
      // REQ-NOTIFY-061: a retry refused at the confinement gate never reached a run; it is reported as a prompt's is.
      if (r.kind === 'refused' && r.code === 'session.confinement') { void notices.report(confinementRefusalNotice(r)); log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`); }
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The prompt could not be retried');
    },
    'session.readAttachment': async (req) => {
      const r = await runHost.request(req, millis(10_000));
      return r.kind === 'session.attachment' ? { ok: true, value: r } : refusal(r, 'The image attachment could not be loaded');
    },
    'session.subscribe': async (req, { senderId }) => {
      // Subscribe the relay FIRST so the attach's snapshot and transcript reach this window.
      // Part R found the twenty-seventh defect here: this subscribed `wcId` — the MAIN window — whatever window asked, so a
      // second renderer on one session (ADR-0043's "several windows", REQ-SHELL-076) would have fed the main window twice and
      // itself never; unseen because only the main window had ever subscribed. The sender is the subscriber (ADR-0043 note).
      relay.subscribe(senderId, req.sessionId);
      // A2: the follow belongs to whichever MAIN window subscribed — a persona or terminal window subscribes
      // for itself (the twenty-seventh defect above) and must not move any main window's followed session.
      mainWindows.setFollowedSession(senderId, req.sessionId);
      const r = await runHost.request({ kind: 'session.attach', sessionId: req.sessionId }, millis(5_000));
      // REQ-NOTIFY-030/032: the session is on screen now — a failure held while it was not arrives with the focus change: its
      // class notice, and for an authentication failure the recovery dialog over this window. Only a MAIN window follows.
      if (r.kind === 'ack' && mainWindows.followerOfSession(req.sessionId, [senderId]) !== undefined) void runFailures.focused(req.sessionId);
      // A seam (verification only, ROTARIS_CAPTURE_PNG): ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS holds the reply that long
      // after the attach was acknowledged. A start's send settles in the renderer only on this reply, while the
      // attach's snapshot and the run's events have already drawn the run as active, so a dialog opened in between
      // meets the composer's settling send. That window is the app's and a few milliseconds wide, which no script hits
      // reliably; held, `part-j-proof`'s steer-early launch opens the steer dialog inside it every time
      // (docs/defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md).
      const hold = capturing ? Number(process.env['ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS'] ?? 0) : 0;
      if (hold > 0 && r.kind === 'ack') {
        log(`capture: session.subscribe reply held ${hold} ms`);
        await new Promise<void>((done) => { clocks.timers.after(millis(hold), done); });
        log('capture: session.subscribe reply released');
      }
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session could not be followed');
    },
    'session.unsubscribe': (req, { senderId }) => {
      relay.unsubscribe(senderId, req.sessionId);
      mainWindows.clearFollowedSession(senderId, req.sessionId);
      void runHost.request({ kind: 'session.detach', sessionId: req.sessionId }, millis(5_000)).catch(() => undefined);
      return { ok: true };
    },
    // REQ-NOTIFY-031/032: the sender stops following the session in main's eyes only — the focus test then reads it as not on
    // screen — and stays subscribed to its relay, so the run carrying on in the background still reaches this window.
    'session.release': (req, { senderId }) => {
      mainWindows.clearFollowedSession(senderId, req.sessionId);
      return { ok: true };
    },
    'session.reconcile': async (req) => {
      const r = await runHost.request({ kind: 'session.reconcile', sessionId: req.sessionId }, millis(5_000));
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session could not be re-read');
    },
    'session.pageOlder': async (req) => {
      const r = await runHost.request({ kind: 'session.pageOlder', sessionId: req.sessionId, beforeIndex: req.beforeIndex }, millis(5_000));
      return r.kind === 'session.page' ? { ok: true, value: { rows: r.rows, oldest: r.oldest } } : refusal(r, 'Older messages could not be loaded');
    },
  };
}
