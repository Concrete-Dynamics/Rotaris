---
req-id: SWR-3106
status: approved
trace: required
test: required
title: "Agent-assisted requirement source discovery"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3106 — Agent-assisted requirement source discovery

For a repository whose requirement structure Rotaris does not recognise, the
user should not have to hand-write a mapping from a blank page. Rotaris can
analyse the repository and propose one — but the proposal must become
persistent, reviewable configuration, never a per-start improvisation.

Requirement: a discovery run analyses the repository, names the requirement
artefacts it found, and proposes a **declarative** source configuration
(SWR-3104). The proposal is validated by loading it — it must parse the files it
claims and produce requirements with unique ids — and is presented for
confirmation before being persisted. A programmatic adapter is proposed only
when the discovery states why a declarative mapping cannot express the source.

Two later requirements say when this runs and how far it reaches. A workspace
arrives here whenever no source *read* it, not only when none matched a path
([SWR-3120](SWR-3120-empty-source-does-not-claim-workspace.md)); and the analyst
seam this requirement created is crossed wherever the deterministic analyst
produces nothing adoptable, rather than only when it names a blocker
([SWR-3121](SWR-3121-agent-described-requirement-store.md)). Every guarantee
below is unchanged by both. The `programmatic` outcome this requirement names
and gates finally acquires a path in
[SWR-3123](SWR-3123-generated-requirement-parser.md) — under this requirement's
gate, not around it.

## Acceptance criteria

- Discovery output is a configuration document, not a parser script, whenever a
  declarative mapping is possible.
- A proposal that fails validation is reported with the failing file and is not
  persisted.
- Once persisted, subsequent loads use the configuration and run no analysis.
- The user sees what was found and what will be written before it is written.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A proposal that produces duplicate ids fails validation and is rejected with the colliding id named | Proposal validation | `tests/unit/requirements/test_source_discovery.py` |
| Integration | A scripted discovery over a synthetic repository proposes a mapping, validates it, persists it, and the next load runs no analysis | Discovery + config + registry | `tests/integration/test_requirement_source_discovery.py` |
| User-flow E2E | A user opens a project with an unknown requirement layout, accepts the proposed mapping, and the requirements appear | Public product boundary → user-observable result | `tests/integration/test_requirement_source_discovery.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
