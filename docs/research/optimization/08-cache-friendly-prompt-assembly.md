# Cache-Friendly Prompt Assembly

Construct stable prompt regions while preserving current facts, correct message history, and provider-specific cache behavior.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Reduce avoidable prompt-prefix churn by treating prompt construction as a deterministic build process. Keep stable instructions and tool contracts stable; place changing task state and results in explicitly dynamic regions when the provider's API permits it.

OpenAI documents prefix-based prompt caching and the importance of consistent tool definitions and ordering [1]. Exact serialization, cacheable lengths, retention, routing, and supported controls are provider-specific. This guide does not promise a cache hit merely because an application computes the same text hash.

Prompt caching reuses model computation. It is distinct from caching tool results, truncating context, or suppressing repeated evidence.

## 2. Design contract and invariants

Equivalent prompt inputs MUST produce a deterministic application-level representation. Semantically changed instructions, schemas, and project guidance MUST be reflected immediately even if they reduce cache reuse.

Never retain stale facts just to preserve a prefix. Never reorder user/assistant/tool messages in a way that changes meaning or breaks call/result pairing. Do not add useless padding solely to reach an assumed caching threshold.

Track the difference between the harness's prefix fingerprint and provider-reported cached tokens. Hidden serialization or settings may affect caching beyond what the harness observes.

## 3. Data model and tool interface

```text
PromptManifest {
  profile_version, model_and_adapter_profile,
  instruction_artifacts[], project_guidance_versions[],
  tool_manifest_id, static_region_fingerprint,
  dynamic_state_version, history_boundary, ordered_message_references[]
}
PromptTelemetry {
  request_id, prompt_manifest_id, input_tokens,
  cached_input_tokens?, output_tokens, latency,
  schema_tokens_estimate, prefix_change_reason?
}
```

```text
assemble_prompt(static_inputs, tool_manifest, dynamic_state, history)
explain_prefix_change(previous_manifest, current_manifest)
record_provider_usage(request_id, usage)
```

The conceptual layout is:

```text
Stable instructions and durable project conventions
Stable tool definitions in the provider's prescribed representation
Current task/checkpoint and changing repository context
Chronological recent conversation and tool results
```

This is an application organization, not a guarantee that a provider physically serializes fields in this exact order. The adapter owns that translation.

## 4. Implementation workflow

Version static instruction artifacts and render them without random identifiers, timestamps, or nondeterministic map traversal. Record source digests so a real instruction update triggers an intentional prefix change.

Give tool definitions stable qualified names and deterministic order. Canonicalize unordered application metadata when computing diagnostic fingerprints. Do not casually canonicalize message content or arrays whose order has meaning. For cross-language canonical JSON hashing, use an explicit scheme rather than implementation-default serialization [2].

Separate volatile metadata such as current time, working-tree status, token budget, and active processes from durable instructions. Include volatile facts where needed for correctness, ideally later in a supported message position.

Append new conversation items without rewriting old results just to restyle them. If the provider supports server-managed conversation state, follow its ordering and lifecycle contract. Preserve exact tool-call identifiers and their corresponding results.

Coordinate lazy loading with the provider adapter. Some APIs support appending loaded tool definitions without replacing earlier context; others receive the entire current schema list in an early field. In the latter case, adding a schema may invalidate a reusable prefix. Batch related additions and avoid unnecessary unload/reload churn, but do not hide a required capability.

When context compaction is necessary, create an explicit new prompt generation with a checkpoint and retained recent history. Treat its cache warmup as a normal transition. Do not keep unsafe or irrelevant history indefinitely just to avoid a cold prefix.

## 5. Reference pseudocode

```text
function assemble(inputs):
    static = render_versioned_artifacts(inputs.static_artifacts)
    tools = render_contracts_in_stable_order(inputs.tool_manifest)
    dynamic = render_current_state(inputs.current_state)
    history = preserve_protocol_order(inputs.history)
    request = provider_adapter.compose(static, tools, dynamic, history)
    manifest = fingerprint_application_regions(request, inputs.versions)
    validate_call_result_pairing(request)
    return request, manifest

function observe(previous, current, provider_usage):
    reasons = diff_prompt_manifests(previous, current)
    record(reasons, provider_usage.input_tokens,
           provider_usage.cached_input_tokens, provider_usage.latency)
```

The fingerprint is diagnostic instrumentation. It cannot certify how many tokens the provider reused internally.

## 6. Worked example

A harness originally places a new timestamp and random run UUID before ten thousand tokens of unchanged project instructions on every request. The revised assembler moves those volatile fields into current task metadata and keeps the instruction artifact unchanged.

The next requests retain a longer stable application prefix. Telemetry then determines whether the provider actually reports greater reuse. When the project changes its coding convention, the instruction version changes and the resulting cache miss is correct.

A subsequent tool load adds a deployment schema. On a provider that serializes all tools early, this may shorten the matching prefix. The harness records `prefix_change_reason="tool_manifest_changed"` rather than misdiagnosing it as random cache instability.

## 7. Failure modes and recovery

| Condition | Meaning | Recovery |
|---|---|---|
| Stable application hash, low provider reuse | Provider serialization, routing, eviction, or settings differ. | Inspect supported usage fields and adapter behavior. |
| Timestamp-induced prefix churn | Volatile metadata appears too early. | Move it to a supported dynamic region. |
| Tool order varies | Nondeterministic schema rendering. | Sort by stable identifiers or preserve a stable manifest order. |
| Stale instruction cached intentionally | Correctness sacrificed for reuse. | Update immediately and accept invalidation. |
| Compaction breaks call/result pairing | History transformation violates API contract. | Rebuild from a validated checkpoint boundary. |
| Cache fields unavailable | Provider does not report comparable metrics. | Mark reuse unknown; do not invent a hit rate. |

## 8. Integration and lifecycle

Use [lazy tool loading](07-lazy-tool-discovery-and-loading.md) with explicit schema-change telemetry. Put [repository map](05-structural-repository-maps.md) queries and [diagnostic deltas](04-diagnostic-fingerprints-and-deltas.md) into dynamic context rather than repeatedly regenerating a supposedly static prefix.

[Execution checkpoints](11-execution-checkpoints.md) define restart boundaries. [Tool-result caching](10-version-aware-tool-result-caching.md) operates independently: a cached read still has to be represented correctly in the conversation.

Retain prompt manifests for debugging without necessarily duplicating complete sensitive prompts in telemetry. Prefix reuse must respect the application's existing isolation scope. Provider routing keys, when available, should follow documented behavior and must not be treated as a storage or authorization mechanism.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Same static inputs | Byte-stable application rendering. |
| Different map iteration order | Tool/schema rendering remains stable. |
| New timestamp/current state | Static region remains unchanged. |
| Actual policy/schema update | New content is included and fingerprint changes. |
| Historical tool result appended | Earlier call/result items are not rewritten. |
| Required tool added | Manifest changes intentionally and capability works. |
| Compaction | New context is valid even if cache starts cold. |
| Cross-provider adapter | No assumptions about identical physical field order. |
| Missing usage fields | Metrics report unknown rather than zero. |
| Contradictory stale guidance | Current authoritative instruction wins over cache preservation. |

## 10. Metrics and rollout

Measure provider-reported cached-input share as a ratio of summed cached tokens to summed input tokens over comparable requests. Also record total cost under actual provider pricing, latency, static-prefix churn, and task success. Do not average per-request hit ratios when request sizes differ substantially.

Establish a deterministic assembly baseline before tuning routing or retention options. Compare complete runs, including cold starts, tool-loading changes, and compaction. Avoid citing a provider's maximum advertised discount as an achieved saving.

## 11. Implementation checklist

- [ ] Version and deterministically render durable instruction artifacts.
- [ ] Preserve stable tool contracts and explicit manifest changes.
- [ ] Separate dynamic facts without dropping necessary context.
- [ ] Preserve protocol-valid chronological message history.
- [ ] Instrument application fingerprints and actual provider usage separately.
- [ ] Test real updates, tool loading, and compaction boundaries.

## 12. References and further reading

[1] [OpenAI, Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) - current provider behavior and integration controls. Verify model/API-specific details during implementation.

[2] [RFC 8785, JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) - an explicit cross-language canonicalization option for supported JSON data. It does not prescribe prompt message ordering or provider cache serialization.
