---
req-id: SWR-3120
status: approved
trace: required
test: required
title: "A source that reads no requirement does not claim the workspace"
epic: SWR-3100
date: 2026-08-17
---

# SWR-3120 — A source that reads no requirement does not claim the workspace

SWR-3103 selects the built-in source for "a workspace whose layout resolves to a
requirement store", and SWR-3106 runs discovery for a repository "whose
requirement structure Rotaris does not recognise". Between those two sentences
sits a workspace neither of them describes: one that *has* the directory and
none of the convention.

Selection is currently a directory test — `docs/requirements/` exists, therefore
the ReqToCode source claims the workspace. Its parser then skips every file that
carries no `req-id` frontmatter, silently and by design, because analysis notes
and READMEs live in that directory too. A project that keeps its requirements
under the same path with a different frontmatter key gets a bound source, zero
requirements, no error and no discovery: the board says the store is readable
and declares nothing, which is true of the mapping and false of the project.
The user is told their requirements do not exist, and the one mechanism built to
recognise them (SWR-3106) is never reached — because reaching it requires
*no* source, and a source was found.

Requirement: **a source claims a workspace by producing requirements, not by
matching a path.** A source that binds and reads nothing does not stand between
the workspace and discovery.

- Automatic selection is confirmed by a read. A candidate source that yields no
  requirement is not selected, and the workspace is treated as one no source
  recognises — which is the entry condition of SWR-3106.
- The distinction the board draws is between three states, not two: no
  requirement-shaped document was found anywhere; documents were found and no
  source could read them; a source read them and the project genuinely declares
  none. Only the third is an empty board.
- A **configured** source is exempt. SWR-3106 makes a persisted configuration
  the end of discovery for that workspace, and a configured source that reads
  nothing is a fact about the configuration the user accepted — reported as
  itself, never silently replaced by a rediscovery that would then compete with
  the configuration on every start.
- What a rejected candidate found is carried into the discovery it hands over
  to, so the survey does not re-read the tree the selection just read.

## Acceptance criteria

- A workspace with a `docs/requirements/` directory whose documents carry no
  `req-id` is not claimed by the built-in source, and discovery runs.
- A workspace whose store genuinely declares no requirement — an empty
  convention-shaped store — is claimed, and the board states an empty store
  rather than offering discovery.
- A workspace whose configured source reads no requirement reports that against
  the configuration, and no discovery replaces it.
- The three states above produce three different sentences in the Requirements
  area, each naming what to do next.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A store directory of documents with a foreign id key yields no source; a convention-shaped empty store yields one | Automatic source selection | `tests/unit/requirements/test_source_selection.py` |
| Integration | A workspace with a foreign-keyed store under `docs/requirements/` reaches discovery and is proposed a mapping; a configured source that reads nothing is reported instead | Selection + discovery + registry | `tests/integration/test_requirement_source_discovery.py` |
| User-flow E2E | A user opens a project whose requirements live under `docs/requirements/` with a different frontmatter key and is offered a mapping instead of an empty board | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_source_offer.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
