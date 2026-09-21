# Hashline Read and Edit

Implement compact, snapshot-bound source references with precise replacement, deletion, insertion, and batch semantics.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Hashline makes an edit refer to a short line tag instead of reproducing the old source text. The original presentation uses `LINE:HASH|content`, for example `2:f1|  return "world";`, and describes replacing lines, replacing inclusive ranges, and inserting after a tag [1].

The line number is still an address. The short hash is a content check, not a globally unique line identity. A two-hex-digit tag has only 256 possible values. It cannot guarantee that an unrelated change will be detected, and it does not by itself survive inserted lines above the target.

This guide defines a **strict snapshot-backed profile**. It retains the compact format while adding exact snapshot binding, complete-range visibility tracking, and conditional commit. These additions are this guide's design, not requirements of every Hashline implementation. Automatic relocation and hash-only addressing are intentionally excluded from the baseline. New-file creation, binary mutation, rename, and deliberate whole-file overwrite remain separate tool operations.

## 2. Design contract and invariants

An accepted request MUST identify one immutable source snapshot, one resource, and edits resolved entirely against that snapshot. The current resource MUST still have that snapshot's version when committed. A target or replaced range MUST have been fully delivered to the requesting agent. Receiving a tag is not evidence that truncated or hidden interior text was delivered.

The displayed hash MUST be deterministic for exact logical line content, including indentation and trailing spaces. The baseline uses the first two lowercase hexadecimal characters of SHA-256 over the line's UTF-8 bytes, excluding its line terminator. Retain the full bytes internally. Advertise this profile as `line-sha256-2hex-v1`. Other hash profiles require a different advertised profile identifier.

Duplicate lines are safe because their numeric locations differ. Do not assign duplicate occurrence counters and then assume those counters remain stable after changes. Never relocate an edit by looking for the closest short-hash match.

Every batch MUST be validated before any write. Rejection leaves the resource unchanged. A file digest and a storage version are distinct: a digest identifies bytes; a storage revision can also detect change-away-and-back history.

## 3. Data model and tool interface

```text
Snapshot {
  snapshot_id, resource_id, storage_version, raw_bytes,
  lines[], encoding, bom, line_terminators[], final_newline
}
DeliveredSpan { agent_scope, snapshot_id, start_line, end_line }
read_source(path, start_line=1, max_lines, snapshot_id?)
edit_source(path, snapshot_id, edits[], final_newline="preserve")
```

`read_source` returns a `snapshot_id`, `resource_id`, profile name, total line count, completeness metadata, and complete anchored rows. Passing a snapshot identifier reads another page of that same snapshot, not a newer live file. A new live read creates a new snapshot when needed.

```json
{
  "path": "src/greet.txt",
  "snapshot_id": "snap_17",
  "edits": [
    {"op": "replace", "from": "2:f1", "to": "2:f1", "lines": ["  return greeting;"]},
    {"op": "insert_after", "anchor": "3:0e", "lines": ["", "next_step();"]}
  ],
  "final_newline": "preserve"
}
```

Tags in examples are illustrative, not SHA-256 test vectors. The accepted operations are:

| Operation | Address | Exact meaning |
|---|---|---|
| `replace` | `from`, `to` | Replace the inclusive range with `lines`. |
| `delete` | `from`, `to` | Remove the inclusive range; equivalent to replacement with `[]`. |
| `insert_before` | `anchor` | Insert at the gap immediately before that original line. |
| `insert_after` | `anchor` | Insert at the gap immediately after that original line. |
| `insert_empty` | Snapshot only | Insert into a zero-line document; reject otherwise. |

Each `lines` element contains one logical line and MUST NOT contain CR or LF. `[]` means no lines; `[""]` means one empty logical line. Do not strip text that happens to resemble an annotation. The model-facing contract prohibits annotation prefixes; ambiguous source text is preserved rather than silently rewritten.

## 4. Implementation workflow

Capture exact file bytes and a conditional-write version. Decode supported text without lossy replacement. Preserve BOM and newline metadata. A zero-byte document has zero lines; `a\n` has one line and a final newline, not a synthetic second empty line.

Render only complete logical lines within the output budget. Mark oversized lines uneditable and expose a separate full-content retrieval path. Register only the spans actually delivered in a committed tool response. Read-response retries may register the same spans idempotently.

Parse every tag as a 1-based line number and exact profile-specific hash. Resolve against the specified snapshot, check the hash, and verify that replacement/deletion interiors and insertion anchors were delivered. Convert replacements to zero-based half-open intervals `[start,end)` and insertions to gaps `g` in `[0,N]`.

Reject overlapping replacements. Reject an insertion strictly inside a replaced interval. Insertion at its beginning or end is allowed and refers to the original boundary. Reject multiple insertions at the same gap; the agent must combine their lines explicitly. Adjacent replacements are allowed.

Construct the output from original segments. At gap `g`, emit its insertion first, then a replacement beginning there or the original next line. When skipping a replaced interval, resume at its end gap. This defines ordering without relying on mutable indexes.

Preserve untouched line terminators. New boundaries use the document's uniform terminator, or a configured default if none exists. For mixed-ending files, the baseline SHOULD reject editing with `MIXED_LINE_ENDINGS` rather than silently normalize. `final_newline` accepts `preserve`, `present`, or `absent`; impossible combinations such as one empty line with no terminator MUST be rejected or explicitly canonicalized to zero lines under a documented policy. This profile rejects them as `UNREPRESENTABLE_DOCUMENT`.

Finally commit against the original storage version. Recompute a fresh snapshot and return current anchored context plus a mutation receipt reference. Atomic replacement is not the same as compare-and-swap: ordinary local rename alone does not prevent an external writer from intervening [2].

## 5. Reference pseudocode

```text
function edit_source(agent, request):
    snapshot = snapshots.get(request.snapshot_id)
    require snapshot.resource_id == resolve_resource(request.path)
    plans = []
    for operation in request.edits:
        plan = resolve_against_snapshot(operation, snapshot)
        verify_displayed_hashes(plan, snapshot)
        verify_delivered_spans(agent, snapshot, plan.required_spans)
        plans.append(plan)
    verify_nonconflicting_intervals_and_gaps(plans)
    output = construct_from_original(snapshot, plans, request.final_newline)
    current = backend.read_with_version(snapshot.resource_id)
    require current.version == snapshot.storage_version else STALE_SNAPSHOT
    require current.bytes == snapshot.raw_bytes else VERSION_CONTRACT_BROKEN
    if output == current.bytes:
        return NO_CHANGES
    result = backend.commit_if_version(current.version, output)
    if result == conflict:
        return CONCURRENT_MODIFICATION
    if result == unknown:
        return OUTCOME_UNKNOWN with reconciliation_reference
    fresh = snapshots.capture_committed_result(result)
    return receipt_and_fresh_context(fresh)
```

The backend MUST implement conditional commit or coordinate every writer under a common exclusion mechanism. A process-local mutex does not cover editors, formatters, or other processes. A backend lacking that guarantee must advertise weaker conflict protection rather than claim this strict profile.

## 6. Worked example

The agent reads:

```text
snapshot_id: snap_17
1:a3|function hello() {
2:f1|  return "world";
3:0e|}
```

Replacing only line 2 uses `from=to="2:f1"`. Replacing the function uses `from="1:a3", to="3:0e"` and requires all three rows to have been delivered. Deleting it uses the same range with `delete`. Appending another declaration uses `insert_after` at `3:0e`. Prepending a comment uses `insert_before` at `1:a3`.

A single batch can replace line 2 and append after line 3. Both addresses resolve against `snap_17`, even if the replacement contains several lines. The result contains a new snapshot and newly computed tags. Old tags are not carried forward as permanent identifiers.

If another writer adds a header before the edit, the strict profile returns `STALE_SNAPSHOT` without writing. An optional relocation profile would need snapshot-to-current mapping, exact range comparison, duplicate disambiguation, and a new conditional commit. It MUST NOT use short-hash search as a substitute.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `BAD_ANCHOR` | Invalid number or hash format. | Copy a returned tag exactly. |
| `HASH_MISMATCH` | Tag does not describe that snapshot row. | Read the intended snapshot region. |
| `UNSERVED_RANGE` | Some target text was never fully delivered. | Read the missing span. |
| `STALE_SNAPSHOT` | Resource changed after snapshot capture. | Read current content and reconstruct the edit. |
| `OVERLAPPING_EDITS` | Ranges or insertion gaps conflict. | Combine the intended changes. |
| `SNAPSHOT_EXPIRED` | Backing snapshot was reclaimed. | Start a fresh read. |
| `CONCURRENT_MODIFICATION` | Commit precondition failed. | Re-read; do not replay blindly. |
| `OUTCOME_UNKNOWN` | Commit may have occurred. | Reconcile using the operation identifier. |

Errors may return fresh current context, but that context must have its own snapshot identifier. Never silently rebind the original request to it.

## 8. Integration and lifecycle

Use the same snapshot and row-rendering service for [editable search](06-editable-search-results.md). Store delivered spans by agent scope and snapshot, not by short hash alone. A checkpoint may retain a snapshot reference, but resume must still validate current storage state.

Pin snapshots needed by active edits. Expire them predictably after the run or a documented idle period. Successful mutations invalidate live-file caches and repository indexes. [Mutation receipts](14-mutation-receipts-and-rollback.md) record before/after versions; [structured errors](09-structured-errors-and-recovery.md) preserve commit uncertainty.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Single/multiline replacement | Exactly the inclusive original span changes. |
| Delete versus empty line | `[]` deletes; `[""]` retains an empty line where representable. |
| Insert before first/after last | Boundary position and final newline are correct. |
| Zero-line file | Only `insert_empty` is accepted. |
| Repeated braces or blank lines | Numeric locations distinguish occurrences. |
| Deliberate short-hash collision | Snapshot/version checks prevent stale acceptance. |
| Unseen range interior | Entire batch rejects with no write. |
| Replacement plus boundary insertion | Ordering matches the gap rule. |
| Two insertions at one gap | Reject rather than choose an order. |
| External insertion above target | Strict profile rejects stale snapshot. |
| Concurrent writer at commit | Newer contents are not overwritten. |
| Tabs, Unicode, CRLF, BOM | Round trip preserves supported representations. |
| Failed second edit in batch | First edit is not written. |
| Lost success response | Reconciliation prevents duplicate insertion. |

## 10. Metrics and rollout

Measure wrong-target mutations, rejected edits, retries, edit payload tokens, completion latency, and unnecessary rereads on representative tasks. Wrong-target mutations are a release blocker; a lower rejection count is not a benefit if edits become less trustworthy.

Compare this profile with exact-text replacement using the same models, tasks, output budgets, and conflict injection. Report snapshot-conflict rejection separately from malformed-tag failures. Do not extrapolate the original author's benchmark into a universal performance guarantee.

## 11. Implementation checklist

- [ ] Publish the tag grammar, hash profile, line numbering, and newline rules.
- [ ] Retain immutable snapshots and delivered-span records.
- [ ] Implement every operation and the explicit interval/gap conflict rules.
- [ ] Validate complete batches and commit conditionally.
- [ ] Return fresh snapshot context and honest mutation outcomes.
- [ ] Pass collision, duplicate-line, concurrent-writer, and newline tests.

## 12. References and further reading

[1] [Can Boluk, The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/) - original `LINE:HASH|content` presentation and editing examples. The URL currently redirects to the article's new host. The strict profile above is an extension, not a transcription of its implementation.

[2] [HTTP Semantics, If-Match](https://httpwg.org/specs/rfc9110.html#field.if-match) - a standardized example of resource-version preconditions. A local filesystem needs its own equivalent coordination; this is not a filesystem API.
