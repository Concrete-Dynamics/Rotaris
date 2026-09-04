import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { BRIDGE_KEY, presentationStatus, resolveTheme, STATUS_LABELS, THEMES, type Theme, type ThemeName, type ApprovalOption, type ApprovalPayload, type ConfigSnapshot, type HookAgentId, type HooksSummary, type PermissionPreset, type PlaybookCatalogue, type RendererBridge, type SessionListItemPayload, type TranscriptRow } from '@rotaris/contracts';
import { createNoticeStore, createReplicaStore, type NoticeStore, type ReplicaStore } from '@rotaris/ui-core';
import { applyChange, applyTheme, AppShell, ApprovalDialog, HookReviewDialog, isDirty, liveStateOf, motionReduced, pendingFrom, savePayload, SessionBrowser, setStoredMotionPreference, SettingsView, UnsavedGuardDialog, useShellState, WorkspaceView, type PendingChange, type PendingSettings } from '@rotaris/ui';
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

/** REQ-CHAT-011: no session → start one; a loaded session with no run → record the prompt. */
async function submitPrompt(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = replica.getState();
  if (!s.sessionId) {
    const r = await bridge.command({ kind: 'session.start', prompt: text });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
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

function Workspace() {
  const session = useStore(replica, (s) => s.session);
  const rows: readonly TranscriptRow[] = useStore(replica, (s) => s.rows);
  return <WorkspaceView session={session} rows={rows} onSubmit={submitPrompt} onStop={stopRun} onSetMode={setMode} onCancelAgent={cancelAgent} nowIso={session?.updatedAt ?? null} />;
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
  const adopt = useCallback((next: ConfigSnapshot, keepPending: boolean) => {
    setSnapshot(next);
    const fresh = pendingFrom(next);
    setSaved(fresh);
    setPending((current) => (keepPending && current ? { ...current, runtime: { ...current.runtime, permission_mode: next.runtime.permission_mode } } : fresh));
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
      config={config}
    />
    {guardDialog}
  </>);
}

/** REQ-NOTIFY-223/224: a notice's action, resolved here to a command or a view. */
function recover(command: string): void {
  if (command === 'hooks.review') { void bridge.command({ kind: 'hooks.review' }); return; }
  if (command === 'hooks.settings') { useShellState.getState().openSettings('hooks'); return; }
  if (command === 'config.models') { useShellState.getState().openSettings('models'); return; }
}

function App({ version, workspace, processes, initialTheme, initialReducedMotion, settingsCategory, circuitBreakerArmed }: { version: string; workspace: string; processes: string[]; initialTheme: Theme; initialReducedMotion: boolean | undefined; settingsCategory: string; circuitBreakerArmed: boolean }) {
  const counters = useStore(replica, (s) => s.counters);
  const session = useStore(replica, (s) => s.session);
  const notice = useStore(notices, (s) => s.current);
  const [theme, setTheme] = useState(initialTheme);
  const [reducedMotion, setReducedMotion] = useState(() => initialReducedMotion ?? motionReduced());
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserSessions, setBrowserSessions] = useState<readonly SessionListItemPayload[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  useEffect(() => { themeSubscribers.add(setTheme); return () => { themeSubscribers.delete(setTheme); }; }, []);
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
  const status = useMemo(
    () => [
      // REQ-NOTIFY-048/049: the presentation vocabulary, never a raw persisted string.
      session ? `run ${STATUS_LABELS[presentationStatus(session.executionStatus)]}` : 'no session',
      // REQ-TOOLS-184: text, never colour alone — the mode, the workspace-scope flag (REQ-TOOLS-131), redaction (REQ-TOOLS-174), background sessions.
      `mode: ${session?.permissionMode ?? 'ask'}`, 'workspace-scoped', 'redaction: always on', `bg sessions: ${session?.backgroundSessions ?? 0}`,
      ...(circuitBreakerArmed ? ['● CB armed'] : []),
      theme.label, ...processes, `applied ${counters.applied} · reset ${counters.reset} · refused ${counters.refused}`,
    ],
    [processes, counters, session, theme, circuitBreakerArmed],
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
      views={{ workspace: <Workspace />, settings: <Settings workspace={workspace === '(no workspace)' ? null : workspace} theme={theme} reducedMotion={reducedMotion} settingsCategory={settingsCategory} onTheme={changeTheme} onMotion={changeMotion} /> }}
      notice={notice}
      onAcknowledge={(noticeId) => { void bridge.command({ kind: 'notice.acknowledge', noticeId }); }}
      onRecover={recover}
      onOpenSessions={() => { void loadSessions(); }}
    />
    {browserOpen && <SessionBrowser sessions={browserSessions} loading={browserLoading} error={browserError} onOpen={openSession} onDismiss={() => setBrowserOpen(false)} />}
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
  const [themeReply, motionReply, categoryReply] = await Promise.all([
    bridge.command({ kind: 'theme.get' }),
    bridge.command({ kind: 'prefs.get', key: 'ui/reduced_motion' }),
    bridge.command({ kind: 'prefs.get', key: 'interface/settingsTab' }),
  ]);
  runningTheme = resolveTheme(themeReply.ok ? (themeReply.value as { name?: string }).name : undefined);
  applyTheme(runningTheme, document.documentElement);
  const motionSetting = motionReply.ok ? (motionReply.value as { value?: boolean }).value : undefined;
  setStoredMotionPreference(motionSetting);
  const settingsCategory = categoryReply.ok ? String((categoryReply.value as { value?: string }).value ?? 'models') : 'models';
  const role = new URLSearchParams(window.location.search).get('role');
  if (role === 'approval') { await bootApproval(); return; }
  if (role === 'hook-review') { await bootHookReview(); return; }
  const hello = await bridge.command({ kind: 'shell.hello' });
  const info = hello.ok ? (hello.value as { version: string; workspace: string; processes: string[]; circuitBreakerArmed: boolean }) : { version: '?', workspace: '(no workspace)', processes: [], circuitBreakerArmed: false };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App version={info.version} workspace={info.workspace} processes={info.processes} initialTheme={runningTheme} initialReducedMotion={motionSetting} settingsCategory={settingsCategory} circuitBreakerArmed={info.circuitBreakerArmed} />
    </StrictMode>,
  );
}

void boot();
