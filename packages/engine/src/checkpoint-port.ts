import type { StoreDal } from '@rotaris/store';
import type { SessionWriter } from './session-writer.js';

/**
 * ADR-0039 in the engine: the run loop's one call at iteration close (REQ-GIT-051). The engine owns this interface;
 * the run-host root builds it over the workspace service's Git (reached through main — ADR-0002 c.4, ADR-0038 c.4)
 * and the session writer's one transaction (REQ-GIT-048), the way `HookPort` is built (ADR-0015's pattern).
 * `enabled` is REQ-GIT-044's three-valued key resolved against the session's binding; a port that is not enabled
 * is never called. `capture` never raises and never aborts the run (REQ-GIT-045): a Git decline is the `checkpoint`
 * warning issue, nothing to record is nothing.
 */
export interface CheckpointCaptureInput {
  /** The iteration that just closed (REQ-GIT-051). */
  readonly iteration: number;
  /** The one child credited with the iteration's work, or '' (REQ-GIT-051: never a joined name, never a winner picked). */
  readonly childName: string;
}
export type CheckpointCaptureResult =
  | { readonly outcome: 'recorded'; readonly sequence: number; readonly files: number; readonly invocations: number; readonly elapsedMs: number }
  | { readonly outcome: 'nothing-to-record'; readonly invocations: number; readonly elapsedMs: number }
  | { readonly outcome: 'disabled' }
  | { readonly outcome: 'failed'; readonly detail: string };

export interface CheckpointPort {
  /** REQ-GIT-044: decided at run start from the configuration and the binding; a tree Git cannot manage turns it off on first use. */
  readonly enabled: boolean;
  capture(input: CheckpointCaptureInput): Promise<CheckpointCaptureResult>;
}

/** What the run-host root is handed to build a session's checkpoint port. */
export interface CheckpointPortContext {
  readonly sessionId: string;
  /** The base workspace: the record's anchor and where the configuration is loaded from (REQ-GIT-019). */
  readonly workspaceRoot: string;
  /** REQ-GIT-024/053: the tree the run checkpoints — the worktree of an isolated run, else the base. */
  readonly effectiveRoot: string;
  /** REQ-GIT-044: whether the session is worktree-isolated. */
  readonly isolated: boolean;
  /** REQ-GIT-046: the recorded list's highest sequence is read from the rows at every capture. */
  readonly dal: StoreDal;
  readonly writer: SessionWriter;
  readonly warn: (message: string) => void;
  readonly log: (message: string) => void;
}
