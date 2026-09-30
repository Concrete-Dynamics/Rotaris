## A stopped setup step is not reported in REQ-WORKSPACE-092's words

REQ-WORKSPACE-092 fixes the detail of a setup step that was stopped before finishing: "Setup was stopped before this
step finished." for a cancelled step and "This step did not finish within its time budget." for an exhausted budget, so
that a stopped step reads differently from one that ran and exited non-zero. The run host's `runSetupSteps` writes its
own sentences instead — "cancelled while running; the child was terminated; its last output: …" and "exceeded its budget
of N s and was terminated; …" — and `InitializationCoordinator.resultOf` passes each step's detail through unchanged,
so the task's step rows, its error ("{reason}: {detail}", REQ-WORKSPACE-093) and a background banner carry the run
host's wording. Neither sentence appears anywhere in the code. Seen in `workspace-proof`'s scenario 8b log on 2026-09-29:
`code-intelligence-setup → failure — Code intelligence could not create this project's configuration: cancelled while
running; the child was terminated`. Noticed while repairing the initialization setup's overlap under R-067; not repaired
here. Whether the mapping belongs in this domain's `resultOf` (as REQ-WORKSPACE-093's reasons already do) or in the run
host's status is for the repair to decide; the MCP category's own reading of the same status is REQ-MCP-099/112's.

## Specs

- REQ-WORKSPACE-092: the two fixed details for a stopped step, distinguishable from a non-zero exit.
- REQ-WORKSPACE-093: the failure reads "{reason}: {detail}", so the wrong detail reaches the error too.

## Relevant files

- `packages/mcp/src/setup.ts` — `runSetupSteps`, where a cancelled or timed-out step's detail is written.
- `apps/desktop/src/main/initialization.ts` — `resultOf`, which maps the setup status onto the task result and passes step details through.
