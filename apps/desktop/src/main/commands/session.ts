import { millis, textOf } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';
import { startSessionRun } from '../session-start.js';
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
  ctx: Pick<CommandContext, 'capturing' | 'clocks' | 'configFatal' | 'dialogs' | 'log' | 'mainWindows' | 'notices' | 'openWorkspaceRead' | 'pauseWindows' | 'quitting' | 'raiseNotice' | 'recoveryFor' | 'relay' | 'runFailures' | 'runHost' | 'services' | 'storeRefusal' | 'withdrawnByClose'>,
): Pick<CommandHandlers, 'session.continue' | 'session.planEdit' | 'session.planDecision' | 'session.planRearm' | 'session.chooseNextModel' | 'session.start' | 'session.newId' | 'session.resume' | 'session.focusFromNotice' | 'session.focusReady' | 'session.control' | 'session.prompt' | 'session.retry' | 'session.readAttachment' | 'session.subscribe' | 'session.unsubscribe' | 'session.release' | 'session.reconcile' | 'session.pageOlder'> {
  const { capturing, clocks, dialogs, log, mainWindows, notices, openWorkspaceRead, pauseWindows, quitting, raiseNotice, relay, runFailures, runHost, withdrawnByClose } = ctx;
  /** PD-GIT-001: the runs a launch in the workspace would share a tree with, or null when the run host's count cannot be read. */
  const sharingRunCount = async (workspaceId: string): Promise<number | null> => {
    const active = await runHost.request({ kind: 'runs.active', workspaceId, scope: 'sharing' }, millis(5_000)).catch(() => null);
    return active?.kind === 'runs.count' ? active.count : null;
  };
  return {
    'session.continue': async (req) => {
      const r = await runHost.request({ kind: 'session.continue', sessionId: req.sessionId, action: req.action, ...(req.withoutPaused === true ? { withoutPaused: true } : {}) }, millis(10_000));
      if (r.kind !== 'session.continued') {
        if (r.kind === 'refused') { if (r.code === 'session.confinement') void notices.report(confinementRefusalNotice(r)); else raiseNotice('error', r.headline, r.detail); }
        return refusal(r, 'The session could not be continued');
      }
      const open = pauseWindows.get(req.sessionId);
      if (open && !open.isDestroyed()) open.close();
      // REQ-NOTIFY-058 / REQ-NOTIFY-029: a continue that resumed launched a run of the session (`launchContinuation`).
      if (r.resumed) await notices.clearForRunStart(req.sessionId);
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
      // REQ-NOTIFY-058 / REQ-NOTIFY-029: a decision that relaunched started a further run of the session.
      if (r.relaunched) await notices.clearForRunStart(req.sessionId);
      log(`session ${req.sessionId} plan cycle ${r.cycle}: ${req.decision}${r.relaunched ? ' — a further segment is executing' : ' — the run came to rest'}`);
      return { ok: true, value: { cycle: r.cycle, relaunched: r.relaunched } };
    },
    'session.planRearm': async (req) => {
      const r = await runHost.request({ kind: 'session.planRearm', sessionId: req.sessionId }, millis(10_000));
      return r.kind === 'ack' ? { ok: true, value: null } : refusal(r, 'The plan gate could not be re-armed');
    },
    /*
     * REQ-MONITOR-194 / REQ-MONITOR-146: the composer's next-run model, chosen explicitly — forwarded to the run host that owns
     * the session, which clears the pair's exclusion if the session holds it out of quota. A session command, not a control:
     * no run need be live, and REQ-MONITOR-004's twenty-two operations name none for it.
     */
    'session.chooseNextModel': async (req) => {
      const r = await runHost.request({ kind: 'session.chooseNextModel', sessionId: req.sessionId, modelKey: req.modelKey }, millis(10_000));
      return r.kind === 'ack' ? { ok: true, value: null } : refusal(r, 'The model for the next run could not be applied to the session');
    },
    'session.start': async (req, { w }) => {
      if (!w.workspaceId) {
        // REQ-SESSION-089 / REQ-SESSION-202, OQ-281: a store the open refused is said as the store that could not be opened,
        // and that nothing was started — no session, no lock, nothing asked of the run host — never as "no workspace".
        const held = w.workspace === '(no workspace)' ? undefined : ctx.storeRefusal?.(w.workspace);
        if (held) {
          log(`run refused before start: the session store could not be opened (${held.code}); nothing was started`);
          return { ok: false, code: held.code, headline: 'Nothing was started: the session store for this workspace could not be opened', ...(held.detail === undefined ? {} : { detail: held.detail }) };
        }
        log('run refused before start: no workspace is open'); return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting a run' };
      }
      /**
       * REQ-MCP-124 (ADR-0067): the DESKTOP start and the MCP surface's start are ONE path — `startSessionRun` in
       * `../session-start.js`. This handler builds the input from the trusted desktop state (the window's open workspace,
       * and the authority fields the dialog chose), and `startSessionRun` does everything else: the worktree binding, the
       * forced isolation of PD-GIT-001, the shared fence's re-read of the open workspace, the run-host admission and the
       * notices. The inbound path calls the same function and fills none of these fields (REQ-MCP-124).
       */
      const outcome = await startSessionRun({ ...ctx, openWorkspaceRead: (wcId) => openWorkspaceRead(wcId), confinementNotice: confinementRefusalNotice }, {
        workspaceId: w.workspaceId, workspaceRoot: w.workspace, prompt: req.prompt,
        ...(req.attachments === undefined ? {} : { attachments: req.attachments }),
        ...(req.isolation === undefined ? {} : { isolation: req.isolation }),
        ...(req.attach === undefined ? {} : { attach: req.attach }),
        ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }),
        window: w,
      });
      return outcome;
    },
    'session.newId': async (_req, { w }) => {
      // REQ-GIT-118: the id the launch dialog shows; the next isolated or attached start takes it.
      const sessionId = randomUUID();
      mainWindows.setMintedSession(w.wcId, sessionId);
      // REQ-GIT-119 under PD-GIT-001: the dialog's lock is main's answer to the one count `session.start` forces on —
      // required above zero or when the count cannot be read. A window with no workspace shares no tree.
      const sharing = w.workspaceId ? await sharingRunCount(w.workspaceId) : 0;
      return { ok: true, value: { sessionId, isolationRequired: sharing === null || sharing > 0 } };
    },
    'session.resume': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before loading a session' };
      // REQ-MONITOR-249/252/258: multi-session host — focusing another session (idle or already live
      // in the background) stays available while a run is active. The engine still refuses the one
      // case that must not proceed: resuming the session a run is already executing where a fresh
      // load would collide (REQ-MONITOR-256); the renderer treats that answer as a focus switch.
      const r = await runHost.request({ kind: 'session.resume', workspaceId: w.workspaceId, sessionId: req.sessionId }, millis(10_000));
      if (r.kind !== 'session.resumed') {
        // Every refusal is raised, a notice's load included: since PD-SHELL-001 revision 3 (OQ-292) a `focus-session` press
        // reaches the window holding the session's workspace first (`session.focusFromNotice`), so a refusal here is one in the
        // session's own workspace — a deleted session — and is the ordinary error there. The silence of 2026-10-14 for a press in
        // a window holding another workspace (`fromNotice`) is withdrawn with the case it answered
        // (docs/archive/defects/a-focus-session-notice-action-acts-in-a-window-holding-another-workspace.md).
        if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail);
        return refusal(r, 'The session could not be loaded');
      }
      raiseNotice('info', `Loaded session ${r.sessionId}.`);
      // REQ-SHELL-078 read for a loaded session too: the windows were opened onto the previous session's agents and would otherwise show them (Part R's reading, ADR-0048 note).
      if (w.followedSessionId !== null && w.followedSessionId !== r.sessionId) w.personaWindows.destroyAll('a different session was loaded');
      return { ok: true, value: { sessionId: r.sessionId } };
    },
    /**
     * PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): a `focus-session` notice action, pressed in any window.
     * The action names the session and the workspace the run host recorded it under, so main reaches that workspace —
     * `MainWindows.reach`: the window holding it surfaced, else one added for it on PD-SHELL-001's add terms, asking nothing —
     * and asks THAT window, on channel 16, to focus the session through its own load (`session.resume`). A window the reach
     * added holds the request until its renderer reports `session.focusReady`. A reach that failed has already reported the
     * failure under REQ-SHELL-019 (`#addWindow`); its outcome is the answer.
     */
    'session.focusFromNotice': async (req) => {
      const reached = await mainWindows.reach(req.workspace);
      if (!reached.ok) {
        log(`notice action "focus-session" for ${req.sessionId}: ${req.workspace} could not be reached (${reached.outcome.ok ? 'no window' : reached.outcome.headline}) (PD-SHELL-001 revision 3)`);
        return reached.outcome;
      }
      const delivered = mainWindows.focusSession(reached.window.wcId, req.sessionId);
      log(`notice action "focus-session" for ${req.sessionId}: ${reached.added ? 'added' : 'surfaced'} window ${reached.window.wcId} for ${req.workspace}; the focus was ${delivered} (PD-SHELL-001 revision 3, OQ-292)`);
      if (delivered === 'gone') return { ok: false, code: 'window.gone', headline: 'The window holding the session closed before it could focus it' };
      return { ok: true, value: { window: reached.window.wcId, added: reached.added, delivered } };
    },
    /** The asking main window's renderer listens on channel 16 from now on; the focus held for it while it loaded, or null. */
    'session.focusReady': (_req, { senderId }) => {
      const own = mainWindows.forSender(senderId);
      if (!own) return { ok: false, code: 'window.notMain', headline: 'Only a main window focuses a session' };
      return { ok: true, value: { sessionId: mainWindows.sessionFocusReady(own.wcId) } };
    },
    'session.control': async (req, { senderId }) => {
      // PD-CHAT-002 revision 2 with PD-ORCH-005 clause 9: the question dock cancels its prompt as its window unloads
      // (REQ-CHAT-101). A dismissal the application's quit causes cancels nothing: the cancellation is not sent, the run
      // host's `shutdown` withdraws the question instead, and a withdrawn question is never an answer. PD-SHELL-009: the same
      // for a dock whose window's close stopped the session's run — the stop withdraws the question.
      if (req.request.op === 'cancelQuestions' && quitting()) {
        log(`question ${textOf(req.request.args['requestId'] ?? '')} left for the quit to withdraw: its dock closed with the application (PD-ORCH-005 clause 9)`);
        return { ok: true, value: { ok: true } };
      }
      if (req.request.op === 'cancelQuestions' && withdrawnByClose?.(req.request.sessionId) === true) {
        log(`question ${textOf(req.request.args['requestId'] ?? '')} left for the stop to withdraw: its window's close stopped session ${req.request.sessionId} (PD-SHELL-009, PD-ORCH-005 clause 9)`);
        return { ok: true, value: { ok: true } };
      }
      // ADR-0010 channel 1 across ADR-0013's boundary: the same arguments, the same `{ok, value?}`.
      // Part AC's seam (verification only, ROTARIS_CAPTURE_PNG): ROTARIS_CAPTURE_QUESTION_STALE corrupts the request
      // id of a forwarded `answerQuestion` so that no wait carries it. REQ-CHAT-102's failed delivery is otherwise
      // a race between the click and the wait being released, which no script can hit reliably; the whole product
      // path — the stepper, the channel, the run host's routing — is exercised unchanged, only the id is stale.
      const forwarded = __ROTARIS_SEAMS__ && capturing && process.env['ROTARIS_CAPTURE_QUESTION_STALE'] && req.request.op === 'answerQuestion'
        ? { ...req.request, args: { ...req.request.args, requestId: `${textOf(req.request.args['requestId'])}-stale` } }
        : req.request;
      // Part AO: a manual compression settles only once every live conversation has (REQ-MONITOR-092), each pass bounded by
      // `compressor.timeout_seconds` (120 s by default, ADR-0060), so the 10 s bound every other control keeps would time this
      // reply out while the pass ran on; the default pass bound plus a margin is the reply's. A larger configured bound outlives it — stated, not hidden.
      const r = await runHost.request({ kind: 'session.control', request: forwarded }, millis(forwarded.op === 'forceCompression' ? 130_000 : 10_000));
      if (req.request.op === 'answerApproval' && r.kind === 'control.result') {
        // REQ-TOOLS-063: a delivered answer marks its dialog answered (the run host's close follows); an undeliverable one leaves it open.
        const d = dialogs.get(senderId);
        if (d && r.result.ok) d.answered = true;
        log(`approval ${textOf(req.request.args['requestId'])} answered ${textOf(req.request.args['option'])} → ${r.result.ok ? 'delivered' : 'undeliverable'}`);
      }
      if (req.request.op !== 'answerApproval') log(`control ${req.request.op} on ${req.request.sessionId} → ${r.kind === 'control.result' ? (r.result.ok ? `ok${r.result.value ? ` (${r.result.value})` : ''}` : 'false') : r.kind}`);
      return r.kind === 'control.result' ? { ok: true, value: r.result } : refusal(r, 'The control could not be delivered');
    },
    'session.prompt': async (req) => {
      const r = await runHost.request({ kind: 'session.prompt', sessionId: req.sessionId, prompt: req.prompt, ...(req.attachments === undefined ? {} : { attachments: req.attachments }) }, millis(10_000));
      // REQ-NOTIFY-061: a continuation refused at the confinement gate never reached a run; it is reported as a start's is.
      if (r.kind === 'refused' && r.code === 'session.confinement') { void notices.report(confinementRefusalNotice(r)); log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`); }
      if (r.kind !== 'ack') return refusal(r, 'The prompt could not be recorded');
      // REQ-NOTIFY-058 / REQ-NOTIFY-029: the run host answers `ack` only once the prompt has launched a run of the session
      // (the engine refuses one while a run is active), so the session's standing notice — "The run failed", REQ-NOTIFY-032's
      // warning — is cleared as a start clears it. Until 2026-10-06 only `session.start` did
      // (docs/archive/defects/a-prompt-or-retry-that-starts-a-run-does-not-clear-the-sessions-notice.md).
      await notices.clearForRunStart(req.sessionId);
      return { ok: true };
    },
    'session.retry': async (req) => {
      // REQ-NOTIFY-045 (OQ-178): the engine resubmits the last submitted prompt with its images; a refusal carries its words.
      const r = await runHost.request({ kind: 'session.retry', sessionId: req.sessionId }, millis(10_000));
      // REQ-NOTIFY-061: a retry refused at the confinement gate never reached a run; it is reported as a prompt's is.
      if (r.kind === 'refused' && r.code === 'session.confinement') { void notices.report(confinementRefusalNotice(r)); log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`); }
      if (r.kind !== 'ack') return refusal(r, 'The prompt could not be retried');
      // REQ-NOTIFY-058 / REQ-NOTIFY-045: the retry launched a run of the session, as a prompt does; its notice is cleared.
      await notices.clearForRunStart(req.sessionId);
      return { ok: true };
    },
    'session.readAttachment': async (req) => {
      const r = await runHost.request(req, millis(10_000));
      return r.kind === 'session.attachment' ? { ok: true, value: r } : refusal(r, 'The image attachment could not be loaded');
    },
    'session.subscribe': async (req, { senderId }) => {
      // A seam (verification only, ROTARIS_CAPTURE_PNG): ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS holds the subscription that long
      // BEFORE it takes effect. A run that fails within milliseconds of its start can end before the renderer's subscription
      // reaches main — 30 ms against 57 ms at load 10 in finacc2's acceptance, and not at all on a quiet host — so
      // resilience-proof's auth-fallback launches widen that window to make it certain, and assert the started session is
      // still the focused one (docs/archive/defects/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md).
      const delay = __ROTARIS_SEAMS__ && capturing ? Number(process.env['ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS'] ?? 0) : 0;
      if (delay > 0) {
        log(`capture: session.subscribe held ${delay} ms before it takes effect`);
        await new Promise<void>((done) => { clocks.timers.after(millis(delay), done); });
      }
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
      // (docs/archive/defects/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md).
      const hold = __ROTARIS_SEAMS__ && capturing ? Number(process.env['ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS'] ?? 0) : 0;
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
