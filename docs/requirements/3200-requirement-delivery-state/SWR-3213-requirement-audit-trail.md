---
req-id: SWR-3213
status: approved
trace: required
test: required
title: "Requirement audit trail"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3213 — Requirement audit trail

The advantage over a task tracker is that every claim can be traced to
something that actually happened. That only holds if the events are recorded as
they happen, with their actor and their cause.

Requirement: Rotaris records an append-only audit trail per requirement
answering: who or what changed the specification and when; which requirement
version was implemented; which run implemented it; which files that run changed;
which tests verify it; when it was last successfully verified; which commit
corresponds to the satisfied hash; and which requirements it superseded. Records
name the actor (user or a named agent), carry a timestamp, and are never
rewritten.

## Acceptance criteria

- Every delivery transition, run, verification and write-back appends a record.
- Records are append-only: no code path updates or deletes one.
- The trail survives requirement removal (SWR-3113).
- Each of the nine questions above is answerable by a query over the trail.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each event type appends its record; the store rejects mutation; the nine queries answer from a crafted trail | The audit store | `tests/unit/requirements/test_requirement_audit.py` |
| Integration | A full delivery cycle over fakes produces a trail that answers every audit question | Delivery store + run lifecycle | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | A user opens a delivered requirement's history and sees which run and commit satisfied which version | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
