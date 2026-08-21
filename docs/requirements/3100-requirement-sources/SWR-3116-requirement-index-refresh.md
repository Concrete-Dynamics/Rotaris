---
req-id: SWR-3116
status: approved
trace: required
test: required
title: "Requirement index refresh is incremental and off the UI thread"
type: technical
derived-from: SWR-3101
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3116 — Requirement index refresh is incremental and off the UI thread

Reading and hashing a requirement store is filesystem work whose cost grows with
the store — this repository already carries more than 400 requirements across 30
epics — and every trigger in SWR-3210 causes a re-read. Doing that on the Qt
main thread would freeze the board, and re-reading everything for a one-file
change would waste most of it.

Requirement: the requirement index refreshes incrementally, keyed on each
source's `revision()` and on per-artefact modification identity, so an unchanged
artefact is neither re-read nor re-hashed. Refresh runs off the UI thread and
publishes a complete, consistent index; consumers never observe a half-built
one.

## Test coverage

Unit tests over the index cover the incremental path (an unchanged artefact is
not re-read; a changed one is), revision invalidation, and that a refresh
failure leaves the previous index intact. An integration test drives repeated
refreshes over a synthetic store and asserts the read count. The originating
product flow enabled by `derived-from` is the live board of SWR-3312.

Derived from: [SWR-3101 — Canonical requirement model](SWR-3101-canonical-requirement-model.md)

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
