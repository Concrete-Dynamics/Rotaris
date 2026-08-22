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
pipeline and an in-app update mechanism that notifies users when a newer version
is available on GitHub Releases.

## Requirements

| ID       | Title                                                            | Status   |
| -------- | ---------------------------------------------------------------- | -------- |
| SWR-3001 | Cross-Platform Standalone Binaries                               | approved |
| SWR-3002 | Automated Release Pipeline                                       | approved |
| SWR-3003 | In-App Update Notification                                       | approved |
| SWR-3715 | A bundled install provisions the machine once, before the app opens | draft    |

## SWR-3715 — A bundled install provisions the machine once, before the app opens

SWR-3001 ships Python and its dependencies but not the external programs Rotaris
shells out to — `git`, `uvx`, `npx`, `rg`. The first launch after a bundled install
provisions what is missing under the per-user data directory, warms the MCP caches,
shows an ordered step list with per-step timings and a details log, and then starts
the application. Every later launch skips it; a failure degrades a feature rather
than blocking the app.

Full requirement: [SWR-3715 — A bundled install provisions the machine once, before the app opens](3000-distribution-updates/SWR-3715-first-run-machine-setup.md)

Building the artifacts: [`docs/reference/building-standalone.md`](../reference/building-standalone.md).
Cutting a release: [`docs/reference/releasing.md`](../reference/releasing.md).
How an installed copy updates itself: [`docs/reference/updating.md`](../reference/updating.md).

## History
