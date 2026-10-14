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
 *
 * A session launched under the `single` run override (REQ-ORCH-025, `rotaris.delegation_strategy`) is skipped: its entry role
 * is the worker, not a coordinator, and REQ-ORCH-029's constraints do not bind it (`RunDeps.coordinating`). The override is
 * read from the session's launch audit (`launch_audits.payload`'s `config_snapshot.delegation_strategy`, REQ-SESSION-138),
 * which records the launch alone; a continuation run under another override reads as the launch's.
 */
export const WORK_ITEM_TOOLS = new Set(['delegate', 'write_file', 'haet_edit', 'haet', 'terminal', 'git_commit']);

/** Whether the recorded call reached execution. */
const ran = (call) => call.status !== 'blocked' && call.failureKind !== 'invalid_request';

/**
 * `sessions`: `{ scenario, rootNames: string[], calls: { ordinal, tool_name, agent_name, status, failureKind }[],
 * agentPlanTasks: number | null, runOverride?: string | null }[]`, the calls in ordinal order. Returns `single` — the sessions
 * skipped as launched under the `single` override — and, over every other session: `unlisted` — each root work
 * item that ran as the session's second or later before any accepted root `todo` call (REQ-ORCH-029 breached); `refused` —
 * each root call the gate refused for want of a list (`todo_list_owed`); `multiStep` — the sessions whose root ran two or more
 * work items; `withoutPlan` — those of them whose stored todo carries no agent plan with a task.
 */
export function coordinatorTodoReading(sessions) {
  const unlisted = [];
  const refused = [];
  const multiStep = [];
  const withoutPlan = [];
  const single = [];
  for (const s of sessions) {
    if (s.runOverride === 'single') { single.push(s.scenario); continue; }
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
  return { read: sessions.map((s) => s.scenario), single, unlisted, refused, multiStep, withoutPlan };
}

/** The run override a session was launched under (`single`, `swarm`), from its launch audit's payload, or null for none or unreadable. */
export function launchRunOverride(payloadJson) {
  if (typeof payloadJson !== 'string' || payloadJson === '') return null;
  try {
    const strategy = JSON.parse(payloadJson)?.config_snapshot?.delegation_strategy;
    return strategy === 'single' || strategy === 'swarm' ? strategy : null;
  } catch { return null; }
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

/**
 * PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under R-072), building REQ-ORCH-028's and REQ-ORCH-029's "no two
 * implementation delegations for the same todo item are outstanding at once" from the run's own records: each child row's
 * `todo_item` (store v34), its spawn and completion times, and the plans the store keeps (`sessions.todo`'s agent plan for the
 * root's children, the parent's own `children.todo` for a child's).
 *
 * An **implementation** child is one whose persona the built-in table grants a tool that writes workspace files
 * (`WRITER_ROLES`; `coordinator-todo.test.ts` holds it equal to `BUILT_IN_ROLE_TOOLS`). A live run configures no persona,
 * so the built-in table is the grant its children receive.
 */
export const WRITER_ROLES = new Set(['coding-agent', 'tester', 'docs-writer', 'refactorer']);

/** The ids of every task a stored agent plan holds (`{ schema_version: 1, phases }`), or null where there is none. */
export function planItemIds(plan) {
  if (!plan || !Array.isArray(plan.phases)) return null;
  return plan.phases.flatMap((phase) => (Array.isArray(phase.tasks) ? phase.tasks.map((t) => t.id).filter((id) => typeof id === 'string') : []));
}

/** The root's agent plan out of `sessions.todo`'s version-2 envelope, or null. */
export function rootAgentPlan(todoJson) {
  if (typeof todoJson !== 'string' || todoJson === '') return null;
  try { const v = JSON.parse(todoJson); return v && v.schema_version === 2 ? v.agent ?? null : null; } catch { return null; }
}

/**
 * `sessions`: `{ scenario, listedAt: number | null, rootPlanIds: string[] | null, children: { task_id, canonical_name, persona,
 * parent_id, depth, todo_item, spawned_at, completed_at, todo }[] }[]`, where `listedAt` is when the first accepted root `todo`
 * call ended (ms) and `rootPlanIds` the stored root plan's item ids. Returns, over every session:
 * - `unnamed` — each root implementation child spawned after `listedAt` with no item (only a task's first delegation, made
 *   before any list, may carry none);
 * - `overlaps` — each pair of implementation children of one plan holding one item whose lives (`spawned_at` to
 *   `completed_at`, or still open) overlap;
 * - `stale` — each child whose item its plan, as stored, no longer holds.
 */
export function todoItemReading(sessions) {
  const unnamed = [];
  const overlaps = [];
  const stale = [];
  const named = [];
  for (const s of sessions) {
    const kids = s.children ?? [];
    const implementation = kids.filter((c) => WRITER_ROLES.has(c.persona));
    for (const c of kids) if (c.todo_item) named.push({ scenario: s.scenario, child: c.canonical_name, item: c.todo_item });
    for (const c of implementation) {
      if (c.depth === 1 && !c.todo_item && s.listedAt !== null && Date.parse(c.spawned_at) > s.listedAt) unnamed.push({ scenario: s.scenario, child: c.canonical_name, persona: c.persona });
    }
    const planOf = (c) => (c.depth === 1 ? 'root' : c.parent_id);
    for (let i = 0; i < implementation.length; i++) {
      for (let j = i + 1; j < implementation.length; j++) {
        const a = implementation[i];
        const b = implementation[j];
        if (!a.todo_item || a.todo_item !== b.todo_item || planOf(a) !== planOf(b)) continue;
        const end = (c) => (c.completed_at ? Date.parse(c.completed_at) : Infinity);
        if (Date.parse(a.spawned_at) < end(b) && Date.parse(b.spawned_at) < end(a)) overlaps.push({ scenario: s.scenario, item: a.todo_item, children: [a.canonical_name, b.canonical_name] });
      }
    }
    for (const c of kids) {
      if (!c.todo_item) continue;
      let ids;
      if (c.depth === 1) ids = s.rootPlanIds;
      else {
        const parent = kids.find((p) => p.task_id === c.parent_id);
        let plan = null;
        try { plan = parent && typeof parent.todo === 'string' ? JSON.parse(parent.todo) : null; } catch { plan = null; }
        ids = planItemIds(plan);
      }
      if (!(ids ?? []).includes(c.todo_item)) stale.push({ scenario: s.scenario, child: c.canonical_name, item: c.todo_item });
    }
  }
  return { read: sessions.map((s) => s.scenario), named, unnamed, overlaps, stale };
}

/** The task states a `Todo state:` block (REQ-TOOLS-147's rendering) carries, by id, or null where the text holds none. */
export function todoStates(text) {
  if (typeof text !== 'string') return null;
  const at = text.indexOf('Todo state:');
  if (at < 0) return null;
  const states = new Map();
  for (const line of text.slice(at).split('\n')) {
    const task = /^ {2}\[(PENDING|IN_PROGRESS|COMPLETED|ABANDONED)\] .+? \(([0-9a-f]{8})\)(?: — .*)?$/.exec(line);
    if (task) states.set(task[2], task[1]);
  }
  return states;
}

/**
 * PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 (OQ-249, ruled 2026-10-07 under R-072): what the coordinator's plan
 * recorded of the items its running children held, read from each root `todo` or `delegate` result that carries the Todo state
 * (the plan as it stood when that call ended), against each root child's `todo_item` and the windows in which it held it
 * (`holdingWindows`: each run of it while non-terminal, from the session's timeline).
 *
 * `sessions`: `{ scenario, rootNames, calls: { ordinal, tool_name, agent_name, status, result, endedAt }[], children: { task_id,
 * canonical_name, persona, depth, todo_item, spawned_at, completed_at }[], timeline?: { ordinal, at, name, metadata }[] }[]`.
 * Returns, over every coordinating session (one whose root delegated):
 * - `heldPending` — each reading of a held item as PENDING (the default live run's `#14` at a68f121; target 0);
 * - `closedWhileHeld` — each reading of an item COMPLETED while an implementation child (`WRITER_ROLES`) still held it (target 0);
 * - `singleActive` — each root `todo` call refused under REQ-TOOLS-145 or PD-TOOLS-008 (a NOTE; target 0);
 * - `restoredOverClose` — PD-TOOLS-008 revision 3 (OQ-255): each item a root `replace` sent COMPLETED or ABANDONED that its
 *   result still reads IN_PROGRESS although a root child had served it and none still held it (the close revision 3 makes
 *   possible; target 0). The calls carry `args`, the arguments the record stores;
 * - `closes` — every such close a root `replace` sent, whatever its result stored (`sent`, `stored`): the case revision 3
 *   decides, asked. Empty, `restoredOverClose` measured nothing, and the live run says so in a NOTE rather than a PASS (at
 *   `0bc3eee` every coordinator closed with `update`: docs/defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md);
 * - `namedRestores` — each accepted root `replace` whose observation names a task it kept over a different state (a NOTE).
 */
export function heldItemReading(sessions) {
  const heldPending = [];
  const closedWhileHeld = [];
  const singleActive = [];
  const restoredOverClose = [];
  const closes = [];
  const namedRestores = [];
  const coordinating = [];
  for (const s of sessions) {
    const roots = new Set(s.rootNames);
    const rootCalls = (s.calls ?? []).filter((c) => roots.has(c.agent_name));
    if (!rootCalls.some((c) => c.tool_name === 'delegate')) continue;
    coordinating.push(s.scenario);
    for (const c of rootCalls) {
      if (c.tool_name === 'todo' && c.status !== 'ok' && /^Only one task can be IN_PROGRESS at a time\./.test(String(c.result ?? ''))) singleActive.push({ scenario: s.scenario, ordinal: c.ordinal });
    }
    const kids = (s.children ?? []).filter((k) => k.depth === 1 && k.todo_item);
    const windows = new Map(kids.map((k) => [k, holdingWindows(k, s.timeline)]));
    for (const c of rootCalls) {
      if (c.status !== 'ok' || c.endedAt === null || c.endedAt === undefined) continue;
      if (c.tool_name !== 'todo' && c.tool_name !== 'delegate') continue;
      const states = todoStates(c.result);
      if (states === null) continue;
      for (const k of kids) {
        if (!holdsAt(windows.get(k), c.endedAt)) continue;
        const state = states.get(k.todo_item);
        if (state === 'PENDING') heldPending.push({ scenario: s.scenario, ordinal: c.ordinal, child: k.canonical_name, item: k.todo_item });
        if (state === 'COMPLETED' && WRITER_ROLES.has(k.persona)) closedWhileHeld.push({ scenario: s.scenario, ordinal: c.ordinal, child: k.canonical_name, item: k.todo_item });
      }
    }
    for (const c of rootCalls) {
      if (c.tool_name !== 'todo' || c.status !== 'ok' || c.endedAt === null || c.endedAt === undefined) continue;
      const args = argsOf(c.args);
      if (args?.operation !== 'replace') continue;
      if (/ Kept as they were: /.test(String(c.result ?? '').split('\n')[0])) namedRestores.push({ scenario: s.scenario, ordinal: c.ordinal });
      const states = todoStates(c.result);
      if (states === null) continue;
      for (const t of (Array.isArray(args.phases) ? args.phases : []).flatMap((p) => (Array.isArray(p?.tasks) ? p.tasks : []))) {
        if (typeof t?.id !== 'string' || (t.state !== 'COMPLETED' && t.state !== 'ABANDONED')) continue;
        const servers = kids.filter((k) => k.todo_item === t.id && Date.parse(k.spawned_at) <= c.endedAt);
        if (servers.length === 0 || servers.some((k) => holdsAt(windows.get(k), c.endedAt))) continue;
        // The case revision 3 decides, asked: a `replace` closing an item every child serving it has ended.
        closes.push({ scenario: s.scenario, ordinal: c.ordinal, item: t.id, sent: t.state, stored: states.get(t.id) ?? null });
        if (states.get(t.id) === 'IN_PROGRESS') restoredOverClose.push({ scenario: s.scenario, ordinal: c.ordinal, item: t.id });
      }
    }
  }
  return { coordinating, heldPending, closedWhileHeld, singleActive, restoredOverClose, closes, namedRestores };
}

/**
 * The windows `[from, to)` in which a root child held its todo item, in epoch milliseconds: PD-TOOLS-006 revision 7 holds it
 * "while the child is non-terminal". The first opens at its admission (`spawned_at`; a queued child holds its item too), each
 * later one at the `child_resumed` (or `child_start`) that follows a `child_end`, and each closes at its `child_end`; the last
 * stays open while none has followed (a paused child is non-terminal). `timeline` is the session's timeline rows
 * (`{ ordinal, at, name, metadata }`, metadata the stored JSON); its `child_start`, `child_end` and `child_resumed` entries are
 * read for this child's `task_id`.
 *
 * Until fin46 the window was the row's `spawned_at` to `completed_at`. A `session_id` follow-up clears `completed_at`, and a
 * quit that then pauses the child leaves it null, so the 3c3f447 terminal run read a tester as holding its item across the
 * gap between its first `child_end` and the follow-up, and failed a close the coordinator made in that gap (finding L2,
 * `docs/defects/fixed/the-live-runs-held-item-check-holds-a-followed-up-child-across-the-gap-between-its-runs.md`). With no
 * timeline entry for the child the row's window stands, as before.
 */
export function holdingWindows(child, timeline) {
  const spawned = Date.parse(child.spawned_at);
  const completed = child.completed_at ? Date.parse(child.completed_at) : Infinity;
  const mine = (timeline ?? [])
    .filter((e) => (e.name === 'child_start' || e.name === 'child_end' || e.name === 'child_resumed') && child.task_id !== undefined && taskIdOf(e.metadata) === child.task_id)
    .sort((a, b) => a.ordinal - b.ordinal);
  if (mine.length === 0) return [[spawned, completed]];
  const windows = [];
  let open = spawned;
  for (const e of mine) {
    const t = Date.parse(e.at);
    if (e.name === 'child_end') {
      if (open !== null) windows.push([open, t]);
      open = null;
    } else if (open === null) open = t;
  }
  if (open !== null) windows.push([open, completed]);
  return windows;
}

const holdsAt = (windows, t) => (windows ?? []).some(([from, to]) => from <= t && t < to);

function taskIdOf(metadata) {
  const m = argsOf(metadata);
  return typeof m?.task_id === 'string' ? m.task_id : null;
}

/** A recorded call's arguments as an object: the record keeps an object, or the cut string of one a refusal stored. */
function argsOf(args) {
  if (args !== null && typeof args === 'object') return args;
  if (typeof args !== 'string') return null;
  try { const parsed = JSON.parse(args); return parsed !== null && typeof parsed === 'object' ? parsed : null; } catch { return null; }
}
