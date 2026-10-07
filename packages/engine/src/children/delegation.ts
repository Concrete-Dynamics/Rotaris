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
  /**
   * REQ-LIBRARY-098: the artifacts the caller attached explicitly, by id or slug. The engine resolves them
   * and injects the `PRIOR AGENT CONTEXT (FULL)` block into the child; the tool reports back what could not
   * be resolved. Absent where no artifact store exists (the tool then carries none).
   */
  readonly attachArtifacts?: readonly string[] | undefined;
  /**
   * PD-TOOLS-006: path patterns, relative to the workspace root in the `glob` tool's dialect, that the child claims
   * while it is live. Absent or empty claims nothing.
   */
  readonly writeScope?: readonly string[] | undefined;
  /**
   * PD-ORCH-004: the task id of the caller's own child whose report offered a continuation; the new child is recorded
   * as its continuation. Absent or empty delegates ordinary work.
   */
  readonly continuationOf?: string | undefined;
  /**
   * REQ-TOOLS-152: omit the automatic index of prior sibling artifacts (REQ-LIBRARY-097, item (3) of REQ-TOOLS-154) from
   * the child's payload. Absent or false gives it, unless the persona's `skip_auto_sibling_context` (REQ-CONFIG-107) forces
   * the same omission.
   */
  readonly suppressAutoContext?: boolean | undefined;
  /**
   * REQ-TOOLS-152's `session_id`, as PD-ORCH-005 clause 22 and PD-TOOLS-006 revision 3 rule it: the task id of a settled
   * child of the caller, which the call follows up — the child resumes from its record with `task` as its next user
   * message, under its own task id, persona, dependencies and write scope. Absent or empty delegates a new child.
   */
  readonly sessionId?: string | undefined;
  /**
   * PD-TOOLS-006 revision 6 (OQ-220): the id of the item of the caller's own todo list the delegation serves, stored with the
   * child's record. Absent or empty names none; a continuation then inherits the continued child's, and a follow-up keeps its
   * own (OQ-131: a follow-up reads no other field).
   */
  readonly todoItem?: string | undefined;
}

/**
 * REQ-TOOLS-152 / REQ-TOOLS-153 as PD-TOOLS-006 revision 5 states them: what the child will be given of the caller's
 * attachments, by the selection that assembles its block, so the tool reports it rather than guessing.
 */
export interface AttachmentOutcome {
  /** How many attachments the child is given whole. */
  readonly given: number;
  /** The ids left out because their whole body would have carried the section past `budget`. */
  readonly elidedForSize: readonly string[];
  /** The references that named no artifact. */
  readonly unresolved: readonly string[];
  /** The ids whose document could not be read. */
  readonly unreadable: readonly string[];
  /** The attached-artifact section's budget in characters (REQ-TOOLS-152's 100,000). */
  readonly budget: number;
}

export type DelegateOutcome =
  | { readonly status: 'queued' | 'waiting_on_dependencies' | 'waiting_on_model_slot'; readonly canonicalName: string; readonly taskId: string; readonly message: string; readonly attachments?: AttachmentOutcome | undefined }
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
  /**
   * REQ-TOOLS-156: an empty list means all of the caller's active background children. PD-ORCH-005: `interrupted` when
   * the run came to rest while the caller waited, the tasks it waited on paused with it.
   */
  waitForTasks(parentId: string, taskIds: readonly string[]): Promise<WaitOutcome | { readonly refused: string } | { readonly interrupted: string }>;
  /** For the tree and the strip. */
  children(): readonly ChildRow[];
}
