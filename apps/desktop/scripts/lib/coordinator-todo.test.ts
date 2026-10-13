/**
 * OQ-213 (REQ-ORCH-029) as the live run reads it: the coordinator's second work item never runs before its own todo list,
 * and a multi-step coordinating session stores an agent plan. Pinned against the shapes live-run finding K2 recorded (the
 * edit run's two background `delegate` calls with no `todo` call, packs at c2fdd6a and c2a9444) and the shapes the gate
 * records since fin27 (`failure_kind: todo_list_owed`, `blocked`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { agentPlanTaskCount, coordinatorTodoReading, heldItemReading, launchRunOverride, planItemIds, rootAgentPlan, todoItemReading, todoStates, WRITER_ROLES } from './coordinator-todo.mjs';
import { BUILT_IN_ROLE_TOOLS } from '@rotaris/contracts';

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

/**
 * PD-TOOLS-006 revision 6 (OQ-220): the live run reads which item each child served from the store (`children.todo_item`,
 * v34): a root implementation child spawned after the coordinator's first list names an item, no two implementation children
 * of one plan hold one item at once, and every named item is one its plan still holds.
 */
describe('todoItemReading (PD-TOOLS-006 revision 6, OQ-220)', () => {
  const kid = (canonical_name: string, over: Partial<{ task_id: string; persona: string; parent_id: string; depth: number; todo_item: string | null; spawned_at: string; completed_at: string | null; todo: string | null }> = {}) => ({
    task_id: `bg_${canonical_name.padStart(8, '0').slice(-8)}`, canonical_name, persona: 'coding-agent', parent_id: 'bg_root0000', depth: 1, todo_item: null, spawned_at: '2026-10-07T10:00:10.000Z', completed_at: '2026-10-07T10:01:00.000Z', todo: null, ...over,
  });
  const listedAt = Date.parse('2026-10-07T10:00:05.000Z');

  it('the writer roles are the built-in table\'s roles that declare a file-writing tool, the coordinator-only orchestrator aside', () => {
    const writers = Object.entries(BUILT_IN_ROLE_TOOLS).filter(([role, tools]) => role !== 'orchestrator' && tools.some((t) => ['write_file', 'haet_edit', 'haet'].includes(t))).map(([role]) => role);
    expect([...WRITER_ROLES].sort()).toEqual(writers.sort());
  });

  it('as ruled: the first delegation before the list serves none, every later implementation child names an item, none overlap', () => {
    const r = todoItemReading([{ scenario: 'edit', listedAt, rootPlanIds: ['0000000a', '0000000b'], children: [
      kid('first', { spawned_at: '2026-10-07T10:00:01.000Z', completed_at: '2026-10-07T10:00:04.000Z' }),
      kid('a', { todo_item: '0000000a', completed_at: '2026-10-07T10:00:30.000Z' }),
      kid('b', { todo_item: '0000000b' }),
      kid('a-again', { todo_item: '0000000a', spawned_at: '2026-10-07T10:00:31.000Z', completed_at: null }),
      kid('survey', { persona: 'codebase-analyst' }),
    ] }]);
    expect(r).toMatchObject({ unnamed: [], overlaps: [], stale: [] });
    expect(r.named.map((n: { child: string }) => n.child)).toEqual(['a', 'b', 'a-again']);
  });

  it('reports an unnamed implementation child after the list, two holders of one item at once, and an item the plan no longer holds', () => {
    const r = todoItemReading([{ scenario: 'duress', listedAt, rootPlanIds: ['0000000a'], children: [
      kid('loose'),
      kid('one', { todo_item: '0000000a', completed_at: null }),
      kid('two', { todo_item: '0000000a', spawned_at: '2026-10-07T10:00:20.000Z' }),
      kid('gone', { todo_item: 'deadbeef', persona: 'tester' }),
      kid('sub', { depth: 2, parent_id: 'bg_0000lead', todo_item: '000000c1' }),
      kid('lead', { task_id: 'bg_0000lead', persona: 'planner', todo: JSON.stringify({ schema_version: 1, phases: [{ id: 'p', name: 'p', tasks: [{ id: '000000c2' }] }] }) }),
    ] }]);
    expect(r.unnamed).toEqual([{ scenario: 'duress', child: 'loose', persona: 'coding-agent' }]);
    expect(r.overlaps).toEqual([{ scenario: 'duress', item: '0000000a', children: ['one', 'two'] }]);
    expect(r.stale).toEqual([{ scenario: 'duress', child: 'gone', item: 'deadbeef' }, { scenario: 'duress', child: 'sub', item: '000000c1' }]);
  });

  it('reads the stored plans', () => {
    const root = rootAgentPlan(JSON.stringify({ schema_version: 2, planner: {}, agent: { schema_version: 1, phases: [{ tasks: [{ id: '0000000a' }, { id: '0000000b' }] }] } }));
    expect(planItemIds(root)).toEqual(['0000000a', '0000000b']);
    expect(rootAgentPlan('{')).toBeNull();
    expect(planItemIds(null)).toBeNull();
  });
});

/**
 * PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 (OQ-249): what the coordinator's plan recorded of the items its running
 * children held, pinned against the default live run's edit session at a68f121 (#14 refused, the tests item PENDING while its
 * child ran) and the shape the build records (each delegate result carries the Todo state with its item IN_PROGRESS).
 */
describe('heldItemReading (PD-TOOLS-008 revision 2, OQ-249)', () => {
  const state = (rows: [string, string, string][]) => `Todo state:\nPhase main (e002ab7d)\n${rows.map(([st, name, id]) => `  [${st}] ${name} (${id})`).join('\n')}`;
  const at = (iso: string) => Date.parse(iso);
  const kids = [
    { canonical_name: 'impl', persona: 'coding-agent', depth: 1, todo_item: '0000000a', spawned_at: '2026-10-07T07:00:10Z', completed_at: '2026-10-07T07:02:00Z' },
    { canonical_name: 'tests', persona: 'tester', depth: 1, todo_item: '0000000b', spawned_at: '2026-10-07T07:00:11Z', completed_at: '2026-10-07T07:03:00Z' },
  ];
  const c = (ordinal: number, tool_name: string, status: string, result: string, endedAt: string) => ({ ordinal, tool_name, agent_name: 'orchestrator', status, result, endedAt: at(endedAt) });

  it('todoStates reads a rendered Todo state, and nothing where there is none', () => {
    expect([...todoStates(`Task 'x': queued — ok\ntask_id: bg_00000001\n\n${state([['IN_PROGRESS', 'Implement it', '0000000a']])}`)!]).toEqual([['0000000a', 'IN_PROGRESS']]);
    expect(todoStates('Task done.')).toBeNull();
  });

  it('the edit session as recorded before the repair: the tests item read PENDING while its child ran, and #14 refused', () => {
    const r = heldItemReading([{ scenario: 'edit', rootNames: ['orchestrator'], children: kids, calls: [
      c(10, 'todo', 'ok', state([['IN_PROGRESS', 'Implement it', '0000000a'], ['PENDING', 'Test it', '0000000b']]), '2026-10-07T07:00:05Z'),
      c(12, 'delegate', 'ok', "Task 'impl': queued — Accepted.\ntask_id: bg_00000001", '2026-10-07T07:00:10Z'),
      c(13, 'delegate', 'ok', "Task 'tests': queued — Accepted.\ntask_id: bg_00000002", '2026-10-07T07:00:11Z'),
      c(14, 'todo', 'failed', 'Only one task can be IN_PROGRESS at a time. Active task: 0000000a (Implement it). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.', '2026-10-07T07:00:20Z'),
      c(15, 'todo', 'ok', state([['IN_PROGRESS', 'Implement it', '0000000a'], ['PENDING', 'Test it', '0000000b']]), '2026-10-07T07:00:30Z'),
    ] }]);
    expect(r.singleActive).toEqual([{ scenario: 'edit', ordinal: 14 }]);
    expect(r.heldPending).toEqual([{ scenario: 'edit', ordinal: 15, child: 'tests', item: '0000000b' }]);
    expect(r.closedWhileHeld).toEqual([]);
  });

  it('as built: each delegation marks its item, both read active while their children run, and they close after the children end', () => {
    const r = heldItemReading([{ scenario: 'edit', rootNames: ['orchestrator'], children: kids, calls: [
      c(10, 'todo', 'ok', state([['PENDING', 'Implement it', '0000000a'], ['PENDING', 'Test it', '0000000b']]), '2026-10-07T07:00:05Z'),
      c(12, 'delegate', 'ok', `Task 'impl': queued — Accepted. Todo item Implement it (0000000a) is now IN_PROGRESS.\ntask_id: bg_00000001\n\n${state([['IN_PROGRESS', 'Implement it', '0000000a'], ['PENDING', 'Test it', '0000000b']])}`, '2026-10-07T07:00:10Z'),
      c(13, 'delegate', 'ok', `Task 'tests': queued — Accepted.\ntask_id: bg_00000002\n\n${state([['IN_PROGRESS', 'Implement it', '0000000a'], ['IN_PROGRESS', 'Test it', '0000000b']])}`, '2026-10-07T07:00:11Z'),
      c(20, 'todo', 'ok', state([['COMPLETED', 'Implement it', '0000000a'], ['COMPLETED', 'Test it', '0000000b']]), '2026-10-07T07:03:05Z'),
    ] }]);
    expect(r).toMatchObject({ coordinating: ['edit'], heldPending: [], closedWhileHeld: [], singleActive: [] });
  });

  it('an item closed while its implementation child still runs is reported; a session that never delegated is not read', () => {
    const r = heldItemReading([
      { scenario: 'duress', rootNames: ['orchestrator'], children: kids, calls: [c(12, 'delegate', 'ok', "Task 'impl': queued", '2026-10-07T07:00:10Z'), c(30, 'todo', 'ok', state([['COMPLETED', 'Implement it', '0000000a'], ['IN_PROGRESS', 'Test it', '0000000b']]), '2026-10-07T07:01:00Z')] },
      { scenario: 'shell', rootNames: ['orchestrator'], children: [], calls: [c(1, 'todo', 'failed', 'Only one task can be IN_PROGRESS at a time. The submitted list marks 2 tasks', '2026-10-07T07:00:00Z')] },
    ]);
    expect(r.closedWhileHeld).toEqual([{ scenario: 'duress', ordinal: 30, child: 'impl', item: '0000000a' }]);
    expect(r.coordinating).toEqual(['duress']);
    expect(r.singleActive).toEqual([]);
  });

  /*
   * PD-TOOLS-008 revision 3 (OQ-255): a whole-list COMPLETED `replace` after the children ended. Before the revision its result
   * still read both delegated items IN_PROGRESS; since, they close, and a kept task is named in the observation.
   */
  it('revision 3: a closing replace whose ended children\'s items still read IN_PROGRESS is reported; a named restore is a NOTE', () => {
    const closeAll = { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: '0000000a', name: 'Implement it', state: 'COMPLETED' }, { id: '0000000b', name: 'Test it', state: 'COMPLETED' }] }] };
    const withArgs = (ordinal: number, result: string, endedAt: string, args: unknown) => ({ ...c(ordinal, 'todo', 'ok', result, endedAt), args });
    const before = heldItemReading([{ scenario: 'edit', rootNames: ['orchestrator'], children: kids, calls: [
      c(12, 'delegate', 'ok', "Task 'impl': queued", '2026-10-07T07:00:10Z'),
      withArgs(20, `Replaced the todo list: 1 phase, 2 tasks.\n${state([['IN_PROGRESS', 'Implement it', '0000000a'], ['IN_PROGRESS', 'Test it', '0000000b']])}`, '2026-10-07T07:03:05Z', closeAll),
    ] }]);
    expect(before.restoredOverClose).toEqual([{ scenario: 'edit', ordinal: 20, item: '0000000a' }, { scenario: 'edit', ordinal: 20, item: '0000000b' }]);
    expect(before.namedRestores).toEqual([]);
    // while tests still runs, its item is kept and named — no finding; impl's has ended and closes
    const built = heldItemReading([{ scenario: 'edit', rootNames: ['orchestrator'], children: kids, calls: [
      c(12, 'delegate', 'ok', "Task 'impl': queued", '2026-10-07T07:00:10Z'),
      withArgs(20, `Replaced the todo list: 1 phase, 2 tasks. Kept as they were: Test it (0000000b) IN_PROGRESS, a running delegated agent holds it. Change a task's state with update.\n${state([['COMPLETED', 'Implement it', '0000000a'], ['IN_PROGRESS', 'Test it', '0000000b']])}`, '2026-10-07T07:02:30Z', JSON.stringify(closeAll)),
      withArgs(21, `Replaced the todo list: 1 phase, 2 tasks.\n${state([['COMPLETED', 'Implement it', '0000000a'], ['COMPLETED', 'Test it', '0000000b']])}`, '2026-10-07T07:03:05Z', closeAll),
    ] }]);
    expect(built.restoredOverClose).toEqual([]);
    expect(built.namedRestores).toEqual([{ scenario: 'edit', ordinal: 20 }]);
    // Both are the case revision 3 decides, asked: the closes carry what was sent and what the plan then stored.
    expect(before.closes).toEqual([
      { scenario: 'edit', ordinal: 20, item: '0000000a', sent: 'COMPLETED', stored: 'IN_PROGRESS' },
      { scenario: 'edit', ordinal: 20, item: '0000000b', sent: 'COMPLETED', stored: 'IN_PROGRESS' },
    ]);
    expect(built.closes).toEqual([
      { scenario: 'edit', ordinal: 20, item: '0000000a', sent: 'COMPLETED', stored: 'COMPLETED' },
      { scenario: 'edit', ordinal: 21, item: '0000000a', sent: 'COMPLETED', stored: 'COMPLETED' },
      { scenario: 'edit', ordinal: 21, item: '0000000b', sent: 'COMPLETED', stored: 'COMPLETED' },
    ]);
  });

  // docs/defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md (item N65): the 0bc3eee edit
  // session's shape — the root's only `replace` the opening write, every close an `update` — asks nothing of revision 3.
  it('a session that opens with a replace and closes with updates leaves revision 3 unasked: no closes, and nothing restored', () => {
    const open = { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: '0000000a', name: 'Implement it', state: 'PENDING' }, { id: '0000000b', name: 'Test it', state: 'PENDING' }] }] };
    const r = heldItemReading([{ scenario: 'edit', rootNames: ['orchestrator'], children: kids, calls: [
      { ...c(8, 'todo', 'ok', `Replaced the todo list: 1 phase, 2 tasks.\n${state([['PENDING', 'Implement it', '0000000a'], ['PENDING', 'Test it', '0000000b']])}`, '2026-10-07T07:00:05Z'), args: open },
      c(12, 'delegate', 'ok', "Task 'impl': queued", '2026-10-07T07:00:10Z'),
      { ...c(52, 'todo', 'ok', state([['COMPLETED', 'Implement it', '0000000a'], ['IN_PROGRESS', 'Test it', '0000000b']]), '2026-10-07T07:02:30Z'), args: { operation: 'update', task_id: '0000000a', state: 'COMPLETED' } },
      { ...c(55, 'todo', 'ok', state([['COMPLETED', 'Implement it', '0000000a'], ['COMPLETED', 'Test it', '0000000b']]), '2026-10-07T07:03:05Z'), args: { operation: 'update', task_id: '0000000b', state: 'COMPLETED' } },
    ] }]);
    expect(r.coordinating).toEqual(['edit']);
    expect(r.restoredOverClose).toEqual([]);
    expect(r.closes).toEqual([]);
  });
});
