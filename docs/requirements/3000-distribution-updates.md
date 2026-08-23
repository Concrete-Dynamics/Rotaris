---
req-id: SWR-3000
status: draft
trace: optional
test: optional
title: "Distribution & Updates"
---

# SWR-3000 — Distribution & Updates

Publish Rotaris as platform-native standalone binaries for Windows, macOS, and
Linux in addition to the existing pip packages, with an automated CI/CD release
pipeline and an in-app update mechanism that checks for newer versions on launch
and notifies users when one is available on GitHub Releases.

## Requirements

| ID       | Title                                                               | Status   |
| -------- | ------------------------------------------------------------------- | -------- |
| SWR-3001 | Cross-Platform Standalone Binaries                                  | approved |
| SWR-3002 | Automated Release Pipeline                                          | approved |
| SWR-3003 | In-App Update Notification                                          | approved |
| SWR-3715 | A bundled install provisions the machine once, before the app opens | approved |
| SWR-3720 | Release artifacts carry complete third-party notices                | draft    |

## SWR-3715 — A bundled install provisions the machine once, before the app opens

SWR-3001 ships Python and its dependencies but not the external programs Rotaris
shells out to — `git`, `uvx`, `npx`, `rg`. The first launch after a bundled install
provisions what is missing under the per-user data directory, warms the MCP caches,
shows an ordered step list with per-step timings and a details log, and then starts
the application. Every later launch skips it; a failure degrades a feature rather
than blocking the app.

Full requirement: [SWR-3715 — A bundled install provisions the machine once, before the app opens](3000-distribution-updates/SWR-3715-first-run-machine-setup.md)

## SWR-3720 — Release artifacts carry complete third-party notices

Standalone artifacts must ship a third-party notice inventory that covers the
components and assets actually included in the delivered application rather than
assuming the Python dependency graph is the complete product inventory.

Full requirement: [SWR-3720 — Release artifacts carry complete third-party notices](3000-distribution-updates/SWR-3720-complete-third-party-notices.md)

Building the artifacts: [`docs/reference/building-standalone.md`](../reference/building-standalone.md).
Cutting a release: [`docs/reference/releasing.md`](../reference/releasing.md).
How an installed copy updates itself: [`docs/reference/updating.md`](../reference/updating.md).

## History