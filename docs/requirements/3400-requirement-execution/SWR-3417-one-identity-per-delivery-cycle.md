---
req-id: SWR-3417
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3401
title: "One identity per delivery cycle"
epic: SWR-3400
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-open-items.md
---

# SWR-3417 — One identity per delivery cycle

A requirement can be delivered more than once: it is released, executed,
reviewed, and later released again — after a rework, after a superseding change,
after a failure someone fixed by hand. SWR-3401 makes unit ids *derived* rather
than drawn, so the second delivery re-plans the same keys and mints exactly the
first delivery's ids. Nothing separated the two, and the consequences ran through
every store that keys on a unit id: the unit set is replaced as a whole on every
save, so the second delivery's first save erased the first delivery's `run_ids`;
the run history joined both deliveries' runs onto one unit; and the flow's
recorded progress marked the new delivery's units finished before they ran,
because their ids matched the previous delivery's.

Requirement: an execution unit belongs to exactly one **delivery cycle** of its
requirement, counted from zero, and the cycle is carried as a field on the unit —
never mixed into its id. `mint_unit_id(req_id, key)` stays byte-identical across
cycles, because a unit id names a *slice of work* and the second delivery is that
slice being done again; it is also minted independently by the desktop when a
user starts a unit by hand, and an id that moved would break that agreement.
`(cycle, unit_id)` is what has to be unique. Planning a requirement that already
has units never plans from nothing: the previous cycle's units are retired into
the same set, keeping their state and their runs.

## Acceptance criteria

- Two units of one requirement may share a `unit_id` if and only if they belong
  to different delivery cycles; within one cycle an id is still handed out once,
  discarded units included.
- A second delivery cycle retires the first cycle's units instead of replacing
  them, so the requirement's `run_ids` still reports the first cycle's runs after
  the second cycle's first save.
- The run history says which delivery cycle each run belongs to, so a reader can
  ask what the first delivery did and what the second one did separately.
- Recorded flow progress belonging to an earlier cycle never marks a later
  cycle's units finished.
- A unit file written before this change still loads, and reads as delivery
  cycle zero.
- The delivery cycle reaches the board: an execution unit view carries it and
  names it in its own rendered line once there is more than one.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Cycle-scoped unit identity, retiring a finished cycle, cycle-aware history queries, and the pre-change unit file still loading | The unit model, the unit store, the run history | `tests/unit/requirements/test_execution_cycles.py` |
| Integration | Two complete delivery cycles of one requirement through the real composition: the first cycle's runs survive the second, and the history tells them apart | Flow + unit store + run history + board reader | `tests/integration/test_requirement_cycles.py` |
| User-flow E2E | `N/A — work artefact; its product flow is the unit list on the card (SWR-3304), reached through the execution unit view this requirement extends` | — | — |

Derived from: [SWR-3401 — Execution units are work artefacts, not requirements](SWR-3401-execution-units.md)

Epic: [Requirement Execution](../3400-requirement-execution.md)
