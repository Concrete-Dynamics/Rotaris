---
req-id: SWR-3725
status: approved
trace: required
test: required
title: "Global external-hook catalog"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3725 — Global external-hook catalog

Rotaris Settings lets a user discover compatible command hooks from their global
Claude Code configuration, inspect them by agent, and enable or disable an entire
agent or an individual hook for future Rotaris sessions. Rotaris persists that
runtime policy globally while preserving the agent configuration file and
workspace trust safeguards.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user's Claude configuration is parsed into stable compatible and explained inactive hook records. | Claude adapter and policy store | `tests/unit/test_external_hooks.py` |
| Integration | A user's global policy selects imported hooks for a new run while disabled records never reach the runner. | Catalog and run-host hook construction | `tests/integration/test_external_hooks_flow.py` |
| User-flow E2E | A desktop user toggles a Claude Code agent and one of its hooks, refreshes Settings, and sees the durable effective state. | Rotaris Settings UI and global policy store | `apps/rotaris/tests/test_external_hook_catalog.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
