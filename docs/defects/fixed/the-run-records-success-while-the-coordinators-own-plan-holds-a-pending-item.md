## The run records success while the coordinator's own plan holds a pending item

A run ends `completed` / `tasks_complete` with "The run completed." although the coordinator's own plan (its tool-owned
todo, REQ-TOOLS-144) still holds an item that is not done. An iteration marks its planner task complete whenever the
root's turn reports `succeeded` (`Run.iterate`, `packages/engine/src/run/run.ts`), and the stop conditions read only the
planner's tasks (`stopCondition`, `packages/engine/src/run/stop-conditions.ts:84-90`, fed `this.todo.allTasksComplete`
and `this.todo.pendingCount` at `run.ts:1025`). The root's plan (`Run.agentTodo`, `packages/engine/src/todo-view.ts`'s
`AgentTodoDocument`) is never consulted, so the record says the run succeeded while the plan the Todo pane draws says it
did not.

Live-run finding: G5 of the final default live run at origin/main `27a5127` (2026-10-06).

## Specs

- `REQ-ORCH-029`: while the entry role acts as coordinator "it does not report the run successful while a todo item is
  non-terminal or while a todo item's recorded state disagrees with what happened", a constraint that "MUST hold no
  matter what playbook cell or instruction text is in force" and is "externally checkable from the run's own records".
- `REQ-ORCH-075`: "when a report says succeeded but the agent's own todo list still holds pending/in-progress items after
  correction retries are exhausted, the same top-level task MUST be re-queued (not abandoned) with a continuation payload";
  `REQ-ORCH-076` strips such markers before a new one is appended; `REQ-ORCH-078`: "Todo-correction retries MUST reuse the
  validation-retry setting (default 0): with 0, an incomplete-todo success re-queues without an in-conversation retry; with
  a positive value, a correction message is sent into the same conversation up to that many times first."
- `REQ-ORCH-069` (1) and `REQ-ORCH-082` (3) read success off the planner's tasks; `REQ-ORCH-068` gives an iteration three
  ways to resolve its task (complete, given up on, returned to the pending queue).

## Evidence

Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` of the `live` worktree at `27a5127` (git-ignored; the self-hosted
endpoint), session `5bcf4f82` (`terminal`, classified `exploration`, so the orchestrator coordinated):

- `workspace.db`, `sessions.todo`: the planner task `c7b58194` is `complete`; the agent plan holds task `6cc673ca` "Run the
  sequence verbatim via a terminal-equipped specialist" `COMPLETED` and task `7762ee2b` "Report each command's outcome in
  one line" `PENDING`. The row reads `execution_status` `completed`, `stop_reason` `tasks_complete`.
- `terminal/terminal.png`: the header reads "Completed 3:48" beside the Todo pane's "1 of 2 tasks done".
- `terminal/transcript.md`: the closing system row reads "The run completed."

## Relevant files

- `packages/engine/src/run/run.ts` — `iterate()`: the `succeeded` branch marks the planner task complete; the loop's
  `stopCondition` call.
- `packages/engine/src/run/stop-conditions.ts` — `stopCondition`, `summarise`.
- `packages/engine/src/run/todo.ts` — the planner todo (`allTasksComplete`, `pendingCount`).
- `packages/engine/src/todo-view.ts` — the agent plan's document and the projection the Todo pane draws.
- `packages/ui/src/TodoPane.tsx` — `todoCountLabel`, the "1 of 2 tasks done" count.

## Repaired (2026-10-06, fin18)

REQ-ORCH-029, REQ-ORCH-075 and REQ-ORCH-078 decide it. The coordinator does not report the run successful while a todo item
is non-terminal (REQ-ORCH-029), and "when a report says succeeded but the agent's own todo list still holds pending/in-progress
items after correction retries are exhausted, the same top-level task MUST be re-queued (not abandoned) with a continuation
payload" (REQ-ORCH-075), those retries being REQ-ORCH-078's, counted by the validation-retry setting. REQ-ORCH-069
(1) and REQ-ORCH-082 (3) read success off the planner's tasks, so the planner task is not marked complete. Of REQ-ORCH-068's
three resolutions that is the pending return; REQ-ORCH-077 gives the task up at the consecutive-retry limit.

- REQ-ORCH-078 (`Run.turn`): a root that answers `succeeded` with an item of its plan open is first sent a correction into
  its own conversation (`planCorrectionText`), up to `RunConfig.validationRetries` times (`runtime.auto_retries_validation`,
  default 0: none). The correction is asked for where the root would otherwise be left idle (`IterationChildren.runWithChildren`'s
  `followUp`), so a delegation it leads to is waited for as any turn's is, and a root with nothing to correct ends in the same
  step it always did. None is sent for a plan cycle, a turn that stopped where it stood, or once the run is stopping, pausing
  or coming to rest. (In repair round 2 the correction was first wrapped around the root's turn as an extra `await`; that one
  step let the explicit cancel's held child start before the finalize sweep, which `children.test.ts`'s REQ-ORCH-052 case
  caught, so it was moved into the loop.)
- `Run.iterate` (`packages/engine/src/run/run.ts`): once the corrections are spent, a root that answers `succeeded` while its
  own plan holds an item that is neither `COMPLETED` nor `ABANDONED` (`openPlanItems`, `packages/engine/src/run/stop-conditions.ts`) has its task returned
  to the pending queue (`todo.requeue`), `iteration.end` closing `partial` with `planNotDoneSummary`. The same task's next
  fresh root is told REQ-ORCH-075's marker after its task (`planCarryText`: how many items, up to the first five named, to
  continue from the plan and not end its turn until each is complete or recorded in its true state). The marker is a part of
  that first message alone and is never appended to the task's text, so markers do not pile up (REQ-ORCH-076). No
  background child is enumerated: an iteration's children are settled when it closes (REQ-ORCH-052). At the
  consecutive-retry limit the task is given up on: `lastFailure` names the open items and the session reads `failed`
  ("The run failed: the coordinator answered with 1 item of its plan not done: …", REQ-ORCH-082 rule 4), never
  `completed` / "The run completed.".
- **Scope, under [OQ-203](../../architecture/open-questions.md) ("Which items of the coordinator's own plan does
  REQ-ORCH-075's re-queue hold against a task: every non-terminal item of the session's plan, or only those the task's own
  iterations left open?").** The plan is the session's, so an item a given-up task or an earlier run left open is still open
  when the next task is taken up. The first form of this repair held it against every later task, which was re-queued and
  given up on though its work was done (the verifier's finding, reproduced with a queued prompt behind a given-up task:
  `partial, partial, abandoned, partial, partial, abandoned`), and told the later task's root to finish another task's item.
  The build holds against a task only the items that were not open when it was first taken up, and carries the marker to the
  same task alone. Both records are kept with the planner task in the stored todo (`Task.planExcused`, written at the task's
  first take-up by `Run.takeUp`; `Task.planLeftOpen`, written when an iteration closes for its plan; both removed when the task
  completes or is given up on), so they survive a pause, a continue, a later run and a restart. The second form of this repair
  held them in the run's memory, and the verifier of repair round 2 reproduced what that lost: the iteration a continue
  resumed held a given-up task's item against its own task (`partial, partial, abandoned, partial, partial, abandoned`, the
  queued prompt's done work recorded abandoned), and a re-queued task taken up by a later run took its own leftover item as
  excused and completed beside `[COMPLETED, PENDING]` (G5 again). Excused items stay open in the plan; nothing marks them
  done. A task first taken up by a build without the record has none, so every open item is held against it.
- Under a `single` override the entry role is the worker (REQ-ORCH-025) and REQ-ORCH-029 does not bind it: the override
  reaches the run as `RunDeps.coordinating` (`RuntimePosture.runOverride`, `packages/engine/src/sessions.ts`, filled by the
  run host's `runtimeFromConfiguration`, which already carried it), and such a run completes as before.
- The stop conditions are unchanged: with the task returned to the queue, `tasks_complete` cannot be reached while the
  plan is open. The Todo pane's count (`packages/ui/src/TodoPane.tsx`) is unchanged too; what changed is that a run the
  record calls completed now has a plan that reads every task done beside it. No UI code changed: the pane is pinned
  through the projection it draws (`projectSessionTodos`), and what it draws from that projection by
  `packages/ui/src/todo.test.ts` ("1 of 2 tasks done" for an item left open, "2 of 2" for the plan of a run that completes),
  a pin that passes with or without the repair.

**Why this is not the inversion REQ-ORCH-028 rejects.** REQ-ORCH-028 and resolution 15(a) of
`docs/spec/resolutions/01-run-orchestration.md` keep the acceptance role's sign-off out of the run's outcome: "No status,
stop reason, or gate decision is ever made conditional on a role having declared sign-off", and the terminal status follows
completed and abandoned counts alone. The repair makes no status conditional on a sign-off and leaves the terminal status
to those counts: it decides whether one planner task is completed, which REQ-ORCH-075 already ties to the agent's own todo
list, and REQ-ORCH-029's constraints "MUST hold no matter what … instruction text is in force". What the root says (its
`succeeded`) is the assertion here; its plan's recorded states are the run's own record of the work, which REQ-ORCH-029
makes checkable.

**Cost.** A coordinator that leaves an item open costs at least one more iteration. In the pack's `terminal` session the
item was in fact done (the report was relayed) and only its state was not updated, so the fresh root, which has none of the
previous conversation, may redo work to finish it: there, re-delegating the whole terminal sequence (about 170 s), and in
general repeating commands that change something. The marker tells it to record an item's true state as well as to finish
it, which is the cheap path when the work is done.

Pinned by `packages/engine/src/run/coordinator-plan.test.ts`:
- a coordinator that answers with "Report each command's outcome in one line" `PENDING` closes iteration 1 `partial`; its
  next root is told the item, completes it, and the run ends `completed` / `tasks_complete` with the projected plan (the
  Todo pane's source, REQ-CHAT-088) reading every task `done`;
- one that never finishes is given up on at the third iteration and the session reads `failed`;
- a queued prompt behind a task given up on: the second task is neither told nor held to the first task's item, is still
  re-queued for an item it opens itself (and told only that one), and completes (`partial, partial, abandoned, partial,
  succeeded`);
- an item an earlier run left open is not held against the next run's task;
- an iteration paused and resumed by a continue holds the item its root opened before the pause (`partial, succeeded`);
- a queued prompt paused in the call that finishes its own item, behind a task given up on, completes on the continue
  (`partial, partial, abandoned, succeeded`): its take-up record comes back from the stored todo;
- a task re-queued with its own item open, taken up again by a later run (the first ended at its iteration limit), is not
  marked complete when its root answers without touching the plan (`partial, partial`), and that root is told the item;
- with `validationRetries` 1, the correction goes into the root's own conversation and the iteration closes `succeeded`
  with nothing re-queued; a correction left unanswered is followed by the re-queue (`partial, succeeded`);
- an `ABANDONED` item is terminal; a `single` run completes on its first iteration.

The first two fail without the repair (each run ended after one `succeeded` iteration); the queued-prompt and earlier-run
cases fail on the first form of the repair (`partial, partial, abandoned, partial, failed` with the script exhausted); the
resumed case fails if the resumed iteration takes what is open at the resume as excused; the continue-after-pause and
later-run cases fail on the second form (`3d25edf`), and so do both correction cases (no correction was sent). The helpers by
`packages/engine/src/run/run-pure.test.ts`. The built app shows the repair in the next default live run's `terminal`
scenario (the orchestrator's; an agent's live-run launch is refused).
