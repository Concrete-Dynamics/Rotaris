## The Continue action appends the last prompt again while its task is pending

`Sessions.continueSession` launches a continuation with the last user row as its prompt ("the last user request
stands, nothing new is appended"), and the `Run` constructor appends every continuation's prompt to the todo as a new
`Continued Prompts` task whenever no open iteration is resumed. When the session came to rest with that prompt's task
still `pending` — a pause that found nothing unfinished closes its iteration `cancelled` and puts the task back — the
Continue action appends the same request a second time
under a new id, and the run works it twice. Clause 17 of `PD-ORCH-005` adds one more way in: a continue's message left
pending by a resumed iteration that closed without succeeding is the last user row, so a later Continue action appends
it again beside its own task.

The one route the clause 17 build closed is "continue without them" on an iteration that holds a continue's message:
that decline appends nothing, since the message it leaves pending is the last request (OQ-75). The general case is not
repaired, because what the Continue action should append when the last request is already a task is not decided: the
task that carries the last user row is not recorded as such, and appending nothing would change what a Continue action
on a session whose todo is complete does.

Noticed 2026-09-28 while building `PD-ORCH-005` clause 17 under R-064; reproduced by driving the engine (a pause
during the resumed root's last model step, then `continueSession(sid, 'continue')`: the todo ends
`[first, complete], [second, complete], [second, complete]`). Not driven in the built app.

## Specs

`REQ-MONITOR-125` ("can be resumed from the composer") and `REQ-ORCH-004` ("the new top-level task MUST be appended") —
a Continue action states no new task, so appending the last request again makes one piece of work two. `PD-ORCH-005`
clause 17: the message's task is to be taken up by the next iteration, once.

## Relevant files

- `packages/engine/src/sessions.ts` — `continueSession`, which passes the last user row as the continuation's prompt.
- `packages/engine/src/run/run.ts` — the `Run` constructor's `appendTask('Continued Prompts', …)` for a continuation
  that resumes no open iteration.
- `packages/engine/src/run/message-task.test.ts` — the clause 17 cases, beside which a repair's case belongs.
