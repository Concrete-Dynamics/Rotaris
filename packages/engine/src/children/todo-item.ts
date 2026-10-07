import type { ChildRow } from '@rotaris/store';
import type { AgentTodoDocument, AgentTodoTask } from '../todo-view.js';

/**
 * PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under the owner's delegation, R-072), building REQ-ORCH-028's "at most
 * one child at a time may hold an implementation delegation for any one todo item" and REQ-ORCH-029's "no two implementation
 * delegations for the same todo item are outstanding at once", externally checkable from the run's own records: a delegation
 * names the item of its caller's own plan it serves (`todo_item`), the child's record stores it (`children.todo_item`), and
 * admission refuses, with status `rejected` and no record:
 *
 * - (a) for any delegation, an id the caller's plan does not hold;
 * - (b) for an implementation delegation, an item that is COMPLETED or ABANDONED;
 * - (c) for an implementation delegation, an item another non-terminal implementation child of the same plan holds;
 * - (d) for an implementation delegation from the coordinating entry role, no item at all once that role has written its todo
 *   list for the task (OQ-213's `listWritten`).
 *
 * A continuation that names no item inherits the continued child's, checked by (c) alone; a `session_id` follow-up keeps its
 * stored item and is checked by (c) alone (`IterationChildren.followUp`). The wording of each reason is the implementation's;
 * each names the item, and the holder where there is one, and says what to do instead.
 */

/** The plan a delegating agent keeps, as the run reads it at the call: the root's own plan or a child's stored todo. */
export interface CallerPlan {
  readonly document: AgentTodoDocument | null;
  /**
   * OQ-213's `listWritten` for the current task, true only for the coordinating entry role after its accepted `todo` write;
   * an unnamed implementation delegation is refused once it is (d).
   */
  readonly listWritten: boolean;
}

export type TodoItemAdmission =
  | { readonly ok: true; readonly item: string | null }
  | { readonly ok: false; readonly reason: string; readonly requirement: 'REQ-ORCH-028' | 'REQ-ORCH-029' };

const TERMINAL_ITEM: ReadonlySet<AgentTodoTask['state']> = new Set(['COMPLETED', 'ABANDONED']);

function tasksOf(document: AgentTodoDocument | null): readonly AgentTodoTask[] {
  return document === null ? [] : document.phases.flatMap((phase) => phase.tasks);
}

/** The open items of a plan, as "name (id)", or a sentence saying there are none and how to add one. */
export function openItemsSentence(document: AgentTodoDocument | null): string {
  const open = tasksOf(document).filter((t) => !TERMINAL_ITEM.has(t.state));
  return open.length > 0
    ? `Its open items: ${open.map((t) => `${t.name} (${t.id})`).join(', ')}.`
    : 'It holds no open item: add one with the todo tool (add_task) and name its id.';
}

export interface TodoItemRequest {
  /** The call's `todo_item`, trimmed; '' when it named none. */
  readonly named: string;
  /** The continued child's stored item, for a continuation that names none; null otherwise. */
  readonly inherited: string | null;
  readonly plan: CallerPlan;
  /** Whether the delegation is an implementation delegation (REQ-ORCH-028): its persona's grant writes workspace files. */
  readonly implementation: boolean;
  readonly persona: string;
  /** The non-terminal implementation child of the caller's plan that holds `item`, other than the one being admitted. */
  readonly holderOf: (item: string) => ChildRow | undefined;
}

/** The admission of one delegation's todo item: the item it serves (null for none), or the refusal and the requirement it holds. */
export function admitTodoItem(req: TodoItemRequest): TodoItemAdmission {
  const tasks = tasksOf(req.plan.document);
  if (req.named !== '') {
    const task = tasks.find((t) => t.id === req.named);
    // (a) Any delegation: an id is the caller's own plan's, as its todo tool's last result shows it.
    if (task === undefined) {
      const list = req.plan.document === null || tasks.length === 0
        ? 'You keep no todo list with items yet: write one with the todo tool first, and name an id its result shows.'
        : `Name an id your todo tool's last result shows. ${openItemsSentence(req.plan.document)}`;
      return { ok: false, requirement: 'REQ-ORCH-028', reason: `todo_item '${req.named}' names no item of your todo list. ${list}` };
    }
    if (req.implementation) {
      // (b) An implementation delegation serves an open item, so the plan never shows COMPLETED work still under way.
      if (TERMINAL_ITEM.has(task.state)) {
        return { ok: false, requirement: 'REQ-ORCH-028', reason: `todo_item '${task.id}' names '${task.name}', which is ${task.state}, and a delegation to '${req.persona}', which writes workspace files, serves an open item. Reopen it with todo update, or name or add an open item. ${openItemsSentence(req.plan.document)}` };
      }
      const held = heldRefusal(task.id, task.name, req.holderOf);
      if (held !== null) return held;
    }
    return { ok: true, item: task.id };
  }
  if (req.inherited !== null) {
    // A continuation carries on its predecessor's item; only (c) reads it, the predecessor being terminal.
    if (req.implementation) {
      const name = tasks.find((t) => t.id === req.inherited)?.name ?? req.inherited;
      const held = heldRefusal(req.inherited, name, req.holderOf);
      if (held !== null) return held;
    }
    return { ok: true, item: req.inherited };
  }
  // (d) The coordinating entry role keeps a list for this task: its implementation delegation names the item it serves.
  if (req.implementation && req.plan.listWritten) {
    return { ok: false, requirement: 'REQ-ORCH-029', reason: `This delegation names no todo item, and you keep a todo list for this task: a delegation to '${req.persona}', which writes workspace files, gives todo_item, the id of the open item it serves. ${openItemsSentence(req.plan.document)}` };
  }
  return { ok: true, item: null };
}

/** (c): the refusal when another outstanding implementation child of the plan holds `item`, else null. */
function heldRefusal(item: string, name: string, holderOf: (item: string) => ChildRow | undefined): TodoItemAdmission | null {
  const holder = holderOf(item);
  if (holder === undefined) return null;
  return {
    ok: false, requirement: 'REQ-ORCH-028',
    reason: `todo_item '${item}' ('${name}') is held by ${holder.canonical_name} (${holder.persona}, task_id ${holder.task_id}, state ${holder.state}): no two delegations to personas that write workspace files serve one todo item at once. Wait for it with wait_for_tasks and follow it up with session_id: "${holder.task_id}", or split the item with todo add_task and name the new item's id.`,
  };
}
