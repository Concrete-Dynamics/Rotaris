import { countNoun } from '@rotaris/kernel';
import { z } from 'zod';
import { errorObservation, INTERRUPTED_FAILURE_KIND, observation, type ToolExecutor } from './types.js';

/**
 * REQ-TOOLS-152/153/155/156: the three delegation tools over a port the engine fills. What the caller
 * observes is REQ-TOOLS-153's two-line rendering; `delegate` never suspends the parent;
 * `run_in_background: false` enrols the parent in the one waiting mechanism as if it had called
 * `wait_for_tasks` with the returned id.
 */
export interface DelegationPort {
  delegate(parentId: string, req: { persona: string; taskName: string; task: string; dependsOn: readonly string[]; inheritedContext: readonly string[]; category: string; runInBackground: boolean; attachArtifacts: readonly string[]; writeScope: readonly string[]; continuationOf?: string | undefined; suppressAutoContext?: boolean | undefined; sessionId?: string | undefined }): Promise<
    | { status: 'queued' | 'waiting_on_dependencies' | 'waiting_on_model_slot'; canonicalName: string; taskId: string; message: string; attachments?: { attached: number; unresolved: readonly string[] } | undefined }
    | { status: 'rejected'; canonicalName: string; message: string }
  >;
  backgroundOutput(parentId: string, taskId: string, detail: 'summary' | 'verbatim'): { status: 'ok' | 'still_running' | 'not_found'; state: string; text: string };
  /** PD-ORCH-005: `interrupted` when the run came to rest while the caller waited — the tasks waited on were paused with it. */
  waitForTasks(parentId: string, taskIds: readonly string[]): Promise<{ immediate: boolean; requested: number; text: string } | { refused: string } | { interrupted: string }>;
}

const delegateSchema = z.object({
  persona: z.string().min(1),
  task_name: z.string().min(1),
  task: z.string().min(1),
  depends_on: z.array(z.string()).default([]),
  inherited_context: z.array(z.string()).default([]),
  category: z.enum(['quick', 'deep', 'planning', 'research']).optional(),
  /** REQ-TOOLS-152 as PD-ORCH-005 clause 22 rules it: the task_id of your own child that has ended, to follow it up with `task`. */
  session_id: z.string().optional(),
  run_in_background: z.boolean().default(true),
  attach_artifacts: z.array(z.string()).default([]),
  suppress_auto_context: z.boolean().default(false),
  /** PD-TOOLS-006: path patterns, relative to the workspace root in the glob tool's dialect, the child claims while it runs. */
  write_scope: z.array(z.string()).default([]),
  /** PD-ORCH-004: the task_id of your own child whose report offered a continuation; the new child is recorded as continuing it. */
  continuation_of: z.string().optional(),
});

/** REQ-TOOLS-153: `Task '<canonical>': <status> — <message>` then `task_id: <id>` wherever one was issued. */
export function renderDelegateObservation(canonical: string, status: string, message: string, taskId: string | null): string {
  return `Task '${canonical}': ${status} — ${message}${taskId ? `\ntask_id: ${taskId}` : ''}`;
}

export function delegateTool(port: DelegationPort, parentId: string): ToolExecutor<z.infer<typeof delegateSchema>> {
  return {
    name: 'delegate',
    // OQ-114 as ruled (R-071, PD-ORCH-004 revision 5): `continuation_of`'s sentence says a continuation starts with no memory.
    description: 'Delegate a task to a specialist persona (requirements-engineer, codebase-analyst, librarian, architect, planner, coding-agent, tester, docs-writer, refactorer, verifier, ui-verifier, gatekeeper; aliases coder, playwright). Write the task with the sections TASK, EXPECTED OUTCOME, MUST DO, MUST NOT DO, CONTEXT. Returns at once with a task_id; the child runs in the background unless run_in_background is false. When the child will write files, give write_scope: path globs relative to the workspace root (for example src/api/**); while the child runs, no other agent of this run may write into those paths with write_file or haet_edit. When a child\'s report makes a continuation offer, give continuation_of: that child\'s task_id, to delegate the remaining work as its continuation. A continuation starts with no memory of the child it continues: write its task as a complete brief of what was asked, what that child did and found, and what remains. To ask a child of yours that has ended something more, give session_id: its task_id — it resumes its own conversation with task as its next message and reports again; a child cut off by its time limit is continued with continuation_of instead.',
    schema: delegateSchema,
    label: (a) => `delegate ${a.persona}: ${a.task_name}`,
    execute: async (a) => {
      const r = await port.delegate(parentId, { persona: a.persona, taskName: a.task_name, task: a.task, dependsOn: a.depends_on, inheritedContext: a.inherited_context, category: a.category ?? '', runInBackground: a.run_in_background, attachArtifacts: a.attach_artifacts, writeScope: a.write_scope, ...(a.continuation_of === undefined ? {} : { continuationOf: a.continuation_of }), ...(a.suppress_auto_context ? { suppressAutoContext: true } : {}), ...(a.session_id === undefined || a.session_id === '' ? {} : { sessionId: a.session_id }) });
      if (r.status === 'rejected') return errorObservation(renderDelegateObservation(r.canonicalName, 'rejected', r.message, null));
      // REQ-LIBRARY-098 (Part Y): the attachments are injected as the child's `PRIOR AGENT CONTEXT (FULL)` block; what
      // the store could not resolve is reported HERE, to the caller, rather than only inside the child's own block.
      // The placeholder this replaced said "the artifact store is not built yet"; it is, and the falsified line is gone
      // from the code with its reason kept in this comment.
      const warnings: string[] = [];
      if (r.attachments) {
        if (r.attachments.attached > 0) warnings.push(`${countNoun(r.attachments.attached, 'artifact')} ${r.attachments.attached === 1 ? 'was' : 'were'} attached to its context.`);
        if (r.attachments.unresolved.length > 0) warnings.push(`${countNoun(r.attachments.unresolved.length, 'attachment')} could not be resolved: ${r.attachments.unresolved.join(', ')}.`);
      }
      let text = renderDelegateObservation(r.canonicalName, r.status, [r.message, ...warnings].join(' '), r.taskId);
      if (!a.run_in_background) {
        // REQ-TOOLS-153: the same mechanism as wait_for_tasks, over exactly this one task.
        const w = await port.waitForTasks(parentId, [r.taskId]);
        // PD-ORCH-005: a wait cut short by the run coming to rest still delegated — the child exists and is paused with
        // the run — so the call reports the task id and the interrupted wait, and is NOT marked interrupted: an agent told
        // "not re-run" would delegate the same work twice.
        text += `\n\n${'refused' in w ? w.refused : 'interrupted' in w ? w.interrupted : w.text}`;
      }
      return observation(text);
    },
  };
}

const outputSchema = z.object({ task_id: z.string().min(1), detail_level: z.enum(['summary', 'verbatim']).default('summary') });

export function backgroundOutputTool(port: DelegationPort, parentId: string): ToolExecutor<z.infer<typeof outputSchema>> {
  return {
    name: 'background_output',
    description: "Retrieve a completed child task's report by task_id (your own children only). detail_level 'summary' or 'verbatim'.",
    schema: outputSchema,
    label: (a) => `background_output ${a.task_id}`,
    execute: async (a) => {
      const r = port.backgroundOutput(parentId, a.task_id, a.detail_level);
      if (r.status === 'not_found') return errorObservation(`Task ${a.task_id} was not found among your children.`);
      if (r.status === 'still_running') return observation(`Task ${a.task_id} is still running (state: ${r.state}).`);
      return observation(r.text);
    },
  };
}

const waitSchema = z.object({ task_ids: z.array(z.string()).default([]) });

export function waitForTasksTool(port: DelegationPort, parentId: string): ToolExecutor<z.infer<typeof waitSchema>> {
  return {
    name: 'wait_for_tasks',
    description: 'Wait until the named child tasks (or, with an empty list, all of your active background children) reach a terminal state; returns their reports. Only your direct children; never your own task.',
    schema: waitSchema,
    label: (a) => `wait_for_tasks ${a.task_ids.join(', ') || '(all)'}`,
    execute: async (a) => {
      const r = await port.waitForTasks(parentId, a.task_ids);
      if ('refused' in r) return errorObservation(r.refused);
      // PD-ORCH-005: the run came to rest while this call waited; the wait is interrupted and never re-run.
      if ('interrupted' in r) return errorObservation(r.interrupted, { failureKind: INTERRUPTED_FAILURE_KIND });
      return observation(r.text);
    },
  };
}
