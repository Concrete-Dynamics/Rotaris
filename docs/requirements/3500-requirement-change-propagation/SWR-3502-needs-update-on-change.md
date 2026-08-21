---
req-id: SWR-3502
status: approved
trace: required
test: required
title: "A delivered requirement that changes becomes Needs Update"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3502 — A delivered requirement that changes becomes Needs Update

The central promise of the product is that changing a requirement produces
visible work rather than silent drift. A requirement that was `Done` and is then
edited must not fall back to an undifferentiated backlog item — the information
that it was already built, and against which version, is the most valuable thing
about it.

Requirement: when a requirement's `current_hash` diverges from its
`satisfied_hash`, its delivery state moves from `Done` to `Needs Update`,
retaining the satisfied hash, the delivering run and the verified commit. The
card states that the specification changed since delivery (SWR-3304). The
transition happens on evaluation, without user action, and is recorded in the
audit trail.

## Acceptance criteria

- `Done` + hash divergence yields `Needs Update`, never `Backlog`.
- The previous satisfied hash, run and commit remain retrievable.
- A requirement that was never `Done` is unaffected by hash changes.
- Restoring the requirement text to the satisfied version returns it to `Done`
  without a new run, provided its evidence is still current.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The transition on divergence, retention of the delivery record, and the restore case | The evaluation rule | `tests/unit/requirements/test_needs_update.py` |
| Integration | Editing a delivered requirement in a synthetic store moves it to Needs Update on the next evaluation | Detection + delivery store | `tests/integration/test_requirement_change.py` |
| User-flow E2E | A user edits a requirement that was done and the board shows it needs updating, with what was built before | Public product boundary → user-observable result | `tests/integration/test_requirement_change.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
