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

## Outcome

Repaired by fin34 (2026-10-13), in the harness; the product is unchanged. `drainGroup`
(`apps/desktop/scripts/lib/bounded-launch.mjs`) now sweeps, after the launch's own group, what the launch started in process
groups of its OWN: every live process whose environment carries the launch's `XDG_DATA_HOME` (`markOf`, read from
`/proc/<pid>/environ`), which `proofIsolationEnv` makes unique to the launch's scratch profile and which every child of the
product inherits, a setup step included. Those are given `OWN_GROUP_GRACE_MS` (6 s: REQ-WORKSPACE-092's 5 s and a second's
margin) to end by themselves, then ended with SIGKILL — the group they lead, never the proof's own — and named on standard
error as `bounded-launch: … in group(s) of their own outlived …`; the drain's result reports them as `ownGroups`. The sweep
waits while another live launch carries the same mark (a hand-over's second launch beside the instance cannot be told from
it), so the last of a profile's launches to end sweeps. `spawnBounded` marks every launch from its `env`, and the driver's
`startApp` passes its launch's environment to `trackLaunch`. A launch whose `XDG_DATA_HOME` is the proof's own (one given no
profile, `terminal-proof`'s, on a host that sets the variable) is not marked: the proof's parents and the rest of the
operator's session carry that value too, and the first form of the sweep, found by fin34's review, would have ended them six
seconds after such a launch (`markOf`; red in `bounded-launch.test.ts` on that form, a bystander SIGKILLed).

Pinned by `apps/desktop/scripts/lib/bounded-launch.test.ts`: a leader that starts a SIGTERM-ignoring child in a process group
of its own (Node's `detached`, as `processGroup` does) and exits sees the child ended and named within the grace (red before:
the child ran on and `ownGroups` was absent), and a child that ends inside the grace is left alone. Shown by
`pnpm requirements-proof --skip-build` (2026-10-13, every stage passed, 153 delivery tests; load about 5 to 8): a scan straight
after its exit found no `builtin:code-intelligence` or `serena` process left. **Owed:** macOS, where no `/proc` exists and the
sweep finds nothing; there only the group is drained, as before.
