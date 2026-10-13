## A todo `replace` cannot close a delegated item, and its success hides the restore

Since `PD-TOOLS-006` revision 7 the run marks a delegated item IN_PROGRESS at admission (`markDelegatedItem`), a state the
coordinator never wrote. REQ-TOOLS-146 then restores that IN_PROGRESS task over whatever a `replace` sends for its id, so once
the child has ended, a coordinator that closes its plan the usual way, one `replace` with every item COMPLETED, leaves the
delegated items IN_PROGRESS. The `replace` still answers `Replaced the todo list: 1 phase, N tasks.` and says nothing of what it
kept; the only signal is an `[IN_PROGRESS]` marker in the Todo state below it.

- **Found by building**, in revision 7's first execution (fin33, 2026-10-13): the scripted coordinator's `done` step wrote one
  such `replace` and left the plan open, and the step was changed to send one `update` per open item "as a model must"
  (`docs/product/directives.md`, `PD-TOOLS-006`, "`replace` cannot complete an active item"). No live model is told that rule.
- **The cost on a live run.** The coordinator answers with its plan open, so PD-ORCH-015's correction is sent; its text asks only
  for "each item's true state with the todo tool", and a model that answers it with the same `replace` meets the same restore.
  After the correction REQ-ORCH-075 re-queues the task to a fresh root, the transcript gains a `system` row saying the
  coordinator "answered with items of its plan not done" although the request was met, and REQ-ORCH-077's limit can end the
  run `failed`.
- **The observation is false by omission.** A success that does not say a sent state was overridden tells the agent its list
  was stored as sent.

Ruled as [OQ-254](../../architecture/open-questions.md#oq-254) under the owner's delegation (R-072): `PD-TOOLS-008` revision 3.

## Specs

- REQ-TOOLS-146 (`replace` restores a protected task by id with its state intact), whose stated purpose is that a replace can
  neither silently retire the task the agent is working on nor introduce a second IN_PROGRESS task — a delegated item whose
  child has ended is neither; and `PD-TOOLS-008` revision 2, "REQ-TOOLS-146's protection is otherwise unchanged".
- REQ-ORCH-029 (a todo item's recorded state may not disagree with what happened) and REQ-TOOLS-147 (the Agent plan is the
  run's primary progress display), which the restored IN_PROGRESS contradicts once the child has ended.
- REQ-ORCH-075 and PD-ORCH-015, the re-queue and the correction the open plan triggers.

## Relevant files

- `packages/agent-tools/src/tools/todo.ts` — the `replace` branch (`PROTECTED`, the restore of a protected task, the success
  sentence) and the tool's description.
- `apps/desktop/src/run-host/tools.ts` — `markDelegatedItem`, which sets the state, and the `todo` tool's options.
- `packages/engine/src/children/orchestration.ts`, `packages/engine/src/run/run.ts`, `packages/engine/src/sessions.ts` — the
  caller's children and their `todo_item`, which the run reads for the tool.
- `apps/desktop/src/run-host/scripted-client.ts` — the scripted `done` step changed to work around the restore.
- `packages/engine/src/run/stop-conditions.ts` — PD-ORCH-015's correction text.

## Outcome

Repaired 2026-10-13 (fin37, `fin37-replace-closes-delegated`) under `PD-TOOLS-008` revision 3
([OQ-254](../../architecture/open-questions.md#oq-254)). The `todo` tool reads, beside the held set, the items any child of the
list's owner serves, ended ones included (`TodoToolOptions.served`, read through `ToolPortContext.servedTodoItems` from
`IterationChildren.servedTodoItems`). In `replace`, a served IN_PROGRESS task no running child holds takes the COMPLETED or
ABANDONED the list sends and no longer counts as the active task against a mark in the same list; finished work, held tasks and
the agent's own active task are still restored. Every task restored over a different incoming state is named after the success
sentence, with its kept state, the reason and `update` as the remedy. The scripted coordinator gains `donereplace`, the close
with one `replace`; `done` keeps its updates.

Pinned by `packages/agent-tools/src/tools/tools.test.ts` ("a replace after a delegated child has ended"),
`apps/desktop/src/run-host/tools.test.ts` (the whole-list close after two parallel delegations ended) and
`packages/engine/src/children/children.test.ts` (the served set through `toolsFor`), each red on the code before; shown in the
built app by `pnpm mission-proof` item 1e (the close by one `replace`, no correction, one iteration); read from the live run by
`heldItemReading`'s `restoredOverClose` and `namedRestores` (`apps/desktop/scripts/lib/coordinator-todo.mjs`).
