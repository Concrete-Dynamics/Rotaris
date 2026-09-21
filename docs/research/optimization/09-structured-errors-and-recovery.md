# Structured Errors and Recovery Contracts

Make failures actionable without confusing retryability, stale assumptions, and uncertain side effects.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Return stable machine-readable failure categories, useful current evidence, and a valid recovery path instead of an undifferentiated error string. The goal is fewer blind retries and fewer unnecessary diagnostic calls.

RFC 9457 defines problem-detail objects for HTTP APIs [1]. This guide borrows the separation of stable problem identity and instance-specific detail, while proposing a transport-independent envelope with explicit side-effect state and recovery semantics.

This is not a universal automatic retry layer. Some failures require a new plan, a fresh read, reconciliation, or a stop. A helpful error response must not hide which of those applies.

## 2. Design contract and invariants

Every failure MUST separate the error code from human-readable detail. Callers branch on the code and structured fields, not string matching against translated messages.

Every mutating failure MUST report one of `not_applied`, `applied`, `partially_applied`, or `unknown`. A timeout does not prove that nothing happened. A transport error after a successful commit must not cause a duplicate mutation.

A recovery suggestion MUST refer to an actual supported capability and include the versions or handles needed to use it. It is advice from the runtime, not new authorization. Raw service output or file content remains untrusted data, not an instruction with elevated priority.

Retries MUST be bounded across the complete operation, including model-generated retry loops. Repeated failures with no new evidence should trigger a stop or replanning rather than unlimited re-execution.

## 3. Data model and tool interface

```json
{
  "ok": false,
  "error": {
    "code": "STALE_SNAPSHOT",
    "category": "conflict",
    "message": "The source changed after the supplied snapshot.",
    "instance_id": "error_19",
    "operation_id": "operation_6",
    "effect_state": "not_applied",
    "retry": {"mode": "replan", "after_ms": 0},
    "details": {"requested_snapshot": "snap_8", "current_snapshot": "snap_9"},
    "recovery": [{
      "action": "inspect_current_source",
      "tool": "read_source",
      "arguments": {"snapshot_id": "snap_9", "start_line": 10, "max_lines": 15}
    }],
    "evidence": ["obs_52"]
  }
}
```

The retry modes are `none`, `same_request`, `replan`, and `reconcile`. `same_request` is valid only when repeating the operation is safe under its effect contract or the same stable idempotency identity. Keep `call_id` for conversation routing and `operation_id` for the logical operation; they need not be the same.

The error catalog defines, for each code, expected category, possible effect states, recovery fields, and whether unchanged input can ever succeed. An error-code version should be part of the tool contract.

## 4. Implementation workflow

At each adapter boundary, classify failures without discarding source detail. Separate invalid arguments, missing resources, stale preconditions, rate limits, unavailable dependencies, execution failures, and unknown commit outcomes.

Validate and enrich errors where the runtime has reliable evidence. For invalid arguments, return the exact field and constraint. For stale source, return fresh snapshot context. For a failed build, return the diagnostic/observation handle. Do not guess installed executables or invent available alternatives.

Determine side-effect state from execution evidence, not from exception type alone. A connection timeout after sending an external request usually leaves outcome unknown unless the service can prove otherwise. Reconciliation should query by the original operation identity or inspect the affected resource under a documented rule.

For safe retries, respect upstream retry timing and use bounded backoff. Track attempt count, cumulative elapsed time, repeated error fingerprints, and changed evidence. A new random request identifier is not a safe retry for a possibly completed mutation [2].

Return compact, useful context under an output budget. Large traces go into an observation. Keep error code, effect state, and recovery control fields outside truncatable detail.

## 5. Reference pseudocode

```text
function handle_failure(operation, exception, evidence):
    code = classify(exception, operation.phase)
    effect = determine_effect_state(operation.journal, evidence)
    if effect in [unknown, partially_applied]:
        mode = reconcile if operation.supports_reconciliation else none
    else if code.requires_new_preconditions:
        mode = replan
    else if operation.safe_to_repeat and retry_budget_available(operation):
        mode = same_request
    else:
        mode = none
    recovery = build_supported_recovery(code, effect, evidence)
    return stable_error_envelope(code, effect, mode, recovery)

function retry_same_operation(operation):
    require operation.retry_mode == same_request
    require operation.remaining_retry_budget > 0
    preserve operation.id and idempotency_key
    execute_with_same_effect_identity(operation)
```

A returned `applied` state can accompany a secondary failure such as response formatting or post-commit indexing. In that case, report the successful mutation receipt and recover the secondary step; do not repeat the mutation.

## 6. Worked example

An edit request fails because the file changed. The response says `STALE_SNAPSHOT`, `effect_state="not_applied"`, and `retry.mode="replan"`, with fresh anchored context. The agent reconstructs the intended edit against that new snapshot.

A dependency-install request times out after the installer may have modified the lockfile. The response says `effect_state="unknown"` and points to the process handle and workspace inspection. It does not recommend blindly starting a second installation.

A read-only API call is rate-limited. Its response can safely recommend the same request after the supplied delay, subject to a finite retry budget. These three failures require different behavior despite all being colloquially called retryable.

## 7. Failure modes and recovery

| Anti-pattern | Consequence | Correct behavior |
|---|---|---|
| Every exception sets `retryable=true` | Repeated mutations or endless loops. | Choose an explicit recovery mode from effect evidence. |
| Only a prose message | Fragile parsing and poor recovery. | Stable code plus structured detail. |
| Timeout treated as `not_applied` | Duplicate side effects. | Preserve unknown outcome until reconciled. |
| Fresh context lacks version | Agent retries against ambiguous state. | Include the exact snapshot/resource version. |
| Suggested tool is unavailable | Another failed round trip. | Validate recovery actions against available capabilities. |
| Raw trace becomes instruction | Tool data influences control improperly. | Preserve its data boundary and provenance. |
| Repeated no-progress retries | Wasted calls and output. | Exhaust bounded retry budget and expose the blockage. |

## 8. Integration and lifecycle

Every guide in this collection can use the same envelope. [Process handles](03-process-handles-and-output-cursors.md) supply reconciliation for long-running commands. [Mutation receipts](14-mutation-receipts-and-rollback.md) supply known commit state. [Observations](02-addressable-observations.md) store raw diagnostics without bloating errors.

[Checkpoints](11-execution-checkpoints.md) retain pending operation identities and unknown outcomes. Restoring a checkpoint must not reset retry budgets or forget that a mutation may already have happened.

Keep the error catalog backward-compatible where possible. When a recovery schema changes incompatibly, version it rather than silently changing meaning. Error fingerprints for loop detection should preserve meaningful changing evidence while excluding incidental timestamps.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Invalid field | Response identifies the field and exact violated constraint. |
| Stale file | No write occurs; recovery contains a fresh snapshot. |
| Commit succeeds, reply lost | Effect is applied/unknown, never automatically not applied. |
| Same logical mutation retried | Stable operation/idempotency identity is retained. |
| Rate-limit response | Delay is respected within a bounded budget. |
| Repeated identical failure | Harness detects no progress and stops/escalates. |
| Suggested capability removed | Recovery does not advertise an unusable action. |
| Large trace | Essential control fields survive truncation. |
| Resume after failure | Retry budget and pending outcome persist. |
| Partial multi-step operation | Applied substeps are recorded instead of reporting total failure only. |

## 10. Metrics and rollout

Measure recovery success, blind retries, duplicate side effects, unknown outcomes reconciled, and additional model calls after errors. Distinguish temporary infrastructure failures from incorrect agent arguments.

Start with the most frequent existing error categories. Preserve raw exception evidence and run fault-injection tests at every mutation phase. A lower apparent error count is not success if failures are being mislabeled as completed operations.

## 11. Implementation checklist

- [ ] Publish stable error codes and recovery schemas.
- [ ] Report effect state independently of retry mode.
- [ ] Carry fresh evidence with exact versions and handles.
- [ ] Preserve operation identity across safe retries.
- [ ] Bound retries and detect repeated no-progress failures.
- [ ] Test commit/reply failure windows and partial effects.

## 12. References and further reading

[1] [RFC 9457, Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457) - standardized HTTP problem representation. The transport-independent recovery and effect fields above are extensions proposed here.

[2] [AWS Builders' Library, Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) - request identities, semantic equivalence, and retry ambiguity.
