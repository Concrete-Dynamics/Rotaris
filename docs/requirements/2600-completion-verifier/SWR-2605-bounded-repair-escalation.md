---
req-id: SWR-2605
status: approved
trace: required
test: required
title: "Bounded repair loop & escalation"
epic: SWR-2600
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2605 — Bounded repair loop & escalation

When the completion gate (SWR-2604) blocks completion — the report is rewritten
to `partial` with a `gated` `completion_gate` decision — the loop MUST grant the
agent a bounded number of repair attempts and then escalate instead of retrying
indefinitely.

- The failing check results (SWR-2603) are injected into the repair attempt's
  context so the agent works from the actual failure output. The injected block
  replaces the previous attempt's, so a repeatedly re-queued task never
  accumulates stale failure output.
- Maximum repair attempts per task are configurable
  (`verifier.max_repair_attempts`, default: 2). Each attempt re-runs the
  verifier (SWR-2602). A budget of `0` reports the failure without retrying.
- After the limit, the task terminates as failed-verification and escalates:
  the report is `failed` with the unsatisfied checks named, which abandons that
  task without aborting the run — one persistently red check must not take the
  other tasks with it. Interactive hosts are offered the escalation through an
  observer hook so they can surface the failing checks for a user decision;
  headless runs record it in the final report (`repair`), on the diagnostics
  timeline, and later in the event stream (SWR-1828).
- Repair attempts count toward existing runtime safeguards (message limits,
  circuit breaker, the same-task iteration guard) — they do not bypass them.
- The budget is charged only on the gate's own re-queue path. A task re-queued
  by the todo state machine has its own correction payload and its own budget;
  charging both would make two budgets race for one task.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Attempt counting; limit config; escalation payload | Repair loop logic | `tests/unit/test_repair_decision.py` |
| Integration | Failure output injected into next attempt; verifier re-run per attempt; stop at limit | Ralph loop iteration path | `tests/integration/test_verifier_repair_loop.py` |
| User-flow E2E | A persistently failing check ends the run as failed-verification with the checks named, not as success | Public product boundary → user-observable result | `tests/integration/test_verifier_repair_e2e.py::test_a_persistently_failing_check_ends_the_run_as_failed_verification` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
