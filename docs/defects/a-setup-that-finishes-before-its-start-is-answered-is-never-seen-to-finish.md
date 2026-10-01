## A setup that finishes before its start is answered is never seen to finish

`code-intelligence-setup` follows the run host's setup through the `mcp.setupStatus` pushes, and installs its step sink
only once main's `mcp.setup` start request has answered (`InitializationCoordinator.followSetup`, after
`setup.start()`). A push that reaches main before that answer is dropped (`onSetupStatus` finds no sink). When every step
of the setup ends without waiting — a documentation-only workspace whose runtime marker file is already present: creation
skipped on the marker, indexing and seeding skipped for no code — `runSetupSteps` runs to its end inside `startSetup`,
the run host pushes the three steps and the `finished` status before the coordinator's sink is installed (the order of
those pushes against the start's answer was not traced; the log shows all of them in the millisecond the setup started),
and the answer carries a status whose steps are all done but whose state is still `running` (the `finished` state is set
in the run's `then`, after `startSetup` has returned). The coordinator drains that status, waits for a
`finished` push that has already come and gone, and the run neither ends nor records its outcome until
`SETUP_FOLLOW_BOUND_MS` (2235 s) passes — every later workspace's setup waiting behind it all that time
(`setupTurn`), and the run ending then as a retryable failure for a setup that completed.

Seen 2026-10-01 in the built app while adding `workspace-proof`'s scenario 8g for
[`the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`](fixed/the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md):
a documentation-only project carrying `.serena/project.yml` logged `mcp setup: create succeeded — the project already
exists …`, both `skipped-no-code` steps and `mcp setup: completed — …` in the same millisecond as `mcp setup: started`,
and the coordinator's run was still under way 30 s later, when the proof closed the window ("…init-marker was closed while
its run was under way"). A repository that commits its runtime directory and holds no source file reaches it on its first
open. The proof's scenario gives that project a source file instead, so that its steps wait; the case itself is recorded,
not repaired.

## Specs

- REQ-WORKSPACE-109: "A run SHALL end in exactly one of three ways"; this one ends in none until the follow's bound.
- REQ-WORKSPACE-084: a task's outcome is recorded once it is reached; this setup completed and nothing was recorded.
- REQ-WORKSPACE-103: success is silent; here a completed setup ends, 2235 s later, as a failure with its banner.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `codeIntelligenceTask`'s `run` and `followSetup`, which install the sink after
  the start answers and end the follow only on a `finished` status; `onSetupStatus`, which drops a push no sink takes.
- `apps/desktop/src/run-host/mcp.ts` — `startSetup`, whose answer is the status as it stands when `runSetupSteps` first
  yields, and whose `finished` status is set in the run's `then`, after the steps' pushes.
- `packages/mcp/src/setup.ts` — `runSetupSteps`, which awaits nothing when every step is skipped.
