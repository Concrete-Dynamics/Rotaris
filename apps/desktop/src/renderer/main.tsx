import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { BRIDGE_KEY, presentationStatus, STATUS_LABELS, type ApprovalOption, type ApprovalPayload, type HookAgentId, type HooksSummary, type PermissionPreset, type PlaybookCatalogue, type RendererBridge, type TranscriptRow } from '@rotaris/contracts';
import { createNoticeStore, createReplicaStore, type NoticeStore, type ReplicaStore } from '@rotaris/ui-core';
import { AppShell, ApprovalDialog, HookReviewDialog, SettingsView, useShellState, WorkspaceView } from '@rotaris/ui';
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
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: false, reason: 'No run is active.' };
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

function Settings({ workspace }: { workspace: string | null }) {
  const session = useStore(replica, (s) => s.session);
  const sessionId = useStore(replica, (s) => s.sessionId);
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
  return <SettingsView session={session} workspace={workspace} onBackup={() => workspaceAction('workspace.backup')} onRestore={() => workspaceAction('workspace.restore')} hooks={hooks} playbooks={playbooks} />;
}

/** REQ-NOTIFY-223/224: a notice's action, resolved here to a command or a view. */
function recover(command: string): void {
  if (command === 'hooks.review') { void bridge.command({ kind: 'hooks.review' }); return; }
  if (command === 'hooks.settings') { useShellState.getState().openSettings('hooks'); return; }
}

function App({ version, workspace, processes }: { version: string; workspace: string; processes: string[] }) {
  const counters = useStore(replica, (s) => s.counters);
  const session = useStore(replica, (s) => s.session);
  const notice = useStore(notices, (s) => s.current);
  const status = useMemo(
    () => [
      // REQ-NOTIFY-048/049: the presentation vocabulary, never a raw persisted string.
      session ? `run ${STATUS_LABELS[presentationStatus(session.executionStatus)]}` : 'no session',
      // REQ-TOOLS-184: text, never colour alone — the mode, the workspace-scope flag (REQ-TOOLS-131), redaction (REQ-TOOLS-174), background sessions.
      `mode: ${session?.permissionMode ?? 'ask'}`, 'workspace-scoped', 'redaction: always on', `bg sessions: ${session?.backgroundSessions ?? 0}`,
      'rotaris-dim', ...processes, `applied ${counters.applied} · reset ${counters.reset} · refused ${counters.refused}`,
    ],
    [processes, counters, session],
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
  return (
    <AppShell
      version={version}
      workspaceLabel={workspace}
      statusItems={status}
      views={{ workspace: <Workspace />, settings: <Settings workspace={workspace === '(no workspace)' ? null : workspace} /> }}
      notice={notice}
      onAcknowledge={(noticeId) => { void bridge.command({ kind: 'notice.acknowledge', noticeId }); }}
      onRecover={recover}
    />
  );
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
  const role = new URLSearchParams(window.location.search).get('role');
  if (role === 'approval') { await bootApproval(); return; }
  if (role === 'hook-review') { await bootHookReview(); return; }
  const hello = await bridge.command({ kind: 'shell.hello' });
  const info = hello.ok ? (hello.value as { version: string; workspace: string; processes: string[] }) : { version: '?', workspace: '(no workspace)', processes: [] };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App version={info.version} workspace={info.workspace} processes={info.processes} />
    </StrictMode>,
  );
}

void boot();
