## The Continue action appends the last prompt again while its task is pending

`Sessions.continueSession` launches a continuation with the last user row as its prompt ("the last user request
stands, nothing new is appended"), and the `Run` constructor appends every continuation's prompt to the todo as a new
`Continued Prompts` task whenever no open iteration is resumed. When the session came to rest with that prompt's task
still `pending` — a pause that found nothing unfinished closes its iteration `cancelled` and puts the task back — the
Continue action appends the same request a second time
under a new id, and the run works it twice. Clause 17 of `PD-ORCH-005` adds one more way in: a continue's message left
pending by a resumed iteration that closed without succeeding is the last user row, so a later Continue action appends
it again beside its own task.

The message-limit resolution's 'continue' and 'double' (REQ-SESSION-110; REQ-ORCH-086/087's dialog and palette entry)
reach the same `continueSession` with the same last user row, so a session paused at its message limit with that
request's task still pending appended it a second time too.

*(As written by the clause 17 build, and superseded by the repair below:)* The one route the clause 17 build closed is
"continue without them" on an iteration that holds a continue's message: that decline appends nothing, since the message
it leaves pending is the last request (OQ-102). The general case is not repaired, because what the Continue action should
append when the last request is already a task is not decided: the task that carries the last user row is not recorded
as such, and appending nothing would change what a Continue action on a session whose todo is complete does.

Noticed 2026-09-28 while building `PD-ORCH-005` clause 17 under R-065; reproduced by driving the engine (a pause
during the resumed root's last model step, then `continueSession(sid, 'continue')`: the todo ends
`[first, complete], [second, complete], [second, complete]`). Not driven in the built app.

## Specs

`REQ-MONITOR-125` ("can be resumed from the composer"), `REQ-SESSION-110` (the message-limit resolution's 'continue'
and 'double', which continue the same request) and `REQ-ORCH-004` ("the new top-level task MUST be appended") —
a Continue action states no new task, so appending the last request again makes one piece of work two. `PD-ORCH-005`
clause 17: the message's task is to be taken up by the next iteration, once.

## Relevant files

- `packages/engine/src/sessions.ts` — `continueSession`, which passes the last user row as the continuation's prompt.
- `packages/engine/src/run/run.ts` — the `Run` constructor's `appendTask('Continued Prompts', …)` for a continuation
  that resumes no open iteration.
- `packages/engine/src/run/message-task.test.ts` — the clause 17 cases, beside which a repair's case belongs.

## Repaired — 2026-09-28

`launchContinuation` passes `appendsTask: false` for a continue that delivers no message — the Continue action,
"continue without them", and the message-limit resolution's 'continue' and 'double' — while the todo still holds a task of the last request's text pending, or in progress and
held by the open iteration (`Todo.holdsUnfinished`), and the run takes that task up as it stands; a request whose task
is complete or abandoned, or in progress with no open iteration holding it, is appended as before (the last narrowed by
the lane's third review, since no selection takes an unheld task in progress up). This replaces the narrower guard the clause 17 build had in the `Run` constructor for "continue
without them" on an iteration that holds a message. The reading is recorded in OQ-102 ("A continue that states no new
request appends no second task"). The handoff still reaches every iteration's root, because every iteration's first
call is sent the launch content (the behaviour `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`
recorded; its repair of 2026-09-29 keeps the launch content as every iteration's base and adds the selected task after
it). Evidence: `run/message-task.test.ts` — the Continue action after a message was left pending works it once,
taken up first, and a request a pause put back in the first run is worked once; reverting the guard turns both red, and
so does narrowing it to pending tasks alone (the decline case). The message-limit route is pinned by "the message-limit
resolution 'continue'/'double' restates the last request too" (found by the iteration lane review): sending that route a message of no parts
while the paused route keeps none turns both cases red.
