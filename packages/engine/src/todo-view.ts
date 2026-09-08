import type { TaskPlan } from '@rotaris/contracts';
import type { ChildRow, SessionRow } from '@rotaris/store';
import type { TodoDocument } from './run/todo.js';

/** REQ-TOOLS-144's persisted shape, repeated structurally across the package boundary. */
export interface AgentTodoDocument {
  readonly schema_version: 1;
  readonly phases: readonly AgentTodoPhase[];
}
export interface AgentTodoPhase {
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly AgentTodoTask[];
}
export interface AgentTodoTask {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
}

export interface StoredTodoState {
  readonly planner: TodoDocument | null;
  readonly agent: AgentTodoDocument | null;
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const phasesOf = (value: unknown): readonly unknown[] | null => object(value) && value['schema_version'] === 1 && Array.isArray(value['phases']) ? value['phases'] : null;

export function isAgentTodoDocument(value: unknown): value is AgentTodoDocument {
  const phases = phasesOf(value);
  return phases !== null && phases.every((phase) => object(phase) && typeof phase['id'] === 'string' && typeof phase['name'] === 'string' && Array.isArray(phase['tasks'])
    && phase['tasks'].every((task) => object(task) && typeof task['id'] === 'string' && typeof task['name'] === 'string' && typeof task['description'] === 'string' && ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'].includes(String(task['state']))));
}

export function isPlannerTodoDocument(value: unknown): value is TodoDocument {
  const phases = phasesOf(value);
  return phases !== null && phases.every((phase) => object(phase) && typeof phase['name'] === 'string' && Array.isArray(phase['tasks'])
    && phase['tasks'].every((task) => object(task) && typeof task['id'] === 'string' && typeof task['text'] === 'string' && typeof task['state'] === 'string'));
}

/**
 * REQ-CHAT-088/090: both todo models share the existing TEXT column. Version 2 is a JSON envelope inside that
 * column, so the database schema stays at v13 while both source documents survive every save and continuation.
 */
export function decodeStoredTodo(json: string | null): StoredTodoState {
  if (json === null || json === '') return { planner: null, agent: null };
  try {
    const value: unknown = JSON.parse(json);
    if (object(value) && value['schema_version'] === 2) {
      return {
        planner: isPlannerTodoDocument(value['planner']) ? value['planner'] : null,
        agent: isAgentTodoDocument(value['agent']) ? value['agent'] : null,
      };
    }
    if (isAgentTodoDocument(value)) return { planner: null, agent: value };
    if (isPlannerTodoDocument(value)) return { planner: value, agent: null };
  } catch { /* the resume validator reports malformed stored state */ }
  return { planner: null, agent: null };
}

export function encodeStoredTodo(state: StoredTodoState): string | null {
  if (state.agent === null) return state.planner === null ? null : JSON.stringify(state.planner);
  return JSON.stringify({ schema_version: 2, planner: state.planner, agent: state.agent });
}

/** REQ-CHAT-086/088: both backend spellings map through this single display vocabulary. */
export function displayTaskState(state: string): TaskPlan['phases'][number]['tasks'][number]['state'] {
  if (state === 'COMPLETED' || state === 'complete') return 'done';
  if (state === 'IN_PROGRESS' || state === 'in_progress') return 'active';
  if (state === 'ABANDONED' || state === 'abandoned') return 'abandoned';
  return 'open';
}

export function projectAgentTodo(document: AgentTodoDocument, source: 'agent' | 'child', ownerId: string | null, sourceLabel: string): TaskPlan {
  return {
    source, ownerId, sourceLabel,
    phases: document.phases.map((phase, phaseIndex) => ({
      id: phase.id || `phase-${phaseIndex + 1}`,
      name: phase.name,
      tasks: phase.tasks.map((task, taskIndex) => ({
        id: task.id || `${phase.id || `phase-${phaseIndex + 1}`}-task-${taskIndex + 1}`,
        text: task.name,
        state: displayTaskState(task.state),
      })),
    })),
  };
}

export function projectPlannerTodo(document: TodoDocument): TaskPlan {
  return {
    source: 'planner', ownerId: null, sourceLabel: 'Planner plan',
    phases: document.phases.map((phase, phaseIndex) => ({
      id: phase.name || `phase-${phaseIndex + 1}`,
      name: phase.name,
      tasks: phase.tasks.map((task, taskIndex) => ({
        id: task.id || `${phase.name || `phase-${phaseIndex + 1}`}-task-${taskIndex + 1}`,
        text: task.text,
        state: displayTaskState(task.state),
      })),
    })),
  };
}

export function projectSessionTodos(row: SessionRow, children: readonly ChildRow[]): { todo: TaskPlan | null; childTodos: Record<string, TaskPlan> } {
  const stored = decodeStoredTodo(row.todo);
  const todo = stored.agent !== null
    ? projectAgentTodo(stored.agent, 'agent', null, 'Agent plan')
    : stored.planner !== null ? projectPlannerTodo(stored.planner) : null;
  const childTodos: Record<string, TaskPlan> = {};
  for (const child of children) {
    if (child.todo === null) continue;
    try {
      const value: unknown = JSON.parse(child.todo);
      if (isAgentTodoDocument(value)) childTodos[child.task_id] = projectAgentTodo(value, 'child', child.task_id, `Child plan — ${child.canonical_name}`);
    } catch { /* one malformed child plan leaves the remaining plans available */ }
  }
  return { todo, childTodos };
}

export function editAgentTodo(document: AgentTodoDocument, op: 'add' | 'update' | 'remove', id: string, text: string, phaseId: string, mintId: () => string): { changed: boolean; document: AgentTodoDocument; id?: string } {
  const phases = document.phases.map((phase) => ({ ...phase, tasks: phase.tasks.map((task) => ({ ...task })) }));
  const body = text.trim();
  if (op === 'add') {
    const phase = phases.find((candidate) => candidate.id === phaseId);
    if (!phase || body === '') return { changed: false, document };
    const newId = mintId().toLowerCase();
    phase.tasks.push({ id: newId, name: body, description: '', state: 'PENDING' });
    return { changed: true, document: { schema_version: 1, phases }, id: newId };
  }
  for (const phase of phases) {
    const at = phase.tasks.findIndex((task) => task.id === id);
    if (at < 0) continue;
    if (op === 'remove') {
      phase.tasks.splice(at, 1);
      return { changed: true, document: { schema_version: 1, phases } };
    }
    if (body === '' || phase.tasks[at]!.name === body) return { changed: false, document };
    phase.tasks[at] = { ...phase.tasks[at]!, name: body };
    return { changed: true, document: { schema_version: 1, phases } };
  }
  return { changed: false, document };
}

/**
 * Part AH — REQ-MONITOR-084 (4): the agent's todo items as text, one line each, carried across a compression
 * ONE FOR ONE. The agent-maintained document wins over the planner's exactly as `projectSessionTodos` decides
 * it, so what the agent is told after a compression is what the surface was already showing it.
 */
export function todoLinesFromStored(json: string | null): string[] {
  const stored = decodeStoredTodo(json);
  if (stored.agent) return stored.agent.phases.flatMap((phase) => phase.tasks.map((task) => `[${displayTaskState(task.state)}] ${phase.name} — ${task.name}${task.description ? `: ${task.description}` : ''}`));
  if (stored.planner) return stored.planner.phases.flatMap((phase) => phase.tasks.map((task) => `[${displayTaskState(task.state)}] ${phase.name} — ${task.text}`));
  return [];
}
