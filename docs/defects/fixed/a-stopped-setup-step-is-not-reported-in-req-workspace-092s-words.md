## A stopped setup step is not reported in REQ-WORKSPACE-092's words

REQ-WORKSPACE-092 fixes the detail of a setup step that was stopped before finishing: "Setup was stopped before this
step finished." for a cancelled step and "This step did not finish within its time budget." for an exhausted budget, so
that a stopped step reads differently from one that ran and exited non-zero. The run host's `runSetupSteps` writes its
own sentences instead — "cancelled while running; the child was terminated; its last output: …" and "exceeded its budget
of N s and was terminated; …" — and `InitializationCoordinator.resultOf` passes each step's detail through unchanged,
so the task's step rows, its error ("{reason}: {detail}", REQ-WORKSPACE-093) and a background banner carry the run
host's wording. Neither sentence appears anywhere in the code. Seen in `workspace-proof`'s scenario 8b log on 2026-09-30:
`code-intelligence-setup → failure — Code intelligence could not create this project's configuration: cancelled while
running; the child was terminated`. Noticed while repairing the initialization setup's overlap under R-067; not repaired
here. Whether the mapping belongs in this domain's `resultOf` (as REQ-WORKSPACE-093's reasons already do) or in the run
host's status is for the repair to decide; the MCP category's own reading of the same status is REQ-MCP-099/112's.

A third sentence belongs with these. A run cancelled while its setup waits for another's to end (`setupTurn`) starts no
setup and fails with `CANCELLED_BEFORE_SETUP_ERROR`, "…: the setup was cancelled before it started.", which is the
build's own sentence: REQ-WORKSPACE-092/093 fix the details of a stopped step, and name none for a setup that never
started. Added 2026-09-30 from an optional finding of the repair's verification; whether that failure should read in
REQ-WORKSPACE-092's "Setup was stopped before this step finished." or needs a question of its own is for the repair.

## Specs

- REQ-WORKSPACE-092: the two fixed details for a stopped step, distinguishable from a non-zero exit.
- REQ-WORKSPACE-093: the failure reads "{reason}: {detail}", so the wrong detail reaches the error too.

## Relevant files

- `packages/mcp/src/setup.ts` — `runSetupSteps`, where a cancelled or timed-out step's detail is written.
- `apps/desktop/src/main/initialization.ts` — `resultOf`, which maps the setup status onto the task result and passes step details through; `CANCELLED_BEFORE_SETUP_ERROR`, the build's sentence for a run cancelled before its setup started.

## Outcome — repaired 2026-10-01 (R-067)

The mapping is this domain's, as REQ-WORKSPACE-093's reasons already are; the run host's status says what stopped a step
rather than this domain reading it out of the run host's prose. `runSetupSteps` marks a step stopped before it finished
with `stopped: 'cancelled' | 'budget'` (`SetupStepReport`, carried on `McpSetupStep` as an optional field), and the
`detail` stays the run host's own sentence for the MCP category (REQ-MCP-099/112). `InitializationCoordinator`'s
`stepDetail` reads it: a cancelled step's detail is "Setup was stopped before this step finished." and an exhausted
budget's "This step did not finish within its time budget." — in the live step rows, the task's step rows and the
"{reason}: {detail}" error — and every other step's detail passes through as before.

The third sentence is not changed: a run cancelled while its setup waits for another's to end began no step, and
REQ-WORKSPACE-092's cancelled sentence names a step. `CANCELLED_BEFORE_SETUP_ERROR` keeps the build's "…: the setup was
cancelled before it started.", and [OQ-167](../../architecture/open-questions.md) — raised by the repair of
[`a-refused-setup-start-is-reported-as-not-a-local-launch.md`](a-refused-setup-start-is-reported-as-not-a-local-launch.md)
for the same gap, a setup that began no stage — asks the owner which words it takes.

Pinned by `apps/desktop/src/main/initialization.test.ts`: "reports a step stopped by cancelled / budget in
REQ-WORKSPACE-092's words" (exact sentences in the live row, the step row and the error; red on the code before, and red
again with only the live rows' mapping removed) and "keeps a non-zero exit's own detail"; `packages/mcp/src/setup.test.ts`
asserts `stopped` on the budget and cancel cases and its absence elsewhere. Shown by `workspace-proof`'s scenario 8c, whose
Cancel of the open's background run reads the outcome line: on the build before this repair it was `code-intelligence-setup
→ failure — Code intelligence could not create this project's configuration: cancelled while running; the child was
terminated`; on the repair, `… configuration: Setup was stopped before this step finished.` The budget sentence is shown by
the unit cases only: no proof holds a step for 300 s.

**Noticed while repairing, recorded separately:** the other step details the run host writes are not REQ-WORKSPACE-091/092's
either ([`the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`](the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md)).
