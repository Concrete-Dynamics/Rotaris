import { describe, expect, it } from 'vitest';
import { EMPTY_INITIALIZATION_VIEW, EMPTY_RUN_REPORT, type InitializationView, type InitRunReport } from '@rotaris/contracts';
import { PROJECT_INIT_STATES, projectInitCard, projectSidebarSection } from './project-init.js';
import { setupDialogState, setupIntro, setupLog, stepGlyph, taskWord } from '../ProjectSetupDialog.js';

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
