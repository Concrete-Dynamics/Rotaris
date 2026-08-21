---
req-id: SWR-3412
status: approved
trace: required
test: required
title: "Requirement scheduling"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3412 — Requirement scheduling

Once several requirements are `Ready`, someone has to decide what runs next.
Doing that by hand defeats the purpose; doing it without constraints produces
conflicting worktrees and dependent work running out of order.

Requirement: a scheduler selects the next executable units from the `Ready`
requirements, honouring requirement dependencies (SWR-3510), unit dependencies
(SWR-3406), the configured concurrency and resource limits, requirement priority
and the probability of file conflicts between candidate units. Scheduling is
observable — the queue, the chosen order and the reason a candidate was held
back are all readable — and can be run manually or automatically per the
configuration.

## Acceptance criteria

- A requirement whose dependency is not `Done` is never scheduled.
- Priority orders the queue but never overrides a dependency.
- Two units likely to touch the same files are not scheduled concurrently.
- Every held-back candidate carries a stated reason.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Queue ordering, dependency and conflict holds, limit handling, and the stated reasons | The scheduler | `tests/unit/requirements/test_requirement_scheduler.py` |
| Integration | A queue of five requirements with dependencies and priorities executes in the expected order | Scheduler + unit execution fakes | `tests/integration/test_requirement_scheduling.py` |
| User-flow E2E | A user releases four requirements and Rotaris works through them in dependency order | Public product boundary → user-observable result | `tests/integration/test_requirement_scheduling.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
