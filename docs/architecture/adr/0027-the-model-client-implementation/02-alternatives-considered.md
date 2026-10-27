# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Alternatives considered

Part 2 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

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
