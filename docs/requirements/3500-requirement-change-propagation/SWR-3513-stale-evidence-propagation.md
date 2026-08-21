---
req-id: SWR-3513
status: approved
trace: required
test: required
title: "Stale evidence triggers propagation, not only hash changes"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3513 — Stale evidence triggers propagation, not only hash changes

Requirement text is only one of the things that can invalidate a delivery. If
propagation reacted to hash changes alone, a deleted test or a refactored
implementation would leave a green `Done` behind — which is the same drift the
product exists to prevent, entering through the other door.

Requirement: the staleness reasons of SWR-3209 feed the same propagation
machinery as requirement changes. A requirement whose evidence went stale or
failing while its text stood still is re-evaluated: a failing verification moves
it out of `Done` with the failure stated, and a missing trace or test produces
the corresponding units, without an impact analysis of the text.

## Acceptance criteria

- A deleted covering test moves its `Done` requirement out of `Done`.
- The reason states the evidence cause, not a specification change.
- No impact analysis of the requirement text is run for an evidence-only cause.
- Restoring the evidence returns the requirement to `Done` after a verification.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Evidence causes drive the transitions; the text analysis is not invoked; the restore path | The propagation rules | `tests/unit/requirements/test_evidence_propagation.py` |
| Integration | Deleting a covering test in a git fixture moves the requirement out of Done with the evidence reason | Freshness + delivery store | `tests/integration/test_requirement_change.py` |
| User-flow E2E | A user whose test was deleted sees the requirement stop claiming to be delivered | Public product boundary → user-observable result | `tests/integration/test_requirement_change.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
