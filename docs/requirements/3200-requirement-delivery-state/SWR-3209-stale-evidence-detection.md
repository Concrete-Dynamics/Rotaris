---
req-id: SWR-3209
status: approved
trace: required
test: required
title: "Evidence goes stale without the requirement changing"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3209 — Evidence goes stale without the requirement changing

A requirement can rot while its text stands still: the implementation is
refactored, the covering test is deleted, a trace moves to another module, a
dependency changes and the test starts failing. Reacting only to requirement
hash changes would leave all of that invisible.

Requirement: Rotaris tracks evidence freshness separately from requirement
freshness. Evidence becomes `stale` when the code or tests behind it changed
since the last successful verification, when a trace or covering test moved or
disappeared, or when the verified commit is no longer an ancestor of the current
head. Staleness is reported per obligation with the reason that caused it.

## Acceptance criteria

- Deleting a covering test moves that requirement's test evidence off
  `satisfied` without any requirement edit.
- Editing an implementing module marks the implementation evidence stale until a
  verification runs again.
- A requirement whose verified commit was rebased away reports stale
  verification, not failure.
- Each staleness carries a machine-readable reason, not just a colour.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each staleness cause produces the expected reason; an unchanged repository produces none | The freshness rules | `tests/unit/requirements/test_evidence_staleness.py` |
| Integration | Deleting a test and editing a module in a synthetic repository yields the two expected staleness reasons | Freshness over a git fixture | `tests/integration/test_requirement_evidence_health.py` |
| User-flow E2E | A user whose colleague deleted a test sees the affected requirement leave the healthy state | Public product boundary → user-observable result | `tests/integration/test_requirement_evidence_health.py` |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
