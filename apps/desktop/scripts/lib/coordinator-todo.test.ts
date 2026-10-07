/**
 * OQ-213 (REQ-ORCH-029) as the live run reads it: the coordinator's second work item never runs before its own todo list,
 * and a multi-step coordinating session stores an agent plan. Pinned against the shapes live-run finding K2 recorded (the
 * edit run's two background `delegate` calls with no `todo` call, packs at c2fdd6a and c2a9444) and the shapes the gate
 * records since fin27 (`failure_kind: todo_list_owed`, `blocked`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { agentPlanTaskCount, coordinatorTodoReading, launchRunOverride } from './coordinator-todo.mjs';

const call = (ordinal: number, tool_name: string, agent_name = 'orchestrator', status = 'ok', failureKind: string | null = null) => ({ ordinal, tool_name, agent_name, status, failureKind });

describe('coordinatorTodoReading (OQ-213, REQ-ORCH-029)', () => {
  it('K2 as recorded before the repair: two delegations and no list are a breach, and the session stores no agent plan', () => {
    const r = coordinatorTodoReading([{ scenario: 'edit', rootNames: ['orchestrator'], agentPlanTasks: null, calls: [call(1, 'read_file'), call(2, 'delegate'), call(3, 'delegate'), call(4, 'wait_for_tasks')] }]);
    expect(r.unlisted).toEqual([{ scenario: 'edit', ordinal: 3, tool_name: 'delegate' }]);
    expect(r.multiStep).toEqual(['edit']);
    expect(r.withoutPlan).toEqual(['edit']);
  });

  it('as built: the second delegation refused, the list written, the call repeated — no breach, the refusal reported', () => {
    const r = coordinatorTodoReading([{ scenario: 'edit', rootNames: ['orchestrator'], agentPlanTasks: 2, calls: [call(1, 'delegate'), call(2, 'delegate', 'orchestrator', 'blocked', 'todo_list_owed'), call(3, 'todo'), call(4, 'delegate')] }]);
    expect(r.unlisted).toEqual([]);
    expect(r.refused).toEqual([{ scenario: 'edit', ordinal: 2, tool_name: 'delegate' }]);
    expect(r.withoutPlan).toEqual([]);
  });

  it('a child\'s calls, a call refused before it ran and one refused by the schema are not the root\'s work items', () => {
    const r = coordinatorTodoReading([{ scenario: 'resume', rootNames: ['orchestrator'], agentPlanTasks: null, calls: [call(1, 'delegate'), call(2, 'write_file', 'notes-a'), call(3, 'write_file', 'notes-b'), call(4, 'delegate', 'orchestrator', 'blocked'), call(5, 'delegate', 'orchestrator', 'failed', 'invalid_request')] }]);
    expect(r.unlisted).toEqual([]);
    expect(r.multiStep).toEqual([]);
  });

  it('a direct-work root\'s write and terminal call are two work items', () => {
    const r = coordinatorTodoReading([{ scenario: 'frictions', rootNames: ['orchestrator'], agentPlanTasks: null, calls: [call(1, 'write_file'), call(2, 'terminal', 'orchestrator', 'failed', 'shell_failure')] }]);
    expect(r.unlisted).toEqual([{ scenario: 'frictions', ordinal: 2, tool_name: 'terminal' }]);
  });

  it('REQ-ORCH-025: a session launched under `single` is skipped — its entry role is the worker, not a coordinator', () => {
    const work = [call(1, 'write_file'), call(2, 'terminal'), call(3, 'write_file')];
    const r = coordinatorTodoReading([
      { scenario: 'solo', rootNames: ['orchestrator'], agentPlanTasks: null, runOverride: 'single', calls: work },
      { scenario: 'swarmed', rootNames: ['orchestrator'], agentPlanTasks: null, runOverride: 'swarm', calls: work },
    ]);
    expect(r.single).toEqual(['solo']);
    // `swarm` changes the entry role's instruction text only, so the clause still binds it.
    expect(r.unlisted).toEqual([{ scenario: 'swarmed', ordinal: 2, tool_name: 'terminal' }, { scenario: 'swarmed', ordinal: 3, tool_name: 'write_file' }]);
    expect(r.multiStep).toEqual(['swarmed']);
    expect(r.withoutPlan).toEqual(['swarmed']);
  });

  it('launchRunOverride reads the launch audit\'s configuration snapshot, and nothing else', () => {
    expect(launchRunOverride(JSON.stringify({ config_snapshot: { delegation_strategy: 'single' } }))).toBe('single');
    expect(launchRunOverride(JSON.stringify({ config_snapshot: { delegation_strategy: 'swarm' } }))).toBe('swarm');
    expect(launchRunOverride(JSON.stringify({ config_snapshot: { delegation_strategy: 'orchestrator' } }))).toBeNull();
    expect(launchRunOverride(JSON.stringify({}))).toBeNull();
    expect(launchRunOverride(null)).toBeNull();
    expect(launchRunOverride('{')).toBeNull();
  });

  it('agentPlanTaskCount reads the version-2 envelope\'s agent plan, and nothing else', () => {
    expect(agentPlanTaskCount(JSON.stringify({ schema_version: 2, planner: {}, agent: { schema_version: 1, phases: [{ tasks: [{}, {}] }, { tasks: [{}] }] } }))).toBe(3);
    expect(agentPlanTaskCount(JSON.stringify({ schema_version: 1, phases: [{ name: 'main', tasks: [{}] }] }))).toBeNull();
    expect(agentPlanTaskCount(null)).toBeNull();
    expect(agentPlanTaskCount('{')).toBeNull();
  });
});
