# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 2. The loop and one iteration (continued)

Part 3 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

**A continue's message is also a task (PD-ORCH-005 clause 17; OQ-102).** A continue by message that resumes an open
iteration (`RunDeps.openIteration.delivered`, set by `launchContinuation` when the continue delivered a message) appends
the message to the planner todo's `Continued Prompts` phase as a task the resumed iteration **holds** (`Todo.appendHeld`:
`in_progress`, with `heldBy` the iteration's number, stored in the todo document itself), so no selection takes it while
the iteration is open. It closes with that iteration (`Todo.releaseHeld`): `complete` when the iteration succeeds, before
the stop conditions are judged, and back to `pending` — with no consecutive retry counted, and marked `nextUp`, so the
next selection takes it before every other pending task (`Todo.selectNext`; begun, it is an ordinary task again) — on
every other close: partial, failed, raised, cancelled by the explicit cancel or by a pause that found nothing
unfinished, and the closes `closeOpenIteration` makes (the decline, of an iteration a rest or a crash left open, and the
explicit cancel after a rest or during the pre-flight). A rest keeps it held. A task held by an iteration that is no longer open closes when the
next run is built as the record says that iteration closed (`Todo.releaseStale`): `complete` when its row reads
`succeeded`, `pending` and `nextUp` otherwise. The todo is saved with `starting`, so a death during the pre-flight keeps
the task as the root's record keeps the message. The Continue action and a plan decision deliver no message and append
no task for it. A continue that delivers no message — the Continue action, "continue without them", the message-limit
resolution's 'continue' and 'double' (REQ-SESSION-110) — restates the last request, so `launchContinuation` passes `appendsTask: false` while the todo still holds that request unfinished
(`Todo.holdsUnfinished`: a task of that text pending, or in progress and held by the open iteration — its own task or
a message it holds), and the run takes that task up as it stands; a task in progress that no iteration holds does
not count, since no selection would take it up. The todo is judged as the run will read it: what a death between an
iteration's close and the save of its todo left is settled first (`settleClosedIterations`, which the run's constructor
calls too) — a message a closed iteration still holds (`Todo.releaseStale` against `succeededIterationsOf`), and an
iteration's own task left in progress (`Todo.settleStranded`, as the latest row naming it closed) — so one the run
returns to pending is not appended a second time. A continue by message always
appends its task, even beside a pending task of the same text: it states a request (REQ-ORCH-004, OQ-102). The plan cycle held after a resumed iteration is told what became of
every message that iteration held (`Todo.heldIds`, read when the run is built): this continue's, or an earlier one's a
Continue action resumed it with. A message is marked as one for good (`Task.message`), so the iteration that takes it up
is told it in clause 17's words.

**Every iteration is sent its own task (REQ-CHAT-040, REQ-ORCH-004 / REQ-ORCH-135; the repair of
`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`, 2026-09-29).** The launch content — the prompt and its
attachments, or a continuation's handoff payload, with a plan decision's `planSection` — is the base of every
execution iteration's first message. `iterate()` records the task it selected (`Run.takenUp`) when that task is not the
run's own (`RunDeps.taskId`) and its text is not the launch content's request (`taskLabel ?? task`) — a queued prompt,
a task a pause, a stop or a death put back, an earlier request, an improvement run's proposal, a continue's message — and
`Run.firstMessage` adds it as a text part after the launch content and before the offers list, naming it the task to
work on (`takenUpText`; a continue's message in clause 17's words). The run's own task, and a task whose text is the
launch content's request (the Continue action restating a pending request, a plan decision's gated request), are told
nothing more. Never a plan cycle's root, which is not an iteration, including the one held after a resumed iteration
whose own task was a message. The launch content is not rebuilt per iteration: a later iteration of a continuation is
re-sent the handoff as it was read at the continue (OQ-106, "The handoff is read once"; OQ-104 for the plan cycle held
after a resumed iteration).

**An iteration a previous run left open, declined (PD-ORCH-005 clause 6; the repair of the crashed-iteration defect).**
Every execution iteration has an `iterations` row from the moment its root is minted, and `iteration.end` and the row's
close commit in one transaction (`endIteration`) — with the session's todo, its task and held messages already closed
in it, so a death while the `iteration_end` hooks or the capture run leaves no task in progress with nothing open to
hold it (the repair of `an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`, 2026-09-29;
until then the todo was saved only after them; the close takes no save generation and publishes nothing, so the
renderer sees the closed task with the save that follows the hooks). A rest or a dead run host leaves that row open. **Declined** —
`continueSession(…, { withoutPaused: true })`, "continue without them" — before its first iteration a run ends every
`paused` agent of the open iteration `cancelled` with a report saying so (`cancelPausedAgents`), closes the row `cancelled`
(`closeLeftOpenIteration`, REQ-ORCH-135) — its `iteration.end` summary names the decline and what left the agents paused,
a crash on clause 18's route included; every run that closes one was told to decline it —
and attempts that iteration's one
checkpoint capture (REQ-GIT-051, no child credited; its hooks' `iteration_end` is not fired — the hooks that saw it
begin were the dead run's): the task it held goes back to `pending` (`Todo.reopen`) in the close's transaction, and the count moves past it, so
the run's own first iteration takes the next number rather than the dead one's. The count is also never below the
highest iteration recorded closed, and a continuation's appended task id is 8 lowercase hexadecimal characters unique
among every id the todo holds and every task id an iteration recorded (`continuedTaskId`, REQ-CHAT-089; it was
`<session>:continued:<n>`, and a record under that form, or the first run's `<session>:main:1`, reads back unchanged —
an id is compared, never parsed). Every task and phase id the engine assigns takes that form (`mintTodoId`,
`run/todo.ts`): the first run's task, a queued prompt's, a planner todo edit's added task, each phase `Todo` creates, an
improvement run's tasks and phase (`Todo.seeded`, when the run creates its todo from the plan main sends under the
proposals' ids — the proposal stays named in each task's payload), and a user's add to an agent's or a child's todo
(`editAgentTodo`, unique within that document); a phase an earlier build created carries none and the plan shows it by
its name. The ledger
holds its own root's tree, walked from the root through the parent links, rather than every child with its iteration's
number — every plan cycle is numbered 0. Root and child task ids are minted against every child's, every recorded
root's and every recorded conversation's id in the session (`takenTaskIds`), since the record is keyed by task id
session-wide.

**The checkpoint at iteration close (Part P; ADR-0039's first execution).** Exactly once per iteration that closes, after
`iteration.end` is recorded and AFTER the hooks' `iteration_end` have finished (REQ-HOOKS-082: what a hook writes to the
tree is in that iteration's checkpoint; the capture runs in a `finally`, so hooks that raise still leave it — since
2026-10-13, fin41, N68; until then the capture came first, on ADR-0039's falsified reading that a hook might later
"carry" the checkpoint), the run awaits `CheckpointPort.capture({ iteration, childName })`, so the attempt finishes before the next
iteration and before teardown (REQ-GIT-051). `childName` is the one child that succeeded in the iteration, `''` when none or
more than one. The port (`run-host/checkpoints.ts`) is built per run from `checkpoints.enabled` against the session's
binding (REQ-GIT-044: unset = isolated only; `false` stays off even when isolated), `include_untracked` and
`max_per_session`; a tree Git cannot manage turns it off on first use with a log line and no issue. One capture: the
sequence = max(the rows' highest, the live refs' highest through the `checkpoint.refs` ask) + 1 (REQ-GIT-046) → the
`checkpoint.capture` ask (main → the workspace service: the private-index staging, the filtered-HEAD comparison, `commit-tree`
under the fixed identity, `update-ref` with the empty old value) → on `recorded`, the writer's `recordCheckpoint` (ONE
transaction: the row, the trim to `max_per_session`, the `checkpoint_created` timeline entry, the `checkpoint.created`
event row) → the trimmed rows' refs deleted through the `checkpoint.prune` ask → only then `publish()` hands the event to
the bus (REQ-GIT-048: rows, then refs, then the event). `nothing-to-record` records nothing; a Git decline records the
`checkpoint` warning issue with REQ-GIT-045's message and never aborts the run. The desktop restore flow (REQ-GIT-096..100)
is main's orchestration over the same three processes and is drawn in the process view.
