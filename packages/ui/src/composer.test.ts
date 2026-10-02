import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESENTATION_STATUSES } from '@rotaris/contracts';
import {
  CANCELLING_REFUSAL, CHIPS_DISABLED_STATES, CHIPS_ENABLED_STATES, clampComposerHeight, composerChipReason, composerPlaceholderFor, composerReclaimsFocus,
  COMPOSER_DEFAULT_HEIGHT, COMPOSER_MIN_HEIGHT, COMPOSER_PLACEHOLDERS, COMPOSER_WIDGET_MIN_HEIGHT, DEFAULT_REASONING, DRAFT_PUBLISH_MS,
  DRAFT_WRITE_MS, formatDuration, historyDown, historyUp, modelCallStartedAt, modelChipLabel, MODELS_LOADING_LABEL, pausePendingAfter,
  PROJECT_SETUP_REFUSAL, reasoningChipLabel, runControlReason, runHeaderControlReason, RUN_STATE_LABELS, runStateOf, runTimingLabel,
  runTimingSeconds, sendRefusal, statusStripModeItem, statusStripRunItem, statusStripSandboxItem, TRANSCRIPT_MIN_HEIGHT, type HistoryWalk,
} from './composer.js';
import { STRIP_NARROW_BELOW, STRIP_TIGHT_BELOW, stripDensity, stripIconTitle } from './WorkspaceView.js';

describe('composer — REQ-CHAT-008: the run-state label vocabulary', () => {
  it('labels every member of REQ-NOTIFY-048 exactly as the requirement words it, plus the synthetic tenth', () => {
    expect(Object.keys(RUN_STATE_LABELS).sort()).toEqual([...PRESENTATION_STATUSES, 'recovery'].sort());
    expect(RUN_STATE_LABELS).toMatchObject({
      idle: 'Ready', starting: 'Starting run…', running: 'Run active', pausing: 'Pausing after current step…',
      paused: 'Paused', completed: 'Completed', failed: 'Run failed', cancelling: 'Cancelling…', stopped: 'Stopped',
      recovery: 'Run needs recovery',
    });
    // No two share a label and none is empty (REQ-NOTIFY-048's rule, which this vocabulary must not break).
    const labels = Object.values(RUN_STATE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => l.trim() !== '')).toBe(true);
  });
  it('reaches the synthetic state only where the session claims busy and no local run exists', () => {
    expect(runStateOf('running', true)).toBe('recovery');
    expect(runStateOf('starting', true)).toBe('recovery');
    expect(runStateOf('running', false)).toBe('running');
    // A settled session is never "needs recovery", whatever a stale listing says.
    expect(runStateOf('completed', true)).toBe('completed');
    expect(runStateOf('paused', true)).toBe('paused');
    // REQ-NOTIFY-049's normalisation is the only route in: `waiting` presents as running, `interrupted` as idle.
    expect(runStateOf('waiting', false)).toBe('running');
    expect(runStateOf('interrupted', false)).toBe('idle');
    expect(runStateOf(null, false)).toBe('idle');
  });
});

describe('REQ-TOOLS-184: the status strip shows the preset in force, with or without a focused session (live-run finding L7)', () => {
  it('names the focused session\'s own mode, else the configured preset, else REQ-TOOLS-046\'s shipped default', () => {
    // The live run of 2026-09-29: no session focused, `runtime.permission_mode: autonomous` configured, and the strip
    // read `mode: ask`.
    expect(statusStripModeItem(null, 'autonomous')).toBe('mode: autonomous');
    expect(statusStripModeItem(null, 'restricted')).toBe('mode: restricted');
    // A focused session names the preset it runs under, whatever is configured for the next run.
    expect(statusStripModeItem('ask', 'autonomous')).toBe('mode: ask');
    expect(statusStripModeItem('autonomous', 'restricted')).toBe('mode: autonomous');
    // No configuration read yet (or none to read): a missing key resolves to the shipped default, `ask`.
    expect(statusStripModeItem(null, null)).toBe('mode: ask');
  });
});

/*
 * REQ-SANDBOX-121 with REQ-MONITOR-257, REQ-NOTIFY-030 and REQ-NOTIFY-061 (the repair of
 * `docs/defects/fixed/no-workspace-indicator-names-the-confinement-backend.md`): no surface read the record's `sandboxed`,
 * and the record carried no backend to name.
 */
describe('REQ-SANDBOX-121: the strip names the confinement backend of the focused session, and only of a confined one', () => {
  it('a confined record names its backend, as text, with the tooltip worded as the settings page words confinement', () => {
    expect(statusStripSandboxItem({ sandboxed: true, sandboxBackend: 'bubblewrap' })).toEqual({
      text: 'sandbox: bubblewrap', name: 'Confinement backend', testId: 'strip-sandbox',
      title: 'sandbox: bubblewrap — Sandbox mode active (bubblewrap): agent commands in this session run inside OS-level confinement.',
    });
    expect(statusStripSandboxItem({ sandboxed: true, sandboxBackend: 'seatbelt' })?.text).toBe('sandbox: seatbelt');
    // A record written before the backend was recorded, whose start event no longer holds it: confined, backend unnamed.
    expect(statusStripSandboxItem({ sandboxed: true, sandboxBackend: '' })?.text).toBe('sandbox: confined');
  });

  it('an unconfined record, a refused start (no session), and no focused session draw nothing', () => {
    expect(statusStripSandboxItem({ sandboxed: false, sandboxBackend: '' })).toBeNull();
    // A stale backend beside `sandboxed: false` is never drawn: the flag decides.
    expect(statusStripSandboxItem({ sandboxed: false, sandboxBackend: 'bubblewrap' })).toBeNull();
    // REQ-NOTIFY-061 / REQ-SANDBOX-120: a refused start leaves no session, so the window follows none.
    expect(statusStripSandboxItem(null)).toBeNull();
  });

  it('re-binds with focus: the item is the focused record\'s, so switching between a confined and an unconfined session moves it (REQ-MONITOR-257, REQ-NOTIFY-030)', () => {
    const confined = { sandboxed: true, sandboxBackend: 'bubblewrap' };
    const open = { sandboxed: false, sandboxBackend: '' };
    expect([confined, open, confined].map((focused) => statusStripSandboxItem(focused)?.text ?? null)).toEqual(['sandbox: bubblewrap', null, 'sandbox: bubblewrap']);
  });
});

describe('REQ-SHELL-038 with REQ-CHAT-008: the status strip names the recovery state as the run header does', () => {
  it('reads "Run needs recovery" for a busy session with no run here, and the presentation vocabulary otherwise', () => {
    // PD-ORCH-005 clause 13 (OQ-100): the strip never says a run is active beside a run-level agent drawn `paused`.
    expect(statusStripRunItem('running', true)).toBe('Run needs recovery');
    expect(statusStripRunItem('waiting', true)).toBe('Run needs recovery');
    expect(statusStripRunItem('pausing', true)).toBe('Run needs recovery');
    expect(statusStripRunItem('running', false)).toBe('run Running');
    // A session at rest is named by its own status whatever a stale listing says (REQ-NOTIFY-049).
    expect(statusStripRunItem('paused', true)).toBe('run Paused');
    expect(statusStripRunItem('interrupted', true)).toBe('run Idle');
    expect(statusStripRunItem(null, false)).toBe('no session');
  });
});

describe('REQ-MONITOR-296: the accepted pause\'s pending mark belongs to the run that accepted it', () => {
  const s1Busy = { sessionId: 's1', busy: true };
  it('holds while that run stays busy, and ends when it rests, ends, or another session is shown', () => {
    expect(pausePendingAfter(true, s1Busy, s1Busy)).toBe(true);
    expect(pausePendingAfter(true, s1Busy, { sessionId: 's1', busy: false })).toBe(false);
    expect(pausePendingAfter(true, s1Busy, { sessionId: 's2', busy: true })).toBe(false);
    expect(pausePendingAfter(true, s1Busy, { sessionId: null, busy: false })).toBe(false);
    expect(pausePendingAfter(false, s1Busy, s1Busy)).toBe(false);
  });
  // WorkspaceView's Pause control is stateful and vitest has no DOM, so what pins its use of the rule is its source.
  it('WorkspaceView clears the mark through the rule whenever the scope changes', () => {
    const text = readFileSync(new URL('./WorkspaceView.tsx', import.meta.url), 'utf8');
    expect(text).toContain('if (pausePending && !pausePendingAfter(pausePending, pauseScopeSeen, pauseScope)) setPausePending(false);');
    expect(text).toContain('const pauseScope: PauseScope = { sessionId: session?.id ?? null, busy: sessionBusy };');
  });
});

describe('composer — REQ-CHAT-006: the partition, and the reason published twice', () => {
  it('disables the three chips in exactly six states and enables them in exactly four', () => {
    expect([...CHIPS_DISABLED_STATES].sort()).toEqual(['cancelling', 'paused', 'pausing', 'recovery', 'running', 'starting']);
    expect([...CHIPS_ENABLED_STATES].sort()).toEqual(['completed', 'failed', 'idle', 'stopped']);
    // The two partition the ten labels between them: nothing is in both, nothing is in neither.
    expect(new Set([...CHIPS_DISABLED_STATES, ...CHIPS_ENABLED_STATES]).size).toBe(Object.keys(RUN_STATE_LABELS).length);
  });
  it('gives every disabled state a non-empty reason and every enabled state none', () => {
    for (const state of CHIPS_DISABLED_STATES) expect(composerChipReason(state)).toMatch(/\S/);
    for (const state of CHIPS_ENABLED_STATES) expect(composerChipReason(state)).toBeNull();
  });
  it('draws the reasons from REQ-CHAT-078s four texts, the third naming the lowercased run-state label', () => {
    expect(runControlReason('recovery')).toBe('Recover this session before using run controls.');
    expect(runControlReason('paused')).toBe('Continue the paused run before using run controls.');
    expect(runControlReason('running')).toBe('Run controls are unavailable while run active');
    expect(runControlReason('cancelling')).toBe('Run controls are unavailable while cancelling…');
    expect(runControlReason('idle')).toBe('Start or continue a run to enable run controls.');
  });
  it('gives the run headers own selectors the OPPOSITE rule — enabled only while running', () => {
    expect(runHeaderControlReason('running')).toBeNull();
    expect(runHeaderControlReason('idle')).toBe('Start or continue a run to enable run controls.');
    expect(runHeaderControlReason('paused')).toBe('Continue the paused run before using run controls.');
    // The one text the composer's chips can never reach is the one the header shows most of the time.
    expect(composerChipReason('idle')).toBeNull();
  });
});

describe('composer — REQ-CHAT-007: the two send refusals', () => {
  it('refuses while cancelling with the exact sentence', () => {
    expect(sendRefusal('cancelling', false)).toBe('Wait for the current run to finish cancelling.');
    expect(CANCELLING_REFUSAL).toBe('Wait for the current run to finish cancelling.');
  });
  it('refuses on an unanswered project-setup prompt, conveying both facts', () => {
    expect(sendRefusal('idle', true)).toBe(PROJECT_SETUP_REFUSAL);
    expect(PROJECT_SETUP_REFUSAL).toMatch(/project setup/i);
    expect(PROJECT_SETUP_REFUSAL).toMatch(/nothing else/i);
  });
  it('refuses nothing else', () => {
    for (const state of Object.keys(RUN_STATE_LABELS) as (keyof typeof RUN_STATE_LABELS)[]) {
      if (state !== 'cancelling') expect(sendRefusal(state, false)).toBeNull();
    }
  });
});

describe('composer — REQ-CHAT-004: the four placeholders', () => {
  it('chooses by the first condition that holds, and the four are exhaustive and mutually exclusive', () => {
    expect(composerPlaceholderFor(true, true, true)).toBe(COMPOSER_PLACEHOLDERS.localRun);
    expect(composerPlaceholderFor(true, false, true)).toBe(COMPOSER_PLACEHOLDERS.remoteBusy);
    expect(composerPlaceholderFor(true, false, false)).toBe(COMPOSER_PLACEHOLDERS.session);
    expect(composerPlaceholderFor(false, false, false)).toBe(COMPOSER_PLACEHOLDERS.none);
    expect(new Set(Object.values(COMPOSER_PLACEHOLDERS)).size).toBe(4);
  });
  it('states the four strings the requirement lists, word for word', () => {
    expect(COMPOSER_PLACEHOLDERS.localRun).toBe('Run active — write a follow-up for the next iteration…');
    expect(COMPOSER_PLACEHOLDERS.remoteBusy).toBe('Describe how to continue this session…');
    expect(COMPOSER_PLACEHOLDERS.session).toBe('Message orchestrator — type / for commands, ↑ for history…');
    expect(COMPOSER_PLACEHOLDERS.none).toBe('Describe the outcome you want…');
  });
});

describe('composer — REQ-CHAT-009: the chip labels', () => {
  it('defaults reasoning to high, not to the agent records medium (REQ-MONITOR-048)', () => {
    expect(DEFAULT_REASONING).toBe('high');
    expect(reasoningChipLabel(null)).toBe('reasoning: high');
    expect(reasoningChipLabel('unset')).toBe('reasoning: high');
    expect(reasoningChipLabel('low')).toBe('reasoning: low');
    expect(reasoningChipLabel('medium')).toBe('reasoning: medium');
  });
  it('names no vendor and no model until the options have loaded', () => {
    expect(modelChipLabel(false, [], null)).toBe(MODELS_LOADING_LABEL);
    expect(modelChipLabel(false, ['anthropic/claude'], 'anthropic/claude')).toBe(MODELS_LOADING_LABEL);
    expect(MODELS_LOADING_LABEL).not.toMatch(/claude|gpt|openai|anthropic|gemini/i);
    // Loaded with nothing configured is a different sentence from still loading.
    expect(modelChipLabel(true, [], null)).not.toBe(MODELS_LOADING_LABEL);
    expect(modelChipLabel(true, ['a', 'b'], 'b')).toBe('model: b');
    expect(modelChipLabel(true, ['a', 'b'], 'gone')).toBe('model: a');
  });
});

describe('composer — REQ-CHAT-014 / REQ-SHELL-159: two debounces, not one', () => {
  it('keeps 200 ms and 400 ms distinct (ADR-0042 consequence 5)', () => {
    expect(DRAFT_PUBLISH_MS).toBe(200);
    expect(DRAFT_WRITE_MS).toBe(400);
    expect(DRAFT_PUBLISH_MS).not.toBe(DRAFT_WRITE_MS);
  });
});

describe('composer — REQ-CHAT-010: the geometry and the divider clamp', () => {  it('states the requirements own four figures', () => {
    expect([COMPOSER_DEFAULT_HEIGHT, COMPOSER_MIN_HEIGHT, TRANSCRIPT_MIN_HEIGHT, COMPOSER_WIDGET_MIN_HEIGHT]).toEqual([150, 110, 180, 48]);
  });
  it('never lets the composer fall below its minimum nor the transcript below its own', () => {
    expect(clampComposerHeight(150, 900)).toBe(150);
    expect(clampComposerHeight(40, 900)).toBe(110);
    expect(clampComposerHeight(880, 900)).toBe(900 - 180 - 8);
    // A window too short for both keeps the composer usable rather than producing a negative track.
    expect(clampComposerHeight(150, 200)).toBe(110);
  });
});

describe('composer — REQ-CHAT-016/017: shell history recall', () => {
  const history = ['newest', 'middle', 'oldest'];
  it('saves the draft on the first Up and loads the newest entry', () => {
    const step = historyUp(null, history, 'typed');
    expect(step.text).toBe('newest');
    expect(step.walk).toEqual({ index: 0, saved: 'typed' });
  });
  it('walks older and clamps at the oldest', () => {
    let walk: HistoryWalk | null = historyUp(null, history, 'typed').walk;
    walk = historyUp(walk, history, 'newest').walk;
    expect(walk).toEqual({ index: 1, saved: 'typed' });
    const third = historyUp(walk, history, 'middle');
    expect(third.text).toBe('oldest');
    const clamped = historyUp(third.walk, history, 'oldest');
    expect(clamped.text).toBe('oldest');
    expect(clamped.moved).toBe(false);
  });
  it('walks newer and, past the newest, restores the saved draft and ends the walk', () => {
    const up1 = historyUp(null, history, 'typed');
    const up2 = historyUp(up1.walk, history, up1.text);
    const down1 = historyDown(up2.walk, history, up2.text);
    expect(down1.text).toBe('newest');
    const down2 = historyDown(down1.walk, history, down1.text);
    expect(down2.text).toBe('typed');
    expect(down2.walk).toBeNull();
  });
  it('does nothing with an empty history, and Down does nothing while not walking', () => {
    expect(historyUp(null, [], 'typed')).toEqual({ walk: null, text: 'typed', moved: false });
    expect(historyDown(null, history, 'typed')).toEqual({ walk: null, text: 'typed', moved: false });
  });
});

describe('composer — REQ-CHAT-158: the run-timing indicator', () => {
  const t = (s: number) => new Date(Date.UTC(2026, 8, 7, 10, 0, s)).toISOString();
  it('formats M:SS, and H:MM:SS once the value reaches an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
  it('shows nothing before any run rather than a zero', () => {
    expect(runTimingSeconds({ runStartedAt: null, updatedAt: t(0), busy: false, stepStartedAt: null }, Date.parse(t(30)))).toBeNull();
    expect(runTimingLabel(null)).toBeNull();
    expect(runTimingLabel(0)).toBe('0:00');
  });
  it('counts the step in flight while busy and restarts as the run moves on', () => {
    const now = Date.parse(t(90));
    expect(runTimingSeconds({ runStartedAt: t(0), updatedAt: t(0), busy: true, stepStartedAt: t(60) }, now)).toBe(30);
    expect(runTimingSeconds({ runStartedAt: t(0), updatedAt: t(0), busy: true, stepStartedAt: t(80) }, now)).toBe(10);
    // A step that claims to predate the run counts from the run's own start rather than going backwards.
    expect(runTimingSeconds({ runStartedAt: t(60), updatedAt: t(60), busy: true, stepStartedAt: t(0) }, now)).toBe(30);
  });
  it('freezes at the runs total once it is terminal', () => {
    const frozen = runTimingSeconds({ runStartedAt: t(0), updatedAt: t(45), busy: false, stepStartedAt: t(40) }, Date.parse(t(9999)));
    expect(frozen).toBe(45);
  });
  it('takes the step from the live row where there is one, and from the newest row otherwise', () => {
    expect(modelCallStartedAt([])).toBeNull();
    expect(modelCallStartedAt([{ at: t(1), settled: true }, { at: t(2), settled: true }])).toBe(t(2));
    expect(modelCallStartedAt([{ at: t(1), settled: false }, { at: t(2), settled: true }])).toBe(t(1));
    expect(modelCallStartedAt([{ at: t(1), settled: false }, { at: t(2), settled: false }])).toBe(t(2));
  });
});

describe('composer — PD-CHAT-001 revision 3: the compact strip density', () => {
  it('derives the density from the dock width alone, at the measured thresholds', () => {
    expect(STRIP_TIGHT_BELOW).toBe(900);
    expect(STRIP_NARROW_BELOW).toBe(700);
    expect(stripDensity(901)).toBe('full');
    expect(stripDensity(900)).toBe('full');
    expect(stripDensity(899)).toBe('tight');
    expect(stripDensity(700)).toBe('tight');
    expect(stripDensity(699)).toBe('narrow');
  });
  it('names control and choice on the compact tooltip, and the reason when disabled', () => {
    expect(stripIconTitle('Reasoning effort for the next run', 'Medium', null)).toBe('Reasoning effort for the next run: Medium.');
    expect(stripIconTitle('Model for the next run', 'gpt-4o', 'Run controls are unavailable while run active')).toBe('Run controls are unavailable while run active');
  });
});

describe('composer — the focus after a submission settles (REQ-MONITOR-137, REQ-CHAT-002)', () => {
  // Stand-ins for elements: the rule compares identities and reads nothing else of them.
  const body = { el: 'body' };
  const composer = { el: 'composer' };
  const pill = { el: 'send pill' };
  const steerField = { el: 'the steer dialog\'s field' };
  const at = (now: object | null, atSubmit: object | null) => composerReclaimsFocus({ now, atSubmit, body, composer });

  it('takes the focus back when it is nowhere, in the composer, or where the submission left it', () => {
    expect(at(null, composer)).toBe(true);
    expect(at(body, composer)).toBe(true);
    expect(at(composer, composer)).toBe(true);
    // A click on the send pill, or a Ctrl+Return from another widget (REQ-CHAT-001): nothing took the focus meanwhile.
    expect(at(pill, pill)).toBe(true);
    expect(at(body, pill)).toBe(true);
  });

  it('leaves the focus with a dialog that took it while the send was settling', () => {
    // The defect: "Steer the run" was pressed after the run started and before the start's reply; the dialog's field
    // held the focus, the composer took it back, and the steer's text was typed into the composer behind the modal.
    expect(at(steerField, composer)).toBe(false);
    expect(at(steerField, pill)).toBe(false);
    expect(at(steerField, null)).toBe(false);
  });

  // The composer is stateful and vitest has no DOM, so what pins its use of the rule is its source.
  it('WorkspaceView returns the focus through the rule after every awaited submission, never unconditionally', () => {
    const text = readFileSync(new URL('./WorkspaceView.tsx', import.meta.url), 'utf8');
    const body = (from: string, to: string) => { const i = text.indexOf(from); const j = text.indexOf(to, i); expect(i).toBeGreaterThan(-1); expect(j).toBeGreaterThan(i); return text.slice(i, j); };
    const afterQueue = body('const q = await onQueue(value);', 'return;');
    const afterSubmit = body('r = await onSubmit(value, attachments);', '\n  };');
    const afterSlash = body("if (outcome.kind === 'executed') {", 'return;');
    for (const settled of [afterQueue, afterSubmit, afterSlash]) {
      expect(settled).toContain('reclaimFocus(focusAtSubmit);');
      expect(settled).not.toContain('area.current?.focus()');
    }
    expect(text).toContain('if (composerReclaimsFocus({ now: document.activeElement, atSubmit: focusAtSubmit, body: document.body, composer: area.current })) area.current?.focus();');
  });
});
