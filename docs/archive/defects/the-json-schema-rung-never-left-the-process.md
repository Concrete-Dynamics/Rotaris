## REQ-ORCH-010's strict rung was dropped inside the adapter and no caller could tell

`AiSdkModelClient.languageModel()` built every openai-compatible model with
`createOpenAICompatible({ name, baseURL, includeUsage, fetch })` and no `supportsStructuredOutputs`.
The SDK reads that flag to decide what a JSON response format may carry. Without it, it does not
refuse the schema — it **warns and downgrades**:

```
warning: { type: 'unsupported', feature: 'responseFormat',
           details: 'JSON response format schema is only supported with structuredOutputs' }
body:    response_format: { type: 'json_object' }          // the schema is gone
```

So the first rung of REQ-ORCH-010's ladder reached no openai-compatible endpoint as a schema, on
any provider — OpenRouter, vLLM, anything on that dialect — while every layer above recorded the
call as having been made at `json_schema`. The classifier's rung-1 instruction is one sentence,
`Reply with the classification object only.`, deliberately naming no keys **because the schema was
meant to carry them**; what actually went out was bare JSON-object mode plus that sentence, which
is the one combination the ladder never intended to send. Rung 2 exists precisely to add the keys
and an example, and it was skipped by a rung that looked successful.

Nothing read the warning: `stream()` walked `result.fullStream` and ignored the `start-step` part
the SDK reports warnings on, so the downgrade left no trace in the log, the store or the run.
Observed on 2026-09-16, session `6696f6ed`, `z-ai/glm-5.3-flash` via OpenRouter.

Secondary: `isRungRejection` recognised only an HTTP 400 or 422, so even had the SDK failed the
call locally rather than downgrading it, the classifier would have fallen back to
`moderate_feature` instead of descending the ladder.

## Specs

- `REQ-ORCH-010` — structured output MUST be requested through the three-rung ladder, rung 1 being
  a strict, enum-constrained JSON schema. A rung that is replaced before the request leaves was
  never requested, and a rung a model has rejected MUST be remembered and skipped, which cannot
  happen while the rejection is invisible.
- `REQ-PROVIDER-089` — the openai-compatible dialect is the one the adapter speaks for these
  providers; the flag is how that dialect's structured output is enabled.
- `REQ-ORCH-092` — the new `unsupported_output` code falls in neither the transient nor the
  validation class and so fails a turn at once, which is what that requirement says about an
  unsupported request. The ladder, not a retry, is its recovery.

## Relevant files

- `packages/model/src/ai-sdk-client.ts` — `languageModel()` now passes
  `supportsStructuredOutputs: true`; `outputDowngrade()` (new) turns the SDK's warning into a
  `ModelError`; the `start-step` branch of the stream loop is where it is read.
- `packages/model/src/ports.ts` — `ModelError['code']` gains `unsupported_output`, with what it
  means and why it is neither class.
- `packages/engine/src/intent/classifier.ts` — `isRungRejection` accepts it, so a rung the adapter
  could not send descends exactly like a provider refusal.

## Known and left alone

`strictJsonSchema` defaults to `true` in the SDK, so the schema now goes out strict. A provider
that accepts `json_schema` but not `strict` will answer 400 or 422 and the ladder will descend,
which is the specified behaviour rather than a special case. No pre-mapping is wired
(`RungMemory`'s preset stays available and unused): REQ-ORCH-010 permits it and nothing needs it
once rung 1 is honest.

## Repaired — 2026-09-16

Regression tests: `packages/model/src/ai-sdk-client.test.ts` — "REQ-ORCH-010: the strict rung
leaves as a schema, and a rung the SDK drops is read back as a rejection", which reads the request
body a fake `fetch` receives and asserts `response_format.type === 'json_schema'` with the schema
in it, then drives `outputDowngrade` over both warning spellings, an unrelated warning, and a
non-schema rung. `packages/engine/src/intent/intent.test.ts` — "a rung the adapter could not send
descends exactly like a provider refusal", which asserts the descent, the remembered rung and the
warning line.

The live half is owed: only a real endpoint proves the schema is accepted rather than merely sent,
and `pnpm live-run` spends the owner's money, so it was not run.

**Falsified in part, 2026-10-13 (OQ-258, fin38).** The reason given above for rung 1's one sentence — "deliberately naming no keys
**because the schema was meant to carry them**" — does not hold for a reasoning model, which never sees `response_format` while it
reasons: at `552d346` the duress classification chose its category and was cut at the 12 s bound deliberating which key to write
it under, and three of the default pack's four cuts did the same (findings V3 and Q2). The strict rung now names the three keys,
without rung 2's example
([`the-intent-classifiers-strict-rung-never-names-the-objects-keys`](the-intent-classifiers-strict-rung-never-names-the-objects-keys.md)).
The text above is kept as written; the adapter's repair it records stands.
