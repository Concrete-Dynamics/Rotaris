import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { BRIDGE_KEY, type RendererBridge, type TranscriptRow } from '@rotaris/contracts';
import { createReplicaStore, type ReplicaStore } from '@rotaris/ui-core';
import { AppShell, WorkspaceView } from '@rotaris/ui';
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
 * and the answer arrives as ordinary traffic on channels 1 and 2.
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
bridge.onSessionSnapshot((p) => replica.getState().applySnapshot(p));
bridge.onTranscriptIncrement((p) => replica.getState().applyIncrement(p));

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

function Workspace() {
  const session = useStore(replica, (s) => s.session);
  const rows: readonly TranscriptRow[] = useStore(replica, (s) => s.rows);
  return <WorkspaceView session={session} rows={rows} runActive={false} onSubmit={submitPrompt} />;
}

function App({ version, workspace, processes }: { version: string; workspace: string; processes: string[] }) {
  const counters = useStore(replica, (s) => s.counters);
  const status = useMemo(
    () => ['rotaris-dim', ...processes, `applied ${counters.applied} · reset ${counters.reset} · refused ${counters.refused}`],
    [processes, counters],
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
  return <AppShell version={version} workspaceLabel={workspace} statusItems={status} views={{ workspace: <Workspace /> }} />;
}

async function boot(): Promise<void> {
  const hello = await bridge.command({ kind: 'shell.hello' });
  const info = hello.ok ? (hello.value as { version: string; workspace: string; processes: string[] }) : { version: '?', workspace: '(no workspace)', processes: [] };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App version={info.version} workspace={info.workspace} processes={info.processes} />
    </StrictMode>,
  );
}

void boot();
