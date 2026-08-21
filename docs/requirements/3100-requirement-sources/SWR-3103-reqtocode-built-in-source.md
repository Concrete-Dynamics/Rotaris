---
req-id: SWR-3103
status: approved
trace: required
test: required
title: "ReqToCode store as the built-in requirement source"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3103 — ReqToCode store as the built-in requirement source

This repository already carries a structured requirement store with stable ids,
content hashes, lifecycle and technical-requirement links. It is the reference
implementation of a requirement source and must be the adapter that proves the
interface, not a special case beside it.

Requirement: a built-in adapter reads the ReqToCode store through the existing
`parse_requirements` and the repository layout description (SWR-2335), maps
`ReqMeta` onto the canonical model (SWR-3101), reports `content_hash` as
`current_hash`, resolves `epic` / `derived-from` into relations (SWR-3109), and
declares full read/write capability. It is selected automatically for a
workspace whose layout resolves to a requirement store.

"Resolves to a requirement store" is confirmed by reading it, not by the
directory existing: a workspace whose documents this parser skips is not claimed
here and goes to discovery instead
([SWR-3120](SWR-3120-empty-source-does-not-claim-workspace.md)).

## Acceptance criteria

- Every requirement in this repository's store appears exactly once, with its
  ReqToCode id, title, lifecycle, type and content hash preserved.
- Multi-id spec files (SWR-2330) yield one canonical requirement per declared
  id, all sharing the file's hash, and each carrying its own overridden
  lifecycle.
- A workspace with no requirement store yields no source rather than an error.
- The adapter adds no second parse of the store: it reuses ReqToCode's parser.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A synthetic store with a spec file, a technical requirement and an epic maps onto the expected canonical set | The built-in adapter | `tests/unit/requirements/test_reqtocode_source.py` |
| Integration | Reading this repository's real store yields one canonical requirement per declared id and no duplicates | Adapter over the real store | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | A user opens a Rotaris workspace that has a ReqToCode store and its requirements are available without configuration | Public product boundary → user-observable result | `tests/integration/test_requirement_sources.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
