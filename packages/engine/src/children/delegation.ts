import type { ChildRow } from '@rotaris/store';

/**
 * The engine-owned delegation operations the `delegate`, `background_output` and `wait_for_tasks`
 * executors call (REQ-TOOLS-152/153/155/156). agent-tools declares a structurally identical port and the
 * run-host root hands one to the other; neither package imports the other. Every operation is scoped to
 * the CALLER: `parentId` is the agent making the call, and lookups never cross parents (REQ-TOOLS-155).
 */
export interface DelegateRequest {
  readonly persona: string;
  readonly taskName: string;
  readonly task: string;
  readonly dependsOn: readonly string[];
  readonly inheritedContext: readonly string[];
  readonly category: string;
  readonly runInBackground: boolean;
}

export type DelegateOutcome =
  | { readonly status: 'queued' | 'waiting_on_dependencies' | 'waiting_on_model_slot'; readonly canonicalName: string; readonly taskId: string; readonly message: string }
  | { readonly status: 'rejected'; readonly canonicalName: string; readonly message: string };

export interface BackgroundOutput {
  readonly status: 'ok' | 'still_running' | 'not_found';
  readonly state: string;
  readonly text: string;
}

export interface WaitOutcome {
  readonly immediate: boolean;
  readonly requested: number;
  readonly text: string;
}

export interface DelegationOps {
  delegate(parentId: string, req: DelegateRequest): Promise<DelegateOutcome>;
  backgroundOutput(parentId: string, taskId: string, detail: 'summary' | 'verbatim'): BackgroundOutput;
  /** REQ-TOOLS-156: an empty list means all of the caller's active background children. */
  waitForTasks(parentId: string, taskIds: readonly string[]): Promise<WaitOutcome | { readonly refused: string }>;
  /** For the tree and the strip. */
  children(): readonly ChildRow[];
}
