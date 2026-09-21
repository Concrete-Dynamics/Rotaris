# Editable Search Results with Shared Source References

Let exact search hits feed the edit tool directly without bypassing snapshot validation or pretending snippets are complete source.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Remove the mandatory `search -> read -> edit` sequence for edits whose complete target was already shown by search. The search tool returns the same snapshot-bound line references as the read tool. The edit validator remains the sole authority for whether a requested change is valid.

The compact line-tag representation comes from Hashline [1]. This guide proposes a shared read/search delivery contract; it is not an assertion that every existing search tool implements it. Tool responses should expose useful evidence rather than require mechanical extra calls [2].

A search index is a candidate locator. Its stale offsets, highlighted snippets, and truncated previews are not automatically editable source.

## 2. Design contract and invariants

An editable result MUST contain exact, complete logical source lines from a retained snapshot. Its tags, resource identity, and snapshot identifier MUST use the same profile as the read/edit service.

Only rows actually delivered to the agent count as seen. A match in a long line does not establish visibility of the omitted remainder. Seeing both endpoints of a range does not establish visibility of its interior.

Search pagination MUST bind to a stable result set or explicitly disclose live, non-snapshot semantics. The recommended baseline freezes candidate results and per-file snapshots. It does not claim a single atomic snapshot across an entire changing workspace unless the backend provides one.

A search result grants no special mutation rights. Direct editing succeeds only under the normal snapshot, served-span, overlap, and conditional-write checks.

## 3. Data model and tool interface

```text
search_source(query, mode="literal", scope?, file_filter?,
              context_before=0, context_after=0,
              max_matches, output_budget, cursor?)
```

```json
{
  "result_set_id": "search_8",
  "query_profile": "literal-sensitive-v1",
  "workspace_consistency": "per_file_snapshots",
  "complete": false,
  "next_cursor": "cursor_12",
  "matches": [{
    "path": "src/settings.txt",
    "resource_id": "resource_4",
    "snapshot_id": "snap_42",
    "anchor_profile": "line-sha256-2hex-v1",
    "rows": [{
      "line": 12,
      "anchor": "12:ab",
      "text": "timeout = 5000",
      "editable": true,
      "match_byte_ranges": [[0, 7]]
    }]
  }]
}
```

Hash tags are illustrative. Match byte ranges are zero-based half-open offsets into each exact UTF-8 line, excluding the terminator. They are visual metadata, never the addressing mechanism for whole-line editing. Add a separate explicit profile for character-offset or sub-line editing rather than overloading these coordinates.

For truncated previews, set `editable=false`, omit the anchor, and return a location plus a full-read route. Counts must identify whether they are exact totals, lower bounds, or counts of currently returned matches.

## 4. Implementation workflow

Validate and version query semantics: literal versus regular expression, case handling, Unicode policy, filters, and limits. Bound expensive searches and report incomplete coverage rather than silently treating a time limit as the end of the repository.

Use the index or search engine to locate candidate files. For each candidate, read a coherent file snapshot through the source service. Verify the match against those snapshot bytes; discard stale index hits that no longer match. Generate tags from that snapshot, not from text copied out of an index preview.

Expand context, merge overlapping spans within the same file and snapshot, and deduplicate repeated hits on the same line. Preserve exact source text. Keep highlighting as separate metadata so color codes or markup never contaminate replacement content.

Apply the model-facing output budget. Rows omitted or truncated at this stage MUST NOT enter delivered-span state. Store the actual emitted result envelope and delivery registration together, or make registration reproducibly idempotent for response replay.

Retain the result set and its file snapshots for continuation. A cursor binds result-set identity, query profile, and next position. Reading page two must not silently rerun page one against a different workspace and shift offsets.

The edit service accepts search-issued snapshot references without a second mandatory read, but still checks complete visibility and current version before commit.

## 5. Reference pseudocode

```text
function search_source(agent, request):
    query = validate_query_profile(request)
    candidates = search_backend.find_candidates(query)
    results = []
    for candidate in candidates:
        snapshot = source_service.capture(candidate.resource)
        matches = search_exact_snapshot(snapshot, query)
        spans = merge_context_spans(matches, request.context)
        results.extend(render_exact_rows(snapshot, spans))
    frozen = persist_result_set(query, results, candidates.coverage)
    page = select_under_budget(frozen, request.output_budget)
    register_only_complete_delivered_rows(agent, page)
    return page with completeness and continuation

function edit_search_hit(agent, edit_request):
    return ordinary_source_edit_validator(agent, edit_request)
```

The implementation may stream and freeze results incrementally, but each continuation must retain the same ordering and snapshot bindings for already materialized results. Document additional incomplete-search behavior rather than calling it a complete frozen result set.

## 6. Worked example

The agent searches for `timeout`. Search returns one complete row, `12:ab|timeout = 5000`, under `snap_42`. The agent can replace that row immediately using `snapshot_id="snap_42"` and `from=to="12:ab"`.

A second result shows only a 200-byte excerpt of a 30 KB line. It is labeled uneditable and has no tag. That result requires full-line retrieval or a separately designed sub-line edit operation.

If the agent requests a range from line 12 through line 20 after seeing only line 12 and line 20, the standard edit tool rejects `UNSERVED_RANGE`. The optimization removes redundant reads, not necessary ones.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `SEARCH_INCOMPLETE` | Scope was not fully examined. | Continue or narrow the query. |
| `RESULT_SET_EXPIRED` | Frozen results or snapshots were reclaimed. | Search again; old cursors cannot be reused. |
| `CURSOR_QUERY_MISMATCH` | Continuation belongs to another query/profile. | Use its original query or restart. |
| `UNEDITABLE_PREVIEW` | Complete source was not delivered. | Read the full relevant lines. |
| `STALE_INDEX_HIT` | Candidate location no longer matches. | Revalidate current snapshot or refresh index. |
| `STALE_SNAPSHOT` | Source changed after result capture. | Search/read current content and reconstruct the edit. |

A normal no-match result is not an error. It must still state the actual searched scope and whether the search completed.

## 8. Integration and lifecycle

This guide builds directly on [Hashline read/edit](01-hashline-read-and-edit.md). Share one snapshot service, one anchor generator, and one delivered-span registry; implementing three slightly different hash routines is a correctness defect.

[Repository maps](05-structural-repository-maps.md) can prioritize candidate locations but their summaries do not count as delivered source. [Observation handles](02-addressable-observations.md) can store large search result sets. [Checkpoints](11-execution-checkpoints.md) may pin active results but cannot make their source versions current.

When a search result is served from cache, register its emitted rows for the current agent scope. A cache hit from another agent does not implicitly transfer delivered-span records. A cached result must retain and disclose its original source snapshots.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Full single-line hit followed by edit | No redundant read is required. |
| Highlighted hit | Source bytes remain unchanged by presentation. |
| Long truncated line | No editable anchor is issued. |
| Endpoint-only search result | Replacing unseen interior is rejected. |
| Multiple hits on same line | One source row with multiple match ranges. |
| Stale index location | Tags come from revalidated snapshot content. |
| File changes between pages | Already frozen results keep their original versions. |
| Output budget drops rows | Dropped rows do not count as delivered. |
| Unicode search | Match offsets follow the declared UTF-8 byte convention. |
| Cached result served to another agent | Visibility state is explicitly registered for that agent. |

## 10. Metrics and rollout

Measure edits completed directly from search, read calls avoided, stale result rejection, search recall, and total task tokens. Also track accidental edits to incomplete source; the target is zero, not a statistical reduction.

Start with literal search and complete-line results. Add regular expressions, multi-file streaming, and index acceleration only after snapshot tests pass. Compare with a mandatory-read baseline on tasks requiring both single-line and larger contextual edits.

## 11. Implementation checklist

- [ ] Reuse the read/edit source snapshot and anchor services.
- [ ] Verify indexed candidates against exact source snapshots.
- [ ] Separate highlighting from editable text.
- [ ] Register only complete, actually emitted rows.
- [ ] Bind pagination to result identity and query semantics.
- [ ] Preserve normal edit validation and conditional commits.

## 12. References and further reading

[1] [Can Boluk, The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/) - the compact source-line reference format used by the companion edit guide.

[2] [Anthropic, Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) - tool interface design and useful response context. Editable search and delivered-span registration are the proposed integration in this document.
