---
req-id: SWR-3109
status: approved
trace: required
test: required
title: "Requirement relations"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3109 — Requirement relations

Requirements refer to each other, and the referring is what makes change
propagation possible: a superseding requirement has to know what it replaces, a
dependent requirement has to know what must land first.

Requirement: the canonical model supports the relation kinds `parent`,
`derived-from`, `supersedes` and `depends-on` as first-class, queryable edges,
and accepts `refines`, `conflicts-with` and `related-to` as declared but
non-enforcing kinds. Each relation names a target requirement id; an unresolved
target is reported as a dangling relation with its source, kind and target, and
never silently dropped.

## Acceptance criteria

- All four enforced kinds round-trip from the built-in source, including
  ReqToCode's `derived-from` and `epic` fields.
- A relation to an unknown id is reported once, with kind and target.
- A relation to a `deprecated` requirement is loaded and flagged, not dropped.
- Relation queries answer both "what does X point at" and "what points at X".

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each relation kind parses, resolves and is queryable in both directions; dangling targets are reported | The relation graph | `tests/unit/requirements/test_relations.py` |
| Integration | `derived-from` links in this repository's store appear as relations with the same origins the verifier enforces | Relations over the real store | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — model; its product flows are SWR-3307 and SWR-3507` | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
