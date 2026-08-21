---
req-id: SWR-2621
status: approved
trace: required
test: required
title: "A check's budget is learned from what the check costs"
epic: SWR-2600
priority: P2
date: 2026-08-20
---

# SWR-2621 — A check's budget is learned from what the check costs

SWR-2608 bounds a suite run with `verifier.suite_timeout` (900 s) and each check
with its own timeout (600 s). Both numbers are constants chosen without knowing
the project, and a project that outgrows them gets its suite killed on every
single run — permanently, silently, and with no signal distinguishing "this
project is slow" from "this run hung".

That is what happened here: the core suite alone takes ~430 s serially, the
desktop suite follows it, and the resolved check was killed at 600 s on every
pass. SWR-2606 now makes the *consequence* honest — a killed run accuses no test —
but honest and useless is still useless. A gate that can never finish is not a
gate.

Requirement: a check's effective budget is derived from what that check has
actually cost in this workspace, and a killed check reports the budget as the
finding.

- Each check's last **successful** duration is remembered per workspace, keyed by
  the check's name and command, so a changed command starts over rather than
  inheriting a number measured for something else.
- A check's effective timeout is the greater of its configured timeout and a
  multiple of its last successful duration. The configured timeout is therefore a
  floor a project can raise and never a ceiling that shrinks under it.
- A check with no remembered duration keeps the configured timeout exactly. The
  first run of a workspace is not the place to invent a budget.
- The suite budget grows the same way, from the sum of its checks' remembered
  durations, so raising one check's ceiling cannot be undone by a suite budget
  that did not move with it.
- A check that times out contributes a **suite-level** notice naming the budget
  and what the check cost — one sentence about the run. Under SWR-2606 the
  requirements it reached report `result-unknown`, so without this notice the
  cause of a whole board going quiet is stated nowhere.

## Acceptance criteria

- A workspace with no remembered durations runs on its configured timeouts,
  unchanged.
- A check that succeeded in 430 s is given more than 430 s next time, without any
  configuration change.
- A failed or killed run does not become a remembered duration: only a successful
  one is evidence of what the check costs.
- Changing a check's command discards the duration remembered for the old one.
- A timed-out check produces one suite-level notice naming the check, its budget
  and its cost.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Budget derivation from remembered durations; an absent memory changes nothing; a failed run is not remembered; a changed command forgets | Timing memory API | `tests/unit/test_verifier_runner.py` |
| Unit | A timed-out check yields a suite-level notice naming budget and cost | Verifier runner API | `tests/unit/test_verifier_runner.py` |
| Integration | A workspace whose suite outgrows the default budget is not killed on its second run | Runner → timing store → next run | `tests/integration/test_verifier_post_change_run.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
