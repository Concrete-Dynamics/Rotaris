import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { BRIDGE_KEY, isBusy, presentationStatus, resolveTheme, STATUS_LABELS, THEMES, type GitViewState, type PaneLayout, type RepositoryState, type SandboxModeName, type Theme, type ThemeName, type ApprovalOption, type ApprovalPayload, type ConfigSnapshot, type PausePayload, type PauseResolution, type HookAgentId, type HooksSummary, type PermissionPreset, type PlaybookCatalogue, type ProviderDialogPayload, type ProviderRow, type ProviderSignInResult, type RendererBridge, type SessionListItemPayload, type TranscriptRow } from '@rotaris/contracts';
import { createNoticeStore, createReplicaStore, type NoticeStore, type ReplicaStore } from '@rotaris/ui-core';
import { applyChange, applyTheme, AppShell, branchStripItem, GitView, OverviewView, rebasePending, ApprovalDialog, HookReviewDialog, isDirty, liveStateOf, motionReduced, PauseDialog, pendingFrom, ProviderDialog, ProvidersCard, savePayload, SessionBrowser, setStoredMotionPreference, SettingsView, StartSessionDialog, UnsavedGuardDialog, useShellState, WorkspaceView, type LaunchOptions, type PendingChange, type PendingSettings, type ProvidersCardProps, type StatusItem } from '@rotaris/ui';
import './design.css';
// The mockup loads these two stylesheets from @phosphor-icons/web@2.1.1; the design assets
// carry the same two fonts byte for byte (REQ-SHELL-027, a distinct icon per view).
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';

/**
 * The renderer composition root. One bundle for every window; the window's
 * role arrives by route (ADR-0056). Sandboxed: no Node, no filesystem, no
 * store handle — everything it knows arrives over the five channels through
 * the one frozen namespace the preload exposes (ADR-0044).
 *
 * The replica (ADR-0043) has exactly two writers, wired here to channels 1
 * and 2; a gap or a decline asks main for a whole read through channel 5,
 * and the answer arrives as ordinary traffic on channels 1 and 2. The one
 * current notice arrives on channel 4 (ADR-0049).
 */
function requireBridge(): RendererBridge {
  const b = (window as unknown as Record<string, RendererBridge | undefined>)[BRIDGE_KEY];
  if (!b) throw new Error('the preload bridge is absent — the renderer was loaded without its preload');
  return b;
}
const bridge = requireBridge();
let runningTheme = resolveTheme(undefined);
const themeSubscribers = new Set<(theme: Theme) => void>();
bridge.onThemeChanged((payload) => {
  const name = (payload as { name?: string }).name;
  runningTheme = resolveTheme(name);
  applyTheme(runningTheme, document.documentElement);
  for (const subscriber of themeSubscribers) subscriber(runningTheme);
});

const replica: ReplicaStore = createReplicaStore({
  requestReconcile: (sessionId) => { void bridge.command({ kind: 'session.reconcile', sessionId }); },
  onDiagnostic: (m) => console.warn(`[replica] ${m}`),
});
const notices: NoticeStore = createNoticeStore();
bridge.onSessionSnapshot((p) => replica.getState().applySnapshot(p));
bridge.onTranscriptIncrement((p) => replica.getState().applyIncrement(p));
bridge.onNotice((p) => notices.getState().apply(p));

/**
 * REQ-CHAT-011: no session → start one; a loaded session with no run → record the prompt.
 * REQ-SHELL-125: the launch dialog's accepted choices, held in shell state, ride on the NEXT start and are consumed
 * by it — a refused start keeps them for the retry the composer offers.
 */
async function submitPrompt(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = replica.getState();
  if (!s.sessionId) {
    const options = useShellState.getState().launchOptions;
    const r = await bridge.command({ kind: 'session.start', prompt: text, ...(options?.isolation ? { isolation: options.isolation } : {}), ...(options?.attach ? { attach: { path: options.attach.path } } : {}), ...(options ? { sandboxMode: options.sandboxMode } : {}) });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    useShellState.getState().takeLaunchOptions();
    const { sessionId } = r.value as { sessionId: string };
    replica.getState().follow(sessionId);
    // Every attach begins with a whole-session update (REQ-MONITOR-214); the transcript follows it.
    const sub = await bridge.command({ kind: 'session.subscribe', sessionId });
    if (!sub.ok) return { ok: false, reason: sub.detail ?? sub.headline };
    return { ok: true };
  }
  const r = await bridge.command({ kind: 'session.prompt', sessionId: s.sessionId, prompt: text });
  return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
}

/** REQ-SESSION-186 / ADR-0013: the shell resolves focus to a session id, then sends the control. */
async function stopRun(force: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: false, reason: 'No run is active.' };
  const r = await bridge.command({ kind: 'session.control', request: { op: 'cancel', sessionId, args: { force } } });
  if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
  const result = r.value as { ok: boolean };
  return result.ok ? { ok: true } : { ok: false, reason: 'The run is no longer cancellable.' };
}

/** REQ-TOOLS-077 / REQ-MONITOR-150: the mode change goes to the focused session; the run decides what actually happened. */
async function setMode(mode: PermissionPreset): Promise<{ ok: true } | { ok: false; reason: string }> {
  // REQ-CONFIG-288 / ADR-0037 ESC-1: the composer's control writes ITS key through the scoped per-field path, nothing else; refused loudly when the file cannot be read (REQ-CONFIG-442).
  const written = await bridge.command({ kind: 'config.setField', patch: { runtime: { permission_mode: mode } } });
  if (!written.ok) return { ok: false, reason: written.detail ?? written.headline };
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: true };
  const r = await bridge.command({ kind: 'session.control', request: { op: 'setPermissionMode', sessionId, args: { mode } } });
  if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
  return (r.value as { ok: boolean }).ok ? { ok: true } : { ok: false, reason: 'The run did not accept the mode change.' };
}

/** REQ-MONITOR-009: cancel one child; the shell resolves the session, the run decides. */
async function cancelAgent(agentId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: false, reason: 'No run is active.' };
  const r = await bridge.command({ kind: 'session.control', request: { op: 'cancelAgent', sessionId, args: { agentId } } });
  if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
  return (r.value as { ok: boolean }).ok ? { ok: true } : { ok: false, reason: 'That agent is not cancellable (unknown, or already finished).' };
}

/** ADR-0010 channel 1: one control against the focused session, `false` named as a refusal (REQ-MONITOR-006). */
async function control(op: Parameters<typeof bridge.command>[0] extends infer R ? R extends { kind: 'session.control'; request: { op: infer O } } ? O : never : never, args: Record<string, string | number | boolean | null>, refusal: string): Promise<{ ok: true; value?: string } | { ok: false; reason: string }> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: false, reason: 'No run is active.' };
  const r = await bridge.command({ kind: 'session.control', request: { op, sessionId, args } });
  if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
  const v = r.value as { ok: boolean; value?: string };
  return v.ok ? { ok: true, ...(v.value === undefined ? {} : { value: v.value }) } : { ok: false, reason: refusal };
}

/** REQ-SESSION-110 / REQ-MONITOR-125: continue the focused session, or resolve its pause. */
async function continueSession(action: PauseResolution = 'continue'): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: false, reason: 'No session is loaded.' };
  const r = await bridge.command({ kind: 'session.continue', sessionId, action });
  return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
}

function Workspace({ models }: { models: readonly string[] }) {
  const session = useStore(replica, (s) => s.session);
  const rows: readonly TranscriptRow[] = useStore(replica, (s) => s.rows);
  return <WorkspaceView
    session={session} rows={rows} onSubmit={submitPrompt} onStop={stopRun} onSetMode={setMode} onCancelAgent={cancelAgent} nowIso={session?.updatedAt ?? null}
    models={models}
    onQueue={(text) => control('createQueuedPrompt', { text }, 'The run no longer accepts prompts.')}
    onEditQueued={(promptId, text) => control('editQueuedPrompt', { promptId, text }, 'Queued message was already picked up and cannot be edited.')}
    onRemoveQueued={(promptId) => control('removeQueuedPrompt', { promptId }, 'Queued message was already picked up and cannot be deleted.')}
    onPause={() => control('pause', {}, 'Pause is unavailable because no active run exists.')}
    onContinue={() => continueSession('continue')}
    onSteer={(agentId, text) => control('submitSteeringPrompt', { agentId, text }, 'Steering is unavailable for this run.')}
    onSetModel={(model) => control('setModel', { model }, 'The run did not accept that model.')}
    onSetReasoning={(level) => control('setReasoning', { level }, 'The run did not accept that reasoning level.')}
  />;
}

/**
 * REQ-SHELL-026: the startup view. Mounted only while shown, so nothing here runs while it is hidden
 * (REQ-MONITOR-174); the session list and the repository are read on mount and again whenever the followed
 * run reaches a terminal state; the configured caps come from the configuration snapshot (REQ-MONITOR-169).
 */
const UNREAD_REPOSITORY: RepositoryState = { gitAvailable: false, isRepository: false, branch: null, base: null, ahead: 0, behind: 0, touched: 0, uncommitted: 0, failed: ['request'], readMs: 0 };
function Overview({ workspace, layout, onLayout, reducedMotion, onListSessions, onOpenSession, onNewSession }: { workspace: string; layout: PaneLayout | undefined; onLayout: (l: PaneLayout) => void; reducedMotion: boolean; onListSessions: () => void; onOpenSession: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>; onNewSession: () => Promise<{ ok: true } | { ok: false; reason: string }> }) {
  const session = useStore(replica, (s) => s.session);
  const [sessions, setSessions] = useState<readonly SessionListItemPayload[]>([]);
  const [sessionsState, setSessionsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [repository, setRepository] = useState<RepositoryState | null>(null);
  const [caps, setCaps] = useState<{ depth: number; fanOut: number } | null>(null);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const hasWorkspace = workspace !== '(no workspace)';
  const status = session?.executionStatus ?? null;
  // Changes when a session is followed, and when the followed run stops being busy — the refresh triggers of REQ-MONITOR-174.
  const refreshKey = session ? (isBusy(session.executionStatus) ? `${session.id}:busy` : `${session.id}:${status}`) : 'none';
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
  />;
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
  return <GitView
    workspaceRoot={workspace} state={git.state} refreshing={git.refreshing} sessions={sessions} layout={layout} onLayout={onLayout}
    onRefresh={() => { void after(); }}
    onCreateWorktree={async (branch, path) => { const r = await bridge.command({ kind: 'worktree.create', branch, path }); if (r.ok) void after(); return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline }; }}
    onDeleteWorktree={async (path, force) => { const r = await bridge.command({ kind: 'worktree.remove', path, force }); if (r.ok) void after(); return r.ok ? { ok: true } : { ok: false, reason: r.headline, needsForce: r.code === 'worktree.needs-force' }; }}
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

function Settings({ workspace, theme, reducedMotion, settingsCategory, onTheme, onMotion }: { workspace: string | null } & AppearanceProps) {
  const session = useStore(replica, (s) => s.session);
  const sessionId = useStore(replica, (s) => s.sessionId);
  const { config, guardDialog } = useConfiguration(workspace);
  const providers = useProviders();
  const providersCard = <ProvidersCard {...providers} />;
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
      config={{ ...config, providersCard }}
    />
    {guardDialog}
  </>);
}

/** REQ-NOTIFY-223/224: a notice's action, resolved here to a command or a view. */
function recover(command: string): void {
  if (command === 'hooks.review') { void bridge.command({ kind: 'hooks.review' }); return; }
  if (command === 'hooks.settings') { useShellState.getState().openSettings('hooks'); return; }
  if (command === 'config.models') { useShellState.getState().openSettings('models'); return; }
  if (command === 'providers.add') { void bridge.command({ kind: 'providers.open', mode: 'add' }); return; }
}

function App({ version, workspace, processes, initialTheme, initialReducedMotion, settingsCategory, circuitBreakerArmed, initialLayout, initialGitLayout }: { initialLayout: PaneLayout | undefined; initialGitLayout: PaneLayout | undefined; version: string; workspace: string; processes: string[]; initialTheme: Theme; initialReducedMotion: boolean | undefined; settingsCategory: string; circuitBreakerArmed: boolean }) {
  const counters = useStore(replica, (s) => s.counters);
  const session = useStore(replica, (s) => s.session);
  const notice = useStore(notices, (s) => s.current);
  const [theme, setTheme] = useState(initialTheme);
  const [reducedMotion, setReducedMotion] = useState(() => initialReducedMotion ?? motionReduced());
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserSessions, setBrowserSessions] = useState<readonly SessionListItemPayload[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [models, setModels] = useState<readonly string[]>([]);
  // REQ-SHELL-069: the Overview's pane split, per user, under panels/.
  const [layout, setLayout] = useState<PaneLayout | undefined>(initialLayout);
  const onLayout = useCallback((l: PaneLayout) => { setLayout(l); void bridge.command({ kind: 'prefs.set', key: 'panels/overview', value: l }); }, []);
  // REQ-GIT-076/153: the Git view's split, keyed `git` (REQ-SHELL-069), per user.
  const [gitLayout, setGitLayout] = useState<PaneLayout | undefined>(initialGitLayout);
  const onGitLayout = useCallback((l: PaneLayout) => { setGitLayout(l); void bridge.command({ kind: 'prefs.set', key: 'panels/git', value: l }); }, []);
  const git = useGitState(workspace);
  /**
   * REQ-SHELL-125 / REQ-SESSION-184: "New session" opens the launch dialog — refused with the sentence while a run is
   * active on this single-run host; accepting holds the choices for the composer's next submission, releases the
   * followed session, empties the composer and shows Workspace.
   */
  const [launch, setLaunch] = useState<{ sessionId: string; sandboxMode: SandboxModeName; runActive: boolean } | null>(null);
  const openStartDialog = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const current = replica.getState();
    if (current.session && isBusy(current.session.executionStatus)) return { ok: false, reason: 'Finish or cancel the active run before starting a new session.' };
    const [id, config] = await Promise.all([bridge.command({ kind: 'session.newId' }), bridge.command({ kind: 'config.read' })]);
    if (!id.ok) return { ok: false, reason: id.detail ?? id.headline };
    const sandboxMode = config.ok ? (config.value as ConfigSnapshot).runtime.sandbox_mode : 'off';
    setLaunch({ sessionId: (id.value as { sessionId: string }).sessionId, sandboxMode, runActive: false });
    return { ok: true };
  }, []);
  const acceptLaunch = useCallback(async (options: LaunchOptions) => {
    setLaunch(null);
    useShellState.getState().setLaunchOptions(options);
    const current = replica.getState();
    if (current.sessionId) await bridge.command({ kind: 'session.unsubscribe', sessionId: current.sessionId });
    replica.getState().follow(null);
    useShellState.getState().switchView('workspace');
    requestAnimationFrame(() => requestAnimationFrame(() => { const input = document.querySelector<HTMLTextAreaElement>('.composer__input'); if (input) { input.value = ''; input.focus(); } }));
  }, []);
  useEffect(() => { themeSubscribers.add(setTheme); return () => { themeSubscribers.delete(setTheme); }; }, []);
  // REQ-MONITOR-144: the run header's model selector offers the configured models.
  useEffect(() => {
    if (workspace === '(no workspace)') return;
    queueMicrotask(() => { void bridge.command({ kind: 'config.read' }).then((r) => { if (r.ok) setModels((r.value as ConfigSnapshot).models); }); });
    return bridge.onConfigChanged((p) => setModels((p as { snapshot: ConfigSnapshot }).snapshot.models));
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
  const changeTheme = useCallback(async (name: ThemeName) => {
    const r = await bridge.command({ kind: 'theme.set', name });
    if (!r.ok) return { ok: false as const, reason: r.detail ?? r.headline };
    const next = resolveTheme(name);
    runningTheme = next;
    applyTheme(next, document.documentElement);
    setTheme(next);
    return { ok: true as const };
  }, []);
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
  const openSession = useCallback(async (sessionId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const result = await bridge.command({ kind: 'session.resume', sessionId });
    if (!result.ok) return { ok: false, reason: result.detail ?? result.headline };
    const current = replica.getState().sessionId;
    if (current && current !== sessionId) await bridge.command({ kind: 'session.unsubscribe', sessionId: current });
    replica.getState().follow(sessionId);
    const subscribed = await bridge.command({ kind: 'session.subscribe', sessionId });
    if (!subscribed.ok) return { ok: false, reason: subscribed.detail ?? subscribed.headline };
    useShellState.getState().switchView('workspace');
    setBrowserOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.composer__input')?.focus()));
    return { ok: true };
  }, []);
  const branchItem = useMemo(() => branchStripItem(git.state, session?.worktreeBranch ?? null), [git.state, session]);
  const status = useMemo<readonly StatusItem[]>(
    () => [
      // REQ-NOTIFY-048/049: the presentation vocabulary, never a raw persisted string.
      session ? `run ${STATUS_LABELS[presentationStatus(session.executionStatus)]}` : 'no session',
      // REQ-SHELL-038 / REQ-GIT-122/161: the checked-out branch, the focused session's worktree branch first.
      { text: branchItem.text, name: 'Checked-out branch', title: branchItem.title, state: branchItem.state, testId: 'strip-branch' },
      // REQ-TOOLS-184: text, never colour alone — the mode, the workspace-scope flag (REQ-TOOLS-131), redaction (REQ-TOOLS-174), background sessions.
      `mode: ${session?.permissionMode ?? 'ask'}`, 'workspace-scoped', 'redaction: always on', `bg sessions: ${session?.backgroundSessions ?? 0}`,
      ...(circuitBreakerArmed ? ['● CB armed'] : []),
      theme.label, ...processes, `applied ${counters.applied} · reset ${counters.reset} · refused ${counters.refused}`,
    ],
    [processes, counters, session, theme, circuitBreakerArmed, branchItem],
  );
  useEffect(() => {
    // REQ-CHAT-002: Ctrl+L moves keyboard focus to the composer from anywhere in the window.
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        (document.querySelector<HTMLTextAreaElement>('.composer__input'))?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (<>
    <AppShell
      version={version}
      workspaceLabel={workspace}
      statusItems={status}
      views={{
        overview: <Overview workspace={workspace} layout={layout} onLayout={onLayout} reducedMotion={reducedMotion} onListSessions={() => { void loadSessions(); }} onOpenSession={openSession} onNewSession={openStartDialog} />,
        workspace: <Workspace models={models} />,
        git: <Git workspace={workspace} git={git} layout={gitLayout} onLayout={onGitLayout} />,
        settings: <Settings workspace={workspace === '(no workspace)' ? null : workspace} theme={theme} reducedMotion={reducedMotion} settingsCategory={settingsCategory} onTheme={changeTheme} onMotion={changeMotion} />,
      }}
      notice={notice}
      onAcknowledge={(noticeId) => { void bridge.command({ kind: 'notice.acknowledge', noticeId }); }}
      onRecover={recover}
      onOpenSessions={() => { void loadSessions(); }}
    />
    {browserOpen && <SessionBrowser sessions={browserSessions} loading={browserLoading} error={browserError} onOpen={openSession} onDismiss={() => setBrowserOpen(false)} />}
    {launch && (
      <StartSessionDialog sessionId={launch.sessionId} runActive={launch.runActive} defaultSandboxMode={launch.sandboxMode} confinementAvailable={false}
        onChooseAttach={async () => { const r = await bridge.command({ kind: 'worktree.chooseAttach' }); if (!r.ok) return { ok: false, reason: r.detail ?? r.headline }; const v = r.value as { cancelled?: boolean; path?: string; branch?: string }; return v.cancelled || !v.path ? { ok: true, cancelled: true } : { ok: true, path: v.path, branch: v.branch ?? '' }; }}
        onAccept={(options) => { void acceptLaunch(options); }} onCancel={() => setLaunch(null)} />
    )}
  </>);
}

/** The approval window: the same bundle, role by route (ADR-0056); it asks main for its request, answers through the control. */
async function bootApproval(): Promise<void> {
  const r = await bridge.command({ kind: 'approval.payload' });
  const root = createRoot(document.getElementById('root')!);
  if (!r.ok) { root.render(<div className="approval"><p role="alert">{r.headline}</p></div>); return; }
  const { payload, othersWaiting } = r.value as { payload: ApprovalPayload; othersWaiting: number };
  document.title = 'Permission required';
  const onAnswer = async (option: ApprovalOption): Promise<{ delivered: boolean }> => {
    const c = await bridge.command({ kind: 'session.control', request: { op: 'answerApproval', sessionId: payload.session_id, args: { requestId: payload.request_id, option } } });
    return { delivered: c.ok && (c.value as { ok: boolean }).ok };
  };
  root.render(<StrictMode><ApprovalDialog payload={payload} othersWaiting={othersWaiting} onAnswer={onAnswer} /></StrictMode>);
}


/** REQ-PROVIDER-116/117: the provider authentication window; it signs in through the command and closes itself. */
async function bootProvider(): Promise<void> {
  const r = await bridge.command({ kind: 'provider.payload' });
  const root = createRoot(document.getElementById('root')!);
  if (!r.ok) { root.render(<div className="approval"><p role="alert">{r.headline}</p></div>); return; }
  const payload = r.value as ProviderDialogPayload;
  const onSubmit = async (req: { providerId: string; label: string; baseUrl: string; apiKey: string; replace: boolean; allowEmpty: boolean }): Promise<ProviderSignInResult | { outcome: 'error'; message: string }> => {
    const c = await bridge.command({ kind: 'provider.signIn', providerId: req.providerId, label: req.label, baseUrl: req.baseUrl, apiKey: req.apiKey, replace: req.replace, allowEmpty: req.allowEmpty });
    if (!c.ok) return { outcome: 'error', message: c.detail ?? c.headline };
    return c.value as ProviderSignInResult;
  };
  root.render(<StrictMode><ProviderDialog payload={payload} onSubmit={onSubmit} onClose={() => window.close()} /></StrictMode>);
}

/** REQ-CONFIG-329 / REQ-PROVIDER-140/141: the provider list and its actions, answered by main. */
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

/** REQ-ORCH-086 / REQ-SESSION-109: the pause window; it resolves through the session command and closes itself. */
async function bootPause(): Promise<void> {
  const r = await bridge.command({ kind: 'pause.payload' });
  const root = createRoot(document.getElementById('root')!);
  if (!r.ok) { root.render(<div className="approval"><p role="alert">{r.headline}</p></div>); return; }
  const payload = r.value as PausePayload;
  document.title = 'Run paused';
  const onResolve = async (action: PauseResolution): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const c = await bridge.command({ kind: 'session.continue', sessionId: payload.sessionId, action });
    if (!c.ok) return { ok: false, reason: c.detail ?? c.headline };
    window.close();
    return { ok: true };
  };
  root.render(<StrictMode><PauseDialog payload={payload} onResolve={onResolve} /></StrictMode>);
  // Verification only: the proof answers the dialog through a query the main process set from its seam.
  const scripted = new URLSearchParams(window.location.search).get('answer');
  if (scripted === 'continue' || scripted === 'double' || scripted === 'cancel') setTimeout(() => { void onResolve(scripted); }, 400);
}

/** REQ-HOOKS-106/107: the review window — the only surface that displays a hook command. */
async function bootHookReview(): Promise<void> {
  const r = await bridge.command({ kind: 'hooks.reviewPayload' });
  const root = createRoot(document.getElementById('root')!);
  if (!r.ok) { root.render(<div className="approval"><p role="alert">{r.headline}</p></div>); return; }
  const { workspace, entries } = r.value as { workspace: string; entries: HooksSummary['review'] };
  document.title = "Review this workspace's hooks";
  const onDecide = async (trusted: boolean): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const c = await bridge.command({ kind: 'hooks.reviewDecide', trusted });
    return c.ok ? { ok: true } : { ok: false, reason: c.detail ?? c.headline };
  };
  root.render(<StrictMode><HookReviewDialog workspace={workspace} entries={entries} onDecide={onDecide} /></StrictMode>);
}

async function boot(): Promise<void> {
  const [themeReply, motionReply, categoryReply, layoutReply, gitLayoutReply] = await Promise.all([
    bridge.command({ kind: 'theme.get' }),
    bridge.command({ kind: 'prefs.get', key: 'ui/reduced_motion' }),
    bridge.command({ kind: 'prefs.get', key: 'interface/settingsTab' }),
    bridge.command({ kind: 'prefs.get', key: 'panels/overview' }),
    bridge.command({ kind: 'prefs.get', key: 'panels/git' }),
  ]);
  const initialLayout = layoutReply.ok ? ((layoutReply.value as { value?: PaneLayout }).value ?? undefined) : undefined;
  const initialGitLayout = gitLayoutReply.ok ? ((gitLayoutReply.value as { value?: PaneLayout }).value ?? undefined) : undefined;
  runningTheme = resolveTheme(themeReply.ok ? (themeReply.value as { name?: string }).name : undefined);
  applyTheme(runningTheme, document.documentElement);
  const motionSetting = motionReply.ok ? (motionReply.value as { value?: boolean }).value : undefined;
  setStoredMotionPreference(motionSetting);
  const settingsCategory = categoryReply.ok ? String((categoryReply.value as { value?: string }).value ?? 'models') : 'models';
  const role = new URLSearchParams(window.location.search).get('role');
  if (role === 'approval') { await bootApproval(); return; }
  if (role === 'pause') { await bootPause(); return; }
  if (role === 'provider') { await bootProvider(); return; }
  if (role === 'hook-review') { await bootHookReview(); return; }
  const hello = await bridge.command({ kind: 'shell.hello' });
  const info = hello.ok ? (hello.value as { version: string; workspace: string; processes: string[]; circuitBreakerArmed: boolean }) : { version: '?', workspace: '(no workspace)', processes: [], circuitBreakerArmed: false };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App version={info.version} workspace={info.workspace} processes={info.processes} initialTheme={runningTheme} initialReducedMotion={motionSetting} initialLayout={initialLayout} initialGitLayout={initialGitLayout} settingsCategory={settingsCategory} circuitBreakerArmed={info.circuitBreakerArmed} />
    </StrictMode>,
  );
}

void boot();
