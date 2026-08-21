---
req-id: SWR-3107
status: approved
trace: required
test: required
title: "Requirement identity, content hash and source revision"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3107 — Requirement identity, content hash and source revision

Everything downstream — `satisfied_hash` (SWR-3204), change detection
(SWR-3501), run snapshots (SWR-3402) — rests on being able to say precisely
*which version* of a requirement is meant. ReqToCode computes a content hash for
its own store; the canonical model needs the same guarantee for every source.

Requirement: each canonical requirement carries a `current_hash` computed from
its normalised canonical content (id, title, description, lifecycle, type,
relations), and each source read carries a `source_revision` identifying the
state of the source it came from. Hashing is normalisation-stable: line endings,
trailing whitespace and field ordering do not change the hash; any change to the
requirement's meaning does.

## Acceptance criteria

- The same requirement content hashes identically on Windows and POSIX line
  endings.
- Reordering frontmatter fields does not change the hash; editing the
  description does.
- For the built-in source the hash is ReqToCode's `content_hash`, unchanged, so
  existing baselines keep their meaning.
- `source_revision` is recorded per read and stored with every run snapshot.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | CRLF/LF and field-order variants hash equally; a description edit changes the hash | The hash function | `tests/unit/requirements/test_hashing.py` |
| Integration | Hashes for this repository's store equal the `content_hash` in the generated `swr.py` | Canonical model over the real store | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — internal identity; its product flow is the Needs Update transition (SWR-3502)` | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
