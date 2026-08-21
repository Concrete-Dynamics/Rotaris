---
req-id: SWR-3606
status: approved
trace: required
test: required
title: "Requirements can be created in Rotaris"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3606 — Requirements can be created in Rotaris

The loop closes only if a new requirement can start in the product too —
otherwise every new idea begins outside it and arrives as an import.

Requirement: the Requirements view can create a requirement, choosing the target
source, the parent epic, the product or technical classification and, for a
technical requirement, its origin. The id, the location and the artefact format
follow the source's own conventions (SWR-3112) — including the location shown
*before* the write, which the adapter resolves through the same call the write
makes, so that the preview and the artefact cannot name different files. An
adapter that cannot name a location before creating says so, and the form shows
that rather than a path it made up. The new requirement appears on the board in
`Backlog` and can be released immediately.

## Acceptance criteria

- Creation offers only sources that declare the `create` capability.
- The user sees where the artefact will be written before it is written.
- A technical requirement cannot be created without an origin.
- The created requirement passes the project's own requirement check.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Form validation, capability filtering, and the origin requirement for technical requirements | Creation dialog | `apps/rotaris/tests/test_requirements_editing.py` |
| Unit | The store names where a draft would land, and refuses exactly what the write refuses | Adapter preview capability | `tests/unit/requirements/test_creation.py`, `tests/unit/requirements/test_reqtocode_source.py` |
| Integration | Creating a requirement writes the artefact into a synthetic store and it appears on the board | Dialog → engine → source | `apps/rotaris/tests/test_requirements_editing.py` |
| Integration | The previewed location is the location the write produces, under an epic and at the root | Preview → create, one computation | `apps/rotaris/tests/test_requirements_editing.py` |
| User-flow E2E | A user creates a requirement and releases it in one sitting | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_editing.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
