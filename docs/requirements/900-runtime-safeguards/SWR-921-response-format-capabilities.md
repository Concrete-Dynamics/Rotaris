---
req-id: SWR-921
status: approved
trace: required
test: required
type: technical
derived-from: SWR-919
title: "Per-model response-format capability resolution"
epic: SWR-900
date: 2026-08-23
---

# SWR-921 — Per-model response-format capability resolution

The structured-output ladders — the requirements judge and the intent
classifier — offer `json_schema`, then `json_object`, then no constraint, and
learn refusals at runtime (SWR-919). A refusal costs a full round trip, and for
a model that cannot honour a format at all that round trip is pure waste.

Per-model capability metadata answers the question ahead of time, in both
directions the runtime probe cannot:

- A provider that does not accept the `response_format` parameter at all is
  known from the transport's own per-model supported-parameter list — the same
  metadata source `supported_reasoning_levels` (SWR-852) already consults. Such
  a model must not be offered a typed rung it can only refuse.
- DeepSeek accepts the parameter but only the `json_object` value; its refusal
  is value-level ("This response_format type is unavailable now"), which
  parameter-level metadata cannot express, and it is exactly the model whose
  runtime refusal LiteLLM's own `supports_response_schema` misreports (see
  SWR-919). DeepSeek models therefore map a requested `json_schema` rung to
  `json_object` — a curated exception keyed on the provider.

SWR-919's refusal memory stays as the backstop: metadata that is absent,
unreadable, or wrong still learns from the provider's own refusal, and a model
that cannot be named is never changed by this resolver.

## Acceptance criteria

- One resolver maps a response-format ladder onto the rungs a named model
  accepts, and both the requirements judge and the intent classifier consume
  it.
- A DeepSeek model is never offered `json_schema`; the rung is replaced by
  `json_object`, and the resulting ladder is deduplicated.
- A model whose capability metadata is available and omits `response_format` is
  offered no typed rung; the unconstrained last rung always remains.
- Capability metadata that is absent or unreadable leaves the ladder untouched,
  so the SWR-919 runtime probe still governs.
- An unnamed model (no provider derivable from its id or configuration) is
  never changed by the resolver.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A workspace judges on DeepSeek: the strict schema is never sent, `json_object` is, and no refusal round trip happens | The resolver's DeepSeek mapping | `tests/unit/models/test_response_format_catalog.py`, `tests/unit/requirements/test_analysis_judge.py::test_a_deepseek_judge_never_offers_the_strict_schema_it_cannot_honour` |
| Unit | A model whose metadata omits `response_format` is offered only the unconstrained rung; a model whose metadata includes it keeps the ladder; unreadable metadata changes nothing | The resolver's capability consumption | `tests/unit/models/test_response_format_catalog.py` |
| Unit | The intent classifier's startup path maps DeepSeek the same way as the judge | The classifier's ladder construction | `tests/unit/test_intent_classifier.py::test_classifier_maps_json_schema_to_json_object_for_a_deepseek_model` |
| Unit | A refusal of the mapped `json_object` rung is still remembered and not re-offered (SWR-919 backstop) | Refusal memory after mapping | `tests/unit/requirements/test_analysis_judge.py::test_a_format_the_provider_refused_is_not_offered_to_it_again` |

Derived from: [SWR-919 — LLM runtime error classification](SWR-919-llm-error-classification.md)

Epic: [Runtime Safeguards](../900-runtime-safeguards.md)
