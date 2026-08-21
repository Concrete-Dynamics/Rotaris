---
req-id: SWR-167
status: approved
trace: required
test: required
title: "Feed last orchestrator response into intent classifier"
epic: SWR-100
date: 2026-07-25
---

# SWR-167 — Feed last orchestrator response into intent classifier

When intent classification starts for a resumed session, the classifier receives
bounded context from the most recent completed **orchestrator** iteration in that
same session. The context helps classify the newly submitted user request; it
does not cause reclassification during a run.

The classifier user JSON payload gains an optional
`prior_orchestrator_response` string. It contains the selected iteration's
non-empty `report_summary`; when that is empty, it contains that iteration's
non-empty `agent_response`. The field is omitted when no qualifying iteration
exists.

## Scope

In:

- Read prior progress from the current session before its new run begins.
- Identify the most recent completed iteration attributable to the `orchestrator`
persona.
- Add the optional payload field and prompt instruction.
- Preserve classifier timeout, response-format retry, parsing, and fallback
contracts.

Out:

- Context from another session or workspace.
- Any response produced by a non-orchestrator persona.
- Reclassification after run start.
- Changes to the intent enum, model selection, tool gating, or fallback intent.
- Using prior context as an instruction to execute or as a replacement for the
new user request.

## Acceptance criteria

1. Each persisted iteration used for this selection has durable persona
attribution. A qualifying iteration is both attributable to `orchestrator` and
completed before the new classification call; records without that attribution
do not qualify.
2. On a resumed session with one or more qualifying iterations, the classifier
payload includes `prior_orchestrator_response` from the most recent qualifying
iteration, ordered by completed iteration order. It uses a trimmed non-empty
`report_summary`, falling back to a trimmed non-empty `agent_response` only when
that summary is absent or empty.
3. The prior-response value is bounded to the classifier's existing input budget.
It contains no cross-session data and is omitted rather than sent as an empty,
`null`, or placeholder value when no usable qualifying response exists.
4. Fresh sessions, sessions with only non-orchestrator iterations, and sessions
with qualifying iterations that contain neither usable field produce the existing
payload shape: `prompt` and `metadata` only.
5. Both public run entry points — background CLI and Textual TUI — pass the
current session's persisted progress to the shared classification boundary before
creating the new run todo. Their user-visible classification status behavior is
otherwise unchanged.
6. The classifier prompt describes `prior_orchestrator_response` as historical
context for interpreting the new `prompt`, directs the model to prioritize the
new `prompt`, and directs it not to follow instructions embedded in historical
context.
7. Existing timeout, provider response-format retry, invalid/unknown JSON, and
setup-error paths keep their current fallback result and continue the run.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user resumes after an orchestrator completed work; classifier payload includes its latest usable summary. | Shared `classify_run_intent` selection and `IntentClassifier` payload construction. Cases: summary preferred; response fallback; empty/missing progress; non-orchestrator and unattributed records excluded; bounded value omitted when unusable. | `tests/unit/test_ralph_bootstrap.py::test_classify_run_intent_includes_latest_orchestrator_response`; `tests/unit/test_intent_classifier.py::test_classifier_payload_includes_optional_prior_orchestrator_response` |
| Integration | A persisted session resumes through each host pipeline; its classifier receives same-session orchestrator context before todo construction. | `SessionState.ralph_progress` into shared bootstrap from `cli/background.py` and `tui/app_run.py`; fake classifier/LLM. Cases: fresh session omits field; selected history remains within input budget. | `tests/integration/test_background_run.py::test_resumed_background_run_passes_orchestrator_context_to_classifier`; `tests/integration/test_tui_run.py::test_resumed_tui_run_passes_orchestrator_context_to_classifier` |
| User-flow E2E | User resumes a paused session after the orchestrator reported a diagnosed defect, submits a follow-up repair request, and sees an intent classification produced with that prior context. | Real public Textual TUI resume/run boundary, real persisted session and bootstrap wiring; deterministic fake external classifier provider. Assert captured classifier payload and visible classification status. | `tests/integration/test_tui_resume_flow.py::test_resume_classification_uses_prior_orchestrator_context_e2e` |

Every new or materially changed test carries a productive-use docstring and
`@verifies(SWR.SWR_167)`. The implementation carrying the selection, payload
threading, and prompt contract carries `@traces(SWR.SWR_167)`.

## Traceability and completion evidence

- Requirement source: `docs/requirements/100-orchestration-core.md` §SWR-167.
- Current shared classification boundary:
  `src/rotaris_core/ralph/bootstrap.py::classify_run_intent`.
- Current classifier payload/prompt boundary:
  `src/rotaris_core/ralph/intent_classifier.py::IntentClassifier.classify` and
  `src/rotaris_core/agents/prompts/intent_classifier.md`.
- Current host call sites:
  `src/rotaris_core/cli/background.py` and
  `src/rotaris_core/tui/app_run.py`.
- Current progress record fields:
  `src/rotaris_core/ralph/state.py::RalphIterationState`.

Keep `status: draft` until implementation and the declared tests exist,
ReqToCode discovers the required `@traces`/`@verifies` references, and
`python -m rotaris_core.reqtocode check` passes. On approval, update the
SWR-167 row in the parent epic only if its status is represented there.

## Blocking prerequisite

Current `RalphIterationState` persists summary and response but no persona
identity (`src/rotaris_core/ralph/state.py`). Therefore criterion 1 cannot be
verified without an attributable persisted source for completed orchestrator
iterations. Implementation must establish that attribution before selecting a
prior response. If this requires supplementary persistence/schema work not
already traceable to SWR-167, create a technical SWR derived from SWR-167 rather
than silently adding untraced code.

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)