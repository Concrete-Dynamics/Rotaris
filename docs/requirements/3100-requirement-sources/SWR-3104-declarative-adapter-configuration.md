---
req-id: SWR-3104
status: approved
trace: required
test: required
title: "Declarative source configuration"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3104 — Declarative source configuration

A project whose requirements do not follow this repository's convention must be
describable without writing code. Improvising a parser per start would make the
requirement set non-deterministic, which is fatal for a system whose whole value
rests on stable ids and hashes.

Requirement: a requirement source can be declared entirely as data — source
type, file glob, and field mappings for id, title, lifecycle, type, parent and
relations — persisted in the workspace configuration (SWR-3117). A declarative
source is loaded deterministically: the same repository content yields the same
canonical requirements on every run, with no model call involved.

```json
{ "type": "markdown", "glob": "specs/**/*.md",
  "id": "frontmatter.id", "title": "heading", "status": "frontmatter.state" }
```

One matched document is one requirement unless the configuration states how the
document is split into several
([SWR-3122](SWR-3122-sectioned-requirement-documents.md)); both readings are
data, and neither involves a model.

## Acceptance criteria

- A declarative Markdown source over a synthetic `specs/` tree yields the
  expected requirements, twice, byte-identically.
- An unresolvable field mapping is a named configuration error that identifies
  the offending file and field, not a silently dropped requirement.
- A requirement whose mapped id is missing or malformed is reported, never
  auto-numbered.
- Loading a declarative source performs no network and no LLM call.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Field mappings resolve frontmatter, heading and nested paths; a malformed id is reported with its file | The declarative source engine | `tests/unit/requirements/test_declarative_source.py` |
| Integration | A workspace configured with a declarative source loads its requirements through the registry and reloads them identically | Config + registry + source | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | A user points Rotaris at a project whose requirements live in `specs/*.md`, declares the mapping once, and sees the requirements | Public product boundary → user-observable result | `tests/integration/test_requirement_sources.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
