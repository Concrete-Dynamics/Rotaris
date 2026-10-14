## A plan correction does not restart the consecutive-activation series

REQ-ORCH-105 resets loop supervision's consecutive-activation counter "only on a new user instruction — a real user message,
injected steering, or a todo-correction message all count". The run's REQ-ORCH-078 plan correction (`PD-ORCH-015`), the
message it sends an execution iteration's root that answered with items of its plan open, is that todo-correction message, but
`Run.turn`'s `correction()` sent it without telling the root's supervisor: the series ran on across it. A root with two
activations before its correction was escalated by the first trigger after it (`circuit_breaker_escalation`, the root failed
and the run aborted) where REQ-ORCH-105 makes that trigger the first of a new series. Confirmed by test before the repair
(`coordinator-plan.test.ts`, "REQ-ORCH-105: a correction restarts the consecutive series — two activations before it and a
trigger after it inject, never escalate", red on `a3be56c`: the run ended `failed`). Noticed 2026-10-14 by fin44
(`fin44-supervision-and-match`) as [OQ-284](../architecture/open-questions.md#oq-284)'s ruling asked, which names the reset
as REQ-ORCH-105 as written.

## Specs

REQ-ORCH-105: "The consecutive-activation counter resets only on a new user instruction — a real user message, injected
steering, or a todo-correction message all count." The user's own todo edits (`Run.editTodo`), queued prompts
(`Run.consumeQueued`) and injected steering (`injectSteering`) reset it; the run's own todo correction did not.

## Relevant files

- `packages/engine/src/run/run.ts` — `Run.turn`'s `correction()`, which returns `planCorrectionText(…)` with no
  `noteUserInstruction()` on the root's supervisor.
- `packages/engine/src/run/supervisor.ts` — `LoopSupervisor.noteUserInstruction`, the reset.
- `packages/engine/src/run/coordinator-plan.test.ts` — the case that confirms it.
