---
req-id: SWR-176
status: approved
trace: required
test: required
title: "A resumed run inherits its session's intent instead of asking what you meant"
epic: SWR-100
date: 2026-08-22
---

# SWR-176 — A resumed run inherits its session's intent instead of asking what you meant

A short continuation prompt carries no scope of its own. Typing `continue` into a
session that ended or crashed classifies as `ambiguous` — correctly, because the
prompt alone says nothing — and `ambiguous` routes the orchestrator to the
`G-clarify` playbook group, which shapes requirements and delegates research
instead of resuming the work that stopped. The user asked to continue and got a
clarifying detour.

The session already knows the answer. `SessionState.run_intent` holds the intent
the previous run was classified as, and `SessionState.todo_state` holds the work
that never finished. When a resumed run cannot be classified on its own, it
inherits that recorded intent rather than falling into `G-clarify`.

Carry-over is deterministic: no model call, no ranking, no cross-session data. It
only ever re-uses a decision already made for this same session, so it cannot
route a run somewhere the session has not already been.

## Scope

In:

- Detect an unusable classification for a resumed run: the classifier returned
`ambiguous`, or it returned a fallback result.
- Detect that the session has unfinished work in its own recorded todo state.
- Inherit the session's previously recorded `run_intent` when both hold.
- Report the inheritance to the user in the classification status line, distinctly
from a classifier fallback.
- Apply it at the shared classification boundary so both public run entry points
— background CLI and Textual TUI — get it from one place.

Out:

- Any additional model call, classifier, or ranking step.
- Data from another session or workspace.
- Changing what the classifier itself returns, its enum, timeout, response-format
retry ladder, parsing, or its own fallback contract.
- Changing playbook cells, the `G-clarify` group, or per-intent tool gating.
- Deciding *which* session a prompt belongs to; the session is already chosen by
the resume that is under way.
- Inheriting into a fresh session, which has no recorded intent to inherit.

## Acceptance criteria

1. A resumed run whose classification is `ambiguous`, or whose result is marked
`fallback`, adopts the session's recorded `run_intent` when that session also has
unfinished work. The adopted intent drives playbook resolution and tool gating
exactly as a classified intent does.
2. Unfinished work means the session's recorded todo state holds at least one task
that is not `COMPLETED` — `PENDING`, `IN_PROGRESS`, and `ABANDONED` all qualify,
because a crashed run leaves work in any of them. A session whose tasks are all
`COMPLETED` has nothing to continue and does not inherit.
3. Carry-over never applies when the recorded intent is absent, unparseable, or
itself `ambiguous`; the classifier's own result stands in each case.
4. Carry-over never overrides a usable classification. A resumed run that
classifies to any intent other than `ambiguous`, without being marked `fallback`,
keeps that classification even when the session has unfinished work.
5. A carried-over result is distinguishable from both a genuine classification and
a classifier fallback. It is not reported as a fallback, and the user-visible
classification status says the intent was continued from the previous run.
6. Both public run entry points — background CLI and Textual TUI — obtain the
carry-over from the shared classification boundary, read the session's prior
intent before overwriting it, and persist the adopted intent as the run's own.
7. A fresh session, a session with no recorded todo state, and a classifier error
path all keep their current behaviour and existing fallback result.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user types `continue` into a session whose work was abandoned; the run adopts that session's earlier intent instead of a clarifying detour. | `bootstrap.carry_over_run_intent` and `bootstrap.classify_run_intent`. Cases: ambiguous inherits; fallback inherits; all-completed todo does not; missing/unparseable/ambiguous prior intent does not; usable classification is never overridden; carried result is not marked `fallback`. | `tests/unit/test_ralph_bootstrap.py::test_carry_over_run_intent_inherits_prior_intent_for_unfinished_session`; `tests/unit/test_ralph_bootstrap.py::test_carry_over_run_intent_leaves_usable_and_unusable_sessions_alone`; `tests/unit/test_intent_classifier.py::test_classification_status_text_reports_carried_over_intent` |
| Integration | A crashed session resumes through the real background host; the host adopts the recorded intent, and a genuinely new request into that same session keeps its own. | `SessionState.run_intent` and `SessionState.todo_state` threaded from `cli/background.py::_run_task` into the shared bootstrap; real `SessionManager`, classifier model faked. | `tests/integration/test_resume_intent_carry_over.py::test_resumed_background_run_inherits_prior_intent_when_classification_is_ambiguous`; `tests/integration/test_resume_intent_carry_over.py::test_a_real_request_into_a_crashed_session_keeps_its_own_intent` |
| User-flow E2E | User reopens a crashed session, types `continue`, and reads a status line saying the run was continued rather than a clarifying question. | Real persisted session reloaded from disk through `SessionManager.load_session` into the real background run host; only the classifier model is faked. Assert the persisted run intent and the visible classification status. | `tests/integration/test_resume_intent_carry_over.py::test_resume_continues_prior_intent_when_prompt_is_ambiguous_e2e` |

Every new or materially changed test carries a productive-use docstring and
`@verifies(SWR.SWR_176)`. The implementation carrying the carry-over decision,
the status text, and the host threading carries `@traces(SWR.SWR_176)`.

## Traceability and completion evidence

- Requirement source: `docs/requirements/100-orchestration-core.md` §SWR-100.
- Shared classification boundary:
  `src/rotaris_core/ralph/bootstrap.py::classify_run_intent`.
- Carry-over decision: `src/rotaris_core/ralph/bootstrap.py::carry_over_run_intent`.
- Classification result and status text:
  `src/rotaris_core/ralph/intent_classifier.py::IntentClassificationResult` and
  `::classification_status_text`.
- Host call sites: `src/rotaris_core/cli/background.py` and
  `src/rotaris_core/tui/app_run.py`.
- Recorded intent and todo state: `src/rotaris_core/session/state.py::SessionState`.
- Playbook group this avoids: `G-clarify` in
  `src/rotaris_core/agents/prompts/playbooks/matrix.yaml`.

## Relationship to SWR-167

[SWR-167](SWR-167-classifier-orchestrator-context.md) gives the classifier bounded
same-session context so it can classify a follow-up better. This requirement
handles the case that context cannot reach: a crashed session, whose in-flight
iteration is `PENDING` and whose failed one is `ABANDONED`, has no *completed
orchestrator* iteration for SWR-167 to select, so the field is omitted exactly
when a continuation prompt is most likely. The two are complementary — SWR-167
improves the classification, SWR-176 covers what remains unclassifiable.

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
