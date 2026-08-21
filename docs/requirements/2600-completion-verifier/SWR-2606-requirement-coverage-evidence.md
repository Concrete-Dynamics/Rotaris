---
req-id: SWR-2606
status: approved
trace: required
test: required
title: "Requirement-coverage evidence in the child report"
epic: SWR-2600
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-2606 — Requirement-coverage evidence in the child report

The completion gate (SWR-2604) proves that the **project's** check suite ran and passed.
It says nothing about whether the **requirements the iteration touched** have named
evidence. An agent can edit a module that implements SWR-1234, leave that requirement's
covering test untouched and un-run, and still pass the gate because the suite as a whole
is green.

That gap is the difference between "the build is fine" and "this change is accounted for",
and closing it is the substance of the requirements-native positioning: *every touched
acceptance criterion has named evidence*.

Requirement: after a code-modifying iteration, the runner computes requirement-coverage
evidence and attaches it to the child report.

- The requirements touched by the iteration are derived from the files it changed, via the
  implementation-site index ReqToCode already builds (`coverage_map` / `requirement_coverage`,
  SWR-2336). A changed file with one or more `@traces` references contributes those
  requirement ids.
- For each touched requirement, the evidence records: its id, status and title; the
  implementation sites in the changed set; its covering tests; and **whether those covering
  tests were executed by this iteration's check suite**. A requirement whose covering test
  exists but did not run is *not* the same as one that was verified, and the two must be
  distinguishable without reading the logs.
- **A claim about one test requires an observation of that test.** A check result
  is a *suite-level* fact, and only two inferences carry from it to a *test-level*
  claim on their own: a check that passed while selecting everything it reached
  ran and passed every test in those files, and a check that never reached a file
  ran none of it. Everything else — a check that failed, one that was killed by
  its timeout, one that passed while narrowing the selection inside a file — leaves
  the individual test **unobserved**, and the evidence says so rather than naming
  it. Unobserved is a third answer beside passed and failed: it still refuses
  `Done`, because the completion gate answers the suite's own failure separately
  (SWR-2604), and it never names a test as the cause of a refusal it did not
  cause. Where a per-test report exists (SWR-2622) it answers first, which is what
  turns an unobserved test back into a named one.
- A touched requirement with **no** covering test at all is reported as uncovered, naming
  the requirement rather than only a count.
- The field is **runner-owned**: written by the runner alone, stripped from LLM output by
  the summary agent's payload normalization exactly as `verifier_results`,
  `completion_gate` and `repair` already are. A summarizing model must not be able to
  claim coverage it did not produce.
- Absent or unavailable coverage data (no ReqToCode store in the workspace, an unreadable
  index) yields `None` — "not computed" — never an empty result that reads as "nothing was
  touched".

This requirement **reports**; it does not gate. Making a missing acceptance criterion block
completion is a later decision, and doing both at once would make an unadopted workspace
un-runnable.

## Acceptance criteria

- An iteration that edits a traced module reports that module's requirements, with their
  covering tests and whether those tests ran.
- An iteration whose check suite was killed by its timeout names **no** covering
  test as failed; every requirement it reached is reported as unobserved.
- An iteration whose suite passed while narrowing the selection inside a file
  (`-k`, `--lf`, a node id) does not report that file's other covering tests as
  verified.
- An iteration that edits a traced module whose requirement has no covering test names
  that requirement as uncovered.
- A workspace with no requirement store produces `None`, and the run is otherwise
  unaffected.
- The summary agent cannot author or overwrite the field — asserted, not assumed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Touched-requirement derivation from a changed file set; covering-test execution matched against check-suite results; uncovered requirement named; absent store yields `None` | The evidence builder | `tests/unit/verifier/test_requirement_evidence.py` |
| Integration | A scripted iteration that edits a traced module produces the evidence on its report, and a summary-agent payload claiming coverage is stripped | Runner + report + summary normalization | `tests/integration/test_requirement_evidence.py` |
| User-flow E2E | A user runs a task that changes traced code and sees, in the child report, which requirements it touched and which of them are verified | Public product boundary → user-observable result | `tests/integration/test_requirement_evidence.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
