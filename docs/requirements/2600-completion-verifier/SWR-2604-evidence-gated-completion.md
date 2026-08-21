---
req-id: SWR-2604
status: approved
trace: required
test: required
title: "Evidence-gated completion classification"
epic: SWR-2600
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2604 — Evidence-gated completion classification

Completion classification (`ralph/completion_classifier.py`) MUST be hard-gated
by verifier evidence: an iteration/task that modified files can only be
classified `completed` when the report's verifier verdict (SWR-2603) shows all
`blocking` checks passed.

- A failed or missing blocking check forces the classification to a
  non-complete outcome, regardless of what the LLM classifier concludes — the
  gate is deterministic and applied after the LLM step. Within an executed
  suite, "missing" means any blocking check that did not pass: failed, timed
  out, or never run because the permission policy (SWR-2501) denied it.
  A gated iteration is reported as `partial`, which re-queues the task.
- Advisory check failures do not block completion but are carried in the
  report and surfaced to the user.
- Tasks without file modifications (research/answer tasks) are exempt from the
  gate; the exemption reason is recorded. A suite that did not run at all is
  likewise exempt rather than gated — a workspace that declares no verification
  (`verifier.checks: []`), one where no suite could be detected, and the
  degraded path where the verifier itself failed must not become a re-queue
  loop.
- The gate decision (gated/passed/exempt) is visible in session diagnostics
  and the event stream (SWR-1828).
- Gating is on by default and can be disabled per workspace
  (`verifier.gate_completion: false`), which keeps the checks running and the
  evidence reported while letting the LLM verdict stand.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Gate matrix: blocking fail / advisory fail / pass / exempt × LLM verdicts | Gate logic | `tests/unit/test_completion_gate.py` |
| Integration | Classifier output is overridden to non-complete on blocking failure | Completion classifier seam | `tests/integration/test_verifier_completion_gate.py` |
| User-flow E2E | A run whose change breaks a blocking check does not report success; after the fix the same run completes | Public product boundary → user-observable result | `tests/integration/test_verifier_gate_e2e.py::test_a_run_that_breaks_a_blocking_check_completes_only_after_it_is_fixed` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
