import type { BrowserWindow, UtilityProcess } from 'electron';
import type { Clocks } from '@rotaris/kernel';
import type {
  ApprovalPayload,
  AcknowledgementKind,
  AuthRecoveryPayload,
  CommandOutcome,
  CommandRequest,
  HooksSummary,
  ImprovementActivity,
  ImprovementAnalysisJob,
  NoticeAction,
  NoticeSeverity,
  PausePayload,
  ProcessKind,
  ProcessReply,
  ProposalStatus,
  ProviderDialogPayload,
  ProviderHealthPayload,
  ProviderRow,
  RunHostRequest,
  REQUIREMENT_FOLDS_PREFERENCE_KEY,
  TerminalWindowCommand,
  Theme,
  WorkspaceServiceRequest,
} from '@rotaris/contracts';
import type { dataLayout, HandOver, PreferenceKey, PreferenceStore } from '@rotaris/platform';
import type { ProviderService } from '@rotaris/providers';
import type { ProcessLink, UpdateRelay } from '@rotaris/shell';
import type { MainWindows, MainWindowView } from '../main-windows.js';
import type { PersonaWindows, TerminalWindows } from '../windows.js';
import type { NoticeStore } from '../notices.js';
import type { LibraryRevision } from '../library.js';
import type { AuthFallback } from '../auth-fallback.js';
import type { AuthRecovery } from '../auth-recovery.js';
import type { RunFailurePublisher } from '../run-failure-notice.js';
import type { InitializationCoordinator } from '../initialization.js';
import type { ConfigFatalNotices } from '../config-fatal-notice.js';
import type { createRequirementsRuns } from '../requirements-runs.js';
import type { Updater } from '../updater/updater.js';

/**
 * COMMANDS — what main answers when the renderer asks, and the one place the answer may be found.
 *
 * `runCommand` in `index.ts` does three things and no more: it resolves the window the command was
 * raised for (REQ-SHELL-020), reads the request against `CommandRequestSchema`, and hands the
 * narrowed request to the handler this file's table names. Everything a handler needs that main
 * built — the links, the stores, the dialogs, the notices — arrives as `CommandContext`, which is
 * the inventory that used to be a closure nobody could see or stand in for.
 *
 * Each facet beside this file takes only its own slice (`Pick<CommandContext, …>`), so a facet's
 * interface is a handful of members rather than the whole of main, and a test can satisfy that
 * slice without an Electron window. The table itself is typed `CommandHandlers`, which is total
 * over `CommandRequest['kind']`: a kind the contract declares and no facet answers does not reach
 * `command.unimplemented` at runtime, it fails to compile. That is the stop `04-seams.md` §1 names.
 */

/** The window a command is answered for — the sender's, or the active one (ADR-0055 c.5). */
export type MainWindowState = MainWindowView<BrowserWindow, PersonaWindows, TerminalWindows>;
/** An approval dialog main is holding open for one request. */
export type ApprovalDialogState = { requestId: string; win: BrowserWindow; answered: boolean };
/** The actions a notice offers, in the order they are shown. */
export type Recovery = { label: string; action: NoticeAction }[];

/** The per-command facts: which window asked, which sender, and the workspace that window is opening. */
export interface CommandAt {
  /** The main window this command is answered for. Never the dialog that sent it. */
  readonly w: MainWindowState;
  /** The raw sender — a payload keyed by window (an approval, a persona, a terminal) resolves on this. */
  readonly senderId: number;
  /** Resolves once this window's workspace is open, so a command raised during the first paint still lands. */
  readonly awaitWorkspace: () => Promise<void>;
}

export type CommandHandler<K extends CommandRequest['kind']> = (
  req: Extract<CommandRequest, { kind: K }>,
  at: CommandAt,
) => CommandOutcome | Promise<CommandOutcome>;

/** Total over the contract's kinds: a new kind with no handler is a compile error, not a runtime refusal. */
export type CommandHandlers = { [K in CommandRequest['kind']]: CommandHandler<K> };

/** Everything main holds that a command may need. A facet names the slice it uses and nothing else. */
export interface CommandContext {
  readonly log: (m: string) => void;
  readonly clocks: Clocks;
  readonly capturing: boolean;
  readonly layout: ReturnType<typeof dataLayout>;
  readonly processes: ProcessKind[];

  // The links to the other processes. Main relays; it never opens the store (W-01).
  /**
   * The run host, named by the one thing a command asks of it. `ProcessLink` satisfies this, and so does a
   * plain object — which is what lets a facet's test drive a real handler with no process behind it.
   */
  readonly runHost: Pick<ProcessLink<RunHostRequest>, 'request'>;
  readonly services: Map<string, { child: UtilityProcess; link: ProcessLink<WorkspaceServiceRequest> }>;
  readonly relay: UpdateRelay;

  // The windows, and the payloads each auxiliary window was opened for.
  readonly mainWindows: MainWindows<BrowserWindow, PersonaWindows, TerminalWindows, ApprovalPayload, ApprovalDialogState>;
  readonly windowFor: (senderId: number) => MainWindowState | undefined;
  readonly ownerOfAuxiliary: (senderId: number) => MainWindowState | undefined;
  readonly dialogs: Map<number, ApprovalDialogState>;
  readonly dialogPayloads: Map<number, { payload: ApprovalPayload; othersWaiting: number }>;
  readonly pauseWindows: Map<string, BrowserWindow>;
  readonly pausePayloads: Map<number, PausePayload>;
  readonly presentPause: (payload: PausePayload) => Promise<void>;
  /** REQ-NOTIFY-072..080: the authentication recovery (`auth-recovery.ts`) and the payload each recovery window was opened for. */
  readonly authRecovery: AuthRecovery;
  readonly authRecoveryPayloads: Map<number, AuthRecoveryPayload>;
  /** REQ-NOTIFY-030/032: a failed run's class publication held until its session is followed (`run-failure-notice.ts`). */
  readonly runFailures: RunFailurePublisher;
  /** REQ-HOOKS-106/107: each review dialog's payload, keyed by the dialog — `workspaceId` is the workspace it was opened for, which its decision is stored against (ESC-34). */
  readonly reviewPayloads: Map<number, { workspace: string; workspaceId: string; entries: HooksSummary['review']; decided: boolean; win: BrowserWindow }>;
  readonly measurePersonaPaint: (persona: string, dlg: BrowserWindow, shownAt: number) => void;
  readonly terminalWindowCommand: (req: TerminalWindowCommand, senderId: number) => Promise<CommandOutcome>;
  readonly surface: ((h: HandOver) => void) | undefined;

  // The notices main raises on its own account (REQ-SHELL-114).
  readonly notices: NoticeStore;
  readonly raiseNotice: (severity: NoticeSeverity, headline: string, detail?: string, recovery?: Recovery, sessionId?: string) => void;
  readonly raiseNoticeKeyed: (key: string, severity: NoticeSeverity, headline: string, detail?: string, recovery?: Recovery, sessionId?: string) => boolean;
  readonly recoveryFor: (action: string | undefined, workspace?: string, sessionId?: string) => Recovery;
  /**
   * OQ-279 (ruled 2026-10-13 under R-072): a workspace's fatal configuration load, raised as a persistent notice when it opens
   * and cleared once a later load of it succeeds — a clean snapshot announced, or a run that starts (`config-fatal-notice.ts`).
   */
  readonly configFatal?: Pick<ConfigFatalNotices, 'observe' | 'loaded'> | undefined;
  /** Channel 8: a transient acknowledgement in ONE main window's stack (REQ-NOTIFY-013) — the window a command came from, for one. */
  readonly raiseTransient: (w: MainWindowState, kind: AcknowledgementKind, title: string) => void;
  /** PD-ORCH-005 clause 9: the application is quitting — the process exiting, or no main window staying (`exit.ts`). */
  readonly quitting: () => boolean;
  /**
   * REQ-SESSION-202 / OQ-266: the condition the last open of `workspace` refused its store for — a place holding no store, or
   * a cut restore whose store could not be put back — so the listing reports it rather than an empty list.
   */
  readonly storeRefusal?: ((workspace: string) => { readonly code: string; readonly headline: string; readonly detail?: string } | undefined) | undefined;
  /** PD-SHELL-009: the session's run was stopped by its window's close, which withdraws what it waits on (`QuitState`). */
  readonly withdrawnByClose?: ((sessionId: string) => boolean) | undefined;
  readonly announceRepairs: (repaired: readonly { readonly sessionId: string; readonly from: string; readonly reason: string }[]) => void;
  /**
   * The updater (first-release-plan.md §4.6, ADR-0054): the one held offer, the one operation in flight, and the
   * two notice actions it answers (`update.install`, `update.restart`). `notice.acknowledge` asks it first, so the
   * waved-off version is recorded before the offer notice is cleared (REQ-STARTUP-116/117).
   */
  readonly updater: Updater;
  /** REQ-NOTIFY-070/071/078: the first authentication failure's automatic fallback and its re-authentication prompt (`auth-fallback.ts`). */
  readonly authFallback: AuthFallback;

  // The provider surface and the health it caches between asks.
  readonly providers: ProviderService;
  readonly healthCache: Map<string, ProviderHealthPayload>;
  readonly providerPayloads: Map<number, { mode: ProviderDialogPayload['mode']; providerId: string | null }>;
  readonly providerChoices: () => ProviderDialogPayload['choices'];
  readonly providerRows: () => ProviderRow[];
  readonly presentProvider: (mode: ProviderDialogPayload['mode'], providerId: string | null) => Promise<void>;
  readonly afterProviderChange: () => Promise<void>;

  // Appearance and the remembered preferences.
  readonly preferences: PreferenceStore;
  readonly currentTheme: () => Theme;
  /** Replaces the theme main holds and hands the resolved one back (REQ-SHELL-128). */
  readonly setTheme: (name: string) => Theme;
  readonly themeBackground: () => string;
  readonly requirementsPreferenceKey: (key: PreferenceKey | typeof REQUIREMENT_FOLDS_PREFERENCE_KEY) => PreferenceKey;

  // The coordinators main owns outright.
  readonly initialization: InitializationCoordinator;
  readonly libraryRevision: LibraryRevision;
  readonly requirementsRuns: ReturnType<typeof createRequirementsRuns>;
  readonly improvementUndo: Map<string, { artifactId: string; proposalId: string; previous: ProposalStatus; current: ProposalStatus; summary: string }>;
  readonly improvementRuns: Map<string, { artifactId: string; workspaceRoot: string }>;
  /**
   * PD-LIBRARY-002: the one FIFO both analysis passes ride (REQ-LIBRARY-123/127). A post-run job reaches it
   * from the run host's own event; a retrospective reaches it from the command a person raised.
   */
  readonly enqueueImprovement: (job: ImprovementAnalysisJob) => void;
  /**
   * PD-LIBRARY-002 revision 2, clause (e) (OQ-236): whether a retrospective is queued or running for this workspace —
   * the one state in which a further retrospective gesture is refused rather than queued.
   */
  readonly retrospectivePending: (workspaceId: string) => boolean;
  /**
   * PD-LIBRARY-002 revision 2, clause (e) (OQ-236): the improvement coordinator's activity as it stands
   * (`ImprovementCoordinator.current()`), with which `improvements.activity` answers a mounting window.
   */
  readonly improvementActivity: () => ImprovementActivity;

  // The native choosers, each of which a capture script may answer instead (verification only).
  readonly chooseSave: (parent: BrowserWindow, opts: Electron.SaveDialogOptions) => Promise<string | null>;
  readonly chooseExportPath: (parent: BrowserWindow, opts: Electron.SaveDialogOptions) => Promise<string | null>;
  readonly chooseDirectory: (parent: BrowserWindow, opts: Electron.OpenDialogOptions) => Promise<string | null>;
  readonly chooseSkillFile: (parent: BrowserWindow, startAt: string) => Promise<string | null>;

  // The two flows that are longer than a handler and are raised from more than one place.
  /** REQ-HOOKS-106: `workspace` is a notice action's named workspace (ESC-34), reached first; without it, `w`'s own. */
  readonly openHookReview: (w: MainWindowState | undefined, workspace?: string) => Promise<CommandOutcome>;
  readonly restoreFlow: (w: MainWindowState) => Promise<CommandOutcome>;

  /**
   * REQ-GIT-101: the checkpoint operation in flight, if any. The checkpoint facet is the only writer;
   * the quit path is the other reader, and waits on it before it asks any process to shut down. It is a
   * holder rather than a value because both sides need the current one, not the one that was there when
   * this object was built.
   */
  readonly checkpointOp: { current: Promise<unknown> | null };
}

/**
 * A reply that is not the one asked for becomes a refusal the renderer can show. Nothing throws out
 * of a command (ADR-0019), so every relay ends either in the expected reply or here.
 */
export function refusal(r: ProcessReply, headline: string): CommandOutcome {
  const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
  return { ok: false, code: r.kind === 'refused' ? r.code : 'reply.unexpected', headline, detail };
}
