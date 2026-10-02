## A rejected card back in `ready` can never start its next unit

Rejecting a review (`reject`, review → `ready`) is not a run-starting action (`ACTION_CLASS['reject'].startsRun` is false),
so no `beforeCommit` runs and no tree is provisioned for the next unit. The card's `Units` fact has moved on (one run
began), so the scheduler derives the next unit (`u2`), while the launch the workspace service still holds in memory is
the rejected unit's (`u1`, its tree kept intact by REQ-TRACE-423).

- **Before 2026-10-02** (origin/main `dc796f5`): the queue's release armed the card, the claim handed out the held `u1`
  launch again, and `requirements.run.started` threw `SqliteError: UNIQUE constraint failed: delivery_runs.req_id,
  delivery_runs.unit`, because a run of `u1` was already recorded. Had it not thrown, the next run would have worked in
  the rejected unit's tree, which REQ-TRACE-423 says rejecting leaves intact.
- **Since the repair of [`fixed/a-card-resting-in-ready-across-a-restart-can-never-be-started.md`](fixed/a-card-resting-in-ready-across-a-restart-can-never-be-started.md)**
  (bundle `fin7-queue-and-roles`): the queue's release looks for the next unit's tree, finds none, and states the stall
  on the entry: "The last start of REQ-101 did not begin: no worktree recorded for REQ-101 unit u2 is on disk to take
  over, and the queue provisions none: hold it and resume it from the board to provision one. Release it from the queue
  to try again." A hold and a resume does provision `u2` (the resume runs `beforeCommit`), but that is a workaround, not
  the route the queue offers. Under **automatic** scheduling nothing changed: no release runs, the scheduler offers the
  held `u1` launch, the claim hands it out, and `requirements.run.started` throws the same `UNIQUE constraint failed`
  (seen on the repaired code too). After a restart the held launch is gone and the first pass states the stall instead.

Seen 2026-10-02 in scratch cases of `delivery.test.ts` (not kept), on both codes: release, claim, run started and ended
(card in `review`), `reject`, then the queue's release with `disclosure: 'accepted'` and the claim; and, under
`requirements.scheduling.mode: automatic`, the claim and `run.started` straight after the reject. Found while repairing
the note above. Not repaired: what should provision the next unit after a rejection (the reject itself, the queue's
release, or the claim) is a choice the repair did not make.

## Specs

- `REQ-TRACE-423`: rejecting leaves every unit branch and worktree intact. The old route reused the rejected unit's
  launch and tree for the next run.
- `REQ-TRACE-482`: under `manual` a candidate begins once the user releases it. A rejected card released from the queue
  never begins.
- `REQ-TRACE-464`: the run takes over the worktree provisioned for it. For the next unit after a rejection, no worktree
  is ever provisioned from the queue.
- `REQ-TRACE-497`: the old route ended in an uncaught store error on `run.started`, with the queue promising a start.

## Relevant files

- `packages/workspace/src/delivery/transition.ts`: `ACTION_CLASS['reject']` (`startsRun: false`) and the `reject` arm
  (review → `ready`, no `startsRun`).
- `apps/desktop/src/workspace-service/delivery.ts`: `beforeCommit` (runs only on a run-starting decision); the queue's
  release arm and `recoverLaunch` (take-over only, never provisioning); `claim` and `requirements.run.started`.
- `packages/store/src/schema.ts`: `delivery_runs`' primary key `(req_id, unit)`, which refused the second run of `u1`.
