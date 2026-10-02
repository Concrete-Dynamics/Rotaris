## A rejected card back in `ready` can never start its next unit

Rejecting a review (`reject`, review → `ready`) is not a run-starting action (`ACTION_CLASS['reject'].startsRun` is false),
so no `beforeCommit` runs and no tree is provisioned for the next unit. The card's `Units` fact has moved on (one run
began), so the scheduler derives the next unit (`u2`), while the launch the workspace service still holds in memory is
the rejected unit's (`u1`, its tree kept intact by REQ-TRACE-423).

- **Before 2026-10-02** (origin/main `dc796f5`): the queue's release armed the card, the claim handed out the held `u1`
  launch again, and `requirements.run.started` threw `SqliteError: UNIQUE constraint failed: delivery_runs.req_id,
  delivery_runs.unit`, because a run of `u1` was already recorded. Had it not thrown, the next run would have worked in
  the rejected unit's tree, which REQ-TRACE-423 says rejecting leaves intact.
- **Since the repair of [`a-card-resting-in-ready-across-a-restart-can-never-be-started.md`](a-card-resting-in-ready-across-a-restart-can-never-be-started.md)**
  (bundle `fin7-queue-and-roles`): the queue's release looks for the next unit's tree, finds none, and states the stall
  on the entry: "The last start of REQ-101 did not begin: REQ-101 unit u2 has no recorded worktree on disk to take over,
  and a start from the queue provisions none: restore the tree, or hold the card and resume it from the board, which
  provisions one. Release it from the queue to try again." (the reason `recoverLaunch` in `delivery.ts` states, worded
  so since the bundle's commit `ba808d5`). A hold and a resume does provision `u2` (the resume runs `beforeCommit`), but
  that is a workaround, not the route the queue offers. Under **automatic** scheduling nothing changed: no release runs, the scheduler offers the
  held `u1` launch, the claim hands it out, and `requirements.run.started` throws the same `UNIQUE constraint failed`
  (seen on the repaired code too). After a restart the held launch is gone and the first pass states the stall instead.

Seen 2026-10-02 in scratch cases of `delivery.test.ts` (not kept), on both codes: release, claim, run started and ended
(card in `review`), `reject`, then the queue's release with `disclosure: 'accepted'` and the claim (re-run on the
bundle's head in its third repair round, where the entry read the sentence quoted above word for word); and, under
`requirements.scheduling.mode: automatic`, the claim and `run.started` straight after the reject. Found while repairing
the note above. What should provision the next unit after a rejection (the reject itself, the queue's release, or the
claim) was a choice that repair did not make; the outcome below makes it.

**Amended 2026-10-02 (fifth triage of the open notes, by code reading on origin/main `c1381f5`; confirmed the same day by
five failing cases of `delivery.test.ts` on bundle `fin9-queue-dispatch-and-disclosure` before its repair).**

- **A second trigger.** A board run that reaches its iteration limit persists `stopped` (`stop-conditions.ts`), main's
  coordinator classifies `stopped` and `cancelling` as `cancelled` (`outcomeOf` in `requirements-runs.ts`), and a
  `cancelled` ending rests the card in `ready` (`recordRunEnded` in `transition.ts`) still holding the finished unit's
  launch. The `dispatch()` that follows every run's ending re-claims that finished unit at once under `automatic`. (A
  user's stop persists `paused` since R-067's ruling, ends `failed` into `blocked`, and its resume provisions; it does
  not take this path.)
- **What the built app does on that claim.** Main's `session.start` precedes `requirements.run.started`
  (`requirements-runs.ts`), so under automatic scheduling the re-claimed finished unit runs a real session in the
  rejected unit's kept worktree before its row is refused by `delivery_runs`' primary key. "Had it not thrown, the next
  run would have worked in the rejected unit's tree" understates it: the session has already started when the row is
  refused. The throw also skips `claimed.delete`, so the card reads `next` and holds a concurrency slot until a restart,
  and when the unrecorded session ends, `run.ended` finds no running unit for it.

**Outcome — repaired 2026-10-02 (bundle `fin9-queue-dispatch-and-disclosure`).** The placement the note left open is
the claim. In `apps/desktop/src/workspace-service/delivery.ts` a launch held for an earlier unit is **spent**: the
scheduler names the card's current unit (`unitOfCard`), never the held launch's, and the claim never hands the finished
unit out; the spent launch's disclosure carries over (given in this launch of the application, REQ-TRACE-472), its tree
and a send-back's instructions do not. The claim (`treeForClaim`) provisions the card's current unit when the store
records no tree row for it at all, under both modes, and records the row at once through the writer's new
`recordWorktreeProvisioned` (`packages/workspace/src/delivery/transition.ts`, `handles.ts`), so a restart before the
start takes the tree over (REQ-TRACE-464). The queue's release, and the pass's recovery after a restart, no longer state
a stall for a unit with no row: they keep the launch without a tree, and the claim provisions it. A recorded row whose
tree is gone stays the stated stall. Nothing provisions on a board read (REQ-TRACE-408) or on the reject
(REQ-TRACE-389/422). `requirements.run.started` now settles the claim (`claimed`, `armed`, `stalled`) whatever its write
does. A claim before the first pass under `manual` with nothing armed answers `null` without parsing the store. Pinned by
five cases in `delivery.test.ts` (manual release after a reject; automatic claim after a reject; an ending classified
`cancelled`; a restart between the provisioning claim and the start; the cheap claim), all red before the repair, and one
in `transition.test.ts`; shown by `requirements-runs-proof`'s eighth assertion (a reviewed card rejected, the dispatch,
u2 running on its own worktree beside the kept u1), red on the unrepaired service and green on the repair. ADR-0041 records
it in "Repair — 2026-10-02: a card's next unit is provisioned at the claim", keeping the replaced clause.

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
