---
req-id: SWR-2125
status: approved
trace: required
test: required
title: "Provider list starts empty except a hardcoded Rotaris Cloud quick-start row"
epic: SWR-2000
date: 2026-07-22
---

# Provider list starts empty except a hardcoded Rotaris Cloud quick-start row

The Rotaris Settings → Providers list shall show no built-in or referenced-but-unauthenticated
provider by default. A provider row shall only appear once the user has authenticated it
(via "Add endpoint" for a custom OpenAI-compatible endpoint, or via an existing built-in
provider's own auth flow) — a model slot merely referencing a provider, including one whose
custom endpoint was since deleted, must not resurrect a row for it. The one exception is
Rotaris Cloud (`concrete-cloud`), which is always present regardless of authentication state,
rendered as a simplified row with a single "Quick Start" button (styled with a yellow border)
that opens `https://concrete-dynamics.com/rotaris` in the system browser instead of the normal
Check/Authenticate/Log out/Delete controls.

## Acceptance criteria

- `ConfigService._providers()` returns only providers with `authenticated=True` from
  `list_provider_settings()`, plus an unconditional Rotaris Cloud entry; it no longer
  re-derives provider rows from `config.models` references.
- `ProviderInfo` carries an optional `quick_start_url`; when set, `SettingsView` renders
  only a "Quick Start" button for that row (no Check/Authenticate/Log out/Delete), wired
  to `QDesktopServices.openUrl`.
- Deleting a user-defined OpenAI-compatible endpoint removes its row from the list
  (verified end-to-end through `ConfigService`, not just the deletion function).
