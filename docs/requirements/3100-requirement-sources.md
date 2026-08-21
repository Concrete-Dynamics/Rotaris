---
req-id: SWR-3100
status: approved
trace: optional
test: optional
title: "Requirement Sources and Canonical Model"
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3100 — Requirement Sources and Canonical Model

The layer that turns whatever a project already uses to describe its
requirements into one internal model Rotaris can reason about. It owns the
canonical requirement, the source adapter interface and its capabilities, the
built-in ReqToCode source, declarative and agent-discovered sources, requirement
identity and hashing, hierarchy and relations, and the write path back into the
originating artefact.

The rule this epic exists to hold: **the project's own requirement store stays
authoritative**. Rotaris normalises, indexes and layers operational state on top,
and never becomes a second place where requirements live (SWR-3114).

Derived from [docs/plans/2026-08-14-requirements-board.md](../plans/2026-08-14-requirements-board.md)
§2.1, §8–§11, §24–§25, §27, §33–§35, §53.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3101](3100-requirement-sources/SWR-3101-canonical-requirement-model.md) | Canonical requirement model | approved |
| [SWR-3102](3100-requirement-sources/SWR-3102-requirement-source-adapter-interface.md) | Requirement source adapter interface | approved |
| [SWR-3103](3100-requirement-sources/SWR-3103-reqtocode-built-in-source.md) | ReqToCode store as the built-in requirement source | approved |
| [SWR-3104](3100-requirement-sources/SWR-3104-declarative-adapter-configuration.md) | Declarative source configuration | approved |
| [SWR-3105](3100-requirement-sources/SWR-3105-adapter-capability-surface.md) | Source capabilities are declared and surfaced | approved |
| [SWR-3106](3100-requirement-sources/SWR-3106-agent-assisted-source-discovery.md) | Agent-assisted requirement source discovery | approved |
| [SWR-3107](3100-requirement-sources/SWR-3107-requirement-hash-and-revision.md) | Requirement identity, content hash and source revision | approved |
| [SWR-3108](3100-requirement-sources/SWR-3108-requirement-hierarchy.md) | Requirement hierarchy of epics and children | approved |
| [SWR-3109](3100-requirement-sources/SWR-3109-requirement-relations.md) | Requirement relations | approved |
| [SWR-3110](3100-requirement-sources/SWR-3110-computed-reverse-relations.md) | Reverse relations are computed, never stored | approved |
| [SWR-3111](3100-requirement-sources/SWR-3111-requirement-write-back.md) | Requirement edits are written back to the source | approved |
| [SWR-3112](3100-requirement-sources/SWR-3112-requirement-creation-conventions.md) | Requirement creation follows the project's own conventions | approved |
| [SWR-3113](3100-requirement-sources/SWR-3113-requirement-tombstones.md) | Removed requirements leave a tombstone | approved |
| [SWR-3114](3100-requirement-sources/SWR-3114-no-second-requirement-repository.md) | Rotaris keeps no second requirement repository | approved |
| [SWR-3115](3100-requirement-sources/SWR-3115-multiple-requirement-sources.md) | Multiple requirement sources in one workspace | approved |
| [SWR-3116](3100-requirement-sources/SWR-3116-requirement-index-refresh.md) | Requirement index refresh is incremental and off the UI thread | approved |
| [SWR-3117](3100-requirement-sources/SWR-3117-requirements-configuration-block.md) | Requirements configuration block | approved |
| [SWR-3118](3100-requirement-sources/SWR-3118-source-reported-delivery-state.md) | A requirement source may report its own delivery state | draft |
| [SWR-3119](3100-requirement-sources/SWR-3119-registry-memory.md) | A removal survives the process that noticed it (technical, from SWR-3113) | approved |
| [SWR-3120](3100-requirement-sources/SWR-3120-empty-source-does-not-claim-workspace.md) | A source that reads no requirement does not claim the workspace | approved |
| [SWR-3121](3100-requirement-sources/SWR-3121-agent-described-requirement-store.md) | An agent describes a requirement store no heuristic can | approved |
| [SWR-3122](3100-requirement-sources/SWR-3122-sectioned-requirement-documents.md) | Requirements declared as sections of one document (technical, from SWR-3121; deferred behind SWR-3123) | draft |
| [SWR-3123](3100-requirement-sources/SWR-3123-generated-requirement-parser.md) | A generated parser reads a store no configuration can describe | draft |

## History

- 2026-08-14 — Epic cut from the requirement-board target picture as slice 1 of
  six. Delivery plan and slice ownership:
  [docs/plans/2026-08-14-requirements-board-slices.md](../plans/2026-08-14-requirements-board-slices.md).
- 2026-08-17 — SWR-3120 – SWR-3122 close the gap a real foreign project exposed:
  a store under `docs/requirements/` with a different frontmatter key bound the
  built-in source, read nothing, and never reached discovery. Selection now
  answers to a read (SWR-3120), the analyst seam is crossed wherever determinism
  fails rather than only on a programmatic blocker (SWR-3121), and the
  configuration language gains the one shape that made the informal case
  unanswerable (SWR-3122).
- 2026-08-17 — SWR-3123 answers the question SWR-3122 raised and could not
  settle: how many shapes does the configuration language have to learn? None
  beyond the ones worth not executing code for. `programmatic` has been a
  modelled outcome of SWR-3106 since it was written, gated behind a stated
  reason and reachable by nothing; it becomes a generated parser that lives in
  the *user's* repository, is admitted by a static read of its syntax tree
  before it is ever run, is stdlib-only and host-independent by contract, and
  reports what it did not claim so a drifted format cannot look like requirements
  that ceased to exist. Declarative stays preferred wherever it reaches, so
  SWR-3122 is kept and deferred rather than dropped.
- 2026-08-17 — SWR-3123's runtime half landed; the requirement stays `draft`
  until its discovery half does. What exists now: the parser contract
  (`sources/generated.py`), the AST admissibility check that refuses before
  execution, the pinned-hash gate, the process host that re-execs Rotaris
  itself so a frozen install needs no external Python
  (`sources/parser_host.py`, interception first in all three
  `packaging/entrypoints/` launchers), `GeneratedParserSource` behind the
  ordinary adapter seam with a revision that never runs the parser, and the
  configuration union in `JsonProposalStore` — a `kind`-less document stays
  declarative, so every existing `requirement-source.json` loads unchanged.
  What does not exist yet, and is the second half: discovery producing a
  parser, `validate_proposal` running one twice and comparing bytes, and
  acceptance writing it into the workspace tree. Hand-written parsers over
  synthetic stores exercise every guarantee in
  `tests/unit/requirements/test_generated_parser*.py`.
