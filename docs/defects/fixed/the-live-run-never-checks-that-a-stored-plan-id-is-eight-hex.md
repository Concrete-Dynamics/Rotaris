## The live run never checks that a stored plan id is eight-hex

Recorded 2026-10-20 by loc1 (bundle `loc1-todo-reader`) from fin47's reviewers' optional finding on bundle `fin47-accept1-6`,
which left it unrecorded.

fin47's finding A6 (`docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`) was a `replace` storing a
new task under the id its model sent (`impl101`, `test101`, `doc101`, `verify101` in the 3c03287 swarm session). Its repair is
pinned by `tools.test.ts`, but no check of the live run reads the ids a coordinating session's plans store: a recurrence — a new
path that keeps a model's id, or a regression of `resolveIds` — would pass every live check and be seen only by an autopsy that
happens to read `sessions.todo`. The three Todo-state checks would not catch it either, since `todoStates` reads any id since
finding A7.

## Specs

REQ-TOOLS-144: phases and tasks "both carry stable auto-generated 8-hex-character ids". The product meets it as built; the gap
is the live run's, which asserts nothing of it.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `checkCoordinatorTodo`, which reads each kept session's stored plan and its children's.
- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `rootAgentPlan` and `planItemIds` read the plans; nothing holds their ids to
  REQ-TOOLS-144's shape.
- `AGENTS.md` — the paragraph on the readings over every session.

## Outcome

Repaired 2026-10-20 by loc1 (bundle `loc1-todo-reader`); harness only, no product code.

- `planIdReading` (`coordinator-todo.mjs`) reads, over every coordinating session (one whose root delegated) the run kept, every
  phase and task id of the root's stored agent plan and of each child's own stored plan, and reports each that is not eight
  hex characters (`EIGHT_HEX`), with its owner (the root or the child) and its kind.
- `checkCoordinatorTodo` fails "every phase and task id in a coordinating session's stored plans is eight-hex (REQ-TOOLS-144,
  finding A6)" on one, naming it; a run whose coordinators stored no plan id reads a NOTE that the ids are unasked, never a PASS.
  `AGENTS.md`'s paragraph on the readings over every session says so.
- Pinned by `coordinator-todo.test.ts`'s "planIdReading (REQ-TOOLS-144, finding A6)": the 3c03287 swarm session's recorded plan
  (`impl101`, `test101`, `doc101`, `verify101` under `e40a534e`) reports its four task ids; generated ids pass, a child's own plan
  is read, and a session that never delegated or stored no plan adds nothing (red before: `planIdReading` did not exist).
- **First execution, 2026-10-20** (`live-run.mjs --only=delegation` in the bundle's tree at `330c3c50`, pack
  `2026-10-20T15-24-26-159Z`; Windows 11 ARM64 (build 26200), Node 24.18.0 arm64; CPU load 100 % at launch, with Electron of
  three other trees alive): passed, "10 id(s) in 2 plan(s) of 2 coordinating session(s)" (delegation, delegation-swarm, the
  root plans; no child kept a plan of its own). The swarm coordinator's first `replace` (`#6`) sent ids of its own, `a1` to `a3`,
  and read "New ids replace the ones sent for …"; the plan stored generated ones, so A6 did not recur where it was first seen.
  The run passed, 44 checks, none failed.
