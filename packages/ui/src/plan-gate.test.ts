import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlanGatePayload } from '@rotaris/contracts';
import { PlanGate, planTodoLines } from './PlanGate.js';

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

/**
 * PD-ORCH-002 revision 2. What a unit test can prove here is the MARKUP of each state — which controls exist and
 * what they are labelled. The heights themselves are grid arithmetic and are measured against the built product
 * (`pnpm plan-gate-proof`, `pnpm ui-audit`), because this repository has no DOM in vitest.
 */
describe('PlanGate — the two states of PD-ORCH-002 revision 2', () => {
  const gate: PlanGatePayload = {
    cycle: 1,
    openedAt: '2026-09-17T18:40:00.000Z',
    plan: '## Step one\n\nWrite the thing.',
    edited: null,
    intent: 'requirements',
    todo: '',
    changes: '',
  };
  const render = (collapsed: boolean) => renderToStaticMarkup(createElement(PlanGate, {
    gate,
    collapsed,
    onToggleCollapsed: () => {},
    onEdit: async () => ({ ok: true as const }),
    onDecide: async () => ({ ok: true as const }),
  }));

  it('offers REQ-ORCH-153\'s three answers under REQ-SHELL-048\'s labels in BOTH states', () => {
    for (const collapsed of [false, true]) {
      const markup = render(collapsed);
      for (const testid of ['plan-approve', 'plan-revise', 'plan-cancel']) {
        expect(markup, `${testid} while ${collapsed ? 'collapsed' : 'expanded'}`).toContain(`data-testid="${testid}"`);
      }
      expect(markup).toContain('>Approve</button>');
      expect(markup).toContain('>Revise</button>');
      expect(markup).toContain('>Cancel the run</button>');
      // Exactly one set of answers is drawn, so a driver clicking by test id can never reach two.
      expect(markup.match(/data-testid="plan-approve"/g)).toHaveLength(1);
    }
  });

  it('expanded draws the plan and the presentation toggle', () => {
    const markup = render(false);
    expect(markup).toContain('data-collapsed="0"');
    expect(markup).toContain('data-testid="plan-gate-preview"');
    expect(markup).toContain('data-testid="plan-gate-plan"');
    expect(markup).toContain('data-testid="plan-gate-toggle-edit"');
    expect(markup).toContain('>Collapse</button>');
  });

  it('collapsed draws the bar alone — no plan body, no revision field, and the way back', () => {
    const markup = render(true);
    expect(markup).toContain('data-collapsed="1"');
    expect(markup).toContain('plan-gate--collapsed');
    expect(markup).not.toContain('data-testid="plan-gate-preview"');
    expect(markup).not.toContain('data-testid="plan-gate-plan"');
    expect(markup).not.toContain('plan-gate-changes');
    expect(markup).toContain('data-testid="plan-gate-collapse"');
    expect(markup).toContain('>Expand</button>');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('publishes the layout contract `ui-audit` measures the answers against', () => {
    expect(render(false)).toContain('data-ui="plan-gate-actions"');
    expect(render(true)).toContain('data-ui="plan-gate-actions"');
    expect(render(false)).toContain('data-ui="plan-gate"');
  });
});
