import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESENTATION_STATUSES } from '@rotaris/contracts';
import {
  CANCELLING_REFUSAL, CHIPS_DISABLED_STATES, CHIPS_ENABLED_STATES, clampComposerHeight, composerChipReason, composerPlaceholderFor, composerReclaimsFocus,
  COMPOSER_DEFAULT_HEIGHT, COMPOSER_MIN_HEIGHT, COMPOSER_PLACEHOLDERS, COMPOSER_WIDGET_MIN_HEIGHT, DEFAULT_REASONING, DRAFT_PUBLISH_MS,
  DRAFT_WRITE_MS, formatDuration, historyDown, historyUp, modelCallStartedAt, modelChipLabel, MODELS_LOADING_LABEL, pausePendingAfter,
  PROJECT_SETUP_REFUSAL, reasoningChipLabel, runControlReason, runHeaderControlReason, RUN_STATE_LABELS, runStateOf, runTimingLabel,
  runTimingSeconds, sendRefusal, statusStripModeItem, statusStripSandboxItem, STRIP_BACKGROUND_MIN_WIDTH, STRIP_NAMES, STRIP_PATH_MIN_WIDTH, stripCircuitBreakerArmed, stripCostText, stripItems, stripModelItem, stripWidthBand,
  stripTokensText, TRANSCRIPT_MIN_HEIGHT, type HistoryWalk, type StripFacts, type StripItem,
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

  it('an unconfined record and no focused session draw nothing', () => {
    expect(statusStripSandboxItem({ sandboxed: false, sandboxBackend: '' })).toBeNull();
    // A stale backend beside `sandboxed: false` is never drawn: the flag decides.
    expect(statusStripSandboxItem({ sandboxed: false, sandboxBackend: 'bubblewrap' })).toBeNull();
    // No session focused — where a refused START leaves the window, since it leaves no session (REQ-SANDBOX-120).
    expect(statusStripSandboxItem(null)).toBeNull();
  });

  it('REQ-NOTIFY-061: a confined session whose next run was refused at the confinement gate stops drawing the item, and draws it again once a confined run starts', () => {
    // The records the engine publishes, in order (sandbox-record.test.ts pins the engine's half): the confined run, the
    // refusal at the gate (`refusedAtStart`: no longer sandboxed, no backend), the confined run that started after it.
    const published = [
      { sandboxed: true, sandboxBackend: 'bubblewrap' },
      { sandboxed: false, sandboxBackend: '' },
      { sandboxed: true, sandboxBackend: 'bubblewrap' },
    ];
    expect(published.map((record) => statusStripSandboxItem(record)?.text ?? null)).toEqual(['sandbox: bubblewrap', null, 'sandbox: bubblewrap']);
  });

  it('re-binds with focus: the item is the focused record\'s, so switching between a confined and an unconfined session moves it (REQ-MONITOR-257, REQ-NOTIFY-030)', () => {
    const confined = { sandboxed: true, sandboxBackend: 'bubblewrap' };
    const open = { sandboxed: false, sandboxBackend: '' };
    expect([confined, open, confined].map((focused) => statusStripSandboxItem(focused)?.text ?? null)).toEqual(['sandbox: bubblewrap', null, 'sandbox: bubblewrap']);
  });
});

/*
 * REQ-SHELL-038/039/041/043/044/045/047 with REQ-TOOLS-131/184 and OQ-184's build reading: the strip's items, their order,
 * names, tooltips and the two thresholds. Before the repair of
 * docs/defects/fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md the strip drew the
 * run's state, the theme's name, the child services and the replica counters, none of the workspace path, model, tokens or
 * cost, the literal `workspace-scoped` whatever the opt-out said, and `bg sessions: N`, at every width.
 */
describe('REQ-SHELL-038/047: the status strip, item by item', () => {
  const opened: string[] = [];
  const facts = (over: Partial<StripFacts> = {}): StripFacts => ({
    workspace: { label: '~/work/rotaris', path: '/home/u/work/rotaris', open: () => { opened.push('folder'); } },
    branch: { text: 'main', suffix: ' ↑1', title: 'Branch this workspace is on: main, 1 commit ahead.', state: 'branch' },
    safety: { circuitBreakerArmed: true, unsavedSettings: false, outsideWorkspace: false, mode: 'mode: ask' },
    sandbox: statusStripSandboxItem({ sandboxed: true, sandboxBackend: 'bubblewrap' }),
    model: { name: 'scripted', label: 'model: scripted' },
    tokens: 12480,
    cost: '0.0042',
    backgroundSessions: 3,
    ...over,
  });
  const texts = (items: readonly StripItem[]) => items.map((i) => (i.kind === 'spacer' ? '|' : `${i.text}${i.kind === 'text' ? i.suffix ?? '' : ''}`));
  const named = (items: readonly StripItem[], name: string) => items.filter((i): i is Exclude<StripItem, { kind: 'spacer' }> => i.kind !== 'spacer' && i.name === name);

  it('draws REQ-SHELL-038\'s items left to right, with the sandbox indicator after the file-access flag (OQ-184), at full width', () => {
    expect(texts(stripItems(1400, facts()))).toEqual([
      '~/work/rotaris', 'main ↑1', '|', '● CB armed', 'redaction: always on', 'workspace-scoped', 'sandbox: bubblewrap', 'mode: ask',
      'model: scripted', '12,480 tok', '0.0042 cost', '3 bg sessions',
    ]);
    // Nothing REQ-SHELL-038 does not list: no run state, theme, child service or replica counter.
    expect(texts(stripItems(1400, facts())).some((t) => /^run |rotaris-dim|svc:|applied \d/.test(t))).toBe(false);
  });

  it('shortens exactly the path link and the branch item from the middle (REQ-WORKSPACE-149 rule 2), the ahead marker never shortened', () => {
    const items = stripItems(1400, facts());
    const middle = items.flatMap((i) => (i.kind !== 'spacer' && i.middle === true ? [i.testId] : []));
    expect(middle).toEqual(['strip-workspace', 'strip-branch']);
    const branch = items.find((i) => i.kind === 'text' && i.testId === 'strip-branch');
    expect(branch).toMatchObject({ text: 'main', suffix: ' ↑1' });
    // The tooltip and the description carry the full path, however the label is shortened.
    expect(items.find((i) => i.kind === 'link')).toMatchObject({ text: '~/work/rotaris', title: 'Workspace folder: /home/u/work/rotaris. Opens it in your file manager.' });
  });

  it('never shortens the branch item\'s state words — only a branch name is shortened from the middle (REQ-GIT-161, OQ-193)', () => {
    // Until the 2026-10-03 repair round `middle` was set in every state, and a long path beside the item cut
    // `no git repository` to `no …ry`, which conveys no state (REQ-GIT-161 requires each conveyed and distinguishable).
    const words = [
      { text: 'no git repository', title: 'This folder is not a Git repository.', state: 'none' },
      { text: 'no git', title: 'Git is not installed or not on PATH.', state: 'none' },
      { text: 'detached HEAD', title: 'This workspace is on no branch (detached HEAD).', state: 'detached' },
      { text: '—', title: 'Branch this workspace is on: not read yet', state: 'unknown' },
    ];
    for (const branch of words) {
      const item = stripItems(1400, facts({ branch })).find((i) => i.kind === 'text' && i.testId === 'strip-branch');
      expect(item).toMatchObject({ text: branch.text, state: branch.state });
      expect(item).not.toHaveProperty('middle');
    }
    const named = stripItems(1400, facts()).find((i) => i.kind === 'text' && i.testId === 'strip-branch');
    expect(named).toMatchObject({ text: 'main', middle: true });
  });

  it('draws the branch icon before a branch name, and only there (REQ-SHELL-042, REQ-WORKSPACE-020)', () => {
    const branchOf = (items: readonly StripItem[]) => items.find((i) => i.kind === 'text' && i.testId === 'strip-branch');
    expect(branchOf(stripItems(1400, facts()))).toMatchObject({ icon: 'ph-git-branch', text: 'main', suffix: ' ↑1', title: 'Branch this workspace is on: main, 1 commit ahead.' });
    // The detached, non-repository and unread states are words, not a branch name (REQ-GIT-161's reading, OQ-193): no icon.
    for (const state of ['detached', 'none', 'unknown']) {
      expect(branchOf(stripItems(1400, facts({ branch: { text: 'detached HEAD', title: 'This workspace is on no branch (detached HEAD).', state } })))).not.toHaveProperty('icon');
    }
    // Only the branch item carries an icon.
    expect(stripItems(1400, facts()).filter((i) => i.kind === 'text' && i.icon !== undefined).map((i) => i.kind === 'text' && i.testId)).toEqual(['strip-branch']);
  });

  it('gives every item REQ-SHELL-038\'s accessible name, and exactly the workspace path is a link (REQ-SHELL-039/040)', () => {
    const items = stripItems(1400, facts());
    const names = items.flatMap((i) => (i.kind === 'spacer' ? [] : [i.name]));
    expect(new Set(names)).toEqual(new Set([STRIP_NAMES.workspace, STRIP_NAMES.branch, STRIP_NAMES.safety, 'Confinement backend', STRIP_NAMES.model, STRIP_NAMES.tokens, STRIP_NAMES.cost, STRIP_NAMES.background]));
    const links = items.filter((i) => i.kind === 'link');
    expect(links.map((l) => l.kind === 'link' && l.testId)).toEqual(['strip-workspace']);
    const link = links[0];
    if (link?.kind !== 'link') throw new Error('no link');
    expect(link.title).toBe('Workspace folder: /home/u/work/rotaris. Opens it in your file manager.');
    link.onActivate();
    expect(opened).toEqual(['folder']);
  });

  it('REQ-SHELL-047: hides the path below 1180 px and the background count below 1080 px, and nothing else', () => {
    const at = (w: number) => texts(stripItems(w, facts()));
    expect(STRIP_PATH_MIN_WIDTH).toBe(1180);
    expect(STRIP_BACKGROUND_MIN_WIDTH).toBe(1080);
    expect(at(1180)).toContain('~/work/rotaris');
    expect(at(1179)).not.toContain('~/work/rotaris');
    expect(at(1179)).toContain('3 bg sessions');
    expect(at(1080)).toContain('3 bg sessions');
    expect(at(1079)).not.toContain('3 bg sessions');
    // The band a renderer memoises on answers the same items as every width inside it, and changes only at a threshold.
    for (const w of [1000, 1079, 1080, 1179, 1180, 1400]) expect(at(stripWidthBand(w))).toEqual(at(w));
    expect([1000, 1079, 1080, 1179, 1180, 1400].map(stripWidthBand)).toEqual([0, 0, 1080, 1080, 1180, 1180]);
    // At REQ-MONITOR-051's 1000 px floor, every other item stays.
    expect(at(1000)).toEqual(['main ↑1', '|', '● CB armed', 'redaction: always on', 'workspace-scoped', 'sandbox: bubblewrap', 'mode: ask', 'model: scripted', '12,480 tok', '0.0042 cost']);
  });

  it('REQ-SHELL-041 / REQ-TOOLS-131: the safety flags in their fixed order, each tooltip "{short form} — {explanation}"', () => {
    const flags = named(stripItems(1400, facts({ safety: { circuitBreakerArmed: true, unsavedSettings: true, outsideWorkspace: true, mode: 'mode: autonomous' } })), STRIP_NAMES.safety);
    expect(flags.map((f) => f.text)).toEqual(['● CB armed', 'redaction: always on', 'unsaved settings', 'outside-workspace!', 'mode: autonomous']);
    for (const f of flags) expect(f.title.startsWith(`${f.text} — `)).toBe(true);
    expect(flags[0]?.title).toBe('● CB armed — Circuit breaker: Rotaris stops a run that keeps repeating a failing step.');
    expect(flags[1]?.title).toBe('redaction: always on — Secret redaction: anything that looks like a credential is masked before it reaches a model or the transcript.');
    // REQ-WORKSPACE-022's fixed pair, the opt-out (`runtime.allow_outside_workspace`, REQ-TOOLS-131) deciding which.
    expect(flags[2]?.title).toBe('unsaved settings — The Settings view is holding edits that have not been saved; runs keep using the last saved values until they are saved.');
    expect(flags[3]?.title).toBe('outside-workspace! — File access: agents may read and write outside this workspace folder.');
    expect(flags[4]?.title).toBe('mode: autonomous — Permission mode autonomous: how much agents may do without asking. Change it under the composer or in Settings → Runtime.');
    // The opt-out off: `workspace-scoped`, and exactly one of the two is always present; no breaker, no unsaved edits, no flag for them.
    const confined = named(stripItems(1400, facts({ safety: { circuitBreakerArmed: false, unsavedSettings: false, outsideWorkspace: false, mode: 'mode: ask' } })), STRIP_NAMES.safety).map((f) => f.text);
    expect(confined).toEqual(['redaction: always on', 'workspace-scoped', 'mode: ask']);
    const scoped = named(stripItems(1400, facts()), STRIP_NAMES.safety).find((f) => f.text === 'workspace-scoped');
    expect(scoped?.title).toBe('workspace-scoped — File access: agents may read and write inside this workspace folder only.');
  });

  it('REQ-SHELL-043/044/045: the model at full strength, the tokens grouped, the cost by the money rule and absent until there is one', () => {
    const items = stripItems(1400, facts());
    const model = named(items, STRIP_NAMES.model)[0];
    expect(model?.kind === 'text' && model.strong).toBe(true);
    expect(model?.title).toBe('Runs started from this window use scripted. Change it in the composer or in Settings → Models.');
    expect(stripModelItem('model: gpt-x')).toEqual({ name: 'gpt-x', label: 'model: gpt-x' });
    expect(stripTokensText(0)).toBe('0 tok');
    expect(stripTokensText(12480)).toBe('12,480 tok');
    expect(stripTokensText(1234567)).toBe('1,234,567 tok');
    expect(stripCostText(null)).toBeNull();
    expect(stripCostText('n/a')).toBe('n/a cost');
    expect(stripCostText('0')).toBe('0.00 cost');
    expect(stripCostText('0.00001')).toBe('< 0.0001 cost');
    expect(stripCostText('1.005')).toBe('1.01 cost');
    expect(named(items, STRIP_NAMES.cost)[0]?.title).toBe('Cost of this workspace\'s runs so far: 0.0042. Reported by the model provider; an unpriced model reads n/a.');
    expect(named(stripItems(1400, facts({ cost: null })), STRIP_NAMES.cost)).toEqual([]);
    // REQ-SHELL-044: zero is a known value — `0 tok` and `0 bg sessions` are drawn; the noun agrees with the count.
    const zero = texts(stripItems(1400, facts({ tokens: 0, backgroundSessions: 0 })));
    expect(zero).toContain('0 tok');
    expect(zero).toContain('0 bg sessions');
    expect(texts(stripItems(1400, facts({ backgroundSessions: 1 })))).toContain('1 bg session');
  });

  it('REQ-SHELL-041 / REQ-TOOLS-184: `● CB armed` follows the saved configuration, the boot answer only until it arrives, the host override always', () => {
    // The snapshot decides once it is here, whichever way the boot answer went: a breaker turned off in Settings disarms the flag.
    expect(stripCircuitBreakerArmed(false, true, false)).toBe(false);
    expect(stripCircuitBreakerArmed(true, false, false)).toBe(true);
    // Before the first snapshot, `shell.hello`'s answer stands.
    expect(stripCircuitBreakerArmed(undefined, true, false)).toBe(true);
    expect(stripCircuitBreakerArmed(undefined, false, false)).toBe(false);
    // `ROTARIS_CIRCUIT_BREAKER=off` disarms every run's supervisor, so the flag never claims the breaker then.
    expect(stripCircuitBreakerArmed(true, true, true)).toBe(false);
    const flags = (armed: boolean) => named(stripItems(1400, facts({ safety: { circuitBreakerArmed: armed, unsavedSettings: false, outsideWorkspace: false, mode: 'mode: ask' } })), STRIP_NAMES.safety).map((f) => f.text);
    expect(flags(stripCircuitBreakerArmed(false, true, false))).not.toContain('● CB armed');
  });

  it('draws no workspace link with no workspace open, and no sandbox item for an unconfined session', () => {
    const items = texts(stripItems(1400, facts({ workspace: null, sandbox: null })));
    expect(items[0]).toBe('main ↑1');
    expect(items).not.toContain('sandbox: bubblewrap');
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
