/**
 * OQ-213 (REQ-ORCH-029) as the live run reads it: the coordinator's second work item never runs before its own todo list,
 * and a multi-step coordinating session stores an agent plan. Pinned against the shapes live-run finding K2 recorded (the
 * edit run's two background `delegate` calls with no `todo` call, packs at c2fdd6a and c2a9444) and the shapes the gate
 * records since fin27 (`failure_kind: todo_list_owed`, `blocked`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { agentPlanTaskCount, coordinatorTodoReading, heldItemReading, holdingWindows, launchRunOverride, planItemIds, rootAgentPlan, todoItemReading, todoStates, WRITER_ROLES } from './coordinator-todo.mjs';
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

  /*
   * PD-TOOLS-008 revision 4 and PD-TOOLS-006 revision 11 (OQ-333): the delegation-swarm session 3e4b7210 at 3c03287. Three
   * children served impl101, test101 and doc101; `wait_for_tasks` (#14) reported them; #26 marked verify101 and was refused;
   * #27 to #29 closed the three items. As built since the revision #26 is accepted and the wait names each open item.
   */
  describe('revision 11: the resume line, the items open at the answer, and the seconds to each close (OQ-333)', () => {
    const swarmKids = [
      { task_id: 'bg_1', canonical_name: 'impl', persona: 'coding-agent', depth: 1, todo_item: 'impl101', spawned_at: '2026-10-15T03:48:47.100Z', completed_at: '2026-10-15T03:49:40.000Z' },
      { task_id: 'bg_2', canonical_name: 'tests', persona: 'tester', depth: 1, todo_item: 'test101', spawned_at: '2026-10-15T03:48:47.150Z', completed_at: '2026-10-15T03:49:44.000Z' },
      { task_id: 'bg_3', canonical_name: 'docs', persona: 'docs-writer', depth: 1, todo_item: 'doc101', spawned_at: '2026-10-15T03:48:47.200Z', completed_at: '2026-10-15T03:49:46.000Z' },
    ];
    const line = (name: string, id: string) => `Todo item ${name} (${id}) is still IN_PROGRESS: close it with update once you accept this report.`;
    const update = (ordinal: number, task_id: string, st: string, endedAt: string, status = 'ok', result = 'Updated task.') => ({ ...c(ordinal, 'todo', status, result, endedAt), args: { operation: 'update', task_id, state: st } });
    const plan = (states: Record<string, string>) => ({ schema_version: 1, phases: [{ id: 'e40a534e', name: 'main', tasks: Object.entries(states).map(([id, st]) => ({ id, name: id, description: '', state: st })) }] });
    const wait = c(14, 'wait_for_tasks', 'ok', `The waited-for background tasks completed (3).\n\n### impl (coding-agent) — succeeded\nok\n${line('addTodo refuses empty or blank title in src/todos.js', 'impl101')}\n\n### tests (tester) — succeeded\nok\n${line('Test the rule', 'test101')}\n\n### docs (docs-writer) — succeeded\nok`, '2026-10-15T03:49:46.150Z');

    it('as recorded at 3c03287: #26 refused (target 0), no resume line, the closes 9.4 to 11.9 s after each child ended', () => {
      const r = heldItemReading([{ scenario: 'delegation-swarm', rootNames: ['orchestrator'], children: swarmKids, rootPlan: plan({ impl101: 'COMPLETED', test101: 'COMPLETED', doc101: 'COMPLETED', verify101: 'COMPLETED' }), calls: [
        c(7, 'delegate', 'ok', "Task 'impl': queued", '2026-10-15T03:48:47.121Z'),
        c(14, 'wait_for_tasks', 'ok', 'The waited-for background tasks completed (3).\n\n### impl (coding-agent) — succeeded\nok', '2026-10-15T03:49:46.150Z'),
        update(26, 'verify101', 'IN_PROGRESS', '2026-10-15T03:49:48.704Z', 'failed', 'Only one task can be IN_PROGRESS at a time. Active task: impl101 (addTodo refuses empty or blank title in src/todos.js). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.'),
        update(27, 'impl101', 'COMPLETED', '2026-10-15T03:49:51.427Z'),
        update(28, 'test101', 'COMPLETED', '2026-10-15T03:49:53.320Z'),
        update(29, 'doc101', 'COMPLETED', '2026-10-15T03:49:55.863Z'),
      ] }]);
      expect(r.singleActive).toEqual([{ scenario: 'delegation-swarm', ordinal: 26 }]);
      expect(r.resumeLines).toEqual([]);
      expect(r.openAtAnswer).toEqual([]);
      expect(r.closeLatencies.map((h) => [h.item, h.ordinal, h.seconds])).toEqual([['impl101', 27, 11.427], ['test101', 28, 9.32], ['doc101', 29, 9.863]]);
    });

    it('as built: the wait names the open items, #26 is accepted, and an item never closed is reported open at the answer', () => {
      const r = heldItemReading([{ scenario: 'delegation-swarm', rootNames: ['orchestrator'], children: swarmKids, rootPlan: plan({ impl101: 'COMPLETED', test101: 'IN_PROGRESS', doc101: 'COMPLETED', verify101: 'COMPLETED' }), calls: [
        c(7, 'delegate', 'ok', "Task 'impl': queued", '2026-10-15T03:48:47.121Z'),
        wait,
        update(26, 'verify101', 'IN_PROGRESS', '2026-10-15T03:49:48.704Z'),
        update(27, 'impl101', 'COMPLETED', '2026-10-15T03:49:50.000Z'),
        { ...c(28, 'todo', 'ok', 'Replaced the todo list: 1 phase, 4 tasks.', '2026-10-15T03:49:52.000Z'), args: JSON.stringify({ operation: 'replace', phases: [{ name: 'main', tasks: [{ id: 'doc101', name: 'docs', state: 'ABANDONED' }] }] }) },
      ] }]);
      expect(r.singleActive).toEqual([]);
      expect(r.resumeLines).toEqual([{ scenario: 'delegation-swarm', ordinal: 14, items: ['impl101', 'test101'] }]);
      expect(r.openAtAnswer).toEqual([{ scenario: 'delegation-swarm', item: 'test101', children: ['tests'] }]);
      expect(r.closeLatencies.map((h) => [h.item, h.ordinal, h.seconds])).toEqual([['impl101', 27, 10], ['doc101', 28, 6]]);
    });

    it('an item a child still serves while running is not reported open at the answer, and no plan stored reads none', () => {
      const running = [{ ...swarmKids[0]!, completed_at: null }];
      const r = heldItemReading([{ scenario: 'resume', rootNames: ['orchestrator'], children: running, rootPlan: plan({ impl101: 'IN_PROGRESS' }), calls: [c(7, 'delegate', 'ok', "Task 'impl': queued", '2026-10-15T03:48:47.121Z')] }]);
      expect(r.openAtAnswer).toEqual([]);
      expect(r.closeLatencies).toEqual([]);
      const none = heldItemReading([{ scenario: 'edit', rootNames: ['orchestrator'], children: swarmKids, calls: [c(7, 'delegate', 'ok', "Task 'impl': queued", '2026-10-15T03:48:47.121Z')] }]);
      expect(none.openAtAnswer).toEqual([]);
    });
  });

  /*
   * docs/defects/fixed/the-live-runs-held-item-check-holds-a-followed-up-child-across-the-gap-between-its-runs.md (finding L2):
   * the 3c3f447 terminal session 7fce100f. The tester ended (child_end 16:17:34.521), the root closed its item (#15, 16:17:42),
   * and a `session_id` follow-up resumed it (child_resumed 16:17:52.370); the quit then paused it, so `completed_at` is null.
   * Its holding window is each run of it, from the timeline, not spawn to completion.
   */
  describe('a followed-up child holds its item only while it runs (PD-TOOLS-006 revision 7, finding L2)', () => {
    const tester = { task_id: 'bg_32e82bf2', canonical_name: 'Run-terminal-probe-commands-1-9-verbatim', persona: 'tester', depth: 1, todo_item: '0423eeed', spawned_at: '2026-10-14T16:15:41.807Z', completed_at: null };
    const entry = (ordinal: number, atIso: string, name: string, metadata: Record<string, unknown>) => ({ ordinal, at: atIso, name, metadata: JSON.stringify(metadata) });
    const timeline = [
      entry(2, '2026-10-14T16:15:41.809Z', 'child_start', { task_id: 'bg_32e82bf2' }),
      entry(9, '2026-10-14T16:17:34.521Z', 'child_end', { task_id: 'bg_32e82bf2', state: 'succeeded' }),
      entry(12, '2026-10-14T16:17:52.370Z', 'child_resumed', { task_id: 'bg_32e82bf2', follow_up: true, from_state: 'succeeded', resume_state: 'queued' }),
      entry(13, '2026-10-14T16:17:52.385Z', 'child_start', { task_id: 'bg_32e82bf2' }),
      entry(18, '2026-10-14T16:22:16.795Z', 'child_end', { task_id: 'bg_32e82bf2', state: 'succeeded' }),
      entry(21, '2026-10-14T16:22:27.157Z', 'child_resumed', { task_id: 'bg_32e82bf2', follow_up: true, from_state: 'succeeded', resume_state: 'queued' }),
      entry(22, '2026-10-14T16:22:27.158Z', 'child_start', { task_id: 'bg_32e82bf2' }),
      entry(23, '2026-10-14T16:23:35.136Z', 'child_paused', { task_id: 'bg_32e82bf2', interruption: 'quit' }),
    ];
    const done = state([['COMPLETED', 'Run the terminal probes', '0423eeed']]);
    const close = (ordinal: number, endedAt: string) => c(ordinal, 'todo', 'ok', done, endedAt);

    it('the 3c3f447 close at #15, between the first child_end and the follow-up, is not a close while held', () => {
      const r = heldItemReading([{ scenario: 'terminal', rootNames: ['orchestrator'], children: [tester], timeline, calls: [
        c(3, 'delegate', 'ok', "Task 'Run-terminal-probe-commands-1-9-verbatim': queued", '2026-10-14T16:15:41.900Z'),
        close(15, '2026-10-14T16:17:42.000Z'),
      ] }]);
      expect(r.closedWhileHeld).toEqual([]);
    });

    it('a close while the child runs, in its first run, its follow-up, or after the quit paused it, is still reported', () => {
      const r = heldItemReading([{ scenario: 'terminal', rootNames: ['orchestrator'], children: [tester], timeline, calls: [
        c(3, 'delegate', 'ok', "Task 'Run-terminal-probe-commands-1-9-verbatim': queued", '2026-10-14T16:15:41.900Z'),
        close(5, '2026-10-14T16:16:00.000Z'),
        close(16, '2026-10-14T16:17:52.375Z'),
        close(17, '2026-10-14T16:20:00.000Z'),
        close(19, '2026-10-14T16:22:20.000Z'),
        close(24, '2026-10-14T16:24:00.000Z'),
      ] }]);
      expect(r.closedWhileHeld.map((h: { ordinal: number }) => h.ordinal)).toEqual([5, 16, 17, 24]);
    });

    it('a revision 3 close sent in the gap is a close every serving child has ended; a child with no timeline falls back to its row', () => {
      const closeOne = { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: '0423eeed', name: 'Run the terminal probes', state: 'COMPLETED' }] }] };
      const r = heldItemReading([{ scenario: 'terminal', rootNames: ['orchestrator'], children: [tester], timeline, calls: [
        c(3, 'delegate', 'ok', "Task 'Run-terminal-probe-commands-1-9-verbatim': queued", '2026-10-14T16:15:41.900Z'),
        { ...close(15, '2026-10-14T16:17:42.000Z'), args: closeOne },
      ] }]);
      expect(r.closes).toEqual([{ scenario: 'terminal', ordinal: 15, item: '0423eeed', sent: 'COMPLETED', stored: 'COMPLETED' }]);
      // No timeline entry names it (a reading of rows alone): the row's spawn-to-completion window, as before.
      const rowOnly = heldItemReading([{ scenario: 'terminal', rootNames: ['orchestrator'], children: [tester], timeline: [], calls: [
        c(3, 'delegate', 'ok', "Task 'x': queued", '2026-10-14T16:15:41.900Z'),
        close(15, '2026-10-14T16:17:42.000Z'),
      ] }]);
      expect(rowOnly.closedWhileHeld.map((h: { ordinal: number }) => h.ordinal)).toEqual([15]);
    });

    it('holdingWindows reads each run from its admission or child_resumed to child_end, the last open while the child is non-terminal', () => {
      expect(holdingWindows(tester, timeline)).toEqual([
        [Date.parse(tester.spawned_at), Date.parse('2026-10-14T16:17:34.521Z')],
        [Date.parse('2026-10-14T16:17:52.370Z'), Date.parse('2026-10-14T16:22:16.795Z')],
        [Date.parse('2026-10-14T16:22:27.157Z'), Infinity],
      ]);
      expect(holdingWindows({ ...tester, completed_at: '2026-10-14T16:20:00Z' }, [])).toEqual([[Date.parse(tester.spawned_at), Date.parse('2026-10-14T16:20:00Z')]]);
    });
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

  /*
   * Acceptance finding A7 (docs/defects/fixed/the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md): the
   * delegation-swarm session 3e4b7210 at 3c03287 stored its tasks under the ids its model chose (`impl101`, `test101`, …), and
   * `todoStates` matched `([0-9a-f]{8})` alone, so every task of that session was invisible and `heldPending`, `closedWhileHeld`
   * and `restoredOverClose` passed having read nothing of it. The reader takes whatever id the rendering carries, and a held
   * item or a closed one the Todo state does not show is reported (`unread`), never passed over.
   */
  describe('a task stored under a model-chosen id is read like any other (finding A7, REQ-TOOLS-144, PD-TOOLS-008)', () => {
    const swarm = [
      { task_id: 'bg_1', canonical_name: 'impl', persona: 'coding-agent', depth: 1, todo_item: 'impl101', spawned_at: '2026-10-15T03:48:47.100Z', completed_at: '2026-10-15T03:49:40.000Z' },
      { task_id: 'bg_2', canonical_name: 'tests', persona: 'tester', depth: 1, todo_item: 'test101', spawned_at: '2026-10-15T03:48:47.150Z', completed_at: '2026-10-15T03:49:44.000Z' },
    ];

    it('todoStates reads a non-hex id, and the id rather than a parenthesis in the name or the description', () => {
      const text = `Todo state:\nPhase main (e40a534e)\n  [IN_PROGRESS] addTodo refuses empty (or blank) title (impl101) — see src/todos.js (line 4)\n  [PENDING] Test (the rule) (test-1.a)\n  [COMPLETED] Docs (0000000c)`;
      expect([...todoStates(text)!]).toEqual([['impl101', 'IN_PROGRESS'], ['test-1.a', 'PENDING'], ['0000000c', 'COMPLETED']]);
      // A name holding " (x) — " leaves its line two readings; the id a line of one reading carries wins over it, in either order.
      const lines = ['  [PENDING] Fix (test101) — then ship (impl101)', '  [IN_PROGRESS] Test it (test101)'];
      for (const order of [lines, [...lines].reverse()]) {
        const tricky = todoStates(`Todo state:\nPhase main (e40a534e)\n${order.join('\n')}`)!;
        expect(tricky.get('impl101')).toBe('PENDING');
        expect(tricky.get('test101')).toBe('IN_PROGRESS');
      }
    });

    it('a held item read PENDING, an item closed while held, and an ended item a replace left open are reported', () => {
      const closeImpl = { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: 'impl101', name: 'impl', state: 'COMPLETED' }, { id: 'test101', name: 'tests', state: 'IN_PROGRESS' }] }] };
      const r = heldItemReading([{ scenario: 'delegation-swarm', rootNames: ['orchestrator'], children: swarm, calls: [
        c(7, 'delegate', 'ok', `Task 'impl': queued\ntask_id: bg_1\n\n${state([['IN_PROGRESS', 'impl', 'impl101'], ['PENDING', 'tests', 'test101']])}`, '2026-10-15T03:48:47.130Z'),
        c(8, 'delegate', 'ok', `Task 'tests': queued\ntask_id: bg_2\n\n${state([['IN_PROGRESS', 'impl', 'impl101'], ['PENDING', 'tests', 'test101']])}`, '2026-10-15T03:48:47.160Z'),
        c(9, 'todo', 'ok', state([['COMPLETED', 'impl', 'impl101'], ['IN_PROGRESS', 'tests', 'test101']]), '2026-10-15T03:49:00.000Z'),
        { ...c(20, 'todo', 'ok', `Replaced the todo list: 1 phase, 2 tasks.\n${state([['IN_PROGRESS', 'impl', 'impl101'], ['IN_PROGRESS', 'tests', 'test101']])}`, '2026-10-15T03:49:50.000Z'), args: closeImpl },
      ] }]);
      expect(r.heldPending).toEqual([{ scenario: 'delegation-swarm', ordinal: 8, child: 'tests', item: 'test101' }]);
      expect(r.closedWhileHeld).toEqual([{ scenario: 'delegation-swarm', ordinal: 9, child: 'impl', item: 'impl101' }]);
      expect(r.restoredOverClose).toEqual([{ scenario: 'delegation-swarm', ordinal: 20, item: 'impl101' }]);
      expect(r.unread).toEqual([]);
      expect(r.heldReads).toBe(5);
    });

    it('a held or closed item its coordinator\'s Todo state does not show is reported unread, so no check passes on nothing', () => {
      const closeImpl = { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: 'impl101', name: 'impl', state: 'COMPLETED' }] }] };
      const r = heldItemReading([{ scenario: 'delegation-swarm', rootNames: ['orchestrator'], children: swarm, calls: [
        c(8, 'delegate', 'ok', `Task 'tests': queued\n\n${state([['IN_PROGRESS', 'impl', 'impl101']])}`, '2026-10-15T03:48:47.160Z'),
        { ...c(20, 'todo', 'ok', `Replaced the todo list: 1 phase, 1 task.\n${state([['COMPLETED', 'tests', 'test101']])}`, '2026-10-15T03:49:50.000Z'), args: closeImpl },
      ] }]);
      expect(r.unread).toEqual([
        { scenario: 'delegation-swarm', ordinal: 8, item: 'test101', why: 'not shown' },
        { scenario: 'delegation-swarm', ordinal: 20, item: 'impl101', why: 'not shown' },
      ]);
      expect(r.heldReads).toBe(1);
    });
  });

  /**
   * fin47's reviewers' finding (bundle `fin47-accept1-2`): `unread` could go red, reading as a gap of the reader, where the
   * reader had read correctly. An id `TASK_ID` cannot take (a plan stored before fin47's finding A6 kept whatever id its model
   * sent, spaces and parentheses included) was never looked up, and an item the coordinator had removed while a child held it
   * (`remove_task` protects no held item) read the same as one the reader failed to parse. An item `todoStates` gives no state
   * for is now looked up by its exact rendered suffix, ` (<id>)` at the line's end or before its ` — `, and one still unread
   * says why: `not shown` (no line of the Todo state carries it) or `not parsed` (a line carries it in a shape the reader does
   * not take, a reader gap).
   * docs/defects/fixed/the-live-runs-todo-state-reader-calls-an-item-it-was-not-shown-unparsed.md
   */
  describe('an item the reader gave no state for is looked up by its rendered suffix, and an unread one says why', () => {
    const legacy = [
      { task_id: 'bg_1', canonical_name: 'impl', persona: 'coding-agent', depth: 1, todo_item: 'impl 1', spawned_at: '2026-10-15T03:48:47.100Z', completed_at: '2026-10-15T03:49:40.000Z' },
      { task_id: 'bg_2', canonical_name: 'tests', persona: 'tester', depth: 1, todo_item: 'tests (unit)', spawned_at: '2026-10-15T03:48:47.150Z', completed_at: '2026-10-15T03:49:44.000Z' },
    ];

    it('an id holding a space or a parenthesis is read from its line, in a held reading and in a closing replace', () => {
      const close = { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: 'impl 1', name: 'impl', state: 'COMPLETED' }, { id: 'tests (unit)', name: 'tests', state: 'COMPLETED' }] }] };
      const r = heldItemReading([{ scenario: 'delegation', rootNames: ['orchestrator'], children: legacy, calls: [
        c(8, 'delegate', 'ok', `Task 'tests': queued\n\nTodo state:\nPhase main (e40a534e)\n  [IN_PROGRESS] impl (impl 1)\n  [PENDING] tests (tests (unit)) — see (README)`, '2026-10-15T03:48:47.160Z'),
        { ...c(20, 'todo', 'ok', 'Replaced the todo list: 1 phase, 2 tasks.\nTodo state:\nPhase main (e40a534e)\n  [COMPLETED] impl (impl 1)\n  [COMPLETED] tests (tests (unit))', '2026-10-15T03:49:50.000Z'), args: close },
      ] }]);
      expect(r.unread).toEqual([]);
      expect(r.heldReads).toBe(2);
      expect(r.heldPending).toEqual([{ scenario: 'delegation', ordinal: 8, child: 'tests', item: 'tests (unit)' }]);
      expect(r.closes).toEqual([
        { scenario: 'delegation', ordinal: 20, item: 'impl 1', sent: 'COMPLETED', stored: 'COMPLETED' },
        { scenario: 'delegation', ordinal: 20, item: 'tests (unit)', sent: 'COMPLETED', stored: 'COMPLETED' },
      ]);
    });

    it('a held item the coordinator removed is not shown; one a line carries in a shape the reader does not take is not parsed', () => {
      const r = heldItemReading([{ scenario: 'delegation', rootNames: ['orchestrator'], children: kids, calls: [
        c(2, 'delegate', 'ok', "Task 'impl': queued\ntask_id: bg_00000001", '2026-10-07T07:00:10Z'),
        // remove_task protects no held item: the impl child still holds 0000000a, and the Todo state no longer carries it.
        c(9, 'todo', 'ok', `Removed task impl (0000000a).\n${state([['IN_PROGRESS', 'tests', '0000000b']])}`, '2026-10-07T07:01:00Z'),
        // A name holding a line break puts the id on a line of no task shape.
        c(10, 'todo', 'ok', 'Updated task tests (0000000b): name.\nTodo state:\nPhase main (e002ab7d)\n  [IN_PROGRESS] tests\n  and more (0000000b)', '2026-10-07T07:01:10Z'),
      ] }]);
      expect(r.unread).toEqual([
        { scenario: 'delegation', ordinal: 9, item: '0000000a', why: 'not shown' },
        { scenario: 'delegation', ordinal: 10, item: '0000000a', why: 'not shown' },
        { scenario: 'delegation', ordinal: 10, item: '0000000b', why: 'not parsed' },
      ]);
      expect(r.heldReads).toBe(1);
    });

    it('a line of several readings adds each as a key no single-reading line claims, so the map counts readings, not tasks', () => {
      const states = todoStates('Todo state:\nPhase main (e40a534e)\n  [PENDING] Docs (0000000c) — update (README)')!;
      expect(states.get('0000000c')).toBe('PENDING');
      expect(states.size).toBe(2);
    });
  });
});
