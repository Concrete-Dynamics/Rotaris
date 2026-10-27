# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Second execution — 2026-09-05, the first real model call (Part K)

Part 7 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Second execution — 2026-09-05, the first real model call (Part K)

*The fifteenth defect of ADR-0058 consequence 17's pattern, and spike 6's live half taken at last.*

**Found before any request left the machine:** the adapter placed the run's system prompt inside `messages` as a
`system` message, and the pinned SDK (ai 7.0.92) refuses that shape in its prompt validation — *"System messages
are not allowed in the prompt or messages fields. Use the instructions option instead."* — so the first real run
failed in its pre-flight classification and again in its first turn without a byte reaching OpenRouter. Spike 6's
structural half had held on every assertion because no fake request carried a system message; the instrument
measured what it was pointed at. The system text now travels as `instructions` (every system message joined by a
blank line) and the structural test carries one and reads it back from the request body. The v7 migration note
this record wrote for the usage field applies to the prompt shape as well.

**Spike 6's live half, taken the same day:** four of four against OpenRouter — both dialects stream, first
delta in under a second, the provider's usage arrives, a bad key keeps status and body, an abort ends as
`aborted` (`../spikes/responses-dialect.md`). **Consequence 2's fallback is withdrawn from the price list.**
