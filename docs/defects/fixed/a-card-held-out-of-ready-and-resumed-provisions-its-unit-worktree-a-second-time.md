## A card held out of `ready` and resumed provisions its unit's worktree a second time, and no run can begin

A release accepted through the launch disclosure provisions the unit's worktree at once, inside the write
(`beforeCommit` in `apps/desktop/src/workspace-service/delivery.ts`), whether or not the queue lets it begin. With the
queue stopped the card rests in `ready` with unit `u1` provisioned and no run started, so its `Units` fact stays `0`.
Held out of `ready` and then resumed from the blockers pane, the resume returns the card to `ready` and so starts a run:
`beforeCommit` derives the same unit (`u1`, from the same `Units` fact) and asks `provisionUnitWorktree` for it again.
`createWorktree` refuses the session route on an existing path ("Worktree path already exists: …"), which is not one of
REQ-GIT-010's collision phrases, so no suffix is tried. Because a resume is a soft failure (REQ-TRACE-463) the blocker
clears anyway, the launch is replaced by one with no worktree, and the card is marked stalled. The card says "REQ-101
moved, and no run began: Worktree path already exists: …/rotaris-req-req-101-u1", and the claim can never take it,
since its launch now has no worktree. The tree provisioned by the release is still on disk.

Seen in the built app on 2026-10-02 by `requirements-proof`'s `blocker-resume` stage (queue stopped, release accepted,
hold by a drag onto the blocked column, resume accepted through the disclosure), on the unrepaired and on the repaired
pane alike: the feedback above was on the card at 23.2 s both times. That stage asserts the pane and the history, not
the dispatch, so it passes with this defect present. Not repaired; found while repairing
[`a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`](a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md).
Whether a hold out of `ready` should give up the provisioned tree, or a resume should take over the launch it left, is
not decided here.

## Specs

- `REQ-TRACE-464`: "The run SHALL take over the worktree already provisioned for it and SHALL never provision a second
  one." The resume provisions again for the unit that already has a tree.
- `REQ-GIT-140`: "no unit SHALL hold two workspaces for the same attempt". The second provisioning is for the same
  attempt (`u1`, cycle 1) and collides with the first one's directory.
- `REQ-TRACE-453`: the cleared blocker returns to `ready`, as recorded, but nothing in `ready` can then be dispatched
  for it.

## Relevant files

- `apps/desktop/src/workspace-service/delivery.ts`: `beforeCommit` derives the unit from the `Units` fact and provisions
  on every run-starting write; on a soft failure it replaces the launch with one that has no worktree and marks the
  card stalled.
- `packages/workspace/src/delivery/runs.ts`: `provisionUnitWorktree` retries only on a branch collision.
- `packages/workspace/src/git/worktrees.ts`: `createWorktree` refuses an existing path on the session route.
- `apps/desktop/scripts/requirements-proof.mjs`: the `blocker-resume` stage that drives the path; its log carries the
  feedback.

## Outcome

**Repaired 2026-10-02** (third repair round over the open notes, bundle `fin5-board-and-setup`; origin/main `2e8f9c0`).

**The open question is the specification's, and it decides it.** REQ-TRACE-464: "The run SHALL take over the worktree
already provisioned for it and SHALL never provision a second one." A hold out of `ready` does not give the tree up; the
resume takes over the launch it left.

**Confirmed first.** A new case in `apps/desktop/src/workspace-service/delivery.test.ts` (queue stopped, release, hold,
resume, each run-starting answer accepted, over a fake Git port that refuses an existing path as `createWorktree` does)
read "Worktree path already exists: …/u1" as the resume's `dispatch` on the unrepaired service. `requirements-proof`'s
`blocker-resume` stage was extended to start the queue after the resume's reads and to assert the dispatch; on the
unrepaired build it failed on "REQ-101 moved, and no run began: Worktree path already exists: …/rotaris-req-req-101-u1",
the card still in `ready` 30 s and 36 s into the launch, with the queue started.

**What changed.** `beforeCommit` (`apps/desktop/src/workspace-service/delivery.ts`) no longer provisions a unit that
already has a tree. When the launch the service holds is for the derived unit and its tree is still on disk, the
run-starting action takes it over. It records the new action's disclosure and instructions on the launch, clears the
stall and arms the card; the store's worktree row is already written. When no launch holds it (a restart since the
release), the store's worktree row for that unit names the tree, and `takeOverUnitWorktree`
(`packages/workspace/src/delivery/runs.ts`, through the new `RunGitPort.takeOver`) admits it only where Git lists a
worktree of this repository at that path on that branch and REQ-GIT-140's read-back passes. The base is read again:
the base checkout's branch, and `git merge-base HEAD <branch>`. Anything else is refused with the reason, logged, and
the caller provisions as before. Only a unit with no tree is provisioned.

**Where this departs from the triage's sketch.** The sketch had `provisionUnitWorktree` adopt an existing worktree.
That would contradict REQ-GIT-140's "A directory of that name already existing SHALL fail provisioning with the error
of REQ-GIT-008 rather than be reused", which `runs.test.ts` pins. So provisioning is unchanged, and the take-over is a
unit of its own that only the delivery service calls, only for the tree its store recorded for that requirement's unit.

**Pinned by** two cases in `delivery.test.ts`: in session, one provisioning, no stall, a claim on u1's tree; across a
restart, the take-over of the recorded tree and the claim. Both are red on the code before. One case in
`packages/workspace/src/delivery/runs.test.ts` runs against a scratch repository: the take-over with the base moved on
after the cut, provisioning the same attempt again still failing, and a wrong branch, a plain directory and a removed
tree each refused. `requirements-proof`'s `blocker-resume` stage now starts the queue and asserts no "no run began" on
the card, no "Worktree path already exists" in the log, the card running or further, and one run row of u1 on the one
worktree row ending `-u1`. The stage passed on the repair; the whole proof passed (136 tests) on the branch merged with origin/main `b00f2a9`, after one earlier run whose only red was the axis switch's timing budget under a load average of 11 to 15.

Noticed while repairing it, and recorded rather than repaired: after a restart, a card resting in `ready` before its
run began can never be started, because the queue's disclosure release finds no launch to record it on. See
[`../a-card-resting-in-ready-across-a-restart-can-never-be-started.md`](../a-card-resting-in-ready-across-a-restart-can-never-be-started.md).
