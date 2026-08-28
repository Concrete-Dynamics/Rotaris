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

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
