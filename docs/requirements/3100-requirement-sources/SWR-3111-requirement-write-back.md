---
req-id: SWR-3111
status: approved
trace: required
test: required
title: "Requirement edits are written back to the source"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3111 — Requirement edits are written back to the source

Rotaris must not become the place where requirements diverge from the project's
own store. If a requirement is edited in Rotaris, the edit belongs in the file
or system the requirement came from, in that source's own format.

Requirement: updating a requirement writes through its source adapter into the
original artefact, preserving the source's format, field order and any content
the canonical model does not represent. The write is atomic per artefact, is
refused when the source lacks the `update` capability (SWR-3105), and is
followed by a re-read so the resulting `current_hash` is the one the source
actually holds.

## Acceptance criteria

- Editing a description in a ReqToCode requirement changes exactly that
  requirement's file, leaves unrelated frontmatter untouched and leaves other
  files unchanged.
- A failed write leaves the artefact byte-identical to before.
- The post-write hash is read back from the source, never computed from the
  in-memory edit.
- A read-only source refuses with a stated reason (SWR-3605).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An update preserves unmodelled frontmatter and rewrites only the changed field; a failing write leaves the file untouched | The write-back path | `tests/unit/requirements/test_writeback.py` |
| Integration | Editing a requirement in a synthetic store updates the file, re-reads it, and yields the new hash | Adapter + registry | `tests/integration/test_requirement_writeback.py` |
| User-flow E2E | A user edits a requirement's description and the project's own requirement file carries the change | Public product boundary → user-observable result | `tests/integration/test_requirement_writeback.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
