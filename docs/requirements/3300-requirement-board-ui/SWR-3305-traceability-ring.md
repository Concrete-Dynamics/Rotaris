---
req-id: SWR-3305
status: approved
trace: required
test: required
title: "Traceability ring on the card"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3305 — Traceability ring on the card

The compact evidence indicator must answer "is this requirement's evidence
complete, current and passing" at a glance — and it must not be a count of
annotations, which would show green for a requirement whose tests fail.

Requirement: each card carries a ring segmented by the requirement's evidence
obligations (SWR-3206), each segment coloured by that obligation's health
(SWR-3207): green for satisfied and verified, orange for present but stale or
unverified, red for failing verification, grey for missing or not required. The
ring carries an accessible description naming each segment and its state, so its
meaning is available without colour.

## Acceptance criteria

- A requirement with complete traces and a failing test renders a red segment,
  not a full green ring.
- A requirement with no obligations renders an empty ring with a stated reason,
  not a green one.
- The ring's accessible description names every segment and its state.
- Every ring colour meets the 3:1 contrast floor against the card ground.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Segment computation per obligation state; the complete-but-failing case; the accessible description | Ring widget | `apps/rotaris/tests/test_requirements_ring.py` |
| Integration | Rings over a real projection match the engine's evidence health for each requirement | Projection → ring | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user sees at a glance which delivered requirements have failing verification | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
