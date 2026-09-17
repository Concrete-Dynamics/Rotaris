import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IMPROVEMENT_ACTIVITY_LABELS, ImprovementActivity } from './ImprovementActivity.js';
import { useShellState } from './shell-state.js';

const markup = (props: Parameters<typeof ImprovementActivity>[0]) => renderToStaticMarkup(createElement(ImprovementActivity, props));

describe('REQ-LIBRARY-125/126 — the two activity indicators (PD-LIBRARY-002 labels them per pass)', () => {
  it('is absent while no analysis runs and present while one does', () => {
    expect(markup({ active: false, pass: 'post_run', placement: 'title-bar' })).toBe('');
    expect(markup({ active: false, pass: 'retrospective', placement: 'run-header' })).toBe('');
    expect(markup({ active: true, pass: 'post_run', placement: 'title-bar' })).toContain('improvement-activity');
  });

  it('carries the post-run label, accessible name and description REQ-LIBRARY-125 fixes', () => {
    const html = markup({ active: true, pass: 'post_run', placement: 'title-bar' });
    // The activity is never conveyed by colour or animation alone (REQ-SHELL-149): the label is in the markup.
    expect(html).toContain('Reviewing run for improvements…');
    expect(html).toContain('aria-label="Improvement analysis status"');
    expect(html).toContain('Reviewing the completed run for improvements in the background. You can continue working.');
    expect(html).toContain('role="status"');
  });

  it("gives the retrospective its own label and says what it is reading, on both surfaces", () => {
    const title = markup({ active: true, pass: 'retrospective', placement: 'title-bar' });
    const header = markup({ active: true, pass: 'retrospective', placement: 'run-header' });
    expect(title).toContain(IMPROVEMENT_ACTIVITY_LABELS.retrospective);
    expect(header).toContain(IMPROVEMENT_ACTIVITY_LABELS.retrospective);
    expect(IMPROVEMENT_ACTIVITY_LABELS.retrospective).not.toBe(IMPROVEMENT_ACTIVITY_LABELS.post_run);
    // The run header's description conveys the same three facts in its own wording (REQ-LIBRARY-125).
    for (const fact of ['reviewed for improvements', 'in the background', 'keep working']) expect(header).toContain(fact);
  });

  it('the pulse is marked so the reduced-motion rule can collapse it (REQ-SHELL-135)', () => {
    expect(markup({ active: true, pass: 'post_run', placement: 'run-header' })).toContain('is-pulsing');
  });
});

describe('the shell store carries the activity for both surfaces', () => {
  it('starts hidden, takes the pass the coordinator published, and is cleared by a publication with none active', () => {
    expect(useShellState.getState().improvementAnalysis).toEqual({ active: false, pass: 'post_run' });
    useShellState.getState().setImprovementAnalysis({ active: true, pass: 'retrospective' });
    expect(useShellState.getState().improvementAnalysis).toEqual({ active: true, pass: 'retrospective' });
    // REQ-LIBRARY-127: shutdown's last publication is what hides them, and it is an ordinary one.
    useShellState.getState().setImprovementAnalysis({ active: false, pass: 'retrospective' });
    expect(useShellState.getState().improvementAnalysis.active).toBe(false);
    useShellState.getState().setImprovementAnalysis({ active: false, pass: 'post_run' });
  });
});
