## A paused run's notice says a person stopped it

Every run that ends with stop reason `user_cancelled` gets the same end-of-run summary: "The run came to rest because a
person stopped it." That covers a pause, a stop, a quit and the explicit cancel alike. After a pause the banner above
the paused session says the run was stopped, while the transcript's own row says "Run paused at the user's request".
Since PD-ORCH-005, what the user can do next depends on which rest it was. After a pause, a stop or a quit, the agents
resume on a continue; after the explicit cancel, none do. The notice tells the user neither.

Noticed 2026-09-27 in PD-ORCH-005's phase 7 built-app evidence, after the pause with an approval pending. The wording
dates from 2026-09-20, before the directive.

## Specs

`REQ-ORCH-082` fixes the summary's arms and leaves the wording to the implementation; nothing contradicts it outright.
`REQ-MONITOR-125` asks for a paused session to persist "with an interruption message". The message shown names the
wrong interruption.

## Relevant files

- `packages/engine/src/run/stop-conditions.ts` — `summarise`, the `user_cancelled` arm.
- `packages/engine/src/run/run.ts` — `restCause`, which knows which rest it was.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, within what REQ-ORCH-082 allows. This note read the rule's wording as free; it is not
wholly. Rule 1 conveys "that the run came to rest because a person stopped it, and not asserting which of the two
person-stops it was", and "no rule of this list may distinguish the two, there being nothing on the stop-reason axis to
distinguish them by" — which `PD-ORCH-005` clause 21 confirms (a pause and a stop record the same stop reason). So
`summarise` was not given the rest (`restCause`, the final stop, the pause request) to word each arm by, as the triage
proposed: that would change the requirement's clause, and is raised as
[OQ-118](../../architecture/open-questions.md) instead.

What changed: rule 1's message now fits every rest a person asks for and names none —
"The run came to rest at the user's request." (`packages/engine/src/run/stop-conditions.ts`, `summarise`). A paused
session's notice no longer says the run was stopped beside its own "Run paused at the user's request" row. The words
carry no persisted status, so they stand with R-067's ruling 2 (a graceful stop persists `paused`, `PD-ORCH-005`
clause 21). Which rest it was stays told by the transcript's row and the timeline, and what a continue resumes by the
Continue action's count, which reads nothing after the explicit cancel. The sentence of `summarise` holding the literal
"(s)" (rule 4) is not this one and is left to the plurals repair.

Evidence: `packages/engine/src/run/run-pure.test.ts` ("REQ-ORCH-082 rule 1: every rest a person asked for gets one
message, which names no pause, stop or cancel") fails on the code before the repair; `run/plan-gate.test.ts`'s cancel at
the gate reads the new words. In the built app `part-j-proof`'s pause scenario samples the store while the app runs and
asserts the paused session's summary reads the new words (it read them on 2026-09-29).
