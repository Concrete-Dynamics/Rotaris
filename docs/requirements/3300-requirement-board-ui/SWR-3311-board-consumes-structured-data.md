---
req-id: SWR-3311
status: approved
trace: required
test: required
title: "The board consumes structured data, never command output"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3311 — The board consumes structured data, never command output

The requirement information the board shows exists as structured data in the
engine (SWR-3216). Re-deriving it in the UI — by parsing `reqtocode` output, by
re-implementing the health rules, or by reading the delivery store's files
directly — would create a second answer that drifts from the first, and the
first is the one the agents act on.

Requirement: every fact the Requirements view renders comes from the board
projection API. No module under `apps/rotaris/src/` invokes a ReqToCode or
verifier command line, parses its output, or re-computes evidence health,
requirement health or epic progress.

## Acceptance criteria

- A guard test asserts that no desktop module spawns a `reqtocode` or verifier
  process or imports its CLI module.
- Health values rendered on cards are identical to the projection's, asserted
  rather than eyeballed.
- The view degrades to a stated error when the projection is unavailable, and
  never falls back to a locally computed one.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The guard sweep over `apps/rotaris/src/` and the identity assertion between projection and rendered values | Desktop modules | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | An unavailable projection produces a stated error state rather than a locally derived board | Bridge → view | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | `N/A — architectural invariant; asserted by the guard sweep` | — | — |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
