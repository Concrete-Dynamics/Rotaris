---
req-id: [SWR-100, SWR-101, SWR-102, SWR-103, SWR-104, SWR-105, SWR-106, SWR-107, SWR-108, SWR-109, SWR-110, SWR-111, SWR-112, SWR-113, SWR-114, SWR-115, SWR-116, SWR-117, SWR-118, SWR-119, SWR-120, SWR-121, SWR-122, SWR-123, SWR-124, SWR-125, SWR-126, SWR-127, SWR-128, SWR-129, SWR-130, SWR-131, SWR-132, SWR-133, SWR-134, SWR-135, SWR-136, SWR-139, SWR-140, SWR-141, SWR-142, SWR-143, SWR-144, SWR-146, SWR-147, SWR-148, SWR-152, SWR-154, SWR-155, SWR-156, SWR-157, SWR-159, SWR-160, SWR-162, SWR-163, SWR-164, SWR-165, SWR-166]
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

## SWR-152 — Configure the intent classifier to use structured outputs (JSON schema or a forced tool call) to guarantee stable, predictable parsing of the intent enum.

legacy-id: REQ-20260520-007
date: 2026-05-20
source: docs/requirement-log/done/requirements-20260520-000001-intent-classification.md
priority: High

Configure the intent classifier to use structured outputs (JSON schema or a forced tool call) to guarantee stable, predictable parsing of the intent enum.

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

status: approved

A persistent Plan/Auto mode toggle that gates execution after the planner produces
a plan. In Plan mode the plan is surfaced, execution is blocked, and the user may
directly edit the plan or give change instructions for agent iteration before
accepting. In Auto mode behaviour is unchanged.

> See: [SWR-168–175 — Plan-Mode / Auto-Mode Gate](100-orchestration-core/SWR-168-plan-auto-mode-gate.md)

## SWR-176 — A resumed run inherits its session's intent instead of asking what you meant

status: approved

A short continuation prompt such as `continue` classifies as `ambiguous`, which
routes the orchestrator to clarify rather than resume. When a resumed run cannot
be classified and its session still holds unfinished work, it inherits the intent
that session already recorded. Deterministic: no extra model call, no
cross-session data.

> See: [SWR-176 — A resumed run inherits its session's intent instead of asking what you meant](100-orchestration-core/SWR-176-resume-intent-carry-over.md)

## SWR-177 — Atomic parent-scoped child launch

status: draft

Each direct delegated child is claimed and launched exactly once. Claims are
scoped to the declaring parent and reserve runtime and model capacity before
agent construction, so overlapping parent and nested drain paths remain safe.

> See: [SWR-177 — Atomic parent-scoped child launch](100-orchestration-core/SWR-177-atomic-parent-scoped-child-launch.md)

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

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
