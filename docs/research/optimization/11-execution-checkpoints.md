# Execution Checkpoints and Context Compaction

Preserve resumable execution state separately from conversational summaries, with explicit evidence, pending effects, and handle revalidation.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

When a context window is compacted or a session resumes, retain the operational facts required to continue safely: current goals, source state, verified work, unresolved failures, active resources, and pending side effects.

Anthropic discusses compaction and structured note-taking as context-management techniques [1], and separately describes persistent progress artifacts for long-running agents [2]. This guide turns those ideas into a versioned checkpoint contract; it does not claim that a summary can capture an LLM's full internal state.

A checkpoint is a durable description of execution state. A narrative summary explains reasoning and decisions. Use both when helpful, but do not allow an unverified narrative to overwrite authoritative runtime facts.

## 2. Design contract and invariants

Every checkpoint MUST identify a precise event/log boundary and the source versions to which its verified claims apply. "Tests passed" without the tested inputs, scope, and evidence is not a resumable verification fact.

Runtime-owned fields come from runtime records: completed mutations, process status, tool versions, and observed outcomes. Model-authored decisions and assumptions remain separately labeled, with evidence references where available.

Pending or unknown side effects MUST survive compaction. Resume must not replay them blindly or reset their idempotency identities and retry budgets. A checkpoint's existence does not prove that external state still matches it.

Checkpoint publication MUST be atomic from a reader's perspective. All required referenced artifacts must be retained before the checkpoint becomes the latest resumable version.

## 3. Data model and tool interface

```json
{
  "checkpoint_id": "checkpoint_12",
  "schema_version": "1",
  "run_id": "run_4",
  "event_boundary": 184,
  "goal": "Implement refresh behavior",
  "constraints": ["Preserve existing public API"],
  "workspace": {"manifest_id": "manifest_24", "base_revision": "revision_7"},
  "completed_mutations": ["mutation_18"],
  "verification": [{
    "observation_id": "obs_44",
    "input_manifest": "manifest_24",
    "scope": "auth-unit-tests",
    "outcome": "passed",
    "complete": true
  }],
  "open_issues": [{"diagnostic_set": "diagset_11", "id": "diag_D"}],
  "pending_operations": [{"operation_id": "operation_8", "effect_state": "unknown"}],
  "active_processes": [{"process_id": "proc_19", "after_seq": 39}],
  "loaded_tool_manifest": "tools_9",
  "decisions": [{"text": "Keep tokens opaque", "origin": "user", "evidence": "message_3"}],
  "assumptions": [{"text": "Provider timeout is transient", "status": "unverified"}],
  "next_actions": ["Reconcile operation_8 before another mutation"],
  "recent_history_reference": "history_12"
}
```

```text
create_checkpoint(run_id, expected_event_boundary)
inspect_checkpoint(checkpoint_id)
resume_from_checkpoint(checkpoint_id)
validate_checkpoint_against_live_state(checkpoint_id)
```

Record workspace manifests including dirty files and editor overlays, not only a branch or commit name. A branch can move and a commit does not represent an uncommitted working tree.

## 4. Implementation workflow

Choose a consistent checkpoint boundary. Either pause new mutations briefly while capturing state, or use a durable event sequence with all in-flight operations explicitly represented. Do not combine workspace metadata from one moment with a later mutation list and call it atomic.

Gather authoritative runtime state first. Then obtain a bounded narrative of goals, decisions, open questions, and planned actions. Validate its references against actual records. Contradictions become explicit issues; the summary does not decide that an unobserved test passed.

Persist referenced artifacts and retention pins. Write the checkpoint under a fresh identifier, validate its schema and links, then update the latest-checkpoint pointer conditionally. If publication fails, keep the prior checkpoint usable.

Build the compacted model context from durable instructions, checkpoint state, a short narrative, and recent protocol-valid turns. Do not split a tool call from its required result in ways the target API rejects. Calls still running appear as pending operations, not fabricated completed tool results.

On resume, validate schema compatibility, tool availability, workspace versions, retained handles, process existence, and pending effects. Reconcile any drift before accepting cached verification as current. Reconstruct source delivery state only from explicit retained records; mentioning a hash anchor in a summary does not prove source visibility.

The checkpoint is not a replay script. Replaying event records should reconstruct the harness's state view, not repeat external sends, installations, or file writes. Execute new effects only after the current state and intended next action are established.

## 5. Reference pseudocode

```text
function checkpoint(run):
    boundary = event_log.consistent_boundary(run)
    facts = runtime.snapshot_at(boundary)
    narrative = summarize_decisions_and_open_questions(run, boundary)
    candidate = combine_without_overwriting_facts(facts, narrative)
    validate_schema_and_references(candidate)
    pins = retain_required_artifacts(candidate)
    id = store_immutable_checkpoint(candidate)
    publish_latest_if_boundary_advances(run, id, boundary)
    return id

function resume(id):
    checkpoint = load_and_migrate_if_supported(id)
    verify_required_artifacts(checkpoint)
    live = inspect_live_resources(checkpoint)
    drift = compare_versions_and_outcomes(checkpoint, live)
    reconcile_pending_operations_before_new_effects(checkpoint, live)
    state = mark_stale_claims_and_handles(checkpoint, drift)
    return build_valid_model_context(state)
```

## 6. Worked example

Before compaction, the agent has edited two files, passed auth unit tests on manifest 24, and started a package install whose response was lost. The checkpoint records the passed test scope and the unknown install operation.

While the session is inactive, a developer changes one of the edited files. Resume detects manifest drift. The previous tests remain historical evidence, but they are no longer proof about current inputs. The installer is queried or its effects inspected before any second install is started.

The model resumes with a clear next step: reconcile the install, inspect the changed file, and rerun affected verification. It does not infer completion from a narrative sentence saying "implementation was nearly done."

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `CHECKPOINT_SCHEMA_UNSUPPORTED` | Runtime cannot interpret the stored schema. | Use a tested migration or an older compatible runtime. |
| `CHECKPOINT_INCOMPLETE` | Required records or artifacts are missing. | Fall back to an earlier checkpoint and reconcile live state. |
| `WORKSPACE_DRIFT` | Current source differs from checkpoint inputs. | Mark claims stale and inspect differences. |
| `PENDING_EFFECT_UNKNOWN` | External operation outcome remains uncertain. | Reconcile before issuing another effect. |
| `PROCESS_HANDLE_LOST` | Active process cannot be recovered. | Inspect resulting state; do not assume completion or restart automatically. |
| `SUMMARY_CONTRADICTION` | Narrative conflicts with runtime evidence. | Preserve authoritative facts and flag the narrative claim. |
| `HISTORY_PROTOCOL_INVALID` | Compacted call/result sequence is invalid. | Rebuild from a valid boundary. |

## 8. Integration and lifecycle

[Mutation receipts](14-mutation-receipts-and-rollback.md) and an event log supply authoritative changes. [Process cursors](03-process-handles-and-output-cursors.md), [diagnostic sets](04-diagnostic-fingerprints-and-deltas.md), and [tool manifests](07-lazy-tool-discovery-and-loading.md) supply resumable references.

[Artifacts](12-content-addressed-artifacts.md) back durable evidence; pin the transitive reference closure before publication. A checkpoint pointing to expired observations is only partially resumable, even if its JSON is intact.

Retain multiple generations and support crash recovery during checkpoint creation. Give each resumed branch of execution a new run/session identity linked to its parent checkpoint. Sharing a checkpoint with another agent does not automatically transfer source visibility or operation authorization.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Resume unchanged workspace | Goals, evidence, and next actions reconstruct correctly. |
| Dirty files under unchanged commit | Manifest drift is detected. |
| Tool in flight during capture | Pending status is recorded without invented completion. |
| Commit succeeded but response lost | Resume reconciles instead of replaying mutation. |
| Summary claims nonexistent test pass | Validation rejects or flags the claim. |
| Artifact collection during publication | Referenced evidence remains pinned. |
| Crash while writing checkpoint | Previous checkpoint remains usable. |
| Unsupported schema version | No silent field loss. |
| Tool catalog changes | Loaded schemas are refreshed explicitly. |
| Tool call/result straddles compaction | Final model context satisfies provider protocol. |

## 10. Metrics and rollout

Measure resume success, repeated work, stale verification claims, forgotten constraints, handle recovery failures, and duplicate side effects. Evaluate compaction by task continuation quality rather than compression ratio alone.

Test with deliberate context resets at inconvenient points: after writes, during processes, after partial tests, and around lost responses. Begin with manual checkpoint inspection, then automate compaction only when these transitions are reliable.

## 11. Implementation checklist

- [ ] Separate runtime facts, user decisions, model interpretations, and assumptions.
- [ ] Capture a consistent event boundary and complete workspace manifest.
- [ ] Retain pending effects, retry identities, and active resource cursors.
- [ ] Pin evidence before atomically publishing the checkpoint.
- [ ] Revalidate live state and protocol history on resume.
- [ ] Test crashes, drift, contradictions, and uncertain outcomes.

## 12. References and further reading

[1] [Anthropic, Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - compaction, structured notes, and context selection.

[2] [Anthropic, Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) - persistent progress artifacts and continuation across sessions. The checkpoint schema and reconciliation rules here are a proposed implementation profile.
