## The stalled call was the one call missing from the evidence pack

The live run's `faults-stall` launch induces a model stream that stops mid-answer with the socket held open, and
the recording proxy is supposed to leave the whole call in `model-traffic.jsonl` — what was sent, what had come
back before the silence, and the fault that caused it. On the scenario's first execution against a real endpoint
(2026-09-22, pack `.live-run/runs/2026-09-22T09-05-35-955Z`), that record was not there.

The launch's log holds **five** `model request POST` lines. `faults-stall/model-traffic.jsonl` holds **four**
records, all `status 200`, none carrying a `fault` field. The missing one is the stalled call.

The cause is a lifetime mismatch nobody would see by reading. `settle()` — the function that writes the record —
was reached from exactly two places on the streaming path: the upstream's `end` event, which a stalled call never
reaches, and the timer that lets the socket go after `holdMs`. `holdMs` defaults to **300 s**, and the product's
own idle bound is **120 s** (`llm_response_timeout`, REQ-CONFIG-115). So the product noticed at 120.5 s, retried
at 121.5 s, finished the run, and the launch ended — while the proxy's timer, correctly `unref`'d so it could
never hold the harness open, simply never ran.

A record written only on release is a record that exists only when nobody needs it. The scenario's whole reason
for existing is that one call, and it was the one call a reader of the pack could not see.

## Specs

None — this is harness code and nothing in `docs/spec/` governs `apps/desktop/scripts/`. It is recorded because
`AGENTS.md` tells every reader that `model-traffic.jsonl` says "what the model was sent and what came back", and
for the `faults-stall` scenario specifically that was false in the one place it mattered.

## Relevant files

- `apps/desktop/scripts/lib/model-traffic.mjs` — `settle`, and the `stall` branch of the `data` handler.
- `apps/desktop/scripts/lib/model-traffic.test.ts` — the stall cases.
- `apps/desktop/scripts/live-run.mjs` — the `faults-stall` launch and its `LIVE_RUN_STALL_HOLD_MS`.

## Repaired — 2026-09-22

`settle` takes an `outcome` and is called the moment the silence begins (`settle('stalled')`) as well as when the
socket is released (`settle('released')`), with a `written` guard so a call that is both stalled and later
released leaves two records rather than one overwritten one. The healthy and `cut` paths name themselves too
(`complete`, `cut`), so a reader of the pack always knows which kind of ending they are looking at. The record
written at stall time carries what had arrived before the silence, which is the evidence the scenario is for.

Guarded by `records a stalled call at the moment it stalls, not only when the hold expires`, which uses a
600 s hold — far longer than the test — so it can only pass if the record is written while the call is still
wedged. Verified by removing the `settle('stalled')` call and watching it fail (1 failed of 10), then restoring
it (10 of 10).

Two things were repaired beside it in the same commit, both found by the same first execution and both recorded
in `docs/architecture/first-executions.md` rather than as separate notes: the scenario's
`stop_reason !== 'user_cancelled'` check could not fail (a run that never met a fault ends `tasks_complete`
too) and now carries a positive half read from the product's own `issues` table; and `LIVE_RUN_STALL_HOLD_MS`
now states in the code that it must outlast the product's idle bound, since lowering it below 120 s would make
the scenario measure the proxy letting go rather than the product noticing.
