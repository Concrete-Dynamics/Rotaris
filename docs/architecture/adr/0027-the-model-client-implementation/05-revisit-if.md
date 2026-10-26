# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Revisit if

Part 5 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Revisit if

The responses-dialect spike fails; or a provider's request needs a body the SDK cannot express even
through its request-body transform; or the SDK's usage record stops carrying a real provider
input-token count, which `REQ-MONITOR-081` depends on.
