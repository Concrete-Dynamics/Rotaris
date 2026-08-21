---
req-id: SWR-2616
status: approved
trace: required
test: required
title: "Invalid checks and deterministic in-run gate repair"
epic: SWR-2600
priority: P0
date: 2026-08-12
---

# SWR-2616 — Invalid checks and deterministic in-run gate repair

A gate that no longer matches the codebase fails as loudly as broken code, and
today the two are indistinguishable: a renamed script, a removed tool, or a
moved test root produces a non-zero exit, which gates the iteration and spends
the SWR-2605 repair budget asking the agent to fix code that is not broken. The
system MUST separate "the check says the code is wrong" from "the check is
wrong", and repair the second itself.

- A new check outcome `invalid` records a check that could not be executed as a
  test of the code: the command or tool does not resolve, the script or make
  target is gone, the interpreter or environment is missing, or the check
  reports no work where work was expected (zero tests collected for a `test`
  role).
- An `invalid` check MUST NOT gate completion (SWR-2604), MUST NOT charge a
  repair attempt (SWR-2605), and MUST NOT appear in the repair context as a code
  failure. It is a fact about the gate, reported as such.
- On the first `invalid` result for a role, the runner attempts repair
  **deterministically first**: re-run detection and probe the candidates
  (SWR-2613). If a probed equivalent of the same role and severity exists, the
  runner swaps it in through the gatekeeper's write path (SWR-2614), records a
  `verifier_gate_repaired` event, and re-runs that one check — no model call is
  involved.
- Only when no deterministic equivalent exists does the gatekeeper get one
  bounded turn to author a replacement for that role, subject to its usual
  authority.
- Repair MUST NOT weaken the gate. If neither path yields a same-role
  replacement, the check stays recorded `invalid` with its reason, the gate state
  becomes `stale`, that role is simply unverified for this run, and the drift is
  carried into an approval-gated proposal (SWR-2617). The suite is never
  silently emptied and severities are never silently lowered.
- At most one gate-repair attempt per role per session: a second `invalid`
  result for the same role after a repair is reported, not repaired again, so a
  hostile or unfixable workspace cannot spin.
- Every repair is visible: a timeline event, a named change in the child report,
  and the run header's verification line, so the user always learns the gate was
  changed under them and by which path. A gate that *passes* beside an `invalid`
  check names it in the very sentence that says so — a role that went unverified
  because its command stopped resolving must never be silent.
- A candidate at a lower severity is refused: repairing a gate by weakening it is
  not a repair. So is a root check standing in for a sub-project's (SWR-2618) —
  however alike they look, they verify different trees.
- The swap is persisted only where a suite was **configured**. A detected suite
  finds the replacement itself on the next resolution, and writing a gate the user
  never asked for is SWR-2615's decision on a techstack event, not a side effect
  of one check breaking.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An `invalid` result neither gates nor charges the repair budget and is absent from the repair context, while a `failed` result still does all three | Completion gate + repair decision API | `tests/unit/test_verifier_completion_gate.py`, `tests/unit/test_verifier_repair.py` |
| Unit | Classification of a missing command, a removed target, and a zero-collection test run as `invalid` rather than `failed`; one repair attempt per role per session | Verifier runner API | `tests/unit/test_verifier_runner.py`, `tests/unit/verifier/test_gate_repair.py` |
| Integration | A workspace whose test command was renamed repairs deterministically and re-runs the check within the same iteration; a workspace with no equivalent leaves the role unverified, marks the state `stale`, and emits the drift for proposal | Ralph loop → runner → gatekeeper → timeline | `tests/integration/test_verifier_gate_repair.py` |
| User-flow E2E | A run against a repo whose test runner changed completes without being blamed for the gate's breakage, and the user sees the gate repair reported | Public product boundary → user-observable result | `tests/integration/test_verifier_gate_repair.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
