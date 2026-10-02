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
[`fixed/a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`](fixed/a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md).
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
