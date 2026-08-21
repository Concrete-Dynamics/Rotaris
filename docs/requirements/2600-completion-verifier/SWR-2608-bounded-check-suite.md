---
req-id: SWR-2608
status: draft
trace: required
test: required
title: "Bounded, non-duplicated check suite"
epic: SWR-2600
priority: P1
date: 2026-08-11
---

# SWR-2608 — Bounded, non-duplicated check suite

A resolved check suite (SWR-2601) MUST NOT verify the same thing twice, and the
time one suite run can consume MUST be bounded by a single configured number
rather than by the sum of its per-check timeouts.

- Every check carries the semantic **role** it fills — `test`, `typecheck`,
  `lint`, or `other`. Auto-detection assigns the role from the marker it
  detected, so `pytest`, `npm test`, and `make test` all resolve to `test`.
- Auto-detection emits at most one check per role, first detector wins.
  A workspace with both a `pyproject.toml` and a `Makefile` therefore runs its
  test suite once, not once per marker. The suite's recorded `detections` list
  still names every marker that fired, so the audit trail in
  `state/run_config.json` does not lose the fact that a suppressed marker exists.
- Detector order stays python → node → make: a project-level `make` target is
  not assumed to be present on the host, so the portable invocation wins by
  default. A workspace that prefers its own targets states them explicitly under
  `verifier.checks`.
- A new `verifier.suite_timeout` (seconds, default 900, `None` to disable) caps
  one whole suite run. Each check's effective timeout is the lesser of its own
  timeout and the suite budget still remaining.
- When the budget is exhausted, the checks that have not started are recorded as
  `skipped` with the exhausted budget as their reason and are never launched. A
  skipped check is not a blocking failure, so an exhausted budget by itself never
  re-queues an iteration through the SWR-2604 gate.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A workspace carrying both `pyproject.toml` and a `Makefile` detects one check per role; every marker still appears in `detections`; `suite_timeout` resolves from config on the config and detected paths | Detection + suite resolution API | `tests/unit/test_verifier_detection.py`, `tests/unit/test_verifier_suite.py` |
| Unit | A suite whose budget runs out mid-run skips the remaining checks without launching them; a check's timeout is clamped to the remaining budget | Verifier runner API | `tests/unit/test_verifier_runner.py` |
| User-flow E2E | A run in a workspace with duplicate markers executes each kind of check once and the session output shows one result per role | Public product boundary → user-observable result | `tests/integration/test_verifier_post_change_run.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
