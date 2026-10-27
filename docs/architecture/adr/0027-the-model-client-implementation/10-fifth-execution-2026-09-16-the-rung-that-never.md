# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Fifth execution — 2026-09-16, the rung that never left the process (REQ-ORCH-010, REQ-PROVIDER-089)

Part 10 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Fifth execution — 2026-09-16, the rung that never left the process (REQ-ORCH-010, REQ-PROVIDER-089)

*Found by reading one plan-mode run's log against OpenRouter (`z-ai/glm-5.3-flash`, session `6696f6ed`), not by a
test. One defect, pre-existing, and one thing this record said about the port that was never true in practice.*

**Found — the structured-output rung was replaced inside the adapter (defect, pre-existing).** The port's own
comment said "a provider that rejects the rung fails the request with an HTTP error the caller reads", and the
first execution took the SDK's `output` mapping as delivery of REQ-ORCH-010's rung 1. Neither is what happens on
the openai-compatible dialect without `supportsStructuredOutputs`: the SDK **warns and downgrades**, sending
`response_format: { type: 'json_object' }` with the schema discarded, and the call succeeds. So rung 1 reached no
openai-compatible endpoint as a schema on any provider, and every layer above recorded a `json_schema` call that
never happened. The classifier is where it showed: its rung-1 instruction names no keys *because the schema was
meant to*, so what went out was bare JSON-object mode with a one-sentence prompt — the single combination the
ladder was built to avoid, and rung 2 exists to supply.

Kept beside its replacement: the port's sentence is true of a provider's refusal and silent about the adapter's
own. `supportsStructuredOutputs: true` is now passed, so the schema leaves as a schema and an endpoint that
cannot take it answers 400 or 422, which `isRungRejection` already reads. The warning path is read too rather
than assumed gone — `outputDowngrade()` inspects the `start-step` part's `warnings`, which `stream()` had never
looked at, and yields `unsupported_output`, a code that is neither of REQ-ORCH-092's classes and descends the
ladder instead of retrying.

**The instrument held the gap, again — the same way as the fourth execution.** Every adapter test asserted what
came *back* from a fake `fetch`; none had ever asserted what went *out* in the request body, which is the only
place this was visible. The new proof reads the body.

**Not measured here.** That the schema is now *accepted* by a real provider, rather than merely sent, needs
`pnpm live-run` against a real key. It spends the owner's money and was not run; the request-body assertion is
what this execution proves.
