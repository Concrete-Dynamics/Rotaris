---
req-id: SWR-3607
status: approved
trace: required
test: required
title: "Blockers and decisions are resolved from the board"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3607 — Blockers and decisions are resolved from the board

The decisions the engine escalates (SWR-3512) are useless if they arrive as a
state with no way to answer. A blocked requirement must carry its question and
its answer path.

Requirement: a blocked requirement presents its blocker — the reason, the
options and each option's consequence — and the user's answer is recorded and
returned to the engine, which resumes the flow. Conflicts (SWR-3511) present
both requirements side by side. Dependency blocks (SWR-3510) name and navigate
to the blocking requirement.

## Acceptance criteria

- Every blocker type has a presentation and an answer path.
- Answering resumes the flow without a restart.
- A conflict presents both requirements and the decision the user must take.
- A dependency block navigates to the requirement that blocks it.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Per-blocker rendering and answer payloads, including conflict and dependency shapes | Blocker panel | `apps/rotaris/tests/test_requirements_blockers.py` |
| Integration | Answering a clarification question over fakes resumes the flow and records the answer | View → controller → engine | `apps/rotaris/tests/test_requirements_blockers.py` |
| User-flow E2E | A user answers the question that blocked a requirement and the work continues | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_blockers.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
