## A parallel delegation's todo item cannot be marked in progress

REQ-TOOLS-145's single `IN_PROGRESS` task binds the coordinator's agent plan like any other, so a coordinator running two
delegated children at once can record only one of their items as active. The other item stays `PENDING` while its child
runs, and the Agent plan strip (REQ-TOOLS-147's primary progress display, REQ-CHAT-086) draws running work as open.

- **Default live run at `a68f121`** (pack `2026-10-07T06-48-50-123Z`, session `52aea43a`, the `edit` scenario; the
  autopsy's finding P3): the coordinator's plan `#5` marked both parallel children's items `IN_PROGRESS` and was refused
  in PD-TOOLS-008's sentence, which left `#7`, the same step's second `delegate`, refused by OQ-213. After the retry, `#14`
  tried to mark the running tests child's item `IN_PROGRESS` and was refused in REQ-TOOLS-145's sentence, so while both
  children ran the plan recorded the tests item `PENDING`. Cost: 2 refused `todo` calls, 1 refused `delegate`, 2 extra
  coordinator steps, about 19.5 s on the critical path.
- **Duress live run at `a68f121`** (pack `2026-10-07T07-09-30-708Z`, session `e6747bd0`; the autopsy's finding D7):
  `#19` refused a plan marking three items; `#20` and `#42` kept wave 1's items `PENDING` while their children ran; `#113`,
  `#246` and `#404` moved wave 2's and wave 3's items from `PENDING` straight to `COMPLETED`. The plan strip misreported
  running work for about 67 of the run's 69 minutes.
- **REQ-TOOLS-145's sentence gives harmful advice here.** `#14`'s refusal told the coordinator to mark the running
  implementer's item COMPLETED or ABANDONED, which is the record OQ-220's terminal-item refusal exists to prevent.

Ruled as [OQ-249](../../architecture/open-questions.md) under the owner's delegation (R-072): `PD-TOOLS-008` revision 2 and
`PD-TOOLS-006` revision 7.

## Specs

- REQ-TOOLS-145 (at most one task `IN_PROGRESS`) and `PD-TOOLS-008` revision 1 ("at most one task is IN_PROGRESS"), which
  force the disagreement for every parallel delegation.
- REQ-TOOLS-147 (the Agent plan is the run's primary progress display) and REQ-ORCH-029 (the coordinator keeps its list
  current; a todo item's recorded state may not disagree with what happened), which the forced `PENDING` contradicts.
- REQ-ORCH-028 (per-item ownership), with `PD-TOOLS-006` revision 6's `todo_item`, which names the item each delegation
  serves and gives the held set its record.

## Relevant files

- `packages/agent-tools/src/tools/todo.ts` — the single-active rule (`TodoList.active`, the `add_task`, `update` and
  `replace` checks, the two refusal sentences, the tool's description).
- `apps/desktop/src/run-host/tools.ts` — `createToolPort`, which builds the port's `TodoList` and the `delegate` executor.
- `packages/engine/src/run/stop-conditions.ts` — `TODO_LIST_OWED_TEXT`, which tells the coordinator to keep "only the step
  you are on IN_PROGRESS".
- `packages/engine/src/children/orchestration.ts` and `packages/engine/src/sessions.ts` — the admitted item and the
  caller's non-terminal children, which the run reads.

## Outcome

Repaired 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`) under `PD-TOOLS-008` revision 2 and `PD-TOOLS-006` revision 7
([OQ-249](../../architecture/open-questions.md)). A task a non-terminal child of the list's owner holds as its `todo_item` is
outside REQ-TOOLS-145's count, and the bound is checked only on a write that marks a task IN_PROGRESS (`todoTool`'s
`TodoToolOptions.held`, read through `ToolPortContext.heldTodoItems` from `IterationChildren.heldTodoItems`). An admitted
delegation hands its item back (`DelegateOutcome.todoItem`) and the caller's port marks it IN_PROGRESS when PENDING, persists
it and says so in the observation with the Todo state (`markDelegatedItem` in `apps/desktop/src/run-host/tools.ts`), before any
foreground wait. `TODO_LIST_OWED_TEXT` and the `todo` and `delegate` descriptions teach the coordinator to keep only its own
item IN_PROGRESS and leave delegated ones PENDING; `PD-TOOLS-008`'s sentence carries that hint for a `delegate` holder.

Pinned by `packages/agent-tools/src/tools/tools.test.ts` ("a task a running delegation holds"),
`packages/agent-tools/src/tools/delegation.test.ts` ("the admitted item is marked"), `apps/desktop/src/run-host/tools.test.ts`
("PD-TOOLS-006 revision 7"), `packages/engine/src/children/children.test.ts` ("revision 7" cases) and
`packages/engine/src/run/coordinator-plan.test.ts` (the refusal's text), each red on the code before where it pins a behaviour;
shown in the built app by `pnpm mission-proof` item 1e; read from the live run by `heldItemReading`
(`apps/desktop/scripts/lib/coordinator-todo.mjs`).
