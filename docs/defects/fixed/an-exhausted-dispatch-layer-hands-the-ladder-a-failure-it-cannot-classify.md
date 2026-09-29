## An exhausted dispatch layer hands the ladder a failure it cannot classify

When the model client's dispatch layer spends every retry REQ-CONFIG-086's `num_retries` allows (default 5) and the call
still fails, the AI SDK reports it as a `RetryError` wrapping each attempt's error. `fromError` in
`packages/model/src/ai-sdk-client.ts` read that wrapper whole: it is not an `APICallError` and carries no status, so every
exhausted budget became `code: 'unknown'`, `transient: false`, its headline "Failed after N attempts. Last error: …", and
the provider's status and `retry-after` were dropped. The resilience ladder then saw a fatal failure: a 429 that outlasted
the dispatch layer failed the step at once instead of entering REQ-ORCH-091 (c)'s suspended wait, and a 503 failed it
instead of spending REQ-ORCH-092's transient budget. The only exception was a provider message that happened to contain
`429` or "rate limit", which the ladder's text markers would still catch.

Noticed 2026-09-29 while repairing `a-retry-the-dispatch-layer-absorbs-leaves-no-trace.md` under OQ-110, whose ruling
states that the ladder takes over when the dispatch layer's retries are exhausted. Confirmed by a probe against a fake
fetch answering 429 three times with `retries: 2`: the stream ended `{ code: 'unknown', transient: false }`.

## Specs

- `REQ-ORCH-091` (c) — a 429 without quota codes is a suspended wait with its `model_wait` issue; unreachable here.
- `REQ-ORCH-092` — 500, 502, 503, 504, 408, 425 and connection failures are transient and retried by the ladder; here they
  failed the child at once.
- `REQ-CONFIG-086` with OQ-110's ruling — the dispatch layer first, the ladder when it is exhausted.

## Relevant files

- `packages/model/src/ai-sdk-client.ts` — `fromError`, which classifies the error part and the thrown path alike.
- `packages/engine/src/run/resilience.ts` — `classifyFailure`, which reads `status` and the text the error carries.

## Repaired — 2026-09-29

Recorded and repaired 2026-09-29 under R-067. `fromError` now unwraps a `RetryError` and classifies its `lastError` — the
last attempt's own failure — so its status, the provider's message and `retry-after` reach the ladder as they would have
with no dispatch-layer retries at all (a 429 then a 400 is classified as the 400, which is what ended the retries). Pinned
by `packages/model/src/ai-sdk-client.test.ts` ("OQ-110 (REQ-ORCH-091/092): when the dispatch layer's retries are
exhausted the ladder is handed the last attempt's error, its status and retry-after intact"), red on the code before the
repair. OQ-110 records it as found by building the ruling.
