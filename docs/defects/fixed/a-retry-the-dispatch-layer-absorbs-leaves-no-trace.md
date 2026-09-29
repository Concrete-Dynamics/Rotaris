## A retry the dispatch layer absorbs leaves no trace in the session

A 429 or a 500 on a model call is retried inside the model client by the SDK's own backoff (`maxRetries`, the run's
`modelRetries` of 5) before the resilience ladder sees it. That order is the specification's, and the owner has ruled
it so (below). What is missing is any record of it: no issue, no timeline entry, no session-log line. A run that met
two refusals reads exactly like a run that met none, so the retries cannot be diagnosed.

Live-run finding: L3 (live runs of 2026-09-29)

**Ruled 2026-09-29 — [OQ-110](../../architecture/open-questions.md), [R-067](../../product/requests.md#r-067).** The dispatch layer's retries (REQ-CONFIG-086's
`num_retries`, default 5) come first, and the ladder (REQ-ORCH-091/092) takes over when they are exhausted; nothing is
added to the ladder. Each retry the dispatch layer absorbs is written to the session log with the status it met and the
delay it waited. That line is this note's repair. The live run's ladder check is the harness's half, recorded in
`../two-live-run-checks-cannot-see-what-they-claim.md`.

## Specs

- `REQ-CONFIG-086` (the dispatch layer's default of 5) before `REQ-ORCH-091` (c) and `REQ-ORCH-092`, as OQ-110 rules.
- `REQ-SESSION-142`, the session log, where OQ-110 puts the line; no line is written today.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `474a2d22` (`faults-ladder`), `model-traffic.jsonl`: a 429 at 02:59:31.908 retried at 02:59:33.916
  (+2.0 s); a 500 at 02:59:33.918 retried at 02:59:37.926 (+4.0 s). The session's `issues` hold 0 rows, its timeline only
  `run_start` and `run_end`, its `session.log` no line about either; `run/ladder.ts` was never reached.
- The 2026-09-22 row of `docs/architecture/first-executions.md` credited the ladder with this recovery; it is corrected
  in place under R-067.

## Relevant files

- `packages/model/src/ai-sdk-client.ts:242` — `maxRetries: req.retries`, handed to the SDK.
- `packages/engine/src/run/run.ts:89` — `modelRetries: 5`.
- `packages/engine/src/run/turn.ts:490` — where the retries count reaches the request.
- `apps/desktop/src/run-host/configuration.ts:587` — the per-model `num_retries`.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, as OQ-110 rules. The model client reports each retry the dispatch layer absorbs as it
sends it: its one decorated fetch sees a request follow a failed attempt of the same call and calls `ModelRequest.onRetry`
with the attempt, the budget, the status the attempt before it met (none, with the failure beneath it, for a connection
failure) and the delay it waited, measured on the monotonic clock the client is now given. `DefaultAgentBackend` forwards
it to `TurnSink.retried`, and the turn writes it through the run's `warn`, so a line of this shape reaches the session log
at its default WARNING level:

```
… WARNING model request retried by the dispatch layer: <agent> on <provider>/<model> met HTTP 429 and waited 2008 ms before retry 1 of 5 (REQ-CONFIG-086 num_retries; the ladder of REQ-ORCH-091/092 takes over only when they are exhausted)
```

Nothing is added to the ladder, and no issue or timeline entry is written for an absorbed retry. Pinned by
`packages/model/src/ai-sdk-client.test.ts` ("OQ-110 (REQ-CONFIG-086, REQ-SESSION-142): each retry the dispatch layer absorbs
is reported as it is sent …", "OQ-110: a connection failure the dispatch layer retries is reported …") and
`packages/engine/src/run/turn.test.ts` ("OQ-110 (REQ-CONFIG-086, REQ-SESSION-142): a retry the dispatch layer absorbed is
written to the session log …"), each red with the report withdrawn. OQ-110 carries the report-back; the 2026-09-22 row of
`first-executions.md` was corrected in place by the ruling. The live run's ladder check stays with
`../two-live-run-checks-cannot-see-what-they-claim.md`.

Files: `packages/model/src/ports.ts` (`DispatchRetry`, `ModelRequest.onRetry`, `TurnSink.retried`),
`packages/model/src/ai-sdk-client.ts` (the decorated fetch, `AiSdkClientOptions.monotonic`),
`packages/model/src/default-backend.ts`, `packages/engine/src/run/turn.ts` (`dispatchRetryLine`, the step's sink),
`apps/desktop/src/run-host/configuration.ts` (the clock handed to the client).
