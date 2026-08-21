---
req-id: SWR-3112
status: approved
trace: required
test: required
title: "Requirement creation follows the project's own conventions"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3112 — Requirement creation follows the project's own conventions

A requirement Rotaris creates must be indistinguishable from one the team
created by hand — same id convention, same location, same template — or the
project's own tooling (here: the ReqToCode verifier and the epic index) will
reject it.

Requirement: creating a requirement resolves the target source, allocates the
next free id under that source's convention, places the artefact where the
source's layout dictates, applies the source's template, records the parent epic
and the product/technical classification, and — for the built-in source —
mirrors the entry into the epic index and honours the `derived-from` rules of
SWR-2331.

## Acceptance criteria

- A created ReqToCode requirement passes `python -m rotaris_core.reqtocode check`
  without hand editing.
- Id allocation never reuses an id, including ids that only exist as tombstones
  (SWR-3113).
- Creating a technical requirement without an origin is refused.
- Two creations in the same session get different ids.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Id allocation skips used and tombstoned ids; a technical requirement without `derived-from` is refused | The creation path | `tests/unit/requirements/test_creation.py` |
| Integration | A requirement created into a synthetic ReqToCode store passes the real verifier | Creation + ReqToCode check | `tests/integration/test_requirement_writeback.py` |
| User-flow E2E | A user creates a requirement from Rotaris and the project's requirement check stays green | Public product boundary → user-observable result | `tests/integration/test_requirement_writeback.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
