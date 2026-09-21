# Agent Harness Implementation Guides

**Version:** 1.0  
**Prepared:** 2026-09-21  
**Format:** Fourteen standalone Markdown implementation guides, with an index and a reference catalog.

## Scope

This collection turns the harness optimizations discussed in the conversation into concrete, framework- and programming-language-independent implementation profiles. Each guide defines its own problem, invariants, interface, execution algorithm, examples, lifecycle, failure behavior, conformance tests, and evaluation plan.

The designs are **proposals to implement and test**, not a new universal standard, executable libraries, or claims of benchmarked performance. Reference products illustrate mechanisms; the guides do not assert wire compatibility with them. Existing authorization, sandboxing, and workspace policies are assumed and are not redesigned here.

Read an individual guide directly, or use the integration order below. Relative links work after extracting the complete archive. All source links were reviewed through web retrieval on 2026-09-21; mutable documentation can change, and one reference is deliberately pinned to a dated MCP specification.

## Guide index

| Guide | Implementation focus |
|---|---|
| [01. Hashline Read and Edit](01-hashline-read-and-edit.md) | Implement compact, snapshot-bound source references with precise replacement, deletion, insertion, and batch semantics. |
| [02. Addressable Observations and Lazy Result Retrieval](02-addressable-observations.md) | Keep complete tool results outside the prompt while exposing bounded, inspectable, provenance-preserving views. |
| [03. Process Handles and Incremental Output Cursors](03-process-handles-and-output-cursors.md) | Expose long-running commands as resources with explicit lifecycle, bounded polling, and loss-aware output continuation. |
| [04. Diagnostic Fingerprints and Delta Results](04-diagnostic-fingerprints-and-deltas.md) | Present debugging progress as new, persistent, resolved, and unverified diagnostics without losing occurrence identity or coverage. |
| [05. Structural Repository Maps](05-structural-repository-maps.md) | Build a versioned, budgeted navigation index that exposes useful source structure without loading complete implementations. |
| [06. Editable Search Results with Shared Source References](06-editable-search-results.md) | Let exact search hits feed the edit tool directly without bypassing snapshot validation or pretending snippets are complete source. |
| [07. Lazy Tool Discovery and Loading](07-lazy-tool-discovery-and-loading.md) | Expose a small initial tool surface and load exact, versioned tool contracts only when relevant to the task. |
| [08. Cache-Friendly Prompt Assembly](08-cache-friendly-prompt-assembly.md) | Construct stable prompt regions while preserving current facts, correct message history, and provider-specific cache behavior. |
| [09. Structured Errors and Recovery Contracts](09-structured-errors-and-recovery.md) | Make failures actionable without confusing retryability, stale assumptions, and uncertain side effects. |
| [10. Version-Aware Tool-Result Caching](10-version-aware-tool-result-caching.md) | Reuse safe computations without serving stale source, hiding changed dependencies, or confusing memoization with mutation idempotency. |
| [11. Execution Checkpoints and Context Compaction](11-execution-checkpoints.md) | Preserve resumable execution state separately from conversational summaries, with explicit evidence, pending effects, and handle revalidation. |
| [12. Content-Addressed Artifacts](12-content-addressed-artifacts.md) | Store immutable payloads once and reference them by verified content identity, with explicit provenance, retention, and publication semantics. |
| [13. Change-Aware Verification](13-change-aware-verification.md) | Run relevant checks early while preserving explicit coverage, conservative dependency analysis, and final verification requirements. |
| [14. Mutation Receipts and Conditional Rollback](14-mutation-receipts-and-rollback.md) | Record side effects as evidence-backed events and support undo only when retained state and current preconditions make it safe. |

## Shared document structure

Every numbered guide uses exactly these twelve sections:

1. Purpose and scope
2. Design contract and invariants
3. Data model and tool interface
4. Implementation workflow
5. Reference pseudocode
6. Worked example
7. Failure modes and recovery
8. Integration and lifecycle
9. Conformance tests
10. Metrics and rollout
11. Implementation checklist
12. References and further reading

The pseudocode is intentionally independent of concrete runtime libraries. Names such as `commit_if_version`, `capture_source_manifest`, and `persist_result_set` describe adapter contracts whose required semantics are explained in the surrounding text. Illustrative handles, versions, and hash tags are not production test vectors.

## Important design clarifications

**Hashline is not automatically position-independent.** The original presentation commonly uses `LINE:HASH|content`. Guide 01 adopts that recognizable format and adds a strict snapshot-backed profile. Short hashes do not provide unique identity, and the baseline intentionally rejects changed snapshots instead of guessing where a target moved. Hash-only relocation is a separate, more complex design.

**An observation is not an artifact.** Observations preserve execution identity, outcome, source versions, and useful views. Artifacts preserve immutable payload bytes. Identical bytes from two executions may deduplicate while their provenance remains distinct.

**Partial verification is not resolution.** A diagnostic missing from an incomplete or narrower run is not necessarily fixed. The coverage and final-gate contracts keep these claims separate.

**Caching and idempotency are different.** A safe computation cache reuses known inputs and outputs. Mutation retry safety needs a logical operation identity and effect reconciliation. A timeout can leave the outcome unknown.

**Atomic replacement is not compare-and-swap.** A local rename can publish complete file contents without preventing an external writer from changing the file between validation and replacement. Strict lost-update prevention requires a backend precondition or coordination covering every writer.

**Prompt reuse is provider-dependent.** Deterministic prompt assembly improves the opportunity for caching; actual reuse must be measured from supported provider telemetry. Loading tools can change cached prefixes on some adapters.

## Common vocabulary and boundaries

| Term | Meaning in this collection |
|---|---|
| Resource | A mutable file, document, process, or external entity with explicit scope. |
| Version | A backend revision/precondition token; not necessarily a content hash. |
| Snapshot | Retained exact content and metadata bound to a captured resource version. |
| Handle | An opaque reference resolved by the runtime; not permission to act. |
| Observation | A result envelope with execution provenance, outcome, completeness, and payload references. |
| Artifact | Immutable bytes identified by a full content digest or an alias resolving to one. |
| Receipt | An evidence-backed event about an attempted or completed side effect. |
| Manifest | A versioned inventory of inputs, schemas, resources, or dependencies. |
| Checkpoint | Resumable execution state at an explicit event boundary, plus referenced evidence. |
| Delivered source | Exact complete source rows actually included in a tool response to an agent scope. |

Source line numbers are 1-based. Byte ranges are zero-based and half-open. Process cursors use an explicit per-process sequence with 0 as the initial cursor. Do not interchange these coordinate systems.

## Integration architecture

This is a logical organization, not a prescribed deployment topology:

```text
Model-facing context and tools
    |
    +-- Prompt assembler + loaded tool manifest
    |
    +-- Source service: snapshots, read, search, edit
    |       +-- Repository index and dependency adapters
    |
    +-- Execution service: processes, output records, verification
    |       +-- Structured diagnostic sets and deltas
    |
    +-- Result layer: observations, views, recovery errors
    |
Runtime state
    +-- Version-aware computation cache
    +-- Operation ledger and mutation receipts
    +-- Checkpoints and retained handle references
    |
Storage adapters
    +-- Mutable resources with honest version/commit guarantees
    +-- Immutable artifacts and retention roots
```

Keep correctness-critical checks in the runtime. The model selects intentions and interprets evidence; it does not validate hashes, decide whether a commit was atomic, infer which tests executed, or supply missing concurrency guarantees.

## Suggested implementation order

This order follows dependencies, not a measured ranking of expected return:

| Stage | Components | Exit criterion |
|---|---|---|
| 1. Shared state primitives | Artifacts (12), observations (02), structured errors (09) | Results are retrievable, versioned, bounded, and honest about completeness/effects. |
| 2. Source and execution contracts | Hashline (01), editable search (06), processes (03), receipts (14) | Edits and commands survive retries without silent wrong-target or duplicate effects. |
| 3. Navigation and selective computation | Repository maps (05), caching (10), diagnostic deltas (04), verification (13) | Reuse and partial work preserve correct versions and coverage. |
| 4. Long-running context | Lazy tools (07), prompt assembly (08), checkpoints (11) | Capabilities and operational state remain valid through loading, compaction, and resume. |

A small harness may use a simple blob table instead of a full content-addressed service initially. An observation API can work with an ordinary immutable file backend. Keep the contracts stable and avoid building infrastructure whose measured value is not yet established.

## Adapter responsibilities

**LLM-provider adapter:** Render the actual native tool schemas, preserve valid message/call/result ordering, handle supported deferred loading, and expose available token/cache telemetry. An ordinary tool result containing a schema is not automatically native tool registration.

**Storage adapter:** State whether it provides atomic publication, conditional commit, durable revisions, file metadata preservation, and crash recovery. Do not emulate stronger guarantees with a process-local mutex when external writers exist.

**Process adapter:** Drain all captured streams, supervise the correct process instance and descendants, and separate child exit from capture closure. Declare whether processes survive session or supervisor restarts.

**Language/build adapters:** Extract syntax and dependencies with quality labels, report analyzer coverage, and preserve exact tested-input manifests. Approximate navigation graphs must not silently become proofs that tests can be skipped.

## Cross-guide acceptance scenarios

| Scenario | Required end-to-end behavior |
|---|---|
| Search hit, direct edit, competing external writer | Exact delivered snapshot is used; stale/conditional commit rejects without overwriting external work. |
| Test run followed by a narrower rerun | Delta resolves only issues covered by the completed comparable rerun. |
| Tool result cached and then served to another agent | Original provenance remains visible; any source delivery is registered for the current agent. |
| Process exits while final output remains buffered | Output remains readable until capture closes; checkpoint does not lose the final records. |
| Mutation commits but its response is lost | The original logical operation is reconciled; it is not silently re-executed. |
| Context compacts with an active process and unknown effect | Checkpoint retains both handles/identities and resume revalidates them. |
| Artifact collection runs during checkpoint publication | Referenced evidence remains retained or publication fails explicitly. |
| Tool catalog changes after discovery | Dispatch uses the applicable exact schema version, not a newer guessed contract. |
| Files change after successful verification | Historical evidence is preserved but the final gate requires current valid results. |
| Undo follows another actor's edit | Conditional restore rejects rather than discarding the other actor's work. |

Run the guide-specific conformance tests as well. The test tables are implementation requirements to turn into executable tests in the target framework; this collection does not include an executed reference harness.

## Evaluation approach

Establish a baseline and change one optimization at a time where practical. Use the same task fixtures, model versions, output budgets, and success criteria. Measure complete-run cost and latency rather than only first-response size. Include deliberate stale state, duplicate lines, crash windows, partial capture, missing dependencies, and concurrent writers.

Keep correctness metrics separate from efficiency metrics. Wrong-target edits, duplicate effects, falsely resolved diagnostics, and stale verification claims are defects even when a design saves tokens. No performance percentages are asserted in this collection.

## Reference catalog

See [REFERENCES.md](REFERENCES.md) for the deduplicated external reference list and where each reference is used. Each guide also includes its own links, so it remains understandable when read individually.
