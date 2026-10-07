import { readFileSync } from 'node:fs';
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

  it('lists a named task by its name, so a queued prompt\'s task reads "Queued Prompt: <id>" (REQ-CHAT-040, REQ-ORCH-071)', () => {
    const raw = JSON.stringify({
      planner: {
        phases: [
          { name: 'main', tasks: [{ state: 'completed', text: 'build the parser' }] },
          {
            name: 'Queued Prompts',
            tasks: [
              { state: 'pending', name: 'Queued Prompt: 0123abcd', text: 'add a test for the parser' },
              { state: 'pending', name: 'Queued Prompt: 4567ef01', text: 'add a test for the parser' },
            ],
          },
        ],
      },
    });
    // Two queued prompts of the same text are two tasks of two names: PD-ORCH-002 deduplicates identical tasks only.
    expect(planTodoLines(raw)).toEqual([
      '[completed] build the parser',
      '[pending] Queued Prompt: 0123abcd',
      '[pending] Queued Prompt: 4567ef01',
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

describe('PlanGate — the plan stays the largest part when the window is short (PD-ORCH-002 revision 2, REQ-SHELL-022)', () => {
  const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  const base = readFileSync(new URL('../../../docs/design/system/base.css', import.meta.url), 'utf8');
  const spacing = readFileSync(new URL('../../../docs/design/system/tokens/spacing.css', import.meta.url), 'utf8');
  /** Every declaration block whose selector list is exactly `selector`, joined. */
  const rule = (selector: string): string => [...css.matchAll(/(?<=^|\})\s*([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => (m[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector).map((m) => m[2] ?? '').join(' ');
  /** A length written in `--rt-space-N` tokens (`var(--rt-space-16)`, `calc(2 * var(--rt-space-2) + …)`), in px. */
  const px = (value: string): number => {
    const space = (n: string): number => Number(new RegExp(`--rt-space-${n}:\\s*(\\d+)px`).exec(spacing)?.[1]);
    const expr = value.replace(/var\(--rt-space-(\d+)\)/g, (_, n: string) => String(space(n))).replace(/^calc\((.*)\)$/, '$1');
    if (!/^[\d\s+*]+$/.test(expr)) throw new Error(`not a sum of spacing tokens: ${value}`);
    return expr.split('+').reduce((sum, term) => sum + term.split('*').reduce((product, factor) => product * Number(factor.trim()), 1), 0);
  };
  const length = (block: string, property: string): number => px(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? '');

  const components = readFileSync(new URL('../../../docs/design/system/components.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./PlanGate.tsx', import.meta.url), 'utf8');

  it('gives the preview a floor above the todo\'s cap', () => {
    // Until 2026-10-06 the plan was `flex: 1 1 auto; min-height: 0` and every other part kept its content height, so at
    // 1000x680 with a 97 px notice the plan stood 41 px beside the todo's 56 (finacc2's A2;
    // docs/defects/fixed/the-expanded-plan-gate-gives-the-whole-loss-to-the-plan-when-a-notice-shares-the-window.md).
    expect(base).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box/);
    const preview = rule('.plan-gate__preview-wrap');
    const todo = rule('.plan-gate__todo');
    expect(preview).toContain('flex: 1 1 auto;');
    // Every box is border-box, so a floor and a cap compare as written: the plan at its floor is taller than the todo can
    // ever be (72 px against 64; the answers' row measures 41, the heading 24).
    expect(length(preview, 'min-height')).toBeGreaterThan(length(todo, 'max-height'));
  });

  it('leaves edit mode\'s floor to the adopted textarea.input rule, which is above the todo\'s cap', () => {
    // The edit field is a `textarea.input`; `textarea.input` (0,1,1) outranks `.plan-gate__plan` (0,1,0), so a min-height
    // written on the class never governs. One was, on 2026-10-06, and the built app read the field's floor as 80 px.
    expect(source).toContain("mode === 'edit' ? 'input plan-gate__plan");
    expect(source).toMatch(/<DesignTextArea\s+className=\{mode === 'edit' \? 'input plan-gate__plan/);
    expect(rule('.plan-gate__plan')).toContain('flex: 1 1 auto;');
    expect(rule('.plan-gate__plan')).not.toMatch(/(?:^|[;\s])min-height:/);
    const adopted = /(?:^|\})\s*textarea\.input\s*\{([^}]*)\}/.exec(components)?.[1] ?? '';
    const floor = Number(/min-height:\s*(\d+)px/.exec(adopted)?.[1]);
    expect(floor).toBeGreaterThan(length(rule('.plan-gate__todo'), 'max-height'));
  });

  it('raises the plan\'s floor above the opened revision field in both modes, and only while it is open', () => {
    // Opened by its summary, the revision field stands at its default height: the summary's line, a step and a
    // `textarea.input` at the adopted floor. Built, that read 102 px against the plan's 72 in preview and 80 in edit mode at
    // 1000x680 (the bundle's verifier, repair round 2, 2026-10-06); plan-gate-proof's 2c reads both modes with it open.
    const typography = readFileSync(new URL('../../../docs/design/system/tokens/typography.css', import.meta.url), 'utf8');
    const token = (name: string): number => Number(new RegExp(`--rt-${name}:\\s*([\\d.]+)`).exec(typography)?.[1]);
    const adopted = /(?:^|\})\s*textarea\.input\s*\{([^}]*)\}/.exec(components)?.[1] ?? '';
    const textareaFloor = Number(/min-height:\s*(\d+)px/.exec(adopted)?.[1]);
    expect(rule('.plan-gate__changes-summary')).toContain('margin-bottom: var(--rt-space-1);');
    expect(rule('.plan-gate__changes-summary')).not.toMatch(/(?:^|[;\s])(?:height|min-height|line-height):/);
    const openField = token('text-xs') * token('leading-body') + px('var(--rt-space-1)') + textareaFloor;
    expect(openField).toBeGreaterThan(length(rule('.plan-gate__preview-wrap'), 'min-height'));
    expect(openField).toBeGreaterThan(textareaFloor);

    const open = '.plan-gate:has(.plan-gate__changes-details[open])';
    const raised = rule(`${open} .plan-gate__preview-wrap, ${open} .plan-gate__plan`);
    expect(length(raised, 'min-height')).toBeGreaterThan(openField);
    // The raised floor applies only while the field is open: closed by default, the plan keeps its own floor.
    const markup = renderToStaticMarkup(createElement(PlanGate, {
      gate: { cycle: 1, openedAt: '2026-10-06T07:00:00.000Z', plan: '## Step one', edited: null, intent: 'requirements', todo: '', changes: '' },
      collapsed: false,
      onToggleCollapsed: () => {},
      onEdit: async () => ({ ok: true as const }),
      onDecide: async () => ({ ok: true as const }),
    }));
    expect(markup).toMatch(/<details class="plan-gate__changes-details">/);
    expect(source).toContain('<details className="plan-gate__changes-details" open={');
    // The field is a `textarea.input` that nothing here draws taller than the adopted floor.
    expect(source).toContain('className="input plan-gate__changes"');
    expect(rule('.plan-gate__changes')).not.toMatch(/(?:^|[;\s])(?:height|min-height):/);
  });

  it('caps a later cycle\'s "You asked for" line below every plan floor, scrolling and wrapping inside itself (PD-ORCH-002 revision 3, OQ-204)', () => {
    // Until 2026-10-07 the line had no bound: about 17.8 px a line (`--rt-text-xs` at `--rt-leading-body`), so five lines
    // stood taller than the plan's 72 px floor at REQ-SHELL-022's minimum, and nine taller than the plan at 1440x900.
    const prior = rule('.plan-gate__prior');
    const cap = length(prior, 'max-height');
    const adopted = /(?:^|\})\s*textarea\.input\s*\{([^}]*)\}/.exec(components)?.[1] ?? '';
    const textareaFloor = Number(/min-height:\s*(\d+)px/.exec(adopted)?.[1]);
    const open = '.plan-gate:has(.plan-gate__changes-details[open])';
    expect(cap).toBe(length(rule('.plan-gate__todo'), 'max-height'));
    expect(cap).toBeLessThan(length(rule('.plan-gate__preview-wrap'), 'min-height'));
    expect(cap).toBeLessThan(textareaFloor);
    expect(cap).toBeLessThan(length(rule(`${open} .plan-gate__preview-wrap, ${open} .plan-gate__plan`), 'min-height'));
    expect(prior).toContain('overflow: auto;');
    expect(prior).toContain('overflow-wrap: anywhere;');
    expect(prior).not.toMatch(/(?:^|[;\s])(?:flex|flex-grow|flex-shrink|min-height|height):/);
    // A cycle-2 gate draws the whole of what the user asked for inside that line; the cap scrolls it, nothing cuts it.
    const changes = `${'make the plan shorter and name each file it touches; '.repeat(19)}${'x'.repeat(120)}`;
    const markup = renderToStaticMarkup(createElement(PlanGate, {
      gate: { cycle: 2, openedAt: '2026-10-07T07:00:00.000Z', plan: '## Step one', edited: null, intent: 'requirements', todo: '', changes },
      collapsed: false,
      onToggleCollapsed: () => {},
      onEdit: async () => ({ ok: true as const }),
      onDecide: async () => ({ ok: true as const }),
    }));
    expect(changes.length).toBeGreaterThan(1000);
    expect(markup).toContain(`data-testid="plan-gate-prior">You asked for: ${changes}</p>`);
  });

  it('keeps every other part at its content height, and grows nothing but the plan', () => {
    // PD-ORCH-002 revision 2: "every other part of the gate is sized by its own content". The todo keeps its content up to
    // its cap and never yields; below the plan's floor the gate scrolls instead, its answers pinned (plan-gate-proof, 2c).
    const todo = rule('.plan-gate__todo');
    expect(todo).not.toMatch(/(?:^|[;\s])(?:flex|flex-shrink|min-height):/);
    expect(todo).toContain('overflow: auto;');
    expect(rule('.plan-gate > *')).toContain('flex: 0 0 auto;');
    const growers = [...css.matchAll(/(\.plan-gate__[\w-]+)\s*\{[^}]*flex:\s*([1-9][\d.]*)\s/g)].map((m) => m[1]);
    expect([...new Set(growers)].sort()).toEqual(['.plan-gate__plan', '.plan-gate__preview-wrap']);
    const shrinkers = [...css.matchAll(/(\.plan-gate__[\w-]+)\s*\{[^}]*flex:\s*\d[\d.]*\s+([1-9][\d.]*)\s/g)].map((m) => m[1]);
    expect([...new Set(shrinkers)].sort()).toEqual(['.plan-gate__plan', '.plan-gate__preview-wrap']);
  });
});
