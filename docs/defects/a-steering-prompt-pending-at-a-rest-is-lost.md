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
