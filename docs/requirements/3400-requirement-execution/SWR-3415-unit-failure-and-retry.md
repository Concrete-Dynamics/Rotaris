---
req-id: SWR-3415
status: approved
trace: required
test: required
title: "Failed units are recoverable, never silent"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3415 — Failed units are recoverable, never silent

Agent runs fail: a provider outage, an unrecoverable conflict, a check suite
that cannot run. If a failed unit simply disappeared, the requirement would sit
in `Running` forever; if it silently retried, a broken requirement would burn
capacity indefinitely.

Requirement: a failed unit run moves the unit to a stated failure state with its
reason and keeps its worktree and branch for inspection. Retry is bounded and
explicit — automatic retries are limited and counted, and exhausting them moves
the requirement to `Blocked` with the failure named. Abandoning a unit is an
explicit action that keeps its history (SWR-3414).

## Acceptance criteria

- A failed unit never leaves the requirement in `Running`.
- Retries are counted and bounded; the bound is configurable and stated.
- The failed unit's worktree survives for inspection unless the user removes it.
- Exhausted retries produce `Blocked` naming the last failure.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Failure states, retry counting and bounding, and the abandon path | The unit lifecycle | `tests/unit/requirements/test_unit_failure.py` |
| Integration | A unit failing three times moves its requirement to Blocked and keeps all three records | Unit lifecycle + delivery store | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user whose provider went down sees the requirement blocked with the reason, and the work preserved | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
