---
req-id: SWR-3119
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3113
title: "A removal survives the process that noticed it"
epic: SWR-3100
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-removal.md
---

# SWR-3119 — A removal survives the process that noticed it

SWR-3113 says a requirement present in a previous read and absent from the
current one becomes a tombstone. It does not say where "a previous read" is kept,
and the answer was: nowhere. `RequirementRegistry` held both the tombstone log
and the previous per-source snapshot in the instance, and every shipped
construction passed neither.

The consequence is larger than a missing cache, and it is why SWR-3509's removal
impact analysis had no production path rather than merely lacking a caller: the
first refresh of every process compared against nothing, so `observe` saw no
"was there, is not now", and **no tombstone was ever minted to persist**. A
`rotaris-cli` invocation could not detect a removal at all; a desktop session
could only between two refreshes of one sitting.

Derived from: [SWR-3113](SWR-3113-requirement-tombstones.md)

Requirement: what a refresh has to compare against survives the process that
produced it.

- Both halves are persisted, because either alone is inert: the tombstone log,
  and the **baseline** each source left behind that makes the next comparison
  possible.
- The baseline is the value the codebase already has for this —
  `RequirementBaseline` (SWR-3501) — carrying identity, hashes, lifecycle and
  provenance and never requirement text (SWR-3114). A second baseline value
  beside it would be two answers to one question.
- "Never evaluated" stays distinguishable from "evaluated and held nothing", so
  the first refresh in a fresh workspace is not read as every requirement having
  just been removed.
- Unreadable state means "remember nothing", not "refuse to open the board". The
  cost is one refresh with nothing to compare against; a corrupt file must never
  be able to invent a removal.

## Acceptance criteria

- A requirement deleted between two separate processes is tombstoned by the
  second one.
- A workspace opened for the first time reports no removals, however many
  requirements it holds.
- A removal already recorded is not re-reported on every later refresh.
- The persisted baseline carries no requirement title or description.
- An unreadable baseline or tombstone file yields an empty memory and a warning,
  and the refresh that follows leaves a whole one behind.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Round-trip, the first-open case, the already-recorded case, and the corrupt-file degradation | The memory stores | `tests/unit/requirements/test_registry_memory.py` |
| Integration | A requirement file deleted between two registry instances over one workspace is tombstoned by the second | Registry + stores over a real directory | `tests/integration/test_requirement_removal.py` |
| User-flow E2E | N/A — a technical requirement; its product flow is SWR-3509's removal report | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
