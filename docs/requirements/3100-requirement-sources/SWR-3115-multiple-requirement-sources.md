---
req-id: SWR-3115
status: approved
trace: required
test: required
title: "Multiple requirement sources in one workspace"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3115 — Multiple requirement sources in one workspace

Real projects rarely have exactly one place where requirements live: a Markdown
store for product requirements and an issue tracker for customer requests is the
normal case, not the exotic one.

Requirement: a workspace may configure several requirement sources at once. The
registry reads them all, tags every requirement with its source, and reports an
id declared by more than one source as a collision naming both sources rather
than letting one shadow the other. A failing source degrades to a named error
for that source while the remaining sources still load.

## Acceptance criteria

- Two sources yield one merged requirement set with correct per-requirement
  source attribution.
- An id collision across sources is reported with both source ids and both
  artefact paths.
- One unreadable source does not empty the board.
- Relations may cross sources; an unresolved cross-source target is reported as
  dangling (SWR-3109), not as a missing source.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Two fake sources merge; a colliding id is reported with both origins; a raising source is isolated | The registry | `tests/unit/requirements/test_registry.py` |
| Integration | A workspace with the built-in store plus a declarative source loads both and attributes each requirement | Registry over two real adapters | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | A user with requirements in two places sees one board and can tell which requirement came from where | Public product boundary → user-observable result | `tests/integration/test_requirement_sources.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
