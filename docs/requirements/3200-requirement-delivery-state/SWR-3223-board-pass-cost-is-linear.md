---
req-id: SWR-3223
status: approved
trace: required
test: required
title: "One board pass costs no more than linear in the store"
type: technical
derived-from: SWR-3216
epic: SWR-3200
date: 2026-08-18
source: docs/plans/2026-08-17-requirements-refactors/06-board-pass-at-scale.md
---

# SWR-3223 — One board pass costs no more than linear in the store

SWR-3216 says the engine answers the whole board in one read. It does not say
what that costs, and the cost went unmeasured until it was quadratic: over this
repository's own store — 1527 requirements, 3054 authored relations — a single
pass spent **1.46 s in `project_board` alone**, of which 0.56 s was the relation
graph answering each lookup by scanning every edge it held and 0.19 s was the
requirement index rebuilding its id map on each of 3054 asks.

Neither was a caching problem. Both values are **frozen** and published in one
rebind (SWR-3116), so the map from an id to its edges is not a memo with a
lifetime — it is the same data in the shape its readers ask for, and building it
per question was the defect. SWR-3317 fixed the same class of problem on the
widget side; this is its engine half.

Requirement: answering the board's per-requirement questions costs no more than
linear in the size of the store.

- A relation lookup (`outgoing`, `incoming`, `targets`, `sources`) does not
  depend on how many relations the graph holds that concern other requirements.
- A requirement lookup (`by_id`, `requirement`, `availability`, `tombstone`)
  does not rebuild a mapping per call.
- Any structure introduced to meet this is **invisible**: the models stay frozen,
  hashable, equal to their equals, and serialise to exactly what they did — a
  faster answer that is a different answer is not an answer (SWR-3216).
- The cost of one pass is measurable per stage, so the next claim about it starts
  from a number rather than a guess.

## Acceptance criteria

- Every relation and index lookup returns exactly what the scan it replaced
  returned, asserted against that scan rather than against a recorded value.
- The whole board projection over a real store is byte-identical before and
  after any change made under this requirement.
- A lookup over a graph a hundred times larger does not cost a hundred times
  more.
- A runnable harness reports the per-stage cost of one pass over a synthetic
  store of parameterised size and over a real workspace.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Every lookup equals the scan it replaced, and the cached shapes leave the models frozen, hashable and unchanged when dumped | Relation graph + requirement index | `tests/unit/requirements/test_board_scale.py` |
| Integration | A board pass over a 1500-requirement synthetic store projects the same board it did before, stage costs reported | Store → registry → projection | `tests/unit/requirements/test_board_scale.py` |
| User-flow E2E | `N/A — no user-visible behaviour changes; the flow this serves is SWR-3302's board, which its own portfolio covers` | — | — |

Epic: [Requirement Delivery State and Board Projection](../3200-requirement-delivery-state.md)
