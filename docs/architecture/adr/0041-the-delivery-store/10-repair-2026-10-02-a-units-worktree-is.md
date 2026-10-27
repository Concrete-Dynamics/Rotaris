# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Repair — 2026-10-02: a unit's worktree is provisioned once

Part 10 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Repair — 2026-10-02: a unit's worktree is provisioned once

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`](../../../defects/fixed/a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md).*

Part AP's second execution reads: "a run-starting action provisions its worktree inside the transition's single-flight
window and hands the row back." **That held only for a unit with no tree, and is kept above as it was written.** A card
held out of `ready` before its run began, then resumed, derives the same unit (its `Units` fact has not moved). It
provisioned that unit again, `createWorktree` refused the existing path (REQ-GIT-140), the soft failure of
REQ-TRACE-463 replaced the launch with one that had no worktree, and no claim could take the card. REQ-TRACE-464 decides
it: "The run SHALL take over the worktree already provisioned for it and SHALL never provision a second one." So
`beforeCommit` takes over the tree of the launch it holds for that unit, or, after a restart, the tree the store's
worktree row records for it. It does that through `takeOverUnitWorktree` (`runs.ts`), which admits only a tree Git
lists at that path on that branch and which passes REQ-GIT-140's read-back. It provisions only a unit with no tree.
`provisionUnitWorktree` is unchanged: an existing directory still fails provisioning rather than being reused.
`requirements-proof`'s `blocker-resume` stage now asserts the dispatch.
