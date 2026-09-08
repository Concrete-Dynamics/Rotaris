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
  active(): TodoTask | undefined {
    for (const p of this.phases) for (const t of p.tasks) if (t.state === 'IN_PROGRESS') return t;
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

const taskInput = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  state: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED']).optional(),
});
const phaseInput = z.object({ id: z.string().optional(), name: z.string(), tasks: z.array(taskInput).default([]) });

const todoSchema = z.object({
  operation: z.string(),
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

export function todoTool(list: TodoList): ToolExecutor<z.infer<typeof todoSchema>> {
  const hint = () => {
    const phases = list.phases.map((p) => `${p.name} (${p.id})`).join(', ') || '(none)';
    const tasks = list.phases.flatMap((p) => p.tasks.map((t) => `${t.name} (${t.id})`)).join(', ') || '(none)';
    return `Available phases: ${phases}. Available tasks: ${tasks}.`;
  };
  const done = (msg: string) => observation(`${msg}\n${list.render()}`);
  return {
    name: 'todo',
    description: 'Maintain the task list: replace, add_phase, add_task, update, remove_task. Phases and tasks carry stable ids; target by id. At most one task IN_PROGRESS.',
    schema: todoSchema,
    label: (a) => `todo ${a.operation}`,
    execute: async (a) => {
      switch (a.operation) {
        case 'replace': {
          const incoming = a.phases ?? [];
          const protectedTasks = list.phases.flatMap((p) => p.tasks.filter((t) => PROTECTED.has(t.state)).map((t) => ({ phaseIndex: list.phases.indexOf(p), taskIndex: p.tasks.indexOf(t), task: { ...t } })));
          const activeProtected = protectedTasks.find((x) => x.task.state === 'IN_PROGRESS');
          // REQ-TOOLS-146: a replace that marks some OTHER task IN_PROGRESS while a protected active task exists is rejected.
          if (activeProtected && incoming.some((p) => p.tasks.some((t) => t.state === 'IN_PROGRESS' && t.id !== activeProtected.task.id))) {
            return errorObservation(singleActive(activeProtected.task.id, activeProtected.task.name));
          }
          const next: TodoPhase[] = incoming.map((p) => ({
            id: p.id ?? hexId(), name: p.name,
            tasks: p.tasks.map((t) => {
              const prot = protectedTasks.find((x) => x.task.id === t.id);
              if (prot) return { ...prot.task };
              return { id: t.id ?? hexId(), name: t.name ?? t.title ?? 'task', description: t.description ?? '', state: t.state ?? 'PENDING' };
            }),
          }));
          // a protected task the incoming list omits is kept, in its existing position
          for (const prot of protectedTasks) {
            if (next.some((p) => p.tasks.some((t) => t.id === prot.task.id))) continue;
            const phase = next[Math.min(prot.phaseIndex, Math.max(0, next.length - 1))] ?? (next.push({ id: hexId(), name: 'main', tasks: [] }), next[0]!);
            phase.tasks.splice(Math.min(prot.taskIndex, phase.tasks.length), 0, { ...prot.task });
          }
          const actives = next.flatMap((p) => p.tasks.filter((t) => t.state === 'IN_PROGRESS'));
          if (actives.length > 1) return errorObservation(singleActive(actives[0]!.id, actives[0]!.name));
          list.phases.splice(0, list.phases.length, ...next);
          return done(`Replaced the todo list: ${next.length} phase(s), ${next.reduce((n, p) => n + p.tasks.length, 0)} task(s).`);
        }
        case 'add_phase': {
          const name = a.name ?? a.title;
          if (!name) return errorObservation('add_phase requires a name.');
          const phase: TodoPhase = { id: hexId(), name, tasks: [] };
          list.phases.push(phase);
          return done(`Added phase ${name} (${phase.id}).`);
        }
        case 'add_task': {
          const flat = a.task ?? { name: a.name, title: a.title, description: a.description, state: a.state };
          const name = flat.name ?? flat.title;
          if (!name) return errorObservation('add_task requires a task name (or title).');
          if (!a.phase_id) return errorObservation(`add_task requires phase_id. ${hint()}`);
          const phase = list.findPhase(a.phase_id);
          if (!phase) return errorObservation(`Unknown phase id '${a.phase_id}'. ${hint()}`);
          const state = flat.state ?? 'PENDING';
          const active = list.active();
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
            const active = list.active();
            if (a.state === 'IN_PROGRESS' && active && active.id !== task.id) return errorObservation(singleActive(active.id, active.name));
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
          return errorObservation(`Unsupported operation: ${a.operation}`);
      }
    },
  };
}
