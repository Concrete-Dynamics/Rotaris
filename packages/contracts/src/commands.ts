import { PAUSE_RESOLUTIONS, PausePayloadSchema } from './control.js';
import { CONFIG_SCOPES, DesktopSaveSchema, LiveStateSchema } from './config.js';
import { z } from 'zod';
import { ControlRequestSchema } from './control.js';
import { HOOK_AGENT_IDS } from './hooks.js';
import { PROVIDER_DIALOG_MODES } from './providers.js';
import { PaneLayoutSchema } from './repository.js';
import { SANDBOX_MODE_NAMES } from './config.js';

/** REQ-SHELL-069: the pane-layout keys registered so far — the Overview's and the Git view's (REQ-GIT-153). */
const PREFERENCE_COMMAND_KEYS = ['ui/reduced_motion', 'interface/settingsTab', 'panels/overview', 'panels/git'] as const;

/**
 * Channel 5: request/response. Every command returns an explicit outcome
 * value rather than throwing across the boundary, because REQ-NOTIFY-005
 * needs a headline and a detail block, which is a value (ADR-0044).
 *
 * The reconcile of REQ-MONITOR-226, the subscribe/unsubscribe of
 * REQ-SHELL-151 and the page-older-rows of REQ-SESSION-192 are all commands.
 * No sixth channel exists for reconciliation: the response is ordinary
 * traffic on channels 1 and 2.
 */
export const CommandOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown().optional() }),
  z.object({ ok: z.literal(false), code: z.string(), headline: z.string(), detail: z.string().optional() }),
]);
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;

export const CommandRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shell.hello') }),
  z.object({ kind: z.literal('theme.get') }),
  z.object({ kind: z.literal('theme.set'), name: z.string().min(1) }),
  z.object({ kind: z.literal('prefs.get'), key: z.enum(PREFERENCE_COMMAND_KEYS) }),
  /** REQ-SHELL-069: a pane layout is a versioned record under `panels/`, per user. */
  z.object({ kind: z.literal('prefs.set'), key: z.enum(PREFERENCE_COMMAND_KEYS), value: z.union([z.boolean(), z.string(), PaneLayoutSchema]) }),
  /**
   * REQ-CHAT-011: a submission with no session starts one; the text becomes row 0, kind `user`.
   * REQ-SHELL-125 / REQ-GIT-021/118/158 (Part O): the launch dialog's choices ride along — isolation with its branch
   * (the id it was derived from is the one main minted through `session.newId`), or an attach path already checked,
   * never both (REQ-GIT-158 makes that refusal unreachable); and the sandbox mode.
   */
  z.object({ kind: z.literal('session.start'), prompt: z.string().min(1), isolation: z.object({ branch: z.string().min(1) }).optional(), attach: z.object({ path: z.string().min(1) }).optional(), sandboxMode: z.enum(SANDBOX_MODE_NAMES).optional() }),
  /** REQ-GIT-118: the id the launch dialog shows in its default branch; main mints it and uses it for the next isolated start. */
  z.object({ kind: z.literal('session.newId') }),
  z.object({ kind: z.literal('session.list') }),
  /** REQ-MONITOR-168 / REQ-GIT-102: the repository card's reads, relayed to the workspace service (ADR-0038). */
  z.object({ kind: z.literal('repository.read') }),
  /** REQ-GIT-105: the Git view's refresh, relayed to the workspace service; a missing Git raises REQ-GIT-104's notice in main. */
  z.object({ kind: z.literal('git.read') }),
  /** REQ-GIT-110/115: the user's own worktree at the user's own path — not under `.rotaris/`. */
  z.object({ kind: z.literal('worktree.create'), branch: z.string().min(1), path: z.string().min(1) }),
  /** REQ-GIT-111/117: `force` only after Git refused for uncommitted work and the second confirmation was accepted. */
  z.object({ kind: z.literal('worktree.remove'), path: z.string().min(1), force: z.boolean() }),
  /** REQ-GIT-158: main's folder chooser, then the service's REQ-GIT-011 check; the path and branch or the refusal come back. */
  z.object({ kind: z.literal('worktree.chooseAttach') }),
  /** REQ-GIT-116: whether a directory exists and is non-empty, for the dialog's live message (the renderer has no filesystem). */
  z.object({ kind: z.literal('worktree.probePath'), path: z.string().min(1) }),
  /**
   * ADR-0039 (Part P): the checkpoints card and its restore flow. The listing reads rows only (REQ-GIT-050); the preview
   * and the restore are main's orchestration over the run host (rows, liveness) and the workspace service (Git);
   * one desktop checkpoint operation is in flight at a time (REQ-GIT-091) — a second is declined with code `checkpoint.busy`.
   */
  z.object({ kind: z.literal('checkpoints.list'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('checkpoints.preview'), sessionId: z.string().min(1), sequence: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('checkpoints.restore'), sessionId: z.string().min(1), sequence: z.number().int().nonnegative(), force: z.boolean() }),
  z.object({ kind: z.literal('session.resume'), sessionId: z.string().min(1) }),
  /** REQ-CHAT-011 again for a loaded session with no active run: append the user row. */
  z.object({ kind: z.literal('session.prompt'), sessionId: z.string(), prompt: z.string().min(1) }),
  /** REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause or continue a paused session. */
  z.object({ kind: z.literal('session.continue'), sessionId: z.string().min(1), action: z.enum(PAUSE_RESOLUTIONS) }),
  /** REQ-SESSION-109: a surface attached to a session paused at the limit asks main for the dialog; the dialog window reads its payload. */
  z.object({ kind: z.literal('pause.present'), payload: PausePayloadSchema }),
  z.object({ kind: z.literal('pause.payload') }),
  /** Begin following: every attach starts with a whole-session update (REQ-MONITOR-214). */
  z.object({ kind: z.literal('session.subscribe'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.unsubscribe'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.reconcile'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.pageOlder'), sessionId: z.string(), beforeIndex: z.number().int() }),
  /** ADR-0010 channel 1 over channel 5: the shell resolves focus to a session id before sending (ADR-0013). */
  z.object({ kind: z.literal('session.control'), request: ControlRequestSchema }),
  z.object({ kind: z.literal('notice.acknowledge'), noticeId: z.number().int() }),
  /** REQ-SESSION-201: main supplies the dialogs and nothing else; the work runs in the workspace service (ADR-0002 c.7). */
  z.object({ kind: z.literal('workspace.backup') }),
  z.object({ kind: z.literal('workspace.restore') }),
  z.object({ kind: z.literal('shell.switchView'), view: z.string() }),
  /** REQ-TOOLS-063: the approval dialog window asks main for the request it was opened for, and how many others wait. */
  z.object({ kind: z.literal('approval.payload') }),
  /** ADR-0015: the Hooks tab (REQ-HOOKS-103..105/109/136/137) and the review dialog (REQ-HOOKS-106/107). Every read re-reads the sources (REQ-CONFIG-014). */
  z.object({ kind: z.literal('hooks.summary'), sessionId: z.string().optional() }),
  z.object({ kind: z.literal('hooks.review') }),
  z.object({ kind: z.literal('hooks.reviewPayload') }),
  z.object({ kind: z.literal('hooks.reviewDecide'), trusted: z.boolean() }),
  z.object({ kind: z.literal('hooks.clearDecision') }),
  z.object({ kind: z.literal('hooks.setToggle'), agent: z.enum(HOOK_AGENT_IDS), hookId: z.string().nullable(), on: z.boolean() }),
  /** REQ-ORCH-026: the built-in playbook catalogue for the settings listing. */
  z.object({ kind: z.literal('playbooks.catalogue') }),
  /** ADR-0037: Tier A through the workspace service (read, save, write a field); Tier B's live state to the run host. */
  z.object({ kind: z.literal('config.read') }),
  z.object({ kind: z.literal('config.save'), save: DesktopSaveSchema }),
  z.object({ kind: z.literal('config.setField'), scope: z.enum(CONFIG_SCOPES).optional(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal('config.liveState'), state: LiveStateSchema }),
  /** ADR-0030 / REQ-PROVIDER-140..143/147: the provider list and its actions, answered by main itself (the store lives there). No reply carries a credential. */
  z.object({ kind: z.literal('providers.list') }),
  z.object({ kind: z.literal('providers.health'), id: z.string().min(1) }),
  /** REQ-PROVIDER-116/117/142: open the authentication window in a mode; the window reads its payload. */
  z.object({ kind: z.literal('providers.open'), mode: z.enum(PROVIDER_DIALOG_MODES), providerId: z.string().optional() }),
  z.object({ kind: z.literal('provider.payload') }),
  /** The pasted key travels INWARD here and nowhere else; `openai-compatible` as providerId means a custom instance from label + URL. */
  z.object({ kind: z.literal('provider.signIn'), providerId: z.string().min(1), label: z.string().optional(), baseUrl: z.string().optional(), apiKey: z.string(), replace: z.boolean().optional(), allowEmpty: z.boolean().optional() }),
  z.object({ kind: z.literal('providers.save'), id: z.string().min(1), apiKey: z.string(), baseUrl: z.string().nullable(), validate: z.boolean() }),
  z.object({ kind: z.literal('providers.validate'), id: z.string().min(1) }),
  z.object({ kind: z.literal('providers.signOut'), id: z.string().min(1) }),
  z.object({ kind: z.literal('providers.delete'), id: z.string().min(1) }),
  z.object({ kind: z.literal('providers.refresh'), ids: z.union([z.literal('all'), z.array(z.string())]) }),
  /** ADR-0034 (Part S) / REQ-MCP-091/092/094/109: the MCP settings category, relayed to the run host, which holds the pipeline, the probe and the session override. */
  z.object({ kind: z.literal('mcp.list') }),
  z.object({ kind: z.literal('mcp.probe'), name: z.string().min(1).optional() }),
  z.object({ kind: z.literal('mcp.setEnabled'), name: z.string().min(1), enabled: z.boolean() }),
  z.object({ kind: z.literal('mcp.secrets'), server: z.string().optional() }),
]);
export type CommandRequest = z.infer<typeof CommandRequestSchema>;
export type CommandKind = CommandRequest['kind'];

/** The one frozen namespace the preload exposes (ADR-0044): an explicit method list, nothing else. */
export interface RendererBridge {
  readonly command: (req: CommandRequest) => Promise<CommandOutcome>;
  readonly onTranscriptIncrement: (fn: (p: unknown) => void) => () => void;
  readonly onSessionSnapshot: (fn: (p: unknown) => void) => () => void;
  readonly onTerminalFrame: (fn: (p: unknown) => void) => () => void;
  readonly onNotice: (fn: (p: unknown) => void) => () => void;
  readonly onThemeChanged: (fn: (p: unknown) => void) => () => void;
  readonly onConfigChanged: (fn: (p: unknown) => void) => () => void;
}
export const BRIDGE_KEY = 'rotaris' as const;
