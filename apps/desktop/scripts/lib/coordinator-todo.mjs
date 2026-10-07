/**
 * OQ-213 as ruled under the owner's delegation (R-072, 2026-10-07), building REQ-ORCH-029's "work spanning more than one step
 * is accompanied by a todo list it keeps current", as the live run reads it from each preserved session's records: the root's
 * tool calls (`tool_calls`, by the root persona's name the session's iterations record) and the stored todo
 * (`sessions.todo`).
 *
 * A **work item** is a `delegate` call, or a call of a public tool the registry declares as writing workspace files or running
 * commands (`isWorkItem`, `packages/agent-tools/src/todo-list-gate.ts`; the coordinator holds those only on a direct-work
 * grant). It **ran** when it reached execution: not refused before it (`blocked`) and not refused by the gate's schema check
 * (`invalid_request`). An accepted root `todo` call is the coordinator's list. The reading is per session, not per task: a
 * session whose first task wrote a list and whose queued second task did not reads as listed (the engine's tests pin the
 * per-task rule, `packages/engine/src/run/coordinator-plan.test.ts`). Nor does it tell a plan cycle's calls (which neither count
 * nor are refused) from an iteration's: the tool-call record names no iteration, and no live-run scenario runs in plan mode.
 */
export const WORK_ITEM_TOOLS = new Set(['delegate', 'write_file', 'haet_edit', 'haet', 'terminal', 'git_commit']);

/** Whether the recorded call reached execution. */
const ran = (call) => call.status !== 'blocked' && call.failureKind !== 'invalid_request';

/**
 * `sessions`: `{ scenario, rootNames: string[], calls: { ordinal, tool_name, agent_name, status, failureKind }[],
 * agentPlanTasks: number | null }[]`, the calls in ordinal order. Returns, over every session: `unlisted` — each root work
 * item that ran as the session's second or later before any accepted root `todo` call (REQ-ORCH-029 breached); `refused` —
 * each root call the gate refused for want of a list (`todo_list_owed`); `multiStep` — the sessions whose root ran two or more
 * work items; `withoutPlan` — those of them whose stored todo carries no agent plan with a task.
 */
export function coordinatorTodoReading(sessions) {
  const unlisted = [];
  const refused = [];
  const multiStep = [];
  const withoutPlan = [];
  for (const s of sessions) {
    const roots = new Set(s.rootNames);
    let items = 0;
    let listed = false;
    for (const call of s.calls) {
      if (!roots.has(call.agent_name)) continue;
      if (call.failureKind === 'todo_list_owed') refused.push({ scenario: s.scenario, ordinal: call.ordinal, tool_name: call.tool_name });
      if (call.tool_name === 'todo' && call.status === 'ok') { listed = true; continue; }
      if (!WORK_ITEM_TOOLS.has(call.tool_name) || !ran(call)) continue;
      items += 1;
      if (items >= 2 && !listed) unlisted.push({ scenario: s.scenario, ordinal: call.ordinal, tool_name: call.tool_name });
    }
    if (items >= 2) {
      multiStep.push(s.scenario);
      if ((s.agentPlanTasks ?? 0) < 1) withoutPlan.push(s.scenario);
    }
  }
  return { read: sessions.map((s) => s.scenario), unlisted, refused, multiStep, withoutPlan };
}

/** The number of tasks the stored todo's agent plan holds (`sessions.todo`'s version-2 envelope), or null for none. */
export function agentPlanTaskCount(todoJson) {
  if (typeof todoJson !== 'string' || todoJson === '') return null;
  try {
    const value = JSON.parse(todoJson);
    const agent = value && value.schema_version === 2 ? value.agent : null;
    if (!agent || !Array.isArray(agent.phases)) return null;
    return agent.phases.reduce((n, phase) => n + (Array.isArray(phase.tasks) ? phase.tasks.length : 0), 0);
  } catch { return null; }
}
