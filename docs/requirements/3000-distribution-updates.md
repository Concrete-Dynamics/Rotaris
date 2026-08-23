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
| SWR-3720 | Release artifacts carry complete third-party notices                | approved |
| SWR-3722 | Official download page discloses automatic network access           | draft    |
| SWR-3724 | Standalone distributions carry the pinned Serena runtime             | approved |

## SWR-3715 — A bundled install provisions the machine once, before the app opens

SWR-3001 ships Python and its dependencies, and SWR-3724 adds Serena to that
bundle. The managed external programs are `git` and `rg`; `npx` is a
user-provided prerequisite for optional JavaScript MCP servers. The first launch
after a bundled install provisions missing managed tools under the per-user data
directory and warms configured external MCP caches when their runner is present,
shows an ordered step list with per-step timings and a details log, and then starts
the application. Every later launch skips it; a failure degrades a feature rather
than blocking the app.

Full requirement: [SWR-3715 — A bundled install provisions the machine once, before the app opens](3000-distribution-updates/SWR-3715-first-run-machine-setup.md)

## SWR-3720 — Release artifacts carry complete third-party notices

Standalone artifacts must ship a third-party notice inventory that covers the
components and assets actually included in the delivered application rather than
assuming the Python dependency graph is the complete product inventory.

Full requirement: [SWR-3720 — Release artifacts carry complete third-party notices](3000-distribution-updates/SWR-3720-complete-third-party-notices.md)

## SWR-3722 — Official download page discloses automatic network access

The official product website exposes the automatic first-run provisioning and
launch-time update-check behaviour through a compact, optional information control
at the download surface. The disclosure must not turn the download hero into a
legal notice or add a blocking consent step. GitHub Release pages are deliberately
not part of this consumer-facing disclosure requirement.

Full requirement: [SWR-3722 — The official download page discloses automatic network access without degrading the download UX](3000-distribution-updates/SWR-3722-website-download-network-disclosure.md)

## SWR-3724 — Standalone distributions carry the pinned Serena runtime

Standalone artifacts carry the exact Serena release used by the default MCP
configuration. Serena launches from the installed artifact, and first-run
machine setup no longer installs `uv` or warms a Serena package cache.

Full requirement: [SWR-3724 — Standalone distributions carry the pinned Serena runtime](3000-distribution-updates/SWR-3724-bundled-serena-runtime.md)

Building the artifacts: [`docs/reference/building-standalone.md`](../reference/building-standalone.md).
Cutting a release: [`docs/reference/releasing.md`](../reference/releasing.md).
How an installed copy updates itself: [`docs/reference/updating.md`](../reference/updating.md).

## History
