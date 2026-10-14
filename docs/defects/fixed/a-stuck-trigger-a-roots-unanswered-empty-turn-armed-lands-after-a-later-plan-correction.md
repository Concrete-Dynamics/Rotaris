## A stuck trigger a root's unanswered empty turn armed lands after a later plan correction

A root turn that ends with neither text nor a call arms REQ-ORCH-096's stuck trigger. When the run does not follow that turn up
as a recovery — the answer re-prompt answered by a second silence, or an empty turn after an answer and a plan correction — the
trigger stays pending in the root's supervisor (the run's `SupervisorRegistry`). If the run then sends a plan correction
(REQ-ORCH-078, `PD-ORCH-015`) into the same conversation, the correction's request takes the trigger at its first step and the
stuck corrective ("Pause and reassess …") follows the correction in that request: two instructions where the run meant one.
Confirmed by test before this note was written (`coordinator-plan.test.ts`, "OQ-284: a stuck trigger an unanswered empty turn left
pending lands after a plan correction", two cases). The route the raising agent also named — the next iteration's first request —
was checked and does not occur: each iteration's root has a fresh task id and so a fresh supervisor (`answerless.test.ts`,
"PD-ORCH-009 revision 3 with OQ-284 …"). A root resumed after a child's report in the same execution would take a pending trigger
the same way; that route was not measured. Noticed 2026-10-14 by fin43 (`fin43-live-findings`) while building
[`PD-ORCH-009`](../../product/directives.md#pd-orch-009) revision 3; raised as [OQ-284](../../architecture/open-questions.md#oq-284).
Not repaired: whether the trigger stands is the ruling's.

## Specs

REQ-ORCH-096 and REQ-ORCH-104's stuck-mode clause make the empty turn a stuck report that "ALWAYS" recovers; REQ-ORCH-078's
correction is the run's own follow-up for the same turn. No requirement orders the two or says the report lapses when the turn
that made it is followed by a correction rather than a recovery. `PD-ORCH-009` revision 3 withdraws the trigger only for the turn
the answer re-prompt answers.

## Relevant files

- `packages/engine/src/run/run.ts` — `Run.turn`'s `correction()`: the re-prompt (which now withdraws the trigger) and the plan correction (which does not).
- `packages/engine/src/run/turn.ts` — `observeStuck()` at a turn's empty end; `check()` at the next turn's first step.
- `packages/engine/src/run/supervisor.ts` — `LoopSupervisor` keeps `pending` across turns of one conversation.
- `packages/engine/src/run/coordinator-plan.test.ts`, `packages/engine/src/run/answerless.test.ts` — the cases that confirm and bound it.

## Outcome

**Repaired 2026-10-14 by fin44 (`fin44-supervision-and-match`)** under [OQ-284](../../architecture/open-questions.md#oq-284)'s
ruling (R-072), recorded as [`PD-ORCH-009`](../../product/directives.md#pd-orch-009) revision 4: a plan correction is the only
message the run adds for the turn it follows. `Run.turn`'s `correction()` (`packages/engine/src/run/run.ts`) calls
`withdrawStuck()` on the root's supervisor before it returns the correction (a repetition, cycle or raw-count trigger stays), and
`noteUserInstruction()` beside it (REQ-ORCH-105, the companion note
[`a-plan-correction-does-not-restart-the-consecutive-activation-series`](a-plan-correction-does-not-restart-the-consecutive-activation-series.md)).
**Pinned by** `coordinator-plan.test.ts`, "PD-ORCH-009 revision 4 (OQ-284): …": the two cases that confirmed this note, flipped
(the correction last, `asked` empty, no activation; red on `a3be56c`), and a guard that a raw-count trigger the answered turn armed
is kept. **Shown in the built app** by `pnpm part-h-proof`'s `silent-correction` launch (`planopen,silent,silent,plandone,report`,
`circuit_breaker.enabled: true`): the correction sent once and followed by the root's own step, 0 stuck activations, 0 loop
classifications, one `succeeded` iteration. The route this note left unmeasured — a root resumed after a child's report — was
measured: the corrective follows the report; it is outside the ruling, recorded as
[`a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn`](a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md)
and raised as [OQ-296](../../architecture/open-questions.md#oq-296). **Not shown:** the live `empty-answer` scenario with the plan
open, the orchestrator's.
