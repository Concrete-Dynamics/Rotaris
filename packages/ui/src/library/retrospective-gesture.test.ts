import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { OVERVIEW_PROPOSALS_HINT } from '../OverviewView.js';
import { useShellState } from '../shell-state.js';
import {
  PROPOSALS_EMPTY_LABEL, PROPOSALS_NOTE, RETROSPECTIVE_BUSY_REASON, RETROSPECTIVE_DESCRIPTION, RetrospectiveGestureButton, retrospectivePendingOf,
} from './ProposalsTab.js';

/**
 * PD-LIBRARY-002 revision 2 (OQ-236). Clause (e): the retrospective's start gesture rests only while a retrospective
 * is queued or running in the window's workspace — never because a post-run analysis runs, which a press queues behind
 * (REQ-LIBRARY-123, REQ-LIBRARY-125). Clauses (f) and (g): the texts that name where proposals come from name both
 * sources. Both surfaces draw the one component, so each is read here through it and through its source.
 */
/** The gesture as the store's current state draws it: the selector the component reads, then the button for that answer. */
const gesture = (testId: string) => renderToStaticMarkup(createElement(RetrospectiveGestureButton, { className: 'btn btn-link', testId, pending: retrospectivePendingOf(useShellState.getState()) }));
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the retrospective start gesture (PD-LIBRARY-002 revision 2, clause (e))', () => {
  afterEach(() => { useShellState.getState().setImprovementAnalysis({ active: false, pass: 'post_run' }); });

  it('stays available while a post-run analysis runs, and says what it does', () => {
    useShellState.getState().setImprovementAnalysis({ active: true, pass: 'post_run', retrospectivePending: false });
    const html = gesture('library-retrospective');
    expect(html).not.toMatch(/\sdisabled=""/);
    expect(html).toContain('aria-disabled="false"');
    expect(html).toContain(`title="${RETROSPECTIVE_DESCRIPTION.replace(/'/g, '&#x27;')}"`);
  });

  it('rests, with its reason, only while a retrospective is queued or running in this workspace', () => {
    useShellState.getState().setImprovementAnalysis({ active: true, pass: 'post_run', retrospectivePending: true });
    const html = gesture('overview-retrospective');
    expect(html).toMatch(/\sdisabled=""/);
    expect(html).toContain('aria-disabled="true"');
    expect(RETROSPECTIVE_BUSY_REASON).toBe('A retrospective is already queued or running.');
    expect(html).toContain(`title="${RETROSPECTIVE_BUSY_REASON}"`);
  });

  it('is the one component both surfaces draw, so neither rests on `active` alone', () => {
    for (const [path, testId] of [['./ProposalsTab.tsx', 'library-retrospective'], ['../OverviewView.tsx', 'overview-retrospective']] as const) {
      const text = source(path);
      expect(text, path).toContain(`<RetrospectiveGesture className=`);
      expect(text, path).toContain(`testId="${testId}"`);
      expect(text, path).not.toMatch(/disabled=\{analysisRunning\}/);
    }
  });
});

describe('the texts that say where proposals come from (PD-LIBRARY-002 revision 2, clauses (f) and (g))', () => {
  it('REQ-LIBRARY-109 as narrowed: the Library card note and empty label name the retrospective too', () => {
    expect(PROPOSALS_NOTE).toBe("Evidence-backed suggestions from the improvement collector after each run, and from retrospectives over this workspace's history.");
    expect(PROPOSALS_EMPTY_LABEL).toBe("No proposals yet. They appear here after a run's improvement collector finds signals, or after a retrospective over this workspace's history.");
    const text = source('./ProposalsTab.tsx');
    expect(text).toContain('{PROPOSALS_NOTE}');
    expect(text).toContain('{PROPOSALS_EMPTY_LABEL}');
  });

  it('REQ-LIBRARY-130 as narrowed: the Overview card hint', () => {
    expect(OVERVIEW_PROPOSALS_HINT).toBe("Run improvement analysis, or a retrospective over this workspace's history, to produce reviewable suggestions.");
    expect(source('../OverviewView.tsx')).toContain('{OVERVIEW_PROPOSALS_HINT}');
  });
});
