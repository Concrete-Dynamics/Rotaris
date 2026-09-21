## A single-retry stream stall aborted a 76-minute run with a null session report

Observed 2026-09-20, run `7bd9c19d` (punchclock_v2, real model via `pnpm --filter @rotaris/desktop dev`): after all 7 children settled (23:05:03Z), the orchestrator's next model call produced no stream activity for 120000 ms. Timeline #80 records `Transient model failure for orchestrator on openai-compatible--vllm/qwen3.8-flash-next (retry 1 of 1): no stream activity for 120000 ms; retrying after 1 s.`; timeline #81/#82 and events #3287/#3288 record the run ending `failed` (`agent_session_aborted`, `duration_seconds: 4564.2`) with `report: null` — while 7 child artifacts stayed published. The stall is endpoint-side; what the store shows is the session-level price of the retry budget being spent on the final synthesis turn: 464 tool calls and 1809522 input tokens ending in a failed session with no report.

## Specs

No requirement contradicted from this autopsy — the timeout fired, the transient classification held, and the abort message is truthful. Recorded for the cost shape: one stall on the last turn discards the session result while the children's artifacts survive.

## Relevant files

- `packages/model/src/ai-sdk-client.ts` — the `no stream activity for ${req.timeoutMs} ms` timeout.
- `packages/engine/src/run/ladder.ts` — the `(retry ${attempt} of ${limit})` message.
- `packages/engine/src/run/resilience.test.ts` — the mid-stream timeout classified `transient`.

Noticed 2026-09-20 by the run-autopsy of run `7bd9c19d`.
