import { describe, expect, it } from 'vitest';
import { isTerminalChildState } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { admitTodoItem, openItemsSentence, openServedItems, type CallerPlan } from './todo-item.js';

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
    expect(r).toEqual({ ok: false, requirement: 'REQ-ORCH-028', reason: "todo_item 'ffffffff' names no item of your todo list. Name an id your todo tool's last result shows. Its open items: Item 0 (00000000). If none of them is this work, add one with the todo tool (add_task) and name its id." });
  });

  it('(b) a finished item is refused to an implementation delegation only', () => {
    expect(admitTodoItem({ named: '00000001', inherited: null, plan: plan(['PENDING', 'ABANDONED']), implementation: true, persona: 'tester', holderOf: none }).ok).toBe(false);
    expect(admitTodoItem({ named: '00000001', inherited: null, plan: plan(['PENDING', 'ABANDONED']), implementation: false, persona: 'verifier', holderOf: none })).toEqual({ ok: true, item: '00000001' });
  });

  // fin38's review: the refusal said "or name or add an open item" and openItemsSentence then offered the add again, and with
  // no open item it offered to name one (docs/defects/fixed/the-terminal-item-refusal-offers-the-add-twice.md).
  it('(b) the refusal offers the add once: through the open items it lists, or alone when there are none', () => {
    const listed = admitTodoItem({ named: '00000001', inherited: null, plan: plan(['PENDING', 'COMPLETED']), implementation: true, persona: 'coding-agent', holderOf: none });
    expect(listed).toEqual({ ok: false, requirement: 'REQ-ORCH-028', reason: "todo_item '00000001' names 'Item 1', which is COMPLETED, and a delegation to 'coding-agent', which writes workspace files, serves an open item. Reopen it with todo update, or name an open item. Its open items: Item 0 (00000000). If none of them is this work, add one with the todo tool (add_task) and name its id." });
    const empty = admitTodoItem({ named: '00000000', inherited: null, plan: plan(['ABANDONED']), implementation: true, persona: 'coding-agent', holderOf: none });
    expect(empty).toEqual({ ok: false, requirement: 'REQ-ORCH-028', reason: "todo_item '00000000' names 'Item 0', which is ABANDONED, and a delegation to 'coding-agent', which writes workspace files, serves an open item. Reopen it with todo update. It holds no open item: add one with the todo tool (add_task) and name its id." });
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

  // Live-run finding Q3 (552d346): a docs delegation naming no item was refused listing only the verification item, and the
  // refusal did not say that work no listed item serves gets an item of its own
  // (docs/defects/fixed/the-no-todo-item-refusal-names-add-task-only-when-the-plan-holds-no-open-item.md).
  it('a plan with open items lists them and says to add one when none of them is the work (PD-TOOLS-006 revision 6, Q3)', () => {
    expect(openItemsSentence(plan(['COMPLETED', 'PENDING']).document)).toBe('Its open items: Item 1 (00000001). If none of them is this work, add one with the todo tool (add_task) and name its id.');
  });
});

/**
 * PD-TOOLS-006 revision 11 (OQ-333, ruled 2026-10-15 under R-072): the reported children's items the caller has still to close —
 * IN_PROGRESS in its plan, held by no running child — keyed by the reporting child's task id.
 */
describe('openServedItems (PD-TOOLS-006 revision 11)', () => {
  const child = (task_id: string, todo_item: string | null) => ({ task_id, canonical_name: task_id, persona: 'coding-agent', state: 'succeeded', todo_item } as ChildRow);
  const doc = plan(['IN_PROGRESS', 'COMPLETED', 'PENDING', 'IN_PROGRESS']).document;

  it('names an IN_PROGRESS item a reported child served, and no other', () => {
    const open = openServedItems(doc, [child('bg_1', '00000000'), child('bg_2', '00000001'), child('bg_3', '00000002'), child('bg_4', null), child('bg_5', 'ffffffff')], new Set());
    expect([...open]).toEqual([['bg_1', { name: 'Item 0', id: '00000000' }]]);
  });

  it('leaves out an item a running child still holds, and names an item two reported children serve once, for the first', () => {
    expect(openServedItems(doc, [child('bg_1', '00000000')], new Set(['00000000'])).size).toBe(0);
    expect([...openServedItems(doc, [child('bg_1', '00000003'), child('bg_2', '00000003')], new Set())]).toEqual([['bg_1', { name: 'Item 3', id: '00000003' }]]);
  });

  it('names nothing without a plan', () => {
    expect(openServedItems(null, [child('bg_1', '00000000')], new Set()).size).toBe(0);
  });
});
