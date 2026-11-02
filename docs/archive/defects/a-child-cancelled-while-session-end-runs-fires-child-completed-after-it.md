## A child cancelled while `session_end` runs fires `child_completed` after it

The run's own teardown fires its `session_end` hooks and only afterwards sets `ended`. Until `ended` is set,
`Run.cancelAgent` accepts the user's cancel of one child. A paused child cancelled during that window is ended
`cancelled` by `IterationChildren.cancel`. The terminal listener then queues its `child_completed` through
`completedOutside`, on the hook port the run still holds, so the hook fires **after** `session_end`.

Observed with a scratch case in `children.test.ts` (not kept):
- The case paused a run with one running child and held the run's `session_end` hook.
- While that hook ran, it cancelled the paused child. The cancel returned `{ ok: true }`.
- The lifecycle order recorded was `session_start`, `session_end`, `child_completed(work)`.
- The timeline held `child_user_cancelled` before `run_end`, and the child ended `cancelled`.

The explicit cancel that lands in the same window takes a different path. It closes the rested iteration with no hook
(OQ-154, "fire none").

Noticed 2026-09-30 by the fourth verification's repair of
[`a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`](a-child-settled-outside-its-execution-fires-no-child-completed-hook.md).
That repair has the run wait for outside hooks before `session_end` (`Run.childCompletionsSettled`). It does not cover a
cancel accepted after that wait. Not driven in the built app.

## Specs

`REQ-HOOKS-076` puts `child_completed` before `session_end` ("matching where each occurs"). `REQ-HOOKS-081` fires
`session_end` last on every exit path. A hook that fires after `session_end` breaks both.

Three readings are possible, and choosing between them is a ruling:
- refuse the cancel of one child once the teardown has begun, as `steeringClosed` already refuses a steer;
- let the cancel end the child and fire no hook, as OQ-154 has the explicit cancel after `session_end` do;
- fire it anyway, out of order.

## Relevant files

- `packages/engine/src/run/run.ts`:
  - `cancelAgent` accepts a cancel until `ended`.
  - `teardown` fires `session_end` and sets `ended` later.
  - `childCompletionsSettled` is the wait before `session_end`.
- `packages/engine/src/children/orchestration.ts`: `cancel` accepts a `paused` child. The terminal listener and
  `completedOutside` then fire its hook on `deps.hooks`, which the run does not clear.
- `docs/architecture/open-questions.md`: OQ-154, the paths that end a child outside a run's hooks.

## Repaired in part — 2026-10-01 under R-067; the reading is OQ-154's to rule

Confirmed on `fin1-child-cancel-window` (from origin/main 576c2bc) by the note's scratch case, now kept: the order was
`session_start`, `session_end`, `child_completed(work)`.

The build now takes the second reading above, OQ-154's built one ("fire none"). `Run`'s teardown calls
`IterationChildren.endLifecycle` once `childCompletionsSettled` has returned and before `session_end` fires; from then
`completedOutside` queues no hook. The cancel of the paused child is still accepted (`{ ok: true }`), and the child ends
`cancelled` with its report, its `child_user_cancelled` entry and its teardown, as before; nothing fires after
`session_end`. A cancel that lands during `childCompletionsSettled`'s wait is still awaited before `session_end`, as before.

Pinned by `packages/engine/src/children/children.test.ts`, the case "REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 (the repair
of a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md) …": `session_end` held, the paused child
cancelled while it runs, the order `session_start`, `session_end` with nothing after it. Red before the repair (a third
entry, `child_completed(work)`). Not shown by a proof or a live-run scenario: none cancels a child while `session_end` runs.

**What stays open is the owner's:** the choice between the readings is a ruling. This path is recorded in OQ-154 as its
fifth, with the reading the build proceeds under and the one answer this path adds (refuse the cancel once the teardown
has reached that point). If the ruling takes another reading, the repair changes with it; the note closes when OQ-154
is ruled for this path.

## Ruled as built — 2026-10-06 ([R-071](../../product/requests.md#r-071)); closed

The owner accepted the built reading (OQ-154, ruled in [`open-questions.md`](../../architecture/open-questions.md)), and [`PD-HOOKS-001`](../../product/directives/pd-hooks-001.md#pd-hooks-001) narrows REQ-HOOKS-003 to say it: `child_completed` fires only while a run's lifecycle hooks are live, so the cancel of a paused child accepted while `session_end` runs ends the child `cancelled` and fires no hook. The repair above is the behaviour ruled, pinned by the `children.test.ts` case it names; nothing is changed in the code.
