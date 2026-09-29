## A steering prompt pending at a rest is lost

A steering prompt submitted for an agent waits in the run's memory (`Run.steering`) until the agent's next round
injects it. When the run comes to rest before that round — a pause, a stop, a quit — the run ends with the prompt
still waiting, and nothing records it: the agent is left `paused`, and when the session is continued and the agent
resumes from its record, the prompt is gone. The submission was acknowledged with an identifier and was never
delivered. Noticed by phase 4's review of `PD-ORCH-005` (2026-09-27), established by reading the code; not driven.

## Specs

`REQ-MONITOR-134` ("all pending steering prompts for an agent are delivered into its conversation … marked injected
exactly once"), which a prompt that is never delivered does not meet, as narrowed by `PD-ORCH-005` clause 4 (a resumed
agent carries on from its record, which the prompt never reached).

## Relevant files

- `packages/engine/src/run/run.ts` — `steering` (the in-memory map), `steeringFor`, and the rest that ends the run.
- `packages/engine/src/run/turn.ts` — `injectSteering`, the one place a pending prompt reaches a conversation.
- `packages/engine/src/run/record.ts` — the conversation record a resumed agent is loaded from.

## Repaired — 2026-09-29

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067). When the iteration comes to rest, `Run.turn`'s rest
now delivers every prompt still pending for an agent it leaves `paused` with a conversation record — the root and each
paused child — into that record, as the marked message `injectSteering` would have pushed (`steeringMessage`), after the
answers to the calls the rest cut, and records `steering_injected` then, once, its metadata naming the rest
(`Run.deliverSteeringAtRest`). The resumed agent carries on from its record, so its first request ends on the prompt and
is a step; a child restored `summarizing` whose record ends on one resumes `running` to take it
(`IterationChildren.resumePaused`, as for the background-sessions notice). What no step injected and no rest delivered
— a child that never started, an agent that ended or was cancelled, a prompt for the entry role pending at an iteration
boundary — is withdrawn at the run's end, with a `steering_withdrawn` entry and a transcript line, and a steer after
that is refused (`Run.withdrawSteering`). The reading, and what it leaves to a ruling, is [OQ-122](../../architecture/open-questions.md).

Evidence: `packages/engine/src/children/children.test.ts`, two cases under "PD-ORCH-005 phase 3": steering the paused
child, the waiting root and a child that never started, then pausing, leaves the first two records ending on their
prompts, each injected once, and the third withdrawn and said so; the Continue's resumed agents each read their prompt
as the last message of their first request, and nothing is injected a second time. A child steered while summarising and
then stopped resumes `running`, takes a step over the prompt and reports. On the code before the repair the first case's
record ended on the tool results with no prompt, and the second moved straight back to `summarizing`.
`apps/desktop/scripts/part-j-proof.mjs`'s scenario 3b drives it in the built app: a steer submitted while the entry
role's step is held, then a pause, then the Continue; the root's record holds the prompt after the read's result and
before the resumed step, injected once by the pause. On a build of the code before the repair the scenario failed ("the
steer never reached the root's record"); with the repair it passed.
