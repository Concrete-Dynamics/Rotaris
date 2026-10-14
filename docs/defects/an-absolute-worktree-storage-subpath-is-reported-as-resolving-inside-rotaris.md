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
