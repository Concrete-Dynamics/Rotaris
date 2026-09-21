# Change-Aware Verification

Run relevant checks early while preserving explicit coverage, conservative dependency analysis, and final verification requirements.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Choose useful checks from the actual change set instead of repeatedly running every available test, linter, and build step after every edit. Escalate from inexpensive local checks to broader verification under an explicit completion policy.

Nx documents affected-task selection from changed files and a dependency graph [1]. Bazel documents action inputs and reusable build results [2]. These are reference mechanisms, not guarantees that any arbitrary repository graph captures every runtime dependency.

The goal is faster informative feedback, not a weaker definition of success. Passing selected checks establishes only that those checks passed on the recorded inputs.

## 2. Design contract and invariants

Every plan MUST identify its input manifest, change baseline, graph version, selection rules, and requested checks. Every result MUST distinguish passed, failed, skipped, not run, and inconclusive checks.

Dependency uncertainty MUST broaden verification or be disclosed. An incomplete symbol map is not a sound basis for excluding tests. Configuration, toolchain, fixture, schema, generated-code, and dependency-lock changes can affect more than the edited source file.

Verification evidence MUST bind to the tested source and environment. A result from before a later edit is historical evidence, not proof about the new workspace. A cancelled or partial run cannot be represented as a successful complete suite.

Final acceptance requirements remain independent of incremental optimization. If the project requires a full integration suite before merge, the harness must still run it at that boundary.

## 3. Data model and tool interface

```text
VerificationPlan {
  plan_id, baseline_manifest, candidate_manifest, graph_version,
  changed_resources[], global_input_changes[],
  selected_checks[], selection_reasons[],
  unresolved_dependencies[], escalation_policy, final_gate_policy
}
CheckResult {
  check_id, input_manifest, environment_manifest,
  requested_scope, executed_scope, skipped_scope,
  outcome, complete, exit_status, observation_id, diagnostic_set_id?
}
```

```text
plan_verification(baseline, candidate, objective="incremental")
run_verification(plan_id, phase?)
inspect_verification(plan_id)
validate_final_gate(candidate_manifest)
```

Graph edges must have a defined direction. In this profile, `A depends_on B` means a change in B can affect A, so selection traverses reverse dependency edges from changed resources to their dependents.

## 4. Implementation workflow

Capture the actual candidate workspace, including dirty and relevant untracked files, and compare it with a named baseline. Include deletions, renames, generated outputs, fixtures, and configuration changes, not just modified source paths reported by one editor.

Use the union of relevant old and new dependency information. Deleted files may have dependents in the old graph that disappear from the new graph; consulting only the new graph can miss them. If a required graph cannot be built or its coverage is incomplete, broaden to package- or repository-level checks.

Map changed inputs to directly affected modules, then traverse reverse dependencies. Add checks associated with affected units. Global configuration, toolchain, lockfile, or test-discovery changes follow explicit broadening rules. Conservative "run all" is an acceptable baseline when precision is not reliable.

Build an escalation plan: syntax/format checks, local unit tests, affected package checks, then required integration/full-suite gates. This order is configurable and must respect dependencies between checks. Do not run a test before its required generation/build step merely because it is cheap.

Execute against an immutable workspace snapshot when possible. Otherwise validate input versions before and after the run and reject evidence if relevant inputs changed. Record environment and external-service assumptions; integration tests with mutable external dependencies may not be safely cacheable.

Parse structured outcomes and executed test inventories. Exit code zero with no selected tests is not equivalent to all expected tests passing. Feed exact coverage into diagnostic deltas so old failures outside the executed scope remain unverified.

At the task's completion boundary, evaluate the final gate against the final manifest. Re-run any required evidence invalidated by subsequent edits. Report remaining unexecuted checks explicitly when completion policy is not met.

## 5. Reference pseudocode

```text
function plan(baseline, candidate, graph_before, graph_after):
    changes = complete_manifest_diff(baseline, candidate)
    if changes.touch_global_inputs or graph_coverage_is_uncertain:
        affected = conservative_broad_scope(changes)
    else:
        graph = union_for_change_analysis(graph_before, graph_after)
        affected = reverse_dependency_closure(graph, changes.resources)
    checks = checks_for(affected) plus mandatory_policy_checks(changes)
    return versioned_plan(checks, reasons, candidate, escalation_policy)

function run_check(check, candidate):
    environment = capture_check_environment(check)
    result = execute_against_snapshot(check, candidate, environment)
    coverage = verify_actual_executed_scope(result, check.expected_scope)
    return evidence(candidate, environment, result, coverage)

function final_gate(final_manifest, evidence, policy):
    required = policy.required_checks(final_manifest)
    return all_required_have_current_complete_success(required, evidence)
```

## 6. Worked example

A change to a tax-calculation module selects its unit tests and the invoice package that depends on it. It does not initially run unrelated image-processing tests. A receipt records the source edit, and the verification plan names the exact post-edit manifest.

The next change modifies shared test configuration. The conservative rule broadens verification to all affected packages or the full configured suite, even though the diff is only one line.

Later, another source edit occurs after the selected tests pass. The earlier evidence remains visible but is invalid for the new manifest where inputs changed. The final gate requests fresh relevant checks instead of carrying forward a generic "tests passed" flag.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `DEPENDENCY_GRAPH_INCOMPLETE` | Selection cannot safely exclude units. | Broaden scope and disclose the reason. |
| `BASELINE_UNAVAILABLE` | Change comparison lacks a reliable starting point. | Use a known baseline or conservative full verification. |
| `VERIFICATION_INPUTS_CHANGED` | Source/environment changed during the run. | Discard current-validity claim and rerun on stable inputs. |
| `NO_TESTS_EXECUTED` | Filter/discovery produced no expected work. | Inspect discovery and distinguish legitimate empty scope from misconfiguration. |
| `CHECK_INCONCLUSIVE` | Crash, timeout, missing service, or incomplete capture. | Preserve uncertainty; do not mark pass or resolved. |
| `FINAL_GATE_UNSATISFIED` | Required checks lack current successful evidence. | Run missing checks or report incomplete verification. |

## 8. Integration and lifecycle

[Repository maps](05-structural-repository-maps.md) help navigation, but only semantically appropriate dependency data should guide exclusion. [Process handles](03-process-handles-and-output-cursors.md) run checks and retain logs. [Diagnostic deltas](04-diagnostic-fingerprints-and-deltas.md) use the executed-scope report.

[Tool-result caching](10-version-aware-tool-result-caching.md) may reuse deterministic check results only when complete inputs match. A path or commit hash alone is usually insufficient for a dirty workspace. Cache hits must still identify the historical execution and validated input equivalence.

[Checkpoints](11-execution-checkpoints.md) retain verification evidence and unmet gates. Store plan manifests and reasons so a developer can understand why a check was omitted. Do not turn a heuristic selection score into a correctness proof.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Leaf module changes | Direct checks and reverse dependents are selected. |
| Shared dependency changes | All known dependents enter affected scope. |
| Deleted source file | Old-graph dependents are not lost. |
| Lockfile/toolchain/config changes | Explicit global broadening rule applies. |
| Dynamic dependency unresolved | Unknown edges do not justify excluding tests. |
| Relevant untracked fixture added | Candidate manifest and selection include it. |
| Source changes during test run | Result is not accepted as current verification. |
| Zero discovered tests | Not silently labeled a complete success. |
| Partial/cancelled test run | Unexecuted diagnostics are not resolved. |
| Later edit after passing checks | Final gate invalidates affected evidence. |
| Cached verification | Complete source/environment inputs match before reuse. |

## 10. Metrics and rollout

Track time to first useful failure, verification compute, selected-check fraction, false-negative selection, and final-gate success. Measure false negatives by running broader suites on a sample of the same candidate manifests and comparing missed failures.

Start conservatively at package granularity. Add finer selection only where dependency coverage and test mappings support it. Maintain mandatory full verification at appropriate boundaries until evidence supports a narrower policy; do not silently weaken existing project requirements.

## 11. Implementation checklist

- [ ] Capture complete baseline and candidate manifests.
- [ ] Define edge direction and use old/new dependency information.
- [ ] Broaden scope for global inputs and uncertain dependencies.
- [ ] Record actual executed coverage and stable tested inputs.
- [ ] Keep incremental feedback separate from final acceptance gates.
- [ ] Validate selection against sampled broader verification runs.

## 12. References and further reading

[1] [Nx, Run only tasks affected by a PR](https://nx.dev/docs/features/ci-features/affected) - dependency-aware affected selection and configurable behavior around broader input changes.

[2] [Bazel, Remote caching](https://bazel.build/remote/caching) - explicit action inputs and reusable results. Sound input modeling is required before verification reuse is trustworthy.
