import { countNoun } from '@rotaris/kernel';
import { z } from 'zod';
import { grantsOn, type Facet } from '../registry.js';
import { errorObservation, INTERRUPTED_FAILURE_KIND, observation, type ToolExecutor } from './types.js';

/**
 * REQ-TOOLS-152/153/155/156: the three delegation tools over a port the engine fills. What the caller
 * observes is REQ-TOOLS-153's two-line rendering; `delegate` never suspends the parent;
 * `run_in_background: false` enrols the parent in the one waiting mechanism as if it had called
 * `wait_for_tasks` with the returned id.
 */
/**
 * PD-TOOLS-006 revision 5 (REQ-TOOLS-152, REQ-TOOLS-153): what the child will be given of the caller's attachments, as the
 * engine's one selection decides it — the count carried whole, the ids left out for size under `budget` characters, the
 * references that resolved to nothing and the ids whose document could not be read.
 */
export interface AttachmentReport {
  given: number;
  elidedForSize: readonly string[];
  unresolved: readonly string[];
  unreadable: readonly string[];
  budget: number;
}

/**
 * REQ-TOOLS-153's attachment warning, as PD-TOOLS-006 revision 5 states its content: how many attachments the child is given
 * whole; how many were left out for size, by id, with the budget; and the references and documents that failed. The wording
 * is the implementation's. Until 2026-10-07 it said "N artifacts were attached to its context", counting the references that
 * resolved before the budget applied, so a caller could be told of an artifact its child never received.
 */
export function attachmentWarnings(a: AttachmentReport): readonly string[] {
  const warnings: string[] = [];
  const wereWas = (n: number) => (n === 1 ? 'was' : 'were');
  warnings.push(a.given > 0
    ? `${countNoun(a.given, 'attached artifact')} will be given to the child whole.`
    : 'No attached artifact will be given to the child.');
  if (a.elidedForSize.length > 0) {
    const n = a.elidedForSize.length;
    warnings.push(`${countNoun(n, 'attached artifact')} ${wereWas(n)} left out for size, because ${n === 1 ? 'its' : 'each'} whole body would carry the ${a.budget.toLocaleString('en-US')}-character attachment budget past its limit: ${a.elidedForSize.join(', ')}; the child is told and can fetch ${n === 1 ? 'it' : 'them'} with artifact_read.`);
  }
  if (a.unresolved.length > 0) warnings.push(`${countNoun(a.unresolved.length, 'attachment')} could not be resolved: ${a.unresolved.join(', ')}.`);
  if (a.unreadable.length > 0) warnings.push(`The document of ${countNoun(a.unreadable.length, 'attached artifact')} could not be read: ${a.unreadable.join(', ')}.`);
  return warnings;
}

export interface DelegationPort {
  delegate(parentId: string, req: { persona: string; taskName: string; task: string; dependsOn: readonly string[]; inheritedContext: readonly string[]; category: string; runInBackground: boolean; attachArtifacts: readonly string[]; writeScope: readonly string[]; continuationOf?: string | undefined; suppressAutoContext?: boolean | undefined; sessionId?: string | undefined }): Promise<
    | { status: 'queued' | 'waiting_on_dependencies' | 'waiting_on_model_slot'; canonicalName: string; taskId: string; message: string; attachments?: AttachmentReport | undefined }
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

/**
 * PD-TOOLS-006 revision 4 (OQ-216, ruled 2026-10-07 under R-072): the personas one calling agent can delegate to, each with
 * the native tools a child of that agent would be granted after REQ-TOOLS-006's controls — the run host resolves them with
 * the very function the child's own port applies — and each alias whose target exists, with that target.
 */
export interface DelegateCatalogue {
  readonly personas: readonly { readonly name: string; readonly tools: readonly string[] }[];
  readonly aliases: readonly { readonly alias: string; readonly target: string }[];
}

const FACET_WORDS: readonly (readonly [Facet, string])[] = [
  ['readsWorkspaceFiles', 'reads workspace files'],
  ['writesWorkspaceFiles', 'writes workspace files'],
  ['runsCommands', 'runs commands'],
];

/**
 * PD-TOOLS-006 revision 4: what a grant lets its holder do, as the REQ-TOOLS-001 facets its tools declare (`grantsOn`: a
 * name outside the registry declares nothing, so only the product's own tools are counted).
 */
export function grantFacets(tools: readonly string[]): readonly string[] {
  return FACET_WORDS.filter(([facet]) => tools.some((t) => grantsOn(t, facet))).map(([, words]) => words);
}

/**
 * PD-TOOLS-006 revision 4: the catalogue as `delegate`'s description states it — every persona with its facets, a persona
 * declaring none said to, the aliases, and the instruction to ask a persona only for work its tools allow.
 *
 * The reason the description carries it, kept beside the repair: until 2026-10-07 it named the built-in personas only, the
 * same list for every caller, and in both duress live runs of 2026-10-06 the coordinator briefed `docs-writer` children,
 * which hold no `terminal`, to run the tests themselves (findings L4 and N3).
 */
export function renderDelegateCatalogue(catalogue: DelegateCatalogue): string {
  const personas = catalogue.personas.map((p) => {
    const facets = grantFacets(p.tools);
    return `${p.name} (${facets.length > 0 ? facets.join(', ') : 'none of these: it neither reads nor writes workspace files nor runs commands'})`;
  });
  const aliases = catalogue.aliases.length > 0 ? ` Aliases: ${catalogue.aliases.map((a) => `${a.alias} (${a.target})`).join(', ')}.` : '';
  return `The personas you can delegate to, each with what the product's own tools a child of yours would be granted let it do (tool-server and plugin tools are not described): ${personas.join('; ')}.${aliases} Ask a persona only for work its tools allow: a persona that does not run commands cannot run tests, builds or scripts, and one that does not write workspace files cannot change a file. Where a persona that runs no commands needs command output, delegate the command to a persona that runs commands and hand its result on with depends_on or inherited_context.`;
}

export function delegateTool(port: DelegationPort, parentId: string, catalogue: DelegateCatalogue): ToolExecutor<z.infer<typeof delegateSchema>> {
  return {
    name: 'delegate',
    // OQ-114 as ruled (R-071, PD-ORCH-004 revision 5): `continuation_of`'s sentence says a continuation starts with no memory.
    // PD-TOOLS-006 revision 4 (OQ-216): the persona list is the caller's catalogue with each persona's facets; the sentences
    // after it are unchanged.
    description: `Delegate a task to a specialist persona. ${renderDelegateCatalogue(catalogue)} Write the task with the sections TASK, EXPECTED OUTCOME, MUST DO, MUST NOT DO, CONTEXT. Returns at once with a task_id; the child runs in the background unless run_in_background is false. When the child will write files, give write_scope: path globs relative to the workspace root (for example src/api/**); while the child runs, no other agent of this run may write into those paths with write_file or haet_edit. When a child's report makes a continuation offer, give continuation_of: that child\'s task_id, to delegate the remaining work as its continuation. A continuation starts with no memory of the child it continues: write its task as a complete brief of what was asked, what that child did and found, and what remains. To ask a child of yours that has ended something more, give session_id: its task_id — it resumes its own conversation with task as its next message and reports again; a child cut off by its time limit is continued with continuation_of instead.`,
    schema: delegateSchema,
    label: (a) => `delegate ${a.persona}: ${a.task_name}`,
    execute: async (a) => {
      const r = await port.delegate(parentId, { persona: a.persona, taskName: a.task_name, task: a.task, dependsOn: a.depends_on, inheritedContext: a.inherited_context, category: a.category ?? '', runInBackground: a.run_in_background, attachArtifacts: a.attach_artifacts, writeScope: a.write_scope, ...(a.continuation_of === undefined ? {} : { continuationOf: a.continuation_of }), ...(a.suppress_auto_context ? { suppressAutoContext: true } : {}), ...(a.session_id === undefined || a.session_id === '' ? {} : { sessionId: a.session_id }) });
      if (r.status === 'rejected') return errorObservation(renderDelegateObservation(r.canonicalName, 'rejected', r.message, null));
      // REQ-LIBRARY-098 (Part Y): the attachments are injected as the child's `PRIOR AGENT CONTEXT (FULL)` block; what the
      // child will be given of them is reported HERE, to the caller, rather than only inside the child's own block
      // (PD-TOOLS-006 revision 5: the count given, the ids left out for size, the unresolved and the unreadable). The
      // placeholder this replaced said "the artifact store is not built yet"; it is, and the falsified line is gone from
      // the code with its reason kept in this comment.
      const warnings = r.attachments ? attachmentWarnings(r.attachments) : [];
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
