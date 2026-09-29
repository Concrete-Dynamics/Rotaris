import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EMPTY_INITIALIZATION_VIEW, EMPTY_RUN_REPORT, type InitializationStateView, type InitializationView, type InitRunReport } from '@rotaris/contracts';
import { PROJECT_INIT_STATES, projectInitCard, projectSidebarSection } from './project-init.js';
import { dialogReport, ProjectSetupDialog, setupDialogState, setupIntro, setupLog, setupPromptDue, stepGlyph, taskWord } from '../ProjectSetupDialog.js';

const LABELS = { a: 'Task A', b: 'Task B', 'code-intelligence-setup': 'Code intelligence project setup' };
const view = (over: Partial<InitializationView> = {}): InitializationView => ({ ...EMPTY_INITIALIZATION_VIEW, ...over });

/** REQ-WORKSPACE-114: exactly one of six, chosen in a fixed order. */
describe('the Settings Project initialization card', () => {
  it('states the six and their order', () => {
    expect(PROJECT_INIT_STATES).toEqual(['running', 'failed', 'pending', 'deferred', 'completed', 'empty']);
  });

  it('shows running above everything, with an indeterminate indicator and a disabled button', () => {
    const card = projectInitCard(view({ running: true, pending: ['a'], lastError: 'boom', skipped: ['b'] }), LABELS);
    expect(card.state).toBe('running');
    expect(card.headline).toBe('Initializing project…');
    expect(card.busy).toBe(true);
    expect(card.button).toBe('Initializing…');
    expect(card.buttonDisabled).toBe(true);
  });

  it('shows failed above pending, naming what can be run again', () => {
    const card = projectInitCard(view({ lastError: 'Indexing failed.', pending: ['a'], skipped: ['b'] }), LABELS);
    expect(card.state).toBe('failed');
    expect(card.headline).toBe('Initialization failed');
    expect(card.lines[0]).toBe('Indexing failed. Nothing was recorded, so Task A, Task B can be run again.');
    expect(card.button).toBe('Retry initialization');
    expect(card.buttonDisabled).toBe(false);
  });

  it('shows pending above deferred', () => {
    const card = projectInitCard(view({ pending: ['a'], skipped: ['b'] }), LABELS);
    expect(card.state).toBe('pending');
    expect(card.lines).toEqual(['Not run yet: Task A.']);
  });

  it('shows deferred with the completed line before it when something completed', () => {
    const plain = projectInitCard(view({ skipped: ['b'], lastRun: '2026-09-15T10:00:00.000+00:00' }), LABELS);
    expect(plain.state).toBe('deferred');
    expect(plain.lines).toEqual(['You skipped Task B. Run them whenever you want.']);
    const withCompleted = projectInitCard(view({ skipped: ['b'], completed: ['a'], lastRun: '2026-09-15T10:00:00.000+00:00' }), LABELS);
    expect(withCompleted.lines).toEqual(['Completed: Task A on 2026-09-15.', 'You skipped Task B. Run them whenever you want.']);
  });

  it('shows completed with the date and REQ-WORKSPACE-101\'s classification sentence, and disables the button with its reason', () => {
    const card = projectInitCard(view({ completed: ['a'], lastRun: '2026-09-15T10:00:00.000+00:00', classification: 'non-code' }), LABELS);
    expect(card.state).toBe('completed');
    expect(card.headline).toBe('Project initialized');
    expect(card.lines[0]).toContain('2026-09-15');
    expect(card.lines[0]).toMatch(/every initialization task/i);
    expect(card.lines[1]).toBe('No code memories were created — this workspace is a documentation-only project.');
    expect(card.buttonDisabled).toBe(true);
    expect(card.buttonReason).toBe('Every initialization task for this workspace is already resolved.');
  });

  it('shows the code classification sentence for a code workspace', () => {
    const card = projectInitCard(view({ completed: ['a'], lastRun: '2026-09-15T10:00:00.000+00:00', classification: 'code' }), LABELS);
    expect(card.lines[1]).toBe("Code memories were created from this workspace's sources.");
  });

  it('shows empty when nothing applies, naming where a task comes from', () => {
    const card = projectInitCard(view(), LABELS);
    expect(card.state).toBe('empty');
    expect(card.headline).toBe('Nothing to initialize yet');
    expect(card.lines[0]).toContain('MCP Servers');
    expect(card.buttonDisabled).toBe(true);
  });

  it('displays an id no task claims as itself', () => {
    const card = projectInitCard(view({ pending: ['ghost'] }), LABELS);
    expect(card.lines[0]).toBe('Not run yet: ghost.');
  });
});

/** REQ-WORKSPACE-113. */
describe('the sidebar Project section', () => {
  it('is hidden when everything is resolved or nothing applies', () => {
    expect(projectSidebarSection(view(), LABELS).hidden).toBe(true);
    expect(projectSidebarSection(view({ completed: ['a'] }), LABELS).hidden).toBe(true);
  });

  it('offers the dialog for pending and for skipped work alike', () => {
    expect(projectSidebarSection(view({ pending: ['a'] }), LABELS)).toMatchObject({ hidden: false, label: 'Initialize Project…', disabled: false, hint: 'Not run yet: Task A.' });
    expect(projectSidebarSection(view({ skipped: ['b'] }), LABELS).hint).toBe('Not run yet: Task B.');
  });

  it('disables itself while a run is under way', () => {
    expect(projectSidebarSection(view({ pending: ['a'], running: true }), LABELS)).toMatchObject({ hidden: false, label: 'Initializing…', disabled: true, hint: 'Running the pending setup tasks.' });
  });

  it('appends a recorded failure to the hint', () => {
    expect(projectSidebarSection(view({ pending: ['a'], lastError: 'it broke' }), LABELS).hint).toBe('Not run yet: Task A. Last run failed: it broke');
  });
});

/** REQ-WORKSPACE-106/108/109. */
describe('the project setup dialog', () => {
  const report = (over: Partial<InitRunReport> = {}): InitRunReport => ({ ...EMPTY_RUN_REPORT, ...over });

  it('states the intro in the singular and the plural, and the empty form', () => {
    expect(setupIntro(1)).toContain('1 one-time setup task can run');
    expect(setupIntro(2)).toContain('2 one-time setup tasks can run');
    expect(setupIntro(1)).toContain('Settings › Project');
    expect(setupIntro(0)).toBe('This workspace has no setup task left to run.');
  });

  it('gives each task a live status word', () => {
    expect(taskWord('a', report())).toBe('Pending');
    expect(taskWord('a', report({ current: 'a', running: true }))).toBe('Running');
    expect(taskWord('a', report({ tasks: [{ id: 'a', label: 'Task A', status: 'success', steps: [], error: '', retryable: false, summary: 'ok' }] }))).toBe('Done');
    expect(taskWord('a', report({ tasks: [{ id: 'a', label: 'Task A', status: 'skipped', steps: [], error: '', retryable: false, summary: '' }] }))).toBe('Skipped');
    expect(taskWord('a', report({ tasks: [{ id: 'a', label: 'Task A', status: 'failure', steps: [], error: 'no', retryable: true, summary: '' }] }))).toBe('Failed');
  });

  it('maps the four glyphs, the open vocabulary included', () => {
    expect(stepGlyph('succeeded')).toBe('✓');
    expect(stepGlyph('skipped-no-code')).toBe('–');
    expect(stepGlyph('failed')).toBe('✕');
    expect(stepGlyph('whatever')).toBe('•');
  });

  it('writes the log seeded, with a heading per task, an indented line per step, and an outcome line', () => {
    const r = report({
      running: true,
      current: 'b', currentLabel: 'Task B', currentSteps: [{ name: 'Project configuration', status: 'succeeded', detail: 'project file already exists; left as is' }],
      tasks: [{
        id: 'a', label: 'Task A', status: 'success', error: '', retryable: false, summary: 'All good.',
        steps: [{ name: 'Symbol indexing', status: 'skipped-no-code', detail: 'No source files found, so there are no symbols to index.' }],
      }],
    });
    expect(setupLog(r).split('\n')).toEqual([
      'Setup started. Each step appears here as it finishes.',
      '▶ Task A',
      '  – Symbol indexing — skipped-no-code: No source files found, so there are no symbols to index.',
      '  ✓ Task A: All good.',
      '▶ Task B',
      '  ✓ Project configuration — succeeded: project file already exists; left as is',
    ]);
  });

  it('shows a failed task\'s error rather than its summary on the outcome line', () => {
    const r = report({ tasks: [{ id: 'a', label: 'Task A', status: 'failure', steps: [], error: 'Indexing died: exit 1', retryable: true, summary: 'Try again.' }] });
    expect(setupLog(r)).toContain('  ✕ Task A: Indexing died: exit 1');
  });

  /**
   * The defect the screenshot found: a run that reported every task it attempted is not the same as
   * everything the dialog offered being resolved. Taken from the report alone, the dialog headlined
   * "Project setup finished" over a card reading "Pending" and offered only Close.
   */
  it('stays in the prompt state while a listed task is still pending', () => {
    const finished = report({ outcome: 'reported', tasks: [{ id: 'bg', label: 'Background', status: 'success', steps: [], error: '', retryable: false, summary: 'done' }] });
    expect(setupDialogState(finished, 0)).toBe('done');
    expect(setupDialogState(finished, 1)).toBe('prompt');
  });

  it('takes its four states from the report', () => {
    expect(setupDialogState(report())).toBe('prompt');
    expect(setupDialogState(report({ running: true }))).toBe('running');
    expect(setupDialogState(report({ outcome: 'reported', tasks: [{ id: 'a', label: 'A', status: 'success', steps: [], error: '', retryable: false, summary: '' }] }))).toBe('done');
    expect(setupDialogState(report({ outcome: 'reported', tasks: [{ id: 'a', label: 'A', status: 'failure', steps: [], error: 'x', retryable: true, summary: '' }] }))).toBe('error');
    expect(setupDialogState(report({ outcome: 'failed' }))).toBe('error');
    // REQ-WORKSPACE-093: a cancellation leaves the task exactly as a failure would, so the dialog does
    // not headline a run that was stopped as "Project setup finished".
    expect(setupDialogState(report({ outcome: 'cancelled' }))).toBe('error');
  });
});

/**
 * `docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`: a run the resolution started for background
 * tasks is not the dialog's. Taking the one shared report whatever its run, the dialog switched to "running" under the
 * user's own Escape, or ignored Escape so no decision was recorded, and the window lifted the composer gate while the
 * consent task was unanswered.
 */
describe('the project setup dialog beside a background run (REQ-WORKSPACE-103/107/110, OQ-110)', () => {
  const live: InitRunReport = {
    ...EMPTY_RUN_REPORT, running: true, current: 'code-intelligence-setup', currentLabel: 'Code intelligence project setup',
    currentSteps: [{ name: 'Project configuration', status: 'succeeded', detail: '' }],
  };
  const state = (over: Partial<InitializationStateView> = {}, view: Partial<InitializationView> = {}): InitializationStateView => ({
    view: { ...EMPTY_INITIALIZATION_VIEW, pending: ['code-intelligence-setup', 'verification-consent'], consentPending: ['verification-consent'], running: true, ...view },
    labels: { 'code-intelligence-setup': 'Code intelligence project setup', 'verification-consent': 'Verification consent task' },
    descriptions: {},
    report: live,
    resolutionFailed: false,
    backgroundRun: true,
    ...over,
  });
  const draw = (s: InitializationStateView) => renderToStaticMarkup(createElement(ProjectSetupDialog, {
    state: s, auto: true, onInitialize: async () => ({ ok: true as const }), onSkip: async () => ({ ok: true as const }), onClose: () => undefined,
  }));

  it('REQ-WORKSPACE-103: draws no report for a background run the user has not asked to see', () => {
    expect(dialogReport(state(), false)).toEqual(EMPTY_RUN_REPORT);
    expect(setupDialogState(dialogReport(state(), false), 2)).toBe('prompt');
    // A failed background run reaches the banner, not the dialog's error state.
    const failed = state({ report: { ...EMPTY_RUN_REPORT, outcome: 'reported', tasks: [{ id: 'code-intelligence-setup', label: 'Code intelligence project setup', status: 'failure', steps: [], error: 'x', retryable: true, summary: '' }] } }, { running: false });
    expect(setupDialogState(dialogReport(failed, false), 2)).toBe('prompt');
  });

  it('REQ-WORKSPACE-110: draws the background run once Initialize has been pressed, and a user-started run always', () => {
    expect(dialogReport(state(), true)).toBe(live);
    expect(setupDialogState(dialogReport(state(), true), 1)).toBe('running');
    expect(dialogReport(state({ backgroundRun: false }), false)).toBe(live);
  });

  it('REQ-WORKSPACE-106/107: stays in its prompt state with Skip live, the intro drawn and every card Pending', () => {
    const html = draw(state());
    expect(html).toContain('data-setup-state="prompt"');
    expect(html).toContain('data-testid="project-setup-intro"');
    expect(html).toContain('2 one-time setup tasks can run');
    expect(html).not.toContain('data-setup-word="Running"');
    expect(html).not.toContain('data-testid="project-setup-log"');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*data-action="setup-skip"/);
    expect(html).not.toContain('Initializing…');
  });

  it('REQ-WORKSPACE-105/112: a background run in progress neither withdraws the prompt nor lifts the gate; a user-started one does', () => {
    expect(setupPromptDue(state())).toBe(true);
    expect(setupPromptDue(state({ backgroundRun: false }))).toBe(false);
    expect(setupPromptDue(state({ report: EMPTY_RUN_REPORT, backgroundRun: false }, { running: false }))).toBe(true);
    expect(setupPromptDue(state({}, { consentPending: [] }))).toBe(false);
    expect(setupPromptDue(null)).toBe(false);
  });
});
