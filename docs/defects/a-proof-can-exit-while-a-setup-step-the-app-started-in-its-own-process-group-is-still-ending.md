## A proof can exit while a setup step the app started in its own process group is still ending

Since fin30 (finacc3 A2-19) a proof's launch ends with its whole process group: `spawnBounded`, `stopApp` and `endLaunch`
drain the group once the app's main process has exited (`drainGroup`, `apps/desktop/scripts/lib/bounded-launch.mjs`). A
project-setup step is not in that group: the app spawns it leading a process group of its own (`processGroup: true`,
`packages/mcp/src/setup.ts`), so its signals and its tree kill reach it alone. Such a step can therefore outlive the drain.

Observed 2026-10-07 at 10:55 UTC by fin30's review, in the landing worktree, at load 13 to 17: straight after
`pnpm requirements-proof --skip-build` exited, the `panes` profile's code-intelligence indexing step was still running
(`electron … builtin:code-intelligence -- project index …/profiles/panes/workspace`, its two zygotes and its
`python3 … serena.cli … project index`, process group 2911). It was gone at the next look, under a minute later. The product
bounds this: REQ-WORKSPACE-092 says nothing a step launched is still running 5 s after a close, and the run host stops a step
at its shutdown with `SETUP_TERMINATE_GRACE_MS` (2 s) before the force-kill. Whether that bound held here was not measured.
What is left is the harness's: a proof can exit, and the next one start, inside those seconds.

## Specs

None contradicted on this evidence. REQ-WORKSPACE-092 and REQ-WORKSPACE-109 allow the step up to 5 s after the close; the
proofs' isolation from each other is the harness's own concern (finacc3 A2-19).

## Relevant files

- `apps/desktop/scripts/lib/bounded-launch.mjs` — `drainGroup`, which drains only the launch's own process group.
- `packages/mcp/src/setup.ts` — the setup step spawned as a process-group leader, and its stop grace.
- `apps/desktop/scripts/requirements-proof.mjs` — the `panes` profile whose workspace the indexing step ran on.
