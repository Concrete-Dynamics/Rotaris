---
req-id: SWR-3218
status: approved
trace: required
test: required
title: "The adoption pass and the one door it reaches Done through"
type: technical
derived-from: SWR-3217
epic: SWR-3200
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-adoption.md
---

# SWR-3218 — The adoption pass and the one door it reaches Done through

SWR-3217 needs a requirement to travel from `Backlog` to `Done`. The transition
matrix (SWR-3203) has no such edge, deliberately: its absence is what makes
`Backlog → Done` unreachable for a drag, a menu action or a bulk accept, and
SWR-3609's guarantee rests on it. Adding the edge to `LEGAL_TRANSITIONS` would
hand the same shortcut to every caller that can build a request.

Requirement: adoption reaches `Done` through a door of its own, and the matrix
the board reads is left exactly as it is.

- `LEGAL_TRANSITIONS` is unchanged, and `allowed_targets` — which is what a board
  asks for its drop targets — keeps reading only that map. `Done` therefore never
  appears among the targets reachable from `Backlog`, for either actor kind.
- A separate, two-edge map carries the adoption moves and is consulted **only**
  for the adoption causes: `Backlog → Done` when adopting, `Done → Backlog` when
  reverting one.
- A transition claiming an adoption cause is refused unless it carries a
  satisfied delivery whose origin is the adopted one (SWR-3219). Naming the cause
  is not enough to open the door; the evidence of a verification has to be in the
  request.
- Reverting is refused unless the record's current delivery is itself adopted, so
  the inverse of an adoption can never undo a real one.
- Everything else about the transition is the ordinary path: the same
  `apply_transition`, the same actor rules, the same completion gate, the same
  single audit record per accepted move (SWR-3213).
- The pass that decides *which* requirements are candidates is pure — requirement
  facts, delivery records and evidence in, a per-requirement report out — with no
  store, clock or subprocess of its own, so it is testable without a repository
  in the same way `epics.py` is.

## Acceptance criteria

- `allowed_targets(Backlog)` contains no `Done` for either actor kind, before and
  after this requirement.
- A request with an adoption cause and no adopted satisfied delivery is refused,
  naming the precondition.
- A revert is refused when the recorded delivery came from a Rotaris run.
- The adoption pass returns one result per requirement it was asked about, and
  performs no write of its own.
- An accepted adoption produces exactly one audit record, like every other
  transition.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The two adoption edges, the refusals that guard them, and the matrix left untouched | The transition layer | `tests/unit/requirements/test_requirement_adoption.py` |
| Integration | An adoption and a revert through the persisting write path, each leaving one audit entry | Transitions + delivery store + audit | `tests/integration/test_requirement_adoption.py` |
| User-flow E2E | `N/A — mechanism; its product flow is SWR-3217's adoption` | — | — |

Derived from: [SWR-3217 — Existing work is adopted after verification](SWR-3217-adopting-existing-work.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
