## Parallel worktree agents swap uncommitted edits through the shared git stash

Every worktree of a repository shares one stash (`refs/stash` lives in the common git directory), but nothing in the
orchestrated-build process says so. Agents use `git stash push -- <files>` / `git stash pop` to check that a test fails
without their change. When two builders in sibling worktrees do it at overlapping times, each `pop` takes whatever entry is
on top, which can be the other agent's. Seen 2026-10-03, about 07:04 UTC, during acceptance round 1. The builder of
`finacc-accept1-5` stashed its three engine files (`run.ts`, `sessions.ts`, `children/orchestration.ts`), built the code
without them for a negative proof run, and popped. It received `finacc-accept1-6`'s `packages/ui/src/StatusStripItem.tsx`
and `packages/ui/src/composer.ts` edits instead, while its own engine edits appeared uncommitted in
`/home/user/Rotaris-crw-wt-finacc-a1-6`. Nothing was lost: a1-5 restored its diff from a1-6's copy, reverted the foreign copy
(identical to what a1-6 still held) and reported the swap to the orchestrator. The orchestrator owns telling a1-6 to discard
the three engine files. A swap that went unnoticed would commit one bundle's code on another's branch, or drop a builder's
edits silently.

Not repaired: the process text is the orchestrator's skill. A repair says in the skill's references (environment.md or
repository.md) and in `docs/clean-room/agent-workflow.md` that agents never use `git stash` while other worktrees are live.
To set a change aside they use a patch file instead (`git diff -- <files> > patch; git checkout -- <files>; …; git apply
patch`).

## Specs

None. A process defect of the multi-agent workflow, outside the product's specification.

## Relevant files

- `.agents/skills/orchestrated-build/references/environment.md` and `references/repository.md`: the host and process
  pages every builder reads first; neither mentions the shared stash.
- `docs/clean-room/agent-workflow.md`: the worktree workflow, which says one worktree per bundle and is silent on the
  stash.
