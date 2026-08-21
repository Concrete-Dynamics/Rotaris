---
req-id: SWR-2610
status: approved
trace: required
test: required
title: "User-skippable verification"
epic: SWR-2600
priority: P2
date: 2026-08-11
---

# SWR-2610 — User-skippable verification

A user watching a check they know they do not need MUST be able to stop it
without stopping the run and without the stopped check being read as a failure.

- The desktop app offers a skip affordance beside the live verification indicator
  (SWR-2609) while a check is running.
- Skipping interrupts the running command — the terminal backend's Ctrl+C /
  `SIGINT` — and the check settles promptly, without waiting out its timeout. A
  forced terminal teardown is not enough on its own: it kills the process tree
  but blinds the blocking poll loop, which then waits for the full check timeout
  before returning, so the user sees nothing happen.
- A command that ignores the interrupt is abandoned once a bounded grace period
  passes: its terminal is force-terminated, the check settles anyway, and the
  suite continues with the next check on a freshly built terminal. A check that
  did stop on the interrupt leaves a healthy terminal, which the next check reuses.
- The skipped check is recorded as `skipped` with the user and the elapsed time
  as its reason. It is never recorded as `passed` and never as `failed`, so the
  SWR-2604 completion gate neither re-queues the iteration on it nor lets it
  vouch for work it did not verify.
- Skip applies to the check that is running, not to the suite: the checks after
  it still run.
- With no suite in flight the skip request is a no-op.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A skip during a check yields `skipped` (not `failed`), carries the elapsed time in its reason, and the next check still runs; a skip with no suite in flight does nothing | Verifier runner API | `tests/unit/test_verifier_runner.py` |
| Unit | A skip of a command still blocked interrupts it and settles the check without waiting out its timeout; one that ignores the interrupt is abandoned after the grace period, its terminal torn down and the next check given a fresh one | Verifier runner API | `tests/unit/test_verifier_runner.py` |
| Integration | A skipped blocking check does not appear in `blocking_failures` and does not gate the iteration | Verifier evidence → completion gate | `tests/integration/test_verifier_completion_gate.py` |
| User-flow E2E | Pressing Skip in the desktop app settles the running check's row as skipped and leaves the run active | Public product boundary → user-observable result | `apps/rotaris/tests/test_verifier_activity_ui.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
