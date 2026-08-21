---
req-id: SWR-3208
status: approved
trace: required
test: required
title: "Evidence details are concrete and navigable"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3208 — Evidence details are concrete and navigable

A health colour that cannot be opened is a rumour. The user has to be able to go
from "test evidence failed" to the failing test's file and line, and from
"verification failed" to the run and commit that failed.

Requirement: the evidence projection carries, per obligation, the concrete
records behind it: implementation sites and covering tests as path and line, the
last verification's verdict, commit, requirement hash and run id, and the
execution and integration records that produced them. Every record is
addressable — a consumer can open the file at the line, or the run in the
session view.

## Acceptance criteria

- Every site record carries a repository-relative path and a line number.
- The verification record names the verdict, the commit and the requirement hash
  it was produced against.
- A missing obligation yields an empty record set with a stated reason, never a
  fabricated one.
- Records survive the store round-trip (SWR-3205).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Records serialise and round-trip; missing obligations carry a reason; sites carry path and line | The evidence records | `tests/unit/requirements/test_evidence_detail.py` |
| Integration | Detail records for a requirement of this repository name its real trace and test sites | Projection over the real store | `tests/integration/test_requirement_evidence_health.py` |
| User-flow E2E | A user opens a requirement's evidence and reaches the implementing file and the failing test | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived requirements: [SWR-3220 — A verification is recorded as one artefact](SWR-3220-verification-record-store.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
