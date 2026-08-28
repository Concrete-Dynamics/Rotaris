---
req-id: [SWR-1900, SWR-1901, SWR-1902, SWR-1904, SWR-1905, SWR-1906, SWR-1907, SWR-1908, SWR-1909, SWR-1910, SWR-1911, SWR-1912, SWR-1913, SWR-1914, SWR-1915, SWR-1916, SWR-1917, SWR-1918, SWR-1919, SWR-1920, SWR-1921, SWR-1922, SWR-1923]
status: approved
trace: optional
test: optional
title: "Knowledge, Librarian & Architecture Docs"
---

# 1900-knowledge-docs spec

## SWR-1900 — Knowledge, Librarian & Architecture Docs

Knowledge management personas: the librarian agent and architect-owned architecture documentation.

## SWR-1901 — Agent Identity
test: required
legacy-id: REQ-20260414-115229-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

A new agent named `Librarian` must be added to the framework.

## SWR-1902 — Codebase Search
test: required
legacy-id: REQ-20260414-115229-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must be able to search the codebase for files, symbols, patterns, and content matches.

## SWR-1904 — Additional Search Tools
test: required
legacy-id: REQ-20260414-115229-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must have access to any additional search tools the implementer deems appropriate. Tool selection is left to the implementer's discretion.

## SWR-1905 — Report Output Format
test: required
legacy-id: REQ-20260414-115229-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must return results as Markdown-formatted text responses.

## SWR-1906 — System Prompt Design
test: required
legacy-id: REQ-20260414-115229-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must have a purpose-built system prompt that constrains it to search/reporting tasks only, following the conventions of the existing agent system prompts in the framework. The implementer uses existing agent prompts as the structural reference.

## SWR-1907 — Availability to Architect
test: required
legacy-id: REQ-20260414-115229-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must be registered as a callable sub-agent in the **Architect** agent's tool/agent list.

## SWR-1908 — Availability to Orchestrator
test: required
legacy-id: REQ-20260414-115229-008
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must be registered as a callable sub-agent in the **Orchestrator** agent's tool/agent list.

## SWR-1909 — No Side Effects
test: required
legacy-id: REQ-20260414-115229-009
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must not modify, create, or delete any files - it is strictly read-only.

## SWR-1910 — System Prompt Quality
legacy-id: REQ-20260414-115229-010
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The system prompt must be explicit about scope (search + report only), tool usage strategy, and output format expectations.

## SWR-1911 — Framework Consistency
legacy-id: REQ-20260414-115229-011
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian's definition (system prompt structure, tool registration, agent manifest) must follow the same conventions as existing agents in the framework.

## SWR-1912 — Read-Only Constraint
test: required
legacy-id: REQ-20260414-115229-012
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian must not be given any tools that can write to or mutate the file system or any external state.

## SWR-1913 — Availability Scope
test: required
legacy-id: REQ-20260414-115229-013
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-115229.md

The Librarian is only available to the Architect and the Orchestrator - not to other agents, unless explicitly specified later.

## SWR-1914 — The `architect` persona must be the accountable owner of architecture documentation for the codebase. When the codebase architecture changes in a way that affects documented structure, boundaries, runtime flow, or responsibilities, the architecture documentation set must be updated accordingly.
legacy-id: REQ-20260509-001
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1915 — Architecture documentation ownership must be scoped explicitly: the Architect persona owns architecture content, while the `docs-writer` persona must not be treated as the owner of architecture documentation. `docs-writer` may assist only when explicitly delegated, but responsibility for architectural correctness remains with the Architect persona.
legacy-id: REQ-20260509-002
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1916 — The canonical architecture entry point must remain `docs/architecture.md`. This file must serve as the authoritative index for the architecture documentation set and link to every required architecture representation stored under `docs/architecture/`.
legacy-id: REQ-20260509-003
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1917 — The repository must contain a distinct architecture documentation folder at `docs/architecture/`. This folder must be reserved for architecture views of the codebase rather than requirement logs, implementation status, or unrelated user documentation.
legacy-id: REQ-20260509-004
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1918 — The architecture documentation set must include a dedicated current-state system context view at `docs/architecture/system-context.md`. This view must describe the major runtime subsystems, their responsibilities, and the external systems, frameworks, or services they depend on.
legacy-id: REQ-20260509-005
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1919 — The architecture documentation set must include a dedicated current-state runtime flow view at `docs/architecture/runtime-flow.md`. This view must describe how work moves through the system at runtime, including orchestration, delegation, execution flow, and result propagation between major architectural components.
legacy-id: REQ-20260509-006
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1920 — The architecture documentation set must include a dedicated current-state codebase structure view at `docs/architecture/codebase-map.md`. This view must describe the static organization of the codebase, including the main packages/modules, their roles, and the principal dependency relationships between them.
legacy-id: REQ-20260509-007
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1921 — The architecture documentation set must include a dedicated current-state cross-cutting concerns view at `docs/architecture/cross-cutting-concerns.md`. This view must describe architectural boundaries and invariants that cut across modules, including ownership boundaries, read-only vs mutating responsibilities, persistence boundaries, and other project-wide constraints that shape the architecture.
legacy-id: REQ-20260509-008
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1922 — Every document in the architecture documentation set must describe the current architecture only. These documents must represent the status quo of the repository as it exists now, not a target architecture, rollout plan, migration plan, or aspirational future state.
legacy-id: REQ-20260509-009
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## SWR-1923 — Architecture documentation must not contain implementation status, completion tracking, progress markers, requirement implementation states, or similar delivery-status metadata. Any implementation status reference must defer to the traceability matrix instead of duplicating that information inside architecture documents.
legacy-id: REQ-20260509-010
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-120000.md
priority: High



## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Librarian Agent (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-115229.md` — document status: Complete

#### Description

A new agent named **Librarian** is added to the existing multi-agent framework. Its sole responsibility is to search the codebase and return precise, Markdown-formatted reports about findings. It has access to `find` and any other search tools deemed appropriate by the implementer. The Librarian is exposed as a callable sub-agent to both the **Architect** and the **Orchestrator** agents.

#### Implementation Notes

**Requirements Document:**

#### Acceptance Criteria

**Constraints:**

### Rotaris - Architect-Owned Architecture Documentation (2026-05-09)

Original: `docs/requirement-log/done/requirements-20260509-120000.md` — document status: Complete

#### Description

The Architect persona must actively own and maintain the project's architecture documentation. The canonical entry point remains `docs/architecture.md`, which serves as the index for a dedicated architecture documentation set under `docs/architecture/`. That set must use a fixed, explicit set of representations from different architectural perspectives so agents do not invent missing views. These documents must describe only the current architecture of the codebase as it exists now; they must not track implementation progress, completion state, or future rollout status.

**Current behaviour:**

The repository currently contains a single architecture guide at `docs/architecture.md`. The project already defines distinct personas including `architect` and `docs-writer`, but no requirement explicitly assigns ownership of architecture documentation to the Architect persona or fixes a required multi-document architecture representation set. The requirements corpus also establishes that implementation status is tracked only in the traceability matrix, not in general documentation.

**What needs to change:**

1. Assign explicit ownership of architecture documentation to the Architect persona.

2. Keep `docs/architecture.md` as the canonical architecture entry point and make it the index for a dedicated `docs/architecture/` folder.

3. Standardize a fixed set of architecture representations so the expected views are explicit and stable.

4. Clarify that the Architect owns architecture documentation, while `docs-writer` does not own architecture content.

5. Require the architecture documents to describe the status quo only: the current structure, boundaries, and flows of the system.

6. Forbid architecture documentation from duplicating implementation status, completion tracking, or rollout progress.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `FR-2-001`, `FR-2-002` in `requirements-20260413-000002-personas-and-config.md`; `REQ-20260413-201248-006` in `requirements-20260413-201248.md`; `REQ-20260414-115229-007` and `REQ-20260414-115229-013` in `requirements-20260414-115229.md`; `REQ-20260417-120000-017` in `requirements-20260417-173238.md`

- Blocks: Future Architect prompt revisions, persona-boundary clarifications, and architecture-document maintenance work

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260413-000002-personas-and-config.md` | The repo defines both `architect` and `docs-writer` personas, but did not explicitly assign ownership of architecture documentation. | The Architect persona owns architecture documentation. `docs-writer` may assist only by explicit delegation and is not the owner of architecture content. `docs/architecture.md` | The repo currently has a single top-level architecture guide, while the new requirement needs a dedicated architecture-document set with multiple perspectives. | `docs/architecture.md` remains canonical and becomes the index page for the detailed architecture views stored under `docs/architecture/`. `requirements-20260417-173238.md` / `REQ-20260417-120000-017` | Architecture documentation could become a second place where implementation status is tracked, conflicting with the traceability rule. | Architecture documentation is restricted to current structure and behavior only. Implementation status and completion tracking remain exclusively in the traceability matrix.

**Notes:**

Future-state design, rollout planning, and migration intent are out of scope for this architecture documentation set. If the project needs prescriptive design material, it should live in proposal, ADR, or requirement documents rather than in the current-state architecture views.

**Selection Rationale:**

This requirement was selected and structured as it is for the following reasons:

1. **Architect ownership is explicit and non-transferable.** Architecture documentation drift is a recurring failure mode in agent-driven codebases because no persona is held accountable for keeping it current. Assigning ownership to the `architect` persona (and explicitly excluding `docs-writer`) gives agents a single, unambiguous owner to route architectural updates to, instead of letting documentation degrade into stale prose maintained by whoever last touched it.

2. **Canonical entry point preserved.** `docs/architecture.md` was kept as the canonical entry point rather than being replaced by a folder index because external references, AGENTS.md, and prior requirements already point at that path. Repurposing the existing file as the index for `docs/architecture/` avoids breaking inbound references while still enabling a multi-document representation set.

3. **Fixed four-view set, not free-form.** The four architecture views (`system-context.md`, `runtime-flow.md`, `codebase-map.md`, `cross-cutting-concerns.md`) were chosen as a closed set to prevent agents from inventing additional architecture documents ad-hoc. The four views cover the standard architectural perspectives (external context, runtime behavior, static structure, cross-cutting invariants) without overlap; allowing arbitrary new views would re-introduce the drift problem this requirement exists to solve.

4. **Current-state only, no progress tracking.** Architecture documentation was restricted to describing the codebase as it exists now because mixing target-state design, rollout status, or completion markers into architecture documents creates two conflicting sources of truth: the documents claim a future state while the code reflects the present. Implementation status is already tracked in the per-requirement files (and ReqToCode annotations), so duplicating that information inside architecture views would only create inconsistency.

5. **Forbidding status duplication enforces the traceability matrix.** Requirement REQ-20260509-010 explicitly bans implementation status, completion tracking, and progress markers from architecture documents and defers all such status to the traceability matrix. This keeps the traceability matrix as the single authoritative source of "what is done" and frees architecture documents to describe "how the system is shaped" without entangling the two.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A requirement explicitly assigns architecture-document ownership to the `architect` persona and excludes `docs-writer` from owning architecture content.

- [x] `docs/architecture.md` is defined as the canonical architecture entry point and index for the architecture documentation set.

- [x] A dedicated `docs/architecture/` folder is required for detailed architecture representations.

- [x] The required representation set is explicit and fixed to these four documents: `system-context.md`, `runtime-flow.md`, `codebase-map.md`, and `cross-cutting-concerns.md`.

- [x] Each required architecture document is defined as a current-state view rather than a target-state or progress-tracking document.

- [x] The requirement explicitly forbids implementation status or completion tracking inside architecture documentation and defers such status to the traceability matrix.
