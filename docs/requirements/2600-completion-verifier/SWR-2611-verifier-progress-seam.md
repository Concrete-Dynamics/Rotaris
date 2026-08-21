---
req-id: SWR-2611
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2609
title: "Verifier runner progress & control seam"
epic: SWR-2600
date: 2026-08-11
---

# SWR-2611 — Verifier runner progress & control seam

`run_check_suite` finished a whole suite before it returned anything, so there
was no place for a host to learn about a check while it ran or to act on one.
This adds the two seams SWR-2609 and SWR-2610 need, without changing what the
runner concludes.

## Acceptance criteria

- `run_check_suite` accepts an optional `progress` object with
  `on_check_start(check, index, total, deadline_s)` and
  `on_check_finish(result, index, total)`, invoked once per check in suite order.
  Both calls are guarded: a callback that raises is logged and stepped over, and
  the suite's result is unaffected — the runner's existing "never raises"
  contract is preserved.
- `run_check_suite` accepts an optional `VerifierRunControl`. `skip_current()`
  marks the in-flight check for skipping, interrupts the command the executor is
  running, and wakes the runner; `skip_requested` is readable and is cleared once
  consumed. It is callable from a host thread that is not the runner's loop.
- The runner does not block on a check it can no longer stop: the blocking
  execution runs on a daemon thread it owns rather than through
  `asyncio.to_thread`, and it is raced against the control's skip signal, so a
  requested skip is acted on while the command is still running.
- A skipped check that has not returned within the runner's grace period is
  abandoned: its executor is force-terminated, its result is settled without
  waiting further, and the worker thread is left to die on its own.
- `VerifierRunControl` is inert without a live suite: `skip_current()` before the
  first check or after the last one changes nothing.
- The runner rebuilds its executor only after an abandoned skip, whose terminal
  was destroyed with a command still attached. A check that stopped on its
  interrupt leaves the terminal at a healthy prompt, and the next check reuses it.
- `RalphIterationObserver` gains `on_verifier_started`,
  `on_verifier_check_started`, and `on_verifier_check_finished` as no-op hooks,
  resolved duck-typed like `on_verifier_run`, so a host that predates them is
  unaffected.
- `SessionState.verifier_state` holds the in-flight suite's progress for hosts
  that read the persisted snapshot, and is cleared when the suite ends — the same
  transient lifecycle as `wait_state`.

## Test coverage

Unit coverage of the callback ordering, the guarded invocation, the control's
inert and active states, the interrupt-then-abandon path, and the executor
rebuild lives in
`tests/unit/test_verifier_runner.py`. The originating product flow is SWR-2609's
live verification visibility, whose loop-to-diagnostics wiring is covered in
`tests/integration/test_verifier_post_change_run.py`.

Derived from: [SWR-2609 — Live verification visibility](SWR-2609-live-verification-visibility.md)

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
