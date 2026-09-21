# Diagnostic Fingerprints and Delta Results

Present debugging progress as new, persistent, resolved, and unverified diagnostics without losing occurrence identity or coverage.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Avoid returning every unchanged compiler, linter, and test failure after each edit. Normalize diagnostic records, correlate them across comparable runs, and return a bounded delta with handles for full detail.

GitHub's SARIF integration uses partial fingerprints to help track logically identical results across analyses [1]. This guide extends that general idea into a harness-facing delta protocol. It does not claim that SARIF defines the exact matching algorithm or categories below.

The optimization is lossless at the storage layer: preserve each complete run and raw report. A shorter display must not convert "not checked" into "fixed."

## 2. Design contract and invariants

Diagnostic identity MUST distinguish repeated occurrences. Two identical messages in different locations are not automatically one issue. Fingerprints are candidate-matching keys, not unquestionable proof of identity.

A diagnostic may be classified as resolved only when the new run completed the relevant check over the relevant unit under comparable configuration and no matching issue remains. Aborted runs, missing files, skipped tests, and changed filters MUST NOT create false resolutions.

Run identity, source snapshot, analyzer identity/version, configuration digest, and execution coverage MUST accompany each diagnostic set. Deltas identify their baseline set explicitly. Comparing incompatible analyzers or normalization profiles requires a new baseline or an explicit migration.

## 3. Data model and tool interface

```text
Diagnostic {
  occurrence_id, rule_id, severity, message, normalized_message,
  resource_id, source_snapshot, range, symbol_context?,
  fingerprint, fingerprint_profile, raw_record_reference
}
DiagnosticSet {
  set_id, run_id, analyzer_version, configuration_digest,
  input_manifest, requested_scope, completed_units[],
  skipped_units[], failed_units[], capture_complete, diagnostics[]
}
```

```json
{
  "baseline_set": "diagset_10",
  "current_set": "diagset_11",
  "new": ["diag_C"],
  "persistent": [{"before": "diag_A", "after": "diag_A2"}],
  "resolved": ["diag_B"],
  "not_rechecked": ["diag_D"],
  "uncorrelated": [],
  "full_result": "obs_41"
}
```

```text
ingest_diagnostics(run_metadata, structured_report_or_raw_output)
compare_diagnostics(baseline_set, current_set)
inspect_diagnostic(set_id, occurrence_id)
list_diagnostics(set_id, filter?, cursor?, limit)
```

A unit can be a file/rule pair, test case, package, or another analyzer-defined coverage boundary. The adapter must define it; a generic set of filenames is insufficient for tools that skip checks within a file.

## 4. Implementation workflow

Prefer structured reports over parsing human-oriented terminal text. Record parser errors and coverage uncertainty. If only text is available, use a versioned parser and retain the original output for inspection.

Construct a canonical fingerprint input from analyzer family, rule identifier, logical resource identity, meaningful message parameters, and stable context where available. Exclude purely positional line numbers when reliable context exists. Do not strip every number: "expected 4, got 5" and "expected 4, got 6" may be different failures.

Normalize only explicitly documented volatile elements such as a known temporary-root prefix. Keep a fingerprint profile version so changes do not silently alter identity. Retain canonical fingerprint inputs to detect collisions and inspect bad normalization.

Match previous and current occurrences one-to-one. Use strong analyzer-provided identity when available, otherwise exact canonical fingerprints plus validated context. Never consume the same occurrence twice. When identical candidates cannot be disambiguated, mark the group uncorrelated rather than choosing the nearest line as a fact.

Compute persistence for matched occurrences. For unmatched prior occurrences, consult current completed coverage before declaring resolution. For unmatched current occurrences, report new or uncorrelated according to matching uncertainty. Unexecuted units remain `not_rechecked`.

Return counts and the most useful new/changed details under a display budget. The complete current set remains independently retrievable; a consumer missing the baseline must be able to request a full reset rather than interpret a delta alone.

## 5. Reference pseudocode

```text
function compare(before, after):
    require compatible_profiles(before, after) else BASELINE_INCOMPATIBLE
    matches, uncertain = correlate_one_to_one(before.records, after.records)
    delta.persistent = matches
    delta.uncorrelated = uncertain
    for old in unmatched_old_records_excluding_uncertain:
        if after.completed_same_check_for(old.unit):
            delta.resolved.append(old.id)
        else:
            delta.not_rechecked.append(old.id)
    delta.new = unmatched_new_records_excluding_uncertain
    return delta with before.set_id, after.set_id, coverage_summary
```

`completed_same_check_for` must inspect analyzer-specific coverage metadata, not infer completion from exit code alone. A nonzero exit can mean completed checks found issues; a zero exit can occur with all tests filtered out.

## 6. Worked example

Run A reports two failures in `cart` and one in `auth`. The agent edits `cart` and reruns only cart tests. One cart failure persists and the other disappears. The delta is one persistent, one resolved, and one not rechecked. The auth failure has not been fixed merely because it is absent from the new report.

A later full run succeeds. It can resolve the auth failure if the test inventory confirms that the relevant auth test executed. If that test was deleted or skipped, the report must disclose the coverage change rather than claim a passing execution.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `BASELINE_INCOMPATIBLE` | Tool/configuration/profile cannot be compared. | Return a full current set and start a new baseline. |
| `BASELINE_EXPIRED` | Previous diagnostic set is unavailable. | Reset to a full result. |
| `PARSE_INCOMPLETE` | Not every diagnostic was recognized. | Retain raw evidence and suppress unsupported resolution claims. |
| `COVERAGE_UNKNOWN` | Executed scope cannot be established. | Mark old issues unverified. |
| `AMBIGUOUS_MATCH` | Duplicate occurrences cannot be paired reliably. | Expose the group for inspection. |
| `STALE_SOURCE` | Source range refers to another snapshot. | Read that snapshot or refresh source context. |

## 8. Integration and lifecycle

Use [observations](02-addressable-observations.md) for raw reports and [editable source search](06-editable-search-results.md) to resolve current code locations. Diagnostic handles are not edit anchors: they describe findings from a particular run.

[Change-aware verification](13-change-aware-verification.md) supplies precise executed/skipped scope. [Checkpoints](11-execution-checkpoints.md) retain the current diagnostic set and outstanding unverified issues. Cache diagnostic sets only under complete versioned input keys.

Keep full sets long enough to reconstruct every displayed delta. If retention removes a baseline, invalidate dependent deltas or preserve a materialized full snapshot. Never require an indefinitely long delta chain to inspect current failures.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Line inserted above unchanged issue | Strong contextual identity can persist without using old line number. |
| Two identical messages in one file | Distinct occurrences remain distinct. |
| Deliberate fingerprint collision | Canonical data prevents silent merging. |
| Meaningful number in message changes | Normalization does not erase the difference. |
| Partial test rerun | Unchecked failures are not resolved. |
| Analyzer crashes midway | Completed and unknown units are distinguished. |
| Test filtered/deleted/skipped | Coverage change is disclosed. |
| Analyzer version/profile changes | Incompatible baseline is rejected or migrated explicitly. |
| Expired baseline | Full current result remains available. |
| Ambiguous duplicate mapping | No arbitrary one-to-one match is asserted. |

## 10. Metrics and rollout

Track correlation precision, false-resolution rate, duplicate-collapse rate, prompt tokens, and debugging completion time. Manually review a labeled sample of matching decisions; aggregate counts alone cannot expose wrong identity matches.

Initially display deltas alongside full reports to evaluators. Enable abbreviated model responses after coverage and matching tests pass. Treat a false resolution as a correctness defect, not an acceptable compression tradeoff.

## 11. Implementation checklist

- [ ] Preserve full runs, raw evidence, and analyzer/configuration versions.
- [ ] Define canonical fingerprint input and occurrence identity separately.
- [ ] Implement one-to-one matching with explicit ambiguity handling.
- [ ] Gate resolution on completed, comparable coverage.
- [ ] Support full-result reset when a baseline is missing.
- [ ] Test partial runs, duplicates, parser failures, and normalization changes.

## 12. References and further reading

[1] [GitHub, SARIF support for code scanning](https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support-for-code-scanning) - fingerprint-based result correlation and structured diagnostic metadata. The delta categories and conservative coverage rules here are this guide's contract.

[2] [Nx, Run only tasks affected by a PR](https://nx.dev/docs/features/ci-features/affected) - an example of scoped execution; useful background for understanding why absence from a partial report cannot establish resolution.
