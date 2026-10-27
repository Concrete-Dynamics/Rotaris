# Git Integration, Worktrees, and Checkpoints — Edge Cases

Part 6 of 8 of [domain 06](../06-git-worktrees-checkpoints.md), which indexes every part. Defines REQ-GIT-147 – REQ-GIT-151.

### Edge Cases

- **REQ-GIT-147** — Empty/unborn repository: checkpoint creation with no HEAD produces a parentless commit (or no checkpoint for an empty tree); the desktop opens a commit-less repository without crashing; ahead/behind without an upstream is 0/0.

- **REQ-GIT-148** — Detached HEAD: checkpoints and restores work; session and integration worktree creation refuses (REQ-GIT-006); the status strip conveys that the checkout is on no branch (REQ-GIT-161); the desktop worktree list renders the branch as `detached`.

- **REQ-GIT-149** — A restore attempted immediately after a restore SHALL report no drift, so undoing a rollback needs no force flag. This holds however far back the checkpoint that was just restored lies, because REQ-GIT-155 keeps it in the drift candidate set of REQ-GIT-056 whether or not it falls inside the 10 most recent.

- **REQ-GIT-150** — A session that crashed mid-run remains marked running until repaired; the desktop repairs and announces it on the checkpoint path (REQ-GIT-094); integration skips it without repairing; every ambiguity about liveness resolves toward "live"/refusal. That rule is about liveness and reaches nothing else: an undetermined or unclassifiable workspace-storage classification is not a liveness ambiguity, and it does not refuse an integration (REQ-GIT-128, REQ-STARTUP-166).

- **REQ-GIT-151** — Deleting a session whose workspace or repository has vanished SHALL still succeed, with ref cleanup silently degrading (REQ-GIT-069). Legacy pre-worktree snapshots load per REQ-GIT-017. Refusal texts throughout the domain SHALL remain distinct sentences — "running" vs "could not confirm" vs "not a Git tree" vs "snapshot gone" vs "uncommitted changes" vs "this workspace is replicated to another machine" (REQ-GIT-128) — because each one points at a different remedy.
