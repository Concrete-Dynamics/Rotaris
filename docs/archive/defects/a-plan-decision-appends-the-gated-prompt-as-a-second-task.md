## A plan decision appends the gated prompt as a second task

A run held at the plan gate appends its prompt to the todo (a fresh session's `main` task, or a continuation's
`Continued Prompts` task) and stores that todo with the plan cycle. Approving or revising relaunched a continuation with
the last user row as its prompt, and the `Run` constructor appended every continuation's prompt as a new task, so the
approved run held the gated prompt twice under two ids and worked it twice: its own `main:1` first, then the copy. The
plan-gate tests carried a "spare" scripted answer for the second pass. Building `PD-ORCH-003` revision 2 made it worse:
after a hold that follows a resumed iteration, the last user row is the continue's message, which `PD-ORCH-005` clause
17 already made a task of its own (`complete`, or `pending` and taken up first), so the approved run would have worked
that message a second time.

Found 2026-09-28 by building `PD-ORCH-003` revision 2 under R-065, and reproduced by driving the engine (a plan-mode
session approved at its first cycle ran two iterations for one prompt).

## Specs

`REQ-ORCH-004` ("the new top-level task MUST be appended") — a plan decision states no new task, so appending the gated
prompt again makes one piece of work two; `REQ-ORCH-154` (approval releases the gated run's work, not a second copy of
it).

## Relevant files

- `packages/engine/src/sessions.ts` — `planDecision`, which relaunches through `launchContinuation`.
- `packages/engine/src/run/run.ts` — the `Run` constructor's `appendTask('Continued Prompts', …)`.
- `packages/engine/src/run/plan-gate.test.ts` — the "spare" answers.

## Repaired — 2026-09-28

`launchContinuation` takes `appendsTask`, and `planDecision` passes false, which reaches the run as
`RunDeps.appendsTask: false`: a plan decision's relaunch appends no task, since the held run's stored todo already carries
the gated work. The approved plan still reaches the model, because every iteration's first call is sent the launch
content, which carries `planSection` (the behaviour `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`
recorded, and which this repair leaves as it is; that defect's repair of 2026-09-29 keeps the launch content as every
iteration's base). Evidence: `run/plan-gate-resume.test.ts` — an approved first prompt runs
once, and after a hold that followed a resumed iteration the approve runs the pending work and not the continue's
message; reverting either half turns both red.
