## An absolute `worktree_storage_subpath` is reported as resolving inside `.rotaris`

`worktreeStorageCollision` (`packages/config/src/sections/requirements.ts`) splits the value on separators and drops empty
segments, so a leading `/` (or `\`) is lost: `/requirements/worktrees` is reported at load as "resolves to
.rotaris/requirements/worktrees, inside the requirement checkout directory". The value does not resolve there: it leaves
`.rotaris`, which the function's own comment leaves to `REQ-GIT-005` ("A value that leaves `.rotaris` is not this check's"),
and which `sessionWorktreePath` refuses where the worktree is placed. The load report names the wrong reason for that input.
A fin41 review finding (`fin41/config-and-proposals`, Task 1), carried by fin43 (`fin43-optional-findings`).

## Specs

- `REQ-GIT-138` (the directory half): the rejection names a value that resolves to the requirement checkout directory or
  inside it; an absolute value does neither.
- `REQ-GIT-005`: the subpath is relative and resolves inside `.rotaris`; an absolute one is refused there.

## Relevant files

- `packages/config/src/sections/requirements.ts` — `worktreeStorageCollision`.
- `packages/workspace/src/git/worktrees.ts` — `sessionWorktreePath`, which refuses an absolute value.
- `packages/config/src/requirements-section.test.ts` — the `REQ-GIT-138` cases.

## Repaired — 2026-10-14 (fin43, `fin43-optional-findings`)

`worktreeStorageCollision` returns null for a value that begins with a separator or a drive letter, as it already did for
one that climbs out of `.rotaris` with `..`: either leaves `.rotaris`, and `sessionWorktreePath` refuses it under
`REQ-GIT-005` where the worktree is placed. Pinned by `requirements-section.test.ts`, "leaves an absolute value to
REQ-GIT-005, as it leaves one that climbs out of .rotaris" (POSIX and Windows spellings, on both platforms), which failed
without the change. `worktree-storage.test.ts`'s agreement between the load and the placement still holds. No open
question was raised.
