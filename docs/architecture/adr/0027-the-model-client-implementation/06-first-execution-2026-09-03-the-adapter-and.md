# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — First execution — 2026-09-03, the adapter, and spike 6 in its structural half

Part 6 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## First execution — 2026-09-03, the adapter, and spike 6 in its structural half

*Recorded under GD-10. The spike report is `../spikes/responses-dialect.md`.*

**Built and run:** `packages/model/src/ai-sdk-client.ts` over `ai` 7.0.92, `@ai-sdk/openai` 4.0.58 and
`@ai-sdk/openai-compatible` 3.0.43, **pinned exactly**; the v7 usage shape re-checked against the current
documentation at the pin (top-level `inputTokens`/`outputTokens` are there, as this record said). `chat`
through the compatible provider and `responses` through the vendor package's responses constructor, both
against one base URL; **one decorated `fetch`** resolves the credential per request inside the request
path, adds the per-provider headers, and hands a log nothing but redacted headers (`REQ-PROVIDER-131`);
the retry count is the request's; an error keeps status and body cut to 500 characters. No SDK type
crosses the port and no money is computed.

**Spike 6, structural half, held on every assertion** (fake `fetch`): both dialects reach the right path
under one arbitrary base URL; the bearer and the headers arrive; the log never sees the bearer; usage,
finish and deltas map across; 401 keeps its body; 503 is transient and 400 is not; an abort ends the
stream as aborted. **The live half is owed**: no endpoint and no key exist on the build machine and the
boundary forbids borrowing another product's. The harness is written and gated on an endpoint the owner
supplies. Until it runs, consequence 2's fallback stays priced and not taken.

**Found: the instrument, not the adapter.** The first abort test hung for its full timeout because the
fake `fetch` ignored the request's abort signal. The adapter was right. Recorded in the spike report as
the third time a measuring instrument has held the defect.
