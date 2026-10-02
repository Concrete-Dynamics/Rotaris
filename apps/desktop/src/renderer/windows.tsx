import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { RUN_AGENT_ID, TERMINAL_REFUSALS, type ApprovalOption, type ApprovalPayload, type CommandOutcome, type HooksSummary, type PausePayload, type PauseResolution, type ProviderDialogPayload, type ProviderSignInResult, type SessionListItemPayload, type TerminalFrame, type TerminalRefusal, type TerminalWindowPayload } from '@rotaris/contracts';
import { Acknowledgements, ApprovalDialog, ArtifactInspector, createTerminalWindowStreams, type ArtifactLoaded, HookReviewDialog, PauseDialog, PersonaWindow, ProviderDialog, restingView, TerminalWindow, terminalWindowTitle, ToggleSwitch, type TerminalActionResult, type TerminalActions, type TerminalStreamSet } from '@rotaris/ui';
import { acknowledge, acknowledgements, bridge, cancelAgent, cancelRun, control, displayPrefs, openLink, replica, terminalHost, terminalStreams } from './shell.js';
import { entryOf, useCancelOverlaid, useConfigSnapshot, useElapsedTick, useNeedsRecovery } from './session-view.js';
import { followCoalesced } from './coalesced-follow.js';

/**
 * THE WINDOWS BESIDE THE MAIN ONE (ADR-0056: one bundle for every window, the role by route).
 *
 * Six roles, two shapes. Four are DIALOGS — the approval, the provider sign-in, the pause and the hook review: each
 * asks main for the payload its window was opened for, draws one component over it, answers through one command and
 * closes. That shape was written out four times, including four copies of "if main refused, draw its headline
 * instead of the dialog", which is what `mountWindow` is and why none of them says it any more.
 *
 * Two are FULL RENDERERS holding their own replica of the same numbered publications — the persona window and the
 * terminal window. They are not dialogs and do not pretend to be: they subscribe, they hold a registry, and they sit
 * here only because a window is a window.
 *
 * Every one of them draws THIS window's acknowledgement stack, never the main window's (ADR-0049's fourth decision).
 */
async function mountWindow<T>(
  request: Parameters<typeof bridge.command>[0],
  draw: (payload: T, root: ReturnType<typeof createRoot>) => void | Promise<void>,
): Promise<void> {
  const r = await bridge.command(request);
  const root = createRoot(document.getElementById('root')!);
  // A window main opened for something it can no longer name draws the refusal, not an empty dialog.
  if (!r.ok) { root.render(<div className="approval"><p role="alert">{r.headline}</p></div>); return; }
  await draw(r.value as T, root);
}

/** The approval window: the same bundle, role by route (ADR-0056); it asks main for its request, answers through the control. */
export function bootApproval(): Promise<void> {
  return mountWindow<{ payload: ApprovalPayload; othersWaiting: number }>({ kind: 'approval.payload' }, ({ payload, othersWaiting }, root) => {
    document.title = 'Permission required';
    const onAnswer = async (option: ApprovalOption): Promise<{ delivered: boolean }> => {
      const c = await bridge.command({ kind: 'session.control', request: { op: 'answerApproval', sessionId: payload.session_id, args: { requestId: payload.request_id, option } } });
      return { delivered: c.ok && (c.value as { ok: boolean }).ok };
    };
    root.render(<StrictMode><ApprovalDialog payload={payload} othersWaiting={othersWaiting} onAnswer={onAnswer} /></StrictMode>);
  });
}


/** REQ-PROVIDER-116/117: the provider authentication window; it signs in through the command and closes itself. */
export function bootProvider(): Promise<void> {
  return mountWindow<ProviderDialogPayload>({ kind: 'provider.payload' }, (payload, root) => {
    const onSubmit = async (req: { providerId: string; label: string; baseUrl: string; apiKey: string; replace: boolean; allowEmpty: boolean }): Promise<ProviderSignInResult | { outcome: 'error'; message: string }> => {
      const c = await bridge.command({ kind: 'provider.signIn', providerId: req.providerId, label: req.label, baseUrl: req.baseUrl, apiKey: req.apiKey, replace: req.replace, allowEmpty: req.allowEmpty });
      if (!c.ok) return { outcome: 'error', message: c.detail ?? c.headline };
      return c.value as ProviderSignInResult;
    };
    root.render(<StrictMode><ProviderDialog payload={payload} onSubmit={onSubmit} onClose={() => window.close()} /></StrictMode>);
  });
}

/** REQ-ORCH-086 / REQ-SESSION-109: the pause window; it resolves through the session command and closes itself. */
export function bootPause(): Promise<void> {
  return mountWindow<PausePayload>({ kind: 'pause.payload' }, (payload, root) => {
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
  });
}

/** REQ-HOOKS-106/107: the review window — the only surface that displays a hook command. */
export function bootHookReview(): Promise<void> {
  return mountWindow<{ workspace: string; entries: HooksSummary['review'] }>({ kind: 'hooks.reviewPayload' }, ({ workspace, entries }, root) => {
    document.title = "Review this workspace's hooks";
    const onDecide = async (trusted: boolean): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const c = await bridge.command({ kind: 'hooks.reviewDecide', trusted });
      return c.ok ? { ok: true } : { ok: false, reason: c.detail ?? c.headline };
    };
    root.render(<StrictMode><HookReviewDialog workspace={workspace} entries={entries} onDecide={onDecide} /></StrictMode>);
  });
}

/**
 * ADR-0048 B / ADR-0043 (Part R): a persona window is a full renderer with its own replica of the same numbered
 * publications. Visibility is the platform's own signal: on hide the window unsubscribes and cancels every timer (the
 * zero-work rule); on show it subscribes again — the relay first, then the attach whose whole-session update is the
 * first state painted — and re-reads its payload for the instance main asked it to select. Refreshes are coalesced at
 * 120 ms (REQ-SHELL-076): the replica's changes reach React through one trailing timer per interval, none while hidden.
 */
export function PersonaApp({ persona, initialSelect }: { persona: string; initialSelect: { agentId: string; focusSteer: boolean } | null }) {
  const [state, setState] = useState(() => ({ session: replica.getState().session, rows: replica.getState().rows }));
  const [selected, setSelected] = useState<string | null>(initialSelect?.agentId ?? null);
  const [focusSteer, setFocusSteer] = useState(initialSelect?.focusSteer ? 1 : 0);
  const [visible, setVisible] = useState(!document.hidden);
  const snapshot = useConfigSnapshot('persona');
  // REQ-SHELL-076: one rebuild per 120 ms interval; a hidden window rebuilds nothing. What the replica applied between the
  // first render's read and this subscription is delivered as it is taken (`followCoalesced`): a session at rest
  // publishes nothing more, so a missed transcript would stay missing (PD-ORCH-005 clause 13, OQ-100).
  useEffect(() => followCoalesced({
    subscribe: (listener) => replica.subscribe(listener),
    read: () => ({ session: replica.getState().session, rows: replica.getState().rows }),
    deliver: (next) => setState((prev) => (prev.session === next.session && prev.rows === next.rows ? prev : next)),
    hidden: () => document.hidden,
    intervalMs: 120,
  }), []);
  useEffect(() => {
    const onVisibility = () => {
      const sessionId = replica.getState().sessionId;
      if (document.hidden) {
        setVisible(false);
        if (sessionId) void bridge.command({ kind: 'session.unsubscribe', sessionId });
        return;
      }
      setVisible(true);
      void bridge.command({ kind: 'window.personaPayload' }).then(async (r) => {
        const payload = r.ok ? (r.value as { sessionId: string | null; select: { agentId: string; focusSteer: boolean } | null }) : null;
        const next = payload?.sessionId ?? sessionId;
        if (!next) return;
        if (next !== replica.getState().sessionId) replica.getState().follow(next);
        await bridge.command({ kind: 'session.subscribe', sessionId: next });
        setState({ session: replica.getState().session, rows: replica.getState().rows });
        if (payload?.select) { setSelected(payload.select.agentId); if (payload.select.focusSteer) setFocusSteer((n) => n + 1); }
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    (window as unknown as { __rotarisPersonaSelect?: (id: string, focus: boolean) => boolean }).__rotarisPersonaSelect = (id, focus) => { setSelected(id); if (focus) setFocusSteer((n) => n + 1); return true; };
    return () => { document.removeEventListener('visibilitychange', onVisibility); delete (window as unknown as { __rotarisPersonaSelect?: unknown }).__rotarisPersonaSelect; };
  }, []);
  // REQ-MONITOR-128 / REQ-MONITOR-296: this window's surfaces read the record under its optimistic cancels of one agent.
  const session = useCancelOverlaid(state.session);
  const entry = useMemo(() => entryOf(snapshot, state.rows, session), [snapshot, state.rows, session]);
  // PD-ORCH-005 clause 13 (OQ-100): in REQ-CHAT-008's recovery state the run-level agent presents `paused`, as in the main
  // window — from `restingView`, the one call the Workspace and the Mission root make too.
  const needsRecovery = useNeedsRecovery(session?.id ?? null, session?.executionStatus ?? null);
  const { runLevel } = useMemo(() => restingView(session, entry, needsRecovery), [session, entry, needsRecovery]);
  const nowIso = useElapsedTick(visible ? session : null);
  const declared = snapshot?.roles.find((r) => r.role === persona)?.declaredTools ?? [];
  const display = useStore(displayPrefs, (s) => s);
  // REQ-MONITOR-068/069 (live-run finding K1): an artifact link opens the artifact inspector IN THIS WINDOW (REQ-LIBRARY-131:
  // modeless, one per id, re-raised when opened again; the inspectors are per window) — no command reaches the main
  // window's Library from here, and the artifact is the loaded session's, which the run host serves to any window.
  const [artifactsOpen, setArtifactsOpen] = useState<readonly { id: string; raised: number }[]>([]);
  const openArtifact = (id: string) => setArtifactsOpen((current) => (current.some((x) => x.id === id) ? current.map((x) => (x.id === id ? { id, raised: x.raised + 1 } : x)) : [...current, { id, raised: 1 }]));
  const loadArtifact = async (id: string) => {
    const r = await bridge.command({ kind: 'artifacts.body', ref: id });
    return r.ok ? { ok: true as const, artifact: r.value as ArtifactLoaded } : { ok: false as const, reason: r.detail ?? r.headline };
  };
  const saveArtifact = async (id: string, body: string) => {
    const r = await bridge.command({ kind: 'artifacts.save', ref: id, body });
    return r.ok ? { ok: true as const, editedAt: (r.value as { editedAt: string }).editedAt } : { ok: false as const, reason: r.detail ?? r.headline };
  };
  return (<>
    <PersonaWindow
      onOpenLink={openLink} onAcknowledge={acknowledge} showReasoning={display.showReasoning} autoCollapseTools={display.autoCollapseTools}
      // Part AL2 — REQ-SHELL-075 (b): this window's own preview registry, and the pop-out request (REQ-CHAT-076).
      terminalPreview={(streamId) => terminalStreams.previewOf(streamId)} openTerminal={(streamId) => terminalHost.open(streamId)}
      persona={persona} session={session} rows={state.rows} runLevel={runLevel} declaredTools={declared} selectedAgentId={selected} onSelectTab={setSelected}
      nowIso={nowIso} compressionThresholdPercent={snapshot?.compressorThresholdPercentage ?? 60} focusSteer={focusSteer}
      onSteer={(agentId, text) => control('submitSteeringPrompt', { agentId, text }, 'Steering is unavailable for this run.')}
      // REQ-SHELL-075(g) / REQ-MONITOR-009: the confirmed Cancel of the run's own instance is the run's final cancel
      // (PD-ORCH-005 clauses 3 and 15); of a child, that child's.
      onCancel={(agentId) => (agentId === RUN_AGENT_ID ? cancelRun() : cancelAgent(agentId))}
      onOpenArtifact={openArtifact}
    />
    {artifactsOpen.map((entry) => (
      <ArtifactInspector key={entry.id} id={entry.id} raised={entry.raised} onLoad={loadArtifact} onSave={saveArtifact}
        onClose={(id) => setArtifactsOpen((current) => current.filter((x) => x.id !== id))} />
    ))}
    {/* ADR-0049's fourth decision: the acknowledgement stack is PER WINDOW, so this window owns its own — the same
        shared component the main window draws, swept for accessibility here in its own right (REQ-SHELL-112). */}
    <Acknowledgements store={acknowledgements} />
  </>);
}
export function bootPersona(): Promise<void> {
  return mountWindow<{ persona: string; sessionId: string | null; select: { agentId: string; focusSteer: boolean } | null }>({ kind: 'window.personaPayload' }, async (payload, root) => {
    document.title = `Rotaris · ${payload.persona}`;
    if (payload.sessionId) {
      replica.getState().follow(payload.sessionId);
      await bridge.command({ kind: 'session.subscribe', sessionId: payload.sessionId });
    }
    root.render(<StrictMode><PersonaApp persona={payload.persona} initialSelect={payload.select} /></StrictMode>);
  });
}

/**
 * Part AL2 — the terminal window's renderer (`role=terminal`; REQ-SHELL-079..111): ADR-0047's window component mounted
 * over ADR-0021's frames, in a window `main/windows.ts` builds once per main window and rebuilds on every open
 * (REQ-SHELL-086). It asks main what it was opened onto (`window.terminalPayload`: the followed session, the stream to
 * bring forward, the auto-open preference), subscribes to that session FOR ITSELF so channel 3 reaches it (the sender
 * is the subscriber, ADR-0043's note), asks the run host for the resync (REQ-SHELL-104: the retained output at once),
 * and binds the window's six actions to the `terminal.*` commands. The title is REQ-SHELL-081's; the auto-open control
 * (REQ-SHELL-109) sits in a slim bar under the window's content — the specification names no surface for the
 * preference, and the window the preference is about is where a user looks for it; stated as a reading.
 */
const terminalRefusalOf = (r: CommandOutcome): TerminalRefusal => {
  if (r.ok) return 'unknown-stream';
  const code = r.code.startsWith('terminal.') ? r.code.slice('terminal.'.length) : r.code;
  return (TERMINAL_REFUSALS as readonly string[]).includes(code) ? (code as TerminalRefusal) : 'unknown-stream';
};
const terminalResult = (r: CommandOutcome): Awaited<TerminalActionResult> => (r.ok ? { ok: true, value: undefined } : { ok: false, error: terminalRefusalOf(r) });
const terminalActions: TerminalActions = {
  sendKeys: async (streamId, keys) => terminalResult(await bridge.command({ kind: 'terminal.sendKeys', streamId, keys: [...keys] })),
  interrupt: async (streamId) => terminalResult(await bridge.command({ kind: 'terminal.interrupt', streamId })),
  endInput: async (streamId) => terminalResult(await bridge.command({ kind: 'terminal.endInput', streamId })),
  kill: async (streamId) => terminalResult(await bridge.command({ kind: 'terminal.kill', streamId })),
  resize: (streamId, cols, rows) => bridge.command({ kind: 'terminal.resize', streamId, cols, rows }),
  audit: (streamId, entry) => { void bridge.command({ kind: 'terminal.audit', streamId, entry }); },
};
export function TerminalApp({ streams, sessionId, initialFocus, initialAutoOpen }: { streams: TerminalStreamSet; sessionId: string | null; initialFocus: string | null; initialAutoOpen: boolean }) {
  const [focusStream, setFocusStream] = useState<string | null>(initialFocus);
  const [autoOpen, setAutoOpen] = useState(initialAutoOpen);
  const [label, setLabel] = useState<string | null>(sessionId);
  useEffect(() => {
    // REQ-SHELL-085: a later open names a stream to bring forward; the same stream twice must still reach the tick.
    (window as unknown as { __rotarisTerminalFocus?: (id: string) => boolean }).__rotarisTerminalFocus = (id) => { setFocusStream(null); setTimeout(() => setFocusStream(id), 0); return true; };
    return () => { delete (window as unknown as { __rotarisTerminalFocus?: unknown }).__rotarisTerminalFocus; };
  }, []);
  // REQ-SHELL-081: "Rotaris · Terminal — {session label}" — the session's name, or its identifier when unnamed.
  useEffect(() => {
    // The session is fixed for this window's life (a change of session rebuilds the window), so the label is only ever refined here.
    if (!sessionId) return;
    let live = true;
    void bridge.command({ kind: 'session.list' }).then((r) => {
      if (!live || !r.ok) return;
      const entry = (r.value as { sessions: SessionListItemPayload[] }).sessions.find((s) => s.sessionId === sessionId);
      if (entry && entry.label.trim() !== '') setLabel(entry.label);
    });
    return () => { live = false; };
  }, [sessionId]);
  useEffect(() => { document.title = terminalWindowTitle(label); }, [label]);
  const changeAutoOpen = (value: boolean) => { setAutoOpen(value); void bridge.command({ kind: 'window.terminalAutoOpen', value }); };
  return (
    <div className="term-shell" data-testid="term-shell">
      <TerminalWindow streams={streams} actions={terminalActions} onGoToWorkspace={() => { void bridge.command({ kind: 'window.showWorkspace' }); }} focusStream={focusStream} acknowledge={acknowledge} />
      {/* REQ-SHELL-109: the auto-open preference, default off, persisted user-wide by main under `terminal/autoOpen`. */}
      <div className="term-shell__bar" data-testid="term-auto-open">
        <span id="term-auto-open-label">Open this window automatically</span>
        <ToggleSwitch checked={autoOpen} onChange={changeAutoOpen} label="Open this window automatically" aria-labelledby="term-auto-open-label" aria-description={`Automatic opening is ${autoOpen ? 'on' : 'off'}. On, the terminal window opens without taking focus when an agent's terminal starts while it is closed.`} data-testid="term-auto-open-toggle" />
        <span className="text-secondary">When an agent's terminal starts while this window is closed, it opens without taking focus.</span>
      </div>
      {/* ADR-0049's fourth decision: the acknowledgement stack is per window (a copy's outcome, REQ-SHELL-101). */}
      <Acknowledgements store={acknowledgements} />
    </div>
  );
}
export function bootTerminal(): Promise<void> {
  return mountWindow<TerminalWindowPayload>({ kind: 'window.terminalPayload' }, async (payload, root) => {
    const streams = createTerminalWindowStreams();
    bridge.onTerminalFrame((p) => { const frame = p as TerminalFrame; if (payload.sessionId !== null && frame.sessionId === payload.sessionId) streams.apply(frame); });
    document.title = terminalWindowTitle(payload.sessionId);
    if (payload.sessionId !== null) {
      await bridge.command({ kind: 'session.subscribe', sessionId: payload.sessionId });
      void bridge.command({ kind: 'terminal.streams', sessionId: payload.sessionId });
    }
    root.render(<StrictMode><TerminalApp streams={streams} sessionId={payload.sessionId} initialFocus={payload.focusStream} initialAutoOpen={payload.autoOpen} /></StrictMode>);
  });
}