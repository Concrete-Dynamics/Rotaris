/**
 * The todo state, in its smallest conformant form (REQ-ORCH-004, REQ-ORCH-067,
 * REQ-ORCH-068, REQ-ORCH-077, REQ-ORCH-147).
 *
 * Phases in insertion order; a fresh session gets one phase `main` holding
 * the task. Selection is the first pending task scanning phases in insertion
 * order — after a continue's message its resumed iteration left pending
 * (`nextUp`, PD-ORCH-005 clause 17), which is taken first. A task resolves
 * each iteration into complete, abandoned, or back to pending; consecutive
 * pending outcomes per task are counted and the task is abandoned at the
 * per-task limit (default 3 — a setting of its own, never the iteration
 * limit).
 *
 * Serialised as a document carrying its own version (D-22).
 */
import { randomBytes } from 'node:crypto';

export type TaskState = 'pending' | 'in_progress' | 'complete' | 'abandoned';

export interface Task {
  readonly id: string;
  /**
   * What the task holds — the work an iteration that takes it up is told to do. A task with no `name` is also called by it.
   */
  readonly text: string;
  /**
   * REQ-CHAT-040 / REQ-ORCH-071: what the task is called, where that is not its content — a queued prompt's task is named
   * "Queued Prompt: <first 8 characters of the prompt id>" and carries the prompt text as its content, as REQ-TOOLS-144's
   * agent task carries a name beside its description. Absent on every other task, which its text names. Acceptance A28.
   */
  readonly name?: string;
  state: TaskState;
  consecutiveRetries: number;
  /**
   * PD-ORCH-005 clause 17: the open iteration this task closes with — a continue's message, which the resumed iteration
   * holds beside its own task. Absent on every other task, and removed when the iteration closes (`releaseHeld`).
   */
  heldBy?: number;
  /**
   * PD-ORCH-005 clause 17: a continue's message its iteration left pending when it closed without succeeding, "so the next
   * iteration takes it up" — selected before every other pending task, and cleared when an iteration begins it.
   */
  nextUp?: true;
  /**
   * PD-ORCH-005 clause 17: a continue's message — set when it is appended (`appendHeld`) and kept for good, so an iteration
   * that later takes it up is sent its text as the task to work on (`Run.firstMessage`, OQ-102).
   */
  message?: true;
}
export interface Phase {
  /**
   * REQ-CHAT-089: the phase's backend id — 8 lowercase hexadecimal characters, fixed when the phase is created. A phase
   * an earlier build created carries none, and is known by its name, as it was then.
   */
  readonly id?: string;
  readonly name: string;
  readonly tasks: Task[];
}
export interface TodoDocument {
  readonly schema_version: 1;
  readonly phases: readonly { readonly id?: string; readonly name: string; readonly tasks: readonly Task[] }[];
}

export const CONSECUTIVE_RETRY_LIMIT_DEFAULT = 3;

/**
 * REQ-CHAT-040: what a task is called — its name where it has one, else its text. What the Todo pane draws, and the
 * handoff's "task display titles" (REQ-SESSION-115).
 */
export function taskTitle(task: { readonly text: string; readonly name?: string | undefined }): string {
  return task.name ?? task.text;
}

/**
 * REQ-CHAT-040: a task as one line of a plan read as text — its name and then its content where it has a name, as an agent
 * task's line is its name and then its description (`todoLinesFromStored`); else its text.
 */
export function taskLine(task: { readonly text: string; readonly name?: string | undefined }): string {
  return task.name === undefined ? task.text : `${task.name}: ${task.text}`;
}

/** REQ-CHAT-089: the form of every task id the backend assigns — 8 lowercase hexadecimal characters. */
export const BACKEND_TODO_ID = /^[0-9a-f]{8}$/;

/**
 * REQ-CHAT-089: a backend task id — 8 lowercase hexadecimal characters, fixed when the task is created — that no id in
 * `taken` already is. `draw` is the source of candidates (random by default; a test may pass its own).
 */
export function mintTodoId(taken: ReadonlySet<string>, draw: () => string = () => randomBytes(4).toString('hex')): string {
  for (;;) {
    const id = draw().toLowerCase();
    if (BACKEND_TODO_ID.test(id) && !taken.has(id)) return id;
  }
}

export class Todo {
  private readonly phases: Phase[] = [];

  constructor(private readonly consecutiveRetryLimit = CONSECUTIVE_RETRY_LIMIT_DEFAULT) {}

  /** REQ-ORCH-004: a fresh session — one phase `main` with the task. */
  static fresh(taskId: string, text: string, limit?: number): Todo {
    const t = new Todo(limit);
    t.phases.push({ id: mintTodoId(new Set([taskId])), name: 'main', tasks: [{ id: taskId, text, state: 'pending', consecutiveRetries: 0 }] });
    return t;
  }

  static fromDocument(doc: TodoDocument, limit?: number): Todo {
    const t = new Todo(limit);
    for (const p of doc.phases) t.phases.push({ ...(p.id === undefined ? {} : { id: p.id }), name: p.name, tasks: p.tasks.map((x) => ({ ...x })) });
    return t;
  }

  /**
   * REQ-ORCH-004: a resumed session appends its new top-level task to the existing state. REQ-CHAT-040: `name`, where the
   * task is called something other than what it holds (a queued prompt's "Queued Prompt: <id>").
   */
  appendTask(phaseName: string, taskId: string, text: string, name?: string): void {
    let phase = this.phases.find((p) => p.name === phaseName);
    if (!phase) {
      // REQ-CHAT-089: a phase the backend creates takes an id of its own, unique within the todo (the task's included).
      const taken = this.ids();
      taken.add(taskId);
      phase = { id: mintTodoId(taken), name: phaseName, tasks: [] };
      this.phases.push(phase);
    }
    phase.tasks.push({ id: taskId, text, state: 'pending', consecutiveRetries: 0, ...(name === undefined ? {} : { name }) });
  }

  /**
   * PD-ORCH-005 clause 17: a continue's message, appended as a task that the resumed iteration `iteration` holds — in
   * progress while it is open (REQ-ORCH-072), so no selection takes it, and closed with that iteration (`releaseHeld`).
   */
  appendHeld(phaseName: string, taskId: string, text: string, iteration: number): void {
    this.appendTask(phaseName, taskId, text);
    const task = this.task(taskId)!;
    task.state = 'in_progress';
    task.heldBy = iteration;
    task.message = true;
  }

  /**
   * PD-ORCH-005 clause 17: every task the iteration `iteration` holds closes with it — `complete` when it succeeded, and
   * otherwise back to `pending`, marked to be taken up by the next iteration (`nextUp`). Leaving it pending is not a
   * requeue: no consecutive retry is counted (REQ-ORCH-077 counts an iteration's own task).
   */
  releaseHeld(iteration: number, done: boolean): void {
    for (const task of this.all()) if (task.heldBy === iteration) this.close(task, done);
  }

  /**
   * PD-ORCH-005 clause 17: a task held by an iteration that is no longer open — a process that died between the
   * iteration's close and the save that recorded the release — closes as that iteration did: `complete` when the record
   * holds it closed `succeeded` (`succeeded`), and otherwise back to `pending`, so it is never stuck in progress and a
   * message its iteration already carried out is never worked again.
   */
  releaseStale(openIteration: number | null, succeeded: ReadonlySet<number>): void {
    for (const task of this.all()) {
      if (task.heldBy !== undefined && task.heldBy !== openIteration) this.close(task, succeeded.has(task.heldBy));
    }
  }

  /**
   * An iteration's own task left `in_progress` after its iteration closed — a death between the close and the save of the
   * todo, which an earlier build made in two transactions — closes as `closedOutcome` says that iteration closed, as
   * `Run.iterate()` would have closed it: `succeeded` complete (REQ-ORCH-069), `partial` requeued (REQ-ORCH-073/077),
   * `failed` or `abandoned` abandoned (REQ-ORCH-074), and `cancelled` or no outcome back to pending (REQ-ORCH-135, "the
   * task stays anchored"). `closedOutcome` answers `undefined` when no closed row is the latest to name the task, which is
   * left as it is; so is the task the open iteration `openTaskId` works on, and every task a held message's `heldBy` names
   * (`releaseStale` settles those). REQ-ORCH-072 flips a task to in progress only for the iteration that works it.
   */
  settleStranded(openTaskId: string | null, closedOutcome: (taskId: string) => string | null | undefined): void {
    for (const task of this.all()) {
      if (task.state !== 'in_progress' || task.heldBy !== undefined || task.id === openTaskId) continue;
      const outcome = closedOutcome(task.id);
      if (outcome === undefined) continue;
      if (outcome === 'succeeded') this.complete(task);
      else if (outcome === 'partial') this.requeue(task);
      else if (outcome === 'failed' || outcome === 'abandoned') this.abandon(task);
      else task.state = 'pending';
    }
  }

  /** PD-ORCH-005 clause 17: a held task closes with its iteration — done, or pending and taken up next. */
  private close(task: Task, done: boolean): void {
    delete task.heldBy;
    task.state = done ? 'complete' : 'pending';
    if (!done) task.nextUp = true;
  }

  /**
   * OQ-102's reading, beside PD-ORCH-005 clause 17 (which governs only a continue's message): whether a task carrying
   * `text` is still to be worked, so a continue that states no new request (the Continue action, "continue without
   * them", the message-limit resolution's 'continue' and 'double') appends it no second time: pending, or in progress and held by
   * the open iteration `open` — its own task, or a message it holds — which closes it to pending before the run selects.
   * A task in progress that nothing open holds and no iteration holds either is no one's to take up (a selection takes
   * only pending tasks), so it does not count, and the request is appended again, as REQ-ORCH-004 states (found by the
   * iteration lane review). A message a closed iteration still holds is not that case, and nor is an iteration's own task
   * its closed iteration left in progress: the caller settles both first (`settleClosedIterations`), as the run does
   * before it selects, so each is judged as it will be taken (found by the iteration lane review; the second by the repair
   * of `an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`).
   */
  holdsUnfinished(text: string, open: { readonly iteration: number; readonly taskId: string } | null): boolean {
    return this.all().some((t) => t.text === text && (t.state === 'pending'
      || (t.state === 'in_progress' && open !== null && (t.heldBy === open.iteration || t.id === open.taskId))));
  }

  /** PD-ORCH-005 clause 17: the ids of the tasks the iteration `iteration` holds — the continues' messages it was given. */
  heldIds(iteration: number): string[] {
    return this.all().filter((t) => t.heldBy === iteration).map((t) => t.id);
  }

  /**
   * REQ-ORCH-135 ("the task stays anchored"): the task an iteration held when it closed without finishing goes back to
   * `pending`, so the next selection picks it again. Only an `in_progress` task moves; false when none carries the id.
   */
  reopen(taskId: string): boolean {
    const task = this.all().find((t) => t.id === taskId);
    if (!task || task.state !== 'in_progress') return false;
    task.state = 'pending';
    return true;
  }

  /** The task carrying `taskId`, as the todo holds it. */
  task(taskId: string): Task | undefined {
    return this.all().find((t) => t.id === taskId);
  }

  /** The text of the task carrying `taskId`, or null when none does. */
  textOf(taskId: string): string | null {
    return this.all().find((t) => t.id === taskId)?.text ?? null;
  }

  /** REQ-CHAT-090/091: validated add/update/remove; every successful edit changes the document. */
  editTask(op: 'add' | 'update' | 'remove', id: string, text: string, phaseName = 'main'): boolean {
    const body = text.trim();
    if (op === 'add') {
      // REQ-CHAT-089: the phase is named by its id, as the plan shows it — or by its name, for a phase an earlier build
      // created with none (and for a caller that names none, `main`).
      const phase = this.phases.find((p) => p.id === phaseName) ?? this.phases.find((p) => p.name === phaseName);
      if (body === '' || this.all().some((t) => t.id === id) || !phase) return false;
      this.appendTask(phase.name, id, body);
      return true;
    }
    for (const p of this.phases) {
      const at = p.tasks.findIndex((t) => t.id === id);
      if (at === -1) continue;
      const task = p.tasks[at]!;
      if (op === 'update') {
        // REQ-CHAT-091's rename renames what the pane draws (`taskTitle`): a named task's name, its content kept — as an
        // agent task's rename keeps its description (`editAgentTodo`) — and an unnamed task's text.
        if (body === '' || body === taskTitle(task)) return false;
        p.tasks[at] = task.name === undefined ? { ...task, text: body } : { ...task, name: body };
        return true;
      }
      p.tasks.splice(at, 1);
      return true;
    }
    return false;
  }

  toDocument(): TodoDocument {
    return { schema_version: 1, phases: this.phases.map((p) => ({ ...(p.id === undefined ? {} : { id: p.id }), name: p.name, tasks: p.tasks.map((t) => ({ ...t })) })) };
  }

  /**
   * REQ-ORCH-067: the first pending task, phases in insertion order — PD-ORCH-005 clause 17: after a continue's message
   * its resumed iteration left pending (`nextUp`), which the next iteration takes up first.
   */
  selectNext(): Task | undefined {
    return this.pendingInOrder()[0];
  }

  /** REQ-ORCH-067: the texts of the pending tasks, in the order selection takes them up. */
  pendingTexts(): string[] {
    return this.pendingInOrder().map((t) => t.text);
  }

  private pendingInOrder(): Task[] {
    const pending = this.all().filter((t) => t.state === 'pending');
    return [...pending.filter((t) => t.nextUp === true), ...pending.filter((t) => t.nextUp !== true)];
  }

  /** REQ-ORCH-072: the selected task flips to in-progress; a message taken up next is taken up (PD-ORCH-005 clause 17). */
  begin(task: Task): void {
    task.state = 'in_progress';
    delete task.nextUp;
  }

  complete(task: Task): void {
    task.state = 'complete';
    task.consecutiveRetries = 0;
  }
  abandon(task: Task): void {
    task.state = 'abandoned';
  }
  /** Back to pending; REQ-ORCH-077 abandons at the consecutive-retry limit instead. Returns what happened. */
  requeue(task: Task): 'pending' | 'abandoned' {
    task.consecutiveRetries += 1;
    if (task.consecutiveRetries >= this.consecutiveRetryLimit) {
      task.state = 'abandoned';
      return 'abandoned';
    }
    task.state = 'pending';
    return 'pending';
  }

  get pendingCount(): number {
    return this.all().filter((t) => t.state === 'pending').length;
  }
  get completedCount(): number {
    return this.all().filter((t) => t.state === 'complete').length;
  }
  get abandonedCount(): number {
    return this.all().filter((t) => t.state === 'abandoned').length;
  }
  /** REQ-ORCH-069 (1): every non-abandoned task is complete. */
  get allTasksComplete(): boolean {
    const live = this.all().filter((t) => t.state !== 'abandoned');
    return live.length > 0 && live.every((t) => t.state === 'complete');
  }

  /** Every id the todo holds, its tasks' and its phases' — what a new id must not repeat (REQ-CHAT-089). */
  ids(): Set<string> {
    const ids = new Set(this.all().map((t) => t.id));
    for (const p of this.phases) if (p.id !== undefined) ids.add(p.id);
    return ids;
  }

  private all(): Task[] {
    return this.phases.flatMap((p) => p.tasks);
  }
}
