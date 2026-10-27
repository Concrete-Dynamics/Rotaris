# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Context

Part 1 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Context

An SDK can only ever serve one step. Domain 04 carries 134 live requirements and the ones an SDK could
plausibly help with are the request itself. Discovery (`REQ-PROVIDER-069` to `REQ-PROVIDER-083`), the
credential store (`REQ-PROVIDER-014` to `REQ-PROVIDER-019`), the sign-in flows (`REQ-PROVIDER-023` to
`REQ-PROVIDER-050`), the snapshot (`REQ-PROVIDER-084` to `REQ-PROVIDER-087`), slot assignment
(`REQ-PROVIDER-081`), priming (`REQ-PROVIDER-066` to `REQ-PROVIDER-068`) and usage and credit
(`REQ-PROVIDER-119` to `REQ-PROVIDER-130`) are outside any model SDK's scope and must be written
regardless.

Two dialects against one base URL, chosen per model, are **mandatory** (`REQ-PROVIDER-089`,
`REQ-PROVIDER-092`): a Copilot model discovered as responses-only is invocable, its requests go to the
responses endpoint, and it reports both per-token costs as zero.

Per-request headers vary by provider and by call: Copilot's editor-identity header set is required or
the endpoint returns nothing usable (`REQ-PROVIDER-070`); codex sends `client_version`, `originator`,
an `OpenAI-Beta` header and a conditional account-id header (`REQ-PROVIDER-076`); and the bearer must
be resolved and possibly renewed **at dispatch** (`REQ-PROVIDER-092`).

Usage must be surfaced per call including the provider's **real** input-token count, because
`REQ-MONITOR-081`'s compression trigger prefers it over an estimate and records which source it used.
Money must never be computed in binary floating point (`REQ-PROVIDER-121`), so cost must not be
delegated to a library that does it in a floating-point number. `REQ-PROVIDER-071`'s classification is
**total** and status-bearing, so whatever performs an HTTP call must expose the status code and the raw
body, the latter cut to its first 500 characters before being shown or logged.

**What was checked.** Context7, the AI SDK documentation at `ai-sdk.dev`, and the npm registry,
2026-08-31. The packages are `ai` (7.0.x), `@ai-sdk/openai` (4.0.x) and `@ai-sdk/openai-compatible`
(3.0.x), all Apache-2.0. Four facts, all confirmed against the current v7 line:
`createOpenAICompatible` accepts `baseURL`, `apiKey`, `headers`, `queryParams`, a custom `fetch`,
`includeUsage`, `transformRequestBody` and `metadataExtractor`; `createOpenAI` accepts `baseURL`,
`headers` and a custom `fetch`, and the OpenAI package exposes `openai.chat()` and `openai.responses()`
as separate constructors — its own documentation states that a custom base URL serving only the chat
dialect should be reached through `openai.chat()` or through the compatible provider, which is the
configuration the spike below exercises; and `streamText`'s `usage` carries `inputTokens`,
`outputTokens` and `totalTokens` at the top level, with `raw` carrying the provider's own record.

**One of those four moved, and it is worth recording where.** The v7 line, published 2026-06-25,
**removed** the top-level `cachedInputTokens` and `reasoningTokens` from the usage type; they are now
`inputTokenDetails.cacheReadTokens` and `outputTokenDetails.reasoningTokens`. The count
`REQ-MONITOR-081` actually depends on — the provider's real input-token count — is still top level and
still present. Three major versions in thirteen months (v5 2025-07, v6 2025-12, v7 2026-06) is the
evidence for consequence 1 below, not a hypothetical.
