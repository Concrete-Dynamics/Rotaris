# Addressable Observations and Lazy Result Retrieval

Keep complete tool results outside the prompt while exposing bounded, inspectable, provenance-preserving views.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Replace large inline tool responses with a small result envelope and a durable retrieval handle. The model receives outcome metadata, a useful excerpt, and a way to inspect omitted content. The runtime retains the full result.

MCP supports tool resource links and structured result content [1]. These provide useful transport mechanisms, but they do not automatically define retention, paging, completeness, or search semantics. This guide supplies those contracts independently of MCP.

An **observation** describes an execution result: who produced it, when, against which inputs, and with which outcome. An **artifact** is immutable payload bytes. Two executions may share one artifact but MUST retain distinct observation identities.

## 2. Design contract and invariants

Every returned observation handle MUST refer to retrievable state with an advertised lifetime. Summarization MUST NOT overwrite the raw payload. A partial display MUST explicitly say what was omitted; a partial capture must additionally say that omitted data cannot be retrieved.

Pagination operates on an immutable observation version. A subsequent page MUST NOT read a newly executed command or changed remote response. An empty search result means "no matches in the searched scope," not "no matches anywhere."

Tool outcome, capture completeness, and display completeness are separate fields. A failed tool may produce a complete log; a successful command may have a truncated capture. A generated summary is an interpretation and MUST be labeled as such.

## 3. Data model and tool interface

```json
{
  "observation_id": "obs_31",
  "version": "1",
  "producer": {"tool": "run_tests", "call_id": "call_7"},
  "outcome": "failed",
  "capture": {"complete": true, "bytes": 183422, "lines": 4281},
  "display": {"complete": false, "returned_lines": [[1, 8], [4250, 4281]]},
  "summary": {"kind": "deterministic", "failed": 17, "passed": 243},
  "artifact_id": "artifact_17",
  "retained_until": "2026-09-22T20:30:00Z"
}
```

```text
read_observation(id, version, start_line=1, max_lines, max_bytes)
read_observation_bytes(id, version, offset=0, max_bytes)
search_observation(id, version, query, mode, cursor?, max_matches)
inspect_observation(id)
pin_observation(id, owner, lifetime)
```

Line APIs use 1-based logical lines; byte APIs use zero-based half-open byte ranges. Binary content exposes only byte or typed views. Text views declare encoding and decoding policy. Structured JSON views may support a versioned pointer/query syntax; they are projections, not replacements for raw data.

## 4. Implementation workflow

Capture output into bounded storage while the producer runs. When complete, finalize an immutable payload and record producer identity, source resource versions, status, timestamps, encoding, and any capture loss. Publish the handle only after retrieval state exists.

Derive summary fields from machine-readable output when available. If parsing fails, return `summary.kind="unavailable"`; do not invent pass/fail counts from arbitrary log fragments. A model-generated summary should include its own producer/version and pointers to supporting excerpts.

Select the initial view under a fixed token or byte budget. Prefer an outcome header and targeted evidence, with head/tail fallback. Record the exact ranges shown and keep retrieval controls outside excerpts so output truncation cannot remove them.

Build a line index lazily or while capturing. Page results include `next_start_line` or an opaque cursor only when additional content exists. Search cursors bind query, mode, observation version, and continuation position. Bound regular-expression execution or offer literal search as the baseline.

A gigantic single line must not cause unlimited prompt output. Return a byte window or explicitly truncated line without claiming the whole line was delivered.

## 5. Reference pseudocode

```text
function publish_result(execution, byte_stream):
    capture = spool_with_limits(byte_stream)
    artifact = artifact_store.finalize(capture.bytes)
    observation = persist_envelope(execution, artifact, capture.completeness)
    summary = parse_known_result_format_or_mark_unavailable(observation)
    view = select_excerpt(observation, summary, output_budget)
    return envelope_with_view(observation, summary, view)

function read_observation(request):
    observation = resolve_exact_version(request.id, request.version)
    require observation.is_retained else OBSERVATION_EXPIRED
    view = read_immutable_range(observation, request)
    return view with exact_coverage and continuation

function search_observation(request):
    scope = validate_cursor_binding(request)
    matches, coverage, next_cursor = bounded_search(scope)
    return matches with searched_coverage, complete, next_cursor
```

## 6. Worked example

A test run generates 4,281 lines. The initial tool response returns the observation handle, deterministic counts, and the failure summary near the end. The model searches `obs_31` for a failing test name, then reads twenty surrounding lines.

All three views refer to observation version `1`. They do not rerun tests. The raw log remains available for later audit. If the harness captured only the first 10 MB because of a quota, `capture.complete=false` prevents a search of retained bytes from being mistaken for a search of the entire original output.

A second identical run creates `obs_32`. Its payload may deduplicate to the same artifact, but it has a different execution time, call identity, and provenance.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `OBSERVATION_EXPIRED` | Retrieval lifetime ended. | Re-execute only when doing so is safe, or retrieve an archived copy. |
| `VERSION_MISMATCH` | Cursor or request names another version. | Inspect the observation; do not silently switch versions. |
| `CAPTURE_INCOMPLETE` | Some producer bytes were never retained. | Report coverage and rerun with a different capture policy if justified. |
| `SEARCH_BUDGET_EXCEEDED` | Search stopped before covering the scope. | Continue with returned cursor or narrow the query. |
| `UNSUPPORTED_VIEW` | Requested text/structured view cannot be produced. | Use byte access or another supported projection. |
| `STORAGE_UNAVAILABLE` | Payload cannot currently be read. | Retry retrieval; avoid replaying the original side effect. |

## 8. Integration and lifecycle

Use [content-addressed artifacts](12-content-addressed-artifacts.md) as an optional payload backend. [Process output](03-process-handles-and-output-cursors.md) remains mutable while running; finalize it into an immutable observation after capture closes.

Checkpoints and mutation receipts must pin observations they need. Garbage collection must honor those references. A cache hit can reference an existing observation but should disclose its original execution time and inputs.

When transport requires both structured content and text, avoid sending two full copies of the payload. Put the compact envelope and retrieval instructions in the model-visible representation, with raw content behind a supported resource handle. Exact adapter behavior depends on the transport [1].

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Repeated page read | Same version and range return identical content. |
| Search pagination | Complete traversal has no skipped or duplicated matches. |
| Unicode crossing byte window | Text decoding is explicit and does not corrupt stored bytes. |
| Single oversized line | Output budget holds; truncation is disclosed. |
| Capture quota reached | Capture and display completeness differ correctly. |
| Unparseable test output | No fabricated summary counts. |
| Expired handle | Clear error, not a new live execution. |
| Pinned observation during collection | Payload remains retrievable. |
| Two equal executions | Distinct observations may share one artifact. |
| Read failure after mutation | Retrieval retry does not repeat the mutation. |

## 10. Metrics and rollout

Track inline tokens per tool result, retrieval round trips, search success, expired-handle failures, capture loss, and end-to-end task success. Reducing the first response too aggressively can increase latency and total tokens through repeated retrieval.

Start with large test/build/HTTP results. Keep small results inline. Compare several excerpt budgets and retain a full-output baseline. Evaluate whether agents locate decisive evidence rather than merely whether prompts became shorter.

## 11. Implementation checklist

- [ ] Separate observation provenance from immutable payload identity.
- [ ] Publish explicit capture and display completeness.
- [ ] Implement version-bound reading, search, and continuation.
- [ ] Preserve raw output alongside summaries and projections.
- [ ] Define retention, pinning, quotas, and expired-handle behavior.
- [ ] Test paging, Unicode, capture loss, and duplicate executions.

## 12. References and further reading

[1] [MCP tool results, resource links, and structured content](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) - transport concepts that can carry an observation envelope. This reference is pinned to a dated specification, not asserted to be the newest revision.

[2] [Anthropic, Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) - practical discussion of bounded responses, meaningful context, and tool evaluation. The specific observation protocol here is a proposed design.
