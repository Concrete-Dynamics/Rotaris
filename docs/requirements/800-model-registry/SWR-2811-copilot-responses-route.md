---
req-id: SWR-2811
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2810
title: "Responses-route model metadata and LiteLLM registration"
epic: SWR-800
date: 2026-08-08
---

# SWR-2811 — Responses-route model metadata and LiteLLM registration

SWR-2810 requires that models reachable only through a provider's Responses endpoint
stay selectable and get routed there. Rotaris dispatches every model through LiteLLM's
chat-completions entry point, and LiteLLM decides on its own whether a call is
re-routed to `/responses`: it does so only when the model is registered with
`mode: "responses"` in its model-metadata map. That map ships a fixed set of GitHub
Copilot ids, so newly published models — exactly the ones that tend to be
responses-only — are unknown to it and fall back to the chat route, where the provider
rejects them.

The provider's own `/models` payload carries the answer in `supported_endpoints`, but
it uses a different vocabulary (`/responses`, `ws:/responses`) from LiteLLM's
(`/v1/responses`), and discovery previously discarded the field entirely.

The product MUST therefore:

- Normalize the provider's endpoint vocabulary during discovery and record, per model,
  a route decision (`chat` or `responses`) alongside the normalized endpoint list, so
  the decision survives into the persisted project snapshot and into the model
  configuration built from it. Non-HTTP transports (`ws:` entries) are not routes and
  MUST NOT influence the decision.
- Withhold a chat-type model that advertises neither route, since no dispatch path
  exists for it.
- Register a responses-routed model with LiteLLM before the model is constructed, so
  the chat-completions call is transparently bridged to the Responses endpoint. The
  registration must be idempotent, carry the model's discovered token limits, and must
  not perturb models that already route correctly.
- Preserve `reasoning_effort` for responses-routed models. It is stripped on the
  Copilot chat route because that route rejects it alongside function tools; the
  Responses route accepts it, and it is the operative control for the reasoning models
  that are responses-only.
- Never inject chat-completions-only request fields (such as streaming usage options)
  into a responses-routed request.

## Acceptance criteria

- Discovery normalizes `supported_endpoints`, sets the route decision to `responses`
  only when the chat route is absent and the responses route present, and keeps
  `chat` for dual-endpoint and endpoint-less entries.
- A chat-type model advertising neither route is excluded.
- Registering a responses-routed model makes LiteLLM resolve that model's mode as
  `responses`, so its chat-completions call is bridged.
- The loader keeps `reasoning_effort` for responses-routed models and still strips it
  for chat-routed Copilot models.

Derived from: [SWR-2810 — Responses-endpoint-only models remain selectable](../800-model-registry.md)

Epic: [Model Registry](../800-model-registry.md)
