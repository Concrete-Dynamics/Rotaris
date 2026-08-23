---
req-id: SWR-783
status: approved
trace: required
test: required
title: "Rotaris Cloud stays visible as Coming soon until service readiness"
epic: SWR-700
date: 2026-08-24
---

# SWR-783 — Rotaris Cloud stays visible as Coming soon until service readiness

While the Rotaris Cloud service is unavailable for public use, every provider
selection surface shall keep Rotaris Cloud visible in first position, present a
clear `Coming soon` state, and prevent authentication, health checks, and other
network-starting provider actions. Selecting Rotaris Cloud from the CLI shall
return a concise `Rotaris Cloud is coming soon.` result without starting an
authentication or network flow. Other providers remain selectable and usable.

## Acceptance criteria

- **AC-001:** Rotaris Cloud remains first in provider displays and carries a
  visible `Coming soon` state.
- **AC-002:** Desktop Rotaris disables Rotaris Cloud authentication, quick-start,
  and health-check actions and explains that the provider is coming soon.
- **AC-003:** CLI login lists Rotaris Cloud and rejects its selection with the
  same explanation before authentication or network activity begins.
- **AC-004:** Availability metadata comes from the provider catalog so desktop
  and CLI behavior share one readiness source.
- **AC-005:** Other built-in and custom providers retain their existing
  authentication and selection behavior.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A caller reads catalog readiness and CLI login rejects Rotaris Cloud before authentication | Provider catalog and CLI provider resolution | `tests/unit/providers/test_catalog.py`, `tests/unit/cli/test_auth_flow.py` |
| Integration | Settings projects catalog readiness into a disabled provider row with an explanation | `ConfigService` → `WorkspaceStore` → Settings provider row | `apps/rotaris/tests/test_services.py` |
| User-flow E2E | A user opens Settings → Providers, sees Rotaris Cloud as Coming soon, and cannot start a cloud operation while another provider remains actionable | Real `MainWindow` driven through accessible controls | `apps/rotaris/tests/test_cloud_coming_soon_flow.py` |

Related: [SWR-745 — Rotaris Cloud as a first-class built-in provider](../700-providers-auth.md), [SWR-747 — Rotaris Cloud appears first](../700-providers-auth.md)

Epic: [Provider Authentication](../700-providers-auth.md)
