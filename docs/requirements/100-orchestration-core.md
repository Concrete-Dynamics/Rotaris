---
req-id:
  [
    SWR-100,
    SWR-101,
    SWR-102,
    SWR-103,
    SWR-104,
    SWR-105,
    SWR-106,
    SWR-107,
    SWR-108,
    SWR-109,
    SWR-110,
    SWR-111,
    SWR-112,
    SWR-113,
    SWR-114,
    SWR-115,
    SWR-116,
    SWR-117,
    SWR-118,
    SWR-119,
    SWR-120,
    SWR-121,
    SWR-122,
    SWR-123,
    SWR-124,
    SWR-125,
    SWR-126,
    SWR-127,
    SWR-128,
    SWR-129,
    SWR-130,
    SWR-131,
    SWR-132,
    SWR-133,
    SWR-134,
    SWR-135,
    SWR-136,
    SWR-137,
    SWR-138,
    SWR-139,
    SWR-140,
    SWR-141,
    SWR-142,
    SWR-143,
    SWR-144,
    SWR-145,
    SWR-146,
    SWR-147,
    SWR-148,
    SWR-149,
    SWR-150,
    SWR-151,
    SWR-152,
    SWR-153,
    SWR-154,
    SWR-155,
    SWR-156,
    SWR-157,
    SWR-158,
    SWR-159,
    SWR-160,
    SWR-161,
    SWR-162,
    SWR-163,
    SWR-164,
    SWR-165,
    SWR-166,
  ]
status: approved
trace: required
test: required
title: "Orchestration & Delegation Core"
---

# 100-orchestration-core spec

## SWR-100 — Orchestration & Delegation Core

trace: optional
test: optional

Multi-agent orchestration: RalphLoop iteration, scheduler, child delegation (including OMO-style non-blocking background tasks), stuck-state recovery, intent classification, and planner-first run setup.

Derived requirements: [SWR-2128 — Shared run bootstrap factories](100-orchestration-core/SWR-2128-shared-run-bootstrap.md)

## SWR-101 — Entry Persona

legacy-id: FR-1-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

A single **entry persona** receives the user's top-level task. In the default configuration this persona is named `orchestrator`, but it is not a special agent type - it is a normal persona whose system prompt and toolset give it orchestration authority.

## SWR-102 — Delegation Tool Call Contract

legacy-id: FR-1-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Delegation happens via an explicit tool call that includes, at minimum, the **target persona name**, a **child task name**, the **task payload**, and an optional **`depends_on`** list.

## SWR-103 — Child Task Name Deduplication

legacy-id: FR-1-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Child task names are scoped per parent agent. If a parent reuses a child task name, the framework renames it deterministically to `<name>_<n>` using the lowest available positive integer and uses that canonical name in transcripts, dependency resolution, and returned artifacts.

## SWR-104 — Parallel Fan-Out

legacy-id: FR-1-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

The parent decomposes work and fans out independent subtasks in parallel to specialized child agents, subject to the configured or default fan-out limit.

## SWR-105 — Re-Delegation by Any Persona

legacy-id: FR-1-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Any persona that has the `delegate` tool may further delegate work if the assigned task is too large for a single agent.

## SWR-106 — Max Delegation Depth

legacy-id: FR-1-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Delegation depth is capped at **3 levels below the entry persona**.

## SWR-107 — Dependency: Start Gate

legacy-id: FR-1-007
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

A child may start only after all names in `depends_on` have reached `succeeded` and produced their mandatory report artifact. Dependency names are scoped to the same parent agent that declared the child.

## SWR-108 — Dependency: Cycle Detection

legacy-id: FR-1-008
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Dependency cycles are a validation error and the affected child is not started.

## SWR-109 — Dependency: Failure Propagation

legacy-id: FR-1-009
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

If a dependency reaches `failed`, `cancelled`, or `blocked`, the dependent child is marked `blocked` and is not started automatically.

## SWR-110 — Suspension via End-Generation

legacy-id: FR-1-010
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

After spawning the children it wants to start in the current turn, the parent agent **ends generation**. Ending generation is the suspension mechanism; there is no separate suspend API.

## SWR-111 — Parent Resume Trigger

legacy-id: FR-1-011
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

A parent agent is resumed whenever one or more direct children reach a terminal state that the parent has not yet observed. The framework may batch multiple terminal child events into a single resume.

## SWR-112 — Child Terminal States

legacy-id: FR-1-012
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Child terminal states in v1 are `succeeded`, `failed`, `cancelled`, and `blocked`. A child failure is treated as a first-class orchestration result, not as a scheduler crash.

## SWR-113 — Resume Payload

legacy-id: FR-1-013
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

On resume, the parent receives: (a) structured report artifacts for the newly terminal direct children, (b) the current state of all direct children it has spawned, (c) any framework-generated scheduling metadata needed to continue orchestration.

## SWR-114 — Post-Resume Actions

legacy-id: FR-1-014
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

The resumed parent may: continue orchestration, do local work itself, spawn additional children, or end generation again to wait for further child completions.

## SWR-115 — Sub-Agent Isolation

legacy-id: FR-1-015
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Sub-agents operate with isolated prompt, skills, context, MCP configuration, and execution state.

## SWR-116 — Shared Workspace

legacy-id: FR-1-016
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Sub-agents share the same workspace filesystem and codebase, but edit application is serialized by the HAET rules.

## SWR-117 — First-Class Mode

legacy-id: FR-RALPH-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

v1 supports a first-class **Ralph loop** execution mode for long-running autonomous work.

## SWR-118 — Iteration Structure

legacy-id: FR-RALPH-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Each Ralph loop iteration: reads the PRD and current progress/session state → selects the next incomplete anchored task → performs implementation or investigation work for **one task only** → runs verification steps → updates progress/session state → hands the next iteration a compacted state (todo list, artifact set, progress state, report artifacts) rather than the full raw transcript.

## SWR-119 — Iteration Visibility

legacy-id: FR-RALPH-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Ralph loop iterations must be explicit in the session state and transcript so the user can see iteration boundaries.

## SWR-120 — Normative Iteration Steps

legacy-id: FR-RALPH-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

1. Read the PRD and progress file. 2. Find the next incomplete task and implement it. 3. Update the progress file with what you did.

## SWR-121 — Iteration End Contract

legacy-id: FR-RALPH-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Each iteration must end with: a todo/progress update, a terminal outcome for the selected task (`completed`, `abandoned`, or reverted to `pending`), and a report artifact.

## SWR-122 — No Silent Task Roll-Over

legacy-id: FR-RALPH-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

If verification fails and the task is not completed in the current iteration, the agent must not silently roll into a second task. It must end the iteration with the current task still anchored.

## SWR-123 — Stop Conditions

legacy-id: FR-RALPH-007
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

A Ralph loop stops when: all non-abandoned tasks are completed, the active agent declares the goal complete, an unrecoverable failure occurs, the session is cancelled, or a configured iteration or time limit is reached. A user-configured `message_limit` may cause a pause-and-continue dialog instead of a hard stop (see `requirements-20260609-message-limit-confirm.md`).

## SWR-124 — Usable by Any Persona

legacy-id: FR-RALPH-008
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Ralph loop mode may be used by the entry persona or by a delegated child persona for a bounded subproblem.

## SWR-125 — Works in All Session Modes

legacy-id: FR-RALPH-009
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Ralph loop mode must work in both attached TUI sessions and background mode.

## SWR-126 — Mandatory on Terminal

legacy-id: FR-ARTIFACT-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

Every child that reaches a terminal state must produce a mandatory machine-readable report artifact before the parent is resumed.

## SWR-127 — Summary Agent

legacy-id: FR-ARTIFACT-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

The report artifact is generated by a separate **cheap summary agent** with a tightly scoped system prompt, a schema-specific user instruction, and only the tooling required to emit the report artifact. The summary agent does not continue the task; it only summarizes.

## SWR-128 — Dependency Gate

legacy-id: FR-ARTIFACT-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

A dependency counts as `succeeded` only after its report artifact has been written successfully.

## SWR-129 — Parent Consumes Artifact

legacy-id: FR-ARTIFACT-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

The report artifact is the parent/child hand-off contract. The parent consumes this artifact by default rather than replaying the full raw child transcript.

## SWR-130 — Schema

legacy-id: FR-ARTIFACT-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000001-orchestration.md

The report artifact is typed JSON in v1. Required fields: `agent_name` (string), `persona` (string), `status` ("succeeded"\ | "failed"\

## SWR-131 — Recover `stuck` Through Circuit Breaker

legacy-id: REQ-20260414-235403-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

When a child conversation enters OpenHands `STUCK`, the scheduler must route that state through the existing circuit-breaker activation flow instead of failing immediately.

## SWR-132 — Scheduler-Driven `stuck` Activation

legacy-id: REQ-20260414-235403-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

`CircuitBreakerSession` must support a scheduler-driven pending activation for `stuck` using a distinct internal trigger mode and the existing consecutive-activation counter.

## SWR-133 — Corrective Message Injection for `stuck`

legacy-id: REQ-20260414-235403-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

A recoverable `stuck` activation must inject a natural user-style corrective message back into the same child conversation and resume execution.

## SWR-134 — Escalate Repeated `stuck` Retriggers

legacy-id: REQ-20260414-235403-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

Repeated `stuck` recoveries without an intervening real user instruction must escalate on the third activation using the same structured escalation artifact as other circuit-breaker activations.

## SWR-135 — Preserve Immediate Failure for `error`

legacy-id: REQ-20260414-235403-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

Non-recoverable terminal states like `ERROR` must continue to fail immediately without going through `stuck` recovery.

## SWR-136 — Deterministic Fallback for `terminal-stuck`

legacy-id: REQ-20260414-235403-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

If classifier output is invalid or returns no usable recovery for `terminal-stuck`, the circuit breaker must fall back to a deterministic corrective message tailored to a repeated read/edit loop.

## SWR-137 — Regression Coverage

trace: optional
legacy-id: REQ-20260414-235403-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

Add unit tests for successful `stuck` recovery, repeated `stuck` escalation, `error` fail-fast behavior, and `terminal-stuck` fallback behavior.

## SWR-138 — Release Hygiene

status: deprecated
legacy-id: REQ-20260414-235403-008
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-235403.md

Bump the package version after shipping the bug fix.

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)

> Deprecated 2026-07-19: one-time release action, completed; ongoing version policy lives in CLAUDE.md.

## SWR-139 — Task IDs and Non-Blocking Spawn

legacy-id: REQ-20260416-120000-001
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

`task_id` on ChildTaskRecord, `run_in_background` defaults True, observation includes task_id

## SWR-140 — OMO-Style Completion Notifications

legacy-id: REQ-20260416-120000-002
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

`ChildNotification` dataclass, `pending_notifications` queue, `_inject_notification` in scheduler, parent todo reminder appended on child completion

## SWR-141 — `background_output` Result-Retrieval Tool

legacy-id: REQ-20260416-120000-003
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

`tools/background_output.py`, bundled with delegate, `results_by_task_id` lookup

## SWR-142 — `wait_for_tasks` Voluntary-Wait Tool

legacy-id: REQ-20260416-120000-004
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

`tools/wait_for_tasks.py`, pause mechanism, zero-delay path for already-terminal tasks

## SWR-143 — Scheduler & ChildManager Refactor

legacy-id: REQ-20260416-120000-005
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

`_run_background_drain`/`_run_foreground_drain` split; `run_child` and `spawn_children` now also thread the delegator's open-todo reminder state

## SWR-144 — Prompt / Tool-Description Updates

legacy-id: REQ-20260416-120000-006
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

`_DELEGATION_STRATEGY` rewritten, `TOOL_HINTS` for both new tools, delegate description updated

## SWR-145 — Tests

trace: optional
legacy-id: REQ-20260416-120000-007
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-120000.md

Unit tests cover child manager, background_output, wait_for_tasks, delegate fixes, and parent todo reminders on foreground/background child completion; integration e2e tests cover notification flow.

## SWR-146 — Create a new Intent Classification persona/agent whose primary job is to classify the user's initial request into predefined categories.

legacy-id: REQ-20260520-001
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Create a new Intent Classification persona/agent whose primary job is to classify the user's initial request into predefined categories.

## SWR-147 — Execute the Intent Classification agent as a pre-flight step before initializing the orchestrator.

legacy-id: REQ-20260520-002
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Execute the Intent Classification agent as a pre-flight step before initializing the orchestrator.

## SWR-148 — Remove \"Phase 0: Intent Classification\" from the current `orchestrator.md` system prompt.

legacy-id: REQ-20260520-003
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Remove \"Phase 0: Intent Classification\" from the current `orchestrator.md` system prompt.

## SWR-149 — Add a `[[ROTARIS:INTENT_INSTRUCTIONS]]` placeholder to the orchestrator's prompt.

status: deprecated

legacy-id: REQ-20260520-004
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Add a `[[ROTARIS:INTENT_INSTRUCTIONS]]` placeholder to the orchestrator's prompt.

Superseded by SWR-2416: the orchestrator's intent text is now the `[[ROTARIS:PLAYBOOK]]` cell, and `[[ROTARIS:INTENT_INSTRUCTIONS]]` was removed.

## SWR-150 — Introduce a mapping of intents to specific instruction text (prompt snippets).

status: deprecated

legacy-id: REQ-20260520-005
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Introduce a mapping of intents to specific instruction text (prompt snippets).

Superseded by SWR-2416: intent-to-instruction snippets were replaced by the persona x intent x model-tier matrix in `agents/prompts/playbooks/`.

## SWR-151 — Inject the matched intent's instruction text into the `[[ROTARIS:INTENT_INSTRUCTIONS]]` placeholder when initializing the orchestrator.

status: deprecated

legacy-id: REQ-20260520-006
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Inject the matched intent's instruction text into the `[[ROTARIS:INTENT_INSTRUCTIONS]]` placeholder when initializing the orchestrator.

Superseded by SWR-2416: the resolved playbook cell is injected instead, and it reaches every persona rather than only the orchestrator.

## SWR-152 — Configure the intent classifier to use structured outputs (JSON schema or a forced tool call) to guarantee stable, predictable parsing of the intent enum.

legacy-id: REQ-20260520-007
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Configure the intent classifier to use structured outputs (JSON schema or a forced tool call) to guarantee stable, predictable parsing of the intent enum.

## SWR-153 — Define intent mappings securely outside of hardcoded logic (e.g., using a metadata YAML file mapping intents to markdown snippet files in `src/rotaris_core/agents/prompts/intents/`).

status: deprecated

legacy-id: REQ-20260520-008
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: Medium

Define intent mappings securely outside of hardcoded logic (e.g., using a metadata YAML file mapping intents to markdown snippet files in `src/rotaris_core/agents/prompts/intents/`).

Superseded by SWR-2416: `intents.yaml` now carries tool gating only (SWR-156); the markdown snippet files it pointed at were deleted.

## SWR-154 — Implement a resilient fallback: if the classification step times out, fails, or returns an unmapped string, default to a `generic_feature` intent without stopping the run.

legacy-id: REQ-20260520-009
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Implement a resilient fallback: if the classification step times out, fails, or returns an unmapped string, default to a `generic_feature` intent without stopping the run.

## SWR-155 — During classification, supply only the raw user prompt and essential metadata to the classifier, excluding full file contents or deep codebase context, to ensure the step is fast and low-token.

legacy-id: REQ-20260520-010
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

During classification, supply only the raw user prompt and essential metadata to the classifier, excluding full file contents or deep codebase context, to ensure the step is fast and low-token.

## SWR-156 — Extend the intent classification system so that the classified intent also controls which tools the orchestrator agent has access to at runtime, not just which prompt instructions it receives. Simple intents (`explicit_trivial`, `single_file_change`) grant direct file editing tools (`read_file`, `write_file`) and shell access to the orchestrator; complex intents fall back to the coordinator-only bundle.

legacy-id: REQ-20260520-011
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Extend the intent classification system so that the classified intent also controls which tools the orchestrator agent has access to at runtime, not just which prompt instructions it receives. Simple intents (`explicit_trivial`, `single_file_change`) grant direct file editing tools (`read_file`, `write_file`) and shell access to the orchestrator; complex intents fall back to the coordinator-only bundle.

## SWR-157 — TUI Visual Feedback During Classification\*\* - Show a live visual indicator while the intent classifier is running. In the TUI, append a transient \"Classifying intent...\" status message to the chat transcript the moment classification begins (before awaiting the LLM call). Replace it in-place with the final result (\"Intent classified: moderate_feature\") upon completion. On failure, replace the transient status with a neutral fallback message and then append the final fallback classification result.

legacy-id: REQ-20260520-014
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

TUI Visual Feedback During Classification\*\* - Show a live visual indicator while the intent classifier is running. In the TUI, append a transient \"Classifying intent...\" status message to the chat transcript the moment classification begins (before awaiting the LLM call). Replace it in-place with the final result (\"Intent classified: moderate_feature\") upon completion. On failure, replace the transient status with a neutral fallback message and then append the final fallback classification result.

## SWR-158 — Planner-First Routing For Plan-Worthy Intents

status: deprecated

trace: optional
legacy-id: REQ-20260609-PLANNER-FIRST-001
date: 2026-06-09
source: docs/requirement-log/done/requirements-20260609-planner-first-orchestration.md

For `moderate_feature`, `large_feature`, `whole_project`, and `refactor`, the orchestrator must delegate to `planner` before broad research or design work.

Superseded by SWR-2416: planner-first routing is now conditional on the implementation owner's model tier — a `large_model` owner scopes its own work, so `moderate_feature`/`refactor` no longer force a planner step. See the orchestrator matrix in docs/architecture/prompt-composition-matrix.md.

## SWR-159 — Planner-Owned Research Delegation

trace: optional
legacy-id: REQ-20260609-PLANNER-FIRST-002
date: 2026-06-09
source: docs/requirement-log/done/requirements-20260609-planner-first-orchestration.md

The planner prompt must direct the planner to delegate internal codebase research to `codebase-analyst`, external research to `librarian`, architecture work to `architect`, and requirement-log clarification to `requirements-engineer` when needed.

## SWR-160 — Exempt Intents Remain Direct

trace: optional
legacy-id: REQ-20260609-PLANNER-FIRST-003
date: 2026-06-09
source: docs/requirement-log/done/requirements-20260609-planner-first-orchestration.md

`explicit_trivial`, `single_file_change`, `small_feature`, `question`, `exploration`, `ambiguous`, and `problem_resolution` remain exempt from mandatory planner-first routing unless a later requirement changes that policy.

## SWR-161 — Regression Coverage

trace: optional
legacy-id: REQ-20260609-PLANNER-FIRST-004
date: 2026-06-09
source: docs/requirement-log/done/requirements-20260609-planner-first-orchestration.md

Automated tests must lock the planner-first ordering for the affected intent snippets and the prompt contracts that make the planner delegate research instead of front-running it locally.

## SWR-162 — Stable Scheduler seam

test: optional
legacy-id: REQ-20260703-SCHED-001
date: 2026-07-03
source: docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md

Preserve existing public `Scheduler` entry points used by Ralph Loop, TUI, and tests.

## SWR-163 — Single drain implementation

test: optional
legacy-id: REQ-20260703-SCHED-002
date: 2026-07-03
source: docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md

Make `scheduler_drain.py` the owner of foreground/background drain, notification injection, parent resume messages, and parent resume recovery.

## SWR-164 — Report policy locality

test: optional
legacy-id: REQ-20260703-SCHED-003
date: 2026-07-03
source: docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md

Move terminal child report construction, authored-artifact fast path, and artifact-backed report conversion into `child_report_builder.py`.

## SWR-165 — Child run locality

test: optional
legacy-id: REQ-20260703-SCHED-004
date: 2026-07-03
source: docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md

Introduce `child_run.py` with a request-shaped child execution interface that hides callback wiring, watchdog use, steering, retries, fallbacks, todo correction, and report handoff.

## SWR-166 — Architecture documentation

trace: optional
test: optional
legacy-id: REQ-20260703-SCHED-005
date: 2026-07-03
source: docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md

Update architecture docs to reflect the deeper run-path module split.

## SWR-167 — Feed last orchestrator response into intent classifier

status: approved

When the intent classifier fires at run start and the current run has prior
completed orchestrator iterations, the classifier receives the last
orchestrator's summary as additional context via an optional
`prior_orchestrator_response` field.

> See: [SWR-167 — Feed last orchestrator response into intent classifier](100-orchestration-core/SWR-167-classifier-orchestrator-context.md)

## SWR-168–175 — Plan-Mode / Auto-Mode Gate

status: draft

A persistent Plan/Auto mode toggle that gates execution after the planner produces
a plan. In Plan mode the plan is surfaced, execution is blocked, and the user may
directly edit the plan or give change instructions for agent iteration before
accepting. In Auto mode behaviour is unchanged.

> See: [SWR-168–175 — Plan-Mode / Auto-Mode Gate](100-orchestration-core/SWR-168-plan-auto-mode-gate.md)

## SWR-2912 — Every child record reaches a terminal state when its run ends

status: approved

SWR-112 names the child terminal states; this one says when a record must reach
one. Every exit from a loop iteration — including a `blocked` delegation, a plain
re-queue, a cancellation, and a crash — leaves the iteration's own record and any
child it still holds terminal, so no run that has ended leaves a record claiming
to be running for the hosts to read back.

> See: [SWR-2912 — Every child record reaches a terminal state when its run ends](100-orchestration-core/SWR-2912-terminal-child-records-on-run-end.md)

## SWR-3714 — Continuing a session settles the children its previous run left running

status: approved

SWR-2912 can only close a run's records from inside the process that owns it, so
a quit desktop, a killed host or a hard cancel leaves children at `running` for
ever. Continuing the session used to show them again as live agents beside the
ones actually working. A run that has just taken the session lock owns the
session alone and has started nothing yet, so every non-terminal record it reads
back is settled to `cancelled` before the first iteration.

> See: [SWR-3714 — Continuing a session settles the children its previous run left running](100-orchestration-core/SWR-3714-continued-session-settles-orphaned-children.md)

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Multi-Agent Orchestration (2026-04-13)

Original: `docs/requirement-log/done/requirements-20260413-000001-orchestration.md` — document status: Complete

#### Description

The orchestration layer is a single-process, asyncio-based multi-agent pipeline. An entry persona decomposes high-level tasks and fans out subtasks in parallel to specialized child agents. Children operate with isolated context, return typed report artifacts when done, and parent agents are resumed to consume those artifacts and continue orchestration.

#### Implementation Notes

**Requirements - Core Orchestration Model:**

**Migrated From:** `REQUIREMENTS.md` FR-1 (dissolved 2026-05-03) artifact spec remain the normative reference. > **Cross-references:** > - Delegation tool contract (prompt schema, categories, background flag, session continuity, > mandatory params): `requirements-20260413-201248.md` REQ-009 through REQ-013 - those take > priority over anything below. > - Delegation runtime (non-blocking OMO-style model): > `requirements-20260416-120000.md` - supersedes any blocking-delegation semantics implied here.

**FR-1: Multi-Agent Orchestration:**

**Ralph Loop Mode:**

Implementation note (2026-05-07): when a child summary says `succeeded` but the child still has pending or in-progress todo items after todo-correction retries are exhausted, Ralph re-queues the same top-level task with a continuation payload for the next iteration instead of abandoning the task or failing the run.

**Child Report Artifact (mandatory):**

#### Acceptance Criteria

All requirement rows are implemented.

### Graceful Recovery for OpenHands `stuck` State (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-235403.md` — document status: Complete

#### Description

OpenHands child conversations that entered `execution_status == "stuck"` were previously treated as an immediate terminal failure. This change routes `stuck` through the existing circuit-breaker recovery flow so the scheduler can inject one corrective in-context message, resume the same conversation, and escalate only after repeated re-triggers. The result is a single, consistent recovery mechanism for loop-like failures instead of separate ad-hoc handling paths.

#### Implementation Notes

**Requirements Document:**

**Implementation Notes:**

- Added `CircuitBreakerSession.schedule_terminal_stuck_activation()` and a new internal `trigger_mode` value, `terminal-stuck`.

- Updated `CircuitBreaker.classify()` fallback/parse behavior so `terminal-stuck` always yields a recovery prompt if the classifier response is unusable or incorrectly declines recovery.

- Updated `Scheduler.run_child()` to convert `STUCK` into a breaker activation, inject corrective messages into the existing conversation, and reserve direct terminal failure for unrecovered `stuck` sessions and `error`.

- Adjusted failed reporting so exhausted `stuck` recovery is described as recovery exhaustion rather than a raw terminal-state crash.

- Added regressions in `tests/unit/test_circuit_breaker.py` and `tests/unit/test_scheduler.py`.

- Bumped `pyproject.toml` from `0.10.6` to `0.10.7`.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### OMO-Style Non-Blocking Delegation (2026-04-16)

Original: `docs/requirement-log/done/requirements-20260416-120000.md` — document status: Complete

#### Description

Overhaul the delegation mechanics to follow an **OMO-style** (oh-my-openagent) non-blocking background-task model. Currently, `run_in_background=False` (the default) pauses the parent conversation until all children complete, and `run_in_background=True` only skips the immediate pause but still forces a full drain before the parent gets any result. There is no way for the parent LLM to:

- fire off tasks and keep working inside the same turn;

- retrieve a specific task's result on demand by ID; or

- receive a "task completed" notification mid-conversation without being blocked.

The new model:

1. Every delegation returns immediately with a short **task ID** (`bg_XXXXXXXX`).

2. Tasks run concurrently in the background; the parent LLM never pauses unless it

explicitly asks to wait.

3. When a background task finishes the engine **injects a system-reminder** into the

parent's ongoing conversation (OMO-style notification) and continues without blocking.

4. The parent LLM retrieves a result on demand via a new `background_output` tool.

5. A new `wait_for_tasks` tool lets the parent voluntarily block until specific (or

all) background tasks finish.

#### Implementation Notes

**Requirement Log - 2026-04-16 12:00:00 UTC:**

**Evolution — Per-Model Concurrency Queue (2026-06-10):** Building on the OMO
background-task model, the delegate tool no longer rejects spawns when a model's
`max_parallel` cap is reached. Instead, children are enqueued into a new
`WAITING_ON_MODEL_SLOT` state and automatically released when a sibling on the
same model terminates. `ChildTaskRecord` gained a `model_key` field, and
`ChildManager` now maintains a per-model FIFO slot queue. See ADR-016 in
docs/architecture/16-decision-record.md for rationale.

**Detailed Specifications:**

**REQ-20260416-120000-001 - Task IDs and Non-Blocking Spawn:**

**Rationale:** The LLM needs a stable handle for each delegated task so it can later retrieve results or reference the task in a wait call. Changes:

- `ChildTaskRecord` gains a `task_id: str` field - short, unique, human-readable

identifier assigned at spawn time. Format: `bg_` + 8 lower-case hex chars derived from a fast hash of `(canonical_name + monotonic timestamp)`. Example: `bg_f8bd7970`.

- `ChildManager.spawn_child(...)` returns the `ChildTaskRecord` (already does) - the

executor reads `record.task_id` and includes it in the observation.

- `RotarisDelegateObservation` gains a `task_id: str | None` field (populated whenever

status is `"queued"`).

- `run_in_background` defaults to **`True`** for new calls. When `True`, the executor

**never** calls `pause_parent_conversation` - the parent LLM resumes immediately after the tool call and can delegate more tasks or do other work.

- When `run_in_background=False` the old blocking behaviour is preserved (pause + drain)

for backwards compatibility and simple sequential use-cases. Acceptance criteria:

- Calling delegate with `run_in_background=True` returns an observation with a non-None

`task_id` within one event-loop iteration (no blocking).

- The task ID matches `^bg_[0-9a-f]{8}$`.

- Multiple background tasks can be spawned in the same parent conversation turn.

**REQ-20260416-120000-002 - OMO-Style Completion Notifications:**

**Rationale:** Without notifications the parent LLM has no way to know when a background task finishes unless it explicitly polls or waits. Changes:

- `ChildManager` exposes a `pending_notifications: queue.SimpleQueue[ChildNotification]`

(thread-safe; written from `asyncio.to_thread` worker threads, drained from the async event loop). `mark_child_terminal` enqueues a `ChildNotification(task_id, canonical_name, description, duration_s, state, still_running_count)` for every terminal transition of a background-flagged child.

- `Scheduler` has a new coroutine `_inject_notifications(manager, conversation)` that

drains `pending_notifications` and for each entry calls `conversation.send_message(notification_text)` (via `asyncio.to_thread`) without calling `conversation.run()`. This is a **fire-and-forget message injection**, not a full turn.

- `_drain_delegated_children` is split into two modes:

- **Background mode** (all queued children are background): spawn all, then run a

watcher loop that injects notifications as tasks complete. The parent conversation is NOT paused between tasks. The loop ends when `active_count == 0`.

- **Foreground mode** (at least one foreground child): existing behaviour (pause +

drain) unchanged.

- Notification text format (markdown, injected as a `system` role message):

```
[BACKGROUND TASK COMPLETED]
**ID:** `{task_id}`
**Description:** {canonical_name} — {short_description}
**Duration:** {duration}
**{N} task(s) still in progress.** You WILL be notified when ALL complete.
Do NOT poll — continue productive work.
Use `background_output(task_id="{task_id}")` to retrieve this result when ready.
```

When `still_running_count == 0` the last line is replaced with:

```
All background tasks have completed.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - Intent Classification Pre-flight (2026-05-20)

Original: `docs/requirement-log/done/requirements-20260520-000001-intent-classification.md` — document status: Complete

#### Description

To make the orchestrator more efficient and its system prompt sleeker, the current "Phase 0: Intent Classification" logic will be removed from the orchestrator completely. Instead, a dedicated Intent Classification agent will run as a pre-flight step before the orchestrator starts. This new agent will classify the user's intent (e.g., single file change, small feature). Based on the classified intent, a tailored set of instructions will be injected into a new placeholder in the orchestrator's prompt, ensuring the orchestrator only receives instructions relevant to the current task.

**Problem being solved:**

Currently, the orchestrator persona is burdened with determining what kind of task the user is requesting (Phase 0), which bloats its system prompt and consumes tokens on every run. By extracting this into a dedicated, presumably faster/cheaper pre-flight classification agent, we can streamline the orchestrator's prompt. A focused orchestrator prompt will yield better task execution and lower token overhead.

**Current behaviour:**

The `orchestrator.md` prompt contains explicit instructions for "Phase 0: Intent Classification. Categorize the request and determine the initial approach." The orchestrator handles this internally during its first turns.

**What needs to change:**

1. Remove Phase 0 intent classification logic from the `orchestrator.md` prompt.

2. Introduce a new intent classification pre-flight step (agent/persona) that runs on the user's initial prompt before the main orchestration loop begins.

3. Add a new template placeholder (e.g., `[[ROTARIS:INTENT_INSTRUCTIONS]]`) in the orchestrator's system prompt.

4. Define standard intent categories (e.g., exploration, single file change, small feature, explicit/trivial, large feature, refactor, multiple large features / whole project) and map them to specific instruction snippets.

5. At runtime, replace the new placeholder with the exact prompt snippet corresponding to the classified intent.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: None directly, modifies core orchestrator initialization (Ralph loop startup, likely tracking in `cli/app.py` or before `RalphLoop`).

- Blocks: None

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution N/A | N/A | N/A

**Notes:**

- **Innovation/Stability - Structured Output**: The single biggest risk with LLM classifiers is hallucinated or conversational responses (e.g., "I think the intent is small_feature"). The developer must enforce structured generation (either via OpenAI strictly-typed JSON schema, Anthropic tool-use, or similar SDK mechanisms) for the `intent_classifier`.

- **Innovation/Stability - Decoupled Prompts**: Keep the intent-specific instructions in separate files (e.g. `prompts/intents/single_file_change.md`) rather than concatenating strings in Python. This keeps the prompt generation maintainable.

- **Innovation/Latency - Token Fast-Path**: Send _only_ the user's initial prompt string to the classification model. Do not run any codebase mapping, workspace search, or large context loading until the _main_ orchestrator loop starts. We want this classification to return in under 2 seconds ideally.

- **Innovation/Cost - Fast Model**: Ensure the agent initialization explicitly opts for a high-speed, lower-cost model tier (`small_model`) for this persona by default.

- **Assumptions**: The orchestrator's execution logic will receive the classified intent and the engine will handle prompt composition before the OpenHands SDK agent is spawned.

- **Implementation Note (2026-05-26):** Implemented `src/rotaris_core/ralph/intent_classifier.py`, the default `intent-classifier` persona, secure YAML-to-markdown intent snippet loading, and startup integration in both background and TUI paths. The fallback intent is `moderate_feature`, resolving the document's `generic_feature` wording in favor of the acceptance criteria and explicit user decision.

- **Implementation Note (v0.47.1):** `src/rotaris_core/tui/app.py` now appends a transient `Classifying intent...` system event before awaiting `classify_initial_intent(...)`, forces a full chat rebuild when that event is updated in place, and replaces the message with the final classification result once the pre-flight returns. `tests/unit/test_tui_app.py::test_start_run_shows_intent_classification_status_before_run_starts` covers both the interim visible state and the in-place replacement behavior.

- **Refactor Note (v0.59.12):** The same TUI intent-classification status flow now lives in `src/rotaris_core/tui/app_run.py`, while `src/rotaris_core/tui/app.py` keeps `RotarisTuiApp._start_run()` as a thin façade/delegator. The behavior and test coverage are unchanged.

- **Follow-up Note (v0.39.0):** `moderate_feature.md` Step 5 now unconditionally delegates to the planner persona (the conditional "if the execution path spans multiple components" clause was removed). The planner will always synthesize a structured execution plan before any implementation begins. A regression test `test_moderate_feature_requires_planner_unconditionally` was added to `tests/unit/test_prompt_render.py` to enforce this.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A new `intent_classifier` persona or mechanism is defined and executable.

- [x] Running a user task first traces an intent classification step before the orchestrator starts its Ralph loop or execution.

- [x] The `orchestrator.md` system prompt no longer contains the Phase 0 classification instructions.

- [x] The orchestrator's prompt template substitution cleanly replaces `[[ROTARIS:INTENT_INSTRUCTIONS]]` with the matching intent's detailed text.

- [x] A configuration mapping exists mapping at least two distinct intents (e.g., `single_file_change`, `small_feature`, `moderate_feature`) to prompt snippets.

- [x] The intent classification mechanism leverages forced structured outputs or tool-calling to prevent unstructured natural language from breaking the parser.

**Superseded (2026-07-25, SWR-2416):** the intent→snippet mechanism described above no longer
exists. `[[ROTARIS:INTENT_INSTRUCTIONS]]` and `prompts/intents/*.md` were replaced by the
persona × intent × model-tier playbook matrix (`agents/prompts/playbooks/`, injected at
`[[ROTARIS:PLAYBOOK]]`), which reaches every persona rather than the orchestrator alone. The
pre-flight classifier itself, its structured-output contract, and the `intents.yaml` tool
gating (SWR-156) are unchanged. See
[docs/architecture/prompt-composition-matrix.md](../architecture/prompt-composition-matrix.md).
The v0.39.0 follow-up note above (unconditional planner delegation for `moderate_feature`) is
also superseded: planner-first is now conditional on the implementation owner's model tier,
and the named regression test was rewritten against the matrix.

- [x] Provide test coverage proving that an API timeout or invalid classification result gracefully falls back to the `moderate_feature` intent.

- [x] The classifier execution proves to be token-efficient by not loading the entire workspace index.

- [x] The TUI displays a "Classifying intent..." message in the chat transcript immediately after classification begins so the user does not experience silent waiting after pressing Enter.

- [x] The intermediate status message is replaced in-place with the final classification result once the classifier returns.

- [x] On classification failure, the transient status is replaced with a neutral fallback indicator, followed by the fallback classification message in the transcript.

### Planner-First Orchestration For Plan-Worthy Intents (2026-06-09)

Original: `docs/requirement-log/done/requirements-20260609-planner-first-orchestration.md` — document status: Complete

#### Description

For plan-worthy execution work, the orchestrator should delegate to the
`planner` persona first. The planner then decides whether to delegate
`codebase-analyst`, `librarian`, `architect`, or `requirements-engineer`
instead of the orchestrator launching research specialists directly.

This change narrows the orchestrator's job back toward coordination policy and
lets the planner own prerequisite discovery for multi-step implementation work.

#### Implementation Notes

- This is a prompt-policy change, not a scheduler or child-manager runtime
  change. Existing delegation depth, dependency context forwarding, and artifact
  injection already support planner-owned research waves.
- This requirement amends the earlier research-first ordering embedded in the
  current intent snippets and the generic orchestrator fallback policy.
- Architectural intent routing remains architect-led. The planner-first rule is
  intentionally limited to the plan-worthy implementation intents above.

#### Acceptance Criteria

- [x] The intent snippets for `moderate_feature`, `large_feature`,
      `whole_project`, and `refactor` direct the orchestrator to call `planner`
      before broad research or implementation.
- [x] The orchestrator fallback prompt instructs it to route plan-worthy work
      through `planner` first.
- [x] The planner prompt explicitly prefers delegated research over doing broad
      exploration itself.
- [x] Unit tests cover both the planner-first intent ordering and the updated
      orchestrator/planner prompt contracts.

### Scheduler Run Path Deepening (2026-07-03)

Original: `docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md` — document status: Complete

#### Description

Refactor the central Ralph Loop -> Scheduler -> ChildManager path without changing
runtime behavior. The public `Scheduler` seam stays stable, while the child run
loop, delegation drain/resume behavior, and terminal report policy move into
deeper modules with stronger locality.

#### Implementation Notes

- `Scheduler.run_child(...)` now delegates through `ChildRunRequest` and
  `run_child_request(...)`; callers continue to use the same `Scheduler` method.
- `ChildManager` was intentionally left unchanged because it already owns a deep
  Delegation DAG interface.
- No `pyproject.toml` version bump is required because this is a behavior-preserving
  refactor rather than a bug fix or feature addition.

#### Acceptance Criteria

- Existing scheduler, child manager, delegate, wait-for-tasks, Ralph Loop, and
  steering tests continue to pass.
- Architecture docs identify `Scheduler` as the public seam and name
  `child_run.py`, `scheduler_drain.py`, and `child_report_builder.py` as the
  deeper implementation modules.
```
