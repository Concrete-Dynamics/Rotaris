---
req-id: SWR-2418
status: approved
trace: required
test: required
title: "Responsive deep memory profiling"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2418 — Responsive deep memory profiling

Rotaris deep diagnostics MUST keep the desktop usable during long, allocation-heavy analysis by
limiting Python allocation tracing to bounded sampling windows. Between windows, deep diagnostics
MUST impose no `tracemalloc` allocation instrumentation. Each completed window MUST preserve a
bounded, sanitized ranking of source locations responsible for retained memory growth, and the
run summary MUST expose the largest sampled growth sites.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A developer enables deep diagnostics without paying continuous allocation-tracing overhead. | `LiveDiagnostics` tracing ownership, sampling, coalescing, and summary decisions. | `apps/rotaris/tests/test_diagnostics.py` |
| Integration | A bounded sampling window writes sanitized culprit evidence and releases tracing afterward. | Real `tracemalloc`, diagnostics worker, and filesystem artifacts. | `apps/rotaris/tests/test_diagnostics.py` |
| User-flow E2E | A desktop user runs deep diagnostics, receives Qt heartbeats during a memory-growth sample, and gets a culprit summary. | Real PySide6 window with live diagnostics and controlled allocations. | `apps/rotaris/tests/test_diagnostics.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
