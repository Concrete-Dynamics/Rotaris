---
reference: ROTARIS-CRW-001
domain: requirements-traceability
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Requirements Board and Traceability

## Overview

A project keeps its requirements as versioned documents in its own repository. A traceability toolchain compiles those documents into a generated code artifact whose symbols are referenced by annotations on implementing code and covering tests, then checks — from the desktop application, and in the project's own test run — that every approved requirement is implemented and covered, that no annotation names a requirement that no longer exists, that no production module and no test is untraced, and that a requirement whose text changed has had its implementing sites revisited. On top of the same data a graphical board presents every requirement as a card in a column, states the health of the evidence behind it, and lets a user release work, review a result, edit or create a requirement, answer a blocker and schedule a run — with every state change passed to the engine, attributed and recorded, and with nothing ever written by merely looking at the board.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`08-requirements-traceability/`](08-requirements-traceability/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](08-requirements-traceability/01-requirements.md) | Requirements; Requirement Store: Layout and Discovery; Frontmatter Parsing; Frontmatter Schema and Vocabulary; Identifier Scheme; Multi-Identifier Specification Documents; Content Hashing; Layout Configuration; Repository Root Discovery | REQ-TRACE-001 – REQ-TRACE-050 (51) |
| [02](08-requirements-traceability/02-generated-requirement-symbol-artifact.md) | Generated Requirement-Symbol Artifact; Link Declaration: Annotations; Annotation Conventions (Language Seam); Repository Sweep | REQ-TRACE-051 – REQ-TRACE-089 (39) |
| [03](08-requirements-traceability/03-verification-pass.md) | Verification Pass; Orphan Code (Reverse Check: Code to Requirement); Orphan Tests (Reverse Check: Test to Requirement); Debt Baselines (Shrink-Only Ratchets); Retired Identifiers (Tombstones) | REQ-TRACE-090 – REQ-TRACE-141 (52) |
| [04](08-requirements-traceability/04-toolchain-operations.md) | Toolchain Operations | REQ-TRACE-142 – REQ-TRACE-514 (23) |
| [05](08-requirements-traceability/05-change-comparison-against-a-base-revision.md) | Change Comparison Against a Base Revision; Read-Only Coverage Query; Store Probing; Enforcement Layers; Authoring and Propagation Workflow; Consumer Integration Contracts | REQ-TRACE-156 – REQ-TRACE-209 (55) |
| [06](08-requirements-traceability/06-pass-progress-reporting.md) | Pass Progress Reporting; Cancellation; Board Surface: Columns and Delivery States; Requirement Cards; Evidence Indicator; Evidence Detail | REQ-TRACE-210 – REQ-TRACE-270 (62) |
| [07](08-requirements-traceability/07-requirement-detail-view.md) | Requirement Detail View; Epic Cards; Sorting, Filtering and Grouping; Collapsible Columns; Relationship Graph | REQ-TRACE-271 – REQ-TRACE-505 (64) |
| [08](08-requirements-traceability/08-live-refresh-and-refresh-kinds.md) | Live Refresh and Refresh Kinds; Board Scaling and Virtualisation; Surface Composition and Staging | REQ-TRACE-334 – REQ-TRACE-381 (49) |
| [09](08-requirements-traceability/09-write-back-the-closed-action-set.md) | Write-Back: The Closed Action Set; Refusals, Guards and Attribution; Offer Discipline; Review Surface; Derived Technical Requirement Proposals | REQ-TRACE-382 – REQ-TRACE-433 (53) |
| [10](08-requirements-traceability/10-editing-and-creating-requirements.md) | Editing and Creating Requirements; Blockers; Release Gate and Blocker Chain; Runs Started from the Board; Delivery Queue; Keyboard Operability and Accessibility | REQ-TRACE-434 – REQ-TRACE-493 (60) |
| [11](08-requirements-traceability/11-ordering-constraints-and-global-invariants.md) | Ordering Constraints and Global Invariants | REQ-TRACE-494 – REQ-TRACE-500 (7) |
| [12](08-requirements-traceability/12-data-formats.md) | Data & Formats; Requirement document; Identifier format; Hashes; Generated requirement-symbol artifact; Debt baseline; Orphan-module baseline; Orphan-test baseline; Retired-identifier log; Layout configuration (`rotaris-traceability.json`, at the repository root — REQ-TRACE-040); Toolchain operations; Progress protocol; Board tokens; Persisted state; Numeric constants | — |
| [13](08-requirements-traceability/13-open-questions.md) | Open Questions | — |
