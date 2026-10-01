import { describe, expect, it } from 'vitest';
import type { ChildRow, SessionRow } from '@rotaris/store';
import { decodeStoredTodo, displayTaskState, editAgentTodo, encodeStoredTodo, isPlannerTodoDocument, projectPlannerTodo, projectSessionTodos, todoLinesFromStored, type AgentTodoDocument } from './todo-view.js';

const agent: AgentTodoDocument = {
  schema_version: 1,
  phases: [{
    id: 'a1b2c3d4', name: 'Delivery', tasks: [
      { id: '00000001', name: 'open', description: '', state: 'PENDING' },
      { id: '00000002', name: 'active', description: '', state: 'IN_PROGRESS' },
      { id: '00000003', name: 'done', description: '', state: 'COMPLETED' },
      { id: '00000004', name: 'gone', description: '', state: 'ABANDONED' },
    ],
  }],
};

describe('todo projection (REQ-CHAT-085..091)', () => {
  it('maps both backend vocabularies into the four display states', () => {
    expect(['COMPLETED', 'complete', 'IN_PROGRESS', 'in_progress', 'ABANDONED', 'abandoned', 'PENDING', 'future'].map(displayTaskState))
      .toEqual(['done', 'done', 'active', 'active', 'abandoned', 'abandoned', 'open', 'open']);
  });

  it('keeps planner and agent documents together and gives the agent source priority', () => {
    const planner = { schema_version: 1 as const, phases: [{ name: 'main', tasks: [{ id: 'legacy', text: 'planner task', state: 'pending' as const, consecutiveRetries: 0 }] }] };
    const encoded = encodeStoredTodo({ planner, agent });
    expect(decodeStoredTodo(encoded)).toEqual({ planner, agent });
    const child = { task_id: 'child-1', canonical_name: 'worker', todo: JSON.stringify(agent) } as ChildRow;
    const projected = projectSessionTodos({ todo: encoded } as SessionRow, [child]);
    expect(projected.todo?.source).toBe('agent');
    expect(projected.todo?.phases[0]?.tasks.map((task) => task.state)).toEqual(['open', 'active', 'done', 'abandoned']);
    expect(projected.childTodos['child-1']?.sourceLabel).toBe('Child plan — worker');
  });

  it('assigns an 8-hex backend id and treats empty, unchanged, and unknown edits as no-ops', () => {
    const added = editAgentTodo(agent, 'add', '', 'new task', 'a1b2c3d4', () => 'deadbeef');
    expect(added.changed).toBe(true);
    expect(added.id).toBe('deadbeef');
    expect(added.document.phases[0]?.tasks.at(-1)?.id).toBe('deadbeef');
    expect(editAgentTodo(agent, 'update', '00000001', 'open', '', () => 'unused').changed).toBe(false);
    expect(editAgentTodo(agent, 'update', 'missing', 'x', '', () => 'unused').changed).toBe(false);
    expect(editAgentTodo(agent, 'add', '', '   ', 'a1b2c3d4', () => 'unused').changed).toBe(false);
  });
});

/**
 * REQ-CHAT-040 / REQ-ORCH-071: a queued prompt's task is NAMED "Queued Prompt: <id>" and carries the prompt as its content.
 * The pane draws the name, as it draws an agent task's name (REQ-TOOLS-144), and a line of the plan carries both.
 * Acceptance finding A28: docs/defects/fixed/a-queued-prompts-task-is-not-named-queued-prompt.md.
 */
describe('a named planner task (REQ-CHAT-040, REQ-ORCH-071)', () => {
  const planner = {
    schema_version: 1 as const,
    phases: [
      { name: 'main', tasks: [{ id: 'a', text: 'first task', state: 'complete' as const, consecutiveRetries: 0 }] },
      { name: 'Queued Prompts', tasks: [{ id: '0123abcd-0000-4000-8000-000000000000', name: 'Queued Prompt: 0123abcd', text: 'then do this', state: 'pending' as const, consecutiveRetries: 0 }] },
    ],
  };

  it('the pane draws the task\'s name where it has one, and its text where it has none', () => {
    expect(projectPlannerTodo(planner).phases.map((p) => p.tasks.map((t) => t.text))).toEqual([['first task'], ['Queued Prompt: 0123abcd']]);
  });

  it('a line of the plan carries the name and the content', () => {
    expect(todoLinesFromStored(JSON.stringify(planner))).toEqual(['[done] main — first task', '[open] Queued Prompts — Queued Prompt: 0123abcd: then do this']);
  });

  it('a stored name that is not a string is not a planner document', () => {
    expect(isPlannerTodoDocument(planner)).toBe(true);
    expect(isPlannerTodoDocument({ ...planner, phases: [{ name: 'main', tasks: [{ id: 'a', text: 't', state: 'pending', name: 7 }] }] })).toBe(false);
  });
});
