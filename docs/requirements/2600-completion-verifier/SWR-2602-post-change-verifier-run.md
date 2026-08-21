---
req-id: SWR-2602
status: approved
trace: required
test: required
title: "Post-change verifier execution"
epic: SWR-2600
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2602 — Post-change verifier execution

After any Ralph-Loop iteration (or delegated child) whose tool activity
modified workspace files, the resolved check suite (SWR-2601) MUST execute
before the iteration outcome is finalized.

- Change detection uses the session's tracked file operations, not a full git
  scan: the iteration's mutating tool-call delta (`write_file`, `haet_edit`,
  `git_commit`) unioned with the edited/created files the `ChildReportArtifact`
  declares. Either signal alone triggers the suite, so an edit made through a
  tool the report does not describe — or a report that omits its edits — cannot
  silently suppress verification.
- Checks run sequentially in configured order through the standard terminal
  execution path, so outcome classification (`tools/terminal_outcome.py`),
  permission policy (SWR-2501), and sandboxing (SWR-2507) apply unchanged.
- Iterations without file modifications skip the suite; the skip and its
  reason are recorded.
- Each check yields a structured result: name, command, exit status, duration,
  and a bounded output excerpt (full output referenced via artifact/log path).
- The suite runs once per Ralph iteration, after the root child and everything
  it delegated has finished — delegated edits are covered by that single run
  rather than re-running the suite per delegated child.
- A check the permission policy denies is recorded as `skipped` with the
  violated rule as its reason; it is never reported as passed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Trigger decision from tracked file ops; result structure; ordering; skip/denial reasons; bounded excerpt | Verifier runner API | `tests/unit/test_verifier_change_detection.py`, `tests/unit/test_verifier_runner.py` |
| Integration | Iteration with edits triggers the suite; read-only iteration skips it with a recorded reason; a blocking failure is recorded as a warning | Ralph loop → verifier seam | `tests/integration/test_verifier_post_change_run.py::test_an_iteration_that_edited_files_runs_the_configured_check_suite`, `::test_a_read_only_iteration_skips_the_suite_and_records_the_reason`, `::test_a_failing_blocking_check_is_recorded_as_a_warning_in_the_session_output` |
| User-flow E2E | A run that edits a file executes the configured checks and the results are visible in the session output | Public product boundary → user-observable result | `tests/integration/test_verifier_post_change_run.py::test_a_run_that_changes_files_executes_the_real_configured_check` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
