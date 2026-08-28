---
req-id: [SWR-1600, SWR-1601, SWR-1602, SWR-1603, SWR-1604, SWR-1605, SWR-1606, SWR-1607, SWR-1608, SWR-1609, SWR-1610, SWR-1611, SWR-1612, SWR-1613, SWR-1614, SWR-1615, SWR-1616, SWR-1617, SWR-1618, SWR-1619, SWR-1633, SWR-1634, SWR-1635, SWR-1636, SWR-1637]
status: approved
trace: required
test: required
title: "Post-Run Improvement Loop"
---

# 1600-improvement-loop spec

## SWR-1600 — Post-Run Improvement Loop
trace: optional
test: optional

Cross-run improvement collection, approval-gated improvement runs, and improvement notifications.

Requirements added after the 2026-07-18 migration live one file per requirement in
[1600-improvement-loop/](1600-improvement-loop/):

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-1638](1600-improvement-loop/SWR-1638-improvement-collector-model-slot.md) | Improvement Collector dedicated model slot | — | approved |
| [SWR-1639](1600-improvement-loop/SWR-1639-captured-post-run-improvement-lifecycle.md) | Captured post-run improvement lifecycle | — | approved |
| [SWR-1640](1600-improvement-loop/SWR-1640-improvement-artifact-history.md) | Versioned improvement artifact history | P2 | draft |
| [SWR-1641](1600-improvement-loop/SWR-1641-improvement-run-rollback.md) | Rollback of an applied improvement run | P2 | draft |
| [SWR-1642](1600-improvement-loop/SWR-1642-improvement-history-cli.md) | CLI surface for improvement history and rollback | P2 | draft |

## SWR-1601 — Run-type separation
legacy-id: REQ-20260515-POSTRUN-IMPROVE-001
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The system MUST distinguish between at least two run classes: - `task_run`: executes the user's requested task. - `improvement_run`: executes approved workspace-improvement proposals only. `task_run` and `improvement_run` must remain logically separate in prompt construction, execution intent, and artifact generation. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1602 — Improvement Collector
legacy-id: REQ-20260515-POSTRUN-IMPROVE-002
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

Derived requirements: [SWR-1638 — Improvement Collector dedicated model slot](1600-improvement-loop/SWR-1638-improvement-collector-model-slot.md)

After a `task_run` reaches a terminal state, the system MUST invoke a dedicated `Improvement Collector` component to analyze the completed run and emit structured improvement artifacts. The `Improvement Collector`: 1. MUST be model-backed, with its own system prompt and output contract. 2. MUST run after the primary run has already stopped. 3. MUST NOT parti | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1603 — Collector ownership boundary
legacy-id: REQ-20260515-POSTRUN-IMPROVE-003
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The primary orchestrator and scheduler may gather evidence during execution, but the final improvement proposals MUST be authored by the dedicated `Improvement Collector` rather than by the primary orchestrator prompt itself. The orchestrator may pass evidence into the `Improvement Collector`, but it must not directly emit user-reviewable improvement proposa | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1604 — Improvement proposal artifact
legacy-id: REQ-20260515-POSTRUN-IMPROVE-004
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The `Improvement Collector` MUST write a structured run-level artifact containing zero or more improvement proposals. Each proposal MUST include at least: - stable proposal ID - category - summary - evidence - recommended action - risk level - approval status - source run/session identifier The artifact MUST be persisted with other workspace-local improvement state so it can be reviewed later across sessions. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008), Phase 5 (v0.59.14, workspace-scoped cross-run artifact store + history + dedupe). REQ-001..019 implemented; T001..T013 covered.

## SWR-1605 — Proposal categories
legacy-id: REQ-20260515-POSTRUN-IMPROVE-005
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The system MUST support explicit proposal categories so downstream approval and execution can be bounded. At minimum, the model must be able to classify proposals such as: - `documentation_update` - `agents_md_update` - `workspace_note` - `config_change` - `tool_enablement` - `dependency_install` - `persona_or_prompt_adjustment` - `persona_memory_update` - ` | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1606 — Evidence requirement
legacy-id: REQ-20260515-POSTRUN-IMPROVE-006
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

Every emitted proposal MUST carry concrete evidence from the completed run. Evidence may include structured report findings, transcript-derived observations, repeated tool failures, repeated search behaviour, or explicit missing-resource signals. The `Improvement Collector` MUST NOT emit unsupported speculative proposals without evidence. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1607 — No inline execution
legacy-id: REQ-20260515-POSTRUN-IMPROVE-007
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

No improvement proposal may be executed automatically at the end of a `task_run`. In particular, the system MUST NOT: - install dependencies automatically - edit `AGENTS.md` automatically - edit workspace configuration automatically - trigger a follow-up repair pass inside the same `task_run` unless a separate, explicit user approval flow starts an `improvem | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1608 — User approval model
legacy-id: REQ-20260515-POSTRUN-IMPROVE-008
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The user MUST be able to review collected proposals and explicitly choose which proposals are approved, rejected, or deferred. Approval state MUST be persisted and must survive app restart or session reload. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1609 — Improver executor
legacy-id: REQ-20260515-POSTRUN-IMPROVE-009
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

Approved proposals MUST be executed by a separate `Improver`, implemented as an agent or agent-run with: - its own system prompt - its own execution objective - its own report artifact - its own run classification as `improvement_run` The `Improver` must operate only on the approved proposals passed into it. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1610 — Improvement-run scope boundary
legacy-id: REQ-20260515-POSTRUN-IMPROVE-010
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

An `improvement_run` MUST be restricted to workspace-improvement tasks. It must not resume or reinterpret the original user task unless that original task is explicitly restated as part of an approved improvement proposal. The `Improver` prompt must instruct the model to avoid opportunistic product work unrelated to the approved proposals. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1611 — No self-recursive improvement loop
legacy-id: REQ-20260515-POSTRUN-IMPROVE-011
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

An `improvement_run` MUST NOT automatically trigger a second-generation `Improvement Collector` pass that leads to nested improvement runs from its own output. If improvement analysis is retained for observability, any proposals emitted from an `improvement_run` must default to non-executable review-only state and must not auto-chain into additional runs. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1612 — Non-blocking task completion
legacy-id: REQ-20260515-POSTRUN-IMPROVE-012
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The existence of the `Improvement Collector` MUST NOT change whether the main `task_run` is considered finished. Once the primary run reaches terminal state, user-visible task completion must not be delayed by requiring proposal review or improvement execution. `Improvement Collector` execution may occur immediately after terminal completion, but it is a pos | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1613 — Workspace-memory compatibility
legacy-id: REQ-20260515-POSTRUN-IMPROVE-013
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

Collected proposals and approved outcomes SHOULD be structured so a future workspace-memory or cross-run aggregation layer can consume them without reparsing free-form prose. This requirement does not mandate a full memory system yet, but it requires artifact formats that are compatible with one. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1614 — Persona-specific workspace memory
legacy-id: REQ-20260515-POSTRUN-IMPROVE-014
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The system MUST support workspace-scoped memory keyed by persona/agent type, with separate memory for each persona in a workspace. This memory is intended for small, durable workspace-operating guidance that is relevant only to the matching persona, such as test invocation quirks, local environment constraints, or bounded role-specific workflow notes. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1615 — Persona-specific automatic injection
legacy-id: REQ-20260515-POSTRUN-IMPROVE-015
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

When a persona is instantiated, the system MUST automatically inject only that persona's workspace memory into its context. The system MUST NOT inject tester-specific memory into unrelated personas by default unless the same memory is explicitly recorded for those personas too. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1616 — Visible bounded persona-memory storage
legacy-id: REQ-20260515-POSTRUN-IMPROVE-016
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

Persona-specific workspace memory MUST be stored in visible workspace-local files or an equivalently user-inspectable workspace-local representation. This memory MUST remain bounded to a small size, on the order of a couple hundred lines or another similarly strict limit, so it remains reviewable and does not silently become a second copy of the persona's fu | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1617 — Collector support for persona-memory proposals
legacy-id: REQ-20260515-POSTRUN-IMPROVE-017
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

The `Improvement Collector` MUST be able to emit evidence-backed proposals to create or update persona-specific workspace memory. Such proposals MUST identify at least: - target persona - proposed memory change summary - evidence from the completed run - recommended action - approval status | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1618 — Approval-gated persona-memory mutation
legacy-id: REQ-20260515-POSTRUN-IMPROVE-018
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

A `task_run` MUST NOT create or update persona-specific workspace memory automatically. Persona-memory changes proposed by the `Improvement Collector` may be applied only by a separate, explicit, approval-gated `improvement_run`. This restriction does not prohibit direct manual user edits outside agent execution. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1619 — Persona-memory scope boundary
legacy-id: REQ-20260515-POSTRUN-IMPROVE-019
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md

Persona-specific workspace memory MUST remain narrowly scoped to durable workspace-operating guidance for that persona. It MUST NOT be used as an unbounded mechanism for silently rewriting a persona's role, replacing its maintained system prompt, or smuggling unrelated product work into a future run. | Complete - Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008). REQ-001..019 implemented; T001..T013 covered.

## SWR-1633 — Toast on non-empty improvement artifact
status: draft
legacy-id: REQ-20260610-001
date: 2026-06-10
source: docs/requirement-log/unresolved/requirements-20260610-improvement-toast-notification.md
priority: High



## SWR-1634 — Toast click opens ImprovementProposalsScreen
status: draft
legacy-id: REQ-20260610-002
date: 2026-06-10
source: docs/requirement-log/unresolved/requirements-20260610-improvement-toast-notification.md
priority: High



## SWR-1635 — No toast for empty or disabled collector
status: draft
legacy-id: REQ-20260610-003
date: 2026-06-10
source: docs/requirement-log/unresolved/requirements-20260610-improvement-toast-notification.md
priority: Medium



## SWR-1636 — Command palette fallback preserved
status: draft
legacy-id: REQ-20260610-004
date: 2026-06-10
source: docs/requirement-log/unresolved/requirements-20260610-improvement-toast-notification.md
priority: Medium



## SWR-1637 — Start from proposals screen executes improvement run
status: draft
legacy-id: REQ-20260610-005
date: 2026-06-10
source: docs/requirement-log/unresolved/requirements-20260610-improvement-toast-notification.md
priority: High



## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
