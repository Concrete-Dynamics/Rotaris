---
req-id: SWR-919
status: approved
trace: required
test: required
type: technical
derived-from: SWR-900
title: "LLM runtime error classification"
epic: SWR-900
date: 2026-07-20
---

# SWR-919 — LLM runtime error classification

The runtime safeguards (SWR-900) — usage-limit fallback (SWR-901/902/903),
retries, and condensation on bad requests — all depend on being able to tell
*what kind* of failure the LLM raised. This layer classifies raw LLM/SDK
exceptions and error strings into the categories those safeguards act on, so no
call site has to pattern-match provider error text itself. It carries no product
behavior of its own.

The classifier answers, at minimum:

- Is this a rate-limit / insufficient-quota / auth / transient runtime error?
- Is this the provider refusing the `response_format` it was offered, rather than
  failing the request?
- Should the request be condensed (bad-request due to context size)?
- What `retry-after` seconds, quota-exhausted model, or unsupported parameter can
  be extracted, and how should the failure detail be summarized for diagnostics?

A refused `response_format` is also *remembered*, per model, for the lifetime of
the process. Provider capability metadata cannot answer this — LiteLLM reports
`supports_response_schema` as true for models whose API rejects `json_schema` at
runtime — so the provider's own refusal is the only trustworthy source, and the
structured-output ladders that act on it would otherwise repeat the same wasted
round trip on every call.

## Acceptance criteria

- Rate-limit, quota, auth, and transient LLM errors are each classified from an
  exception or error string.
- A provider's refusal of a `response_format` is classified as such, in one place,
  rather than pattern-matched at each call site.
- A refused `(model, format)` pair is recorded and is not offered to that model
  again in the same process; another model is unaffected, and a caller that cannot
  name its model inherits no refusal.
- `retry-after`, quota-exhausted model, and unsupported-parameter details are
  extracted when present, and a human-readable failure summary is produced.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each error category is classified from an exception and from an error string, and the extractors return the detail or nothing | The classifier | `tests/unit/test_llm_errors.py` |
| Unit | A model that refuses `json_schema` is offered `json_object` on the next question; another model and an unnamed caller are unaffected | Classifier + the structured-output ladder | `tests/unit/requirements/test_analysis_judge.py::test_a_format_the_provider_refused_is_not_offered_to_it_again`, `::test_one_model_refusal_does_not_speak_for_another_model`, `::test_an_unnamed_judge_never_inherits_a_refusal_it_cannot_own` |

Derived requirements: [SWR-921 — Per-model response-format capability resolution](SWR-921-response-format-capabilities.md)

Derived from: [SWR-900 — Runtime Safeguards](../900-runtime-safeguards.md)

Epic: [Runtime Safeguards](../900-runtime-safeguards.md)
