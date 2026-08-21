---
req-id: SWR-865
status: approved
trace: required
test: required
type: technical
derived-from: SWR-800
title: "Process-wide LiteLLM streaming runtime policy"
epic: SWR-800
date: 2026-07-20
---

# SWR-865 — Process-wide LiteLLM streaming runtime policy

Rotaris drives LiteLLM as its model-execution backend (SWR-800). LiteLLM 1.x
schedules synchronous success logging for every streamed chunk on its global
executor, so a long stream can retain the executor's full worker pool even
though OpenHands — not LiteLLM — owns Rotaris's token callbacks, metrics, and
telemetry. To keep long model streams from exhausting that shared executor, the
product MUST apply a single, process-wide LiteLLM streaming policy before an LLM
run begins.

The policy:

- Disables LiteLLM's per-chunk streaming logging/cache path via the supported
  public switch, leaving OpenHands token metrics and telemetry active.
- Fails explicitly if the installed LiteLLM no longer exposes that public
  switch, rather than silently assigning an unknown attribute (which would
  appear to work while restoring the executor growth this policy prevents).
- Is applied once per process and announced once.

## Acceptance criteria

- `configure_litellm_runtime()` sets LiteLLM's supported streaming-logging
  switch and is idempotent/announced once.
- If the switch is unavailable on the installed LiteLLM, it raises a
  `RuntimeError` instead of silently continuing.

Derived from: [SWR-800 — Model Registry](../800-model-registry.md)

Epic: [Model Registry](../800-model-registry.md)
