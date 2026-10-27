# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Decision

Part 3 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

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
