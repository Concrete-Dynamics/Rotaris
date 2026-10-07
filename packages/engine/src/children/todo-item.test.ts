import { describe, expect, it } from 'vitest';
import { isTerminalChildState } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { admitTodoItem, openItemsSentence, type CallerPlan } from './todo-item.js';

/**
 * PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under R-072): the admission of a delegation's todo item, over a plan and
 * a holder lookup. The run-level cases — the record, the observation, the holders a ledger finds — are in `children.test.ts`.
 */
const plan = (states: readonly ('PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED')[], listWritten = true): CallerPlan => ({
  document: { schema_version: 1, phases: [{ id: 'e002ab7d', name: 'Build', tasks: states.map((state, i) => ({ id: `0000000${i}`, name: `Item ${i}`, description: '', state })) }] },
  listWritten,
});
const holder = { task_id: 'bg_0000000a', canonical_name: 'first', persona: 'coding-agent', state: 'paused' } as ChildRow;
const none = () => undefined;

describe('admitTodoItem (PD-TOOLS-006 revision 6)', () => {
  it('(a) an id the plan does not hold is refused for a read-only delegation too, and the open items are named', () => {
    const r = admitTodoItem({ named: 'ffffffff', inherited: null, plan: plan(['PENDING', 'COMPLETED']), implementation: false, persona: 'codebase-analyst', holderOf: none });
    expect(r).toEqual({ ok: false, requirement: 'REQ-ORCH-028', reason: "todo_item 'ffffffff' names no item of your todo list. Name an id your todo tool's last result shows. Its open items: Item 0 (00000000)." });
  });

  it('(b) a finished item is refused to an implementation delegation only', () => {
    expect(admitTodoItem({ named: '00000001', inherited: null, plan: plan(['PENDING', 'ABANDONED']), implementation: true, persona: 'tester', holderOf: none }).ok).toBe(false);
    expect(admitTodoItem({ named: '00000001', inherited: null, plan: plan(['PENDING', 'ABANDONED']), implementation: false, persona: 'verifier', holderOf: none })).toEqual({ ok: true, item: '00000001' });
  });

  it('(c) a paused holder holds — paused is no terminal state — and is named with its task id', () => {
    expect(isTerminalChildState('paused')).toBe(false);
    const r = admitTodoItem({ named: '00000000', inherited: null, plan: plan(['IN_PROGRESS']), implementation: true, persona: 'coding-agent', holderOf: (item) => (item === '00000000' ? holder : undefined) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("is held by first (coding-agent, task_id bg_0000000a, state paused)");
    // A read-only delegation is never held.
    expect(admitTodoItem({ named: '00000000', inherited: null, plan: plan(['IN_PROGRESS']), implementation: false, persona: 'codebase-analyst', holderOf: () => holder })).toEqual({ ok: true, item: '00000000' });
  });

  it('(d) no item, after the list, refuses an implementation delegation; before it, or for a read-only one, it serves none', () => {
    expect(admitTodoItem({ named: '', inherited: null, plan: plan(['PENDING']), implementation: true, persona: 'coding-agent', holderOf: none })).toMatchObject({ ok: false, requirement: 'REQ-ORCH-029' });
    expect(admitTodoItem({ named: '', inherited: null, plan: plan(['PENDING'], false), implementation: true, persona: 'coding-agent', holderOf: none })).toEqual({ ok: true, item: null });
    expect(admitTodoItem({ named: '', inherited: null, plan: plan(['PENDING']), implementation: false, persona: 'librarian', holderOf: none })).toEqual({ ok: true, item: null });
  });

  it('a continuation inherits its predecessor\'s item, checked by (c) alone', () => {
    // The item may be COMPLETED, or gone from the plan: only a holder refuses it.
    expect(admitTodoItem({ named: '', inherited: '00000000', plan: plan(['COMPLETED']), implementation: true, persona: 'coding-agent', holderOf: none })).toEqual({ ok: true, item: '00000000' });
    expect(admitTodoItem({ named: '', inherited: 'deadbeef', plan: plan(['PENDING']), implementation: true, persona: 'coding-agent', holderOf: none })).toEqual({ ok: true, item: 'deadbeef' });
    expect(admitTodoItem({ named: '', inherited: '00000000', plan: plan(['PENDING']), implementation: true, persona: 'coding-agent', holderOf: () => holder }).ok).toBe(false);
  });

  it('a plan with no open item says to add one', () => {
    expect(openItemsSentence(plan(['COMPLETED']).document)).toBe('It holds no open item: add one with the todo tool (add_task) and name its id.');
  });
});
