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

| ID       | Title                              | Status   |
| -------- | ---------------------------------- | -------- |
| SWR-3001 | Cross-Platform Standalone Binaries | approved |
| SWR-3002 | Automated Release Pipeline         | approved |
| SWR-3003 | In-App Update Notification         | approved |

Building the artifacts: [`docs/reference/building-standalone.md`](../reference/building-standalone.md).
Cutting a release: [`docs/reference/releasing.md`](../reference/releasing.md).
How an installed copy updates itself: [`docs/reference/updating.md`](../reference/updating.md).

## History
