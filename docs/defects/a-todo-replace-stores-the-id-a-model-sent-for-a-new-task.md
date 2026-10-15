## A todo replace stores the id a model sent for a new task

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
  gap.

## Specs

REQ-TOOLS-144: phases and tasks "both carry stable auto-generated 8-hex-character ids" and targeting is always by id. A task
stored under an id the model chose is not auto-generated. REQ-TOOLS-146's protection reads ids that the list already holds and
is not contradicted. Whether `replace` should mint an id for an incoming id the list does not hold, or refuse the call, is not
settled here.

## Relevant files

- `packages/agent-tools/src/tools/todo.ts`: `replace` keeps `t.id` for a task matching no protected one.
- `apps/desktop/scripts/lib/coordinator-todo.mjs`: `todoStates` matches `([0-9a-f]{8})` only.
- `packages/agent-tools/src/tools/tools.test.ts`: no case sends an unknown id to `replace`.
