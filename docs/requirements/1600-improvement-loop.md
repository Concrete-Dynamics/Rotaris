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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Cross-Run Improvement Collection and Approval-Gated Improvement Runs (2026-05-15)

Original: `docs/requirement-log/done/requirements-20260515-post-run-improvement-loop.md` — document status: Complete — Phase 1 (v0.49.0, collector pipeline), Phase 2 (v0.50.0, approval workflow + Improver executor), Phase 3 (v0.51.0, persona-specific workspace memory), Phase 4 (v0.52.0, integration tests T007/T013 + TUI review surface T008), Phase 5 (v0.59.14, workspace-scoped cross-run artifact store, legacy import compatibility, bounded history input, deterministic duplicate suppression). REQ-001..019 implemented; T001..T013 covered. **T008 augmented by REQ-20260610 (toast notification entry point).**

#### Description

Add a post-run improvement pipeline that executes only after a normal user task run reaches a terminal state. The pipeline must use a dedicated model-driven `Improvement Collector` to analyze the finished run and emit structured improvement proposals as artifacts. These proposals are not to be generated by the primary orchestrator itself and must not interrupt the user task. Approved proposals can later be executed by a separate `Improver` agent with its own system prompt, run type, and permissions boundary. The improvement loop must also support small, workspace-scoped memory for each agent/persona type so that recurring local quirks can be preserved in a bounded, reviewable form and injected automatically only into the matching persona on future runs.

**Problem being solved:**

Today each run starts largely fresh. When the system repeatedly discovers the same missing documentation, weak workspace guidance, absent dependency, or recurring workaround, that knowledge is not converted into a durable improvement workflow. This leads to repeated inefficiency across runs. This problem also applies at the persona level. Some operational knowledge is workspace-specific and only relevant to one agent type. For example, in this repo the testing persona may need to run tests with `PYTHONPATH=src` to avoid importing a preinstalled `rotaris_core` package instead of the working tree. That is valuable workspace knowledge, but it should not be shoved into every persona prompt or improvised fresh on each run. The obvious naive solution - having the main orchestrator repair the workspace before or during the user's requested task - is the wrong tradeoff. It mixes meta-maintenance with task execution, steals budget and attention from the active user goal, and creates uncontrolled drift in docs, config, and dependencies. The correct shape is a split lifecycle:

1. A normal `task_run` focuses only on the user goal.

2. After the run finishes, a dedicated `Improvement Collector` analyzes what happened and writes structured improvement artifacts.

3. The user reviews and approves selected proposals.

4. A separate `improvement_run` executes only the approved proposals.

One class of approved proposal may update persona-specific workspace memory so the affected persona automatically receives that quirk or operating note in future runs.

**Current behaviour:**

- `RalphLoop` drives a task-oriented run lifecycle and stops on terminal conditions.

- Child-task transcripts and structured child report artifacts already exist.

- `SummaryAgent` already demonstrates a pattern where a dedicated model produces structured post-execution artifacts from transcript data.

- Session persistence already stores structured snapshot data and report artifacts.

- There is no run-level concept of improvement proposals, approval state, or distinct `Improvement Collector` / `Improver` roles.

**Design intent:**

This feature is not general "memory". It is a controlled operational-learning loop for a workspace. Persona-specific workspace memory is part of that same controlled loop. It is not a free-form scratchpad and it is not a hidden permanent prompt mutation. It is a small, reviewable, workspace-local operating note for a specific persona. The core architectural rule is: > The primary orchestrator may observe improvement signals, but it must not be responsible for synthesizing final cross-run improvement proposals or executing them inline with the user task. That responsibility belongs to a dedicated post-run component, backed by a dedicated model and prompt contract.

#### Implementation Notes

**Requirements Document - Post-Run Improvement Loop:**

**Requirement ID:** REQ-20260515-POSTRUN-IMPROVE

**REQ-20260515-POSTRUN-IMPROVE-001 - Run-type separation:**

The system MUST distinguish between at least two run classes:

- `task_run`: executes the user's requested task.

- `improvement_run`: executes approved workspace-improvement proposals only.

`task_run` and `improvement_run` must remain logically separate in prompt construction, execution intent, and artifact generation.

**REQ-20260515-POSTRUN-IMPROVE-002 - Improvement Collector:**

After a `task_run` reaches a terminal state, the system MUST invoke a dedicated `Improvement Collector` component to analyze the completed run and emit structured improvement artifacts. The `Improvement Collector`:

1. MUST be model-backed, with its own system prompt and output contract.

2. MUST run after the primary run has already stopped.

3. MUST NOT participate in deciding how the primary user task is executed.

4. MUST NOT mutate the workspace directly.

**REQ-20260515-POSTRUN-IMPROVE-003 - Collector ownership boundary:**

The primary orchestrator and scheduler may gather evidence during execution, but the final improvement proposals MUST be authored by the dedicated `Improvement Collector` rather than by the primary orchestrator prompt itself. The orchestrator may pass evidence into the `Improvement Collector`, but it must not directly emit user-reviewable improvement proposals as if they were its own final decision artifact.

**REQ-20260515-POSTRUN-IMPROVE-004 - Improvement proposal artifact:**

The `Improvement Collector` MUST write a structured run-level artifact containing zero or more improvement proposals. Each proposal MUST include at least:

- stable proposal ID

- category

- summary

- evidence

- recommended action

- risk level

- approval status

- source run/session identifier

The artifact MUST be persisted with other workspace-local improvement state so it can be reviewed later across sessions.

**REQ-20260515-POSTRUN-IMPROVE-005 - Proposal categories:**

The system MUST support explicit proposal categories so downstream approval and execution can be bounded. At minimum, the model must be able to classify proposals such as:

- `documentation_update`

- `agents_md_update`

- `workspace_note`

- `config_change`

- `tool_enablement`

- `dependency_install`

- `persona_or_prompt_adjustment`

- `persona_memory_update`

- `preflight_check`

The exact internal enum may differ, but the categories must distinguish low-risk documentation/config guidance from higher-risk environment changes.

**REQ-20260515-POSTRUN-IMPROVE-006 - Evidence requirement:**

Every emitted proposal MUST carry concrete evidence from the completed run. Evidence may include structured report findings, transcript-derived observations, repeated tool failures, repeated search behaviour, or explicit missing-resource signals. The `Improvement Collector` MUST NOT emit unsupported speculative proposals without evidence.

**REQ-20260515-POSTRUN-IMPROVE-007 - No inline execution:**

No improvement proposal may be executed automatically at the end of a `task_run`. In particular, the system MUST NOT:

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] A normal user task run completes without being forced to apply workspace improvements before returning control to the user.

- [ ] After a terminal `task_run`, a dedicated `Improvement Collector` produces a structured improvement artifact containing zero or more proposals.

- [ ] The artifact clearly identifies proposals such as missing documentation, missing dependency, weak `AGENTS.md` guidance, or repeated workaround patterns when evidence exists.

- [ ] The primary orchestrator does not itself produce the final proposal artifact; that artifact is produced by the `Improvement Collector`.

- [ ] A proposal can be marked `approved`, `rejected`, or `deferred`, and that state survives reload.

- [ ] Approving proposals starts a separate `improvement_run` rather than reopening the completed `task_run`.

- [ ] The `improvement_run` uses a distinct `Improver` prompt/role focused only on the approved improvements.

- [ ] An approved dependency-install proposal may be executed during `improvement_run`, but never automatically during the original `task_run`.

- [ ] If there are no credible improvement signals, the `Improvement Collector` may emit an empty proposal artifact without error.

- [ ] An `improvement_run` does not recursively trigger further executable improvement runs from its own output.

- [ ] The system can persist small workspace memory independently for multiple personas, with each persona receiving only its own memory by default.

- [ ] In this repo, a tester-specific workspace quirk such as running tests with `PYTHONPATH=src` can be stored as tester memory and injected automatically into future tester runs without being injected into unrelated personas.

- [ ] Persona-specific memory remains directly inspectable and manually editable by the user in workspace-local storage.

- [ ] A persona-memory proposal can be marked `approved`, `rejected`, or `deferred`, and approved changes are applied only in a separate `improvement_run`.

### Requirements Document (2026-06-10)

Original: `docs/requirement-log/unresolved/requirements-20260610-improvement-toast-notification.md` — document status: Not Started

#### Summary

After a `task_run` completes and the `ImprovementCollector` authors a new artifact with one or more proposals, the TUI must proactively notify the user via a toast. Clicking the toast opens the `ImprovementProposalsScreen` for review, where the user can approve proposals and start the `Improver` execution. This closes the discoverability gap: today proposals are saved silently and the user must hunt for them through the command palette.

---

#### Context

### Problem being solved

The post-run improvement loop (REQ-20260515-POSTRUN-IMPROVE) already works end-to-end: the `ImprovementCollector` runs after every `task_run`, persists a structured `ImprovementProposalArtifact`, and the `ImprovementProposalsScreen` provides review/approval/execution. However, no user-facing signal announces that a new artifact exists. The user only discovers proposals by navigating to the command palette (`Ctrl+P`) and searching for "improvement proposals" — which they won't do unless they already know the feature exists. This makes the entire improvement pipeline invisible to first-time and casual users.

### Current behaviour

- `RalphLoop._run_post_run_improvement_pass()` invokes the collector, saves the artifact, sets `self.last_improvement_artifact_id`, and logs to `_log.info()` — all backend-only.
- `RotarisTuiApp._execute_run()` appends the artifact ID to `state.improvement_artifact_ids` but takes no TUI action.
- `action_show_improvement_proposals()` exists and works (opens `ImprovementProposalsScreen` for the most recent artifact), reachable only via command palette.
- The `ImprovementProposalsScreen` already supports approval (`a`/`r`/`d`/`p`), starting the improvement run (`s`), and dismissal (`esc`).
- `on_run_completed()` in `MainScreen` already dispatches a toast via `self.notify()` — this is the natural integration point for adding the improvement notification.

### What needs to change

1. After `_run_post_run_improvement_pass` produces a non-empty artifact, a toast must appear in the TUI.
2. The toast must be actionable — clicking it opens the `ImprovementProposalsScreen`.
3. The existing command-palette entry (`action_show_improvement_proposals`) must remain available as a fallback.
4. No toast should appear for empty artifacts (zero proposals) or when the collector is disabled.

---

#### Acceptance Criteria

- [ ] **AC-001:** When a `task_run` completes and the `ImprovementCollector` emits an artifact with `len(proposals) > 0`, a toast notification appears in the TUI within the `on_run_completed` handler (or equivalent post-run callback). The toast text must indicate improvement proposals are available (e.g., "3 improvement proposal(s) available — click to review").

- [ ] **AC-002:** Clicking (or activating) the toast opens the `ImprovementProposalsScreen` modal for the most-recent artifact. The screen must be fully functional: the user can approve, reject, defer, or start the improvement run.

- [ ] **AC-003:** When the artifact has zero proposals, no toast is shown. The run-completed message still appears as today.

- [ ] **AC-004:** When `config.runtime.improvement_collector_enabled` is `False`, no collector runs and no toast is shown.

- [ ] **AC-005:** When the collector fails (exception or timeout) and produces an empty fallback artifact, no toast is shown.

- [ ] **AC-006:** The existing command-palette entry (`action_show_improvement_proposals`) continues to work as a manual fallback. It shows the most-recent artifact (or "no artifacts yet" if none exist), unchanged from current behaviour.

- [ ] **AC-007:** From the `ImprovementProposalsScreen`, pressing `s` (Start) with at least one approved proposal triggers an `improvement_run` that executes only the approved proposals. The existing gating (REQ-T005: no run without approvals) must remain enforced.

- [ ] **AC-008:** If the user ignores the toast (does not click it), the toast auto-dismisses after the standard `NOTIFICATION_TIMEOUT` (8 seconds). The proposals remain accessible via command palette at any later time.

- [ ] **AC-009:** TUI test coverage must include: (a) a full workflow test where a completed run produces proposals, the toast appears, clicking it opens the screen, and the improvement run starts; (b) an alternative-path test where the toast is dismissed/ignored and the user later accesses proposals via command palette; (c) a random-interaction test ensuring that unexpected keys during the toast lifecycle do not crash or leave undefined widget state (per `docs/textualize_testing_guide.md`).

---

#### Dependencies

- Depends on: `REQ-20260515-POSTRUN-IMPROVE-002` (Improvement Collector), `REQ-20260515-POSTRUN-IMPROVE-T008` (TUI workflow, augmented here)
- Blocks: None

---

#### Resolved Conflicts

| Prior Requirement                                               | Conflict                                                                    | Resolution                                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-20260515-POSTRUN-IMPROVE-012 (non-blocking task completion) | Toast could be seen as "blocking" task completion.                          | Toast is non-modal and auto-dismisses. The run-completed message still fires regardless. No user action is required — the toast is advisory only. |
| REQ-20260515-POSTRUN-IMPROVE-T008 (TUI workflow)                | T008 defines the manual review workflow; this adds a proactive entry point. | No conflict. T008 is augmented, not replaced. The command-palette path remains (REQ-20260610-004).                                                |

---

#### Notes

- **Implementation path:** The `on_run_completed` handler in `MainScreen` already receives the `RunCompleted` message. The natural approach is to extend the message (or add a companion message) to carry the improvement artifact ID when proposals are present. `RotarisTuiApp._execute_run()` already has access to `ralph.last_improvement_artifact_id` at the point where `RunCompleted` is constructed.

- **Toast action:** Textual's `self.notify()` supports a `callback`-style mechanism through its message system. An alternative is a custom notification widget or a `Message` subclass that the `MainScreen` handles. The exact mechanism is an implementation detail — the requirement only specifies the user-visible behaviour.

- **Artifact ID tracking:** `state.improvement_artifact_ids` already tracks which artifacts have been seen. The toast should only fire for artifacts not yet recorded — preventing re-notification on session reload of an already-reviewed artifact. The current code at `app.py:2295-2299` already checks `ralph.last_improvement_artifact_id not in state.improvement_artifact_ids` before appending; this check can be reused.

- **Out of scope:** This requirement does NOT change the collector, improver, or approval model. It only adds a TUI notification entry point. The underlying improvement pipeline is unchanged.
