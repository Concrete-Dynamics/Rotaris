[Product directives](../directives.md) › PD-ORCH-012

<a id="pd-orch-012"></a>

### PD-ORCH-012 — a task answers for the plan items opened since it was first taken up

*Renumbered before landing: built as `PD-ORCH-011` on its branch, it took the next free number, `PD-ORCH-012`, when `PD-ORCH-009` (the answerless entry role, OQ-199) landed on `main` first; its citations followed.*

REQ-ORCH-075's "the agent's own todo list still holds pending/in-progress items" SHALL range over the items of the
coordinator's plan that the task in hand answers for, not over the whole session plan. A task answers for every item that
is not terminal and was not already open when the task was first taken up, and for no other:

- Its **first take-up** is the plan cycle that planned it, where one did (REQ-ORCH-153); otherwise its first iteration in the
  session.
- The record of what was open at that take-up is **kept with the task**, so every later iteration of it reads the same
  record: the one a continue resumes, and a fresh iteration of the re-queued task in the same run or a later one. A revise
  cycle, and the plan cycle after a resumed iteration (`PD-ORCH-003` revision 2), keep a record the task already carries.
- An item the task's plan cycle wrote, one the task opened, and one its own earlier iteration left open therefore always
  hold it; an item that a task given up on (REQ-ORCH-077), an earlier run or anything else left open before the task was
  first taken up never does. An item a person adds to the agent plan during the task (REQ-CHAT-090) holds it. A `PENDING`
  item re-listed by REQ-TOOLS-146's `replace` in the id-less shape is given a new id, so it is the re-listing task's.
- An item excused this way is **not altered**: it stays open in the plan the Todo pane counts.
- The continuation marker block naming the open items goes to the same task's next fresh root only, and is dropped when the
  task completes or is given up on.
- A task first taken up by a build that kept no such record has none, and every open item is held against it.

REQ-ORCH-029's clause "it does not report the run successful while a todo item is non-terminal" reads the same way, under
[`PD-ORCH-006`](pd-orch-006.md#pd-orch-006) revision 2, the directive that narrows that requirement.

**As built.** `Task.planExcused` and `Task.planLeftOpen` (`packages/engine/src/run/todo.ts`), kept with the planner task in
the stored todo; `Run.planCycleTakeUp`, `Run.takeUp` and `openPlanItems`'s `excused` (`packages/engine/src/run/`); pinned by
`packages/engine/src/run/coordinator-plan.test.ts`.

**Why, and what it costs.** OQ-203: the plan is the session's and outlives every task, run and iteration. Read literally, an
item a given-up task or an earlier run left open holds against every later task, each re-queued and given up on in turn
though its own work was done: a record that disagrees with what happened, which REQ-ORCH-029's other clause forbids, and a
root told to finish another task's work, which REQ-ORCH-067 forbids. No requirement says which items belong to which task.
The owner confirmed the take-up reading as built. What it costs: a run can complete while its plan holds an item no task
answers for, and the Todo pane shows it open beside a completed run.

> **Narrows:** REQ-ORCH-075

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-203.*
