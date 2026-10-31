## The live run's `faults-args` check fails on an endpoint that streams arguments in few pieces

`faults-args` paces each streamed tool-call piece by 120 ms and needs one call's arguments to outlast the 10 s stall
threshold and one evaluation interval. Against `ds41-vpn` (vLLM, model `ds41`; pack `2026-10-31T19-40-08-158Z`, head `c583e1bc`) the longest call came in
9 pieces over 2.3 s, so the check failed. The behaviour it guards did not misbehave as far as this run could show: no `stall`
issue was written, but the window was too short to ask the question. The red is the check's stated choice (the comment at the
scenario says such a window "fails as such"), so the defect is that this endpoint can never reach what the scenario asks.

Not repaired (record-only). The pace could be derived from the pieces an endpoint actually sends; reading it as a NOTE instead
would mean revisiting that stated choice.

## Specs

None contradicted by the product. REQ-ORCH-089 and REQ-MONITOR-119 went unasked on this endpoint.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `faults-args` launch, `ARGS_PACE_MS` and the check on `pacedWindows`.
- `apps/desktop/scripts/lib/paced-arguments.mjs` — `pacedWindows` and `conclusive`, the bar a window must clear.
