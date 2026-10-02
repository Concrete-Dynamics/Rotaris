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
[`the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`](the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md):
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

## Outcome

**Repaired 2026-10-02** (third repair round over the open notes, bundle `fin5-board-and-setup`; origin/main `2e8f9c0`).

**The order, read from the code.** The run host's `mcp.setup` arm is answered from the async request handler
(`apps/desktop/src/run-host/dispatch.ts`). `startSetup` pushes each step from `runSetupSteps`' synchronous part, and the
`finished` status is set in the run's `then`, a microtask queued before the handler's return is awaited. So all four
pushes reach main ahead of the start's answer, in the order sent, and the coordinator had no sink for any of them.

**Confirmed first.** A new case in `apps/desktop/src/main/initialization.test.ts` has a fake setup port that pushes the
three steps and the `finished` status before it resolves `start` with a running status whose steps have all ended. On
the code before, nothing was recorded with no timer advanced. `workspace-proof`'s scenario 8g gained a
documentation-only project carrying the runtime's marker and no source file, the note's shape. On the unrepaired build
its run had not ended 18.2 s after the launch began, with no steps reported, although the run host had logged its
completion.

**What changed.** `InitializationCoordinator` (`apps/desktop/src/main/initialization.ts`) keeps the latest status
pushed while its own start request is in flight with no sink installed (`setupEarly`; a push while no start is in
flight is still dropped). `followSetup` drains the start's answer and then that kept status. Either is drained only
when it is this setup's, by `startedAt`. A second guard covers a push lost otherwise: when the drained status has every
step ended and its state still reads `running`, the coordinator asks `setup.status` once and drains the answer if it is
this setup's. A failed read is logged and the follow waits on the pushes and the bound as before. OQ-169's bound and
its readings are unchanged.

**Pinned by** three cases in `initialization.test.ts` ("a setup that finishes before its start is answered"). The first
two are red on the code before. The kept status ends the run as `success` at once, with the three steps, the non-code
summary and no banner, and the next workspace's setup starts and is followed. The status read ends it when every push
was lost. A kept status and a status read that belong to another setup are ignored. In the built app 8g's new check
passed: the run ended 2.9 s after the launch began, `success`, with "project file already exists; left as is" and the
two `skipped-no-code` sentences, and REQ-WORKSPACE-095's non-code summary (51 passed, 0 failed, 2 skipped). 8g's
`init-marker` project keeps its source file, so the case with waiting steps is still measured too.

