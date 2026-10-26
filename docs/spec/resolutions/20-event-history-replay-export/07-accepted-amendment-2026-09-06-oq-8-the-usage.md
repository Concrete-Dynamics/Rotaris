# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Accepted amendment, 2026-09-06 — OQ-8: the usage event's emission trigger

Part 7 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

## Accepted amendment, 2026-09-06 — OQ-8: the usage event's emission trigger

REQ-EVENTS-053 fixed what a `usage.update` may not carry and what its figures
mean, and left unstated *when* one is raised. The accepted resolution names the
completed provider request as the trigger: one event per request that contributes
new usage, counting the usage a failed or partial request reported, skipping a
request whose reported figures leave the cumulative totals unchanged. Sampling
(REQ-MONITOR-166) keeps its own independent cadence and neither raises nor
suppresses one; REQ-SESSION-094's terminal `session.end` carries the final
cumulative totals regardless. Journal volume against REQ-EVENTS-091's cap is
thereby bounded by the number of provider requests a run makes, which is what
ADR-0009 consequence 8 said the store does not decide.

**What the first implementation of the trigger found, 2026-09-13.** The event was
raised once per *iteration*, from the turn's returned report — and that report
carries only the attempts that survived. `resilientStep` discards the report of
every attempt it retries past, and `runWithChildren` returns the last parent turn
of a resume loop, so a run that retried a transient failure or resumed its parent
spent tokens the session's own totals, its terminal event and its cost never
counted. Counting is now done once per completed request, at the one place a
request completes. Regression coverage is in
`packages/engine/src/run/run.test.ts`.
