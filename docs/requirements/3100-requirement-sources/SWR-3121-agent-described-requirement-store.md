---
req-id: SWR-3121
status: approved
trace: required
test: required
title: "An agent describes a requirement store no heuristic can"
epic: SWR-3100
date: 2026-08-17
---

# SWR-3121 — An agent describes a requirement store no heuristic can

SWR-3106 gave discovery a seam for judgement and a deterministic analyst behind
it. The deterministic analyst reads frontmatter keys, and the seam is only ever
crossed when it produces a *programmatic* proposal — the answer it gives when it
found requirement-shaped documents but no key that could be an id.

That leaves the commonest unrecognised store unreachable. A candidate directory
counts as requirement-shaped only if some document in it carried a frontmatter
block; a tree of plain Markdown scores zero, no candidate survives, and the
analyst answers `None` **before the seam is reached**. So the shapes a model
exists to handle are exactly the ones it is never asked about: a single
`REQUIREMENTS.md` with one `## FR-3 …` section per requirement, a numbered list
under a heading, a table of id and description, a folder of prose whose ids live
in filenames or first lines. Rotaris' answer to all of them today is that the
repository holds no requirements.

We cannot enumerate how projects organise requirements, and a heuristic per
layout is a losing race. Reading an unfamiliar document and saying what it
declares is a judgement, and judgement is what the analyst seam is for.

Requirement: when no deterministic analyst can describe a repository that
visibly holds requirement prose, Rotaris **asks a configured agent** to describe
it — where the requirements live, what marks one, and how to read its id,
title, lifecycle and relations — and the answer re-enters SWR-3106's existing
path as an ordinary proposal.

- The agent is asked only where determinism has failed. A repository the
  heuristic maps costs no model call, and neither does one whose configuration
  is already persisted (SWR-3106). The escalation condition widens from "the
  heuristic proposed a programmatic adapter" to "the heuristic produced nothing
  a user can adopt".
- The agent is given documents, not an inventory. The survey behind the
  deterministic analyst reports counts and frontmatter keys, which is sufficient
  for a store that has frontmatter and worthless for one that does not; an
  agent asked to recognise prose is given bounded, deterministically selected
  excerpts of that prose, and the selection is reproducible for a given tree.
- **The agent never returns requirements.** It describes *how to read* the
  store: a declarative configuration wherever one can express it (SWR-3104), or
  a parser where none can ([SWR-3123](SWR-3123-generated-requirement-parser.md)).
  A proposal carrying requirement text would make the model the source, which is
  the second requirement repository SWR-3114 forbids, and would put a model in
  the path of every later read.
- **No id is ever invented.** An id must be *found* in the artefact by a mapping
  a later deterministic load reproduces. Requirement ids are stable forever and
  every hash, delivery record and trace hangs off them, so a generated id is not
  a worse answer but a corrupt store. A repository whose requirements carry no
  identifier at all is reported as exactly that.
- Every SWR-3106 guarantee holds unchanged: the proposal is validated by loading
  it, it is shown before it is written, it is persisted only on acceptance, and
  once persisted no analysis and no model call runs on any later load.
- Failure is an answer. No configured model, an unreachable one, a malformed
  reply, or a repository the agent cannot describe each leave the deterministic
  result standing and say why — never an exception out of a survey, and never a
  guess presented as a finding.

Derived requirements:
[SWR-3122 — Requirements declared as sections of one document](SWR-3122-sectioned-requirement-documents.md)

The agent's answer takes whichever of the two forms the store admits, and the
declarative one is preferred wherever it is possible: it is reviewable as data
and executes nothing. SWR-3123 states what it costs to reach the other.

The shapes this reaches are the ones the **configuration language already
expresses**: a field mapping resolves `frontmatter.*`, `heading`, `body`,
`filename`, `stem` and `path`, each with an optional regular expression, so a
folder of prose whose ids live in file names or first lines needs judgement and
no new grammar. One document holding many requirements is the shape it cannot
reach, and that one belongs to
[SWR-3122](SWR-3122-sectioned-requirement-documents.md) — deferred, so this
requirement does not wait on it.

## Acceptance criteria

- A repository whose requirements are a folder of plain Markdown, with no
  frontmatter anywhere and the id in each file's name or first line, yields a
  validated proposal that reads every one of them with its own id and title.
- The same repository, with the same agent answer, yields the same configuration
  and the same requirement set on a second run.
- A proposal is refused, with the artefact named, when it maps an id the
  document does not contain.
- A workspace with no model configured still discovers, using the deterministic
  analyst alone, and states that the agent was not consulted.
- Loading a persisted configuration performs no model call, whatever produced
  it.
- The agent is not consulted for a repository the deterministic analyst already
  maps.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A scripted agent answer over a frontmatter-free store becomes a validated configuration; the chain escalates both when the heuristic proposes nothing and when its proposal cannot load; an answer naming an absent id is refused with the artefact named; a literal id is refused outright; an unreachable model leaves the deterministic result standing and says so | The analyst chain and its answer schema | `tests/unit/requirements/test_source_discovery_agent.py` |
| Integration | A synthetic folder of plain Markdown is discovered through the real chain, validated, persisted, and the next load reads it with no analysis of any kind | Discovery + config + registry | `tests/integration/test_requirement_source_discovery.py` |
| User-flow E2E | A user opens a project Rotaris cannot read and the board states which analyst answered before they accept its mapping | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_source_offer.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
