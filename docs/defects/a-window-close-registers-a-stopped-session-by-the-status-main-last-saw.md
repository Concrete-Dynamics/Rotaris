## A window close registers a stopped session as resting by the status main last saw, not by its run's end

`QuitState.stoppedByClose` (`apps/desktop/src/main/exit.ts`) decides whether a session the close of one of several main
windows stopped is still coming to rest from the last status the run host *published* for it (`#lastActive`): last seen
inactive, it is registered `rested`, and the first active status that follows ends the hold. Two findings of fin28's
reviewers on the landed build (2631eaf) meet that one choice:

- **(a)** A session can stay withdrawn for good when its rest reaches main before the `runs.stopWorkspace` reply (a
  session whose stop was already pending): a later Continue publishes active without clearing it, so the continued run's
  notices are held, its approval dialog's close sends no Deny, and its question dock's cancellations are swallowed.
- **(b)** `Sessions.stopActiveIn` takes every live run that still accepts a stop, whatever its last published status: a
  run started from `awaiting_plan_decision` (the plan gate's release) or from `paused` (Continue) is live and accepts a
  stop before it has saved an active status, so its last published status is inactive. A close in that window registers
  it `rested`; its `cancelling` snapshot then ends the hold, and the stop's notices reach the window that stays.

Status at this build's start, read on 2631eaf: (a)'s path as written is already closed by
`32ac0c0` (`exit.ts:66-68`, the `#lastActive` reading, pinned by `exit.test.ts:238`): a rest seen before the reply
registers `rested`, and a later run's active status ends the hold. (b) holds, and pinning it shows the cause both
share: a status snapshot is not the stopped *run's* end. A status says nothing of which run it belongs to, so neither
"inactive" nor "active" tells the stop's rest apart from the moment before the run saved its first status, or from the
next run.

## Specs

`PD-SHELL-009` (the window close's Yes withdraws what the stopped runs wait on, and no notice of those runs appears on a
window that stays while they come to rest), REQ-STARTUP-046's last sentence, `PD-ORCH-005` clause 9, REQ-TOOLS-063 (an
approval dialog closed unanswered answers Deny, for the continued run).

## Relevant files

- `apps/desktop/src/main/exit.ts` — `QuitState.stoppedByClose`, `observeStatus`, `holdsBack`.
- `apps/desktop/src/main/index.ts` — `stopWorkspaceRuns` in `confirmRunsAtClose`, which registers the reply.
- `packages/engine/src/sessions.ts` — `stopActiveIn`, which takes a run that accepts a stop whatever its status.
- `apps/desktop/src/main/exit.test.ts` — the `QuitState` cases.
