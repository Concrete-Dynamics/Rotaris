---
req-id: SWR-920
status: approved
trace: required
test: required
type: technical
derived-from: SWR-900
title: "Per-model concurrency cap"
epic: SWR-900
date: 2026-07-23
---

# SWR-920 — Per-model concurrency cap

`SWR-900` covers guardrails against runaway runs, but does not say anything
about capping concurrent delegation to a single model. `ModelConfig.max_parallel`
(`src/rotaris_core/config/schema.py`) is an optional per-model concurrency cap: when
set, `RotarisDelegateExecutor` (`src/rotaris_core/orchestrator/delegate_tool.py`)
queues spawns that would exceed it into `WAITING_ON_MODEL_SLOT` instead of
rejecting them, and releases a queued child automatically once a running
sibling on the same model reaches a terminal state. The `deepseek` provider
triggers governor-rate 401s under high concurrency (ADR-016), so it gets a
default cap of 3 unless the operator sets `max_parallel` explicitly; all other
providers default to unlimited (`None`).

## Acceptance criteria

- `ModelConfig.max_parallel` defaults to `None` (unlimited) for non-`deepseek`
  providers.
- `ModelConfig.max_parallel` defaults to `3` when `provider == "deepseek"` and
  no explicit value was set.
- An explicitly configured `max_parallel` value always survives the
  provider-specific default (never overwritten by the validator).
- `max_parallel` rejects values below 1.
- When a model's active (non-terminal) child count is at `max_parallel`, a new
  delegation to that model is queued as `WAITING_ON_MODEL_SLOT` rather than
  rejected, and released to `QUEUED` once an active sibling on that model
  terminates.
- The cap is not checked when `max_parallel` is `None` or when no scheduler
  config is available; only non-terminal children count toward the cap.

Derived from: [SWR-900 — Runtime Safeguards & Cost Limits](../900-runtime-safeguards.md)

Epic: [Runtime Safeguards & Cost Limits](../900-runtime-safeguards.md)
