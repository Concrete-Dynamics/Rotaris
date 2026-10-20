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

/** REQ-TOOLS-144's id: "stable auto-generated 8-hex-character ids", as the todo tool's `hexId` writes them. */
export const EIGHT_HEX = /^[0-9a-f]{8}$/;

/**
 * REQ-TOOLS-144 over every coordinating session (one whose root delegated) the run kept: every phase and task id of the plans it
 * stores — the root's agent plan (`rootPlan`, `sessions.todo`'s envelope) and each child's own (`children.todo`) — is eight hex
 * characters. Until fin47's finding A6 a `replace` stored a new task under the id its model sent (`impl101` in the 3c03287 swarm
 * session, docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md), and only an autopsy reading the
 * stored plans could see it; this reading makes a recurrence fail the run (fin47's reviewers' finding, bundle `fin47-accept1-6`,
 * docs/defects/fixed/the-live-run-never-checks-that-a-stored-plan-id-is-eight-hex.md).
 *
 * `sessions`: `{ scenario, rootNames, calls: { tool_name, agent_name }[], rootPlan: { phases } | null, children: { canonical_name,
 * todo }[] }[]`. Returns `coordinating` (the sessions read), `plans` and `ids` (how many plans and ids were read), and `foreign` —
 * each id that is not eight-hex, `{ scenario, owner: 'root' | <child's canonical name>, kind: 'phase' | 'task', id }`.
 */
export function planIdReading(sessions) {
  const coordinating = [];
  const foreign = [];
  let plans = 0;
  let ids = 0;
  for (const s of sessions) {
    const roots = new Set(s.rootNames);
    if (!(s.calls ?? []).some((c) => roots.has(c.agent_name) && c.tool_name === 'delegate')) continue;
    coordinating.push(s.scenario);
    const owned = [['root', s.rootPlan ?? null]];
    for (const k of s.children ?? []) {
      let plan = null;
      try { plan = typeof k.todo === 'string' && k.todo !== '' ? JSON.parse(k.todo) : null; } catch { plan = null; }
      owned.push([k.canonical_name, plan]);
    }
    for (const [owner, plan] of owned) {
      if (!plan || !Array.isArray(plan.phases)) continue;
      plans += 1;
      for (const phase of plan.phases) {
        const entries = [['phase', phase?.id], ...(Array.isArray(phase?.tasks) ? phase.tasks.map((t) => ['task', t?.id]) : [])];
        for (const [kind, id] of entries) {
          if (typeof id !== 'string') continue;
          ids += 1;
          if (!EIGHT_HEX.test(id)) foreign.push({ scenario: s.scenario, owner, kind, id });
        }
      }
    }
  }
  return { coordinating, plans, ids, foreign };
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

/**
 * The task states a `Todo state:` block (REQ-TOOLS-147's rendering, `  [STATE] name (id)` and ` — description` when there is
 * one) carries, by id, or null where the text holds none.
 *
 * Any id is read, not only the eight-hex one REQ-TOOLS-144 generates: until fin47 (finding A6) a `replace` stored a new task
 * under the id its model sent (docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md), so a pack
 * recorded before it holds such ids, and until fin47 this reader matched
 * `([0-9a-f]{8})` alone, so every task of the 3c03287 swarm session (`impl101`, …) was invisible to `heldItemReading`, whose
 * checks then passed having read nothing (finding A7,
 * docs/defects/fixed/the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md). An id is a parenthesised token with
 * no space, followed by the line's end or ` — `. A name or description holding such a token too leaves its line several
 * readings: the lines of one reading are taken first, then each reading of the others that no line has given yet.
 *
 * So the map's keys are readings, not tasks: a line of several readings (a description ending in a no-space parenthesised
 * token, `Docs (0000000c) — update (README)`) adds each one no single-reading line claims, `README` included. That is harmless,
 * since a caller only looks up an id it already holds (a child's `todo_item`, an id a `replace` sent) and none holds `README`,
 * but `states.size` is not the number of tasks the Todo state shows, and nothing may count it as one. An id this pattern cannot
 * take (one holding a space or a parenthesis) is `todoItemState`'s to find.
 */
export function todoStates(text) {
  if (typeof text !== 'string') return null;
  const at = text.indexOf('Todo state:');
  if (at < 0) return null;
  const states = new Map();
  const ambiguous = [];
  for (const line of text.slice(at).split('\n')) {
    const task = TASK_LINE.exec(line);
    if (!task) continue;
    const ids = [...task[2].matchAll(TASK_ID)].map((m) => m[1]);
    if (ids.length === 1) states.set(ids[0], task[1]);
    else if (ids.length > 1) ambiguous.push([ids, task[1]]);
  }
  // Each extra reading becomes a key nothing looks up (above): the map counts readings, never tasks.
  for (const [ids, state] of ambiguous) for (const id of ids) if (!states.has(id)) states.set(id, state);
  return states;
}

/**
 * The state of the task `id` names in a `Todo state:` block, where `todoStates` gave none: the first task line on which the
 * exact rendered suffix ` (<id>)` closes the name, at the line's end or before its ` — `, so an id `TASK_ID` cannot take (a space
 * or a parenthesis in it, as a plan stored before fin47's finding A6 may hold) is still read. Where no task line carries it,
 * `why` says which of two things the reader met: `not shown` — no line of the block carries the suffix, so the Todo state holds
 * no task under that id (the coordinator removed it, `remove_task` protecting no held item, or never had it); `not parsed` — a
 * line other than a phase's carries it in a shape the reader does not take (a line break in a name, a rendering it does not
 * know), a gap of the reader's. Until 2026-10-20 both read as one `unread`, which the live run's detail could only call unread
 * (fin47's reviewers' finding, docs/defects/fixed/the-live-runs-todo-state-reader-calls-an-item-it-was-not-shown-unparsed.md).
 */
export function todoItemState(text, id) {
  const at = typeof text === 'string' ? text.indexOf('Todo state:') : -1;
  if (at < 0) return { why: 'not shown' };
  const suffix = ` (${id})`;
  const closes = (rest) => rest.endsWith(suffix) || rest.includes(`${suffix} — `);
  let shaped = false;
  for (const line of text.slice(at).split('\n')) {
    const task = TASK_LINE.exec(line);
    if (task && closes(task[2])) return { state: task[1] };
    if (!task && !line.startsWith('Phase ') && closes(line)) shaped = true;
  }
  return { why: shaped ? 'not parsed' : 'not shown' };
}

/** A rendered task line (REQ-TOOLS-147): `  [STATE] ` and the rest, the name, its ` (id)` and any ` — description`. */
const TASK_LINE = /^ {2}\[(PENDING|IN_PROGRESS|COMPLETED|ABANDONED)\] (.+)$/;

/** A rendered task line's id: ` (id)` closing the name, before the line's end or the description's ` — `. */
const TASK_ID = / \(([^()\s]+)\)(?= — |$)/g;

/**
 * PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 (OQ-249, ruled 2026-10-07 under R-072): what the coordinator's plan
 * recorded of the items its running children held, read from each root `todo` or `delegate` result that carries the Todo state
 * (the plan as it stood when that call ended), against each root child's `todo_item` and the windows in which it held it
 * (`holdingWindows`: each run of it while non-terminal, from the session's timeline).
 *
 * `sessions`: `{ scenario, rootNames, calls: { ordinal, tool_name, agent_name, status, result, endedAt }[], children: { task_id,
 * canonical_name, persona, depth, todo_item, spawned_at, completed_at }[], timeline?: { ordinal, at, name, metadata }[],
 * rootPlan?: { phases } | null }[]`.
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
 * - `namedRestores` — each accepted root `replace` whose observation names a task it kept over a different state (a NOTE);
 * - `heldReads` — how many states of a held item those Todo states gave (`heldPending` and `closedWhileHeld` read these), and
 *   `unread` — each held item, and each item a closing `replace` sent, that the Todo state its call carried gave no state for
 *   (target 0), with `why`: `not shown` or `not parsed` (`todoItemState`). Until fin47 a model-chosen id was never read, and
 *   the three checks passed over a session having read nothing of it (finding A7,
 *   docs/defects/fixed/the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md); until 2026-10-20 an item the Todo
 *   state did not show read the same as one the reader could not parse.
 *
 * Since `PD-TOOLS-008` revision 4 and `PD-TOOLS-006` revision 11 (OQ-333, ruled 2026-10-15 under R-072) a served item no longer
 * counts against the coordinator's next mark (`singleActive` keeps its target of 0, now with no accepted cause), and the
 * message that resumes a wait names a reported child's item still open. Three more readings, each a NOTE:
 * - `openAtAnswer` — each item a root child served that the stored root plan (`rootPlan`, the session's final agent plan, as the
 *   coordinator left it when it answered) still holds IN_PROGRESS with every child serving it ended;
 * - `closeLatencies` — for each root child whose item a later root `todo` call closed (an `update` of that id, or a `replace`
 *   sending it, to COMPLETED or ABANDONED, accepted), the seconds from the child's end (its last holding window's close) to that
 *   call's end;
 * - `resumeLines` — each root `wait_for_tasks` or `delegate` result carrying revision 11's line, with the items it names.
 */
export function heldItemReading(sessions) {
  const heldPending = [];
  const closedWhileHeld = [];
  const singleActive = [];
  const restoredOverClose = [];
  const closes = [];
  const namedRestores = [];
  const openAtAnswer = [];
  const closeLatencies = [];
  const resumeLines = [];
  const unread = [];
  let heldReads = 0;
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
    const missed = (c, item, why) => {
      if (!unread.some((u) => u.scenario === s.scenario && u.ordinal === c.ordinal && u.item === item)) unread.push({ scenario: s.scenario, ordinal: c.ordinal, item, why });
    };
    // The item's state in the call's Todo state: `todoStates`' reading, else its rendered suffix (`todoItemState`); undefined,
    // with the item reported unread and why, where neither finds it.
    const stateOf = (c, states, item) => {
      const read = states.get(item);
      if (read !== undefined) return read;
      const found = todoItemState(c.result, item);
      if (found.state !== undefined) return found.state;
      missed(c, item, found.why);
      return undefined;
    };
    for (const c of rootCalls) {
      if (c.status !== 'ok' || c.endedAt === null || c.endedAt === undefined) continue;
      if (c.tool_name !== 'todo' && c.tool_name !== 'delegate') continue;
      const states = todoStates(c.result);
      if (states === null) continue;
      for (const k of kids) {
        if (!holdsAt(windows.get(k), c.endedAt)) continue;
        const state = stateOf(c, states, k.todo_item);
        if (state === undefined) continue;
        heldReads += 1;
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
        const stored = stateOf(c, states, t.id);
        closes.push({ scenario: s.scenario, ordinal: c.ordinal, item: t.id, sent: t.state, stored: stored ?? null });
        if (stored === 'IN_PROGRESS') restoredOverClose.push({ scenario: s.scenario, ordinal: c.ordinal, item: t.id });
      }
    }
    // PD-TOOLS-006 revision 11 (OQ-333): the resume line, the items left open when the coordinator answered, and how long each
    // delegated item stayed open after its child ended. Read from the arguments and the stored plan, not from a Todo state block
    // (whose reader took eight-hex ids alone until fin47's finding A7).
    for (const c of rootCalls) {
      if ((c.tool_name !== 'wait_for_tasks' && c.tool_name !== 'delegate') || typeof c.result !== 'string') continue;
      const items = [...c.result.matchAll(RESUME_LINE)].map((m) => m[1]);
      if (items.length > 0) resumeLines.push({ scenario: s.scenario, ordinal: c.ordinal, items });
    }
    const endOf = (k) => {
      const last = windows.get(k)?.at(-1);
      return last === undefined || !Number.isFinite(last[1]) ? null : last[1];
    };
    const finalStates = new Map(planTasks(s.rootPlan).map((t) => [t.id, t.state]));
    const reported = new Set();
    for (const k of kids) {
      if (reported.has(k.todo_item) || finalStates.get(k.todo_item) !== 'IN_PROGRESS') continue;
      const servers = kids.filter((x) => x.todo_item === k.todo_item);
      if (servers.some((x) => endOf(x) === null)) continue;
      reported.add(k.todo_item);
      openAtAnswer.push({ scenario: s.scenario, item: k.todo_item, children: servers.map((x) => x.canonical_name) });
    }
    for (const k of kids) {
      const end = endOf(k);
      if (end === null) continue;
      const close = rootCalls.find((c) => c.tool_name === 'todo' && c.status === 'ok' && typeof c.endedAt === 'number' && c.endedAt >= end && closesItem(argsOf(c.args), k.todo_item));
      if (close !== undefined) closeLatencies.push({ scenario: s.scenario, item: k.todo_item, child: k.canonical_name, ordinal: close.ordinal, seconds: (close.endedAt - end) / 1000 });
    }
  }
  return { coordinating, heldReads, unread, heldPending, closedWhileHeld, singleActive, restoredOverClose, closes, namedRestores, openAtAnswer, closeLatencies, resumeLines };
}

/** `PD-TOOLS-006` revision 11's line, as the run writes it after a reported child's result; group 1 is the item's id. */
const RESUME_LINE = /^Todo item .+ \(([^()\s]+)\) is still IN_PROGRESS: close it with update once you accept this report\.$/gm;

/** Every task of a stored agent plan (`{ schema_version: 1, phases }`), `{ id, state }`; none where there is no plan. */
function planTasks(plan) {
  if (!plan || !Array.isArray(plan.phases)) return [];
  return plan.phases.flatMap((phase) => (Array.isArray(phase.tasks) ? phase.tasks : [])).filter((t) => typeof t?.id === 'string');
}

/** Whether a `todo` call's arguments close `item`: an `update` of it, or a `replace` sending it, to COMPLETED or ABANDONED. */
function closesItem(args, item) {
  if (args === null) return false;
  const closed = (state) => state === 'COMPLETED' || state === 'ABANDONED';
  if (args.operation === 'update') return args.task_id === item && closed(args.state);
  if (args.operation !== 'replace' || !Array.isArray(args.phases)) return false;
  return args.phases.some((p) => Array.isArray(p?.tasks) && p.tasks.some((t) => t?.id === item && closed(t.state)));
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
