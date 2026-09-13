import type { HookEvent, LifecycleHookEvent } from '@rotaris/contracts';
import type { SessionWriter } from './session-writer.js';

/**
 * ADR-0015: the engine's view of the session's hooks. The engine owns this interface; `@rotaris/hooks`
 * implements the engine behind it; the run-host root wires the two — so `engine` imports nothing from
 * `hooks`, and the gate in `agent-tools` sees the same object through its own structurally identical
 * `ToolHooks` (the `DelegationPort` pattern). Absent or null: no hook exists for the run and nothing
 * about hooks is observable (REQ-HOOKS-041).
 */
export interface HookAuditEntry {
  readonly hook_id: string;
  readonly name: string;
  readonly event: string;
  readonly matcher: string;
  readonly source: string;
  /** Masked (REQ-HOOKS-118). */
  readonly command: string;
}

export interface HookTrust {
  /** REQ-HOOKS-086: how many the gate withheld, how many it reinstated, and the workspace the decision was looked up against. */
  readonly withheld: number;
  readonly reinstated: number;
  readonly notice: string;
  readonly workspace: string;
  readonly fingerprint: string;
  /** REQ-HOOKS-085: non-empty when the set could not be resolved and the run continues with no hooks. */
  readonly loadWarning: string;
}

export interface ToolHookCall {
  readonly toolName: string;
  /** REQ-HOOKS-029: the policy facet — the command line, the file action name, or ''. */
  readonly facetText: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  /** REQ-HOOKS-057: the shell command line for `terminal`, '' otherwise. */
  readonly command: string;
  readonly results?: readonly { readonly kind: 'observation' | 'error'; readonly text: string }[];
}

/** The gate's side (REQ-HOOKS-068..074). Only `preTool` can stop a call (REQ-HOOKS-047). */
export interface ToolHookBridge {
  preTool(call: ToolHookCall): Promise<{ readonly blocked: boolean; readonly refusal: string }>;
  postTool(call: ToolHookCall): Promise<{ readonly feedback: string }>;
}

export interface HookPort {
  /** REQ-HOOKS-118: the enabled resolved set, commands masked; `[]` when there are none. */
  auditSnapshot(): readonly HookAuditEntry[];
  trust(): HookTrust;
  /** REQ-HOOKS-127: once per session. */
  announceWithheld(): number;
  hasHooksFor(event: HookEvent): boolean;
  fireLifecycle(event: LifecycleHookEvent, fields: Readonly<Record<string, unknown>>): Promise<unknown>;
  /** REQ-HOOKS-054: '' when nothing was switched off. */
  advisory(): string;
  readonly toolHooks: ToolHookBridge;
}

/** What the run-host root is handed to build a session's hook port. */
export interface HookPortContext {
  readonly sessionId: string;
  /** The base workspace: where the hook configuration is loaded from. */
  readonly workspaceRoot: string;
  /** REQ-GIT-019: the worktree an isolated run works in — the hooks' working directory; absent means the base. */
  readonly effectiveRoot?: string | undefined;
  readonly writer: SessionWriter;
  /** The user's warning channel. */
  readonly warn: (message: string) => void;
  /** The application log only. */
  readonly log: (message: string) => void;
  /**
   * REQ-ORCH-153 / REQ-HOOKS-126: whether the run is held at the plan gate, read live at each invocation. While
   * held no hook command runs and each withheld invocation announces itself on the stream. Absent means no gate.
   */
  readonly planGateHeld?: (() => boolean) | undefined;
}

/** REQ-HOOKS-054/086/087, REQ-NOTIFY-223/224: what the run hands the host's notice channel. */
export interface RunNotice {
  readonly severity: 'info' | 'warning' | 'error';
  readonly headline: string;
  readonly detail: string;
  /** An action identifier the shell may offer (REQ-NOTIFY-223/224). */
  readonly action?: string;
  /** REQ-NOTIFY-224: published once per key within one application session. */
  readonly key?: string;
  /** REQ-NOTIFY-028 (Part V): the session the notice concerns; absent means the focused run. */
  readonly sessionId?: string;
}
