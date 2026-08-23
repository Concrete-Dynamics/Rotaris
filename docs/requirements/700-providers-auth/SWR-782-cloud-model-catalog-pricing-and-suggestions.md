---
req-id: SWR-782
status: approved
trace: required
test: required
type: technical
derived-from: SWR-745
title: "Rotaris Cloud catalog pricing and model suggestions"
epic: SWR-700
date: 2026-08-23
---

# SWR-782 — Rotaris Cloud catalog pricing and model suggestions

The authenticated Rotaris Cloud catalog is the authoritative source for the
models an account may select, their current customer-facing token prices, and
the administrator-curated startup-role recommendations. Rotaris must use the
read-only `GET /v1/models` and `GET /v1/model-suggestions` endpoints during
Rotaris Cloud discovery and refresh; it must not scrape portal data or infer
prices from model names.

For every discovered Cloud model, persist the sanitized display name, context
limit, capabilities, and the optional prompt and completion USD-per-token prices
from `pricing.prompt_usd_per_token` and `pricing.completion_usd_per_token`.
Prices are optional: a missing, non-string, negative, or non-finite price leaves
that side unconfigured rather than inventing a cost. Valid prices are passed to
the existing LiteLLM custom-pricing fields when the model is loaded.

The client must also read the suggestion snapshot. Its four stable roles
`small`, `medium`, `large`, and `fallback` are advisory defaults only. A
suggested id is used only when it occurs in the authenticated `/v1/models`
snapshot; absent, malformed, null, or unknown suggestions fall back to the
existing local tier picker. The server never receives a client-selected model
back, and suggestions do not change completion admission or dispatch behavior.

Both endpoint reads use the stored Rotaris Cloud bearer credential and API base.
An unavailable or malformed suggestions endpoint must not discard a valid model
catalog: discovery persists the catalog and uses the existing local picker.
Catalog failure still has the existing discovery failure semantics.

## Acceptance criteria

- A Cloud discovery response preserves valid customer-facing prompt/completion
  token prices and model metadata into the model configuration used by LiteLLM.
- A valid suggestions response supplies the four Cloud startup slots when its
  ids occur in the discovered catalog; an unknown or null role does not replace
  the existing deterministic picker result.
- Refresh and login use the same catalog-plus-suggestions behavior.
- A suggestions read failure degrades to normal model discovery and does not
  remove an already authenticated provider or invent prices or defaults.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A signed-in Cloud user refreshes a priced catalog with curated roles | Mocked `/v1/models` and `/v1/model-suggestions` → discovery result → snapshot/config | `tests/unit/providers/test_discovery.py`, `tests/unit/cli/test_model_refresh.py`, `tests/unit/config/test_loader_snapshot_bridge.py` |
| Integration | A Cloud user completes login and gets usable recommended startup models with billing telemetry configured | Authenticated discovery → persisted snapshot → `load_llm_for_model` | `tests/integration/test_cloud_account_refresh.py` |

Derived from: [SWR-745 — Concrete Cloud provider](../700-providers-auth.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)