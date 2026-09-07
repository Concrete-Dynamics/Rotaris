import { presentationStatus, type PresentationStatus } from '@rotaris/contracts';

/**
 * Part AB — the composer's and the run header's rules, as values rather than as markup, so each is checkable
 * without a DOM and none is stated twice. Structure from `docs/spec/03-conversation-composer-transcript.md`
 * sections 1 and 2; the geometry figures below are the numbers REQ-CHAT-010 states and are written as it
 * states them (a specification value, never a design token's job).
 */

/**
 * REQ-CHAT-008's label vocabulary. It is NOT `STATUS_LABELS` (REQ-NOTIFY-048's, in `contracts/status.ts`) and
 * must not be collapsed into it: that one is the presentation vocabulary's own naming, free in its wording;
 * this one is fixed word for word by REQ-CHAT-008 for the composer and the run header. The tenth member is
 * synthetic — REQ-NOTIFY-048 has nine and this requirement "defines no run state of its own", so `recovery`
 * is a LABEL for a condition over the nine, not a tenth run state.
 */
export const RUN_STATE_LABELS: Readonly<Record<PresentationStatus | 'recovery', string>> = {
  idle: 'Ready',
  starting: 'Starting run…',
  running: 'Run active',
  pausing: 'Pausing after current step…',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Run failed',
  cancelling: 'Cancelling…',
  stopped: 'Stopped',
  recovery: 'Run needs recovery',
};
export type RunState = keyof typeof RUN_STATE_LABELS;

/**
 * REQ-CHAT-008: the synthetic state is "the persisted session claims busy but no local run exists". With no
 * session loaded there is no run state to report and the composer is in its idle mode, which is what `Ready`
 * says. `needsRecovery` is decided upstream by the one liveness predicate (REQ-SESSION-171); this function
 * only places it, so the two cannot disagree about the ordering.
 */
export function runStateOf(executionStatus: string | null, needsRecovery: boolean): RunState {
  if (executionStatus === null) return 'idle';
  const presented = presentationStatus(executionStatus);
  return needsRecovery && (presented === 'starting' || presented === 'running' || presented === 'pausing' || presented === 'cancelling') ? 'recovery' : presented;
}
export function runStateLabel(state: RunState): string {
  return RUN_STATE_LABELS[state];
}

/**
 * REQ-CHAT-006's partition of REQ-NOTIFY-048's nine, plus REQ-CHAT-008's synthetic tenth label. The persona,
 * model and reasoning chips are disabled in exactly these six and enabled in exactly the other four; the text
 * area, the permission-mode chip and the Stash control are enabled in every one of them and appear in neither
 * list, which is why this is one closed set and not a predicate spelled out at each control.
 */
export const CHIPS_DISABLED_STATES: readonly RunState[] = ['starting', 'running', 'pausing', 'paused', 'cancelling', 'recovery'];
export const CHIPS_ENABLED_STATES: readonly RunState[] = ['idle', 'completed', 'failed', 'stopped'];

/**
 * REQ-CHAT-078's four reason texts, which REQ-CHAT-006 borrows for the composer's three chips — "drawn from
 * the same set of reason texts REQ-CHAT-078 gives the run controls". One function serves both sides because
 * they are the same four sentences; what differs is WHICH of the four each side can be in, and that is the
 * two callers below rather than two copies of the wording.
 *
 * The third is rendered exactly as REQ-CHAT-078 writes it — the run-state label lowercased, with no full stop
 * added, because the labels of REQ-CHAT-008 end variously in a word or an ellipsis and the requirement adds none.
 */
export function runControlReason(state: RunState): string {
  if (state === 'recovery') return 'Recover this session before using run controls.';
  if (state === 'paused') return 'Continue the paused run before using run controls.';
  if (state === 'starting' || state === 'running' || state === 'pausing' || state === 'cancelling') return `Run controls are unavailable while ${runStateLabel(state).toLowerCase()}`;
  return 'Start or continue a run to enable run controls.';
}
/** REQ-CHAT-006: the composer chip's reason, or null while it is enabled. Only three of the four can be reached from here. */
export function composerChipReason(state: RunState): string | null {
  return CHIPS_DISABLED_STATES.includes(state) ? runControlReason(state) : null;
}
/**
 * REQ-CHAT-078 / REQ-CHAT-006's closing sentence: the run header's own model and reasoning selectors change
 * the LIVE run and follow the opposite rule — enabled only while a run is running and locally owned. Every
 * other state states its reason, including the fourth text, which the composer chips can never reach.
 */
export function runHeaderControlReason(state: RunState): string | null {
  return state === 'running' ? null : runControlReason(state);
}

/**
 * REQ-CHAT-007: sending is refused in two situations. The first sentence is fixed word for word. The second's
 * wording is left to the implementation and must convey exactly two facts — that the project-setup prompt has
 * to be answered first, and that nothing else in the application is blocked meanwhile.
 *
 * **The second limb is vacuous in this build and is written anyway.** The only project setup that exists is
 * Part T's code-intelligence setup (REQ-MCP-099/112), which is a settings-category action and gates nothing;
 * the onboarding prompt that would gate execution arrives with REQ-MCP-045/098's task registry. Nothing can
 * currently pass `true` here — which is recorded rather than hidden, and is why the flag is a parameter and
 * not a state this file invents.
 */
export const CANCELLING_REFUSAL = 'Wait for the current run to finish cancelling.';
export const PROJECT_SETUP_REFUSAL = 'Answer the project setup prompt before sending a prompt. Nothing else in the application is blocked while it waits.';
export function sendRefusal(state: RunState, projectSetupPending: boolean): string | null {
  if (state === 'cancelling') return CANCELLING_REFUSAL;
  if (projectSetupPending) return PROJECT_SETUP_REFUSAL;
  return null;
}

/**
 * REQ-CHAT-004: exactly these four strings, first condition first. `localRunActive` is a locally owned run;
 * `busy` is the loaded session reporting itself busy. Condition (2) is reachable exactly when the two differ,
 * which is REQ-CHAT-008's synthetic recovery state — before Part AB the view computed both from one predicate
 * and (2) could never be chosen.
 */
export const COMPOSER_PLACEHOLDERS = {
  localRun: 'Run active — write a follow-up for the next iteration…',
  remoteBusy: 'Describe how to continue this session…',
  session: 'Message orchestrator — type / for commands, ↑ for history…',
  none: 'Describe the outcome you want…',
} as const;
export function composerPlaceholderFor(hasSession: boolean, localRunActive: boolean, busy: boolean): string {
  if (localRunActive) return COMPOSER_PLACEHOLDERS.localRun;
  if (hasSession && busy) return COMPOSER_PLACEHOLDERS.remoteBusy;
  if (hasSession) return COMPOSER_PLACEHOLDERS.session;
  return COMPOSER_PLACEHOLDERS.none;
}

/** REQ-CHAT-009: `reasoning: <level>`, defaulting to **high** — which is NOT REQ-MONITOR-048's `medium` for an agent record. */
export const REASONING_LEVELS = ['low', 'medium', 'high'] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];
export const DEFAULT_REASONING: ReasoningLevel = 'high';
export function reasoningChipLabel(level: string | null): string {
  const known = (REASONING_LEVELS as readonly string[]).includes(level ?? '') ? (level as ReasoningLevel) : DEFAULT_REASONING;
  return `reasoning: ${known}`;
}
/**
 * REQ-CHAT-009: until model options have been loaded the model chip shows a neutral label naming no vendor and
 * no specific model, and is disabled while it shows it, "so no run can be started against a model the user
 * never chose". A workspace whose configuration lists no model is LOADED with nothing to offer, which is a
 * different sentence and gets a different one.
 */
export const MODELS_LOADING_LABEL = 'model: loading…';
export const NO_MODELS_LABEL = 'model: none configured';
export function modelChipLabel(loaded: boolean, models: readonly string[], selected: string | null): string {
  if (!loaded) return MODELS_LOADING_LABEL;
  if (models.length === 0) return NO_MODELS_LABEL;
  return `model: ${selected && models.includes(selected) ? selected : models[0]}`;
}

/**
 * REQ-CHAT-014 (200 ms, publish to application state) and REQ-SHELL-159 (400 ms, write to the preference
 * store). Two figures serving two requirements, both normative, and ADR-0042 consequence 5 exists because it
 * would be easy to collapse them into one by accident. They are measured from the same keystroke, not chained.
 */
export const DRAFT_PUBLISH_MS = 200;
export const DRAFT_WRITE_MS = 400;

/** REQ-CHAT-010's geometry, as the requirement states it. */
export const COMPOSER_DEFAULT_HEIGHT = 150;
export const COMPOSER_MIN_HEIGHT = 110;
export const TRANSCRIPT_MIN_HEIGHT = 180;
export const COMPOSER_WIDGET_MIN_HEIGHT = 48;
/** The divider's rule: the composer never below its minimum, and never so tall that the transcript falls below its own. */
export function clampComposerHeight(height: number, containerHeight: number, dividerHeight = 8): number {
  const byTranscript = containerHeight - TRANSCRIPT_MIN_HEIGHT - dividerHeight;
  return Math.round(Math.max(COMPOSER_MIN_HEIGHT, Math.min(height, Math.max(COMPOSER_MIN_HEIGHT, byTranscript))));
}

/**
 * REQ-CHAT-016's shell-style recall as a value. `null` is "not walking"; the first Up saves the composer's
 * current text and loads the newest entry, further Ups walk older and clamp at the oldest, Down walks newer
 * and past the newest restores the saved draft and ends the walk. Any other keypress resets it, which the
 * caller does by discarding the walk — there is no arm here for it, because "reset" is the absence of state.
 */
export interface HistoryWalk {
  readonly index: number;
  readonly saved: string;
}
export interface HistoryStep {
  readonly walk: HistoryWalk | null;
  readonly text: string;
  readonly moved: boolean;
}
export function historyUp(walk: HistoryWalk | null, history: readonly string[], current: string): HistoryStep {
  if (history.length === 0) return { walk, text: current, moved: false };
  if (walk === null) return { walk: { index: 0, saved: current }, text: history[0]!, moved: true };
  const index = Math.min(walk.index + 1, history.length - 1);
  return { walk: { ...walk, index }, text: history[index]!, moved: index !== walk.index };
}
export function historyDown(walk: HistoryWalk | null, history: readonly string[], current: string): HistoryStep {
  if (walk === null) return { walk: null, text: current, moved: false };
  if (walk.index === 0) return { walk: null, text: walk.saved, moved: true };
  const index = Math.min(walk.index - 1, Math.max(0, history.length - 1));
  return { walk: { ...walk, index }, text: history[index] ?? walk.saved, moved: true };
}

/**
 * REQ-CHAT-158: `M:SS`, or `H:MM:SS` once the value reaches one hour. Shared with the wait header's countdown
 * (REQ-NOTIFY-263), which formats the same shape — one implementation, so the two can never drift.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * REQ-CHAT-158's value. While the run is busy it counts from the start of the step in flight and so restarts
 * as the run moves on; at a terminal state it freezes at the run's total wall-clock duration; before any run
 * it is null, which the header draws as no duration rather than as `0:00`.
 *
 * **What `stepStartedAt` is, and what it is not — stated rather than implied.** No field publishes a model
 * call's boundary: `SessionRecord` carries `runStartedAt` and nothing per call, and the surface's only per-step
 * evidence is the transcript. `modelCallStartedAt` below therefore reads the newest row the run produced, live
 * one first. Every model call whose output begins produces a new row (a response after a tool boundary or as a
 * new streaming segment is a distinct row, REQ-CHAT-054), so the value does restart per call and does rise
 * while a call is slow, which is what the requirement asks a reader to be able to see. It is NOT the instant
 * the call was issued, and a call that has produced nothing yet counts from the end of the step before it.
 * Publishing the true boundary needs a field on the record, and that is recorded as owed rather than faked here.
 */
export function modelCallStartedAt(rows: readonly { readonly at: string; readonly settled: boolean }[]): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) if (!rows[i]!.settled) return rows[i]!.at;
  return rows.length > 0 ? rows[rows.length - 1]!.at : null;
}
export function runTimingSeconds(
  input: { readonly runStartedAt: string | null; readonly updatedAt: string; readonly busy: boolean; readonly stepStartedAt: string | null },
  nowMs: number,
): number | null {
  if (input.runStartedAt === null) return null;
  const started = Date.parse(input.runStartedAt);
  if (!Number.isFinite(started)) return null;
  if (!input.busy) return Math.max(0, (Date.parse(input.updatedAt) - started) / 1000);
  const step = input.stepStartedAt === null ? NaN : Date.parse(input.stepStartedAt);
  return Math.max(0, (nowMs - Math.max(started, Number.isFinite(step) ? step : started)) / 1000);
}
/** REQ-CHAT-158: nothing before any run, rather than a zero. */
export function runTimingLabel(seconds: number | null): string | null {
  return seconds === null ? null : formatDuration(seconds);
}
