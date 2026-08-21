---
req-id: SWR-3605
status: approved
trace: required
test: required
title: "Requirements are editable where the source allows it"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3605 — Requirements are editable where the source allows it

If the user has to leave Rotaris to change a sentence, the requirement loop is
broken at its most frequent step. Where the source can be written (SWR-3105,
SWR-3111), the edit belongs in the product.

Requirement: a requirement backed by a writable source is editable in the detail
view; saving writes through the adapter into the original artefact and the board
picks up the resulting hash change through evaluation. A requirement backed by a
read-only source states `Source is read-only`, names the source, and offers
navigation to the original artefact instead of an edit control.

## Acceptance criteria

- Editing writes to the project's own file, not to a Rotaris copy.
- A failed write preserves the user's input and states the failure.
- A read-only source shows the notice and the navigation, not a disabled field
  without explanation.
- An edit to a delivered requirement produces the `Needs Update` transition
  through the normal evaluation path (SWR-3502), not a special case.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Editable and read-only rendering, the failure path preserving input, and the write call | Detail view editing | `apps/rotaris/tests/test_requirements_editing.py` |
| Integration | Editing a requirement in a synthetic store updates the file and the board reflects the new hash | View → engine → source | `apps/rotaris/tests/test_requirements_editing.py` |
| User-flow E2E | A user edits a requirement in Rotaris and finds the change in their own requirement file | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_editing.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
