---
req-id: SWR-1639
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1612
title: "Captured post-run improvement lifecycle"
epic: SWR-1600
date: 2026-07-24
---

# SWR-1639 — Captured post-run improvement lifecycle

To preserve `SWR-1612` task completion semantics, the runtime MUST capture a
collector job from terminal-time progress, todo, transcript, child-report, and
workspace-history evidence. The job MUST be independently runnable after the
task state has been persisted, return its artifact/proposal outcome or
cancellation, and suppress artifact persistence when cancelled.

## Test coverage

Unit coverage verifies eligibility, frozen evidence, successful artifact
persistence, and cancellation suppression. Integration coverage verifies CLI
and Textual persist terminal task state before awaiting the captured job; the
Rotaris user flow covered by `SWR-2414` runs the same job in its background
worker.

Derived from: [SWR-1612 — Non-blocking task completion](../1600-improvement-loop.md)

Epic: [Post-Run Improvement Loop](../1600-improvement-loop.md)
