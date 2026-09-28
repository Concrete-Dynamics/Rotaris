/**
 * The todo state, in its smallest conformant form (REQ-ORCH-004, REQ-ORCH-067,
 * REQ-ORCH-068, REQ-ORCH-077, REQ-ORCH-147).
 *
 * Phases in insertion order; a fresh session gets one phase `main` holding
 * the task. Selection is the first pending task scanning phases in insertion
 * order. A task resolves each iteration into complete, abandoned, or back to
 * pending; consecutive pending outcomes per task are counted and the task is
 * abandoned at the per-task limit (default 3 — a setting of its own, never
 * the iteration limit).
 *
 * Serialised as a document carrying its own version (D-22).
 */
export type TaskState = 'pending' | 'in_progress' | 'complete' | 'abandoned';

export interface Task {
  readonly id: string;
  readonly text: string;
  state: TaskState;
  consecutiveRetries: number;
  /**
   * PD-ORCH-005 clause 17: the open iteration this task closes with — a continue's message, which the resumed iteration
   * holds beside its own task. Absent on every other task, and removed when the iteration closes (`releaseHeld`).
   */
  heldBy?: number;
}
export interface Phase {
  readonly name: string;
  readonly tasks: Task[];
}
export interface TodoDocument {
  readonly schema_version: 1;
  readonly phases: readonly { readonly name: string; readonly tasks: readonly Task[] }[];
}

export const CONSECUTIVE_RETRY_LIMIT_DEFAULT = 3;

export class Todo {
  private readonly phases: Phase[] = [];

  constructor(private readonly consecutiveRetryLimit = CONSECUTIVE_RETRY_LIMIT_DEFAULT) {}

  /** REQ-ORCH-004: a fresh session — one phase `main` with the task. */
  static fresh(taskId: string, text: string, limit?: number): Todo {
    const t = new Todo(limit);
    t.phases.push({ name: 'main', tasks: [{ id: taskId, text, state: 'pending', consecutiveRetries: 0 }] });
    return t;
  }

  static fromDocument(doc: TodoDocument, limit?: number): Todo {
    const t = new Todo(limit);
    for (const p of doc.phases) t.phases.push({ name: p.name, tasks: p.tasks.map((x) => ({ ...x })) });
    return t;
  }

  /** REQ-ORCH-004: a resumed session appends its new top-level task to the existing state. */
  appendTask(phaseName: string, taskId: string, text: string): void {
    let phase = this.phases.find((p) => p.name === phaseName);
    if (!phase) { phase = { name: phaseName, tasks: [] }; this.phases.push(phase); }
    phase.tasks.push({ id: taskId, text, state: 'pending', consecutiveRetries: 0 });
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
  }

  /**
   * PD-ORCH-005 clause 17: every task the iteration `iteration` holds closes with it — `complete` when it succeeded, and
   * otherwise back to `pending`, so the next iteration takes it up. Leaving it pending is not a requeue: no consecutive
   * retry is counted (REQ-ORCH-077 counts an iteration's own task). Returns how many closed.
   */
  releaseHeld(iteration: number, done: boolean): number {
    let n = 0;
    for (const task of this.all()) {
      if (task.heldBy !== iteration) continue;
      delete task.heldBy;
      task.state = done ? 'complete' : 'pending';
      n += 1;
    }
    return n;
  }

  /** PD-ORCH-005 clause 17: whether the iteration `iteration` holds a continue's message as a task. */
  holdsFor(iteration: number): boolean {
    return this.all().some((t) => t.heldBy === iteration);
  }

  /**
   * PD-ORCH-005 clause 17: a task held by an iteration that is no longer open — a process that died between the
   * iteration's close and the save that recorded the release — closes as that iteration did: `complete` when the record
   * holds it closed `succeeded` (`succeeded`), and otherwise back to `pending`, so it is never stuck in progress and a
   * message its iteration already carried out is never worked again.
   */
  releaseStale(openIteration: number | null, succeeded: ReadonlySet<number>): number {
    let n = 0;
    for (const task of this.all()) {
      if (task.heldBy === undefined || task.heldBy === openIteration) continue;
      task.state = succeeded.has(task.heldBy) ? 'complete' : 'pending';
      delete task.heldBy;
      n += 1;
    }
    return n;
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
      if (body === '' || this.all().some((t) => t.id === id) || !this.phases.some((p) => p.name === phaseName)) return false;
      this.appendTask(phaseName, id, body);
      return true;
    }
    for (const p of this.phases) {
      const at = p.tasks.findIndex((t) => t.id === id);
      if (at === -1) continue;
      const task = p.tasks[at]!;
      if (op === 'update') {
        if (body === '' || body === task.text) return false;
        p.tasks[at] = { ...task, text: body };
        return true;
      }
      p.tasks.splice(at, 1);
      return true;
    }
    return false;
  }

  toDocument(): TodoDocument {
    return { schema_version: 1, phases: this.phases.map((p) => ({ name: p.name, tasks: p.tasks.map((t) => ({ ...t })) })) };
  }

  /** REQ-ORCH-067: the first pending task, phases in insertion order. */
  selectNext(): Task | undefined {
    for (const p of this.phases) for (const t of p.tasks) if (t.state === 'pending') return t;
    return undefined;
  }

  /** REQ-ORCH-067: the texts of the pending tasks, in the order selection takes them up. */
  pendingTexts(): string[] {
    return this.all().filter((t) => t.state === 'pending').map((t) => t.text);
  }

  /** REQ-ORCH-072: the selected task flips to in-progress. */
  begin(task: Task): void {
    task.state = 'in_progress';
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

  private all(): Task[] {
    return this.phases.flatMap((p) => p.tasks);
  }
}
