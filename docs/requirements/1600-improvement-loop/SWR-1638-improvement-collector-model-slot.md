---
req-id: SWR-1638
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1602
title: "Improvement Collector dedicated model slot"
epic: SWR-1600
date: 2026-07-23
---

# SWR-1638 — Improvement Collector dedicated model slot

`SWR-1602` requires the Improvement Collector to be model-backed but does not
say which model it uses. `improvement_collector_model` is a startup model slot
(`rotaris_core.config.startup_models.STARTUP_MODEL_FIELDS`) that can be set and
persisted like the other startup slots, with an independent thinking-level
override (`improvement_collector_model_thinking`). When unset, callers fall
back to `medium_model` so the collector always has a usable model without
requiring explicit configuration.

## Acceptance criteria

- `improvement_collector_model` is listed in `STARTUP_MODEL_FIELDS`.
- Writing and reading startup model preferences round-trips a configured
  `improvement_collector_model` value.
- `improvement_collector_model_thinking` round-trips independently of the base
  model slot.
- When `improvement_collector_model` is unset, `RotarisConfig.improvement_collector_model`
  is `None` and callers fall back to `medium_model`.

Derived from: [SWR-1602 — Improvement Collector](../1600-improvement-loop.md)

Epic: [Improvement Loop](../1600-improvement-loop.md)
