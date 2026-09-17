import { PAUSE_RESOLUTIONS, PausePayloadSchema, PLAN_DECISIONS } from './control.js';
import { CONFIG_SCOPES, DesktopSaveSchema, LiveStateSchema } from './config.js';
import { z } from 'zod';
import { ControlRequestSchema } from './control.js';
import { HOOK_AGENT_IDS } from './hooks.js';
import { PROVIDER_DIALOG_MODES } from './providers.js';
import { PaneLayoutSchema } from './repository.js';
import { SANDBOX_MODE_NAMES } from './config.js';
import { PromptListSchema } from './library.js';
import { ImprovementCommandSchema } from './improvements.js';
import { ImageAttachmentInputSchema } from './channels.js';
import { RequirementsCommandSchema } from './requirements.js'; // Part AK
import { RequirementsRunsCommandSchema } from './requirements.js'; // Part AP
import { TERMINAL_COMMAND_SCHEMAS, TERMINAL_WINDOW_COMMAND_SCHEMAS } from './terminal.js';
import { PROMPTS_COMMAND_SCHEMAS } from './slash.js'; // Part AO
import { SKILLS_COMMAND_SCHEMAS } from './skills.js'; // ADR-0063
import { NoticeSeveritySchema } from './notices.js'; // Part AO

/**
 * REQ-SHELL-069: the pane-layout keys registered so far — the Overview's, the Git view's (REQ-GIT-153) and,
 * from Part X, the Library's. `panels/library` is REQ-SHELL-069's rule applied without a suffix: the key is the
 * lower-cased view name of REQ-SHELL-023, and the `{view}.{arrangement}` form is for "a view carrying more than
 * one independent multi-pane arrangement", which the Library does not — the Prompts tab's one split is the whole
 * of it (REQ-LIBRARY-106), and the other two tabs declare no divider.
 *
 * `display/groupTools` is REQ-CHAT-067's tool-grouping switch, default ON — a desktop preference in the preference
 * store (REQ-CONFIG-405), explicitly NOT part of the YAML configuration surface, unlike REQ-CHAT-166's four caps.
 * Part AA registers the transcript's two display preferences, both **user-wide desktop preferences**
 * (REQ-CONFIG-405) and neither part of the YAML configuration surface: **`display/showReasoning`**, the key
 * REQ-CHAT-167 names literally, default **off**; and **`display/autoCollapseTools`** (REQ-CHAT-067), default
 * **off**. REQ-CHAT-166's four tool-content caps are NOT here — those are workspace configuration, written to
 * the `display` section of `agents.yaml`, and are Part Z's.
 *
 * Part AB adds `panels/workspace` — REQ-CHAT-010's transcript/composer divider, an ordinary multi-pane divider
 * under REQ-SHELL-069's key rule, keyed by the lower-cased view name for the same reason `panels/library` is.
 * The **composer draft** is deliberately NOT here: REQ-SHELL-159 registers it as `workspaces/{workspace-key}/
 * composerDraft`, a key parametrised by the open workspace, and a renderer that could name the parameter could
 * name another workspace's draft — which is exactly what REQ-CHAT-015's last sentence forbids. It travels as
 * `composer.readDraft` / `composer.writeDraft` below, which carry no key at all: main derives it from the
 * workspace it has open, so the renderer cannot ask for a draft that is not its own.
 */
// Part AK2
/**
 * Spec 08 §Persisted state (Part AK′; REQ-TRACE-301): the requirements board's person-level keys, reachable from a
 * window through `prefs.get` / `prefs.set` like every other key of that table, and ONE placeholder for the
 * per-workspace fold key. `workspaces/{workspace}/requirementColumnFolds` is written literally by the renderer and
 * resolved by MAIN to `workspaces/<digest of the open workspace>/requirementColumnFolds` (REQ-TRACE-312), the same
 * discipline the composer draft takes above: a renderer names no workspace, so a fold recorded in one workspace
 * cannot be read into another (REQ-TRACE-497's "a fold made in one workspace taking effect in another").
 */
export const REQUIREMENT_FOLDS_PREFERENCE_KEY = 'workspaces/{workspace}/requirementColumnFolds';
export const REQUIREMENTS_PREFERENCE_KEYS = ['requirements/filter/text', 'requirements/filter/epic', 'requirements/filter/source', 'requirements/filter/lifecycle', 'requirements/filter/health', 'requirements/filter/priority', 'requirements/sort', 'requirements/blocked_column', 'requirements/axis', 'requirements/fullPermissionRuns', 'requirements/fullPermissionNoticeSuppressed', 'requirements/answerWaitSeconds', REQUIREMENT_FOLDS_PREFERENCE_KEY] as const;
const PREFERENCE_COMMAND_KEYS = ['ui/reduced_motion', 'interface/settingsTab', 'panels/overview', 'panels/git', 'panels/library', 'panels/workspace', 'interface/agentPopOut', 'display/groupTools', 'display/showReasoning', 'display/autoCollapseTools', ...REQUIREMENTS_PREFERENCE_KEYS] as const;

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
   * REQ-CHAT-015 / REQ-SHELL-159 / REQ-NOTIFY-066 (Part AB): the composer draft of the workspace this instance
   * has open. Neither command names a key or a workspace — main resolves `workspaces/{workspace-key}/composerDraft`
   * from the workspace it opened — so "a draft stored against one workspace MUST NOT appear in the composer of
   * any other workspace" holds by construction rather than by the renderer being careful. The write carries the
   * text verbatim, including the empty string, which is how a cleared composer is cleared in the store too.
   */
  z.object({ kind: z.literal('composer.readDraft') }),
  z.object({ kind: z.literal('composer.writeDraft'), text: z.string() }),
  /**
   * REQ-CHAT-011: a submission with no session starts one; the text becomes row 0, kind `user`.
   * REQ-SHELL-125 / REQ-GIT-021/118/158 (Part O): the launch dialog's choices ride along — isolation with its branch
   * (the id it was derived from is the one main minted through `session.newId`), or an attach path already checked,
   * never both (REQ-GIT-158 makes that refusal unreachable); and the sandbox mode.
   */
  z.object({ kind: z.literal('session.start'), prompt: z.string(), attachments: z.array(ImageAttachmentInputSchema).max(10).optional(), isolation: z.object({ branch: z.string().min(1) }).optional(), attach: z.object({ path: z.string().min(1) }).optional(), sandboxMode: z.enum(SANDBOX_MODE_NAMES).optional() }).refine((v) => v.prompt.trim() !== '' || (v.attachments?.length ?? 0) > 0, { message: 'A prompt or attachment is required.' }),
  /** REQ-GIT-118: the id the launch dialog shows in its default branch; main mints it and uses it for the next isolated start. */
  z.object({ kind: z.literal('session.newId') }),
  z.object({ kind: z.literal('session.list') }),
  /**
   * Part Y — the Library's Artifacts tab and its inspector (REQ-LIBRARY-108/131..136). Main relays each to the
   * run host, which owns the store and the session's files, exactly as it relays `timeline.append`.
   */
  z.object({ kind: z.literal('artifacts.list') }),
  z.object({ kind: z.literal('artifacts.body'), ref: z.string().min(1) }),
  z.object({ kind: z.literal('artifacts.save'), ref: z.string().min(1), body: z.string() }),
  /** REQ-LIBRARY-109..120/166..176: workspace-scoped improvement review and user-chosen exports. */
  z.object({ kind: z.literal('improvements'), command: ImprovementCommandSchema }),
  z.object({ kind: z.literal('improvements.export'), artifactId: z.string().min(1).optional() }),
  z.object({ kind: z.literal('improvements.undoReview'), id: z.string().min(1) }),
  z.object({ kind: z.literal('improvements.start'), artifactId: z.string().min(1) }),
  /** PD-LIBRARY-002: the user's explicit gesture, and the only way a retrospective ever starts. */
  z.object({ kind: z.literal('improvements.retrospective') }),
  z.object({ kind: z.literal('improvements.rollbackPreview'), artifactId: z.string().min(1) }),
  z.object({ kind: z.literal('improvements.rollback'), artifactId: z.string().min(1), force: z.boolean() }),
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
  z.object({ kind: z.literal('session.prompt'), sessionId: z.string(), prompt: z.string(), attachments: z.array(ImageAttachmentInputSchema).max(10).optional() }).refine((v) => v.prompt.trim() !== '' || (v.attachments?.length ?? 0) > 0, { message: 'A prompt or attachment is required.' }),
  /** REQ-CHAT-173: thumbnail bytes are fetched on demand and never join a transcript snapshot. */
  z.object({ kind: z.literal('session.readAttachment'), sessionId: z.string().min(1), path: z.string().min(1), digest: z.string().regex(/^[0-9a-f]{64}$/) }),
  /** REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause or continue a paused session. */
  z.object({ kind: z.literal('session.continue'), sessionId: z.string().min(1), action: z.enum(PAUSE_RESOLUTIONS) }),
  /**
   * REQ-ORCH-153/154 (ADR-0062): the plan gate's two entries. A session command and not a control operation —
   * the run is PARKED at the gate, so there is no live run to control and the answer must reach a session whose
   * hosting process may have exited since. `planEdit` writes the user's text and approves nothing; `planDecision`
   * carries one of exactly three answers, with the stated changes `revise` hands to the next cycle.
   */
  z.object({ kind: z.literal('session.planEdit'), sessionId: z.string().min(1), text: z.string() }),
  z.object({ kind: z.literal('session.planDecision'), sessionId: z.string().min(1), decision: z.enum(PLAN_DECISIONS), changes: z.string().optional() }),
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
  /** REQ-NOTIFY-026: compare-and-clear with an id; no id clears whatever notice is current (Part V). */
  z.object({ kind: z.literal('notice.acknowledge'), noticeId: z.number().int().optional() }),
  /** REQ-SESSION-201: main supplies the dialogs and nothing else; the work runs in the workspace service (ADR-0002 c.7). */
  z.object({ kind: z.literal('workspace.backup') }),
  z.object({ kind: z.literal('workspace.restore') }),
  /**
   * Stage B — REQ-SHELL-021 / REQ-WORKSPACE-009: the title-bar chip's flow, raised by the window the user is
   * looking at. It carries **no folder**: main evaluates the gates, opens the native chooser and performs the
   * replacement (REQ-SHELL-017), so a renderer can neither name a workspace it was not given nor skip a gate.
   * Answered `{ cancelled: true }` for a gate that declined or a chooser the user dismissed, which REQ-SHELL-021
   * makes the same observable outcome: no window, workspace or stored preference moves.
   */
  /**
   * Stage B / Stage C. It carries no folder — main owns the gates, the chooser and the reading of every answer.
   * `newWindow` is `PD-SHELL-001`'s add route, decided by the GESTURE before the chooser opens (a native chooser
   * carries no buttons of ours, REQ-SHELL-164), and it is the whole difference between the two outcomes: with it,
   * REQ-SHELL-021's three gates are not evaluated and no window is closed.
   */
  z.object({ kind: z.literal('workspace.choose'), newWindow: z.boolean().optional() }),
  z.object({ kind: z.literal('shell.switchView'), view: z.string() }),
  /**
   * Part AA — REQ-CHAT-076: an `http(s)` link in transcript text opens in the SYSTEM BROWSER. The renderer is
   * sandboxed and must never navigate (ADR-0051), so a link is an element that asks for this command; main is
   * the only process that may hand a URL to the platform. **The opening is acknowledged and a failure is
   * reported**, never passed silently, which is why it is a command with an outcome rather than a fire-and-forget
   * message. Main refuses anything that is not `http:` or `https:` — the text is model-authored, and a
   * `file:`, `javascript:` or shell scheme reaching `shell.openExternal` would execute at the reader's expense.
   */
  z.object({ kind: z.literal('shell.openExternal'), url: z.string().min(1) }),
  /**
   * Part AG — REQ-SHELL-142: the About page's third-party licence bundle. It is a **local** file shipped with the
   * build, so it cannot travel through `shell.openExternal`, which refuses every scheme but `http(s)` for the
   * reason stated above. The renderer names no path: main knows where the build put the bundle and answers a
   * refusal when there is none, which is the branch that reaches in a build that ships no notices file.
   */
  z.object({ kind: z.literal('shell.openThirdPartyLicenses') }),
  /** REQ-TOOLS-063: the approval dialog window asks main for the request it was opened for, and how many others wait. */
  z.object({ kind: z.literal('approval.payload') }),
  /**
   * Part AC — REQ-CHAT-098/103: the approval trailer row shares the question trailer's one click handler, and an
   * approval's modal is a separate window (ADR-0019/ADR-0048), so "re-openable while pending" means raising the
   * window that is already up. Main answers false when the named request has no open dialog — a queued request
   * cannot jump the queue (REQ-TOOLS-063 shows one at a time, oldest first).
   */
  z.object({ kind: z.literal('approval.raise'), requestId: z.string().min(1) }),
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
  /**
   * ADR-0022 (Part AR) / REQ-SANDBOX-116, REQ-SANDBOX-129: the availability verdict the runtime
   * section's label shows, and the re-check control beside it. `recheck` discards the cached verdict
   * so a user who has just installed the launcher or lifted a namespace restriction can make the
   * product see it without restarting the application.
   */
  z.object({ kind: z.literal('confinement.status'), recheck: z.boolean().optional() }),
  /** ADR-0035 (Part T) / REQ-MCP-099/112: the code-intelligence project-setup action — start, cancel, or read its status; the run host runs the steps. */
  z.object({ kind: z.literal('mcp.setup'), action: z.enum(['start', 'cancel', 'status']) }),
  /**
   * ADR-0064 (Part AS) — project initialization, the five things a surface may ask of it.
   *
   * `read` is the refresh of REQ-WORKSPACE-115: the persisted section as it is on disk right now, and
   * nothing else disturbed. `resolve` is REQ-WORKSPACE-102's "Check again" — a user-requested
   * resolution that is additional to, and does not consume, the one automatic resolution per workspace
   * open. `start` re-reads the runnable list first (REQ-WORKSPACE-110), so a retry after a partly
   * successful run offers only what is outstanding. `skip` records every listed id (REQ-WORKSPACE-111),
   * and an empty list is still a skip that stamps the marker (REQ-WORKSPACE-086). `cancel` asks a live
   * run to stop; the task already under way still reaches its own conclusion (REQ-WORKSPACE-109).
   */
  z.object({ kind: z.literal('initialization.read') }),
  z.object({ kind: z.literal('initialization.resolve') }),
  z.object({ kind: z.literal('initialization.start') }),
  z.object({ kind: z.literal('initialization.skip'), ids: z.array(z.string()) }),
  z.object({ kind: z.literal('initialization.cancel') }),
  /**
   * ADR-0048's window registry, first executed (Part R; REQ-SHELL-072/073/076/078, REQ-MONITOR-072/073): open or raise the
   * persona window for an agent — reuse per persona, the instance's tab selected, a raise as a request (REQ-SHELL-161);
   * `focusSteer` when the inspector's Steer opened it (REQ-MONITOR-137). An unknown agent id is a silent no-op.
   */
  z.object({ kind: z.literal('window.openPersona'), persona: z.string().min(1), agentId: z.string().min(1), focusSteer: z.boolean().optional() }),
  /** The persona window asks main what it was opened for: its persona, the session the main window follows, the tab to select. */
  z.object({ kind: z.literal('window.personaPayload') }),
  /**
   * ADR-0048's application modality, second execution (Part W; REQ-SHELL-051/054): a main window's application-modal
   * surface (the command palette, the keyboard help) registers itself open or closed, and main's registry disables
   * input in every other window of that main window's family for the duration. From a main window only; a persona
   * window sending it is refused.
   */
  z.object({ kind: z.literal('window.modality'), active: z.boolean() }),
  /**
   * Part U — the session browser's actions (REQ-SESSION-182). `session.repair` with no id is "repair every stale session"
   * (REQ-SESSION-060); `session.delete` is behind the browser's permanent-deletion confirmation (REQ-SESSION-166);
   * `session.export` is the four records of REQ-SESSION-199 and `session.exportTrajectory` the trajectory document, or the
   * batch wrapper for several ids in selection order (REQ-SESSION-189, REQ-EVENTS-144) — main supplies the save dialog and
   * nothing is written until a destination is chosen; `session.openLog` and `session.revealFiles` are REQ-SESSION-191's
   * other two actions over the per-session files that exist (REQ-SESSION-002). None of these is a channel.
   */
  z.object({ kind: z.literal('session.repair'), sessionId: z.string().min(1).optional() }),
  z.object({ kind: z.literal('session.delete'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('session.export'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('session.exportTrajectory'), sessionIds: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('session.openLog'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('session.revealFiles'), sessionId: z.string().min(1) }),
  /**
   * Part X — the saved prompts (REQ-LIBRARY-137/138), mirroring the run host's three requests; main relays each
   * as it relays `timeline.append`, and bumps the library revision on a write (REQ-LIBRARY-105). No session id:
   * the lists belong to the workspace and outlive every session (REQ-LIBRARY-138). `remove` is required, not
   * defaulted — REQ-LIBRARY-107 makes keeping and removing two deliberate acts.
   */
  z.object({ kind: z.literal('prompts.read') }),
  z.object({ kind: z.literal('prompts.push'), list: PromptListSchema, text: z.string() }),
  z.object({ kind: z.literal('prompts.take'), list: PromptListSchema, index: z.number().int().nonnegative(), remove: z.boolean() }),
  // Part AK — the requirements family (spec 08; ADR-0041) travels as ONE envelope member carrying the seam's
  // `name`-discriminated command untouched; main stamps the actor and relays it to the workspace service.
  z.object({ kind: z.literal('requirements'), command: RequirementsCommandSchema }),
  // Part AL — the live terminal's control traffic (ADR-0021, REQ-TOOLS-128, REQ-SHELL-106/107); main relays each to the run host.
  ...TERMINAL_COMMAND_SCHEMAS,
  // Part AP — the board-run coordinator's one command (spec 08 §Runs Started from the Board; ADR-0041): a launch preview, a
  // dispatch, the permanent suppression and the live board runs are main's to answer, not the workspace service's.
  RequirementsRunsCommandSchema,
  // Part AL2 — the terminal WINDOW's five commands (REQ-SHELL-080/081/108..111), answered by main's window registry.
  ...TERMINAL_WINDOW_COMMAND_SCHEMAS,
  // Part AO — REQ-CHAT-160's read of the three prompt roots (relayed to the workspace service), and `notice.report`: a
  // renderer surface raising a PERSISTENT notice through main's one slot (ADR-0049 defect fifty-seven; REQ-CHAT-021 first
  // needed it). `sessionId` absent or empty means the focused run (REQ-NOTIFY-028); the record of REQ-NOTIFY-268 follows.
  ...PROMPTS_COMMAND_SCHEMAS,
  z.object({ kind: z.literal('notice.report'), severity: NoticeSeveritySchema, title: z.string().min(1), message: z.string().optional(), detail: z.string().optional(), persistent: z.boolean(), sessionId: z.string().optional() }),
  // ADR-0063 — portable skills (REQ-WORKSPACE-051..073, 151). None carries a workspace or a session: main names
  // the window's open workspace and the session it follows, and relays to the run host, which owns the catalog.
  ...SKILLS_COMMAND_SCHEMAS,
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
  /** Channel 8 (Part V): a transient acknowledgement for THIS window's stack (REQ-NOTIFY-013). */
  readonly onAcknowledgement: (fn: (p: unknown) => void) => () => void;
  readonly onThemeChanged: (fn: (p: unknown) => void) => () => void;
  readonly onConfigChanged: (fn: (p: unknown) => void) => () => void;
  /** Part X: the library-change broadcast (REQ-LIBRARY-105) — a revision counter, so a surface that is off screen re-reads when it is next shown. */
  readonly onLibraryChanged: (fn: (p: unknown) => void) => () => void;
  /** Channel 10 (Part AK): the requirements board's generation moved (REQ-TRACE-374) — the window re-reads the board. */
  readonly onRequirementsChanged: (fn: (p: unknown) => void) => () => void;
  /** REQ-LIBRARY-125: app-wide post-run analyst queue activity. */
  readonly onImprovementActivity: (fn: (p: unknown) => void) => () => void;
  /** Channel 12 (Part AS, ADR-0064): the nine values of REQ-WORKSPACE-105 and REQ-WORKSPACE-109's live run report. */
  readonly onInitializationState: (fn: (p: unknown) => void) => () => void;
}
export const BRIDGE_KEY = 'rotaris' as const;
