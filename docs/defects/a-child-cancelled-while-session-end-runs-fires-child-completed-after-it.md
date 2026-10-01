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
[`a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`](fixed/a-child-settled-outside-its-execution-fires-no-child-completed-hook.md).
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
