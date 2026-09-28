## A board run caught by a quit rests as a stop

When the last window closes, main has two `window-all-closed` handlers. The first, registered earlier, is
`requirementsRuns.cancelAll('the last window closed')`. It sends every board run this process owns the run host's
`session.control {op: 'cancel'}`, the stop control's operation, which reaches the run as `stop.request('user_cancelled')`.
The second handler sends the run host its `shutdown`, whose `Sessions.closeAll` requests `application_shutdown`. A stop
request keeps the first reason it receives (`StopRequest.request`: "The first reason stands"). So a board run the
application's quit catches comes to rest by `stop`, not `quit`: its agents are recorded `paused` by `stop`, its iteration's
interruption reads `stop`, and it ends the background sessions as a stop. A session the user started by hand, caught by the
same quit, rests by `quit`. The doc comment on `cancelAll` also says every waiter "then finishes `cancelled`". That has
been false since clause 9: a rest withdraws a waiting approval, it does not cancel it.

Found 2026-09-28 by the audit of `PD-ORCH-005` clause 15 while building revision 4 (R-064).

## Specs

`PD-ORCH-005` clause 3 and clause 15: a quit brings the run to rest with the interruption `quit`, and REQ-TRACE-464 has
the board's runs handled by the same coordinator as a session the user starts by hand. Clause 9 withdraws a pending
approval at a rest; it does not cancel it.

## Relevant files

- `apps/desktop/src/main/requirements-runs.ts`: `cancelAll`, the `cancel` op it sends, and its doc comment.
- `apps/desktop/src/main/index.ts`: the two `window-all-closed` handlers. The board's is registered first.
- `packages/engine/src/run/stop-request.ts`: `request`, where the first reason stands.
- `packages/engine/src/run/run.ts`: `restCause`, which maps `user_cancelled` to `stop` and `application_shutdown` to `quit`.
- `packages/engine/src/sessions.ts`: the `announceShutdown` control and `closeAll`.

## Repaired — 2026-09-28

By the audit of `PD-ORCH-005` clause 15 (R-064). Main's board coordinator no longer sends the stop control's `cancel`
at the last window's close. It sends the run host's `session.control {op: 'announceShutdown'}` (REQ-MONITOR-131), the
same request the run host's `shutdown` makes, so the first reason each board run receives is `application_shutdown`,
and it comes to rest by `quit`. The method is renamed `quitAll`, and its doc comment says that a rest withdraws what
waits on a person rather than cancelling it (clause 9). REQ-TRACE-469's unlimited approval wait is still released at
once, now withdrawn by the quit.

Evidence:
- `apps/desktop/src/main/requirements-runs.test.ts`: `quitAll` sends `announceShutdown` and no `cancel`. Reverting the
  op to `cancel` turns both of its cases red.
- `packages/engine/src/children/children.test.ts`, "PD-ORCH-005 clause 15": `announceShutdown` rests a run's child
  by `quit`; a `cancel` that reaches the run before it keeps its reason, and the run rests by `stop`.
- Not driven in the built app. The evidence there would be `children.interruption = 'quit'` for a board run after the
  application quits.
