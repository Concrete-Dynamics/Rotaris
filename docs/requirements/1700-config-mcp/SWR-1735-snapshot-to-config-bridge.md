---
req-id: SWR-1735
status: approved
trace: required
test: required
type: technical
derived-from: [SWR-770, SWR-2813]
title: "Snapshot models reach the config without overruling what the user set"
epic: SWR-1700
date: 2026-08-28
---

# SWR-1735 — Snapshot models reach the config without overruling what the user set

The snapshot SWR-1734 keeps is only useful once `load_config()` turns it into
models a persona can name. That bridge sits between two requirements and is
stated by neither: [SWR-770](../700-providers-auth.md) ends at the stored
metadata, and [SWR-2813](../800-model-registry/SWR-2813-model-availability-metadata.md)
describes availability metadata without saying where in the config precedence
chain it lands.

`load_config()` (`src/rotaris_core/config/loader.py`) must therefore:

- **Synthesize, not dictate.** Each snapshot provider contributes its discovered
  models — with their token limits, pricing and routing metadata — as a config
  scope layered *under* the global and workspace scopes. A provider with zero
  models contributes nothing.
- **Yield to the user everywhere.** A model id the user declared in
  `agents.yaml` wins over the snapshot entry of the same id, and a user-set tier
  alias (`large_model`, `medium_model`, `small_model`, `fallback_model`,
  `default_summary_model`) wins over the snapshot's. The snapshot fills a tier
  only where the user left it unset, and where neither speaks the built-in
  startup defaults stand.
- **List what it cannot configure.** A model the provider marks unavailable
  stays visible with its reason and is never configured; requesting it fails
  naming that reason. A model the user declared explicitly stays configured even
  when the provider rejects it.
- **Degrade instead of failing.** A malformed snapshot logs a warning and leaves
  `load_config()` returning the defaults; a workspace with no snapshot keeps the
  default model set.

## Test coverage

Integration coverage at the loader boundary, in
`tests/unit/config/test_loader_snapshot_bridge.py`: synthesis per provider
family, token limits and pricing forwarded to LiteLLM, both routing variants,
tier-alias bridging and every user-wins case, unavailable-model listing and its
failure message, the malformed-snapshot fallback, and availability surviving a
write/read cycle. The product flows this serves — a signed-in user picks a
discovered model, and an unusable model explains itself rather than vanishing —
are covered through `derived-from` SWR-770 and SWR-2813.

Derived from: [SWR-770 — Providers & Auth](../700-providers-auth.md),
[SWR-2813 — Model availability metadata from discovery to configuration](../800-model-registry/SWR-2813-model-availability-metadata.md)

Epic: [Configuration & MCP](../1700-config-mcp.md)
