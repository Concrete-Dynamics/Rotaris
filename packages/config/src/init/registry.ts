import type { WorkspaceClassification } from './state.js';

/**
 * ADR-0064 — the initialization task registry (REQ-WORKSPACE-080, REQ-WORKSPACE-087).
 *
 * A task is data plus two functions, and the registry is the only thing that knows the set. Nothing
 * about the one task the product ships is written here: `code-intelligence-setup` registers itself
 * from the composition root, which is what REQ-WORKSPACE-080's last sentence asks for — "a setup task
 * added after the fact SHALL participate in the prompt and in the setup UI under exactly the rules
 * stated here, with no additional behavior of its own". A registry with a built-in member could not
 * make that promise, because the member would be reachable by a second route.
 */

/** REQ-WORKSPACE-087: the closed set a task result's own status is drawn from. */
export const TASK_STATUSES = ['success', 'skipped', 'failure'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * REQ-WORKSPACE-087: a step's status is an **open** vocabulary — the generic three plus task-specific
 * values such as `skipped-no-code`. It is deliberately `string`: a closed union here would reject the
 * value REQ-WORKSPACE-091 requires the indexing stage to record, and the UI never renders this token
 * anyway ("The UI SHALL render each step's detail text, not its status token").
 */
export interface StepResult {
  readonly name: string;
  readonly status: string;
  readonly detail: string;
}

export interface TaskResult {
  readonly status: TaskStatus;
  readonly steps: readonly StepResult[];
  /** Forwarded into recorded state; null leaves whatever is recorded standing (REQ-WORKSPACE-079). */
  readonly classification: WorkspaceClassification | null;
  /** Shown next to the retry action; empty when the task did not fail. */
  readonly error: string;
  readonly retryable: boolean;
  /** One to two sentences (REQ-WORKSPACE-087). */
  readonly summary: string;
}

export interface TaskContext {
  readonly workspaceRoot: string;
  /** Cancellation (REQ-WORKSPACE-109): a task already under way reaches its own conclusion. */
  readonly signal: AbortSignal;
  /** REQ-WORKSPACE-109: each step is announced the moment it finishes, not withheld until the task ends. */
  readonly onStep: (step: StepResult) => void;
}

export interface InitializationTask {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** REQ-WORKSPACE-080: raising counts as not applicable, and is logged. */
  readonly applicable: () => boolean | Promise<boolean>;
  readonly run: (context: TaskContext) => Promise<TaskResult>;
  /** REQ-WORKSPACE-080: defaults to false. REQ-WORKSPACE-082: "a task that declares nothing about consent behaves as background". */
  readonly requiresConsent?: boolean | undefined;
}

export const DUPLICATE_TASK = (id: string): string => `Initialization task '${id}' is already registered`;

export class TaskRegistry {
  private readonly tasks = new Map<string, InitializationTask>();

  /** REQ-WORKSPACE-080: a duplicate id fails unless replacement is requested. */
  register(task: InitializationTask, replace = false): void {
    if (!replace && this.tasks.has(task.id)) throw new Error(DUPLICATE_TASK(task.id));
    this.tasks.set(task.id, task);
  }

  /** REQ-WORKSPACE-080: unregistering an unknown id is a no-op. */
  unregister(id: string): void {
    this.tasks.delete(id);
  }

  get(id: string): InitializationTask | undefined {
    return this.tasks.get(id);
  }

  /** Registration order, which is the order an execution attempts them in (REQ-WORKSPACE-084). */
  all(): readonly InitializationTask[] {
    return [...this.tasks.values()];
  }

  clear(): void {
    this.tasks.clear();
  }
}

/** REQ-WORKSPACE-080: a predicate that raises is logged and treated as "not applicable". */
export async function isApplicable(task: InitializationTask, log: (message: string) => void): Promise<boolean> {
  try {
    return await task.applicable();
  } catch (cause) {
    log(`initialization: the applicability predicate of '${task.id}' raised (${String(cause)}); treated as not applicable`);
    return false;
  }
}

/**
 * REQ-WORKSPACE-105: an id read back from persisted state that matches no registered task displays as
 * itself and is treated as requiring no consent. `code-intelligence-setup` displays as its label
 * through the registry, never through a table this module keeps (REQ-WORKSPACE-088, REQ-WORKSPACE-089).
 */
export function labelFor(registry: TaskRegistry, id: string): string {
  return registry.get(id)?.label ?? id;
}

export function labelsFor(registry: TaskRegistry, ids: readonly string[]): string {
  return ids.map((id) => labelFor(registry, id)).join(', ');
}
