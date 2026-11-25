import { ISOLATION_REQUIRED_HINT, SANDBOX_MODE_NAMES, type CommandOutcome, type ImageAttachmentInput, type ProcessReply, type RunHostRequest, type SandboxModeName, type WorktreeBinding } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import type { CommandContext, MainWindowState } from './commands/context.js';
import type { ReportInput } from './notices.js';

/**
 * THE ONE MAIN-SIDE START COORDINATOR (REQ-MCP-124, ADR-0067; the authority map of 2026-11-10 named this the highest
 * hazard of the inbound surface). Every way a run is started in main — the desktop composer's `session.start` and the
 * MCP surface's `rotaris_start_run` — goes through `startSessionRun` here, so the workspace binding, the workspace
 * fence and the run-host admission a desktop start meets are the ones an external caller meets, unchanged.
 *
 * Three things this module fixes that a second, parallel start path would get wrong:
 *
 * 1. **The request is built from the trusted desktop state, never from a caller.** `startSessionRun` takes a
 *    `SessionStartInput` that a caller may not fill in: the workspace (`workspaceId`, `workspaceRoot`) is the OPEN one,
 *    and the authority-bearing fields (`sandboxMode`, `isolation`, `attach`, `boardPermissions`) are supplied by the
 *    desktop path alone. The inbound path fills none of them (REQ-MCP-124: no permission, approval or sandbox model of
 *    its own).
 * 2. **The workspace is re-checked at the shared fence.** `openWorkspace` is read TWICE — once when the coordinator
 *    takes the request, once immediately before the run host is asked. A workspace switched in between (a `REQ-SHELL-017`
 *    replacement, or a second window's open) means the run would execute against a root the caller did not name, so the
 *    start is REFUSED with `session.workspace-changed` rather than launched (the advisor's "stale workspace state").
 * 3. **An inconsistent internal request is refused, not launched.** `checkStartInput` holds the input to the invariants
 *    the run host's own schema states (a non-empty workspace id, a prompt or an attachment, a sandbox mode of the closed
 *    set); a request that does not hold is refused before anything is created, so a hand-built request cannot reach the
 *    host as a stronger run.
 */

/** What the run host records: `contracts`' own closed set of sandbox mode names (REQ-SHELL-125), read rather than restated. */
export type SessionStartSandboxMode = SandboxModeName;

export const SESSION_START_SANDBOX_MODES: readonly SessionStartSandboxMode[] = SANDBOX_MODE_NAMES;

/**
 * The START INPUT the coordinator accepts. Every field a caller might be tempted to fill is optional and filled by the
 * desktop path; the inbound path passes `prompt` alone, with `workspaceId`/`workspaceRoot` from the open desktop session.
 */
export interface SessionStartInput {
  /** The open workspace's id (`REQ-SESSION`); the coordinator re-checks it before the host is asked. */
  readonly workspaceId: string;
  /** The open workspace's root, canonical. */
  readonly workspaceRoot: string;
  readonly prompt: string;
  /**
   * REQ-MCP-124/126: a session id the CALLER has already minted, so the surface's single-run slot can be tied to the very
   * session this start will take before the run host has answered (BLOCKER 2, 2026-11-25). The desktop path leaves it
   * unset and takes the dialog's minted id or a fresh one; the inbound path names it, because a run whose reply is lost
   * must still be releaseable by its own `run.result` (see `InboundSurfaceRuns.ended`).
   */
  readonly sessionId?: string | undefined;
  readonly attachments?: readonly ImageAttachmentInput[] | undefined;
  /** REQ-GIT-022: an isolated worktree the DESKTOP asked for; the inbound path states none (REQ-MCP-124). */
  readonly isolation?: { readonly branch: string } | undefined;
  /** REQ-GIT-021: an existing worktree to attach; never from the inbound path. */
  readonly attach?: { readonly path: string } | undefined;
  /** REQ-SHELL-125: the desktop's sandbox choice; never from the inbound path. */
  readonly sandboxMode?: SessionStartSandboxMode | undefined;
  /** The window the desktop start belongs to; absent for a start with no window (the surface's). */
  readonly window?: MainWindowState | undefined;
}

/** What the coordinator needs: the run-host link, the workspace services, the notices, the window registry and the log. */
export interface SessionStartDeps {
  readonly log: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
  readonly runHost: Pick<CommandContext['runHost'], 'request'>;
  readonly services: CommandContext['services'];
  readonly mainWindows: Pick<CommandContext['mainWindows'], 'takeMintedSession' | 'beginStart' | 'endStart'>;
  readonly notices: Pick<CommandContext['notices'], 'report' | 'clearForRunStart'>;
  readonly raiseNotice: CommandContext['raiseNotice'];
  readonly recoveryFor: CommandContext['recoveryFor'];
  readonly configFatal?: Pick<NonNullable<CommandContext['configFatal']>, 'loaded'> | undefined;
  /**
   * REQ-SESSION-089 / REQ-SESSION-202 / OQ-281: the condition the last open of `workspace` refused its store for, so a
   * start in that workspace is said as the store that could not be opened rather than as "no workspace".
   */
  readonly storeRefusal?: CommandContext['storeRefusal'];
  /**
   * Point 2 — the shared fence's read (`CommandContext.openWorkspaceRead`): the workspace open RIGHT NOW for `wcId`.
   */
  readonly openWorkspaceRead: CommandContext['openWorkspaceRead'];
  /** REQ-NOTIFY-060/061: the confinement refusal notice, built where it stands (the command facet owns it). */
  readonly confinementNotice: (r: { readonly headline: string; readonly detail?: string | undefined }) => ReportInput;
}

/** The outcome of a validated start attempt, before any process is asked: what to launch, and the session id it will take. */
export interface ValidatedStart {
  readonly binding: WorktreeBinding | undefined;
  readonly sessionId: string;
  /** The worktree placement main forced because another run shares the tree (`REQ-MONITOR-251`, `PD-GIT-001`); undefined when none was forced. */
  readonly forcedSessionId: string | undefined;
}

/** A refusal with the code and wording the surface shows, in the coordinator's own words. */
export interface StartRefusal {
  readonly ok: false;
  readonly code: string;
  readonly headline: string;
  readonly detail?: string;
}

/**
 * The invariants the run host's own `session.start` schema states, checked before the host sees them (point 3 above).
 * A refusal names the field, never a value.
 */
export function checkStartInput(input: Pick<SessionStartInput, 'workspaceId' | 'workspaceRoot' | 'prompt' | 'attachments' | 'sandboxMode'>): StartRefusal | null {
  if (input.workspaceId.trim() === '') return { ok: false, code: 'session.workspace-none', headline: 'No workspace is open' };
  if (input.workspaceRoot.trim() === '') return { ok: false, code: 'session.workspace-none', headline: 'No workspace is open' };
  const hasPrompt = input.prompt.trim() !== '';
  const hasAttachments = (input.attachments?.length ?? 0) > 0;
  if (!hasPrompt && !hasAttachments) return { ok: false, code: 'session.empty', headline: 'A prompt or an attachment is required' };
  if (input.sandboxMode !== undefined && !SESSION_START_SANDBOX_MODES.includes(input.sandboxMode)) {
    return { ok: false, code: 'session.sandbox-mode', headline: 'The sandbox mode is not one this product offers' };
  }
  return null;
}

/** REQ-MONITOR-251 / PD-GIT-001: the runs a launch in this workspace would share a working tree with, or null when the count cannot be read. */
async function sharingRunCount(deps: SessionStartDeps, workspaceId: string): Promise<number | null> {
  const active = await deps.runHost.request({ kind: 'runs.active', workspaceId, scope: 'sharing' }, millis(5_000)).catch(() => null);
  return active?.kind === 'runs.count' ? active.count : null;
}

/**
 * The coordinator's second read of the open workspace (point 2 above): immediately before the host is asked, the
 * workspace the coordinator was handed must still be the one open. `openWorkspace()` answers the open workspace as main
 * holds it now; a different id, or a root that no longer matches, refuses the start.
 */
export interface OpenWorkspaceRead {
  readonly workspaceId: string;
  readonly workspace: string;
}

/**
 * Starts a run through the one main-side coordinator. Answers the same `CommandOutcome` every command does, so neither
 * caller has a second failure shape to read: `{ok:true, value:{sessionId}}` on a start, a refusal otherwise.
 */
export async function startSessionRun(deps: SessionStartDeps, input: SessionStartInput): Promise<CommandOutcome> {
  const { log, runHost, services, mainWindows, notices } = deps;
  // Point 3: the run host's own invariants, checked before anything is created.
  const inconsistent = checkStartInput(input);
  if (inconsistent !== null) {
    log(`run refused before start: the request was inconsistent (${inconsistent.code})`);
    return inconsistent;
  }
  // REQ-SESSION-089 / REQ-SESSION-202 (OQ-281): a store the open refused is said as that, and nothing was started.
  const held = input.workspaceRoot === '(no workspace)' ? undefined : deps.storeRefusal?.(input.workspaceRoot);
  if (held) {
    log(`run refused before start: the session store could not be opened (${held.code}); nothing was started`);
    return { ok: false, code: held.code, headline: 'Nothing was started: the session store for this workspace could not be opened', ...(held.detail === undefined ? {} : { detail: held.detail }) };
  }
  const root = canonicalPath(input.workspaceRoot);
  const svc = services.get(root);
  const window = input.window;
  const wcId = window?.wcId ?? null;

  // REQ-GIT-021: the two conflicting choices, refused before anything is created (REQ-GIT-158 makes this unreachable from the dialog).
  if (input.isolation && input.attach) {
    log('run refused before start: isolation and attach together');
    return { ok: false, code: 'session.worktree-options', headline: 'Choose either an isolated worktree or an existing worktree to attach, not both.' };
  }

  let binding: WorktreeBinding | undefined;
  let sessionId: string | undefined;
  let effectiveIsolation = input.isolation;
  const effectiveAttach = input.attach;
  let forcedSessionId: string | undefined;
  if (!effectiveIsolation && !effectiveAttach) {
    const sharing = await sharingRunCount(deps, input.workspaceId);
    if (sharing === null || sharing > 0) {
      forcedSessionId = input.sessionId ?? (wcId === null ? undefined : mainWindows.takeMintedSession(wcId)) ?? randomUUID();
      effectiveIsolation = { branch: `rotaris/session/${forcedSessionId}` };
      log(`concurrent start while ${sharing === null ? 'the active-run count could not be read' : `${sharing} run(s) share this workspace's tree`}: force-creating isolated worktree ${effectiveIsolation.branch} (REQ-MONITOR-251, PD-GIT-001)`);
    }
  }
  if (effectiveIsolation || effectiveAttach) {
    if (!svc) { log('run refused before start: the workspace service is not running'); return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' }; }
    sessionId = input.sessionId ?? forcedSessionId ?? (wcId === null ? undefined : mainWindows.takeMintedSession(wcId)) ?? randomUUID();
    const bindFailure = (r: ProcessReply): CommandOutcome => {
      const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
      const headline = `Error: could not create or attach the requested worktree: ${detail}`;
      deps.raiseNotice('error', headline);
      log(`run refused before start: ${headline}`);
      return { ok: false, code: 'session.worktree', headline, detail };
    };
    const unreachable = (cause: Error) => ({ kind: 'refused' as const, code: 'link.unreachable', headline: 'The workspace service did not answer', detail: cause.message });
    if (effectiveIsolation) {
      const config = await svc.link.request({ kind: 'config.read', workspaceRoot: root }, millis(10_000)).catch(unreachable);
      if (config.kind !== 'config.snapshot') return bindFailure(config);
      if (!config.snapshot.loadOk) {
        const headline = 'The run was refused before it started';
        const detail = config.snapshot.fatal ?? 'The configuration could not be loaded.';
        deps.raiseNotice('error', headline, detail);
        log(`run refused before start: the configuration did not load, so no worktree was created — ${detail.split('\n')[0]}`);
        return { ok: false, code: 'session.configuration', headline, detail };
      }
      const made = await svc.link.request({ kind: 'worktree.create', workspaceRoot: root, branch: effectiveIsolation.branch, collisionSafe: true, target: { kind: 'session', sessionId, subpath: config.snapshot.worktreeStorageSubpath } }, millis(120_000)).catch(unreachable);
      if (made.kind !== 'worktree.created') return bindFailure(made);
      binding = { worktree_path: made.path, branch: made.branch, base_branch: made.baseBranch, base_revision: made.baseRevision, created_by_session: true, merge_status: 'ready', integration_session_id: null };
    } else if (effectiveAttach) {
      const checked = await svc.link.request({ kind: 'worktree.checkAttach', workspaceRoot: root, path: effectiveAttach.path }, millis(60_000)).catch(unreachable);
      if (checked.kind !== 'worktree.attachable') return bindFailure(checked);
      binding = { worktree_path: checked.path, branch: checked.branch, base_branch: checked.baseBranch, base_revision: checked.baseRevision, created_by_session: false, merge_status: 'ready', integration_session_id: null };
    }
  }
  sessionId ??= input.sessionId ?? randomUUID();
  if (wcId !== null) mainWindows.beginStart(wcId, sessionId);

  /**
   * Point 2 — THE SHARED FENCE. Between the caller's validation above and the run host's admission, main may have
   * switched the open workspace (a `REQ-SHELL-017` replacement, or another window's open). Launching now would start a
   * run against a root no one asked for, so the fence re-reads the open workspace and refuses on any disagreement:
   * a different id, a different root, or no open workspace at all.
   */
  const stillOpen = await deps.openWorkspaceRead(wcId);
  if (stillOpen === null || stillOpen.workspaceId !== input.workspaceId || canonicalPath(stillOpen.workspace) !== root) {
    if (wcId !== null) mainWindows.endStart(wcId, sessionId);
    // The tree this request created is taken away again, since no session came to exist (REQ-GIT-023).
    if (binding?.created_by_session && svc) {
      const path = binding.worktree_path;
      void svc.link.request({ kind: 'worktree.remove', workspaceRoot: root, path, force: true }, millis(60_000)).then((x) => log(`worktree ${path} removed after the refused start (${x.kind})`)).catch(() => undefined);
    }
    log('run refused before start: the open workspace changed between the request and admission (REQ-MCP-124, the shared fence)');
    return { ok: false, code: 'session.workspace-changed', headline: 'The workspace changed before the run could start, so nothing was started' };
  }

  const runHostRequest: Extract<RunHostRequest, { kind: 'session.start' }> = {
    kind: 'session.start', workspaceId: input.workspaceId, prompt: input.prompt,
    ...(input.attachments === undefined ? {} : { attachments: [...input.attachments] }),
    sessionId,
    ...(binding === undefined ? {} : { effectiveRoot: binding.worktree_path, worktree: binding }),
    ...(input.sandboxMode === undefined ? {} : { sandboxMode: input.sandboxMode }),
  };
  const r = await runHost.request(runHostRequest, millis(10_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'run-host.unreachable', headline: 'The run host did not answer', detail: cause.message }));
  if (r.kind !== 'session.started') {
    if (wcId !== null) mainWindows.endStart(wcId, sessionId);
    if (binding?.created_by_session && svc) {
      const path = binding.worktree_path;
      void svc.link.request({ kind: 'worktree.remove', workspaceRoot: root, path, force: true }, millis(60_000)).then((x) => log(`worktree ${path} removed after the refused start (${x.kind})`)).catch(() => undefined);
    }
    if (r.kind === 'refused') {
      if (r.code === 'session.confinement') void notices.report(deps.confinementNotice(r));
      else deps.raiseNotice('error', r.headline, r.detail, r.code === 'session.no-model' || r.code === 'session.provider-auth' ? deps.recoveryFor('config.models') : undefined);
      log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    return { ok: false, code: r.kind === 'refused' ? r.code : 'reply.unexpected', headline: 'The session could not be started', detail: r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}` };
  }
  if (binding) log(`session ${r.sessionId} bound to ${binding.worktree_path} on ${binding.branch} (${binding.created_by_session ? 'created by the session' : 'attached'})`);
  await notices.clearForRunStart(r.sessionId);
  if (deps.configFatal) await deps.configFatal.loaded(root);
  if (forcedSessionId !== undefined && binding) deps.raiseNotice('info', ISOLATION_REQUIRED_HINT, `This session runs on branch ${binding.branch}.`, undefined, r.sessionId);
  window?.personaWindows.destroyAll('a new session started');
  return { ok: true, value: { sessionId: r.sessionId } };
}
