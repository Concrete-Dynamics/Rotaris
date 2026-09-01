# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-02)
- **Depends on:** ADR-0026, ADR-0031

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

## Alternatives considered

**A — The AI SDK behind `ModelClient`.**

*For:* server-sent-event parsing, tool-call fragment assembly (arguments arriving split across deltas),
reasoning parts, usage extraction, abort and retry are genuinely fiddly and genuinely done. The custom
`fetch` hook is the natural seam for injecting the resolved credential, the per-provider headers, the
per-model concurrency permit and the redaction of anything logged — so provider-specific behaviour
lands in one function rather than spreading through a request builder. A responses-mode constructor
plus a `baseURL` covers the two-dialect requirement for responses-only models.

*Against:* the provider-package type surface has moved across major versions, so upgrades will cost
adapter work. The compatible-provider factory is chat-dialect only; responses mode against a
non-vendor base URL goes through the vendor package, a supported but less-travelled configuration that
should be spiked before being relied on. And the SDK contributes nothing to the rest of the domain, so
it does not reduce the slice's overall size much.

**B — Direct HTTP for everything, no model SDK.**

*For:* one fewer dependency on a fast-moving package; complete control over headers, body shape and
error classification, which `REQ-PROVIDER-071`, `REQ-PROVIDER-073` and `REQ-PROVIDER-074` demand in
unusual detail anyway; nothing to fight when a provider's payload changes, which `REQ-PROVIDER-151`
explicitly anticipates. The discovery path is hand-written regardless, so the HTTP plumbing exists
either way.

*Against:* we would re-implement streaming tool-call assembly for two dialects, and do it worse at
first. That code has **no requirement of its own to guide it** — it is pure protocol detail — so bugs in
it surface as mysterious agent misbehaviour rather than as a failed conformance test. It is the least
interesting code in the slice and the easiest to get subtly wrong.

## Decision

**Alternative A, scoped tightly, with the AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`;
Apache-2.0) as the SDK.** The selection criterion is a single seam and a single dialect pair: a provider
factory that takes a base URL, arbitrary per-request headers and a **custom `fetch`**, and a package
that exposes the two dialects `REQ-PROVIDER-089` and `REQ-PROVIDER-092` require as separate model
constructors against that base URL. It is chosen for those two properties and nothing else; the rest of
the domain does not touch it.

- `ModelClient` is implemented by an adapter that constructs an SDK language model per
  `(base URL, dialect, headers)` and calls the SDK's streaming text function. **No SDK type crosses the
  port** — including the usage type, whose shape moved between v6 and v7 and would otherwise have taken
  the port with it.
- Discovery, usage, credit, OIDC, device code, PKCE and token exchange use plain HTTP. They are not
  model calls and gain nothing from the SDK.
- **Cost is never computed by the SDK.** Usage tokens come out of it; money is computed by the decimal
  layer of ADR-0031.
- The retry count is set from the per-model value, default 5 (`REQ-PROVIDER-089`), not the SDK's own
  default.
- All provider-specific decoration — credential resolution and renewal, the concurrency permit, header
  injection, and redaction of anything reaching a log — lives in the **custom `fetch`** handed to the
  provider factory, so there is exactly one place a request is decorated.

## Consequences accepted

1. A dependency whose major versions rename core types, at a demonstrated cadence of roughly two
   majors a year. Mitigated by the port, which is mandated anyway; the blast radius is one adapter file,
   and **the version is pinned** so an upgrade is a deliberate act with the usage-field mapping
   re-checked each time.
2. **A spike is required before the gate:** responses-dialect requests against a non-vendor base URL
   with custom headers. If it does not work, the fallback is a hand-written responses-dialect
   implementation behind the same port — a contained loss, not a redesign.
3. We accept that the SDK gives little leverage overall. It is chosen for one step, on the merits of
   that step, not as a framework.
4. The custom `fetch` becomes a security-relevant chokepoint: it carries the bearer and it is where
   `REQ-PROVIDER-131`'s redaction applies before anything is logged.

## Revisit if

The responses-dialect spike fails; or a provider's request needs a body the SDK cannot express even
through its request-body transform; or the SDK's usage record stops carrying a real provider
input-token count, which `REQ-MONITOR-081` depends on.
