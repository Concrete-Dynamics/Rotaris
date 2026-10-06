import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TaskPlan } from '@rotaris/contracts';
import { TodoPane, todoCountLabel } from './TodoPane.js';

describe('todo pane labels (REQ-CHAT-085, REQ-CHAT-168)', () => {
  it('uses grammatical singular and plural counts', () => {
    expect(todoCountLabel(0, 0)).toBe('0 of 0 tasks done');
    expect(todoCountLabel(1, 1)).toBe('1 of 1 task done');
    expect(todoCountLabel(1, 2)).toBe('1 of 2 tasks done');
  });
});

/**
 * Live-run finding G5 (`docs/defects/fixed/the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md`):
 * the count drawn beside the header's "Completed" is the coordinator's own plan as the engine projects it (REQ-CHAT-088's
 * agent source, `projectSessionTodos`), every item counted, so a run the record calls completed reads every task done only
 * when that plan is. The engine pins the projection (`coordinator-plan.test.ts`); this pins what the pane draws from it.
 */
describe('the Todo pane counts the coordinator\'s own plan it is given (REQ-CHAT-088, REQ-ORCH-029)', () => {
  const agentPlan = (states: readonly TaskPlan['phases'][number]['tasks'][number]['state'][]): TaskPlan => ({
    source: 'agent', ownerId: null, sourceLabel: 'Agent plan',
    phases: [{ id: 'e002ab7d', name: 'Execute', tasks: states.map((state, i) => ({ id: `0000000${i}`, text: ['Run the sequence', 'Report each command\'s outcome in one line'][i]!, state })) }],
  });
  const count = (plan: TaskPlan): string => /todo-pane__count">([^<]*)</.exec(renderToStaticMarkup(createElement(TodoPane, { plan })))![1]!;

  it('an item left open reads as not done: the pack\'s "1 of 2 tasks done"', () => {
    expect(count(agentPlan(['done', 'open']))).toBe('1 of 2 tasks done');
    expect(count(agentPlan(['done', 'active']))).toBe('1 of 2 tasks done');
  });

  it('the plan of a run that completes reads every task done', () => {
    expect(count(agentPlan(['done', 'done']))).toBe('2 of 2 tasks done');
  });
});
