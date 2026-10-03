import { presentationStatus, PROJECT_SETUP_SEND_REASON, resolvePreset, type PresentationStatus } from '@rotaris/contracts';
import { countNoun, formatAmount } from '@rotaris/kernel';

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
 * The design draws a run's state as a Tag with a status dot, not as coloured text (`docs/design/README.md` §7,
 * and the mockup's `tag tag-run` beside the session title). The tone is the design's own four-way vocabulary and
 * the dot pulses for exactly the states where work is in flight, which is the same closed set the run controls
 * key off — so one table, not a predicate restated at the header. `live` drives the pulse; `REQ-SHELL-121`'s
 * reduced-motion setting is honoured by the caller, as everywhere else that animates.
 */
export const RUN_STATE_TAGS: Readonly<Record<RunState, { readonly tone: string; readonly live: boolean }>> = {
  starting: { tone: 'tag-run', live: true },
  running: { tone: 'tag-run', live: true },
  pausing: { tone: 'tag-wait', live: true },
  cancelling: { tone: 'tag-wait', live: true },
  recovery: { tone: 'tag-wait', live: true },
  paused: { tone: 'tag-wait', live: false },
  failed: { tone: 'tag-fail', live: false },
  completed: { tone: 'tag-done', live: false },
  stopped: { tone: 'tag-neutral', live: false },
  idle: { tone: 'tag-neutral', live: false },
};

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
 * REQ-TOOLS-184's `mode: <preset>`, shown permanently: the focused session's own mode, and with no session focused the
 * configured one — the preset the next run starts from (REQ-CONFIG-288's reading, which the composer's mode chip
 * already follows). Before a configuration has been read there is none, and a missing key resolves to REQ-TOOLS-046's
 * shipped default. Until 2026-09-29 the strip fell back to the literal `ask` whatever was configured (live-run finding
 * L7), understating an `autonomous` workspace on the one indicator that is there for safety.
 */
export function statusStripModeItem(sessionMode: string | null, configuredMode: string | null): string {
  return `mode: ${sessionMode ?? resolvePreset(configuredMode).preset}`;
}

/**
 * REQ-SANDBOX-121's workspace indicator naming the confinement backend, drawn in the status strip as text (REQ-SHELL-149,
 * REQ-TOOLS-184's text-flag craft — the mockup has no confinement indicator): present only for a focused session whose
 * recorded result is confined, so it re-binds with focus (REQ-MONITOR-257, REQ-NOTIFY-030) and is absent with no session
 * focused, which is where a refused start leaves the window (REQ-NOTIFY-061, REQ-SANDBOX-120: no session remains). A run
 * of an existing session refused at the confinement gate is published by the engine as no longer sandboxed
 * (`Sessions.refusedAtStart`), so the item is gone beside REQ-NOTIFY-061's notice until a run of it starts again. The
 * tooltip words confinement as the settings page's Sandbox mode control does ("OS-level confinement", "Active — <backend>")
 * and joins it to the short form as REQ-SHELL-041's flags do. A record written before the backend was recorded, and whose
 * start event no longer holds it, reads `sandbox: confined`. Where the indicator stands among REQ-SHELL-038's items, and
 * its words, are OQ-184's.
 */
export function statusStripSandboxItem(session: { readonly sandboxed: boolean; readonly sandboxBackend: string } | null): { readonly text: string; readonly name: string; readonly title: string; readonly testId: string } | null {
  if (session === null || !session.sandboxed) return null;
  const backend = session.sandboxBackend.trim();
  const text = backend === '' ? 'sandbox: confined' : `sandbox: ${backend}`;
  return { text, name: 'Confinement backend', title: `${text} — Sandbox mode active${backend === '' ? '' : ` (${backend})`}: agent commands in this session run inside OS-level confinement.`, testId: 'strip-sandbox' };
}

/**
 * REQ-SHELL-038's status strip, as values: its items left to right — workspace path (a link), checked-out branch, a
 * spacer, the safety flags, model, tokens, cost, cloud credit, background-session count — each with REQ-SHELL-038's
 * accessible name, and REQ-SHELL-047's two responsive thresholds. The list is closed: until 2026-10-02 the strip also drew
 * the run's state, the theme's name, each child service and the replica's applied/reset/refused counters, which no
 * requirement places there, and none of REQ-SHELL-038's workspace-path, model, tokens or cost items
 * (docs/defects/fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md).
 * REQ-SANDBOX-121's confinement indicator stands where OQ-184's build reading puts it, right after the file-access flag.
 * The cloud-credit item (REQ-SHELL-046) is present only once a credit balance is available, and this build reads none, so
 * the list never carries it.
 */
export type StripItem =
  | { readonly kind: 'text'; readonly text: string; readonly name: string; readonly title: string; readonly testId: string; readonly state?: string; readonly figure?: true; readonly strong?: true; readonly middle?: true; readonly suffix?: string; readonly icon?: string }
  | { readonly kind: 'link'; readonly text: string; readonly name: string; readonly title: string; readonly testId: string; readonly onActivate: () => void; readonly middle?: true }
  | { readonly kind: 'spacer' };
/*
 * `middle`: REQ-WORKSPACE-149 rule 2 — the item's `text` is a workspace path or a branch name, shortened from the MIDDLE
 * against the width the strip gives it (`StatusStripItem.tsx`, `rowLabel`), and hidden rather than clipped where even `…`
 * does not fit; every other item that is too long keeps REQ-SHELL-038's end ellipsis. The path link gives up its width
 * before the branch name does (shell.css, `.status-strip__link[data-middle='1']`), so a short branch name stays whole
 * beside a long path; the branch item carries `middle` only while it shows a branch name. `suffix`: fixed text drawn after the
 * label and never shortened — the branch item's ` ↑{n}` ahead marker, which is not part of the branch name. `icon`: a
 * Phosphor glyph drawn before the label in the accent colour — the branch item's `ph-git-branch` (REQ-SHELL-042,
 * REQ-WORKSPACE-020), only where the item shows a branch name.
 */

/** REQ-SHELL-047: below this window width the workspace-path item is hidden (a specification value, stated as it states it). */
export const STRIP_PATH_MIN_WIDTH = 1180;
/** REQ-SHELL-047: below this window width the background-session item is hidden as well. */
export const STRIP_BACKGROUND_MIN_WIDTH = 1080;
/**
 * The window width as the strip reads it: the lowest width of its REQ-SHELL-047 band (at least 1180, at least 1080, below).
 * `stripItems` answers the same items for every width in a band, so a renderer memoising on the band rebuilds the strip
 * only when a threshold is crossed — REQ-TOOLS-184's "never redraws when nothing it displays has changed".
 */
export function stripWidthBand(width: number): number {
  return width >= STRIP_PATH_MIN_WIDTH ? STRIP_PATH_MIN_WIDTH : width >= STRIP_BACKGROUND_MIN_WIDTH ? STRIP_BACKGROUND_MIN_WIDTH : 0;
}

/** REQ-SHELL-038: the accessible names, word for word. */
export const STRIP_NAMES = {
  workspace: 'Workspace folder', branch: 'Checked-out branch', safety: 'Safety settings in force', model: 'Model runs use',
  tokens: 'Tokens used', cost: 'Cost so far', credit: 'Rotaris Cloud credit', background: 'Background sessions',
} as const;

/**
 * REQ-SHELL-041's safety flags, left to right in its fixed order, each with its display condition: `● CB armed` while the
 * circuit breaker is enabled; `redaction: always on`; `unsaved settings` while the Settings view holds unsaved edits; then
 * exactly one of `outside-workspace!` or `workspace-scoped` (REQ-TOOLS-131: the opt-out `runtime.allow_outside_workspace`
 * decides which); and `mode: {mode}`. Each carries one explanation, and its tooltip and accessible description are the
 * one joined string `{short form} — {explanation}`. The file-access explanations are REQ-WORKSPACE-022's fixed pair,
 * "the pair a reader compares", in the words of REQ-WORKSPACE-148's Settings control ("read and write outside this
 * workspace folder"). The unsaved-settings sentence is REQ-SHELL-041's two facts; REQ-WORKSPACE-022 states another second
 * fact (OQ-191). Until 2026-10-02 the file-access flag was the literal `workspace-scoped` whatever the opt-out said, so
 * with it on the strip still told the user agents were confined.
 */
export interface SafetyFacts {
  readonly circuitBreakerArmed: boolean;
  readonly unsavedSettings: boolean;
  readonly outsideWorkspace: boolean;
  /** The mode's short form, `mode: <preset>` (`statusStripModeItem`). */
  readonly mode: string;
}
/**
 * REQ-SHELL-041 / REQ-TOOLS-184: whether `● CB armed` is shown — the saved `circuit_breaker.enabled` as the configuration
 * snapshot carries it (re-read on every `config:changed`, so the flag follows a Settings save as the file-access flag does),
 * unless the host override `ROTARIS_CIRCUIT_BREAKER=off` disarms it, which the run host's supervisor honours too. Until the
 * first snapshot arrives the window's boot answer (`shell.hello`) stands. Until 2026-10-03 the flag was that boot answer
 * alone, so a breaker turned off in Settings still read armed until the window was opened again.
 */
export function stripCircuitBreakerArmed(configured: boolean | undefined, atBoot: boolean, hostOff: boolean): boolean {
  if (hostOff) return false;
  return configured ?? atBoot;
}
export const CIRCUIT_BREAKER_EXPLANATION = 'Circuit breaker: Rotaris stops a run that keeps repeating a failing step.';
export const REDACTION_EXPLANATION = 'Secret redaction: anything that looks like a credential is masked before it reaches a model or the transcript.';
export const UNSAVED_SETTINGS_EXPLANATION = 'The Settings view is holding edits that have not been saved; runs keep using the last saved values until they are saved.';
export const OUTSIDE_WORKSPACE_EXPLANATION = 'File access: agents may read and write outside this workspace folder.';
export const WORKSPACE_SCOPED_EXPLANATION = 'File access: agents may read and write inside this workspace folder only.';
export function modeExplanation(mode: string): string {
  return `Permission mode ${mode}: how much agents may do without asking. Change it under the composer or in Settings → Runtime.`;
}
function flag(text: string, explanation: string, testId: string): StripItem {
  return { kind: 'text', text, name: STRIP_NAMES.safety, title: `${text} — ${explanation}`, testId };
}
export function statusStripSafetyFlags(f: SafetyFacts, sandbox: { readonly text: string; readonly name: string; readonly title: string; readonly testId: string } | null): StripItem[] {
  const mode = f.mode.replace(/^mode: /, '');
  return [
    ...(f.circuitBreakerArmed ? [flag('● CB armed', CIRCUIT_BREAKER_EXPLANATION, 'strip-circuit-breaker')] : []),
    flag('redaction: always on', REDACTION_EXPLANATION, 'strip-redaction'),
    ...(f.unsavedSettings ? [flag('unsaved settings', UNSAVED_SETTINGS_EXPLANATION, 'strip-unsaved')] : []),
    f.outsideWorkspace ? flag('outside-workspace!', OUTSIDE_WORKSPACE_EXPLANATION, 'strip-file-access') : flag('workspace-scoped', WORKSPACE_SCOPED_EXPLANATION, 'strip-file-access'),
    // OQ-184's build reading: REQ-SANDBOX-121's indicator right after the file-access flag, at every width.
    ...(sandbox === null ? [] : [{ kind: 'text' as const, ...sandbox }]),
    flag(f.mode, modeExplanation(mode), 'strip-mode'),
  ];
}

/**
 * REQ-SHELL-043: the model item from the composer's model chip label (`modelChipLabel`), so the strip and the chip name one
 * model: the label as the chip shows it, and the bare model for the tooltip's `{model}`.
 */
export function stripModelItem(chipLabel: string): { readonly name: string; readonly label: string } {
  return { name: chipLabel.replace(/^model: /, ''), label: chipLabel };
}

/** REQ-SHELL-044: the running total, its digits grouped into thousands with commas, then ` tok` — `12,480 tok`, and `0 tok`. */
export function stripTokensText(total: number): string {
  return `${String(Math.max(0, Math.trunc(total))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} tok`;
}

/**
 * REQ-SHELL-045's cost: absent until a session has reported usage and a cost figure exists for it, then `{figure} cost`, the
 * figure by the single money rule (REQ-PROVIDER-121, `formatAmount`, its `< 0.0001` floor included) or the literal `n/a`
 * for usage with no published pricing. The product records no currency (PD-MONITOR-001's narrowing), so the figure is bare.
 */
export function stripCostText(cost: string | null): string | null {
  if (cost === null) return null;
  if (cost === 'n/a') return 'n/a cost';
  const figure = formatAmount(cost);
  return figure === null ? null : `${figure} cost`;
}

export interface StripFacts {
  /** The workspace folder's path, as the title bar's chip shows it, and the action opening it (REQ-SHELL-040). */
  readonly workspace: { readonly label: string; readonly path: string; readonly open: () => void } | null;
  readonly branch: { readonly text: string; readonly suffix?: string | undefined; readonly title: string; readonly state?: string | undefined };
  readonly safety: SafetyFacts;
  readonly sandbox: { readonly text: string; readonly name: string; readonly title: string; readonly testId: string } | null;
  /** REQ-SHELL-043: the model a run started from this window uses, and the short form the composer's chip shows. */
  readonly model: { readonly name: string; readonly label: string };
  /** REQ-SHELL-044: the running total of tokens used by this workspace's runs (OQ-190's build reading). */
  readonly tokens: number;
  /** REQ-SHELL-045: the workspace's reported cost, `n/a`, or null before any session reported usage with a figure. */
  readonly cost: string | null;
  /** REQ-TOOLS-184 / REQ-TOOLS-107: background terminal sessions in the running state. */
  readonly backgroundSessions: number;
}

/**
 * The strip at a window `width` (CSS px, the window's own), REQ-SHELL-038's order, with REQ-SHELL-047's hiding: narrower
 * than 1180 px the workspace path goes, below 1080 px the background-session count goes too, and nothing else is hidden.
 * Hiding removes the label only: the workspace stays reachable from the title-bar chip (REQ-WORKSPACE-021).
 */
export function stripItems(width: number, f: StripFacts): StripItem[] {
  const items: StripItem[] = [];
  if (f.workspace !== null && width >= STRIP_PATH_MIN_WIDTH) {
    items.push({ kind: 'link', text: f.workspace.label, name: STRIP_NAMES.workspace, title: `Workspace folder: ${f.workspace.path}. Opens it in your file manager.`, testId: 'strip-workspace', onActivate: f.workspace.open, middle: true });
  }
  items.push({
    kind: 'text', text: f.branch.text, name: STRIP_NAMES.branch, title: f.branch.title, testId: 'strip-branch', figure: true,
    // REQ-SHELL-042 / REQ-WORKSPACE-020: a branch icon before the branch name, and REQ-WORKSPACE-149 rule 2's middle
    // shortening of that name. The detached, non-repository and unread states carry words rather than a branch name
    // (REQ-GIT-161's reading, OQ-193): no icon, and never shortened — `no …ry` conveys no state at all. Until the 2026-10-03
    // repair round `middle` was set in every state and a long path beside the item cut `no git repository` to `no …ry`.
    ...(f.branch.state === 'branch' ? { icon: 'ph-git-branch', middle: true as const } : {}),
    ...(f.branch.suffix ? { suffix: f.branch.suffix } : {}),
    ...(f.branch.state === undefined ? {} : { state: f.branch.state }),
  });
  items.push({ kind: 'spacer' });
  items.push(...statusStripSafetyFlags(f.safety, f.sandbox));
  items.push({ kind: 'text', text: f.model.label, name: STRIP_NAMES.model, title: `Runs started from this window use ${f.model.name}. Change it in the composer or in Settings → Models.`, testId: 'strip-model', strong: true });
  const tokens = stripTokensText(f.tokens);
  items.push({ kind: 'text', text: tokens, name: STRIP_NAMES.tokens, title: `Tokens used by this workspace's runs so far: ${tokens}.`, testId: 'strip-tokens', figure: true });
  const cost = stripCostText(f.cost);
  if (cost !== null) {
    items.push({ kind: 'text', text: cost, name: STRIP_NAMES.cost, title: `Cost of this workspace's runs so far: ${cost.slice(0, -' cost'.length)}. Reported by the model provider; an unpriced model reads n/a.`, testId: 'strip-cost', figure: true });
  }
  if (width >= STRIP_BACKGROUND_MIN_WIDTH) {
    const count = countNoun(f.backgroundSessions, 'bg session');
    items.push({ kind: 'text', text: count, name: STRIP_NAMES.background, title: `Background terminal sessions running: ${count}.`, testId: 'strip-background' });
  }
  return items;
}

/** What the Pause control's pending mark is scoped to: the session shown and whether its run is busy (REQ-NOTIFY-050). */
export interface PauseScope {
  readonly sessionId: string | null;
  readonly busy: boolean;
}
/**
 * REQ-MONITOR-296: the Pause control shows `pausing` only after the run accepted the pause, and that mark belongs to
 * the run that accepted it. It ends when that run leaves the busy states (it paused, or ended first) or another session
 * is shown, so a later run of any session starts with Pause offered. Before this rule the mark was never cleared, and
 * every later run in the window drew Pause disabled.
 */
export function pausePendingAfter(pending: boolean, before: PauseScope, after: PauseScope): boolean {
  if (!pending) return false;
  return after.busy && after.sessionId === before.sessionId;
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
 * **The second limb was vacuous until Part AS and is no longer.** It was written with the note that nothing
 * could pass `true`: the only project setup that existed was Part T's code-intelligence setup, a
 * settings-category action gating nothing. ADR-0064's task registry supplies the value, and the renderer now
 * passes it.
 *
 * **Its wording changed with it, and the reason is a disagreement between two requirements.** REQ-CHAT-007
 * leaves this text to the implementation; REQ-WORKSPACE-112 fixes it, word for word, and differently. The
 * more specific statement is followed — its text conveys both facts REQ-CHAT-007 requires — and the
 * disagreement is recorded at `docs/defects/two-requirements-fix-the-composer-setup-refusal-differently.md`
 * rather than settled here. The string itself lives in `contracts` beside the keyboard path's two, so the
 * gate and the error a submit raises cannot drift apart.
 */
export const CANCELLING_REFUSAL = 'Wait for the current run to finish cancelling.';
export const PROJECT_SETUP_REFUSAL = PROJECT_SETUP_SEND_REASON;
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

/**
 * Whether the composer takes keyboard focus back once a submission it awaited has settled (a start, a continue, a
 * queue, an executed slash command). It does when focus is nowhere (`null` or the body), in the composer, or still on
 * whatever held it when the submission began (the send pill, or the widget a Ctrl+Return came from, REQ-CHAT-001). It
 * does NOT when something else took focus while the submission was in flight: a dialog that opened meanwhile keeps
 * it. The run's events draw "Steer the run" before the start's reply arrives, so the steer dialog (REQ-MONITOR-137)
 * can open and focus its field in that window; until 2026-10-01 the composer took the focus back from under the modal
 * and the steer's text was typed into the composer behind it
 * (`docs/defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`).
 * Nothing in the specification moves focus out of an open modal (REQ-CHAT-002 gives a modal its own keys).
 *
 * The elements are compared by identity and nothing else is read of them, so the rule is checkable without a DOM.
 */
export function composerReclaimsFocus<T>(focus: { readonly now: T | null; readonly atSubmit: T | null; readonly body: T | null; readonly composer: T | null }): boolean {
  const { now, atSubmit, body, composer } = focus;
  return now === null || now === body || now === composer || now === atSubmit;
}

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
