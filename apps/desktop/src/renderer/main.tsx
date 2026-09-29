import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { isBusy, isViewId, LIBRARY_TABS, THEMES, type AnalysisPass, type NoticeAction, type CommandOutcome, type PromptList, type PromptState, type RepairReportPayload, type CheckpointListPayload, type CheckpointPreviewPayload, type CheckpointRestoreOutcomePayload, type GitViewState, type PaneLayout, type RepositoryState, type SandboxModeName, type Theme, type ThemeName, type ConfigSnapshot, type ConfinementVerdict, type InitializationStateView, type HookAgentId, type HooksSummary, type ImprovementArtifactRecord, type ImprovementRollbackPreview, type ImprovementRollbackResult, type ProposalStatus, type McpHealth, type McpListing, type McpSecretsView, type PlaybookCatalogue, type ProviderRow, type SessionListItemPayload, type TranscriptRow, RUN_AGENT_ID, type AgentRecord, type McpSetupStatus, type ArtifactRowPayload } from '@rotaris/contracts';
// Part AL2 — the terminal in this window (REQ-SHELL-079..111): the role the terminal window is opened under, and the
// provider that carries this window's preview registry down to every transcript surface (ADR-0047).
import { TERMINAL_WINDOW_ROLE } from '@rotaris/contracts';
import { TerminalHostProvider } from '@rotaris/ui';
import { Acknowledgements, type AboutInfo, applyChange, AppShell, SETTINGS_CATEGORIES, branchStripItem, foldLibraryQuery, GitView, LibraryView, OverviewView, PromptsTab, ProposalsTab, rebasePending, isDirty, liveStateOf, motionReduced, pendingFrom, ProvidersCard, savePayload, SessionBrowser, setStoredMotionPreference, StashDialog, type DeleteOutcome, type ExportOutcome, SettingsView, StartSessionDialog, unattendedAdvisory, UnsavedGuardDialog, useShellState, WorkspaceView, bindNewSessionOpener, bindProjectFolderOpener, bindRetrospectiveStarter, type LaunchOptions, type McpSettingsProps, type PendingChange, type PendingSettings, type ProvidersCardProps, type StatusItem, AgentPopOutToggle, MissionView, restingView, statusStripRunItem, ArtifactsTab, ArtifactInspector, type ArtifactLoaded, type ImprovementHistoryPayload, type ProposalMutationResult, type ProposalReviewResult, RowProof, type TrailerRow, WorktreeDialog, ProjectSetupDialog, type SlashHost, RequirementsBoard } from '@rotaris/ui';
// Part AO — the prompt roots' reader (REQ-CHAT-160) the composer's binder calls, and the shape it answers.
import { bindPromptRootsReader } from '@rotaris/ui';
import type { PromptsRootsResult } from '@rotaris/contracts';
// ADR-0063 — portable skills: the catalog reader, the Settings tab's props and the composer's commands.
import { bindSkillsReader } from '@rotaris/ui';
import { EMPTY_SKILLS_STATE, type InstructionStateName, type SkillInvocationModeName, type SkillListingOutcome, type SkillLoadModeName, type SkillsState } from '@rotaris/contracts';
import './design.css';
// The mockup loads these two stylesheets from @phosphor-icons/web@2.1.1; the design assets
// carry the same two fonts byte for byte (REQ-SHELL-027, a distinct icon per view).
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';

// The window itself: the bridge, the replica and the two stacks, the terminal registry, the display preferences and
// the theme — everything this window has before a surface mounts (`shell.ts`).
import { acknowledge, acknowledgements, answerQuestions, bridge, cancelAgent, cancelQuestions, cancelRun, continueSession, control, displayPrefs, notices, openLink, pendingDisplay, planDecision, planEdit, readDisplayPrefs, refreshStats, replica, setMode, setRunStartMode, stopRun, submitPrompt, terminalHost, windowTheme, writeDisplayPref } from './shell.js';
// What a transcript surface reads about the session it is following, shared with the persona window (`session-view.ts`).
import { entryOf, openPersona, personasOf, useConfigSnapshot, useElapsedTick, useNeedsRecovery } from './session-view.js';
// The other windows this same bundle is the root of, each one a role on the route (`windows.tsx`, ADR-0056).
import { bootApproval, bootHookReview, bootPause, bootPersona, bootProvider, bootTerminal } from './windows.js';
/**
 * THE RENDERER'S ROOT. One bundle for every window; the window's role arrives by route (ADR-0056), and `boot` at the
 * bottom is the only place that reads it. Sandboxed: no Node, no filesystem, no store handle — everything this bundle
 * knows arrives over the five channels through the one frozen namespace the preload exposes (ADR-0044).
 *
 * What the window HAS is `shell.ts` — the bridge, the replica, the two stacks, the terminal registry, the display
 * preferences, the theme and the gestures against the followed session. What the other windows ARE is `windows.tsx`.
 * What is left here is the MAIN window: its six views, the state they share, the notice dispatcher, and `boot`.
 */

/**
 * REQ-NOTIFY-044's `focus-session`: opening a session is the App component's own callback (it owns the replica and the
 * browser state), so the root registers it here for the dispatcher, which is module-scoped because a notice may arrive
 * before any view has mounted. Null until the window has booted, and the action is then not dispatched.
 */
let focusSession: ((sessionId: string) => void) | null = null;
/**
 * The workspace this window has open, for the one notice action that names one (ESC-34). Set once at bootstrap from
 * the same value the tree is given, so the dispatcher — which is not a component — can compare without a lookup.
 */
let openWorkspace = '(no workspace)';
/** REQ-GIT-082's comparison, the idiom this renderer already uses for "does this still name the open workspace". */
const sameWorkspace = (a: string, b: string): boolean =>
  a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

/**
 * Part X — the workspace's saved prompts (REQ-LIBRARY-137/138/139), held ABOVE the views. That placement is
 * REQ-LIBRARY-105's: "A change that arrives while the Library is off screen MUST be visible the next time the
 * Library is shown, with no manual refresh." Only the active view is mounted, so a hook inside the Library would
 * miss every change made from the composer; here, the composer's live count and the Library's two lists are one
 * state, and the `library:changed` revision re-reads it wherever the window happens to be.
 */
interface PromptsApi {
  readonly history: readonly string[];
  readonly stash: readonly string[];
  readonly revision: number;
  /** REQ-LIBRARY-137: front-insert into one list; the DAL suppresses an adjacent duplicate and enforces the cap. */
  push: (list: PromptList, text: string) => void;
  /** REQ-LIBRARY-107: the entry's text; `remove` decides whether it survives. Empty for an index naming no entry. */
  take: (list: PromptList, index: number, remove: boolean) => Promise<string>;
}
function usePrompts(workspace: string): PromptsApi {
  const [state, setState] = useState<{ history: readonly string[]; stash: readonly string[] }>({ history: [], stash: [] });
  const [revision, setRevision] = useState(0);
  const hasWorkspace = workspace !== '(no workspace)';
  const read = useCallback(async () => {
    if (!hasWorkspace) return;
    const r = await bridge.command({ kind: 'prompts.read' });
    if (r.ok) setState((r.value as { state: PromptState }).state);
  }, [hasWorkspace]);
  // On mount, and again whenever the revision moves — a library change, and nothing else, is what moves it.
  useEffect(() => { queueMicrotask(() => { void read(); }); }, [read, revision]);
  useEffect(() => bridge.onLibraryChanged((p) => setRevision((p as { revision?: number }).revision ?? 0)), []);
  const push = useCallback((list: PromptList, text: string) => {
    // REQ-LIBRARY-138: the window's own lists move FIRST, so a persistence failure leaves prompts usable in this
    // window exactly as the notice's detail promises; the store's answer replaces them when it arrives. The
    // adjacent-duplicate rule is applied here too so the optimistic list matches what the DAL will store.
    setState((s) => (text.trim() === '' || s[list][0] === text ? s : { ...s, [list]: [text, ...s[list]] }));
    void bridge.command({ kind: 'prompts.push', list, text }).then((r) => { if (r.ok) setState((r.value as { state: PromptState }).state); });
  }, []);
  const take = useCallback(async (list: PromptList, index: number, remove: boolean): Promise<string> => {
    const r = await bridge.command({ kind: 'prompts.take', list, index, remove });
    if (!r.ok) return '';
    const value = r.value as { text: string; state: PromptState };
    setState(value.state);
    return value.text;
  }, []);
  return { history: state.history, stash: state.stash, revision, push, take };
}

/**
 * REQ-LIBRARY-107: load the prompt into the composer, switch to the Workspace view, focus the composer. The
 * composer registers itself when it mounts, so after a view switch it may not exist for another frame — the same
 * two-frame wait the shell uses for Ctrl+L (`AppShell.nowOrAfterMount`), for the same reason.
 */
function loadIntoComposer(text: string): void {
  if (text === '') return;
  useShellState.getState().switchView('workspace');
  const load = (): boolean => { const composer = useShellState.getState().composer; if (!composer) return false; composer.setText(text); return true; };
  if (!load()) requestAnimationFrame(() => requestAnimationFrame(() => { load(); }));
}

/**
 * REQ-CHAT-165 (Part Z): the next older span, through the `session.pageOlder` command and the replica's
 * `prependOlder` action — both of which have existed since the walking skeleton and neither of which anything
 * called. It runs off the interface thread (a command round trip through main to the run host) and returns false
 * when the load FAILED, which is what makes a failure distinguishable from having reached the oldest row.
 */
async function pageOlder(beforeIndex: number): Promise<boolean> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return false;
  const r = await bridge.command({ kind: 'session.pageOlder', sessionId, beforeIndex });
  if (!r.ok) return false;
  const page = r.value as { rows?: TranscriptRow[]; oldest?: boolean };
  replica.getState().prependOlder(page.rows ?? [], page.oldest === true);
  return true;
}

/**
 * Part AB — REQ-CHAT-014 (200 ms to application state) and REQ-SHELL-159 (400 ms to the preference store). The
 * view owns both timers over the keystroke stream; this holds the published value and performs the store write,
 * which main keys by the workspace it has open (REQ-CHAT-015: a draft never reaches another workspace's composer).
 */
function useDraft(workspace: string): { draft: string | undefined; publish: (t: string) => void; write: (t: string) => void } {
  const [stored, setStored] = useState<string | undefined>(undefined);
  const [, setPublished] = useState('');
  useEffect(() => {
    if (workspace === '(no workspace)') return;
    let live = true;
    void bridge.command({ kind: 'composer.readDraft' }).then((r) => { if (live && r.ok) setStored((r.value as { text: string }).text); });
    return () => { live = false; };
  }, [workspace]);
  return {
    draft: stored,
    publish: setPublished,
    write: (text: string) => { void bridge.command({ kind: 'composer.writeDraft', text }); },
  };
}

// Part AO — REQ-CHAT-160: the prompt roots are read through the bridge (main relays to the workspace service); the
// composer's binder calls this on focus and on a configuration change. Bound once for the window.
bindPromptRootsReader(async () => {
  const r = await bridge.command({ kind: 'prompts.roots.read' });
  return r.ok ? (r.value as PromptsRootsResult) : { files: [], skipped: [{ path: '', reason: r.detail ?? r.headline }] };
});

// ADR-0063 — REQ-CHAT-034 / REQ-WORKSPACE-072: the skill catalog, read through the bridge (main names the open
// workspace and the followed session and relays to the run host, which owns it). Bound once for the window, on the
// prompt roots' terms; a window with no workspace gets an empty catalog and registers no skill command.
bindSkillsReader(async () => {
  const r = await bridge.command({ kind: 'skills.read' });
  return r.ok ? (r.value as SkillsState) : EMPTY_SKILLS_STATE;
});

// Stage C — PD-SHELL-001's palette entry ("Open project folder in a new window") acts through this. The registry
// runs against a `CommandContext` that carries no command channel, and `packages/ui` never holds the bridge, so
// the window binds the opener once at module scope. The command carries no folder: main opens the chooser,
// evaluates no gate on this route, and adds a window rather than displacing one.
bindProjectFolderOpener(() => { void bridge.command({ kind: 'workspace.choose', newWindow: true }); });

// Part AT — PD-LIBRARY-002: the retrospective's one route, bound once for the three surfaces that raise it. Main
// answers the refusals with the notices the directive fixes (no model configured, nothing to look back over), so
// nothing is reported here; a window that never binds it is an auxiliary window with no workspace of its own.
bindRetrospectiveStarter(() => { void bridge.command({ kind: 'improvements.retrospective' }); });

// Part AN — the two openers the slash catalogue needs from App's own state: the launch dialog (REQ-SHELL-125, `/new`)
// and the session browser (REQ-SHELL-126, `/resume` and `/sessions`). App registers them once mounted; Workspace calls
// through them, so neither `Workspace`'s props nor App's view map changes for the catalogue's sake.
const slashOpeners: { newSession?: () => Promise<{ ok: true } | { ok: false; reason: string }>; openSessions?: () => void } = {};

function Workspace({ models, modelsLoaded, workspace, popOut, prompts, onOpenStash, groupTools, layout, onLayout, onOpenTrailer }: { models: readonly string[]; modelsLoaded: boolean; workspace: string; popOut: boolean; prompts: PromptsApi; onOpenStash: () => void; groupTools: boolean; layout: PaneLayout | undefined; onLayout: (l: PaneLayout) => void; onOpenTrailer: (trailer: TrailerRow) => void }) {
  const session = useStore(replica, (s) => s.session);
  const rows: readonly TranscriptRow[] = useStore(replica, (s) => s.rows);
  const reachedOldest = useStore(replica, (s) => s.reachedOldest);
  const snapshot = useConfigSnapshot(workspace);
  // REQ-CONFIG-472: what the settings screen currently holds wins over what the file says, until Save says otherwise.
  const pendingCaps = useStore(pendingDisplay, (s) => s.caps);
  const personas = useMemo(() => personasOf(snapshot), [snapshot]);
  const entry = useMemo(() => entryOf(snapshot, rows, session?.agents ?? []), [snapshot, rows, session]);
  const nowIso = useElapsedTick(session);
  const display = useStore(displayPrefs, (s) => s);
  const needsRecovery = useNeedsRecovery(session?.id ?? null, session?.executionStatus ?? null);
  const drafts = useDraft(workspace);
  /**
   * REQ-CHAT-006/009: the three chips choose what the NEXT run starts with, and in this architecture that is Tier A
   * configuration — the same scoped per-field write (REQ-CONFIG-441/463) the permission-mode chip already takes, so
   * "the next run starts from it" is the configuration load's own rule rather than a second mechanism beside it.
   * The persona is the run's default role (`default_persona`); the model and the reasoning are that role's own,
   * which is what `entryOf` reads back, so the chip shows the value it just wrote.
   */
  const setField = useCallback(async (patch: Record<string, unknown>): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'config.setField', patch });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }, []);
  const entryPersona = entry.persona;
  /*
   * Part AN — REQ-CHAT-028..033, REQ-CHAT-159, REQ-SHELL-048/056: what the slash catalogue needs that `WorkspaceView`
   * cannot reach through its other props. The theme setter does what the Settings category's `changeTheme` does; the
   * provider list and the sign-out are the Providers card's own commands; the two control ops go through `control` and
   * surface the run host's answer as `failed` (no arm until Part AO); the launch dialog and the session browser are App's,
   * reached through `slashOpeners`; the worktree dialog is the Git view's component drawn here over the same commands
   * (REQ-GIT-074's template); `hasGit` is the repository read's verdict. `raiseNotice` is left unset on purpose: no
   * `notice.report` command exists (ADR-0049 defect fifty-seven), so the composer draws REQ-CHAT-021's notice itself.
   */
  const providerRows = useProviders().rows;
  const git = useGitState(workspace);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  // ADR-0063: the Settings Skills tab bumps this after a rescan or a hand-loaded skill (REQ-CHAT-034).
  const skillsRevision = useShellState((s) => s.skillsRevision);
  const slashHost = useMemo<SlashHost>(() => ({
    themes: THEMES.map((t) => t.name),
    setTheme: (name) => windowTheme.change(name as ThemeName),
    providers: providerRows.map((row) => row.id),
    logout: async (id) => {
      const r = await bridge.command({ kind: 'providers.signOut', id });
      if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
      const outcome = r.value as { ok: boolean; message: string };
      return outcome.ok ? { ok: true } : { ok: false, reason: outcome.message };
    },
    control: (op) => control(op, {}, `The run host does not support ${op} yet.`),
    newSession: () => (slashOpeners.newSession ? slashOpeners.newSession() : Promise.resolve({ ok: false as const, reason: 'The launch dialog is not available in this window.' })),
    openSessions: () => { slashOpeners.openSessions?.(); },
    openWorktree: () => setWorktreeOpen(true),
    hasGit: git.state?.gitAvailable === true && git.state.isRepository,
    // Part AO — REQ-CHAT-021's persistent notice through main's one slot (`notice.report`, ADR-0049 defect fifty-seven).
    raiseNotice: (n) => { void bridge.command({ kind: 'notice.report', severity: 'warning', title: n.title, message: n.message, persistent: true }); },
    /*
     * ADR-0063 — REQ-WORKSPACE-073: the typed skill command's effect. Main names the open workspace and the
     * followed session; the run host reads the SAVED configuration and answers the refusal, so "Skills are
     * disabled. Enable them in Settings." reaches the composer from the process that can tell.
     */
    forceLoadSkill: async (name) => {
      const r = await bridge.command({ kind: 'skills.forceLoad', name });
      return r.ok ? { ok: true as const } : { ok: false as const, reason: r.detail ?? r.headline };
    },
    /*
     * REQ-CHAT-162 — `/skill <path>`. The same command main answers for the Settings action, with the path
     * supplied rather than chosen, so no dialog opens and REQ-WORKSPACE-057's directory form stays reachable
     * on every platform (OQ-59).
     */
    loadSkillFile: async (path) => {
      const r = await bridge.command({ kind: 'skills.loadFile', path });
      if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
      const outcome = r.value as { cancelled: boolean; name?: string };
      return outcome.name === undefined ? { ok: false as const, reason: 'The skill was not loaded.' } : { ok: true as const, name: outcome.name };
    },
    /*
     * REQ-CHAT-162 — `/skills`. Main names the followed session (a window following none is refused there, OQ-67);
     * the run host writes the listing through that session's own writer, and the row reaches this window the way
     * every other row does — on the session's transcript channel — so nothing is drawn from this answer.
     */
    listSkills: async () => {
      const r = await bridge.command({ kind: 'skills.list' });
      if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
      return { ok: true as const, count: (r.value as SkillListingOutcome).count };
    },
    // REQ-CHAT-034: a rescan or a hand-loaded skill in Settings re-registers the typeable commands.
    skillsRevision,
  }), [providerRows, git.state, skillsRevision]);
  const worktrees = git.state?.worktrees ?? [];
  /*
   * Part AS — ADR-0064. The gate is REQ-WORKSPACE-112's and it is a COMPOSER gate only: no other view is
   * blocked, and the dialog beside it is non-modal, so the rest of the application stays navigable
   * (REQ-WORKSPACE-106, REQ-WORKSPACE-142). The dialog opens by itself **at most once per workspace open**
   * (REQ-WORKSPACE-105) and otherwise only when the user asks for it from the sidebar's Project section.
   */
  const init = useInitialization();
  const promptDue = init.state !== null && init.state.view.consentPending.length > 0 && !init.state.view.running;
  const openProjectSetup = useShellState((s) => s.openProjectSetup);
  return <>
    {worktreeOpen && (
      <WorktreeDialog workspaceRoot={workspace} existingBranches={worktrees.flatMap((r) => (r.branch === null ? [] : [r.branch]))} existingPaths={worktrees.map((r) => r.path)}
        probePath={async (path) => { const r = await bridge.command({ kind: 'worktree.probePath', path }); return r.ok ? (r.value as { exists: boolean; nonEmpty: boolean }) : null; }}
        onCreate={async (branch, path) => { const r = await bridge.command({ kind: 'worktree.create', branch, path }); if (r.ok) git.refresh(); return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline }; }}
        onClose={() => setWorktreeOpen(false)} />
    )}
    <WorkspaceView slash={slashHost}
    onOpenLink={openLink} onReadAttachment={async (attachment) => { if (!session) return null; const r = await bridge.command({ kind: 'session.readAttachment', sessionId: session.id, path: attachment.path, digest: attachment.digest }); return r.ok ? `data:${attachment.mediaType};base64,${(r.value as { base64: string }).base64}` : null; }} onAcknowledge={acknowledge} showReasoning={display.showReasoning} autoCollapseTools={display.autoCollapseTools}
    needsRecovery={needsRecovery} modelsLoaded={modelsLoaded} history={prompts.history} configuredMode={snapshot?.runtime.permission_mode}
    projectSetupPending={promptDue} initialization={init.state} onOpenProjectSetup={openProjectSetup}
    draft={drafts.draft} onPublishDraft={drafts.publish} onWriteDraft={drafts.write}
    composerHeight={layout?.sizes[1]} onComposerHeight={(sizes) => onLayout({ version: 1, panes: 2, sizes: [...sizes] })}
    onSetNextPersona={(persona) => setField({ default_persona: persona })}
    onSetNextModel={(model) => setField({ personas: { [entryPersona]: { model } } })}
    onSetNextReasoning={(level) => setField({ personas: { [entryPersona]: { thinking: level } } })}
    onOpenTrailer={onOpenTrailer}
    onAnswerQuestions={answerQuestions}
    onCancelQuestions={cancelQuestions}
    session={session} rows={rows} onSubmit={submitPrompt} onStop={stopRun} onCancelRun={cancelRun} onSetMode={setMode} onCancelAgent={cancelAgent} nowIso={nowIso}
    onPageOlder={pageOlder} reachedOldest={reachedOldest} groupTools={groupTools} displayCaps={pendingCaps ?? snapshot?.display}
    onStash={(text) => prompts.push('stash', text)} stashCount={prompts.stash.length} onOpenStash={onOpenStash}
    onRecordPrompt={(text) => prompts.push('history', text)}
    personas={personas} entry={entry} compressionThresholdPercent={snapshot?.compressorThresholdPercentage ?? 60}
    onSelectAgent={(id, source) => { if (source === 'click' && popOut && id !== null && id !== RUN_AGENT_ID) { const agent = session?.agents.find((a) => a.id === id); if (agent) void openPersona(agent, false); } }}
    onOpenPersona={(agent, focusSteer) => { void openPersona(agent, focusSteer); }}
    models={models} imageInputModels={snapshot?.imageInputModels ?? []}
    onQueue={(text) => control('createQueuedPrompt', { text }, 'The run no longer accepts prompts.')}
    onEditQueued={(promptId, text) => control('editQueuedPrompt', { promptId, text }, 'Queued message was already picked up and cannot be edited.')}
      onRemoveQueued={(promptId) => control('removeQueuedPrompt', { promptId }, 'Queued message was already picked up and cannot be deleted.')}
      onEditTodo={(edit) => control('editTodo', {
        op: edit.op,
        source: edit.source,
        ...(edit.id === undefined ? {} : { id: edit.id }),
        ...(edit.text === undefined ? {} : { text: edit.text }),
        ...(edit.phaseId === undefined ? {} : { phaseId: edit.phaseId }),
        ...(edit.ownerId === null ? {} : { ownerId: edit.ownerId }),
      }, 'Todo editing is not ready for this active run yet.')}
    onPause={() => control('pause', {}, 'Pause is unavailable because no active run exists.')}
    onContinue={(opts) => continueSession('continue', opts)}
    /* REQ-ORCH-153/154 (ADR-0062): the plan gate's two entries, addressed to the focused session. */
    onPlanEdit={(text) => planEdit(text)}
    onPlanDecision={(decision, changes) => planDecision(decision, changes)}
    /* REQ-ORCH-152 / REQ-CONFIG-476: the composer's half of the run-start mode; the start dialog writes the same key. */
    runStartMode={snapshot?.runtime.run_start_mode ?? 'auto'}
    onSetRunStartMode={(mode) => setRunStartMode(mode)}
    onSteer={(agentId, text) => control('submitSteeringPrompt', { agentId, text }, 'Steering is unavailable for this run.')}
    onSetModel={(model) => control('setModel', { model }, 'The run did not accept that model.')}
    onSetReasoning={(level) => control('setReasoning', { level }, 'The run did not accept that reasoning level.')}
  /></>; // Part AN: the fragment closes the worktree dialog + view pair opened above.
}

/**
 * REQ-SHELL-023's Mission view (Part R; REQ-MONITOR-274..276). Mounted only while shown (REQ-MONITOR-039/275: a hidden
 * surface refreshes nothing and runs no timer); the strategy and the depth are the settings' own values, written through
 * the per-field path (REQ-CONFIG-321, REQ-CONFIG-112); pause is the existing `pause` control, and cancel is `cancelAgent` — for the run row the reserved run id, final (`cancelRun`, PD-ORCH-005 clause 15).
 */
function Mission({ workspace, popOut }: { workspace: string; popOut: boolean }) {
  const session = useStore(replica, (s) => s.session);
  const rows: readonly TranscriptRow[] = useStore(replica, (s) => s.rows);
  const selectedAgentId = useShellState((st) => st.selectedAgentId);
  const selectAgent = useShellState((st) => st.selectAgent);
  const snapshot = useConfigSnapshot(workspace);
  const refresh = useStore(refreshStats, (st) => st);
  const entry = useMemo(() => entryOf(snapshot, rows, session?.agents ?? []), [snapshot, rows, session]);
  // PD-ORCH-005 clauses 13 and 16 (OQ-100, OQ-101): in REQ-CHAT-008's recovery state the run-level agent presents `paused`,
  // as its agents do, and a paused child offers "Cancel selection" while its session rests — both from `restingView`,
  // the one call the Workspace makes too.
  const needsRecovery = useNeedsRecovery(session?.id ?? null, session?.executionStatus ?? null);
  const { runLevel, resting } = useMemo(() => restingView(session, entry, needsRecovery), [session, entry, needsRecovery]);
  const nowIso = useElapsedTick(session);
  const [sessions, setSessions] = useState<readonly SessionListItemPayload[]>([]);
  useEffect(() => { if (workspace !== '(no workspace)') queueMicrotask(() => { void bridge.command({ kind: 'session.list' }).then((r) => { if (r.ok) setSessions((r.value as { sessions: SessionListItemPayload[] }).sessions); }); }); }, [workspace, session?.id]);
  const label = session ? sessions.find((x) => x.sessionId === session.id)?.label ?? null : null;
  const setField = async (patch: Record<string, unknown>): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'config.setField', patch });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  };
  const open = (agent: AgentRecord) => {
    // REQ-MONITOR-072 / REQ-SHELL-073: the preference decides; the Workspace inspector shows the agent pinned otherwise.
    if (popOut && agent.id !== RUN_AGENT_ID) { void openPersona(agent, false); return; }
    selectAgent(agent.id);
    useShellState.getState().switchView('workspace');
  };
  return <MissionView
    session={session} sessionLabel={label} runLevel={runLevel} resting={resting} recovery={needsRecovery} selectedAgentId={selectedAgentId} nowIso={nowIso} refresh={refresh}
    onSelect={(id, source) => { selectAgent(id); if (source === 'click' && popOut && id !== null && id !== RUN_AGENT_ID) { const agent = session?.agents.find((a) => a.id === id); if (agent) void openPersona(agent, false); } }}
    strategy={snapshot?.delegationStrategy ?? null} maxDepth={snapshot?.runtime.max_depth ?? null}
    onSetStrategy={(value) => setField({ rotaris: { delegation_strategy: value } })} onSetDepth={(value) => setField({ runtime: { max_depth: value } })}
    onPause={() => control('pause', {}, 'Pause is unavailable because no active run exists.')}
    onCancelAgent={cancelAgent} onCancelRun={cancelRun}
    onOpen={open} onPopOut={(agent) => { void openPersona(agent, false); }}
  />;
}

/**
 * REQ-SHELL-026: the startup view. Mounted only while shown, so nothing here runs while it is hidden
 * (REQ-MONITOR-174); the session list and the repository are read on mount and again whenever the followed
 * run reaches a terminal state; the configured caps come from the configuration snapshot (REQ-MONITOR-169).
 */
const UNREAD_REPOSITORY: RepositoryState = { gitAvailable: false, isRepository: false, branch: null, base: null, ahead: 0, behind: 0, touched: 0, uncommitted: 0, failed: ['request'], readMs: 0 };
function Overview({ workspace, layout, onLayout, reducedMotion, onListSessions, onOpenSession, onNewSession, libraryRevision }: { workspace: string; layout: PaneLayout | undefined; onLayout: (l: PaneLayout) => void; reducedMotion: boolean; onListSessions: () => void; onOpenSession: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>; onNewSession: () => Promise<{ ok: true } | { ok: false; reason: string }>; libraryRevision: number }) {
  const session = useStore(replica, (s) => s.session);
  const [sessions, setSessions] = useState<readonly SessionListItemPayload[]>([]);
  const [sessionsState, setSessionsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [repository, setRepository] = useState<RepositoryState | null>(null);
  const [caps, setCaps] = useState<{ depth: number; fanOut: number } | null>(null);
  const [improvements, setImprovements] = useState<readonly ImprovementArtifactRecord[]>([]);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const hasWorkspace = workspace !== '(no workspace)';
  const status = session?.executionStatus ?? null;
  // Changes when a session is followed, and when the followed run stops being busy — the refresh triggers of REQ-MONITOR-174.
  const refreshKey = session ? (isBusy(session.executionStatus) ? `${session.id}:busy` : `${session.id}:${status}`) : 'none';
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      if (!hasWorkspace) { setImprovements([]); return; }
      void bridge.command({ kind: 'improvements', command: { action: 'list' } }).then((result) => { if (live) setImprovements(result.ok ? result.value as ImprovementArtifactRecord[] : []); });
    });
    return () => { live = false; };
  }, [hasWorkspace, libraryRevision]);
  const refresh = useCallback(async () => {
    if (!hasWorkspace) { setRepository(UNREAD_REPOSITORY); return; }
    setSessionsState('loading');
    const [list, repo] = await Promise.all([bridge.command({ kind: 'session.list' }), bridge.command({ kind: 'repository.read' })]);
    if (list.ok) { setSessions((list.value as { sessions: SessionListItemPayload[] }).sessions); setSessionsState('idle'); }
    else { setSessionsState('error'); setSessionsError(list.detail ?? list.headline); }
    setRepository(repo.ok ? (repo.value as RepositoryState) : UNREAD_REPOSITORY);
  }, [hasWorkspace]);
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh, refreshKey]);
  useEffect(() => {
    if (!hasWorkspace) return;
    const apply = (snapshot: ConfigSnapshot) => setCaps({ depth: snapshot.runtime.max_depth, fanOut: snapshot.runtime.max_active_children });
    queueMicrotask(() => { void bridge.command({ kind: 'config.read' }).then((r) => { if (r.ok) apply(r.value as ConfigSnapshot); }); });
    return bridge.onConfigChanged((p) => apply((p as { snapshot: ConfigSnapshot }).snapshot));
  }, [hasWorkspace]);
  useEffect(() => {
    if (!session || !isBusy(session.executionStatus)) return;
    const t = setInterval(() => setNowIso(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, [session]);
  return <OverviewView
    session={session} sessions={sessions} sessionsState={sessionsState} sessionsError={sessionsError} repository={repository} caps={caps}
    layout={layout} onLayout={onLayout} nowIso={session && isBusy(session.executionStatus) ? nowIso : session?.updatedAt ?? null} reducedMotion={reducedMotion}
    onListSessions={onListSessions} onNewSession={onNewSession}
    onOpenSession={(id) => { void onOpenSession(id); }} onContinueSession={(id) => { void onOpenSession(id); }}
    onGoTo={(view) => useShellState.getState().switchView(view)}
    improvements={improvements}
    onOpenProposal={(proposalId) => useShellState.getState().openLibrary('proposals', proposalId)}
    onReviewProposal={async (artifactId, proposalId, proposalStatus, expectedVersionsDue) => {
      const result = await bridge.command({ kind: 'improvements', command: { action: 'review', request: { artifact_id: artifactId, proposal_id: proposalId, status: proposalStatus, expected_versions_due: expectedVersionsDue } } });
      return result.ok ? { ok: true } : { ok: false, reason: result.detail ?? result.headline };
    }}
  />;
}

/**
 * REQ-SHELL-023's Library view (Part X). The shell, the one search field and the three tabs are the view's; the
 * Prompts tab is built here from the state `usePrompts` holds above every view.
 *
 * The Artifacts tab is Part Y's, built against `LibraryTabProps` and mounted here since the merge, along with the
 * inspectors it opens. The PROPOSALS body is still a placeholder, and it says why it is empty rather than showing an
 * empty table that would read as "there is nothing", which is a different claim: no ADR owns the improvement artifact
 * store's write path (OQ-45), so the tab behind it is a part of its own and has not been authorised.
 */
function Library({ prompts, layout, onLayout }: { prompts: PromptsApi; layout: PaneLayout | undefined; onLayout: (l: PaneLayout) => void }) {
  // REQ-LIBRARY-105: the query lives above the tabs, so a refresh replaces the lists and never the typed text.
  const [query, setQuery] = useState('');
  // REQ-LIBRARY-131: the open inspectors, per window. `raised` moves when an already-open id is opened again.
  const [open, setOpen] = useState<readonly { id: string; raised: number }[]>([]);
  const read = useCallback(async () => {
    const r = await bridge.command({ kind: 'artifacts.list' });
    if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
    const v = r.value as { sessionId: string | null; artifacts: ArtifactRowPayload[]; warnings: string[] };
    return { ok: true as const, sessionId: v.sessionId, artifacts: v.artifacts, warnings: v.warnings };
  }, []);
  const load = useCallback(async (id: string) => {
    const r = await bridge.command({ kind: 'artifacts.body', ref: id });
    return r.ok ? { ok: true as const, artifact: r.value as ArtifactLoaded } : { ok: false as const, reason: r.detail ?? r.headline };
  }, []);
  // REQ-LIBRARY-105: an artifact write IS a library change, so main bumps `session-artifacts` and the revision
  // that arrives on `library:changed` re-reads the table — the same counter the Prompts tab moves on.
  const save = useCallback(async (id: string, body: string) => {
    const r = await bridge.command({ kind: 'artifacts.save', ref: id, body });
    return r.ok ? { ok: true as const, editedAt: (r.value as { editedAt: string }).editedAt } : { ok: false as const, reason: r.detail ?? r.headline };
  }, []);
  // REQ-LIBRARY-131: opening an id that is already open RE-RAISES the visible dialog instead of duplicating it.
  const inspect = useCallback((id: string) => {
    setOpen((current) => (current.some((x) => x.id === id)
      ? current.map((x) => (x.id === id ? { id, raised: x.raised + 1 } : x))
      : [...current, { id, raised: 1 }]));
  }, []);
  const focusedProposalId = useShellState((state) => state.libraryProposalId);
  // REQ-LIBRARY-102 / REQ-MONITOR-052 (live-run finding K1): an agent surface's artifact link deep-links here — the Artifacts
  // tab, and the inspector opened (or re-raised, REQ-LIBRARY-131) for that artifact. Derived during render when the request
  // arrives, then consumed, so the same link followed again opens it again.
  const focusedArtifactId = useShellState((state) => state.libraryArtifactId);
  const [seenArtifactFocus, setSeenArtifactFocus] = useState<string | null>(null);
  if (focusedArtifactId !== seenArtifactFocus) { setSeenArtifactFocus(focusedArtifactId); if (focusedArtifactId !== null) inspect(focusedArtifactId); }
  useEffect(() => { if (focusedArtifactId !== null) useShellState.getState().takeLibraryArtifactId(); }, [focusedArtifactId]);
  const readImprovements = useCallback(async () => {
    const result = await bridge.command({ kind: 'improvements', command: { action: 'list' } });
    return result.ok ? { ok: true as const, records: result.value as ImprovementArtifactRecord[] } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  const readImprovementHistory = useCallback(async (artifactId: string) => {
    const result = await bridge.command({ kind: 'improvements', command: { action: 'history', artifact_id: artifactId } });
    return result.ok ? { ok: true as const, history: result.value as ImprovementHistoryPayload } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  const reviewProposal = useCallback(async (artifactId: string, proposalId: string, status: ProposalStatus, expectedVersionsDue: number) => {
    const result = await bridge.command({ kind: 'improvements', command: { action: 'review', request: { artifact_id: artifactId, proposal_id: proposalId, status, expected_versions_due: expectedVersionsDue } } });
    return result.ok ? { ok: true as const, result: result.value as ProposalReviewResult } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  const editProposal = useCallback(async (artifactId: string, proposalId: string, summary: string, recommendedAction: string, expectedVersionsDue: number) => {
    const result = await bridge.command({ kind: 'improvements', command: { action: 'edit', request: { artifact_id: artifactId, proposal_id: proposalId, summary, recommended_action: recommendedAction, expected_versions_due: expectedVersionsDue } } });
    return result.ok ? { ok: true as const, result: result.value as ProposalMutationResult } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  const deleteProposal = useCallback(async (artifactId: string, proposalId: string, expectedVersionsDue: number) => {
    const result = await bridge.command({ kind: 'improvements', command: { action: 'delete', request: { artifact_id: artifactId, proposal_id: proposalId, expected_versions_due: expectedVersionsDue } } });
    return result.ok ? { ok: true as const, result: result.value as ProposalMutationResult } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  const exportImprovements = useCallback(async (artifactId?: string) => {
    const result = await bridge.command({ kind: 'improvements.export', ...(artifactId === undefined ? {} : { artifactId }) });
    if (!result.ok) return { ok: false as const, reason: result.detail ?? result.headline };
    const value = result.value as { cancelled: boolean; destination?: string };
    return { ok: true as const, ...value };
  }, []);
  const startImprovement = useCallback(async (artifactId: string) => {
    const result = await bridge.command({ kind: 'improvements.start', artifactId });
    if (!result.ok) return { ok: false as const, reason: result.detail ?? result.headline };
    const sessionId = (result.value as { sessionId: string | null }).sessionId;
    if (sessionId !== null) focusSession?.(sessionId);
    return { ok: true as const };
  }, []);
  const previewImprovementRollback = useCallback(async (artifactId: string) => {
    const result = await bridge.command({ kind: 'improvements.rollbackPreview', artifactId });
    return result.ok ? { ok: true as const, preview: result.value as ImprovementRollbackPreview } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  const rollbackImprovement = useCallback(async (artifactId: string, force: boolean) => {
    const result = await bridge.command({ kind: 'improvements.rollback', artifactId, force });
    return result.ok ? { ok: true as const, result: result.value as ImprovementRollbackResult } : { ok: false as const, reason: result.detail ?? result.headline };
  }, []);
  return (<>
    <LibraryView
      query={query}
      onQuery={setQuery}
      prompts={<PromptsTab query={foldLibraryQuery(query)} revision={prompts.revision} history={prompts.history} stash={prompts.stash} layout={layout} onLayout={onLayout}
        onUse={(list, index, remove) => { void prompts.take(list, index, remove).then(loadIntoComposer); }} />}
      artifacts={<ArtifactsTab query={foldLibraryQuery(query)} revision={prompts.revision} onRead={read} onInspect={inspect} />}
      proposals={<ProposalsTab query={foldLibraryQuery(query)} revision={prompts.revision} focusedProposalId={focusedProposalId} onConsumeFocusedProposal={() => useShellState.getState().takeLibraryProposalId()}
        onRead={readImprovements} onHistory={readImprovementHistory} onReview={reviewProposal} onEdit={editProposal} onDelete={deleteProposal} onExport={exportImprovements}
        onStart={startImprovement} onRollbackPreview={previewImprovementRollback} onRollback={rollbackImprovement} />}
    />
    {open.map((entry) => (
      // ADR-0051: a link is an element that requests an external open THROUGH THE COMMAND CHANNEL. No such
      // command exists yet — `REQ-CHAT-076` fixes the opening, its acknowledgement and its failure report,
      // and that belongs to the transcript part that consumes this renderer. Until then no opener is passed
      // and a link renders with its target as its title, inert rather than navigable. Recorded as owed.
      <ArtifactInspector key={entry.id} id={entry.id} raised={entry.raised} onLoad={load} onSave={save}
        onClose={(id) => setOpen((current) => current.filter((x) => x.id !== id))} />
    ))}
  </>);
}

/**
 * REQ-GIT-082/102: the Git view's state, held above the view so the status strip reads it too. Rebuilds are coalesced
 * with a 120 ms trailing debounce; a result naming a workspace no longer open is discarded; exactly one refresh runs
 * at application start (after the window painted; main awaits the workspace open in flight).
 */
function useGitState(workspace: string) {
  const [state, setState] = useState<GitViewState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const hasWorkspace = workspace !== '(no workspace)';
  const read = useCallback(async function readOnce(): Promise<void> {
    if (!hasWorkspace) return;
    if (inFlight.current) { again.current = true; return; }
    inFlight.current = true;
    setRefreshing(true);
    const r = await bridge.command({ kind: 'git.read' });
    inFlight.current = false;
    if (r.ok) {
      const next = r.value as GitViewState;
      // REQ-GIT-082: applied only when it still names the open workspace.
      if (next.workspaceRoot.replace(/\\/g, '/').toLowerCase() === workspace.replace(/\\/g, '/').toLowerCase()) setState(next);
    }
    setRefreshing(false);
    if (again.current) { again.current = false; void readOnce(); }
  }, [hasWorkspace, workspace]);
  const refresh = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => { pending.current = null; void read(); }, 120);
  }, [read]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  // The one start-time refresh (REQ-GIT-102).
  useEffect(() => { refresh(); }, [refresh]);
  return { state, refreshing, refresh };
}

/** REQ-SHELL-023's Git view. Mounted only while shown, so a hidden view rebuilds nothing; shown, it reads (REQ-GIT-082). */
function Git({ workspace, git, layout, onLayout }: { workspace: string; git: ReturnType<typeof useGitState>; layout: PaneLayout | undefined; onLayout: (l: PaneLayout) => void }) {
  const session = useStore(replica, (s) => s.session);
  const [sessions, setSessions] = useState<readonly SessionListItemPayload[]>([]);
  const status = session?.executionStatus ?? null;
  const refreshKey = session ? (isBusy(session.executionStatus) ? `${session.id}:busy` : `${session.id}:${status}`) : 'none';
  const { refresh } = git;
  const listSessions = useCallback(async () => {
    if (workspace === '(no workspace)') return;
    const r = await bridge.command({ kind: 'session.list' });
    if (r.ok) setSessions((r.value as { sessions: SessionListItemPayload[] }).sessions);
  }, [workspace]);
  // On show, and on a session terminal (the refresh key changes when the followed run stops being busy).
  useEffect(() => { refresh(); queueMicrotask(() => { void listSessions(); }); }, [refresh, listSessions, refreshKey]);
  const after = async () => { refresh(); await listSessions(); };
  // ADR-0039 (Part P): the three checkpoint commands; a refusal is a value the view renders (REQ-GIT-052), `checkpoint.busy` its toast or retry.
  const failure = (r: { ok: false; code: string; headline: string; detail?: string | undefined }) => ({ ok: false as const, code: r.code, reason: r.detail ?? r.headline });
  const checkpointOps = useMemo(() => ({
    list: async (sessionId: string) => { const r = await bridge.command({ kind: 'checkpoints.list', sessionId }); return r.ok ? { ok: true as const, listing: r.value as CheckpointListPayload } : failure(r); },
    preview: async (sessionId: string, sequence: number) => { const r = await bridge.command({ kind: 'checkpoints.preview', sessionId, sequence }); return r.ok ? { ok: true as const, preview: r.value as CheckpointPreviewPayload } : failure(r); },
    restore: async (sessionId: string, sequence: number, force: boolean) => { const r = await bridge.command({ kind: 'checkpoints.restore', sessionId, sequence, force }); return r.ok ? { ok: true as const, outcome: r.value as CheckpointRestoreOutcomePayload } : failure(r); },
  }), []);
  return <GitView
    workspaceRoot={workspace} state={git.state} refreshing={git.refreshing} sessions={sessions} layout={layout} onLayout={onLayout}
    checkpoints={checkpointOps} onRestored={() => { void after(); }} focusedSessionId={session?.id ?? null}
    onRefresh={() => { void after(); }}
    onCreateWorktree={async (branch, path) => { const r = await bridge.command({ kind: 'worktree.create', branch, path }); if (r.ok) void after(); return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline }; }}
    onDeleteWorktree={async (path, force) => { const r = await bridge.command({ kind: 'worktree.remove', path, force }); if (r.ok) void after(); return r.ok ? { ok: true } : { ok: false, reason: r.headline, needsForce: r.code === 'worktree.needs-force' }; }}
    onAcknowledge={(message) => { acknowledgements.getState().publish({ kind: 'info', title: message }); }}
    probePath={async (path) => { const r = await bridge.command({ kind: 'worktree.probePath', path }); return r.ok ? (r.value as { exists: boolean; nonEmpty: boolean }) : null; }}
  />;
}

/** REQ-SESSION-201's two actions: main supplies the dialogs, the workspace service the work. */
async function workspaceAction(kind: 'workspace.backup' | 'workspace.restore'): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = await bridge.command({ kind });
  return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
}

interface AppearanceProps {
  readonly theme: Theme;
  readonly reducedMotion: boolean;
  readonly settingsCategory: string;
  readonly onTheme: (name: ThemeName) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onMotion: (value: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

/** ADR-0037: the pending settings state (destination 1), the save, the discard, the guard, and the live state handed to the run host. */
function useConfiguration(workspace: string | null) {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [saved, setSaved] = useState<PendingSettings | null>(null);
  const [pending, setPending] = useState<PendingSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guarding, setGuarding] = useState<{ resolve: (proceed: boolean) => void } | null>(null);
  const dirty = saved !== null && pending !== null && isDirty(saved, pending);
  const pendingRef = useRef<PendingSettings | null>(null);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  // REQ-CONFIG-472: publish the pending caps for the transcript, and take them back down when the screen goes.
  useEffect(() => { pendingDisplay.setState({ caps: pending?.display ?? null }); }, [pending]);
  useEffect(() => () => { pendingDisplay.setState({ caps: null }); }, []);
  // REQ-CONFIG-419/425: a read repopulates from the file's values and marks the form clean; a change made elsewhere (the composer's write) lands in the pending state (decision 4 of the plan, REQ-CONFIG-423).
  const savedRef = useRef<PendingSettings | null>(null);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  const adopt = useCallback((next: ConfigSnapshot, keepPending: boolean) => {
    setSnapshot(next);
    const fresh = pendingFrom(next);
    const previous = savedRef.current;
    setSaved(fresh);
    // A reload from elsewhere keeps only the fields the user changed (REQ-CONFIG-419/423); every other field takes the file's new value.
    setPending((current) => (keepPending && current && previous ? rebasePending(previous, current, fresh) : fresh));
  }, []);
  const read = useCallback(async () => {
    if (workspace === null) { setSnapshot(null); setSaved(null); setPending(null); return; }
    setLoading(true);
    const r = await bridge.command({ kind: 'config.read' });
    setLoading(false);
    if (r.ok) { adopt(r.value as ConfigSnapshot, false); setError(null); } else setError(r.detail ?? r.headline);
  }, [workspace, adopt]);
  useEffect(() => { queueMicrotask(() => { void read(); }); }, [read]);
  useEffect(() => bridge.onConfigChanged((p) => { const payload = p as { snapshot: ConfigSnapshot }; adopt(payload.snapshot, true); }), [adopt]);
  // ADR-0037 Tier B: the screen's current values reach the run host on every change (REQ-CONFIG-262).
  useEffect(() => { if (pending) void bridge.command({ kind: 'config.liveState', state: liveStateOf(pending) }); }, [pending]);
  const onChange = useCallback((change: PendingChange) => { setPending((current) => (current ? applyChange(current, change) : current)); }, []);
  const onSave = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const current = pendingRef.current;
    if (!saved || !current) return { ok: false, reason: 'No configuration is loaded.' };
    const r = await bridge.command({ kind: 'config.save', save: savePayload(saved, current) });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    adopt(r.value as ConfigSnapshot, false);
    return { ok: true };
  }, [saved, adopt]);
  const onDiscard = useCallback(() => { if (saved) setPending(saved); }, [saved]);
  const onSetField = useCallback(async (scope: 'workspace' | 'global', patch: Record<string, unknown>): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'config.setField', scope, patch });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }, []);
  // REQ-CONFIG-286/287: the guard — Save (default), Discard, Cancel — on a view switch away and on a user-initiated close.
  const guard = useCallback((): Promise<boolean> => {
    if (!dirty) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setGuarding({ resolve }));
  }, [dirty]);
  useEffect(() => {
    useShellState.getState().setNavigationGuard(dirty ? () => guard() : null);
    (window as unknown as { __rotarisCloseGuard?: (() => Promise<boolean>) | undefined }).__rotarisCloseGuard = dirty ? guard : undefined;
    return () => { useShellState.getState().setNavigationGuard(null); (window as unknown as { __rotarisCloseGuard?: (() => Promise<boolean>) | undefined }).__rotarisCloseGuard = undefined; };
  }, [dirty, guard]);
  const guardDialog = guarding ? (
    <UnsavedGuardDialog
      onSave={() => { void onSave().then((r) => { const g = guarding; setGuarding(null); g.resolve(r.ok); }); }}
      onDiscard={() => { onDiscard(); const g = guarding; setGuarding(null); g.resolve(true); }}
      onCancel={() => { const g = guarding; setGuarding(null); g.resolve(false); }}
    />
  ) : null;
  return { config: { snapshot, pending, dirty, loading, error, serviceAvailable: workspace !== null, onChange, onSave, onDiscard, onSetField }, guardDialog };
}

/**
 * ADR-0022 (Part AR) / REQ-SANDBOX-116, REQ-SANDBOX-129: the availability verdict, read once and
 * re-read only on the explicit re-check. The probe runs in the run host, off this thread, so nothing
 * here blocks for the up-to-5.0-second trial (REQ-SANDBOX-069). No workspace is required: whether
 * this HOST can confine anything is a property of the machine, and REQ-SANDBOX-130's disclosure is
 * owed before any workspace question is settled.
 */
function useConfinement() {
  const [verdict, setVerdict] = useState<ConfinementVerdict | null>(null);
  const ask = useCallback(async (recheck: boolean) => {
    const r = await bridge.command({ kind: 'confinement.status', ...(recheck ? { recheck: true } : {}) });
    if (r.ok) setVerdict(r.value as ConfinementVerdict);
  }, []);
  useEffect(() => { queueMicrotask(() => { void ask(false); }); }, [ask]);
  const onRecheck = useCallback(() => ask(true), [ask]);
  return { verdict, onRecheck };
}

/**
 * ADR-0064 (Part AS) — the initialization state, read once and then PUSHED on channel 12. Nothing here
 * asks on a cadence: REQ-WORKSPACE-109 wants a step visible at the moment it finishes, and main and this
 * window can talk, which is exactly where SR-3 withdrew polling. The four commands answer with the whole
 * state too, so a surface that acts is never a frame behind the one that listens.
 */
function useInitialization() {
  const [state, setState] = useState<InitializationStateView | null>(null);
  useEffect(() => bridge.onInitializationState((p) => setState(p as InitializationStateView)), []);
  useEffect(() => { queueMicrotask(() => { void bridge.command({ kind: 'initialization.read' }).then((r) => { if (r.ok) setState(r.value as InitializationStateView); }); }); }, []);
  const send = useCallback(async (req: Parameters<typeof bridge.command>[0]) => {
    const r = await bridge.command(req);
    if (r.ok) { setState(r.value as InitializationStateView); return { ok: true as const }; }
    return { ok: false as const, message: r.detail ? `${r.headline} ${r.detail}` : r.headline };
  }, []);
  return {
    state,
    onInitialize: useCallback(() => send({ kind: 'initialization.start' }), [send]),
    onSkip: useCallback((ids: readonly string[]) => send({ kind: 'initialization.skip', ids: [...ids] }), [send]),
    onRefresh: useCallback(async () => { await send({ kind: 'initialization.read' }); }, [send]),
    onCheckAgain: useCallback(async () => { await send({ kind: 'initialization.resolve' }); }, [send]),
  };
}

function Settings({ workspace, home, theme, reducedMotion, settingsCategory, onTheme, onMotion, popOut, onPopOut }: { workspace: string | null; home: string | undefined; popOut: boolean; onPopOut: (value: boolean) => void } & AppearanceProps) {
  const session = useStore(replica, (s) => s.session);
  const sessionId = useStore(replica, (s) => s.sessionId);
  const { config, guardDialog } = useConfiguration(workspace);
  const confinement = useConfinement();
  const providers = useProviders();
  const mcp = useMcp();
  const providersCard = <ProvidersCard {...providers} />;
  // REQ-CONFIG-403 (Part AG): the two transcript preferences the Display category owns, from their one home.
  const display = useStore(displayPrefs, (s) => s);
  /**
   * REQ-SHELL-140 / REQ-CONFIG-398 (Part AG): the About page's four local facts, asked for once when Settings
   * mounts. `shell.hello` answers with no workspace, no provider and no authentication, which is what lets the
   * palette's "About & Legal" entry reach a complete page at any time (REQ-SHELL-138), and nothing here leaves
   * the machine (REQ-SHELL-139).
   */
  const [about, setAbout] = useState<AboutInfo | null>(null);
  useEffect(() => {
    queueMicrotask(() => {
      void bridge.command({ kind: 'shell.hello' }).then((r) => {
        if (!r.ok) return;
        const v = r.value as { version?: string; build?: string | null; standalone?: boolean; thirdPartyLicenses?: boolean };
        setAbout({ version: v.version ?? '?', build: v.build ?? null, standalone: v.standalone === true, thirdPartyLicenses: v.thirdPartyLicenses === true });
      });
    });
  }, []);
  const openExternal = useCallback(async (url: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'shell.openExternal', url });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }, []);
  const openThirdPartyLicenses = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'shell.openThirdPartyLicenses' });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }, []);
  // ADR-0015: the Hooks category's data — re-read from the sources on every refresh (REQ-CONFIG-014); the tab starts no hook.
  const [summary, setSummary] = useState<HooksSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (workspace === null) { setSummary(null); return; }
    setLoading(true);
    const r = await bridge.command({ kind: 'hooks.summary', ...(sessionId ? { sessionId } : {}) });
    setLoading(false);
    if (r.ok) { setSummary(r.value as HooksSummary); setError(null); } else setError(r.detail ?? r.headline);
  }, [workspace, sessionId]);
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);
  // REQ-ORCH-026: the catalogue is static for the build; read once per Settings mount.
  const [playbooks, setPlaybooks] = useState<PlaybookCatalogue | null>(null);
  useEffect(() => { queueMicrotask(() => { void bridge.command({ kind: 'playbooks.catalogue' }).then((r) => { if (r.ok) setPlaybooks(r.value as PlaybookCatalogue); }); }); }, []);
  const act = async (req: Parameters<typeof bridge.command>[0]) => {
    const r = await bridge.command(req);
    if (!r.ok) setError(r.detail ?? r.headline);
    await refresh();
  };
  const hooks = {
    summary, loading, error,
    onRefresh: () => { void refresh(); },
    onReview: () => { void act({ kind: 'hooks.review' }); },
    onClear: () => { void act({ kind: 'hooks.clearDecision' }); },
    onToggle: (agent: HookAgentId, hookId: string | null, on: boolean) => { void act({ kind: 'hooks.setToggle', agent, hookId, on }); },
  };
  // Part AJ2 — REQ-TRACE-508..511 from the Project category's traceability card, through the board's command family
  // (`requirements.operation` / `requirements.cancel`, REQ-TRACE-512): main replaces the workspace with the open root
  // and stamps the actor; the reply is the service's `traceability.result` value, which the card maps to §1481's sentences.
  const traceability = useMemo(() => ({
    workspace,
    onOperate: async (operation: 'check' | 'regenerate' | 'baselines' | 'compare', base?: string) => {
      const r = await bridge.command({ kind: 'requirements', command: { name: 'requirements.operation', workspace: workspace ?? '', operation, ...(base === undefined ? {} : { base }) } });
      return r.ok ? { ok: true as const, reply: r.value } : { ok: false as const, reason: r.detail ?? r.headline };
    },
    onCancel: async (operation: 'check' | 'regenerate' | 'baselines' | 'compare') => {
      const r = await bridge.command({ kind: 'requirements', command: { name: 'requirements.cancel', workspace: workspace ?? '', operation } });
      return r.ok ? { ok: true as const, cancelled: (r.value as { cancelled?: boolean } | null)?.cancelled === true } : { ok: false as const, reason: r.detail ?? r.headline };
    },
  }), [workspace]);
  // Part AS — REQ-WORKSPACE-114/115: the Project category's initialization card and its two controls.
  const init = useInitialization();
  const projectInit = useMemo(() => ({ state: init.state, onInitialize: init.onInitialize, onRefresh: init.onRefresh, onCheckAgain: init.onCheckAgain }), [init.state, init.onInitialize, init.onRefresh, init.onCheckAgain]);
  /*
   * ADR-0063 — the Skills category. The catalog is the run host's (`skills.read`); the POLICY is configuration
   * and joins the pending settings like every other destination-1 value, so Save writes it through Tier A
   * (REQ-CONFIG-256/258) and the save bar governs it. Rescan and Load-file are neither: REQ-WORKSPACE-069 and
   * REQ-WORKSPACE-151 both say they change no policy and mark nothing dirty, so they call the run host directly
   * and bump the shell's `skillsRevision` so the composer re-registers its commands (REQ-CHAT-034).
   */
  const [skillsState, setSkillsState] = useState<SkillsState | null>(null);
  const skillsChanged = useShellState((s) => s.skillsChanged);
  const readSkillsState = useCallback(async () => {
    if (workspace === null) { setSkillsState(null); return; }
    const r = await bridge.command({ kind: 'skills.read' });
    if (r.ok) setSkillsState(r.value as SkillsState);
  }, [workspace]);
  // Re-read on a configuration change too: `skills.enabled` and both override maps are configuration, so a Save
  // must put the resolved policy back on the rows rather than leaving the screen's own copy standing.
  useEffect(() => { queueMicrotask(() => { void readSkillsState(); }); }, [readSkillsState, config.snapshot]);
  const skills = useMemo(() => ({
    state: skillsState,
    home,
    // REQ-CONFIG-279: the selectors show what the SCREEN holds, so an unsaved choice does not snap back.
    ...(config.pending ? { pending: config.pending.skills } : {}),
    onEnabled: (value: boolean) => config.onChange({ kind: 'skillsEnabled', value }),
    onLoadMode: (name: string, value: SkillLoadModeName) => config.onChange({ kind: 'skillLoad', name, value }),
    onInvocationMode: (name: string, value: SkillInvocationModeName) => config.onChange({ kind: 'skillInvocation', name, value }),
    onRescan: async () => {
      const r = await bridge.command({ kind: 'skills.rescan' });
      if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
      const state = r.value as SkillsState;
      setSkillsState(state);
      skillsChanged();
      return { ok: true as const, count: state.skills.length };
    },
    onLoadFile: async () => {
      const r = await bridge.command({ kind: 'skills.loadFile' });
      if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
      const outcome = r.value as { cancelled: boolean; name?: string; state?: SkillsState };
      // REQ-WORKSPACE-151: a dismissal returns no selection and changes nothing — not the list, not the commands.
      if (outcome.cancelled) return { ok: true as const, cancelled: true };
      if (outcome.state) setSkillsState(outcome.state);
      skillsChanged();
      return { ok: true as const, cancelled: false, ...(outcome.name === undefined ? {} : { name: outcome.name }) };
    },
  }), [skillsState, home, config, skillsChanged]);
  /*
   * PD-WORKSPACE-002 — the Instructions category. The inventory is the configuration snapshot's; the
   * POLICY joins the pending settings like every other destination-1 value, so Save writes it through
   * Tier A and the save bar governs it.
   */
  const instructions = useMemo(() => ({
    // The switches show what the SCREEN holds, so an unsaved choice does not snap back.
    ...(config.pending ? { pending: config.pending.instructions.overrides } : {}),
    onToggle: (id: string, value: InstructionStateName) => config.onChange({ kind: 'instructionToggle', id, value }),
  }), [config]);
  const initialCategory = settingsCategory === 'models' || settingsCategory === 'personas' || settingsCategory === 'runtime' || settingsCategory === 'interface' || settingsCategory === 'display' || settingsCategory === 'skills' || settingsCategory === 'instructions' || settingsCategory === 'hooks' || settingsCategory === 'mcp' || settingsCategory === 'plugins' || settingsCategory === 'tools' || settingsCategory === 'project' || settingsCategory === 'about' ? settingsCategory : 'models';
  return (<>
    <SettingsView
      session={session}
      workspace={workspace}
      onBackup={() => workspaceAction('workspace.backup')}
      onRestore={() => workspaceAction('workspace.restore')}
      hooks={hooks}
      playbooks={playbooks}
      themes={THEMES}
      activeTheme={theme.name}
      reducedMotion={reducedMotion}
      initialCategory={initialCategory}
      onTheme={onTheme}
      onReducedMotion={onMotion}
      onCategory={(id) => { void bridge.command({ kind: 'prefs.set', key: 'interface/settingsTab', value: id }); }}
      config={{ ...config, providersCard, confinement: confinement.verdict, onRecheckConfinement: confinement.onRecheck }}
      mcp={mcp}
      display={{
        autoCollapseTools: display.autoCollapseTools,
        groupTools: display.groupTools,
        onAutoCollapseTools: (v) => writeDisplayPref('display/autoCollapseTools', v),
        onGroupTools: (v) => writeDisplayPref('display/groupTools', v),
      }}
      about={{ info: about, onOpenExternal: openExternal, onOpenThirdPartyLicenses: openThirdPartyLicenses }}
      interfaceExtras={<AgentPopOutToggle on={popOut} onChange={onPopOut} />}
      traceability={traceability /* Part AJ2 */}
      projectInit={projectInit /* Part AS */}
      skills={skills /* ADR-0063 */}
      instructions={instructions /* PD-WORKSPACE-002 */}
    />
    {guardDialog}
  </>);
}

/**
 * REQ-NOTIFY-044 / REQ-SHELL-115 — the closed action vocabulary, dispatched here and nowhere else. Each member
 * carries its object's identity, so the handler acts without a further lookup, and an action naming a view, a settings
 * category or a library tab outside the owning domain's vocabulary is NOT dispatched (ADR-0049's sixth decision).
 * Those vocabularies are imported from the domains that own them rather than restated, so neither can drift.
 *
 * No member writes into the user's project: the project action navigates only (REQ-NOTIFY-047).
 */
function dispatchNoticeAction(action: NoticeAction): void {
  const shell = useShellState.getState();
  switch (action.kind) {
    case 'open-view':
      // REQ-SHELL-023's seven ids, imported; an unknown id is a silent no-op inside `switchView` (REQ-SHELL-025).
      if (!isViewId(action.view)) { console.warn(`notice action named a view outside REQ-SHELL-023: ${action.view}`); return; }
      shell.switchView(action.view);
      return;
    case 'open-settings':
      // REQ-CONFIG-269's categories, imported from the Settings view that owns the list.
      if (!SETTINGS_CATEGORIES.some((c) => c.id === action.category)) { console.warn(`notice action named a settings category outside REQ-CONFIG-269: ${action.category}`); return; }
      shell.openSettings(action.category);
      return;
    case 'open-hook-review':
      // ESC-34: the action names the workspace whose hooks it concerns. Reviewing a different workspace's hooks than
      // the one on screen would show the wrong set (the decision is per fingerprint, REQ-HOOKS-095), so a notice that
      // outlived a workspace change opens nothing: navigating between workspaces from a notice is NOT built.
      if (!sameWorkspace(action.workspace, openWorkspace)) {
        console.warn(`notice action "open-hook-review" names ${action.workspace}, which is not the open workspace`);
        return;
      }
      void bridge.command({ kind: 'hooks.review' });
      return;
    case 'open-provider-sign-in':
      // REQ-WORKSPACE-152: clause (3)'s notice starts the flow at the catalog step, which is `add`. Clause (1)'s
      // re-authenticate entry names a provider and is reached from the Settings surface, not from a notice; no notice
      // in this build names one, so that branch has no caller and is recorded rather than guessed at.
      if (action.provider !== undefined) {
        console.warn(`notice action "open-provider-sign-in" named ${action.provider}: re-authenticate from a notice is not built`);
        return;
      }
      void bridge.command({ kind: 'providers.open', mode: 'add' });
      return;
    case 'focus-session':
      if (focusSession === null) { console.warn('notice action "focus-session" arrived before the window could open one'); return; }
      focusSession(action.sessionId);
      return;
    case 'open-library':
      // REQ-LIBRARY-103's three tab names, imported from the domain that owns the list — the same discipline the
      // view and the settings category take. An action naming a tab outside it is not dispatched (ADR-0049's
      // sixth decision), and `openLibrary` ignores an unknown name a second time on the way in.
      if (!(LIBRARY_TABS as readonly string[]).includes(action.tab)) { console.warn(`notice action named a Library tab outside REQ-LIBRARY-103: ${action.tab}`); return; }
      shell.openLibrary(action.tab);
      return;
    case 'revert-proposal-review':
      void bridge.command({ kind: 'improvements.undoReview', id: action.id });
      return;
    case 'install-update':
      // The updater (first-release-plan.md §4.6, 2026-09-28): `Update now` on the offer notice and `Try again` on the
      // failure notice (REQ-STARTUP-116/120). Main holds the offer and runs REQ-STARTUP-122's sequence; this window
      // names no version, no asset and no URL.
      void bridge.command({ kind: 'update.install' });
      return;
    case 'restart':
      // `Restart now`, offered on the `Update installed` notice alone (REQ-STARTUP-121): the hand-over to the updated
      // installation is main's, through the instance record.
      void bridge.command({ kind: 'update.restart' });
      return;
    case 'open-cloud-account':
    case 'open-project-init':
    case 'retry-run':
    case 'save-settings':
      // Each is a member REQ-NOTIFY-044 fixes whose target does not exist in this build (no hosted cloud, no
      // project-initialization surface, no proposal store). Nothing is dispatched and the attempt is recorded.
      console.warn(`notice action "${action.kind}" has no target in this build`);
      return;
  }
}

function App({ version, workspace, home, processes, initialTheme, initialReducedMotion, settingsCategory, circuitBreakerArmed, initialLayout, initialGitLayout, initialLibraryLayout, initialWorkspaceLayout, initialPopOut }: { initialLayout: PaneLayout | undefined; initialGitLayout: PaneLayout | undefined; initialLibraryLayout: PaneLayout | undefined; initialWorkspaceLayout: PaneLayout | undefined; version: string; workspace: string; home: string | undefined; processes: string[]; initialTheme: Theme; initialReducedMotion: boolean | undefined; settingsCategory: string; circuitBreakerArmed: boolean; initialPopOut: boolean }) {
  const counters = useStore(replica, (s) => s.counters);
  // REQ-SHELL-073: the "agent pop-out" preference, persisted through the preference command; default off.
  const [popOut, setPopOut] = useState(initialPopOut);
  // REQ-CHAT-067 (Part Z): the tool-grouping display preference, default ON, in the desktop preference store;
  // owned by `displayPrefs` since Part AG, so the Display settings category and the transcript read one value.
  const groupTools = useStore(displayPrefs, (s) => s.groupTools);
  const changePopOut = useCallback((value: boolean) => { setPopOut(value); void bridge.command({ kind: 'prefs.set', key: 'interface/agentPopOut', value }); }, []);
  const session = useStore(replica, (s) => s.session);
  const notice = useStore(notices, (s) => s.current);
  const [theme, setTheme] = useState(initialTheme);
  const [reducedMotion, setReducedMotion] = useState(() => initialReducedMotion ?? motionReduced());
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserSessions, setBrowserSessions] = useState<readonly SessionListItemPayload[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [models, setModels] = useState<readonly string[]>([]);
  // REQ-CHAT-009: whether the options have ARRIVED, which is not the same as there being any — a workspace that
  // configures none is loaded with nothing to offer, and the chip says so rather than staying on a loading label.
  const [modelsLoaded, setModelsLoaded] = useState(false);
  // REQ-SHELL-069: the Overview's pane split, per user, under panels/.
  const [layout, setLayout] = useState<PaneLayout | undefined>(initialLayout);
  const onLayout = useCallback((l: PaneLayout) => { setLayout(l); void bridge.command({ kind: 'prefs.set', key: 'panels/overview', value: l }); }, []);
  // REQ-GIT-076/153: the Git view's split, keyed `git` (REQ-SHELL-069), per user.
  const [gitLayout, setGitLayout] = useState<PaneLayout | undefined>(initialGitLayout);
  const onGitLayout = useCallback((l: PaneLayout) => { setGitLayout(l); void bridge.command({ kind: 'prefs.set', key: 'panels/git', value: l }); }, []);
  // REQ-LIBRARY-106 / REQ-SHELL-069 (Part X): the Prompts tab's split, keyed `library`, per user.
  const [libraryLayout, setLibraryLayout] = useState<PaneLayout | undefined>(initialLibraryLayout);
  const onLibraryLayout = useCallback((l: PaneLayout) => { setLibraryLayout(l); void bridge.command({ kind: 'prefs.set', key: 'panels/library', value: l }); }, []);
  // Part AB — REQ-CHAT-010 / REQ-SHELL-069: the Workspace's transcript/composer divider, keyed `workspace`, per user.
  const [workspaceLayout, setWorkspaceLayout] = useState<PaneLayout | undefined>(initialWorkspaceLayout);
  const onWorkspaceLayout = useCallback((l: PaneLayout) => { setWorkspaceLayout(l); void bridge.command({ kind: 'prefs.set', key: 'panels/workspace', value: l }); }, []);
  // Part X: the saved prompts, above every view (REQ-LIBRARY-105), and the stash dialog they open (REQ-LIBRARY-141).
  const prompts = usePrompts(workspace);
  const [stashOpen, setStashOpen] = useState(false);
  const git = useGitState(workspace);
  /**
   * REQ-SHELL-125 / REQ-SESSION-184: "New session" opens the launch dialog — on this multi-session host
   * a run being active no longer refuses it (REQ-MONITOR-258); the dialog locks isolation on instead
   * (REQ-GIT-119, REQ-MONITOR-251). Accepting holds the choices for the composer's next submission,
   * releases the followed session, empties the composer and shows Workspace — the previous run carries
   * on in the background.
   */
  const [launch, setLaunch] = useState<{ sessionId: string; sandboxMode: SandboxModeName; runStartMode: 'auto' | 'plan'; runActive: boolean; permissionMode: string; allowUnsandboxedAutonomous: boolean } | null>(null);
  // REQ-SANDBOX-119/120/130: the dialog shows this host's own verdict, never a hardcoded answer.
  const launchConfinement = useConfinement();
  const openStartDialog = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const current = replica.getState();
    const [id, config, list] = await Promise.all([bridge.command({ kind: 'session.newId' }), bridge.command({ kind: 'config.read' }), bridge.command({ kind: 'session.list' })]);
    if (!id.ok) return { ok: false, reason: id.detail ?? id.headline };
    const sandboxMode = config.ok ? (config.value as ConfigSnapshot).runtime.sandbox_mode : 'off';
    // REQ-ORCH-152: the persisted mode is what the dialog preselects; it holds none of its own.
    const runStartMode = config.ok ? (config.value as ConfigSnapshot).runtime.run_start_mode : 'auto';
    /*
     * REQ-SANDBOX-107: the advisory's three inputs, read from the same snapshot the modes come from.
     * `allow_unsandboxed_autonomous` is not on the settings snapshot — it is not a key this screen
     * edits — so an absent value reads as its shipped default, `false`, which is the side that
     * produces the advisory rather than suppresses it.
     */
    const permissionMode = config.ok ? (config.value as ConfigSnapshot).runtime.permission_mode : 'ask';
    // REQ-MONITOR-251 / REQ-GIT-119: the 2nd+ concurrent launch is forced into a worktree. Any busy
    // session in this workspace — focused or background — locks isolation on in the dialog.
    const currentBusy = current.session !== null && isBusy(current.session.executionStatus);
    const listBusy = list.ok
      ? ((list.value as { sessions: SessionListItemPayload[] }).sessions.some((s) => s.busy || isBusy(s.status)))
      : false;
    setLaunch({ sessionId: (id.value as { sessionId: string }).sessionId, sandboxMode, runStartMode, runActive: currentBusy || listBusy, permissionMode, allowUnsandboxedAutonomous: false });
    return { ok: true };
  }, []);
  const acceptLaunch = useCallback(async (options: LaunchOptions) => {
    setLaunch(null);
    // REQ-ORCH-152 / REQ-CONFIG-476: the dialog's mode is the persistent setting, written before the session starts
    // so the run this launch begins reads it. A failure to write is surfaced by the settings path, not swallowed here.
    await setRunStartMode(options.runStartMode);
    useShellState.getState().setLaunchOptions(options);
    // REQ-MONITOR-249/252: multi-session host — the previous run carries on in the background. Its relay
    // subscription is kept so background notices and terminal frames still reach this window; the replica
    // simply follows nothing until the next prompt starts the new session.
    replica.getState().follow(null);
    useShellState.getState().switchView('workspace');
    requestAnimationFrame(() => requestAnimationFrame(() => { const input = document.querySelector<HTMLTextAreaElement>('.composer__input'); if (input) { input.value = ''; input.focus(); } }));
  }, []);
  useEffect(() => windowTheme.subscribe(setTheme), []);
  // REQ-MONITOR-144: the run header's model selector offers the configured models.
  useEffect(() => {
    if (workspace === '(no workspace)') return;
    queueMicrotask(() => { void bridge.command({ kind: 'config.read' }).then((r) => { if (r.ok) { setModels((r.value as ConfigSnapshot).models); setModelsLoaded(true); } }); });
    return bridge.onConfigChanged((p) => { setModels((p as { snapshot: ConfigSnapshot }).snapshot.models); setModelsLoaded(true); });
  }, [workspace]);
  // REQ-SESSION-109: a session found paused at the message limit presents the dialog at once, once per pause.
  const presentedPause = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.executionStatus !== 'paused_message_limit') { if (session && session.executionStatus !== 'paused_message_limit') presentedPause.current = null; return; }
    const key = `${session.id}:${session.pausedAtCount ?? ''}`;
    if (presentedPause.current === key) return;
    presentedPause.current = key;
    void bridge.command({ kind: 'pause.present', payload: { sessionId: session.id, count: session.pausedAtCount ?? session.iterationsCompleted, limit: session.messageLimit, tokens: session.tokenUsage } });
  }, [session]);
  const changeTheme = useCallback((name: ThemeName) => windowTheme.change(name), []);
  const changeMotion = useCallback(async (value: boolean) => {
    const r = await bridge.command({ kind: 'prefs.set', key: 'ui/reduced_motion', value });
    if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
    setStoredMotionPreference(value);
    setReducedMotion(value);
    return { ok: true as const };
  }, []);
  const loadSessions = useCallback(async (): Promise<readonly SessionListItemPayload[]> => {
    setBrowserOpen(true);
    setBrowserLoading(true);
    setBrowserError(null);
    const result = await bridge.command({ kind: 'session.list' });
    setBrowserLoading(false);
    if (!result.ok) {
      setBrowserError(result.detail ?? result.headline);
      return [];
    }
    const rows = (result.value as { sessions: SessionListItemPayload[] }).sessions;
    setBrowserSessions(rows);
    return rows;
  }, []);
  // Part AN — see `slashOpeners`: the launch dialog and the session browser, reachable from the composer's catalogue.
  useEffect(() => {
    slashOpeners.newSession = openStartDialog;
    slashOpeners.openSessions = () => { void loadSessions(); };
    // Stage C — PD-WORKSPACE-001: the transient offer's action opens THIS window's own start-session surface,
    // the same REQ-SHELL-125 dialog `/new` and the Overview's control open. `Acknowledgements.tsx` is a leaf
    // with no bridge and no access to App's state, so it reads this binding at the moment it is activated.
    bindNewSessionOpener(() => { void openStartDialog(); });
    return () => { delete slashOpeners.newSession; delete slashOpeners.openSessions; bindNewSessionOpener(null); };
  }, [openStartDialog, loadSessions]);
  /** Part U: the browser's actions. Each is a command answered with a value or a reason; the list is read again afterwards. */
  const refreshSessions = useCallback(async (): Promise<void> => {
    const result = await bridge.command({ kind: 'session.list' });
    if (result.ok) setBrowserSessions((result.value as { sessions: SessionListItemPayload[] }).sessions);
  }, []);
  const outcomeOf = <T,>(r: CommandOutcome): { ok: true; value?: T } | { ok: false; reason: string } => (r.ok ? { ok: true, value: r.value as T } : { ok: false, reason: r.detail ?? r.headline });
  const deleteSession = useCallback(async (sessionId: string) => {
    const r = await bridge.command({ kind: 'session.delete', sessionId });
    // The relay subscription is per window per session: drop it whether the deleted session was
    // focused or running in the background, so no further frames for it reach this window.
    void bridge.command({ kind: 'session.unsubscribe', sessionId }).catch(() => undefined);
    if (r.ok && replica.getState().sessionId === sessionId) {
      // The window followed the session that is now gone: stop following it rather than render a record that no longer exists.
      replica.getState().follow(null);
    }
    return outcomeOf<DeleteOutcome>(r);
  }, []);
  const openSession = useCallback(async (sessionId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const result = await bridge.command({ kind: 'session.resume', sessionId });
    if (!result.ok) {
      // REQ-MONITOR-249/252: focusing a background run that is already live is not a resume — the
      // engine reports that session as already active, and following it is the correct outcome.
      const alreadyLive = result.code === 'session.run-active'
        || /already active in this application/i.test(`${result.detail ?? ''} ${result.headline ?? ''}`);
      if (!alreadyLive) return { ok: false, reason: result.detail ?? result.headline };
    }
    // Multi-session focus switch: keep the previous session's relay subscription so its background
    // notices and terminal frames keep reaching this window; the replica follows only the focused one.
    replica.getState().follow(sessionId);
    const subscribed = await bridge.command({ kind: 'session.subscribe', sessionId });
    if (!subscribed.ok) return { ok: false, reason: subscribed.detail ?? subscribed.headline };
    useShellState.getState().switchView('workspace');
    setBrowserOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.composer__input')?.focus()));
    return { ok: true };
  }, []);

  // REQ-NOTIFY-044's `focus-session`: the dispatcher is module-scoped (a notice can arrive before a view mounts), so
  // the opener is registered here for as long as this window lives.
  useEffect(() => { focusSession = (id) => { void openSession(id); }; return () => { focusSession = null; }; }, [openSession]);

  /*
   * REQ-LIBRARY-125/126 (PD-LIBRARY-002): the improvement analysis activity, which main has published on its own
   * channel since Part V with nothing reading it. It is application-wide rather than this session's — one FIFO
   * orders every pass — so it lands in the shell store, where the title bar and the run header each read it
   * without owning the other. The last publication a shutdown makes carries `active: false`, which is what
   * REQ-LIBRARY-127's "the indicators MUST end hidden" comes to here.
   */
  useEffect(() => bridge.onImprovementActivity((p) => {
    const payload = p as { active?: boolean; pass?: AnalysisPass };
    useShellState.getState().setImprovementAnalysis({ active: payload.active === true, pass: payload.pass ?? 'post_run' });
  }), []);

  /*
   * PD-CHAT-002 (superseding REQ-CHAT-098/099): question prompts auto-open docked at the bottom of the transcript.
   * Approval prompts retain their own window dialog (ADR-0019/ADR-0048).
   */
  const openTrailer = useCallback((trailer: TrailerRow) => {
    if (trailer.sort === 'question') {
      document.querySelector<HTMLElement>('[data-testid="question-stepper"]')?.focus();
      return;
    }
    void bridge.command({ kind: 'approval.raise', requestId: trailer.requestId });
  }, []);
  const branchItem = useMemo(() => branchStripItem(git.state, session?.worktreeBranch ?? null), [git.state, session]);
  // REQ-CHAT-008's recovery fact for the strip's run item, from the one liveness predicate the Workspace and Mission read.
  const needsRecovery = useNeedsRecovery(session?.id ?? null, session?.executionStatus ?? null);
  const status = useMemo<readonly StatusItem[]>(
    () => [
      // REQ-NOTIFY-048/049: the presentation vocabulary, never a raw persisted string; in REQ-CHAT-008's recovery state the
      // synthetic label, as the run header and the Mission view read it (PD-ORCH-005 clause 13, OQ-100).
      statusStripRunItem(session?.executionStatus ?? null, needsRecovery),
      // REQ-SHELL-038 / REQ-GIT-122/161: the checked-out branch, the focused session's worktree branch first.
      { text: branchItem.text, name: 'Checked-out branch', title: branchItem.title, state: branchItem.state, testId: 'strip-branch' },
      // REQ-TOOLS-184: text, never colour alone — the mode, the workspace-scope flag (REQ-TOOLS-131), redaction (REQ-TOOLS-174), background sessions.
      `mode: ${session?.permissionMode ?? 'ask'}`, 'workspace-scoped', 'redaction: always on', `bg sessions: ${session?.backgroundSessions ?? 0}`,
      ...(circuitBreakerArmed ? ['● CB armed'] : []),
      theme.label, ...processes, `applied ${counters.applied} · reset ${counters.reset} · refused ${counters.refused}`,
    ],
    [processes, counters, session, needsRecovery, theme, circuitBreakerArmed, branchItem],
  );
  // Part W: Ctrl+L (REQ-CHAT-002) and every other chord of REQ-SHELL-049 are the command registry's, bound once by the
  // shell's `useCommandShortcuts`; the Ctrl+L effect that lived here is gone. ADR-0048's application modality: the palette
  // and the keyboard help register with main's window registry through `window.modality`, and main disables input in the
  // persona windows for the duration.
  const onModality = useCallback((active: boolean) => { void bridge.command({ kind: 'window.modality', active }); }, []);
  // PD-SHELL-003: state is re-read after every toggle and whenever the host resizes the window (snap/maximize included).
  const [windowMaximized, setWindowMaximized] = useState(false);
  const readWindowState = useCallback(() => {
    void bridge.command({ kind: 'window.state' }).then((r) => {
      if (r.ok) setWindowMaximized((r.value as { maximized: boolean }).maximized);
    });
  }, []);
  useEffect(() => {
    readWindowState();
    window.addEventListener('resize', readWindowState);
    return () => window.removeEventListener('resize', readWindowState);
  }, [readWindowState]);
  const toggleWindowMaximize = useCallback(() => {
    void bridge.command({ kind: 'window.toggleMaximize' }).then(readWindowState);
  }, [readWindowState]);
  /**
   * Stage B — REQ-SHELL-035: the chip asks, and main decides. The command carries NO folder: main
   * evaluates REQ-SHELL-021's three gates, opens the native chooser and interprets the answer, so no
   * surface can skip a gate or name a folder it was not given (REQ-SHELL-020 attributes the request
   * to this window by its sender). The outcome reaches this window as a notice or a new window, never
   * as a return value worth reading here.
   */
  const chooseWorkspace = useCallback((newWindow: boolean) => { void bridge.command({ kind: 'workspace.choose', ...(newWindow ? { newWindow: true } : {}) }); }, []);
  const openRequirementSession = useCallback((id: string) => { void openSession(id); }, [openSession]); // Part AK2 — REQ-TRACE-266/269: the board's session opener is the window's own, memoised so the host is built once.
  /*
   * Part AS — ADR-0064. The window owns the setup dialog, and the automatic opening is made HERE so it
   * happens once per workspace open whichever view the user is on (REQ-WORKSPACE-105: "the dialog SHALL be
   * opened automatically at most once per workspace open"). The composer gate keeps its own reading of the
   * same pushed state; both read, neither invents.
   */
  const initialization = useInitialization();
  const projectSetup = useShellState((s) => s.projectSetup);
  const autoOpenProjectSetup = useShellState((s) => s.autoOpenProjectSetup);
  const closeProjectSetup = useShellState((s) => s.closeProjectSetup);
  const setupPromptDue = initialization.state !== null && initialization.state.view.consentPending.length > 0 && !initialization.state.view.running;
  const autoOpened = useRef(false);
  useEffect(() => {
    if (setupPromptDue && !autoOpened.current) { autoOpened.current = true; autoOpenProjectSetup(); }
  }, [setupPromptDue, autoOpenProjectSetup]);
  return (<>
    <AppShell
      onModality={onModality}
      windowControls={{
        maximized: windowMaximized,
        onMinimize: () => { void bridge.command({ kind: 'window.minimize' }); },
        onToggleMaximize: toggleWindowMaximize,
        onClose: () => { void bridge.command({ kind: 'window.close' }); },
      }}
      version={version}
      workspacePath={workspace}
      home={home}
      sessionName={null}
      onChooseWorkspace={chooseWorkspace}
      statusItems={status}
      views={{
        overview: <Overview workspace={workspace} layout={layout} onLayout={onLayout} reducedMotion={reducedMotion} onListSessions={() => { void loadSessions(); }} onOpenSession={openSession} onNewSession={openStartDialog} libraryRevision={prompts.revision} />,
        // Part AL2: the terminal host around the Workspace — the row previews, the pop-out click and the toolbar control read it (REQ-SHELL-079/080/108).
        workspace: <TerminalHostProvider host={terminalHost}><Workspace models={models} modelsLoaded={modelsLoaded} workspace={workspace} popOut={popOut} prompts={prompts} onOpenStash={() => setStashOpen(true)} groupTools={groupTools} layout={workspaceLayout} onLayout={onWorkspaceLayout} onOpenTrailer={openTrailer} /></TerminalHostProvider>,
        mission: <Mission workspace={workspace} popOut={popOut} />,
        git: <Git workspace={workspace} git={git} layout={gitLayout} onLayout={onGitLayout} />,
        library: <Library prompts={prompts} layout={libraryLayout} onLayout={onLibraryLayout} />,
        requirements: <RequirementsBoard bridge={bridge} workspace={workspace} onOpenSession={openRequirementSession} />, // Part AK2 — the fourth view of REQ-SHELL-023 (REQ-TRACE-230/381): the board over the bridge; the host lives in `ui/requirements/host.tsx`.
        settings: <Settings workspace={workspace === '(no workspace)' ? null : workspace} home={home} theme={theme} reducedMotion={reducedMotion} settingsCategory={settingsCategory} onTheme={changeTheme} onMotion={changeMotion} popOut={popOut} onPopOut={changePopOut} />,
      }}
      notice={notice}
      onAcknowledge={(noticeId) => { void bridge.command({ kind: 'notice.acknowledge', noticeId }); }}
      onAction={dispatchNoticeAction}
      acknowledgements={acknowledgements}
      onOpenSessions={() => { void loadSessions(); }}
    />
    {/*
      * Part AS — ADR-0064 / REQ-WORKSPACE-106: a WINDOW-level dialog, mounted beside the shell rather than
      * inside a view, so navigating elsewhere does not dismiss a decision the product is waiting on and
      * the rest of the application stays navigable while it is open. It opens by itself at most once per
      * workspace open (REQ-WORKSPACE-105), and otherwise only when the user asks — from the Workspace
      * sidebar's Project section or from Settings › Project (REQ-WORKSPACE-113).
      */}
    {projectSetup !== null && initialization.state !== null && (
      <ProjectSetupDialog state={initialization.state} auto={projectSetup === 'auto'} onInitialize={initialization.onInitialize} onSkip={initialization.onSkip} onClose={closeProjectSetup} />
    )}
    {browserOpen && (
      <SessionBrowser sessions={browserSessions} loading={browserLoading} error={browserError} onOpen={openSession} onDismiss={() => setBrowserOpen(false)}
        onRefresh={refreshSessions}
        onRepair={async (sessionId) => outcomeOf<{ report: RepairReportPayload }>(await bridge.command({ kind: 'session.repair', ...(sessionId === null ? {} : { sessionId }) }))}
        onDelete={deleteSession}
        onExportRecords={async (sessionId) => outcomeOf<ExportOutcome>(await bridge.command({ kind: 'session.export', sessionId }))}
        onExportTrajectory={async (sessionIds) => outcomeOf<ExportOutcome>(await bridge.command({ kind: 'session.exportTrajectory', sessionIds: [...sessionIds] }))}
        onOpenLog={async (sessionId) => outcomeOf(await bridge.command({ kind: 'session.openLog', sessionId }))}
        onRevealFiles={async (sessionId) => outcomeOf(await bridge.command({ kind: 'session.revealFiles', sessionId }))}
        onBackup={() => workspaceAction('workspace.backup')}
        onRestore={() => workspaceAction('workspace.restore')}
      />
    )}
    {/* REQ-LIBRARY-141: the stash dialog, opened from the transcript toolbar (and, once the slash catalogue exists, by `/pop`). */}
    {stashOpen && (
      <StashDialog stash={prompts.stash} onClose={() => setStashOpen(false)}
        onTake={(index, remove) => { void prompts.take('stash', index, remove).then(loadIntoComposer); }} />
    )}
    {launch && (
      <StartSessionDialog sessionId={launch.sessionId} runActive={launch.runActive} defaultSandboxMode={launch.sandboxMode} defaultRunStartMode={launch.runStartMode} confinement={launchConfinement.verdict} advisory={unattendedAdvisory({ permissionMode: launch.permissionMode, confinementActive: launchConfinement.verdict?.available === true && launch.sandboxMode !== 'off', allowUnsandboxedAutonomous: launch.allowUnsandboxedAutonomous })}
        onChooseAttach={async () => { const r = await bridge.command({ kind: 'worktree.chooseAttach' }); if (!r.ok) return { ok: false, reason: r.detail ?? r.headline }; const v = r.value as { cancelled?: boolean; path?: string; branch?: string }; return v.cancelled || !v.path ? { ok: true, cancelled: true } : { ok: true, path: v.path, branch: v.branch ?? '' }; }}
        onAccept={(options) => { void acceptLaunch(options); }} onCancel={() => setLaunch(null)} />
    )}
  </>);
}

/** REQ-CONFIG-329 / REQ-PROVIDER-140/141: the provider list and its actions, answered by main. */
/** ADR-0034 (Part S): the MCP category's data and actions — every read answered by the run host through main; probes one server at a time (REQ-MCP-092). */
function useMcp(): McpSettingsProps {
  const [listing, setListing] = useState<McpListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, McpHealth>>({});
  const [probing, setProbing] = useState(false);
  const [secrets, setSecrets] = useState<McpSecretsView | null>(null);
  const [secretsServer, setSecretsServer] = useState<string | null>(null);
  const read = useCallback(async () => {
    setLoading(true);
    const r = await bridge.command({ kind: 'mcp.list' });
    setLoading(false);
    if (r.ok) { setListing(r.value as McpListing); setError(null); } else setError(r.detail ?? r.headline);
  }, []);
  const readSecrets = useCallback(async (server: string | null) => {
    const r = await bridge.command({ kind: 'mcp.secrets', ...(server === null ? {} : { server }) });
    if (r.ok) setSecrets(r.value as McpSecretsView);
  }, []);
  useEffect(() => { queueMicrotask(() => { void read(); void readSecrets(secretsServer); }); }, [read, readSecrets, secretsServer]);
  useEffect(() => bridge.onConfigChanged(() => { void read(); void readSecrets(secretsServer); }), [read, readSecrets, secretsServer]);
  // ADR-0035 (Part T) / REQ-MCP-112: the project-setup action's status, read at mount and polled every 500 ms while a run is under way.
  const [setup, setSetup] = useState<McpSetupStatus | null>(null);
  const readSetup = useCallback(async () => {
    const r = await bridge.command({ kind: 'mcp.setup', action: 'status' });
    if (r.ok) setSetup(r.value as McpSetupStatus);
  }, []);
  useEffect(() => { queueMicrotask(() => { void readSetup(); }); }, [readSetup]);
  useEffect(() => {
    if (setup?.state !== 'running') return undefined;
    const timer = setInterval(() => { void readSetup(); }, 500);
    return () => clearInterval(timer);
  }, [setup?.state, readSetup]);
  return {
    listing, loading, error, health, probing, secrets,
    onRefresh: () => { void read(); void readSecrets(secretsServer); },
    onSecretsServer: (server) => { setSecretsServer(server); },
    setup,
    onSetupStart: async () => {
      const r = await bridge.command({ kind: 'mcp.setup', action: 'start' });
      if (r.ok) { setSetup(r.value as McpSetupStatus); return { ok: true, message: '' }; }
      return { ok: false, message: r.detail ?? r.headline };
    },
    onSetupCancel: async () => {
      const r = await bridge.command({ kind: 'mcp.setup', action: 'cancel' });
      if (r.ok) setSetup(r.value as McpSetupStatus);
    },
    onProbeAll: async () => {
      if (probing || !listing) return;
      setProbing(true);
      for (const row of listing.rows) {
        setHealth((h) => ({ ...h, [row.name]: { state: 'checking' } }));
        const r = await bridge.command({ kind: 'mcp.probe', name: row.name });
        const result = r.ok ? (r.value as { name: string; health: McpHealth }[])[0]?.health ?? { state: 'unreachable', detail: 'no answer' } : { state: 'unreachable' as const, detail: r.detail ?? r.headline };
        setHealth((h) => ({ ...h, [row.name]: result }));
      }
      setProbing(false);
    },
    onToggle: async (name, enabled) => {
      const r = await bridge.command({ kind: 'mcp.setEnabled', name, enabled });
      await read();
      return r.ok ? { ok: true, message: enabled ? `${name} enabled for this session.` : `${name} disabled for this session.` } : { ok: false, message: r.detail ?? r.headline };
    },
  };
}

function useProviders(): ProvidersCardProps {
  const [rows, setRows] = useState<readonly ProviderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = useCallback(async () => {
    setLoading(true);
    const r = await bridge.command({ kind: 'providers.list' });
    setLoading(false);
    if (r.ok) { setRows(r.value as ProviderRow[]); setError(null); } else setError(r.detail ?? r.headline);
  }, []);
  useEffect(() => { queueMicrotask(() => { void read(); }); }, [read]);
  useEffect(() => bridge.onConfigChanged(() => { void read(); }), [read]);
  const outcome = async (req: Parameters<typeof bridge.command>[0]): Promise<{ ok: boolean; message: string }> => {
    const r = await bridge.command(req);
    await read();
    if (!r.ok) return { ok: false, message: r.detail ?? r.headline };
    return r.value as { ok: boolean; message: string };
  };
  return {
    rows, loading, error,
    onAdd: () => { void bridge.command({ kind: 'providers.open', mode: 'add' }); },
    onReauthenticate: (id) => { void bridge.command({ kind: 'providers.open', mode: 'reauthenticate', providerId: id }); },
    onCheck: async (id) => { await bridge.command({ kind: 'providers.health', id }); await read(); },
    onSave: (id, edit) => outcome({ kind: 'providers.save', id, apiKey: edit.apiKey, baseUrl: edit.baseUrl, validate: edit.validate }),
    onValidate: (id) => outcome({ kind: 'providers.validate', id }),
    onSignOut: (id) => outcome({ kind: 'providers.signOut', id }),
    onDelete: (id) => outcome({ kind: 'providers.delete', id }),
    onRefreshAll: () => outcome({ kind: 'providers.refresh', ids: 'all' }),
  };
}


async function boot(): Promise<void> {
  const [themeReply, motionReply, categoryReply, layoutReply, gitLayoutReply, libraryLayoutReply, popOutReply, workspaceLayoutReply] = await Promise.all([
    bridge.command({ kind: 'theme.get' }),
    bridge.command({ kind: 'prefs.get', key: 'ui/reduced_motion' }),
    bridge.command({ kind: 'prefs.get', key: 'interface/settingsTab' }),
    bridge.command({ kind: 'prefs.get', key: 'panels/overview' }),
    bridge.command({ kind: 'prefs.get', key: 'panels/git' }),
    bridge.command({ kind: 'prefs.get', key: 'panels/library' }),
    bridge.command({ kind: 'prefs.get', key: 'interface/agentPopOut' }),
    bridge.command({ kind: 'prefs.get', key: 'panels/workspace' }),
  ]);
  const initialPopOut = popOutReply.ok ? (popOutReply.value as { value?: boolean }).value === true : false;
  const initialLayout = layoutReply.ok ? ((layoutReply.value as { value?: PaneLayout }).value ?? undefined) : undefined;
  const initialGitLayout = gitLayoutReply.ok ? ((gitLayoutReply.value as { value?: PaneLayout }).value ?? undefined) : undefined;
  const initialLibraryLayout = libraryLayoutReply.ok ? ((libraryLayoutReply.value as { value?: PaneLayout }).value ?? undefined) : undefined;
  // Part AB — REQ-CHAT-010 / REQ-SHELL-069: the Workspace's transcript/composer split, read before the first paint.
  const initialWorkspaceLayout = workspaceLayoutReply.ok ? ((workspaceLayoutReply.value as { value?: PaneLayout }).value ?? undefined) : undefined;
  const bootTheme = windowTheme.adopt(themeReply.ok ? (themeReply.value as { name?: string }).name : undefined);
  const motionSetting = motionReply.ok ? (motionReply.value as { value?: boolean }).value : undefined;
  setStoredMotionPreference(motionSetting);
  const settingsCategory = categoryReply.ok ? String((categoryReply.value as { value?: string }).value ?? 'models') : 'models';
  // Part AA: REQ-CHAT-167 and REQ-CHAT-067's two display preferences, read once before the first paint so no row is
  // drawn against a default the user has already changed.
  await readDisplayPrefs();
  const role = new URLSearchParams(window.location.search).get('role');
  if (role === 'approval') { await bootApproval(); return; }
  if (role === 'pause') { await bootPause(); return; }
  if (role === 'provider') { await bootProvider(); return; }
  if (role === 'hook-review') { await bootHookReview(); return; }
  if (role === 'persona') { await bootPersona(); return; }
  if (role === TERMINAL_WINDOW_ROLE) { await bootTerminal(); return; } // Part AL2 — the terminal window (REQ-SHELL-079..111)
  // Part AA's proof harness (verification only; main serves this role only under ROTARIS_CAPTURE_PNG + ROTARIS_ROWS_PROOF).
  if (role === 'rows-proof') {
    createRoot(document.getElementById('root')!).render(<StrictMode><RowProof onOpenLink={openLink} onAcknowledge={acknowledge} /><Acknowledgements store={acknowledgements} /></StrictMode>);
    return;
  }
  const hello = await bridge.command({ kind: 'shell.hello' });
  // Stage B — `home` rides the hello reply because REQ-WORKSPACE-149 rule 1 is a display rule and a
  // sandboxed renderer has no `node:os` (ADR-0051). It is optional on the way in: a reply from an
  // older main, or the fallback below, simply collapses nothing and draws the absolute path.
  const info = hello.ok ? (hello.value as { version: string; workspace: string; home: string | undefined; processes: string[]; circuitBreakerArmed: boolean }) : { version: '?', workspace: '(no workspace)', home: undefined, processes: [], circuitBreakerArmed: false };
  // ESC-34: the dispatcher is not a component, and one action names a workspace it must be checked against.
  openWorkspace = info.workspace;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App version={info.version} workspace={info.workspace} home={info.home} processes={info.processes} initialTheme={bootTheme} initialReducedMotion={motionSetting} initialLayout={initialLayout} initialGitLayout={initialGitLayout} initialLibraryLayout={initialLibraryLayout} initialWorkspaceLayout={initialWorkspaceLayout} settingsCategory={settingsCategory} circuitBreakerArmed={info.circuitBreakerArmed} initialPopOut={initialPopOut} />
    </StrictMode>,
  );
}

void boot();
