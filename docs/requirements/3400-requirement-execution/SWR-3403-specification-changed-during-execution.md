---
req-id: SWR-3403
status: approved
trace: required
test: required
title: "A specification that changes during execution blocks automatic Done"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3403 — A specification that changes during execution blocks automatic Done

The dangerous case is the quiet one: a requirement is edited while its run is in
flight, the run finishes successfully against the old text, and the board marks
the *new* text as delivered. Nothing in the evidence would show the mismatch.

Requirement: when a run completes and its snapshot hash differs from the
requirement's current hash, the result goes to `Review` carrying the stated
reason *specification changed during execution*, and never to `Done`. The
requirement then enters the impact analysis of SWR-3503 against the diff between
the snapshot version and the current version.

## Acceptance criteria

- A completed run whose requirement changed cannot produce `Done`, whatever the
  gate says.
- The review carries both hashes and the diff between the two versions.
- A run whose requirement did not change is unaffected by this rule.
- The event is recorded in the audit trail with both hashes.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Hash comparison at completion drives Review with the reason; the unchanged case is untouched | The completion path | `tests/unit/requirements/test_run_completion.py` |
| Integration | A run over a requirement edited mid-flight lands in Review with both hashes recorded | Run completion + delivery store | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user who edits a requirement while it is running is shown the conflict instead of a green Done | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
