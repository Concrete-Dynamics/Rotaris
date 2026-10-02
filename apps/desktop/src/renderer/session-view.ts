import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { isBusy, type AgentRecord, type ConfigSnapshot, type SessionListItemPayload, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { entryRole, shownSession, type EntryRole, type PersonaEntry } from '@rotaris/ui';
import { bridge, cancelOverlays, replica } from './shell.js';

/**
 * THE SESSION AS A SURFACE READS IT — the four small readings every transcript surface in every window makes, and
 * the one gesture that opens another window onto an agent.
 *
 * They are here rather than beside the main window's own views because the persona window makes all four too, and a
 * second copy of "which persona is the entry role" is a second answer waiting to disagree with the first
 * (REQ-MONITOR-057/058 names one). The configuration they read is the workspace's, re-read on every change main
 * announces; none of them holds session state, which is the replica's alone (ADR-0043).
 */
/**
 * REQ-MONITOR-128 / REQ-MONITOR-296: a session record as this window's surfaces show it — under the optimistic cancels
 * this window has sent and the engine has not yet overwritten (`shownSession`). The persona window hands in its coalesced
 * record, which an accepted cancel still covers while it lags the replica (the store numbers the records the replica
 * takes, `shell.ts`); the main window's roots read the replica's through `useShownSession`.
 */
export function useCancelOverlaid(session: SessionRecord | null): SessionRecord | null {
  const overlays = useStore(cancelOverlays, (s) => s.overlays);
  const orderOf = useStore(cancelOverlays, (s) => s.orderOf);
  return useMemo(() => shownSession(session, { overlays, orderOf }), [session, overlays, orderOf]);
}
/** The followed session as the main window's agent surfaces show it: the replica's record under the optimistic cancels. */
export function useShownSession(): SessionRecord | null {
  return useCancelOverlaid(useStore(replica, (s) => s.session));
}
/** ADR-0037: the configuration snapshot as the screen reads it — once on mount, again on every `config:changed`. */
export function useConfigSnapshot(workspace: string): ConfigSnapshot | null {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const hasWorkspace = workspace !== '(no workspace)';
  useEffect(() => {
    if (!hasWorkspace) return;
    queueMicrotask(() => { void bridge.command({ kind: 'config.read' }).then((r) => { if (r.ok) setSnapshot(r.value as ConfigSnapshot); }); });
    return bridge.onConfigChanged((p) => setSnapshot((p as { snapshot: ConfigSnapshot }).snapshot));
  }, [hasWorkspace]);
  return snapshot;
}
/**
 * REQ-MONITOR-050: one tab per configured persona, from the snapshot's roles; their DECLARED tools (the file's list, else the
 * built-in role's — `declaredTools`, live-run finding K1) stand in for an agent with no grant (REQ-MONITOR-060).
 */
export function personasOf(snapshot: ConfigSnapshot | null): PersonaEntry[] {
  return (snapshot?.roles ?? []).map((r) => ({ role: r.role, tools: r.declaredTools, thinking: r.rawThinking, effectiveModel: r.effectiveModel }));
}
/**
 * The entry role as the run-level agent presents it (REQ-MONITOR-057/058): `entryRole` over the snapshot's role view — the
 * persona the latest root runs or ran as (the live run's `entryPersona`, else the transcript's latest root row), its model,
 * its reasoning and its declared tools (`declaredTools`, REQ-MONITOR-060's stand-in). The first root's persona was drawn until 2026-10-01
 * (docs/defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md).
 */
export function entryOf(snapshot: ConfigSnapshot | null, rows: readonly TranscriptRow[], session: Pick<SessionRecord, 'agents' | 'entryRoots' | 'entryPersona' | 'modelOverrides'> | null): EntryRole {
  // REQ-CHAT-006 / REQ-SESSION-026: with a session-wide override in force the role names the model it runs on.
  return entryRole(snapshot?.roles ?? [], rows, session?.agents ?? [], session?.entryRoots ?? [], session?.entryPersona ?? null, session?.modelOverrides ?? []);
}
/** REQ-SHELL-072/073: open or raise the persona window for an agent; the run-level agent's persona is the entry role's. */
export async function openPersona(agent: AgentRecord, focusSteer: boolean): Promise<void> {
  await bridge.command({ kind: 'window.openPersona', persona: agent.persona, agentId: agent.id, focusSteer });
}
/** REQ-MONITOR-107/110: the once-a-second tick of a VISIBLE surface, running only while the followed run is busy; nothing ticks when unmounted. */
export function useElapsedTick(session: { executionStatus: string; updatedAt: string } | null): string | null {
  const busy = session !== null && isBusy(session.executionStatus);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  // The instant is re-read when the run becomes busy — derived during render, not in an effect (React's own rule).
  const [seenBusy, setSeenBusy] = useState(busy);
  if (seenBusy !== busy) { setSeenBusy(busy); if (busy) setNowIso(new Date().toISOString()); }
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNowIso(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  return busy ? nowIso : session?.updatedAt ?? null;
}

/**
 * Part AB — REQ-CHAT-008's synthetic state: the persisted session claims busy but no local run exists. The verdict
 * comes from the ONE liveness predicate (REQ-SESSION-171) through `session.list`'s `stale`, never from this window
 * inferring it from silence, and it is re-asked only when the followed session or its status changes — there is no
 * poll, because a wrong answer here would mislabel a live run and a timer would make it a race.
 */
export function useNeedsRecovery(sessionId: string | null, executionStatus: string | null): boolean {
  const [recovery, setRecovery] = useState(false);
  const busy = executionStatus !== null && isBusy(executionStatus);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      if (!sessionId || !busy) { setRecovery(false); return; }
      void bridge.command({ kind: 'session.list' }).then((r) => {
        if (!live || !r.ok) return;
        const rows = (r.value as { sessions?: readonly SessionListItemPayload[] }).sessions ?? [];
        setRecovery(rows.find((s) => s.sessionId === sessionId)?.stale === true);
      });
    });
    return () => { live = false; };
  }, [sessionId, busy, executionStatus]);
  return recovery;
}
