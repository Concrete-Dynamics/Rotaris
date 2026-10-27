---
reference: ROTARIS-CRW-001
domain: ui-performance-benchmark
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# UI Performance Benchmark

## Overview

The desktop application carries a built-in UI performance benchmark. It captures the UI-visible portion of a persisted session into a self-checksummed JSON fixture, replays that fixture through the desktop application's own rendering path in fresh, environment-pinned, offscreen child processes, and reports timing, memory, responsiveness, and structural determinism metrics. Four operations — capture, replay, inspect, compare — support the workflow "capture once, replay on two product revisions, compare the runs", and all four are reached from the desktop interface and from nowhere else (REQ-UIBENCH-110, REQ-UIBENCH-111). Replay drives seven fixed workload phases per iteration (window construction, bulk state application, incremental appends, simulated token streaming, 1000 tail replacements, an idempotent re-application, and a resize sweep), records one JSON-lines metric record per phase, and derives per-run summaries containing raw values, percentile aggregates, robust memory-trend slopes, and seven boolean determinism, leak, and responsiveness invariants. The benchmark is a report generator, not a gate: invariant violations and crashed iterations are reported in the run summary and in the interface, and never make the operation that produced them fail.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`21-ui-performance-benchmark/`](21-ui-performance-benchmark/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](21-ui-performance-benchmark/01-requirements.md) | Requirements; Identity and desktop surface; Benchmark operations; The capture operation; Fixture format and validation; The replay operation — orchestration | REQ-UIBENCH-001 – REQ-UIBENCH-116 (50) |
| [02](21-ui-performance-benchmark/02-child-iteration-behavior.md) | Child iteration behavior; Replay phases; Per-record schema (run schema version 2); The inspect operation; Statistics semantics | REQ-UIBENCH-045 – REQ-UIBENCH-080 (38) |
| [03](21-ui-performance-benchmark/03-report-invariants.md) | Report invariants; The compare operation; Failure reporting and error inventory; Determinism and performance envelope; Edge cases | REQ-UIBENCH-081 – REQ-UIBENCH-109 (31) |
| [04](21-ui-performance-benchmark/04-data-formats.md) | Data & Formats; Benchmark surface; Session input (consumed by capture); Fixture file (schema version 1); Replay run directory; Iteration record file (JSON Lines, run schema version 2); Run summary (`summary.json` / the inspect report); `summary.md`; Comparison report (the compare report); Environment contract | — |
| [05](21-ui-performance-benchmark/05-open-questions.md) | Open Questions | — |
