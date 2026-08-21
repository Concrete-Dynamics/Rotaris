---
req-id: SWR-2603
status: approved
trace: required
test: required
title: "Verifier evidence in the child report"
epic: SWR-2600
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2603 — Verifier evidence in the child report

The `ChildReportArtifact` MUST carry the deterministic verifier results
(SWR-2602) as a structured field, distinct from the LLM-summarized `tests` and
`errors` fields.

- New field (e.g. `verifier_results`): list of per-check results with name,
  status (`passed`/`failed`/`timeout`/`skipped`), duration, and output
  excerpt; plus the overall verdict and the suite source (SWR-2601).
- The field is populated by the verifier runner, never by the SummaryAgent —
  LLM summarization MUST NOT be able to overwrite or fabricate it.
- Existing sessions/reports without the field remain loadable (backward-
  compatible default, consistent with `SessionState` field policy).
- The parent agent and the host UIs read verification state from this field,
  keeping the child-report-as-contract principle intact.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Field schema; verdict derivation; backward-compatible default | Report model | `tests/unit/test_verifier_evidence.py` |
| Integration | Runner populates the field; SummaryAgent output cannot mutate it | Verifier → report assembly | `tests/integration/test_verifier_report_evidence.py::test_an_iteration_that_edited_files_carries_the_check_results_in_its_report`, `::test_a_blocking_failure_reaches_the_report_as_a_failed_verdict`, `::test_a_summary_agent_that_fabricates_verifier_results_cannot_write_them` |
| User-flow E2E | Covered by the SWR-2604 E2E flow (report evidence drives the visible completion outcome) | Public product boundary → user-observable result | shared with SWR-2604 |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
