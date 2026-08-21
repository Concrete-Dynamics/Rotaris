---
req-id: SWR-2622
status: approved
trace: required
test: required
title: "Per-test results are ingested through one stable port"
epic: SWR-2600
priority: P0
date: 2026-08-20
---

# SWR-2622 — Per-test results are ingested through one stable port

SWR-2606 established what a check result licenses us to say about one test, and
the honest answer without a per-test observation is `unknown`. That is correct
and it is a floor, not a destination: a workspace whose suite goes red for one
broken test now reports *every* requirement it touched as unobserved, which is
truthful and nearly as unhelpful as the false failures it replaced.

The missing input is the thing test runners already produce and Rotaris never
read: a machine-readable report naming each test and what happened to it.

Requirement: Rotaris carries **one** port for per-test results, and every way of
obtaining them — built in, configured, or authored — produces that same value.

- The port is `TestCaseResult` (`file`, `name`, `line`, `outcome`, `duration_s`)
  and `TestRunReport` (`check_name`, `cases`, `complete`, `adapter`). `file` and
  `name` are both optional individually and at least one is required: a runner
  that reports only names is still worth ingesting.
- **Built-in parsers cover the formats runners already emit**, chosen by the
  shape of the artefact rather than by the language of the project: JUnit XML
  (pytest, jest, vitest, cargo-nextest, gradle/surefire, rspec, phpunit, ctest,
  dotnet), `go test -json`, `cargo test --message-format=json`, and pytest's
  `--report-log`. Parsing is stdlib-only; a new format must not become a new
  dependency.
- **Discovery never mutates the user's command.** A report path named in the
  command is used; otherwise conventional locations are scanned, restricted to
  files written during that check's own run so a stale artefact from last week
  can never be read as this run's evidence.
- **Attribution degrades, it does not cliff-edge.** A case is matched to a
  covering test on the most specific key available — `(file, name)`, then
  `(file, line)`, then `file`. Where only file-level information exists, a
  failure in that file makes every covering test in it *inconclusive* rather than
  failed: the over-blame SWR-2606 removed must not reappear at smaller scale.
- **An incomplete report may narrow, never credit.** When the report does not
  account for the whole selection the runner was given (`complete: false`), a
  case it does not name stays `unknown`; only a complete report can turn an
  unobserved test into a verified one.
- A report never overrides the suite's own verdict. The completion gate answers
  a red suite separately (SWR-2604), so no report can turn a red run green — it
  can only say *which* tests the run was red about.

## Acceptance criteria

- A JUnit XML report written by this run turns a red suite's per-test evidence
  from `unknown` into the failing cases it names, with the rest verified.
- An artefact older than the run is ignored.
- A report naming only files makes that file's covering tests inconclusive on a
  failure, and never blames one of them individually.
- An incomplete report cannot promote an unnamed test to verified.
- A workspace whose runner emits nothing readable behaves exactly as SWR-2606
  leaves it.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | One fixture per built-in format parses to the same port value; a malformed artefact yields nothing; a stale artefact is ignored | Ingestion port | `tests/unit/verifier/test_test_results.py` |
| Unit | The matching ladder — `(file, name)` → `(file, line)` → `file` — and the incomplete-report rule | Attribution | `tests/unit/verifier/test_test_results.py`, `tests/unit/verifier/test_requirement_evidence.py` |
| Integration | A red suite with a JUnit report yields precise per-test blame on the board, and the same run without one yields `result-unknown` | Runner → evidence → projection | `tests/integration/test_requirement_evidence.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
