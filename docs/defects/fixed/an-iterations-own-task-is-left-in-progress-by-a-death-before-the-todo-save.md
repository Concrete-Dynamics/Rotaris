## An iteration's own task is left in progress by a death before the todo save

When an execution iteration closes, `Run.iterate()` moves its todo task in memory (complete, requeued, abandoned, or back
to pending), then `endIteration` commits `iteration.end` and the row's close in their own transaction, then the
checkpoint capture and the `iteration_end` hooks are awaited, and only after those does `saveRunning` store the todo. A
run host that dies inside that window leaves the iteration's row closed while the stored todo still holds its task
`in_progress`. `closeOpenIteration` has the same shape (its `endIteration`, then the awaited capture, then `reopen`).
Nothing repairs the task afterwards: a selection takes only `pending` tasks, and the next run's constructor returns only
tasks a closed iteration *held* (`Todo.releaseStale`, `PD-ORCH-005` clause 17) — not an iteration's own task. The task
therefore stays `in_progress` for good, is never worked again, and the session's todo shows it as active at rest. A
request left this way is done again only because a continue that states no new request appends it a second time.

Noticed 2026-09-28 by the third review of the iteration lane under R-065 (the same window the first review found for a
held message), and confirmed in the source; present at the base `ff6671c`. Not repaired there: the lane narrowed its own
guard so that such a task no longer stops a Continue action appending the request (`Todo.holdsUnfinished` counts only a
task the open iteration holds), and left the stranded task as it was. Not driven in the built app.

## Specs

No requirement states the order of these saves. `REQ-ORCH-072` flips a task to in-progress as the iteration that
selected it begins, so a task in progress with no iteration open contradicts what the state means; and the closes of
`REQ-ORCH-073`, `REQ-ORCH-074` and `REQ-ORCH-135` each leave the task complete, requeued, abandoned or to be selected
again, never in progress. The repair `PD-ORCH-005` clause 17's build made for a held message — close it as the record
says its iteration closed — would apply here too, reading the closed row whose `todo_task_id` names the task.

## Relevant files

- `packages/engine/src/run/run.ts` — `iterate()` (the close, the capture and hooks, then `saveRunning`) and
  `closeOpenIteration` (the close, the capture, then `reopen`); the constructor's `releaseStale` call.
- `packages/engine/src/run/todo.ts` — `releaseStale`, which closes held tasks only.
- `packages/engine/src/run/message-task.test.ts` — the case "a task left in progress that no open iteration holds…",
  which builds this residue.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Both closes now commit the todo with the close: `SessionWriter.endIteration` takes the
session's todo and stores it in the transaction that records `iteration.end` and closes the row, and `Run.iterate()`
and `closeOpenIteration` pass the todo their task and held messages were just closed in (`closeOpenIteration` now
reopens the task and releases the messages before the close, not after the capture). The capture, the `iteration_end`
hooks and the save that follow can no longer leave the task `in_progress` with nothing open to hold it. A store an
earlier build left this way is settled where a held message already was — when a run is built and when a continue is
judged (`settleClosedIterations`, which calls `Todo.releaseStale` and the new `Todo.settleStranded`): an iteration's own
task in progress, not held and not the open iteration's, closes as the latest `iterations` row naming it closed —
`succeeded` complete, `partial` requeued (one consecutive retry, abandoned at the limit), `failed` or `abandoned`
abandoned, `cancelled` or no outcome pending. OQ-102's "A continue that states no new request" and "What a death
leaves" are corrected in place.

Evidence: `run/iteration-close.test.ts` — with the iteration's checkpoint capture held open, the stored todo already
holds the task complete (a success), abandoned (a failure) and pending ("continue without them"'s decline), and a task
an earlier build stranded is settled per outcome at the next run and worked again only when that close put it back;
all eight fail on the code before the repair. `run/todo.test.ts` pins `Todo.settleStranded`'s outcomes, its retry limit
and what it leaves. `run/message-task.test.ts`'s case that built this residue now pins that the Continue action takes
the settled request up and works it once. In the built app `checkpoint-proof`, `todo-proof` and `part-j-proof` were
run after the change; no proof drives a death inside the window.
