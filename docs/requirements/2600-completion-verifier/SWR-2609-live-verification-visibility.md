---
req-id: SWR-2609
status: draft
trace: required
test: required
title: "Live verification visibility"
epic: SWR-2600
priority: P1
date: 2026-08-11
---

# SWR-2609 — Live verification visibility

While the post-change verifier (SWR-2602) is running, the run MUST report what it
is doing. Verification is the phase where a run holds still the longest with
nothing else to show, and until now it reported nothing until the whole suite had
finished — a run whose agent had succeeded read as hung.

- The suite announces itself before its first check and reports every check as it
  starts and as it settles. Each report names the check, its position in the
  suite (`index` of `total`), and the deadline it is running against.
- Every host learns this the way it already learns everything else: the
  diagnostics timeline records `verifier_started`, `verifier_check_started`, and
  `verifier_check_finished`; the event stream carries a `verifier.progress`
  event; hosts that observe the loop receive the matching
  `RalphIterationObserver` hooks.
- The desktop app shows the verification phase distinctly from agent work: a live
  indicator in the run header naming the running check, its position, its elapsed
  time and its deadline, plus one transcript row per check that counts upward
  while it runs and settles to its outcome, duration, and output excerpt.
- Verification is a phase *within* a running run, not a run state of its own:
  the run's controls (pause, cancel, follow-up composer) keep the behaviour they
  have during agent work.
- The terminal summary (SWR-2602's recorded run, SWR-2603's report evidence)
  is unchanged — this requirement adds progress, it does not move the verdict.

Derived requirements: [SWR-2611 — Verifier runner progress & control seam](SWR-2611-verifier-progress-seam.md)

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Progress callbacks fire once per check, in order, with the right index/total and deadline; a callback that raises cannot fail the suite | Verifier runner API | `tests/unit/test_verifier_runner.py` |
| Integration | An iteration that edited files records `verifier_check_started`/`verifier_check_finished` on the timeline between the child's end and `iteration_end` | Ralph loop → diagnostics seam | `tests/integration/test_verifier_post_change_run.py` |
| User-flow E2E | A desktop run that edits a file shows the verification indicator naming the running check and a transcript row per check that settles to its outcome | Public product boundary → user-observable result | `apps/rotaris/tests/test_verifier_activity_ui.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
