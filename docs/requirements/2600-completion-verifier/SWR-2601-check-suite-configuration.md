---
req-id: SWR-2601
status: approved
trace: required
test: required
title: "Check-suite configuration & auto-detection"
epic: SWR-2600
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2601 — Check-suite configuration & auto-detection

The verifier's check suite for a workspace MUST be definable in the workspace
config (`<workspace>/.rotaris/`): an ordered list of named checks, each with
a command, timeout, and severity (`blocking` | `advisory`).

- When no suite is configured, the system auto-detects a best-effort suite
  from workspace markers (e.g. `pyproject.toml` → pytest/ruff/mypy,
  `package.json` → npm test/lint, `Makefile` targets) and reports which
  detection was applied; an explicit config always wins over detection.
- An empty suite is legal but MUST be an explicit config statement
  (`checks: []`), so "no verification" is always a visible decision, never a
  silent detection failure.
- The resolved suite (source: config vs. detection) is recorded in the session
  snapshot.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Suite schema validation; detection per workspace marker; explicit-over-detected precedence | Suite resolver API | `tests/unit/test_verifier_suite.py`, `tests/unit/test_verifier_detection.py`, `tests/unit/test_config_loader.py::test_workspace_verifier_checks_override_global`, `::test_explicit_empty_checks_override_a_global_suite`, `::test_omitted_verifier_section_leaves_checks_unset` |
| Integration | Resolved suite lands in the session snapshot with its source | Config loader → session state | `tests/unit/test_session_manager.py::test_create_session_records_the_configured_check_suite`, `::test_create_session_records_a_detected_check_suite`, `tests/unit/test_session_diagnostics.py::test_run_config_records_the_resolved_check_suite_and_its_source`, `::test_run_config_distinguishes_an_explicit_empty_suite_from_a_failed_detection` |
| User-flow E2E | Covered by the SWR-2602 E2E flow (resolved suite runs and its results are user-visible) | Public product boundary → user-observable result | shared with SWR-2602 |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
