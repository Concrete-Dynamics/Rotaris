## worktree:land reuses a landing tree without re-installing it after the rebase brings a new dependency

Seen 2026-11-04 landing `claude/serene-saha-86e3d2` (Windows 11 ARM64, Node 26.13.0, pnpm 11.9.0). `pnpm worktree:land`
keeps its landing tree (`<primary>-wt-<slug>-land`) across runs and, on a run after a failed one, moves it to the new
rebased head with `git checkout --detach --force` and sets it up only when `needsSetup` says so — no `node_modules`, or no
Electron binary in it (`tools/worktree/steps.mjs`). A tree set up for an earlier head is therefore never re-installed, and
a dependency the rebase brought in stays missing: on that branch's eighth landing the head `bc6a0ba7` carried origin's
`fast-check` 4.10.2 (the root `package.json`, since `b31230ef`), the reused tree's `node_modules` dated from a head before
it, and the gate's typecheck failed in 75 s on every `*.property.test.ts` and `schema-arbitrary.test-support.ts` with
`TS2307: Cannot find module 'fast-check'` — a red of the landing tree, not of the branch, whose own tree held the package
(pnpm's run-time dependency check had installed it there before a `pnpm vitest` run). Worked around by removing the landing
worktree so the next run recreated and installed it. Recorded, not repaired.

## Specs

None is contradicted by the product. `docs/clean-room/agent-workflow.md`'s landing sequence sets the landing tree up
(`pnpm install --prefer-offline`, Electron's binary), and the wrapper does so once per tree, while the lockfile can move
between two runs over the same tree.

## Relevant files

- `tools/worktree/land.mjs`: `ensureLandingTree`, which installs only when `needsSetup` is true.
- `tools/worktree/steps.mjs`: `needsSetup` — `node_modules` and the Electron binary present; nothing about the lockfile.
