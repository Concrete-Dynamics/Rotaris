# Version Control

Giving a session a checkout of its own, recording a restorable point at the close of each iteration,
and merging finished work back. Nothing in this context ever performs a network Git operation.

Terms are derived from `docs/spec/06-git-worktrees-checkpoints.md`. The run that occupies a worktree
belongs to [Run](../../../engine/CONTEXT.md); improvement checkpoints, in their own disjoint ref
namespace, belong to [Library](../../../engine/src/artifacts/CONTEXT.md).

## Language

### Isolation

**Worktree**:
A Git checkout of its own given to a session, so two concurrent runs never write into one checkout.
— `REQ-GIT` overview
_Avoid_: clone, sandbox, branch (a worktree *has* a branch; it is not one)

**Session isolation branch**:
The branch a session's worktree sits on, named `rotaris/session/<session-id>` with numeric collision
suffixes. — `REQ-GIT-007`, `REQ-GIT-010`

**Worktree binding**:
The record on a session saying which worktree it is bound to, carrying the closed `merge_status`
vocabulary. — `REQ-GIT-015`

**Base**:
The branch an isolated session was taken from and is merged back into. — `REQ-GIT` worktree
integration
_Avoid_: main, trunk, target — the base is whatever the session started from

**Integration**:
The hidden, verified run that merges a completed session's branch back into the base. It only ever
moves the base by a **fast-forward**. — `REQ-GIT-129`, `REQ-GIT-130`
_Avoid_: merge (the operation is an integration; a fast-forward is what it is permitted to do),
PR, pull request

**Integration lock**:
The exclusive-create file making integration one-at-a-time per workspace. Where the workspace's
storage cannot make an exclusive create, the integration is **refused** rather than run unprotected.
— `REQ-GIT-128`, `REQ-STARTUP-166`

**Requirement-execution worktree**:
The worktree a requirement unit's run occupies, at a location fixed by the specification and named
by no configuration key. Its branch namespace is disjoint from session and integration branches. —
`REQ-GIT-137`, `REQ-GIT-138`, `REQ-GIT-139`

### Restorable points

**Checkpoint**:
A Git-backed record of a tree, taken automatically at the close of each iteration whose tree differs
from the last commit. — `REQ-GIT-016`, `REQ-GIT` checkpoint recording
_Avoid_: snapshot (reserved for the provider/model snapshot and the session snapshot), commit,
save point

**Checkpoint kind**:
What caused a checkpoint, from the closed vocabulary `REQ-GIT-067` fixes, defaulting to the
`iteration` member. — `REQ-GIT-016`, `REQ-GIT-067`

**Safety checkpoint**:
The checkpoint taken of the current state **before** a restore, so that rolling back is itself
reversible. — `REQ-GIT-058`

**Checkpoint ref**:
Where a checkpoint's commit lives: `refs/rotaris/checkpoints/<session-id>/<sequence>`, carrying the
fixed identity. — `REQ-GIT-029`, `REQ-GIT-032`

**Restore**:
Rolling a tree back to a recorded checkpoint, always preceded by a preview and a safety checkpoint.
— `REQ-GIT-064`, `REQ-GIT` checkpoint restore policy
_Avoid_: revert, reset, rollback (the [Library](../../../engine/src/artifacts/CONTEXT.md) context
uses **rollback** for undoing an applied improvement run)

**Fixed identity**:
The single author and committer identity `rotaris <rotaris@local>` used for checkpoint objects and
integration acceptance commits, and for nothing else — an agent's own commits carry the user's
identity. — `REQ-GIT-032`, `REQ-GIT-144`
