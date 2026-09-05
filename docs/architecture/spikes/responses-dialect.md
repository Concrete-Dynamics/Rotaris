# Spike 6 — the Responses dialect through the AI SDK, against a non-vendor base URL with custom headers

- **Date:** 2026-09-03
- **Taken as:** the first act of building `ModelClient`'s AI SDK adapter (ADR-0027), with the run loop.
- **Question** (ADR-0027 consequence 2): does a `responses`-dialect request against a **non-vendor** base
  URL, with custom per-request headers and a credential resolved inside the request path, work through
  the SDK's vendor package? If not, the fallback is a hand-written responses dialect behind the same port.
- **Status: taken in its structural half; the live half is OWED.** No model endpoint and no key exist on
  the machine this was built on, and the record's boundary forbids using another product's credentials.
  The live harness is written, gated on an endpoint the owner supplies, and the report says exactly what
  it will measure.

## Method

`packages/model/src/ai-sdk-client.ts` is the adapter: `chat` through `createOpenAICompatible` and
`responses` through `createOpenAI(…).responses()`, both against one base URL, one decorated `fetch` for
every request. Pinned: `ai` 7.0.92, `@ai-sdk/openai` 4.0.58, `@ai-sdk/openai-compatible` 3.0.43; the
v7 usage shape (top-level `inputTokens` / `outputTokens`) re-checked against the current documentation
via Context7 on this date.

**Structural half** — `packages/model/src/ai-sdk-client.test.ts`, a fake `fetch` standing in for the
network, so what is measured is the SDK's request construction and the adapter's decoration:

| Assertion | Result |
|---|---|
| `chat` against `https://acme.example/v1` reaches `…/v1/chat/completions` | held |
| `responses` against the **same** base URL reaches `…/v1/responses` through the vendor constructor | held |
| the credential is resolved per request inside the decorated fetch and arrives as the bearer | held |
| custom headers (`editor-version`) arrive on the request | held |
| what reaches the log has the bearer redacted (`REQ-PROVIDER-131`) | held |
| streamed deltas, the finish reason and the provider's usage map across the port | held (`{input: 7, output: 2}` from a chat chunk carrying usage) |
| a 401 keeps its status and the provider's body on the error (`REQ-PROVIDER-071`) | held |
| 503 is transient and 400 is not, decided on the status (`REQ-ORCH-092`) | held |
| an abort mid-stream ends the stream as `aborted` | held — **once the fake honoured `init.signal`**; a fake that ignored it hung the test for 30 s, which is the fidelity note below |

**Live half** — `packages/model/src/ai-sdk-live.spike.test.ts`, skipped unless `ROTARIS_SPIKE6_BASE_URL`,
`ROTARIS_SPIKE6_MODEL` and `ROTARIS_SPIKE6_API_KEY_ENV` (the *name* of the variable holding the key)
are set. It measures, for `responses` and then `chat` on the same base URL: delta count, time to first
delta, total time, the provider's usage figures, the error on a bad key, and an abort after three deltas.

## What it settled

1. The SDK's two dialects are reachable **against one arbitrary base URL** with the vendor package's
   responses constructor and the compatible provider's chat constructor, with one custom `fetch` carrying
   the credential and the headers. ADR-0027's "single seam and single dialect pair" is a property of the
   pinned packages, not an assumption.
2. The error type preserves status and body; `REQ-ORCH-092`'s classification can be a fact on the error.
3. The v7 usage mapping the record warned would move has the field `REQ-MONITOR-081` needs.

## What it found

**A fidelity note about the harness, in the pattern ADR-0058 consequence 17 tracks:** the first abort
test hung, because the fake `fetch` did not honour the request's abort signal. The adapter was right; the
instrument was wrong — and had the fake been more elaborate the failure would have read as an adapter
defect. Recorded because it is the third time a measuring instrument has held the defect.

## What it did not measure — owed

The live half: a real responses endpoint's stream shape, latency, usage figures and error bodies. Until
it runs, ADR-0027's fallback (a hand-written responses dialect) stays priced and not taken, and a
configured `responses` model in the application is untested against anything but the fake. The owner
supplies an endpoint and runs the command in the harness's header; the figures go into this report.

## Live half, first attempt — 2026-09-05, OpenRouter through the slice proof

The harness ran against `https://openrouter.ai/api/v1` with the credential the owner had pasted into the product.
**What it settled before any figure:** the adapter had never sent a real request — the pinned SDK refuses a system
message inside `messages` (ADR-0027, the fifteenth defect), which the fake `fetch` never exercised because no
structural request carried one. **What it then found:** both `responses` and `chat` were answered `401 Missing
Authentication header` with the header present, because the stored value was of another vendor's shape and
OpenRouter's public catalog had "validated" it (OQ-50). The abort case ended `http` rather than `aborted` for the
same reason. Delta count, time to first delta, total time and usage are **still owed**: the owner re-runs
`pnpm slice-proof` with an OpenRouter key and the figures land here.
