import { describe, expect, it } from 'vitest';
import { planTodoLines } from './PlanGate.js';

describe('PlanGate — planTodoLines (PD-ORCH-002, REQ-ORCH-153)', () => {
  it('deduplicates identical todo tasks preserving first appearance order', () => {
    const raw = JSON.stringify({
      planner: {
        phases: [
          {
            tasks: [
              { state: 'pending', text: 'plan out the next feature.' },
              { state: 'pending', text: 'plan out the next feature.' },
              { state: 'in_progress', text: 'implement the login screen' },
              { state: 'pending', text: 'plan out the next feature.' },
            ],
          },
        ],
      },
    });
    const lines = planTodoLines(raw);
    expect(lines).toEqual([
      '[pending] plan out the next feature.',
      '[in_progress] implement the login screen',
    ]);
  });

  it('handles empty or malformed input safely', () => {
    expect(planTodoLines('')).toEqual([]);
    expect(planTodoLines('not-json')).toEqual([]);
    expect(planTodoLines('{}')).toEqual([]);
  });
});
