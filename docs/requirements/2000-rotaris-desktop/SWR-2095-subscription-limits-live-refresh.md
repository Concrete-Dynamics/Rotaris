---
req-id: SWR-2095
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2000
title: "Live refresh of subscription usage limits after reauthentication"
epic: SWR-2000
date: 2026-07-22
---

# SWR-2095 — Live refresh of subscription usage limits after reauthentication

The Overview dashboard's subscription usage card (Codex/Copilot) MUST reflect
the outcome of a successful provider re-authentication performed in Settings
without requiring an application restart. `WorkspaceStore.subscription_limits`
is otherwise computed once at startup with no poller, TTL, or file-watcher, so
a stale "Usage unavailable — Sign in to Codex…" card would persist indefinitely
after the user already signed back in.

## Acceptance criteria

- After `SettingsView` observes a successful (`connected`) reauthentication for
  a `codex` or `copilot` provider, it triggers a background refresh of
  subscription usage limits via `ConfigService.refresh_subscription_limits()`.
- The refresh runs off the Qt GUI thread (per SWR-2044); only the resulting
  store write and `settings_changed` emission happen back on the GUI thread.
- On completion, `WorkspaceStore.subscription_limits` is replaced with the
  freshly computed windows and `settings_changed` is emitted, which the
  Overview dashboard already consumes to re-render without further wiring.
- A failed or still-unauthenticated refresh degrades to the existing
  "Usage unavailable" card rather than raising or blocking the auth dialog.

Derived from: [SWR-2000 — Rotaris Desktop](../2000-rotaris-desktop.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
