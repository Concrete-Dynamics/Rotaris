# Version-Aware Tool-Result Caching

Reuse safe computations without serving stale source, hiding changed dependencies, or confusing memoization with mutation idempotency.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Avoid recomputing identical reads, parses, maps, and other expensive observations when their complete inputs are unchanged. A cache entry must explain exactly which inputs and freshness assumptions make it reusable.

Bazel distinguishes an action-result cache from a content-addressable store and models action inputs explicitly [1]. HTTP caching distinguishes freshness and validation [2]. These are useful reference models; this guide specifies an agent-harness policy independently of either protocol.

Read-only does not mean pure. Idempotent does not mean cacheable. A read of current time changes without side effects; setting a value may be idempotent while still requiring real execution against current state.

## 2. Design contract and invariants

A reusable key MUST include every relevant explicit and implicit input: normalized arguments, implementation/schema version, resource versions, execution environment, and caller scope where results differ.

The result MUST correspond to the versions in its key. It is unsafe to read a file at version A, let it change, and cache bytes from B under A. Capture a coherent snapshot or validate versions around the computation.

A cache hit MUST disclose original observation time and input versions. Reusing backend data does not mean the model has already seen it, and it does not suppress the current tool-call response.

Mutation deduplication uses an operation/idempotency ledger, not ordinary result caching. Never skip a side-effecting call merely because an equal argument object occurred earlier.

## 3. Data model and tool interface

```text
CachePolicy = PURE | VERSIONED | TTL | VOLATILE | SIDE_EFFECT
CacheEntry {
  key, tool_contract_version, implementation_version,
  canonical_arguments, dependency_manifest,
  scope_id, created_at, expires_at?, result_reference,
  outcome, completeness, cache_profile
}
```

| Policy | Validity rule | Example |
|---|---|---|
| `PURE` | All inputs are explicit immutable values/references. | Parse fixed source bytes with a pinned parser. |
| `VERSIONED` | All external dependencies match captured versions. | Read a source snapshot or map a known manifest. |
| `TTL` | Age bound is acceptable for this use case. | Non-critical remote metadata. |
| `VOLATILE` | No safe reuse rule is available. | Current process state or live working-tree status. |
| `SIDE_EFFECT` | Execute through effect semantics, not memoization. | Write, deploy, send, install. |

```text
execute_with_cache(tool, arguments, context)
inspect_cache_entry(key)
invalidate_dependencies(resource_ids_or_versions)
```

Canonical arguments must apply defaults consistently while preserving meaningful distinctions between missing, null, empty, ordered, and unordered values. Use a documented canonical encoding profile [3]. Hashing a randomly serialized object is not a cross-language key contract.

## 4. Implementation workflow

Classify each tool explicitly. Default unknown tools to volatile or side-effecting rather than assuming they are cacheable. Document the dependency manifest required by each cacheable operation.

Resolve coherent input snapshots and environment metadata before looking up versioned results. Include parser/compiler versions, locale, relevant configuration, working directory, dependency lockfiles, and scoped remote identity when they affect output. Avoid placing raw credentials in keys or logs; use established scope identifiers and relevant credential-generation metadata.

Build the canonical key and check entry freshness, retained payload availability, and schema compatibility. A TTL is an allowed staleness policy, not proof that source is current. Never use a TTL-only cache entry as the precondition for a write that requires exact current state.

On a miss, coalesce simultaneous equivalent computations if useful. Execute against immutable inputs where possible. For computations over mutable dependencies, verify that their dependency versions did not change during execution; discard the result or retry when the manifest is incoherent.

Publish only complete, correctly classified outcomes. Operational failures are not cached by default. A deterministic negative result can be cached under an explicit policy, such as "symbol absent in this exact source snapshot." A timeout is not such a negative result.

On a hit, construct a fresh tool response referencing the cached observation and its provenance. If the response contains editable source, register the exact emitted rows for the current agent and snapshot. Revalidation, not cache presence, decides whether a later mutation is valid.

## 5. Reference pseudocode

```text
function execute(tool, arguments, context):
    policy = tool.cache_policy
    if policy in [VOLATILE, SIDE_EFFECT]:
        return execute_without_memoization(tool, arguments, context)
    inputs = capture_coherent_dependencies(tool, arguments, context)
    key = hash(canonical_encode(tool.versions, arguments, inputs, context.scope))
    entry = cache.lookup(key)
    if valid(entry, policy, inputs) and payload_retained(entry):
        return present_cached_result(entry, current_call=context.call)
    result = single_flight(key, function:
        value = tool.execute_against(inputs)
        require dependencies_still_coherent(inputs) else INPUTS_CHANGED
        if cacheable_outcome(value, policy):
            cache.publish(key, value, inputs)
        return value)
    return present_result(result)
```

Single-flight suppression only combines the same safe computation. It must not cause cancellation of one caller to abort another caller's independently needed result without an explicit shared-lifecycle policy.

## 6. Worked example

Two agents request a parse of the same immutable source bytes under the same grammar and extractor versions. They share one cached parse artifact, but each receives its own tool response.

A source read is cached under `resource_4/version_7`. After an edit creates version 8, a live read resolves version 8 and cannot reuse the version-7 entry as current. An explicit historical read of version 7 may still use it.

Caching `git status` under the current commit hash alone would be incorrect: uncommitted, staged, ignored, and untracked state can change without changing that commit. The baseline treats it as volatile unless the adapter captures all relevant state.

## 7. Failure modes and recovery

| Code/condition | Meaning | Recovery |
|---|---|---|
| `INPUTS_CHANGED` | Dependency snapshot was incoherent. | Re-capture inputs and recompute. |
| `CACHE_PAYLOAD_MISSING` | Metadata points to reclaimed data. | Evict metadata and recompute safely. |
| `CACHE_PROFILE_CHANGED` | Key or normalization semantics changed. | Use a new namespace/profile. |
| Stale TTL response | Freshness budget permits old data, not current truth. | Revalidate when the operation needs exact state. |
| Scope mismatch | Result belongs to a different effective context. | Treat as a miss. |
| Cached transient error | Retry was incorrectly suppressed. | Evict; cache only explicitly allowed negative outcomes. |
| Mutation skipped as cache hit | Memoization crossed the effect boundary. | Remove that policy and reconcile the actual state. |

## 8. Integration and lifecycle

[Artifacts](12-content-addressed-artifacts.md) store immutable payloads; cache metadata maps computations to those payloads. [Observations](02-addressable-observations.md) preserve original execution provenance. [Repository maps](05-structural-repository-maps.md) benefit from content-keyed parsing and manifest-keyed retrieval.

[Mutation receipts](14-mutation-receipts-and-rollback.md) can emit invalidation hints, but correctness should not depend only on perfectly delivered invalidation events. Versioned keys remain authoritative when a hint is missed.

Reference counting or pinning must keep live cache payloads available. Eviction of a cache entry should not erase an independently pinned observation. Keep TTL timing monotonic within a process where possible and define clock behavior across persistence/restarts.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Same immutable inputs | Cache hit returns equivalent result with original provenance. |
| Source changes without path change | Live read misses the old version. |
| File changes during computation | Result is not published under the wrong version. |
| Parser/configuration changes | Key changes. |
| Different caller scope | Results do not cross inappropriate scope boundaries. |
| Missing versus null argument | Canonicalization preserves tool semantics. |
| Concurrent same computation | Optional coalescing does not duplicate work unnecessarily. |
| Timeout or transient service error | Not cached as deterministic absence. |
| Untracked file changes under same commit | Incomplete Git-based key is rejected by policy. |
| Cached source shown to new agent | Delivered-span state is registered explicitly. |

## 10. Metrics and rollout

Track hit rate by policy, recomputation avoided, stale-result defects, validation overhead, payload retention failures, and total agent task time. A high hit rate based on incomplete keys is a correctness failure, not an optimization success.

Start with obviously pure parsing of immutable inputs. Add versioned reads and maps next. Introduce TTL caching only for operations whose tolerable staleness is explicit. Keep a shadow mode that recomputes a sample of hits and checks equivalence.

## 11. Implementation checklist

- [ ] Classify tools using explicit cache policies.
- [ ] Capture complete dependency and environment manifests.
- [ ] Canonicalize arguments under a versioned profile.
- [ ] Prevent mixed-version computations from being cached.
- [ ] Preserve provenance and current-agent delivery behavior on hits.
- [ ] Separate cache reuse from mutation idempotency and rollback.

## 12. References and further reading

[1] [Bazel, Remote caching](https://bazel.build/remote/caching) - action inputs, action-result metadata, and content-addressable storage as separate concerns.

[2] [RFC 9111, HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111) - freshness and validation concepts; this guide does not claim HTTP cache directives directly govern arbitrary tools.

[3] [RFC 8785, JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) - a concrete canonical JSON profile for supported data types.
