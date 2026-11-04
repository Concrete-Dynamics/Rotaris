## worktree:land reuses a landing tree without reinstalling when the lockfile moved under it

`pnpm worktree:land` keeps its landing worktree (`<checkout>-wt-<topic>-land`) across attempts and installs it only "when it
has no dependencies yet" (`tools/worktree/land.mjs`, the landing-tree step). A branch that lands on its second or later
attempt after `origin/main` gained a dependency is rebased onto that main and checked out in the tree that was installed for
an earlier main, so its `node_modules` lack the package and the gate goes red on code that is not the branch's. Seen
2026-11-04 at 01:11 on the Overview audit's execution branch (Windows 11 ARM64, Node 26.13.0, pnpm 11.9.0): the sixth attempt
rebased onto `4930c49a`, whose property-test landing had added `fast-check` 4.10.2 to the root lockfile; the landing tree,
set up on the first attempt over `83910dc8`, had no `fast-check`, and `tsc -b` failed on `packages/kernel/src/redaction.property.test.ts`,
`packages/agent-tools/src/tools/fence.property.test.ts` and `packages/contracts/src/commands.property.test.ts` with "Cannot find
module 'fast-check'" and implicit `any` on every parameter it types — 1 m 38 s to the red, nothing pushed. `pnpm install
--prefer-offline` in the landing tree ("reused 78, added 2") put the package in place and the next attempt went on. The branch's
own worktree, installed after each rebase by hand, had the package throughout. The tool could run the install whenever the
rebased head's lockfile differs from the one the tree was installed from (or always; `--prefer-offline` is cheap when nothing
moved), and say so in its "setting up the landing tree" line.

*Seen again 2026-11-04, 01:30* (the consortium branch `claude/busy-noyce-b7b850`, R-093): its fourth landing attempt, on a kept
landing tree installed the evening before, rebased onto a main that had gained `fast-check` (`b31230ef`) and went red at typecheck in
1m35s with `Cannot find module 'fast-check'` from the two property tests; `pnpm install --prefer-offline` in the tree (4.2 s) and
the next attempt ran the gate on the head.

## Specs

None contradicted by the product; `docs/clean-room/agent-workflow.md` ("Rebase onto main, and persevere") says the landing
tree is "installed on first use", which is what it does, and what is not enough once `main` moves a lockfile between attempts.

## Relevant files

- `tools/worktree/land.mjs` — the landing-tree step and its "no dependencies yet" condition.
- `tools/worktree/land.test.ts` — the landing's cases, none of which moves the lockfile between two attempts.
- `docs/clean-room/agent-workflow.md` — the wrappers' surface, "installed on first use".
