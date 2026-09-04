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

  /** REQ-MONITOR-004's todo edit — add/update/remove by id; false when the id is unknown or the task is no longer editable. */
  editTask(op: 'add' | 'update' | 'remove', id: string, text: string, phaseName = 'main'): boolean {
    if (op === 'add') {
      if (this.all().some((t) => t.id === id)) return false;
      this.appendTask(phaseName, id, text);
      return true;
    }
    for (const p of this.phases) {
      const at = p.tasks.findIndex((t) => t.id === id);
      if (at === -1) continue;
      const task = p.tasks[at]!;
      if (task.state === 'in_progress' && op === 'remove') return false;
      if (op === 'update') { p.tasks[at] = { ...task, text }; return true; }
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
