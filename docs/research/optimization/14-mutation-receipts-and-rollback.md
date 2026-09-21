# Mutation Receipts and Conditional Rollback

Record side effects as evidence-backed events and support undo only when retained state and current preconditions make it safe.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Return a durable receipt whenever the harness attempts or completes a side effect. Receipts make edits, installs, external calls, and other mutations inspectable without reconstructing reality from conversational prose.

Request identity and idempotent retry contracts help distinguish a retry from a new intended operation [1]. Resource-version preconditions illustrate how a later operation can avoid overwriting changed state [2]. This guide combines those principles into a proposed receipt and conditional-undo protocol.

A receipt is not automatically an undo token. Some operations support exact restoration, some only compensation, and some cannot be reversed. Running a shell command does not give the harness a complete inventory of every effect it caused.

## 2. Design contract and invariants

Every logical mutation MUST have a stable operation identifier and explicit outcome: `not_applied`, `applied`, `partially_applied`, or `unknown`. Record uncertain outcomes honestly rather than presenting an attempted action as a successful effect.

Receipt events MUST be append-only. Status views may evolve as new evidence arrives, but prior events are not rewritten to imply the runtime knew the outcome earlier than it did.

Undo MUST check that the target still matches the expected post-mutation state. If another actor changed it, exact restoration must fail rather than overwrite the new work. Undo itself is a new mutation with its own receipt and current conditional-write precondition.

A claimed reversible operation MUST retain the before-image and relevant metadata, or a tested inverse operation, for the advertised undo lifetime. A digest without accessible bytes is not sufficient to restore a file.

## 3. Data model and tool interface

```json
{
  "receipt_id": "receipt_24",
  "operation_id": "operation_18",
  "event_id": "event_184",
  "event_type": "mutation.applied",
  "effect_state": "applied",
  "tool_contract": "source.edit@1",
  "call_id": "call_81",
  "resource_id": "resource_4",
  "before": {"version": "version_7", "artifact_id": "artifact_12", "exists": true},
  "after": {"version": "version_8", "artifact_id": "artifact_13", "exists": true},
  "undo": {"kind": "exact_restore", "requires_current_version": "version_8"},
  "evidence": ["commit_19"],
  "parent_operation_id": null
}
```

```text
inspect_mutation(operation_id)
list_mutations(run_id, cursor?, limit)
reconcile_mutation(operation_id)
undo_mutation(operation_id, expected_current_version, request_id)
```

Undo kinds are `exact_restore`, `compensation`, and `none`. Separate the original logical mutation ID from individual receipt/event IDs. Examples of events include `mutation.intent`, `mutation.applied`, `mutation.failed`, `mutation.outcome_unknown`, `mutation.reconciled`, and `mutation.compensated`.

## 4. Implementation workflow

Reserve the logical operation identity and record intent before execution. Bind it to a canonical argument digest and effect scope. A repeated identity with different arguments is an error, not a new action hidden under the old key.

For supported file mutations, capture the before-image, existence state, storage version, and relevant metadata such as file mode or buffer identity. Pin the before-image before claiming undo support. Define exactly which metadata an exact restore covers.

Execute through the ordinary mutation adapter with its conditional-write rules. When the storage backend and event ledger share a transaction, commit state and receipt together. Otherwise use a durable intent journal and explicit reconciliation for the crash window between external commit and receipt publication.

Persist evidence of the actual result and return the receipt only with the effect state the runtime can support. A command exit code or matching after-bytes can establish aspects of current state, but does not necessarily prove which actor caused them. Do not infer exact attribution from content equality alone.

On a duplicate request, consult the operation ledger. Return the known outcome, wait for the existing operation, or reconcile uncertainty. Do not execute again simply because the original model-facing response was lost. Document the retention lifetime of idempotency records; expired records weaken replay guarantees.

For exact undo, retrieve the original before-image and current resource state. Require the expected after-version or an equally strong precondition. Restore bytes and declared metadata as a new conditional mutation. Restoring old bytes creates a new storage revision; it does not rewind the backend's revision history.

For created files, undo is conditional deletion only if the file remains at the created version. For deleted files, restore requires an atomic create-if-absent or an appropriate tombstone/version precondition. Compensation for an external operation has its own semantics and can fail; do not label it exact restoration.

## 5. Reference pseudocode

```text
function mutate(request):
    prior = ledger.lookup(request.operation_id)
    if prior:
        require prior.arguments_digest == digest(request.arguments)
        return reconcile_or_return_known_outcome(prior)
    intent = ledger.reserve_intent(request)
    before = capture_and_pin_before_state_if_supported(request)
    outcome = adapter.apply_conditionally(request)
    receipt = append_evidence_event(intent, before, outcome)
    return receipt

function undo(original_id, expected_current_version, undo_request_id):
    original = ledger.require_supported_applied_mutation(original_id)
    require original.undo.kind == exact_restore else UNDO_NOT_EXACT
    current = adapter.read_with_version(original.resource_id)
    require current.version == expected_current_version
    require current.version == original.after.version else UNDO_CONFLICT
    before = artifacts.read_verified(original.before.artifact_id)
    return mutate(new_restore_request(
        operation_id=undo_request_id,
        parent_operation_id=original_id,
        expected_version=current.version,
        target_bytes=before,
        target_metadata=original.before.metadata))
```

This pseudocode illustrates an existing-file restore. Creation/deletion inverses use their own existence preconditions. Without a backend transaction or recovery-capable journal, the system cannot guarantee both exactly-once effects and complete receipts across every crash; expose the weaker guarantee instead.

## 6. Worked example

An edit changes `config` from version 7 to version 8. Its receipt pins the version-7 bytes and records the commit token for version 8. An undo request succeeds while the resource is still version 8, restoring the old bytes as version 9 and producing a new receipt linked to the original operation.

If a developer edits the file first, creating version 9, the original undo fails with `UNDO_CONFLICT`. It does not overwrite that work merely because the agent asked to roll back its own change.

A package-install command has effects beyond one tracked file. Its receipt can include process output and known file changes, but exact undo is `none` unless the environment provides a genuine snapshot restore contract. A best-effort uninstall is compensation, not proof of restored state.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `OPERATION_ID_REUSED` | Same logical ID carries different arguments. | Reject; use a new ID only for a genuinely new intended operation. |
| `OUTCOME_UNKNOWN` | Commit may have occurred without durable confirmation. | Reconcile from the intent and backend evidence. |
| `RECEIPT_PENDING` | Effect/receipt finalization is still in progress. | Inspect the existing operation rather than re-execute. |
| `UNDO_CONFLICT` | Resource changed after the recorded mutation. | Inspect differences; require a newly planned edit or compensation. |
| `UNDO_DATA_EXPIRED` | Before-image or inverse evidence was reclaimed. | Report undo unavailable; a hash alone cannot restore bytes. |
| `UNDO_NOT_EXACT` | Operation supports only compensation or no reversal. | Use an explicitly described compensation, or stop. |
| `PARTIAL_BATCH_APPLIED` | Multi-resource operation was not transactional. | Preserve per-resource outcomes and reconcile/compensate individually. |

## 8. Integration and lifecycle

[Hashline edits](01-hashline-read-and-edit.md) produce receipts after conditional commit. [Artifacts](12-content-addressed-artifacts.md) retain preimages and postimages. [Checkpoints](11-execution-checkpoints.md) preserve applied mutations and unresolved intents. [Structured errors](09-structured-errors-and-recovery.md) expose effect uncertainty consistently.

Use receipt events as cache/index invalidation hints, not as the only freshness authority. A lost event must not make version-aware reads silently stale.

Single-file atomicity does not imply cross-file transactions. A batch spanning multiple resources must either use a backend transaction or report individual applied, failed, and unknown outcomes. Best-effort rollback can itself conflict and must produce its own evidence.

Retention should distinguish audit history from undo payload lifetime. A receipt can remain inspectable after undo expires, but its current status must state that limitation. An event ledger provides provenance only as strong as its capture and storage guarantees; it is not inherently tamper-proof merely because it is append-only.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Successful file edit | Receipt names exact before/after versions and evidence. |
| Same operation retried | Known result is returned without applying the edit twice. |
| Same ID, different arguments | Request is rejected. |
| Crash after commit, before receipt | Journal permits reconciliation or explicitly unknown outcome. |
| Exact undo without intervening write | Old bytes restored as a new version and receipt. |
| Another actor edits before undo | Undo rejects without overwriting new work. |
| Before-image expires | Undo is not advertised as available. |
| Created-file undo after file changes | Conditional delete rejects. |
| Deleted-file restore after replacement | Existing replacement is not overwritten. |
| Nontransactional multi-file failure | Partial outcomes remain visible. |
| Generic shell side effect | No unsupported exact rollback guarantee is claimed. |

## 10. Metrics and rollout

Track receipt coverage, unresolved outcomes, duplicate side effects, undo conflicts, successful conditional restores, and missing preimages. Distinguish "effect observed" from "effect causally attributed" in audit-quality assessments.

Start with single-resource edits whose before/after states are well controlled. Add external-service operations only when their idempotency and reconciliation contracts are understood. Test crash windows and concurrent actors before offering automatic undo.

## 11. Implementation checklist

- [ ] Reserve stable operation identities and append-only evidence events.
- [ ] Record accurate effect states, including partial and unknown outcomes.
- [ ] Retain before-images before promising reversible edits.
- [ ] Commit conditionally and reconcile receipt/commit crash windows.
- [ ] Make undo a new mutation with current-state preconditions.
- [ ] Distinguish exact restore, compensation, and unsupported reversal.

## 12. References and further reading

[1] [AWS Builders' Library, Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) - stable request intent and retry behavior. The receipt/event model above is a proposed design.

[2] [HTTP Semantics, If-Match](https://httpwg.org/specs/rfc9110.html#field.if-match) - version-precondition semantics that illustrate conditional changes and avoiding lost updates. Non-HTTP backends require their own equivalent guarantees.
