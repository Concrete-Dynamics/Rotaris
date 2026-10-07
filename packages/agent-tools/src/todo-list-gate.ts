import { canonicalToolName, grantsOn } from './registry.js';

/**
 * OQ-213 as ruled under the owner's delegation (R-072, 2026-10-07), building REQ-ORCH-029's clause "work spanning more than
 * one step is accompanied by a todo list it keeps current" so that it holds "no matter what … instruction text is in force".
 *
 * The run refuses, at dispatch, the call that would start a task's SECOND work item while the coordinating entry role has
 * written no todo list of its own for that task. This module is the gate's half: which calls are work items, and the shape of
 * the run's live check. Whether a list is owed (the entry role coordinates, the caller is an execution iteration's root, the
 * task already has a work item, no list has been written) is the run's to answer, read live at each dispatch, as REQ-ORCH-153's
 * hold is (`planGateHeld`).
 */
export interface TodoListGate {
  /**
   * Whether the entry role holds the direct-work bundle on this run (REQ-ORCH-016, PD-ORCH-006): then a call of a tool the
   * registry declares as writing workspace files or running commands is a work item too.
   */
  readonly directWork: boolean;
  /** The refusal the model reads when the call that would start a work item must wait for a todo list, else null. */
  owed(): string | null;
  /** A work item reached execution — past the todo check, the schema, the permission and the pre-execution hooks. */
  started(): void;
}

/**
 * OQ-213: a work item is a `delegate` call (REQ-ORCH-029: "every work item it takes on reaches a specialist through a
 * `delegate` call"), or on a direct-work grant a call of a tool the public registry DECLARES as writing workspace files or
 * running commands (REQ-TOOLS-001). A tool the registry carries no declaration for — an MCP or plugin tool, or a name the
 * surface serves with something other than the public tool (`isPublicTool` false) — declares nothing, so it is no work item:
 * the ruling counts what the registry declares, and the fail-closed reading (ADR-0016) is for a rule that withholds a TOOL,
 * where this one refuses a call only to ask for a list first.
 */
export function isWorkItem(name: string, isPublicTool: boolean, directWork: boolean): boolean {
  if (!isPublicTool) return false;
  const canonical = canonicalToolName(name);
  if (canonical === 'delegate') return true;
  return directWork && (grantsOn(canonical, 'writesWorkspaceFiles') || grantsOn(canonical, 'runsCommands'));
}
