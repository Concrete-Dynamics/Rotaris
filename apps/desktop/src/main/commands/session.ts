import { type CommandOutcome, type ProcessReply, type WorktreeBinding } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * SESSIONS — starting one, resuming one, steering one, and the plan gate's two entries (ADR-0062,
 * REQ-ORCH-152..154). The run host owns the session; main names the window's workspace, forwards, and turns
 * a refusal into a notice where the surface has nowhere to show one.
 */
export function sessionCommands(
  ctx: Pick<CommandContext, 'capturing' | 'dialogs' | 'log' | 'mainWindows' | 'notices' | 'pauseWindows' | 'raiseNotice' | 'recoveryFor' | 'relay' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'session.continue' | 'session.planEdit' | 'session.planDecision' | 'session.start' | 'session.newId' | 'session.resume' | 'session.control' | 'session.prompt' | 'session.readAttachment' | 'session.subscribe' | 'session.unsubscribe' | 'session.reconcile' | 'session.pageOlder'> {
  const { capturing, dialogs, log, mainWindows, notices, pauseWindows, raiseNotice, recoveryFor, relay, runHost, services } = ctx;
  return {
    'session.continue': async (req) => {
      const r = await runHost.request({ kind: 'session.continue', sessionId: req.sessionId, action: req.action }, millis(10_000));
      if (r.kind !== 'session.continued') { if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail); return refusal(r, 'The session could not be continued'); }
      const open = pauseWindows.get(req.sessionId);
      if (open && !open.isDestroyed()) open.close();
      log(`session ${req.sessionId} ${req.action}: ${r.resumed ? 'continued' : 'left paused'}`);
      return { ok: true, value: { resumed: r.resumed, messageLimit: r.messageLimit } };
    },
    /*
     * REQ-ORCH-153/154 (ADR-0062): the plan gate's two entries, forwarded to the run host that owns the session.
     * They are session commands and not controls: the run is PARKED, so there is nothing live to control and the
     * answer must reach a session whose hosting process may have exited since the gate opened.
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
    'session.start': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting a run' };
      // REQ-GIT-021: the two conflicting choices, refused before anything is created (REQ-GIT-158 makes this unreachable from the dialog).
      if (req.isolation && req.attach) return { ok: false, code: 'session.worktree-options', headline: 'Choose either an isolated worktree or an existing worktree to attach, not both.' };
      /**
       * REQ-GIT-022/023 (Part O), the reading taken with a main-minted id: the binding is made BEFORE the run host is
       * asked for the session, so a binding failure leaves no session, no lock and no log — "deleted" by construction
       * rather than by a delete. The id the dialog showed (session.newId) is the id the session takes (REQ-GIT-007/118).
       */
      let binding: WorktreeBinding | undefined;
      let sessionId: string | undefined;
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (req.isolation || req.attach) {
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        sessionId = mainWindows.takeMintedSession(w.wcId) ?? randomUUID();
        const bindFailure = (r: ProcessReply): CommandOutcome => {
          const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
          const headline = `Error: could not create or attach the requested worktree: ${detail}`;
          raiseNotice('error', headline);
          log(`run refused before start: ${headline}`);
          return { ok: false, code: 'session.worktree', headline, detail };
        };
        if (req.isolation) {
          const made = await svc.link.request({ kind: 'worktree.create', workspaceRoot: root, branch: req.isolation.branch, collisionSafe: true, target: { kind: 'session', sessionId } }, millis(120_000));
          if (made.kind !== 'worktree.created') return bindFailure(made);
          binding = { worktree_path: made.path, branch: made.branch, base_branch: made.baseBranch, base_revision: made.baseRevision, created_by_session: true, merge_status: 'ready', integration_session_id: null };
        } else if (req.attach) {
          const checked = await svc.link.request({ kind: 'worktree.checkAttach', workspaceRoot: root, path: req.attach.path }, millis(60_000));
          if (checked.kind !== 'worktree.attachable') return bindFailure(checked);
          binding = { worktree_path: checked.path, branch: checked.branch, base_branch: checked.baseBranch, base_revision: checked.baseRevision, created_by_session: false, merge_status: 'ready', integration_session_id: null };
        }
      }
      const r = await runHost.request({ kind: 'session.start', workspaceId: w.workspaceId, prompt: req.prompt, ...(req.attachments === undefined ? {} : { attachments: req.attachments }), ...(sessionId === undefined ? {} : { sessionId }), ...(binding === undefined ? {} : { effectiveRoot: binding.worktree_path, worktree: binding }), ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }) }, millis(10_000));
      if (r.kind !== 'session.started') {
        // A tree this request created for a session that never came to exist is taken away again, so nothing is left behind (REQ-GIT-023).
        if (binding?.created_by_session && svc) {
          const path = binding.worktree_path;
          void svc.link.request({ kind: 'worktree.remove', workspaceRoot: root, path, force: true }, millis(60_000)).then((x) => log(`worktree ${path} removed after the refused start (${x.kind})`)).catch(() => undefined);
        }
        // REQ-NOTIFY-003: a refusal is also published as a persistent notice, so it outlives the composer's error line.
        // REQ-WORKSPACE-137: the two provider refusals carry an action leading to the Models settings.
        if (r.kind === 'refused') { raiseNotice('error', r.headline, r.detail, r.code === 'session.no-model' || r.code === 'session.provider-auth' ? recoveryFor('config.models') : undefined); log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`); }
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
      const active = await runHost.request({ kind: 'runs.active', workspaceId: w.workspaceId }, millis(5_000));
      if (active.kind === 'runs.count' && active.count > 0) return { ok: false, code: 'session.run-active', headline: 'Finish or cancel the active run before switching sessions.' };
      const r = await runHost.request({ kind: 'session.resume', workspaceId: w.workspaceId, sessionId: req.sessionId }, millis(10_000));
      if (r.kind !== 'session.resumed') {
        if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail);
        return refusal(r, 'The session could not be loaded');
      }
      raiseNotice('info', `Loaded session ${r.sessionId}.`, r.settledChildren > 0 ? `${r.settledChildren} unfinished child record(s) were settled before continuation.` : undefined);
      // REQ-SHELL-078 read for a loaded session too: the windows were opened onto the previous session's agents and would otherwise show them (Part R's reading, ADR-0048 note).
      if (w.followedSessionId !== null && w.followedSessionId !== r.sessionId) w.personaWindows.destroyAll('a different session was loaded');
      return { ok: true, value: { sessionId: r.sessionId, settledChildren: r.settledChildren } };
    },
    'session.control': async (req, { senderId }) => {
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
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The prompt could not be recorded');
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
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session could not be followed');
    },
    'session.unsubscribe': (req, { senderId }) => {
      relay.unsubscribe(senderId, req.sessionId);
      mainWindows.clearFollowedSession(senderId, req.sessionId);
      void runHost.request({ kind: 'session.detach', sessionId: req.sessionId }, millis(5_000)).catch(() => undefined);
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
