import { describe, expect, it } from 'vitest';
import type { ProgressReport } from '@rotaris/contracts';
import { elapsedClock, surveyFigures, surveyProgressOf } from './shape-model.js';

/** R-123 (REQ-ADOPT-026): the survey's progress reports folded into where the survey stands. */
const item = (label: string, position: number): ProgressReport => ({ kind: 'item', phase: 'adopting', label, position, total: 40 });

describe('surveyProgressOf', () => {
  it('starts at the draft and names it while the script reads', () => {
    const p = surveyProgressOf([{ kind: 'phase', phase: 'reading', total: 0 }], false);
    expect(p.stage).toBe('draft');
    expect(p.action).toMatch(/Drafting/);
    expect(surveyFigures(p)).toBe('');
  });

  it('moves to reading when the agent reads, naming the path and counting the step', () => {
    const p = surveyProgressOf([{ kind: 'phase', phase: 'reading', total: 0 }, { kind: 'phase', phase: 'adopting', total: 0 }, item('list docs', 1), item('read docs/a.md', 2)], false);
    expect(p).toMatchObject({ stage: 'read', reads: 2, proposals: 0, step: 2, total: 40, action: 'Reading', path: 'docs/a.md' });
    expect(surveyFigures(p)).toBe('2 reading actions · step 2 of at most 40');
  });

  it('counts proposals out of the first and three repairs, and stays proposing while a repair reads', () => {
    const p = surveyProgressOf([{ kind: 'phase', phase: 'adopting', total: 0 }, item('read a.md', 1), item('propose', 2), item('grep docs', 3), item('propose', 4)], false);
    expect(p).toMatchObject({ stage: 'propose', reads: 2, proposals: 2, action: 'Testing proposal 2 of at most 4', path: undefined });
  });

  it('says it is finishing without claiming the preview, since a finish can be refused', () => {
    expect(surveyProgressOf([item('propose', 1), item('finish', 2)], false)).toMatchObject({ stage: 'propose', action: 'Finishing' });
  });

  it('a survey continued from an answer starts past the draft', () => {
    expect(surveyProgressOf([], true).stage).toBe('propose');
  });

  it('ignores another phase\'s items', () => {
    expect(surveyProgressOf([{ kind: 'item', phase: 'coverage', label: 'read x', position: 1, total: 3 }], false).reads).toBe(0);
  });
});

describe('elapsedClock', () => {
  it('reads m:ss', () => {
    expect(elapsedClock(0)).toBe('0:00');
    expect(elapsedClock(102_400)).toBe('1:42');
    expect(elapsedClock(-5)).toBe('0:00');
  });
});
