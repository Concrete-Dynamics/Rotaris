## The live run's `faults-args` check fails on an endpoint that streams arguments in few pieces

`faults-args` paces each streamed tool-call piece by 120 ms and needs one call's arguments to outlast the 10 s stall
threshold. Against `ds41-vpn` (vLLM, model `ds41`; pack `2026-10-31T19-40-08-158Z`, head `c583e1bc`) the longest call came in
9 pieces over 2.3 s, so the check failed. The behaviour it guards did not misbehave as far as this run could show: no `stall`
issue was written, but the window was too short to ask the question. A red here means the scenario never reached its
question, which is an inconclusive result reported as a failure.

Not repaired (record-only). The pace could be derived from the pieces an endpoint actually sends, or this could read as a NOTE.

## Specs

None contradicted by the product. REQ-ORCH-089 and REQ-MONITOR-119 went unasked on this endpoint.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `faults-args` launch, `ARGS_PACE_MS` and the check on `pacedWindows`.
