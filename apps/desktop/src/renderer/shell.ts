import { createStore } from 'zustand/vanilla';
import { BRIDGE_KEY, resolveTheme, TERMINAL_WINDOW_ROLE, type DisplayView, type RendererBridge, type TerminalFrame, type Theme, type ThemeName } from '@rotaris/contracts';
import { createAcknowledgementStore, createNoticeStore, createReplicaStore, type AcknowledgementStore, type NoticeStore, type ReplicaStore } from '@rotaris/ui-core';
import { applyTheme, createCancelOverlayStore, displayPreferencePatch, headlessEmulator, readTranscriptCounts, TerminalStreamSet, useShellState, type CancelOverlayStore, type TerminalHost } from '@rotaris/ui';
import { createSessionActions } from './session-actions.js';

/**
 * WHAT THIS WINDOW HAS — the bridge, the replica, the two stacks, the terminal registry, the display preferences, the
 * theme it is wearing and the gestures it makes against the session it follows. All of it exists before a surface
 * mounts, all of it is one per window, and every window that this bundle boots gets the same set by importing this
 * module (ADR-0056: one bundle, the role by route).
 *
 * It is a module and not a factory on purpose: a renderer window IS a process with one bridge, so a second instance
 * would be a second subscriber to the same channels rather than a test double. What is worth substituting is behind
 * the seams this module is made of — `createSessionActions` takes the bridge and the replica as arguments and is
 * tested against plain objects, and the replica itself is `@rotaris/ui-core`'s, tested there.
 *
 * The channels are wired here, once: the replica (ADR-0043) has exactly two writers, channels 1 and 2, and a gap or a
 * decline asks main for a whole read through channel 5 whose answer arrives as ordinary traffic on those same two.
 * The one current notice arrives on channel 4 (ADR-0049), acknowledgements on channel 8, terminal frames on 3.
 *
 * Sandboxed throughout: no Node, no filesystem, no store handle — everything any of it knows comes through the one
 * frozen namespace the preload exposes (ADR-0044).
 */
function requireBridge(): RendererBridge {
  const b = (window as unknown as Record<string, RendererBridge | undefined>)[BRIDGE_KEY];
  if (!b) throw new Error('the preload bridge is absent — the renderer was loaded without its preload');
  return b;
}
export const bridge = requireBridge();
let runningTheme = resolveTheme(undefined);
const themeSubscribers = new Set<(theme: Theme) => void>();
// Another window changed it, or main did: every window wears the same one (REQ-SHELL-128).
bridge.onThemeChanged((payload) => { windowTheme.adopt((payload as { name?: string }).name); });

export const replica: ReplicaStore = createReplicaStore({
  requestReconcile: (sessionId) => { void bridge.command({ kind: 'session.reconcile', sessionId }); },
  onDiagnostic: (m) => console.warn(`[replica] ${m}`),
});
/**
 * The gestures every surface in this window makes against the session it is following — made once, here, because
 * the bridge and the replica they are made against are this window's and there is exactly one of each.
 */
/**
 * REQ-MONITOR-128 / REQ-MONITOR-296: this window's optimistic cancels of one agent, laid over the replica's record where a
 * surface reads it (`useShownSession`) and never written into the replica (ADR-0043's two writers).
 */
export const cancelOverlays: CancelOverlayStore = createCancelOverlayStore();
// Every record the replica takes is numbered in the order it took it, so an accepted cancel keeps covering what a reader
// lagging the replica still draws — a persona window's coalesced copy (REQ-SHELL-076) — and nothing taken after it.
replica.subscribe((s) => { cancelOverlays.getState().witness(s.session); });
export const { answerQuestions, cancelAgent, cancelQuestions, cancelRun, continueSession, control, planDecision, planEdit, retryRun, setMode, setNextModel, setRunStartMode, stopRun, submitPrompt } = createSessionActions({ bridge, replica, cancels: cancelOverlays });
/**
 * REQ-CHAT-014 / REQ-NOTIFY-045: the composer draft as the window last published it (200 ms behind the keystrokes), for
 * the notice's retry, which acts outside the composer. `null` until the composer has published or the stored draft has
 * been read; the retry then reads the stored one (REQ-NOTIFY-066).
 */
export const composerDraft: { current: string | null } = { current: null };

export const notices: NoticeStore = createNoticeStore();
/** REQ-NOTIFY-013 / REQ-SHELL-112: this window's ONE transient stack; main pushes to it over channel 8. */
export const acknowledgements: AcknowledgementStore = createAcknowledgementStore();
/**
 * Part R (REQ-MONITOR-038's 250 ms budget, REQ-SHELL-076): the last whole-session update's apply-to-paint time and the
 * agent count it carried, read by the Mission view's data attributes and by main's persona-window paint measurement
 * (`__rotarisPersonaPainted`, wall-clock so main can subtract its own show instant). Verification instruments; no surface
 * behaves differently because of them.
 */
export const refreshStats = createStore<{ ms: number; agents: number; seq: number } | null>(() => null);
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
/**
 * One apply-to-paint sample. `ms` is REQ-CHAT-055's figure and is unchanged; the rest was added by the measurement
 * round the defect note `appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript` authorized (R-048), so
 * that the proof can say WHERE inside the sample the time goes rather than only how much there is:
 *
 *  - `sync` — from the increment's arrival to the microtask queued after the replica applied it. React flushes an
 *    external-store update synchronously in a microtask it queued first, so this covers the render, the commit, the
 *    layout effects (the tail pin reads `scrollHeight`, a forced layout) and the passive effects that follow them;
 *  - `frame1` — to the first animation-frame callback: the frame whose rendering steps (style, layout, the
 *    `ResizeObserver` delivery, paint) show the update;
 *  - `ms` — to the second, the frame after the showing frame has been committed: the measurement point.
 *
 * `kind` says what the increment did to the rows held — `attach` (the resident set arriving after a whole read),
 * `append` (rows this surface did not hold), `tail` (the last held row alone, grown or settled), `update` (an earlier
 * row changed) — so the append clause can be read on appends alone. `at` is the arrival on the renderer's own clock,
 * so the proof can tell an increment that arrived while the previous one was still being shown (a burst, whose figure
 * includes the queue in front of it) from one that arrived to a quiet surface. The two user-timing marks bracket the
 * same interval in a Chromium trace (`blink.user_timing`), which is how the proof attributes a sample's frames to style
 * recalculation, layout, paint or script; a mark is cleared with the sample it belongs to, so the timeline holds at most
 * 400 pairs.
 */
interface ApplySample {
  readonly seq: number;
  readonly rows: number;
  readonly kind: 'attach' | 'append' | 'tail' | 'update';
  readonly at: number;
  readonly ms: number;
  readonly sync: number;
  readonly frame1: number;
}
const applySamples: ApplySample[] = [];
const APPLY_SAMPLES_HELD = 400;
bridge.onTranscriptIncrement((p) => {
  const t0 = performance.now();
  const held = replica.getState().rows;
  const lastHeld = held.length === 0 ? -1 : held[held.length - 1]!.index;
  const outcome = replica.getState().applyIncrement(p);
  const seq = (p as { seq?: number }).seq ?? 0;
  const incoming = (p as { rows?: unknown[] }).rows ?? [];
  const earliest = (p as { earliestChanged?: number }).earliestChanged ?? 0;
  if (outcome !== 'applied') return;
  const kind: ApplySample['kind'] = held.length === 0 ? 'attach' : earliest > lastHeld ? 'append' : earliest === lastHeld && incoming.length === 1 ? 'tail' : 'update';
  performance.mark(`rotaris:apply:${seq}`, { startTime: t0 });
  let sync = 0;
  queueMicrotask(() => { sync = performance.now() - t0; });
  requestAnimationFrame(() => {
    const frame1 = performance.now() - t0;
    requestAnimationFrame(() => {
      performance.mark(`rotaris:shown:${seq}`);
      applySamples.push({ seq, rows: incoming.length, kind, at: t0, ms: performance.now() - t0, sync, frame1 });
      if (applySamples.length > APPLY_SAMPLES_HELD) {
        const dropped = applySamples.shift()!;
        performance.clearMarks(`rotaris:apply:${dropped.seq}`);
        performance.clearMarks(`rotaris:shown:${dropped.seq}`);
      }
    });
  });
});
Object.assign(window as unknown as Record<string, unknown>, {
  __rotarisCounts: () => readTranscriptCounts(),
  __rotarisReplica: () => { const s = replica.getState(); return { counters: s.counters, rowOps: s.rowOps, rows: s.rows.length, reachedOldest: s.reachedOldest, oldestIndex: s.rows[0]?.index ?? null }; },
  __rotarisApplies: () => applySamples.slice(),
  __rotarisResetApplies: () => { applySamples.length = 0; return true; },
  __rotarisRow: (index: number) => replica.getState().rows.find((r) => r.index === index) ?? null,
});
bridge.onNotice((p) => notices.getState().apply(p));
// ADR-0049 / PD-WORKSPACE-005: the notice current before this window existed, which channel 4 will not repeat — asked once,
// after the listener above, and applied only if no publication arrived first (`seed`). A window added after a publication
// used to show none (docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).
void bridge.command({ kind: 'notice.current' }).then((outcome) => { if (outcome.ok) notices.getState().seed(outcome.value); }, () => undefined);
bridge.onAcknowledgement((p) => acknowledgements.getState().apply(p));
/**
 * Part AL2 — the terminal in THIS window (REQ-SHELL-079..111; ADR-0021 first executed through a window, ADR-0047's
 * surfaces mounted over the real frames).
 *
 * Every renderer that draws transcript rows — the main window and each persona window — holds ONE `TerminalStreamSet`
 * over the headless emulator: the subscription point the row previews read (REQ-SHELL-079, REQ-CHAT-063/066/076) and
 * the persona card's parity with the main window's preview (REQ-SHELL-075 b, REQ-SHELL-102: the same frames, the same
 * parser, from the same point). Frames arrive on channel 3 for the sessions this window subscribed to; a frame of a
 * session the replica no longer follows is not applied (REQ-SHELL-105: attaching to another session supersedes the
 * earlier attachment). The terminal window is a different renderer (`bootTerminal`) with its own registry whose
 * emulators paint, and it does not run this one.
 *
 * REQ-SHELL-110/111 in the main window: a change of the followed session — to another, to none, to a new one — clears
 * every screen and the counts here, and is REPORTED to main (`window.terminalSession`), which closes the terminal
 * window and reopens it for the new session without focus only when it had been open on a session before (the reading
 * is on `TerminalWindows.onSessionChange`). The re-attach ("streams re-attach to the newly focused session") is the
 * resync: after the new session's first whole-session update — which the subscribe's attach delivers, so channel 3
 * reaches this window by then — `terminal.streams` asks the run host for one `screen` frame per retained stream
 * (REQ-SHELL-104). A persona window resyncs again each time it is shown, because it unsubscribes while hidden.
 */
const windowRole = new URLSearchParams(window.location.search).get('role') ?? 'main';
export const terminalStreams = new TerminalStreamSet(headlessEmulator);
let terminalFollowed: string | null = replica.getState().sessionId;
let terminalResynced: string | null = null;
if (windowRole !== TERMINAL_WINDOW_ROLE) {
  bridge.onTerminalFrame((p) => {
    const frame = p as TerminalFrame;
    if (frame.sessionId !== replica.getState().sessionId) return;
    terminalStreams.apply(frame);
  });
  replica.subscribe(() => {
    const sessionId = replica.getState().sessionId;
    if (sessionId === terminalFollowed) return;
    terminalFollowed = sessionId;
    terminalResynced = null;
    terminalStreams.clear();
    if (windowRole === 'main') void bridge.command({ kind: 'window.terminalSession', sessionId });
  });
  bridge.onSessionSnapshot((p) => {
    const sessionId = (p as { sessionId?: string }).sessionId;
    if (!sessionId || sessionId !== replica.getState().sessionId || terminalResynced === sessionId) return;
    terminalResynced = sessionId;
    void bridge.command({ kind: 'terminal.streams', sessionId });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) terminalResynced = null; });
}
/** What the surfaces read: the registry, and the way to the pop-out (REQ-SHELL-080; a raise is a request, REQ-SHELL-161). */
export const terminalHost: TerminalHost = {
  streams: terminalStreams,
  open: (streamId) => { void bridge.command({ kind: 'window.openTerminal', ...(streamId === undefined ? {} : { streamId }) }); },
};
/** REQ-SHELL-083's "Go to Workspace" from the terminal window: main asks this window to switch the view, then surfaces it. */
(window as unknown as { __rotarisShowWorkspace?: () => boolean }).__rotarisShowWorkspace = () => { useShellState.getState().switchView('workspace'); return true; };
/**
 * Part AA — REQ-CHAT-075/076. Every transcript surface in this window acknowledges what it did: a copy that
 * worked and one the platform refused, an open that worked and one that failed. Both go to THIS window's stack
 * (ADR-0049's fourth decision), so a persona window's acknowledgements are its own.
 */
export const acknowledge = (kind: 'ok' | 'fail' | 'info' | 'warn', title: string, body?: string): void => {
  acknowledgements.getState().publish({ kind, title, ...(body === undefined ? {} : { body }) });
};
/**
 * REQ-CHAT-076: an `http(s)` link opens in the SYSTEM BROWSER through the one command; the renderer never
 * navigates (ADR-0051). "Opening MUST be acknowledged and a failure to open MUST be reported rather than
 * passing silently" is why every outcome ends in the stack and none is dropped.
 */
export const openLink = (href: string): void => {
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
export const displayPrefs = createStore<{ showReasoning: boolean; autoCollapseTools: boolean; groupTools: boolean }>(() => ({ showReasoning: false, autoCollapseTools: false, groupTools: true }));
export async function readDisplayPrefs(): Promise<void> {
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
export const pendingDisplay = createStore<{ caps: DisplayView | null }>(() => ({ caps: null }));
/**
 * REQ-SHELL-041 / REQ-TOOLS-184: whether the Settings view holds unsaved edits — the status strip's `unsaved settings`
 * flag. The settings screen publishes it as its pending state changes and takes it down when it goes.
 */
export const settingsUnsaved = createStore<{ dirty: boolean }>(() => ({ dirty: false }));
/**
 * REQ-CONFIG-403 and REQ-CHAT-167: written the moment the control moves, and the transcript re-renders from the same
 * store. `display/showReasoning` joined on 2026-10-13 (N71): until then nothing wrote it, so the preference could not
 * be changed from anywhere. Settings → Display and the palette's "Toggle reasoning bodies" (through `display-host.ts`)
 * both write through here, so the store is updated only after main has stored the value.
 */
export type DisplayPrefKey = 'display/autoCollapseTools' | 'display/groupTools' | 'display/showReasoning';
/**
 * Channel 14 — REQ-CHAT-167 / REQ-CONFIG-403: main announces every display preference it stores to every window, and this
 * window folds it in, so a persona window already open follows a change made in the main window (and the reverse) rather
 * than keeping the values it booted with. Subscribed at module load, before the role branch, so every window role that
 * draws transcript rows has it (`docs/defects/fixed/an-open-persona-window-keeps-the-display-preferences-it-booted-with.md`).
 */
bridge.onDisplayChanged((payload) => { const patch = displayPreferencePatch(payload); if (patch !== null) displayPrefs.setState(patch); });
const DISPLAY_FIELD: Record<DisplayPrefKey, 'autoCollapseTools' | 'groupTools' | 'showReasoning'> = {
  'display/autoCollapseTools': 'autoCollapseTools',
  'display/groupTools': 'groupTools',
  'display/showReasoning': 'showReasoning',
};
export async function writeDisplayPref(key: DisplayPrefKey, value: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = await bridge.command({ kind: 'prefs.set', key, value });
  if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
  displayPrefs.setState({ [DISPLAY_FIELD[key]]: value });
  return { ok: true };
}
/**
 * THE THEME THIS WINDOW IS WEARING (REQ-SHELL-128, REQ-CONFIG-329).
 *
 * Adopting one is three moves that must happen together and in order — resolve the name to a theme, write its
 * variables onto the document, tell every mounted surface — and they were written out four times: here for the
 * channel, in the settings control, in the slash command, and once more at bootstrap. A fourth copy that forgot
 * the third move would leave the document restyled and React drawing the old palette, which is exactly the kind
 * of disagreement no test looks for. There is one copy now, and `change` is the same three moves after the
 * command main answers, so a surface changing the theme states the name and nothing else.
 */
export const windowTheme = {
  /** What the window is wearing right now — read at mount, never stored by a surface. */
  current: (): Theme => runningTheme,
  /** Every mounted surface that redraws on a change; the returned function is what React's cleanup wants. */
  subscribe: (react: (next: Theme) => void): (() => void) => {
    themeSubscribers.add(react);
    return () => { themeSubscribers.delete(react); };
  },
  /** Adopt a resolved name locally: what the channel does when another window changed it, and what bootstrap does. */
  adopt: (name: string | undefined): Theme => {
    runningTheme = resolveTheme(name);
    applyTheme(runningTheme, document.documentElement);
    for (const subscriber of themeSubscribers) subscriber(runningTheme);
    return runningTheme;
  },
  /** Change it: main writes the preference for every window, then this window adopts what it asked for. */
  change: async (name: ThemeName): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'theme.set', name });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    windowTheme.adopt(name);
    return { ok: true };
  },
};
