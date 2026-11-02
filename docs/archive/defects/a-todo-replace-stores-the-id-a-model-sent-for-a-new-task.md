## A todo replace stores the id a model sent for a new task

**Outcome: repaired 2026-10-15 by fin47 (`fin47-accept1-6`, acceptance finding A6; REQ-TOOLS-144).** `replace` now resolves
every incoming phase's and task's id before anything else reads it (`resolveIds` in `packages/agent-tools/src/tools/todo.ts`): an
id is kept only when the list holds it (a phase id for a phase, a task id for a task) and no earlier entry of the same call has
taken it; every other entry, one sent with no id included, gets a generated eight-hex id unique in the list, as `add_phase` and
`add_task` give, and is a new phase or task. So `impl101` is stored as a generated id, two tasks sent with one unknown id are two
tasks under two ids, and a second entry naming an id the list holds is a new task too (marked IN_PROGRESS beside a protected active task it is
REQ-TOOLS-146's refusal, as any new task's mark is). The protection, the closes, the single-active counts and the served and held
exemptions read the resolved ids, so they are as they were for every id the list holds. The success sentence names each
replacement after the counts ("New ids replace the ones sent for impl (<id>) as 'impl101', …; target them by these."), so a model
that chose its ids is told the ones to target in the same observation, and the description's ids sentence says the tool gives them.
The question this note left ("mint, or refuse the call") is REQ-TOOLS-144's own: the ids are "auto-generated", which a refusal
asking the model for an id would not make them, and `add_task` already mints for the same case. Pinned by `tools.test.ts`'s
"a replace gives its own id to a phase or task the list does not hold (REQ-TOOLS-144)" (four cases, red on the code before); two
older cases that sent a held or served id over an empty list now seed the list with that item, since an id the list does not hold
names a new task no delegation serves. A live run shows it on the default pack's delegation-swarm: a coordinator that sends ids of
its own reads "New ids replace the ones sent for …" on its first `replace`, and every later call targets eight-hex ids.
*Added 2026-10-20 (loc1, `loc1-todo-reader`, fin47's reviewers' findings on `fin47-accept1-6`):* a delegated item the list no
longer holds (removed with `remove_task`, or set back to PENDING and left out of a `replace`) is, sent back under its old id, a
new task under a new id, so the `todo_item` its child stored no longer names it — REQ-TOOLS-144 as built, pinned by
`tools.test.ts`'s "a delegated item removed from the list, then sent back under its old id, is a new task with a new id". The live
run now fails a run whose coordinating sessions store a plan id that is not eight-hex (`planIdReading`,
`apps/desktop/scripts/lib/coordinator-todo.mjs`), so a recurrence no longer waits on an autopsy.


Found 2026-10-15 by fin47 (`fin47-classifier-and-todo`) while building OQ-333, reading the default live pack at `3c03287`
(pack `2026-10-15T03-10-08-908Z`, session `3e4b7210`, delegation-swarm). Not repaired: recorded along the way.

The coordinator's first `todo replace` (`#6`) sent its four new tasks with ids of its own choosing, `impl101`, `test101`,
`doc101` and `verify101`. The plan was empty, so none of them named a stored task, and `replace` stored each under the id the
model sent: `todo.ts`'s `replace` builds a task that matches no protected one as `{ id: t.id ?? hexId(), … }`, so an unknown id
is kept as given and only a missing one is generated. Every later call of the session targeted those ids (`#7` to `#9`'s
`todo_item`, `#26` to `#29`, `#42`), and the stored plan carries them.

Two consequences:
- **The product.** A task's id is the model's word, not the tool's. Two tasks the model sends with one unknown id are both
  stored under it, and targeting by id (REQ-TOOLS-144) then reaches only the first.
- **The harness.** `todoStates` (`apps/desktop/scripts/lib/coordinator-todo.mjs`) reads a rendered Todo state with an
  eight-hex id pattern, so in this session every task was invisible to `heldItemReading`'s `heldPending`, `closedWhileHeld` and
  `restoredOverClose`: those checks passed over the swarm session having read nothing of it. The readings fin47 added for
  OQ-333 (`openAtAnswer`, `closeLatencies`, `resumeLines`) read the arguments and the stored plan instead, and do not share the
  gap. **Repaired 2026-10-15 by fin47 (`fin47-accept1-2`, finding A7) and split out to its own note,
  [`the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md`](the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md):**
  the reader takes any id, and a held or closed item it cannot find fails the live run rather than passing. This note stays
  open for the product half alone.

## Specs

REQ-TOOLS-144: phases and tasks "both carry stable auto-generated 8-hex-character ids" and targeting is always by id. A task
stored under an id the model chose is not auto-generated. REQ-TOOLS-146's protection reads ids that the list already holds and
is not contradicted. Whether `replace` should mint an id for an incoming id the list does not hold, or refuse the call, is not
settled here.

## Relevant files

- `packages/agent-tools/src/tools/todo.ts`: `replace` keeps `t.id` for a task matching no protected one.
- `apps/desktop/scripts/lib/coordinator-todo.mjs`: `todoStates` matched `([0-9a-f]{8})` only, until fin47 (the harness half, repaired).
- `packages/agent-tools/src/tools/tools.test.ts`: no case sends an unknown id to `replace`.
