import { countNoun } from '@rotaris/kernel';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * REQ-TOOLS-144..147: the task-list tool. Phases hold ordered tasks; both carry stable 8-hex ids;
 * targeting is by id; at most one task IN_PROGRESS; `replace` protects finished and active work by id.
 * The list is session-scoped and is the agent's own (REQ-ORCH-075), distinct from the loop's task
 * ledger. Its persistence with session state (REQ-TOOLS-147) waits on the per-child record of Part B
 * (REQ-ORCH-043's live serialised todo) and is said so in codebase.md.
 */
export type TodoState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
export interface TodoTask { readonly id: string; name: string; description: string; state: TodoState }
export interface TodoPhase { readonly id: string; name: string; readonly tasks: TodoTask[] }

export const hexId = (): string => randomBytes(4).toString('hex');

export class TodoList {
  readonly phases: TodoPhase[] = [];

  constructor(document?: { readonly phases: readonly { readonly id: string; readonly name: string; readonly tasks: readonly TodoTask[] }[] } | null) {
    if (document) this.phases.push(...document.phases.map((phase) => ({ ...phase, tasks: phase.tasks.map((task) => ({ ...task })) })));
  }

  findTask(id: string): { phase: TodoPhase; task: TodoTask } | undefined {
    for (const phase of this.phases) for (const task of phase.tasks) if (task.id === id) return { phase, task };
    return undefined;
  }
  findPhase(id: string): TodoPhase | undefined {
    return this.phases.find((p) => p.id === id);
  }
  /**
   * REQ-TOOLS-145 as `PD-TOOLS-008` revision 2 bounds it: the first IN_PROGRESS task outside `held`, the tasks a non-terminal
   * child of the list's owner holds as its `todo_item`. With no `held`, the first IN_PROGRESS task.
   */
  active(held?: ReadonlySet<string>): TodoTask | undefined {
    for (const p of this.phases) for (const t of p.tasks) if (t.state === 'IN_PROGRESS' && !(held?.has(t.id) ?? false)) return t;
    return undefined;
  }
  /** REQ-TOOLS-147: the rendered summary every observation appends. */
  render(): string {
    if (this.phases.length === 0) return 'Todo state:\n(no phases)';
    const lines = ['Todo state:'];
    for (const p of this.phases) {
      lines.push(`Phase ${p.name} (${p.id})`);
      for (const t of p.tasks) {
        const d = t.description.length > 80 ? `${t.description.slice(0, 77)}…` : t.description;
        lines.push(`  [${t.state}] ${t.name} (${t.id})${d ? ` — ${d}` : ''}`);
      }
    }
    return lines.join('\n');
  }
  toDocument(): { schema_version: 1; phases: TodoPhase[] } {
    return { schema_version: 1, phases: this.phases.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks.map((t) => ({ ...t })) })) };
  }
}

const singleActive = (id: string, name: string) => `Only one task can be IN_PROGRESS at a time. Active task: ${id} (${name}). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.`;

/**
 * PD-TOOLS-008 (OQ-163, ruled by the owner under R-071): a `replace` whose own list marks more than one task `IN_PROGRESS`
 * while no task is active is still refused, but REQ-TOOLS-145's sentence names an "Active task" that does not exist. Until
 * fin21 it named the first of the list's tasks under the id the rejected `replace` minted, and the agent's `update` of that
 * id was refused "Unknown task id" (live-run finding a71-7,
 * docs/defects/fixed/a-rejected-todo-replace-names-an-active-task-it-never-stored.md). This sentence says what the list did
 * and that nothing was saved, and names the tasks by the names the agent sent, since no id of theirs was ever stored.
 */
const listMarksSeveralActive = (names: readonly string[], delegates: boolean) =>
  `Only one task can be IN_PROGRESS at a time. The submitted list marks ${names.length} tasks IN_PROGRESS (${names.map((n) => `'${n}'`).join(', ')}), so the replace was rejected and nothing was saved. Send it again with at most one task IN_PROGRESS.${delegates ? ` ${DELEGATE_HINT}` : ''}`;

/** PD-TOOLS-008 revision 2: the hint its sentence carries for a caller whose resolved set holds `delegate`. */
export const DELEGATE_HINT = 'Leave the items you will delegate PENDING: a delegate call that names one in todo_item marks it IN_PROGRESS.';

/**
 * PD-TOOLS-008 revision 2 (OQ-249, ruled 2026-10-07 under the owner's delegation, R-072): what the run tells the tool about
 * its owner. `held` is the set of task ids a non-terminal child of the list's owner holds as its `todo_item`
 * (`PD-TOOLS-006` revision 6), read at each call; those tasks are outside REQ-TOOLS-145's count. `delegates` is whether the
 * owner's resolved tool set holds `delegate`, which adds the hint to this directive's sentence. With neither, the tool
 * behaves exactly as before the revision.
 */
export interface TodoToolOptions {
  readonly held?: (() => ReadonlySet<string>) | undefined;
  /**
   * PD-TOOLS-008 revision 3 (OQ-255, ruled 2026-10-13 under R-072): the task ids any child of the list's owner records as its
   * `todo_item`, terminal children included, read at each call. A served IN_PROGRESS task outside `held` is one whose delegation
   * has ended, and a `replace` closes it. Absent, nothing is served and `replace` restores every IN_PROGRESS task as before.
   */
  readonly served?: (() => ReadonlySet<string>) | undefined;
  readonly delegates?: boolean | (() => boolean) | undefined;
}
const NONE_HELD: ReadonlySet<string> = new Set();

const taskInput = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  state: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED']).optional(),
});
const phaseInput = z.object({ id: z.string().optional(), name: z.string(), tasks: z.array(taskInput).default([]) });

/**
 * REQ-TOOLS-144's five, closed. The set was `z.string()` until 2026-09-16, so the advertised schema told the
 * model nothing about which operations exist and the refusal for a wrong one arrived only from `execute`.
 * Tightening it moves that refusal ahead of `execute`, which is why `validationError` below exists: the
 * requirement mandates the words `Unsupported operation: <op>`, and a schema refusal would otherwise answer
 * with the gate's generic "do not match its schema" and make the mandated string unreachable — the same
 * ordering fault `docs/defects/fixed/a-misspelled-tool-reads-as-withheld-at-the-plan-gate.md` records.
 */
const OPERATIONS = ['replace', 'add_phase', 'add_task', 'update', 'remove_task'] as const;
const unsupported = (op: string): string => `Unsupported operation: ${op}. The operations are ${OPERATIONS.join(', ')}.`;

const todoSchema = z.object({
  operation: z.enum(OPERATIONS),
  phases: z.array(phaseInput).optional(),
  phase_id: z.string().optional(),
  task_id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  state: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED']).optional(),
  task: taskInput.optional(),
});

const PROTECTED: ReadonlySet<TodoState> = new Set(['COMPLETED', 'ABANDONED', 'IN_PROGRESS']);
const CLOSED: ReadonlySet<TodoState | undefined> = new Set<TodoState | undefined>(['COMPLETED', 'ABANDONED']);

/**
 * PD-TOOLS-008 revision 3: why a `replace` kept a protected task in a state other than the one its list sent, in the
 * directive's four words. Finished work first (a held task can be finished: a read-only child may serve one), then a running
 * holder, then an active task sent back to PENDING; what is left is the agent's own active task sent closed.
 */
const keptReason = (task: TodoTask, sent: TodoState, held: boolean): string =>
  task.state === 'COMPLETED' || task.state === 'ABANDONED' ? 'finished work is never reopened'
    : held ? 'a running delegated agent holds it'
      : sent === 'PENDING' ? 'an active task is never set back to PENDING'
        : 'your active task is closed with update';

/**
 * REQ-TOOLS-013 / REQ-TOOLS-147's shape: a refusal says what to do instead. A call carrying `phases` to an
 * operation that adds one thing is the batch the schema's own `phases` field invites, so the refusal names
 * the operation that takes it and says what became of what was sent.
 */
const batchRemedy = (phases: number, what: string): string =>
  phases === 0 ? '' : ` ${what} at a time and does not read \`phases\`, so the ${phases === 1 ? 'phase' : `${phases} phases`} sent here ${phases === 1 ? 'was' : 'were'} not added; call replace with the whole \`phases\` array to create them in one call.`;

const fieldsFor = (op: string): string => ({
  replace: 'replace reads `phases`: [{name, tasks: [{name, description, state}]}].',
  add_phase: 'add_phase reads `name`.',
  add_task: 'add_task reads `phase_id` and `name`, and optionally `description` and `state` (or a nested `task`).',
  update: 'update reads `task_id`, and whichever of `name`, `description` and `state` is to change.',
  remove_task: 'remove_task reads `task_id`.',
}[op] ?? `The operations are ${OPERATIONS.join(', ')}.`);

export function todoTool(list: TodoList, opts: TodoToolOptions = {}): ToolExecutor<z.infer<typeof todoSchema>> {
  const heldNow = (): ReadonlySet<string> => opts.held?.() ?? NONE_HELD;
  const servedNow = (): ReadonlySet<string> => opts.served?.() ?? NONE_HELD;
  const hint = () => {
    const phases = list.phases.map((p) => `${p.name} (${p.id})`).join(', ') || '(none)';
    const tasks = list.phases.flatMap((p) => p.tasks.map((t) => `${t.name} (${t.id})`)).join(', ') || '(none)';
    return `Available phases: ${phases}. Available tasks: ${tasks}.`;
  };
  const done = (msg: string) => observation(`${msg}\n${list.render()}`);
  return {
    name: 'todo',
    // Each operation names the fields it reads. Before 2026-09-16 this line listed the five names and nothing
    // else, and a run read `add_phase` as the way to send a whole plan's phases — the shape only `replace` takes.
    description: [
      'Maintain the task list. One operation per call, and each reads its own fields:',
      // PD-TOOLS-008 revision 3 (OQ-255): it said, until 2026-10-13, "COMPLETED, ABANDONED and IN_PROGRESS tasks are kept by id
      // whatever the incoming list says." — true of the code until then, and the reason a coordinator that closed its delegated
      // plan with one replace left the items the run had marked IN_PROGRESS open, with no word of it.
      'replace {phases: [{name, tasks: [{name, description, state}]}]} — the WHOLE list at once, and the only operation that takes a batch; COMPLETED and ABANDONED tasks, your own IN_PROGRESS task and a task a running delegated agent holds are kept by id whatever the incoming list says, and the result names each one kept over a different state; a delegated task whose agent has ended takes the COMPLETED or ABANDONED the list sends.',
      'add_phase {name} — ONE empty phase; it does not read `phases`.',
      'add_task {phase_id, name, description, state} — ONE task in an existing phase.',
      'update {task_id, name, description, state} — one task; a change that changes nothing is an error.',
      'remove_task {task_id}.',
      // PD-TOOLS-008 revision 2 (OQ-249): the bound is the agent's own tasks. It said, until 2026-10-07, "At most one task
      // IN_PROGRESS." — true of a list no delegation holds, and the reason a coordinator's second running child's item stayed
      // PENDING (the default live run at a68f121, edit #14).
      'Phases and tasks carry stable 8-hex ids; target by id, never by name. At most one task IN_PROGRESS of your own; a task a running delegated agent holds through todo_item is not counted, and a delegate call naming a PENDING task marks it IN_PROGRESS.',
    ].join(' '),
    schema: todoSchema,
    label: (a) => `todo ${a.operation}`,
    execute: async (a) => {
      switch (a.operation) {
        case 'replace': {
          const incoming = a.phases ?? [];
          const held = heldNow();
          const served = servedNow();
          const protectedTasks = list.phases.flatMap((p) => p.tasks.filter((t) => PROTECTED.has(t.state)).map((t) => ({ phaseIndex: list.phases.indexOf(p), taskIndex: p.tasks.indexOf(t), task: { ...t } })));
          /*
           * PD-TOOLS-008 revision 3 (OQ-255): a served IN_PROGRESS task no running child holds — its delegation has ended — takes
           * the COMPLETED or ABANDONED the list sends for its id, and is then no active task against a mark in the same list.
           * Every other protected task is restored as REQ-TOOLS-146 states. Until 2026-10-13 every IN_PROGRESS task was restored,
           * so a delegated item `PD-TOOLS-006` revision 7 had marked could not be closed by a replace
           * (docs/defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md).
           */
          const closes = new Map<string, TodoState>();
          for (const p of incoming) for (const t of p.tasks) {
            if (t.id === undefined || closes.has(t.id) || !CLOSED.has(t.state) || !served.has(t.id) || held.has(t.id)) continue;
            if (protectedTasks.some((x) => x.task.id === t.id && x.task.state === 'IN_PROGRESS')) closes.set(t.id, t.state!);
          }
          const protectedActive = new Set(protectedTasks.filter((x) => x.task.state === 'IN_PROGRESS').map((x) => x.task.id));
          /*
           * PD-TOOLS-008 revision 2: what this replace newly marks IN_PROGRESS — an incoming task marked so that is not already a
           * protected IN_PROGRESS task (a protected task the replace restores never counts against it) and that no running
           * delegation holds. Revision 1 counted every incoming IN_PROGRESS task beside the one active task, so a coordinator's
           * list could carry only one running delegation's item (OQ-249).
           */
          const newlyMarked = incoming.flatMap((p) => p.tasks.filter((t) => t.state === 'IN_PROGRESS' && !(t.id !== undefined && (protectedActive.has(t.id) || held.has(t.id)))));
          const activeProtected = protectedTasks.find((x) => x.task.state === 'IN_PROGRESS' && !held.has(x.task.id) && !closes.has(x.task.id));
          // REQ-TOOLS-146: a replace that marks some OTHER task IN_PROGRESS while an unheld protected active task exists is rejected.
          if (activeProtected && newlyMarked.length > 0) {
            return errorObservation(singleActive(activeProtected.task.id, activeProtected.task.name));
          }
          // PD-TOOLS-008 revision 3: each task restored over a different state the list sent, in list order; a task sent with no
          // state, and an omitted one, differ from nothing.
          const kept: string[] = [];
          const next: TodoPhase[] = incoming.map((p) => ({
            id: p.id ?? hexId(), name: p.name,
            tasks: p.tasks.map((t) => {
              const prot = protectedTasks.find((x) => x.task.id === t.id);
              if (prot) {
                const closed = closes.get(prot.task.id);
                if (closed !== undefined) return { ...prot.task, state: closed };
                if (t.state !== undefined && t.state !== prot.task.state) kept.push(`${prot.task.name} (${prot.task.id}) ${prot.task.state}, ${keptReason(prot.task, t.state, held.has(prot.task.id))}`);
                return { ...prot.task };
              }
              return { id: t.id ?? hexId(), name: t.name ?? t.title ?? 'task', description: t.description ?? '', state: t.state ?? 'PENDING' };
            }),
          }));
          // a protected task the incoming list omits is kept, in its existing position
          for (const prot of protectedTasks) {
            if (next.some((p) => p.tasks.some((t) => t.id === prot.task.id))) continue;
            const phase = next[Math.min(prot.phaseIndex, Math.max(0, next.length - 1))] ?? (next.push({ id: hexId(), name: 'main', tasks: [] }), next[0]!);
            phase.tasks.splice(Math.min(prot.taskIndex, phase.tasks.length), 0, { ...prot.task });
          }
          // An unheld protected active task can remain here only when the list newly marks nothing (the REQ-TOOLS-146 rejection
          // above answers a list that marks another beside one), and it is restored, not counted. So a second IN_PROGRESS can
          // only come from the submitted list itself: PD-TOOLS-008's sentence, not REQ-TOOLS-145's. It counts the unheld tasks
          // the list newly marks (revision 2); a held task and a restored protected one are not counted.
          const actives = next.flatMap((p) => p.tasks.filter((t) => t.state === 'IN_PROGRESS' && !protectedActive.has(t.id) && !held.has(t.id)));
          if (actives.length > 1) return errorObservation(listMarksSeveralActive(actives.map((t) => t.name), typeof opts.delegates === 'function' ? opts.delegates() : opts.delegates === true));
          list.phases.splice(0, list.phases.length, ...next);
          const keptSentence = kept.length === 0 ? '' : ` Kept as they were: ${kept.join('; ')}. Change a task's state with update.`;
          return done(`Replaced the todo list: ${countNoun(next.length, 'phase')}, ${countNoun(next.reduce((n, p) => n + p.tasks.length, 0), 'task')}.${keptSentence}`);
        }
        case 'add_phase': {
          const name = a.name ?? a.title;
          if (!name) return errorObservation(`add_phase requires a name.${batchRemedy(a.phases?.length ?? 0, 'add_phase adds one phase')} ${hint()}`);
          const phase: TodoPhase = { id: hexId(), name, tasks: [] };
          list.phases.push(phase);
          return done(`Added phase ${name} (${phase.id}).`);
        }
        case 'add_task': {
          const flat = a.task ?? { name: a.name, title: a.title, description: a.description, state: a.state };
          const name = flat.name ?? flat.title;
          if (!name) return errorObservation(`add_task requires a task name (or title).${batchRemedy(a.phases?.length ?? 0, 'add_task adds one task')} ${hint()}`);
          if (!a.phase_id) return errorObservation(`add_task requires phase_id. ${hint()}`);
          const phase = list.findPhase(a.phase_id);
          if (!phase) return errorObservation(`Unknown phase id '${a.phase_id}'. ${hint()}`);
          const state = flat.state ?? 'PENDING';
          // PD-TOOLS-008 revision 2: a new task is never held, so it counts; the active task named is the first unheld one.
          const active = list.active(heldNow());
          if (state === 'IN_PROGRESS' && active) return errorObservation(singleActive(active.id, active.name));
          const task: TodoTask = { id: hexId(), name, description: flat.description ?? '', state };
          phase.tasks.push(task);
          return done(`Added task ${name} (${task.id}) to phase ${phase.name}.`);
        }
        case 'update': {
          if (!a.task_id) return errorObservation(`update requires task_id. ${hint()}`);
          const found = list.findTask(a.task_id);
          if (!found) return errorObservation(`Unknown task id '${a.task_id}'. ${hint()}`);
          const { task } = found;
          const changes: string[] = [];
          const name = a.name ?? a.title;
          if (name !== undefined && name !== task.name) { task.name = name; changes.push('name'); }
          if (a.description !== undefined && a.description !== task.description) { task.description = a.description; changes.push('description'); }
          if (a.state !== undefined && a.state !== task.state) {
            // PD-TOOLS-008 revision 2: marking a task a running delegation holds is never counted; marking any other is refused
            // while another unheld task is active, naming it.
            const held = heldNow();
            const active = list.active(held);
            if (a.state === 'IN_PROGRESS' && !held.has(task.id) && active && active.id !== task.id) return errorObservation(singleActive(active.id, active.name));
            task.state = a.state;
            changes.push('state');
          }
          if (changes.length === 0) return errorObservation(`Todo update made no changes to ${task.name} (${task.id}); supply a different name, description or state.`);
          return done(`Updated task ${task.name} (${task.id}): ${changes.join(', ')}.`);
        }
        case 'remove_task': {
          if (!a.task_id) return errorObservation(`remove_task requires task_id. ${hint()}`);
          const found = list.findTask(a.task_id);
          if (!found) return errorObservation(`Unknown task id '${a.task_id}'. ${hint()}`);
          found.phase.tasks.splice(found.phase.tasks.indexOf(found.task), 1);
          return done(`Removed task ${found.task.name} (${found.task.id}).`);
        }
        default:
          // Unreachable through the gate — the schema refuses an operation outside the five before `execute`
          // is called, and `validationError` answers it in REQ-TOOLS-144's words. Kept for a direct caller.
          return errorObservation(unsupported(String(a.operation)));
      }
    },
    /**
     * REQ-TOOLS-144's mandated refusal, raised where the operation is now refused: at the schema. Anything
     * else the schema rejects keeps the gate's own detail and gains the per-operation fields, which is the
     * only place a caller that sent the wrong shape will read them.
     */
    validationError: (args, detail) => {
      const op = args['operation'];
      if (typeof op === 'string' && !(OPERATIONS as readonly string[]).includes(op)) return errorObservation(unsupported(op));
      if (typeof op !== 'string') return errorObservation(`todo requires an operation: one of ${OPERATIONS.join(', ')}.`);
      return errorObservation(`The arguments for '${op}' do not match the todo schema (${detail}). ${fieldsFor(op)}`);
    },
  };
}
