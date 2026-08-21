---
req-id: SWR-776
status: approved
trace: required
test: required
type: technical
derived-from: SWR-700
title: "Provider subscription-usage reads for quota display"
epic: SWR-700
date: 2026-07-20
---

# SWR-776 — Provider subscription-usage reads for quota display

To show users how much of their provider plan they have consumed, Rotaris
MUST be able to read the subscription/usage snapshot exposed by an
authenticated coding provider and normalize it into a provider-neutral shape a
progress display can render. This capability exists to serve provider
integration (SWR-700) and the provider-management surfaces (SWR-760/SWR-761,
SWR-774) without those surfaces needing provider-specific knowledge.

The reader:

- Fetches the per-provider usage snapshot from the officially used editor
  endpoints — Codex via `https://chatgpt.com/backend-api/wham/usage`, Copilot
  via `https://api.github.com/copilot_internal/user`, Claude Code via
  `https://api.anthropic.com/api/oauth/usage` (the endpoint backing Claude
  Code's own `/usage` display), presenting the stored subscription OAuth token
  as a bearer credential.
- Reports both Claude Code rolling windows — the 5-hour session window
  (`five_hour`) and the 7-day weekly window (`seven_day`) — each carrying its
  percentage used and when it resets.
- Normalizes each window into a `ProviderSubscriptionLimit`
  (`label`, `used_label`, `percent_used`, `detail`) ready for a meter/progress
  display.
- Treats provider failures as best-effort: a provider that cannot return usable
  data raises `SubscriptionUsageError` for the caller to degrade gracefully,
  never blocking the surface that requested it.

## Acceptance criteria

- `fetch_provider_subscription_limits` returns normalized limits for an
  authenticated provider and raises `SubscriptionUsageError` when a provider
  returns no usable data.
- Returned limits carry a display label, used label, integer percent, and a
  human-readable reset/detail string.

Derived from: [SWR-700 — Provider Integration & Authentication](../700-providers-auth.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)
