---
req-id: SWR-3122
status: draft
trace: required
test: required
type: technical
derived-from: SWR-3121
title: "Requirements declared as sections of one document"
epic: SWR-3100
date: 2026-08-17
---

# SWR-3122 — Requirements declared as sections of one document

SWR-3121 asks an agent to describe a store whose requirements are sections of a
single prose document, and to answer with a declarative configuration (SWR-3104).
There is nothing for it to answer *with*: a declarative source reads one
requirement per matched file — `glob` selects documents, and each document
becomes exactly one canonical requirement. The shape SWR-3121 exists to reach is
the one shape the configuration language cannot express, so without this the
agent's only honest answer for it is a programmatic blocker.

This is also the shape the built-in store already has and calls a *spec file*
(SWR-2330): several ids in one document, each with its own `## SWR-<n>` section.
The capability exists in the ReqToCode source and not in the declarative one.

**Deferred behind [SWR-3123](SWR-3123-generated-requirement-parser.md).** A
generated parser reads this shape too, so this requirement is no longer what
makes the single-document case reachable — it is what keeps the *common* case
from being reached by executing code. That is worth having and it is not urgent:
a store this ordinary deserves a mapping a human can read in ten lines, not a
program. Implement it when the parser path has shown which shapes recur.

Derived from: [SWR-3121 — An agent describes a requirement store no heuristic
can](SWR-3121-agent-described-requirement-store.md)

Requirement: a declarative source can state that a matched document declares
*several* requirements, by naming how the document is split and resolving the
field mappings against each part.

- A document is split declaratively — by heading level, or by a pattern that
  marks where a requirement begins — and each part is a requirement. Absent that
  statement a document remains one requirement, so every existing configuration
  keeps its current meaning.
- Field mappings resolve against the part first and the document second, so a
  lifecycle stated once at the top of the file applies to every requirement in
  it and a section that states its own overrides it. This is the rule the
  built-in store already applies to spec files; it is not a second one.
- Splitting is deterministic and produces the same parts, in the same order, for
  the same bytes. It runs no model: the *description* of the split may come from
  an agent (SWR-3121), the split itself never does.
- Per-requirement identity follows from SWR-3107 unchanged, because each part
  carries its own canonical content: editing one requirement's section moves
  that requirement's `current_hash` and leaves its siblings' alone.
- A part the split produces that carries no id is reported with its document and
  its position, never dropped and never auto-numbered (SWR-3104).
- Write-back is not claimed by declaration. A source that reads sections
  declares the capability it actually has (SWR-3105) — reading — so the board
  disables edits it cannot perform rather than corrupting a shared document.

## Test coverage

Unit coverage over the split and the two-level mapping resolution: a document
split by heading level yields one requirement per section with document-level
fields inherited and section-level fields overriding; an idless section is
reported with its position; the same bytes split identically twice; a
configuration that states no split reads one requirement per document exactly as
before. Integration coverage reads a synthetic single-document store through the
registry and asserts that editing one section moves only that requirement's
hash, and that the source declares read-only capability.

The originating product flow is SWR-3121's: a user opens a project whose
requirements are one prose document and accepts the proposed mapping.

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
