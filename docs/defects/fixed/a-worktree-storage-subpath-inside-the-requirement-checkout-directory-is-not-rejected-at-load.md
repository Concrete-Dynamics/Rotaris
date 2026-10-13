## A `worktree_storage_subpath` inside the requirement checkout directory is not rejected at load

`REQ-GIT-138` keeps the session and requirement worktree directories disjoint and catches a violation while configuration is
loaded: a `worktree_storage_subpath` that resolves to the fixed requirement checkout directory of `REQ-GIT-137`
(`<workspace>/.rotaris/requirements/worktrees/`) or to any directory inside it is rejected, so nothing is ever created from it.
The loader (`packages/config/src/load.ts`) reads the key as a plain string and checks nothing about it, and
`packages/config/src/sections/requirements.ts` implements only the branch-template half of `REQ-GIT-138`. A file stating
`worktree_storage_subpath: requirements/worktrees` therefore loads. Until the key reached worktree creation (the companion note,
[`a-configured-worktree-storage-subpath-is-loaded-but-never-reaches-worktree-creation.md`](a-configured-worktree-storage-subpath-is-loaded-but-never-reaches-worktree-creation.md))
the value had no effect; once it does, a session worktree would be created among the requirement-unit checkouts.

Recorded 2026-10-13 by fin41 (task N72, confirmed on main `6de2a67`).

## Specs

- `REQ-GIT-138` — the directory-side rejection, made at load, conveying the key, the value and the namespace it collided with.
- `REQ-GIT-071` — the one rule for a rejected configuration value: the load fails as a whole, nothing that depends on it starts,
  no session record or lock is created, and the failure is reported on the surface that asked.
- `REQ-GIT-137` — the fixed requirement checkout directory.
- `REQ-GIT-157` — such a rejection is a pre-work refusal.

## Relevant files

- `packages/config/src/load.ts` — reads `worktree_storage_subpath` with no check.
- `packages/config/src/sections/requirements.ts` — the branch-template half of `REQ-GIT-138`, beside which the directory half
  belongs.
- `packages/workspace/src/delivery/runs.ts` — `REQUIREMENT_WORKTREES_SUBPATH`, the fixed directory.

## Outcome

**Repaired 2026-10-13 (fin41, `fin41-config-and-proposals`).** `worktreeStorageCollision` (`packages/config/src/sections/requirements.ts`)
reads the value as the placement reads it (trimmed, empty meaning `worktrees`, either separator, `.` and `..` normalised; case
folded on Windows only) and the load reports a value resolving to `.rotaris/requirements/worktrees` or inside it as a fatal problem
at `worktree_storage_subpath`, naming the value, the directory it resolves to and the requirement checkout directory it collided
with. Pinned by `load.test.ts`'s "REQ-GIT-073 / REQ-CONFIG-068 / REQ-GIT-138" case (red on the code before) and
`requirements-section.test.ts`; `apps/desktop/src/workspace-service/worktree-storage.test.ts` pins the load-time check and
`sessionWorktreePath` agreeing value by value, and config's copy of the directory equal to the workspace package's. Such a load
now also stops an isolated start in main before anything is created (the companion note). A value whose session directory
CONTAINS the requirement directory (`requirements`, `.`) still loads: REQ-GIT-138's two sentences read differently over it, raised
as [OQ-262](../../architecture/open-questions.md#oq-262) (raised as OQ-261, renumbered at landing).
