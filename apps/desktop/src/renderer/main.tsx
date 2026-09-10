import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { BRIDGE_KEY, isBusy, isViewId, LIBRARY_TABS, presentationStatus, resolveTheme, STATUS_LABELS, THEMES, type NoticeAction, type CommandOutcome, type PromptList, type PromptState, type RepairReportPayload, type CheckpointListPayload, type CheckpointPreviewPayload, type CheckpointRestoreOutcomePayload, type GitViewState, type ImageAttachmentInput, type PaneLayout, type RepositoryState, type SandboxModeName, type Theme, type ThemeName, type ApprovalOption, type ApprovalPayload, type ConfigSnapshot, type DisplayView, type PausePayload, type PauseResolution, type HookAgentId, type HooksSummary, type McpHealth, type McpListing, type McpSecretsView, type PermissionPreset, type PlaybookCatalogue, type ProviderDialogPayload, type ProviderRow, type ProviderSignInResult, type RendererBridge, type SessionListItemPayload, type TranscriptRow, RUN_AGENT_ID, type AgentRecord, type McpSetupStatus, type ArtifactRowPayload, type QuestionAnswers } from '@rotaris/contracts';
import { createAcknowledgementStore, createNoticeStore, createReplicaStore, type AcknowledgementStore, type NoticeStore, type ReplicaStore } from '@rotaris/ui-core';
import { Acknowledgements, type AboutInfo, applyChange, applyTheme, AppShell, SETTINGS_CATEGORIES, branchStripItem, foldLibraryQuery, GitView, LibraryView, OverviewView, PromptsTab, rebasePending, ApprovalDialog, HookReviewDialog, isDirty, liveStateOf, motionReduced, PauseDialog, pendingFrom, ProviderDialog, ProvidersCard, savePayload, SessionBrowser, setStoredMotionPreference, StashDialog, type DeleteOutcome, type ExportOutcome, SettingsView, StartSessionDialog, UnsavedGuardDialog, useShellState, WorkspaceView, type LaunchOptions, type McpSettingsProps, type PendingChange, type PendingSettings, type ProvidersCardProps, type StatusItem, AgentPopOutToggle, MissionView, PersonaWindow, runLevelAgent, type PersonaEntry, ArtifactsTab, ArtifactInspector, type ArtifactLoaded, readTranscriptCounts, RowProof, QuestionStepper, type TrailerRow, WorktreeDialog, type SlashHost } from '@rotaris/ui';
// Part AO — the prompt roots' reader (REQ-CHAT-160) the composer's binder calls, and the shape it answers.
import { bindPromptRootsReader } from '@rotaris/ui';
import type { PromptsRootsResult } from '@rotaris/contracts';
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
/** REQ-NOTIFY-013 / REQ-SHELL-112: this window's ONE transient stack; main pushes to it over channel 8. */
const acknowledgements: AcknowledgementStore = createAcknowledgementStore();
/**
 * Part R (REQ-MONITOR-038's 250 ms budget, REQ-SHELL-076): the last whole-session update's apply-to-paint time and the
 * agent count it carried, read by the Mission view's data attributes and by main's persona-window paint measurement
 * (`__rotarisPersonaPainted`, wall-clock so main can subtract its own show instant). Verification instruments; no surface
 * behaves differently because of them.
 */
const refreshStats = createStore<{ ms: number; agents: number; seq: number } | null>(() => null);
bridge.onSessionSnapshot((p) => {
  const t0 = performance.now();
  const outcome = replica.getState().applySnapshot(p);
  if (outcome !== 'reset') return;
  const agents = replica.getState().session?.agents.length ?? 0;
  const seq = (p as { seq?: number }).seq ?? 0;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    refreshStats.setState({ ms: performance.now() - t0, agents, seq });
    (window as unknown as { __rotarisPersonaPainted?: unknown }).__rotarisPersonaPainted = { at: Date.now(), seq, agents };
  }));
});
/**
 * Part Z, verification instruments (no surface behaves differently because they exist):
 *
 *  - the apply-to-paint sample of every transcript increment, taken at the point REQ-CHAT-055 fixes — after the
 *    frame showing the update has been painted, never a synchronous figure. A double `requestAnimationFrame` is
 *    the same proxy ADR-0045's spike used and the same one the whole-session path above already uses, and it is a
 *    PROXY: it says a frame boundary passed after the change was committed, not that a frame containing the change
 *    was presented. ADR-0045 measured that the platform's own paint event cannot be used for this (with no damage
 *    it delivers about one frame every five seconds), and did not establish that the two agree where both resolve.
 *  - the replica's counters, both sets: ADR-0043's seven publication classes and ADR-0046 step 3's six row ops.
 *  - ADR-0045's structural counts, read from the ONE definition in `@rotaris/ui` rather than restated here.
 */
const applySamples: { seq: number; rows: number; ms: number }[] = [];
bridge.onTranscriptIncrement((p) => {
  const t0 = performance.now();
  const outcome = replica.getState().applyIncrement(p);
  const seq = (p as { seq?: number }).seq ?? 0;
  const rows = ((p as { rows?: unknown[] }).rows ?? []).length;
  if (outcome !== 'applied') return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    applySamples.push({ seq, rows, ms: performance.now() - t0 });
    if (applySamples.length > 400) applySamples.shift();
  }));
});
Object.assign(window as unknown as Record<string, unknown>, {
  __rotarisCounts: () => readTranscriptCounts(),
  __rotarisReplica: () => { const s = replica.getState(); return { counters: s.counters, rowOps: s.rowOps, rows: s.rows.length, reachedOldest: s.reachedOldest, oldestIndex: s.rows[0]?.index ?? null }; },
  __rotarisApplies: () => applySamples.slice(),
  __rotarisResetApplies: () => { applySamples.length = 0; return true; },
  __rotarisRow: (index: number) => replica.getState().rows.find((r) => r.index === index) ?? null,
});
bridge.onNotice((p) => notices.getState().apply(p));
bridge.onAcknowledgement((p) => acknowledgements.getState().apply(p));
/**
 * Part AA — REQ-CHAT-075/076. Every transcript surface in this window acknowledges what it did: a copy that
 * worked and one the platform refused, an open that worked and one that failed. Both go to THIS window's stack
 * (ADR-0049's fourth decision), so a persona window's acknowledgements are its own.
 */
const acknowledge = (kind: 'ok' | 'fail' | 'info' | 'warn', title: string, body?: string): void => {
  acknowledgements.getState().publish({ kind, title, ...(body === undefined ? {} : { body }) });
};
/**
 * REQ-CHAT-076: an `http(s)` link opens in the SYSTEM BROWSER through the one command; the renderer never
 * navigates (ADR-0051). "Opening MUST be acknowledged and a failure to open MUST be reported rather than
 * passing silently" is why every outcome ends in the stack and none is dropped.
 */
const openLink = (href: string): void => {
  void bridge.command({ kind: 'shell.openExternal', url: href }).then((r) => {
    if (r.ok) acknowledge('ok', 'Opened in your browser', href);
    else acknowledge('fail', r.headline, r.detail ?? href);
  });
};
/**
 * REQ-CHAT-167 (`display/showReasoning`) and REQ-CHAT-067 (`display/autoCollapseTools` and `display/groupTools`) —
 * global to the transcript, taking effect immediately on the rows already on screen. Module-scoped because every
 * transcript surface in the window reads the same values, the persona window included.
 *
 * Part AG moved `display/groupTools` in here from App's own state: REQ-CONFIG-403 gives the Display settings
 * category a control over it, and a preference two components can set is a preference that must have one home.
 * The first two default **off**, `groupTools` defaults **on** (REQ-CHAT-067), so an unset preference reads as on.
 */
const displayPrefs = createStore<{ showReasoning: boolean; autoCollapseTools: boolean; groupTools: boolean }>(() => ({ showReasoning: false, autoCollapseTools: false, groupTools: true }));
async function readDisplayPrefs(): Promise<void> {
  const [reasoning, collapse, group] = await Promise.all([
    bridge.command({ kind: 'prefs.get', key: 'display/showReasoning' }),
    bridge.command({ kind: 'prefs.get', key: 'display/autoCollapseTools' }),
    bridge.command({ kind: 'prefs.get', key: 'display/groupTools' }),
  ]);
  displayPrefs.setState({
    showReasoning: reasoning.ok && (reasoning.value as { value?: boolean }).value === true,
    autoCollapseTools: collapse.ok && (collapse.value as { value?: boolean }).value === true,
    groupTools: group.ok ? (group.value as { value?: boolean }).value !== false : true,
  });
}
/**
 * REQ-CONFIG-472 (Part AG): the Display category's four tool-row fields are workspace configuration committed by
 * Save, and they nevertheless take effect on the rows already on screen the moment a control moves. The settings
 * screen publishes its pending values here and the transcript prefers them over the saved snapshot, so Save
 * settles what the file says and never what is currently drawn. Null whenever no settings screen is mounted.
 */
const pendingDisplay = createStore<{ caps: DisplayView | null }>(() => ({ caps: null }));
/** REQ-CONFIG-403: written the moment the control moves, and the transcript re-renders from the same store. */
async function writeDisplayPref(key: 'display/autoCollapseTools' | 'display/groupTools', value: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = await bridge.command({ kind: 'prefs.set', key, value });
  if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
  displayPrefs.setState(key === 'display/groupTools' ? { groupTools: value } : { autoCollapseTools: value });
  return { ok: true };
}
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
 * REQ-CHAT-011: no session → start one; a loaded session with no run → record the prompt.
 * REQ-SHELL-125: the launch dialog's accepted choices, held in shell state, ride on the NEXT start and are consumed
 * by it — a refused start keeps them for the retry the composer offers.
 */
async function submitPrompt(text: string, attachments: readonly ImageAttachmentInput[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = replica.getState();
  if (!s.sessionId) {
    const options = useShellState.getState().launchOptions;
    const r = await bridge.command({ kind: 'session.start', prompt: text, ...(attachments.length === 0 ? {} : { attachments: [...attachments] }), ...(options?.isolation ? { isolation: options.isolation } : {}), ...(options?.attach ? { attach: { path: options.attach.path } } : {}), ...(options ? { sandboxMode: options.sandboxMode } : {}) });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    useShellState.getState().takeLaunchOptions();
    const { sessionId } = r.value as { sessionId: string };
    replica.getState().follow(sessionId);
    // Every attach begins with a whole-session update (REQ-MONITOR-214); the transcript follows it.
    const sub = await bridge.command({ kind: 'session.subscribe', sessionId });
    if (!sub.ok) return { ok: false, reason: sub.detail ?? sub.headline };
    return { ok: true };
  }
  const r = await bridge.command({ kind: 'session.prompt', sessionId: s.sessionId, prompt: text, ...(attachments.length === 0 ? {} : { attachments: [...attachments] }) });
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

/**
 * Part AC — REQ-CHAT-101/102: every step's answer in ONE control request. The answers map REQ-CHAT-095 fixes is a
 * record of records and `ControlRequestSchema`'s value space is not (REQ-MONITOR-013 limits arguments to text,
 * numbers, booleans and simple collections of those), so it crosses as two flat maps keyed by step id and is
 * recombined in `Sessions.control`. `delivered` is false unless a waiting call actually took the answers — which is
 * exactly what REQ-CHAT-102 turns into "the modal stays open", so it is never softened into an optimistic true.
 */
async function answerQuestions(requestId: string, answers: QuestionAnswers): Promise<{ delivered: boolean }> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { delivered: false };
  const selected: Record<string, string | null> = {};
  const freeform: Record<string, string | null> = {};
  for (const [id, a] of Object.entries(answers)) { selected[id] = a.selected_option; freeform[id] = a.freeform_text; }
  const r = await bridge.command({ kind: 'session.control', request: { op: 'answerQuestion', sessionId, args: { requestId, selected, freeform } } });
  return { delivered: r.ok && (r.value as { ok: boolean }).ok };
}

/** REQ-CHAT-101: cancellation, forwarded to the waiting tool call, which the stepper emits exactly once. */
function cancelQuestions(requestId: string): void {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return;
  void bridge.command({ kind: 'session.control', request: { op: 'cancelQuestions', sessionId, args: { requestId } } });
}

/** REQ-SESSION-110 / REQ-MONITOR-125: continue the focused session, or resolve its pause. */
async function continueSession(action: PauseResolution = 'continue'): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sessionId = replica.getState().sessionId;
  if (!sessionId) return { ok: false, reason: 'No session is loaded.' };
  const r = await bridge.command({ kind: 'session.continue', sessionId, action });
  return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
}

/** ADR-0037: the configuration snapshot as the screen reads it — once on mount, again on every `config:changed`. */
function useConfigSnapshot(workspace: string): ConfigSnapshot | null {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const hasWorkspace = workspace !== '(no workspace)';
  useEffect(() => {
    if (!hasWorkspace) return;
    queueMicrotask(() => { void bridge.command({ kind: 'config.read' }).then((r) => { if (r.ok) setSnapshot(r.value as ConfigSnapshot); }); });
    return bridge.onConfigChanged((p) => setSnapshot((p as { snapshot: ConfigSnapshot }).snapshot));
  }, [hasWorkspace]);
  return snapshot;
}
/** REQ-MONITOR-050: one tab per configured persona, from the snapshot's roles (their declared tools stand in for an agent with no grant). */
function personasOf(snapshot: ConfigSnapshot | null): PersonaEntry[] {
  return (snapshot?.roles ?? []).map((r) => ({ role: r.role, tools: r.tools, thinking: r.rawThinking, effectiveModel: r.effectiveModel }));
}
/**
 * The entry role as the run-level agent presents it (REQ-MONITOR-057/058): the persona the transcript's first agent row
 * names when no child carries that name, else `orchestrator`; its model and reasoning from the snapshot's role view.
 */
function entryOf(snapshot: ConfigSnapshot | null, rows: readonly TranscriptRow[], agents: readonly AgentRecord[]): { persona: string; model: string; reasoning: string; tools: readonly string[] } {
  const childNames = new Set(agents.map((a) => a.name));
  const first = rows.find((r) => r.kind === 'agent' && r.persona !== undefined && r.name !== undefined && !childNames.has(r.name));
  const persona = first?.persona ?? 'orchestrator';
  const role = snapshot?.roles.find((r) => r.role === persona);
  return { persona, model: role?.effectiveModel ?? '', reasoning: role?.rawThinking ?? 'medium', tools: role?.tools ?? [] };
}
/** REQ-SHELL-072/073: open or raise the persona window for an agent; the run-level agent's persona is the entry role's. */
async function openPersona(agent: AgentRecord, focusSteer: boolean): Promise<void> {
  await bridge.command({ kind: 'window.openPersona', persona: agent.persona, agentId: agent.id, focusSteer });
}
/** REQ-MONITOR-107/110: the once-a-second tick of a VISIBLE surface, running only while the followed run is busy; nothing ticks when unmounted. */
function useElapsedTick(session: { executionStatus: string; updatedAt: string } | null): string | null {
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
 * Part AB — REQ-CHAT-008's synthetic state: the persisted session claims busy but no local run exists. The verdict
 * comes from the ONE liveness predicate (REQ-SESSION-171) through `session.list`'s `stale`, never from this window
 * inferring it from silence, and it is re-asked only when the followed session or its status changes — there is no
 * poll, because a wrong answer here would mislabel a live run and a timer would make it a race.
 */
function useNeedsRecovery(sessionId: string | null, executionStatus: string | null): boolean {
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
  const slashHost = useMemo<SlashHost>(() => ({
    themes: THEMES.map((t) => t.name),
    setTheme: async (name) => {
      const r = await bridge.command({ kind: 'theme.set', name: name as ThemeName });
      if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
      runningTheme = resolveTheme(name);
      applyTheme(runningTheme, document.documentElement);
      for (const subscriber of themeSubscribers) subscriber(runningTheme);
      return { ok: true };
    },
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
  }), [providerRows, git.state]);
  const worktrees = git.state?.worktrees ?? [];
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
    draft={drafts.draft} onPublishDraft={drafts.publish} onWriteDraft={drafts.write}
    composerHeight={layout?.sizes[1]} onComposerHeight={(sizes) => onLayout({ version: 1, panes: 2, sizes: [...sizes] })}
    onSetNextPersona={(persona) => setField({ default_persona: persona })}
    onSetNextModel={(model) => setField({ personas: { [entryPersona]: { model } } })}
    onSetNextReasoning={(level) => setField({ personas: { [entryPersona]: { thinking: level } } })}
    onOpenTrailer={onOpenTrailer}
    session={session} rows={rows} onSubmit={submitPrompt} onStop={stopRun} onSetMode={setMode} onCancelAgent={cancelAgent} nowIso={nowIso}
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
    onContinue={() => continueSession('continue')}
    onSteer={(agentId, text) => control('submitSteeringPrompt', { agentId, text }, 'Steering is unavailable for this run.')}
    onSetModel={(model) => control('setModel', { model }, 'The run did not accept that model.')}
    onSetReasoning={(level) => control('setReasoning', { level }, 'The run did not accept that reasoning level.')}
  /></>; // Part AN: the fragment closes the worktree dialog + view pair opened above.
}

/**
 * REQ-SHELL-023's Mission view (Part R; REQ-MONITOR-274..276). Mounted only while shown (REQ-MONITOR-039/275: a hidden
 * surface refreshes nothing and runs no timer); the strategy and the depth are the settings' own values, written through
 * the per-field path (REQ-CONFIG-321, REQ-CONFIG-112); pause is the existing `pause` control, cancel `cancelAgent`/`cancel`.
 */
function Mission({ workspace, popOut }: { workspace: string; popOut: boolean }) {
  const session = useStore(replica, (s) => s.session);
  const rows: readonly TranscriptRow[] = useStore(replica, (s) => s.rows);
  const selectedAgentId = useShellState((st) => st.selectedAgentId);
  const selectAgent = useShellState((st) => st.selectAgent);
  const snapshot = useConfigSnapshot(workspace);
  const refresh = useStore(refreshStats, (st) => st);
  const entry = useMemo(() => entryOf(snapshot, rows, session?.agents ?? []), [snapshot, rows, session]);
  const runLevel = useMemo(() => runLevelAgent(session, entry), [session, entry]);
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
    session={session} sessionLabel={label} runLevel={runLevel} selectedAgentId={selectedAgentId} nowIso={nowIso} refresh={refresh}
    onSelect={(id, source) => { selectAgent(id); if (source === 'click' && popOut && id !== null && id !== RUN_AGENT_ID) { const agent = session?.agents.find((a) => a.id === id); if (agent) void openPersona(agent, false); } }}
    strategy={snapshot?.delegationStrategy ?? null} maxDepth={snapshot?.runtime.max_depth ?? null}
    onSetStrategy={(value) => setField({ rotaris: { delegation_strategy: value } })} onSetDepth={(value) => setField({ runtime: { max_depth: value } })}
    onPause={() => control('pause', {}, 'Pause is unavailable because no active run exists.')}
    onCancelAgent={cancelAgent} onCancelRun={() => stopRun(false)}
    onOpen={open} onPopOut={(agent) => { void openPersona(agent, false); }}
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
 * REQ-SHELL-023's Library view (Part X). The shell, the one search field and the three tabs are the view's; the
 * Prompts tab is built here from the state `usePrompts` holds above every view.
 *
 * The Artifacts tab is Part Y's, built against `LibraryTabProps` and mounted here since the merge, along with the
 * inspectors it opens. The PROPOSALS body is still a placeholder, and it says why it is empty rather than showing an
 * empty table that would read as "there is nothing", which is a different claim: no ADR owns the improvement artifact
 * store's write path (OQ-45), so the tab behind it is a part of its own and has not been authorised.
 */
function TabPlaceholder({ testId, title, body }: { testId: string; title: string; body: string }) {
  return (
    <div className="empty-state library__placeholder" data-testid={testId}>
      <span className="empty-state-title">{title}</span>
      <span className="empty-state-hint">{body}</span>
    </div>
  );
}
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
  return (<>
    <LibraryView
      query={query}
      onQuery={setQuery}
      prompts={<PromptsTab query={foldLibraryQuery(query)} revision={prompts.revision} history={prompts.history} stash={prompts.stash} layout={layout} onLayout={onLayout}
        onUse={(list, index, remove) => { void prompts.take(list, index, remove).then(loadIntoComposer); }} />}
      artifacts={<ArtifactsTab query={foldLibraryQuery(query)} revision={prompts.revision} onRead={read} onInspect={inspect} />}
      proposals={<TabPlaceholder testId="library-proposals-placeholder" title="No improvement proposals yet"
        body="Proposals come from the post-run improvement analyst, and neither the analyst nor the store that would hold its artifacts is built in this version. This tab is not saying a run produced no suggestions." />}
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

function Settings({ workspace, theme, reducedMotion, settingsCategory, onTheme, onMotion, popOut, onPopOut }: { workspace: string | null; popOut: boolean; onPopOut: (value: boolean) => void } & AppearanceProps) {
  const session = useStore(replica, (s) => s.session);
  const sessionId = useStore(replica, (s) => s.sessionId);
  const { config, guardDialog } = useConfiguration(workspace);
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
      mcp={mcp}
      display={{
        autoCollapseTools: display.autoCollapseTools,
        groupTools: display.groupTools,
        onAutoCollapseTools: (v) => writeDisplayPref('display/autoCollapseTools', v),
        onGroupTools: (v) => writeDisplayPref('display/groupTools', v),
      }}
      about={{ info: about, onOpenExternal: openExternal, onOpenThirdPartyLicenses: openThirdPartyLicenses }}
      interfaceExtras={<AgentPopOutToggle on={popOut} onChange={onPopOut} />}
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
    case 'install-update':
    case 'restart':
    case 'open-cloud-account':
    case 'open-project-init':
    case 'retry-run':
    case 'revert-proposal-review':
    case 'save-settings':
      // Each is a member REQ-NOTIFY-044 fixes whose target does not exist in this build (no updater, no hosted cloud,
      // no project-initialization surface, no proposal store). Nothing is dispatched and the attempt is recorded.
      console.warn(`notice action "${action.kind}" has no target in this build`);
      return;
  }
}

function App({ version, workspace, processes, initialTheme, initialReducedMotion, settingsCategory, circuitBreakerArmed, initialLayout, initialGitLayout, initialLibraryLayout, initialWorkspaceLayout, initialPopOut }: { initialLayout: PaneLayout | undefined; initialGitLayout: PaneLayout | undefined; initialLibraryLayout: PaneLayout | undefined; initialWorkspaceLayout: PaneLayout | undefined; version: string; workspace: string; processes: string[]; initialTheme: Theme; initialReducedMotion: boolean | undefined; settingsCategory: string; circuitBreakerArmed: boolean; initialPopOut: boolean }) {
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
  // Part AN — see `slashOpeners`: the launch dialog and the session browser, reachable from the composer's catalogue.
  useEffect(() => {
    slashOpeners.newSession = openStartDialog;
    slashOpeners.openSessions = () => { void loadSessions(); };
    return () => { delete slashOpeners.newSession; delete slashOpeners.openSessions; };
  }, [openStartDialog, loadSessions]);
  /** Part U: the browser's actions. Each is a command answered with a value or a reason; the list is read again afterwards. */
  const refreshSessions = useCallback(async (): Promise<void> => {
    const result = await bridge.command({ kind: 'session.list' });
    if (result.ok) setBrowserSessions((result.value as { sessions: SessionListItemPayload[] }).sessions);
  }, []);
  const outcomeOf = <T,>(r: CommandOutcome): { ok: true; value?: T } | { ok: false; reason: string } => (r.ok ? { ok: true, value: r.value as T } : { ok: false, reason: r.detail ?? r.headline });
  const deleteSession = useCallback(async (sessionId: string) => {
    const r = await bridge.command({ kind: 'session.delete', sessionId });
    if (r.ok && replica.getState().sessionId === sessionId) {
      // The window followed the session that is now gone: stop following it rather than render a record that no longer exists.
      await bridge.command({ kind: 'session.unsubscribe', sessionId });
      replica.getState().follow(null);
    }
    return outcomeOf<DeleteOutcome>(r);
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

  // REQ-NOTIFY-044's `focus-session`: the dispatcher is module-scoped (a notice can arrive before a view mounts), so
  // the opener is registered here for as long as this window lives.
  useEffect(() => { focusSession = (id) => { void openSession(id); }; return () => { focusSession = null; }; }, [openSession]);

  /*
   * Part AC — REQ-CHAT-098/103: ONE trailer handler and ONE modal for this window, held here rather than in the
   * Workspace view so that switching views cannot unmount a stepper the user is halfway through. A question trailer
   * opens the stepper; an approval trailer raises the dialog window that is already up (ADR-0019/ADR-0048 paint an
   * approval in its own window, and REQ-CHAT-103's difference is that the first approval auto-opens while a question
   * waits for this click). The open stepper is derived by looking the request id up in the record's pending list, so
   * REQ-CHAT-098's "the modal closes programmatically when the pending state clears" is not an effect that has to
   * fire — the prompt leaves the list and there is nothing left to render.
   */
  const [stepperRequestId, setStepperRequestId] = useState<string | null>(null);
  const openTrailer = useCallback((trailer: TrailerRow) => {
    if (trailer.sort === 'question') { setStepperRequestId(trailer.requestId); return; }
    void bridge.command({ kind: 'approval.raise', requestId: trailer.requestId });
  }, []);
  const stepperPrompt = session?.pendingQuestions.find((q) => q.request_id === stepperRequestId) ?? null;
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
  // Part W: Ctrl+L (REQ-CHAT-002) and every other chord of REQ-SHELL-049 are the command registry's, bound once by the
  // shell's `useCommandShortcuts`; the Ctrl+L effect that lived here is gone. ADR-0048's application modality: the palette
  // and the keyboard help register with main's window registry through `window.modality`, and main disables input in the
  // persona windows for the duration.
  const onModality = useCallback((active: boolean) => { void bridge.command({ kind: 'window.modality', active }); }, []);
  return (<>
    <AppShell
      onModality={onModality}
      version={version}
      workspaceLabel={workspace}
      statusItems={status}
      views={{
        overview: <Overview workspace={workspace} layout={layout} onLayout={onLayout} reducedMotion={reducedMotion} onListSessions={() => { void loadSessions(); }} onOpenSession={openSession} onNewSession={openStartDialog} />,
        workspace: <Workspace models={models} modelsLoaded={modelsLoaded} workspace={workspace} popOut={popOut} prompts={prompts} onOpenStash={() => setStashOpen(true)} groupTools={groupTools} layout={workspaceLayout} onLayout={onWorkspaceLayout} onOpenTrailer={openTrailer} />,
        mission: <Mission workspace={workspace} popOut={popOut} />,
        git: <Git workspace={workspace} git={git} layout={gitLayout} onLayout={onGitLayout} />,
        library: <Library prompts={prompts} layout={libraryLayout} onLayout={onLibraryLayout} />,
        settings: <Settings workspace={workspace === '(no workspace)' ? null : workspace} theme={theme} reducedMotion={reducedMotion} settingsCategory={settingsCategory} onTheme={changeTheme} onMotion={changeMotion} popOut={popOut} onPopOut={changePopOut} />,
      }}
      notice={notice}
      onAcknowledge={(noticeId) => { void bridge.command({ kind: 'notice.acknowledge', noticeId }); }}
      onAction={dispatchNoticeAction}
      acknowledgements={acknowledgements}
      onOpenSessions={() => { void loadSessions(); }}
    />
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
    {/* Part AC — REQ-CHAT-098..102: the question stepper, one per window, keyed so a new prompt never reuses its state. */}
    {stepperPrompt && (
      <QuestionStepper
        key={stepperPrompt.request_id}
        prompt={stepperPrompt}
        onSubmit={(answers) => answerQuestions(stepperPrompt.request_id, answers)}
        onCancel={() => cancelQuestions(stepperPrompt.request_id)}
        onClose={() => setStepperRequestId(null)}
      />
    )}
    {/* REQ-LIBRARY-141: the stash dialog, opened from the transcript toolbar (and, once the slash catalogue exists, by `/pop`). */}
    {stashOpen && (
      <StashDialog stash={prompts.stash} onClose={() => setStashOpen(false)}
        onTake={(index, remove) => { void prompts.take('stash', index, remove).then(loadIntoComposer); }} />
    )}
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

/**
 * ADR-0048 B / ADR-0043 (Part R): a persona window is a full renderer with its own replica of the same numbered
 * publications. Visibility is the platform's own signal: on hide the window unsubscribes and cancels every timer (the
 * zero-work rule); on show it subscribes again — the relay first, then the attach whose whole-session update is the
 * first state painted — and re-reads its payload for the instance main asked it to select. Refreshes are coalesced at
 * 120 ms (REQ-SHELL-076): the replica's changes reach React through one trailing timer per interval, none while hidden.
 */
function PersonaApp({ persona, initialSelect }: { persona: string; initialSelect: { agentId: string; focusSteer: boolean } | null }) {
  const [state, setState] = useState(() => ({ session: replica.getState().session, rows: replica.getState().rows }));
  const [selected, setSelected] = useState<string | null>(initialSelect?.agentId ?? null);
  const [focusSteer, setFocusSteer] = useState(initialSelect?.focusSteer ? 1 : 0);
  const [visible, setVisible] = useState(!document.hidden);
  const snapshot = useConfigSnapshot('persona');
  useEffect(() => {
    // REQ-SHELL-076: one rebuild per 120 ms interval; a hidden window rebuilds nothing.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = replica.subscribe(() => {
      if (document.hidden || timer !== null) return;
      timer = setTimeout(() => { timer = null; if (!document.hidden) setState({ session: replica.getState().session, rows: replica.getState().rows }); }, 120);
    });
    return () => { unsubscribe(); if (timer !== null) clearTimeout(timer); };
  }, []);
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
  const entry = useMemo(() => entryOf(snapshot, state.rows, state.session?.agents ?? []), [snapshot, state]);
  const runLevel = useMemo(() => runLevelAgent(state.session, entry), [state.session, entry]);
  const nowIso = useElapsedTick(visible ? state.session : null);
  const declared = snapshot?.roles.find((r) => r.role === persona)?.tools ?? [];
  const display = useStore(displayPrefs, (s) => s);
  return (<>
    <PersonaWindow
      onOpenLink={openLink} onAcknowledge={acknowledge} showReasoning={display.showReasoning} autoCollapseTools={display.autoCollapseTools}
      persona={persona} session={state.session} rows={state.rows} runLevel={runLevel} declaredTools={declared} selectedAgentId={selected} onSelectTab={setSelected}
      nowIso={nowIso} compressionThresholdPercent={snapshot?.compressorThresholdPercentage ?? 60} focusSteer={focusSteer}
      onSteer={(agentId, text) => control('submitSteeringPrompt', { agentId, text }, 'Steering is unavailable for this run.')}
      onCancel={(agentId) => (agentId === RUN_AGENT_ID ? stopRun(false) : cancelAgent(agentId))}
    />
    {/* ADR-0049's fourth decision: the acknowledgement stack is PER WINDOW, so this window owns its own — the same
        shared component the main window draws, swept for accessibility here in its own right (REQ-SHELL-112). */}
    <Acknowledgements store={acknowledgements} />
  </>);
}
async function bootPersona(): Promise<void> {
  const r = await bridge.command({ kind: 'window.personaPayload' });
  const root = createRoot(document.getElementById('root')!);
  if (!r.ok) { root.render(<div className="approval"><p role="alert">{r.headline}</p></div>); return; }
  const payload = r.value as { persona: string; sessionId: string | null; select: { agentId: string; focusSteer: boolean } | null };
  document.title = `Rotaris · ${payload.persona}`;
  if (payload.sessionId) {
    replica.getState().follow(payload.sessionId);
    await bridge.command({ kind: 'session.subscribe', sessionId: payload.sessionId });
  }
  root.render(<StrictMode><PersonaApp persona={payload.persona} initialSelect={payload.select} /></StrictMode>);
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
  runningTheme = resolveTheme(themeReply.ok ? (themeReply.value as { name?: string }).name : undefined);
  applyTheme(runningTheme, document.documentElement);
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
  // Part AA's proof harness (verification only; main serves this role only under ROTARIS_CAPTURE_PNG + ROTARIS_ROWS_PROOF).
  if (role === 'rows-proof') {
    createRoot(document.getElementById('root')!).render(<StrictMode><RowProof onOpenLink={openLink} onAcknowledge={acknowledge} /><Acknowledgements store={acknowledgements} /></StrictMode>);
    return;
  }
  const hello = await bridge.command({ kind: 'shell.hello' });
  const info = hello.ok ? (hello.value as { version: string; workspace: string; processes: string[]; circuitBreakerArmed: boolean }) : { version: '?', workspace: '(no workspace)', processes: [], circuitBreakerArmed: false };
  // ESC-34: the dispatcher is not a component, and one action names a workspace it must be checked against.
  openWorkspace = info.workspace;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App version={info.version} workspace={info.workspace} processes={info.processes} initialTheme={runningTheme} initialReducedMotion={motionSetting} initialLayout={initialLayout} initialGitLayout={initialGitLayout} initialLibraryLayout={initialLibraryLayout} initialWorkspaceLayout={initialWorkspaceLayout} settingsCategory={settingsCategory} circuitBreakerArmed={info.circuitBreakerArmed} initialPopOut={initialPopOut} />
    </StrictMode>,
  );
}

void boot();
