"""A resumed run continues its session's intent when the prompt alone cannot say what to do.

A person who types "continue" into a session that ended or crashed is not starting
something new, but the prompt carries no scope, so the classifier calls it
`ambiguous` — which routes the orchestrator to clarify rather than resume. These
flows drive the real background host, with only the classifier model faked, and
assert the run adopts the intent that session already recorded (SWR-176).
"""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.auth import session_auth
from rotaris_core.cli.background import _run_task
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.ralph import bootstrap
from rotaris_core.ralph.intent_classifier import IntentCategory, IntentClassificationResult
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.session.state import SessionState


class _StopHereError(RuntimeError):
    """Ends the run once classification has been recorded, which is all these flows need."""


def _crashed_session(tmp_path: Path, manager: SessionManager, intent: str) -> SessionState:
    """A persisted session whose run was classified *intent* and then stopped mid-task."""
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    state.run_intent = intent
    state.todo_state = {
        "phases": [
            {
                "id": "p1",
                "name": "main",
                "tasks": [
                    {"id": "t1", "name": "diagnose the failure", "status": "COMPLETED"},
                    {"id": "t2", "name": "repair the regression", "status": "IN_PROGRESS"},
                ],
            }
        ]
    }
    state.execution_status = "failed"
    manager.save_session(state)
    return state


def _stop_after_classification(monkeypatch: pytest.MonkeyPatch, intent: IntentCategory) -> None:
    """Fake the classifier model at *intent* and end the run once the verdict is recorded."""

    @contextlib.asynccontextmanager
    async def fake_keep_auth_fresh(config, *, storage=None):  # noqa: ANN001, ANN202, ARG001
        yield session_auth.PrimeReport(authenticated=("fake",))

    async def fake_classify_initial_intent(*_args: Any, **_kwargs: Any) -> Any:
        return IntentClassificationResult(intent=intent, confidence=0.9, reason="from the model")

    def stop(*_args: Any, **_kwargs: Any) -> Any:
        raise _StopHereError

    monkeypatch.setattr(session_auth, "keep_auth_fresh", fake_keep_auth_fresh)
    monkeypatch.setattr(
        "rotaris_core.ralph.intent_classifier.classify_initial_intent",
        fake_classify_initial_intent,
    )
    # The first step after the run has recorded and rendered its classification.
    monkeypatch.setattr(bootstrap, "make_summary_agent_factory", stop)


@verifies(SWR.SWR_176)
async def test_resumed_background_run_inherits_prior_intent_when_classification_is_ambiguous(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a repair run crashed; the user types "continue" to pick it back up.
    Expected outcome: the resumed run carries the repair intent, not a clarifying detour."""
    manager = SessionManager(tmp_path)
    state = _crashed_session(tmp_path, manager, "problem_resolution")
    _stop_after_classification(monkeypatch, IntentCategory.AMBIGUOUS)

    with pytest.raises(_StopHereError):
        await _run_task(
            task="continue",
            config=RotarisConfig(workspace_root=tmp_path),
            session_manager=manager,
            state=state,
            max_iterations=1,
        )

    assert state.run_intent == "problem_resolution"


@verifies(SWR.SWR_176)
async def test_a_real_request_into_a_crashed_session_keeps_its_own_intent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: user resumes a crashed session to ask for something different.
    Expected outcome: the new request's own classification stands; nothing is inherited."""
    manager = SessionManager(tmp_path)
    state = _crashed_session(tmp_path, manager, "problem_resolution")
    _stop_after_classification(monkeypatch, IntentCategory.REFACTOR)

    with pytest.raises(_StopHereError):
        await _run_task(
            task="tidy up the module layout instead",
            config=RotarisConfig(workspace_root=tmp_path),
            session_manager=manager,
            state=state,
            max_iterations=1,
        )

    assert state.run_intent == "refactor"


@verifies(SWR.SWR_176)
async def test_resume_continues_prior_intent_when_prompt_is_ambiguous_e2e(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: user reopens a crashed session, types "continue", and reads what happened.
    Expected outcome: the session persists the inherited intent and says it was continued."""
    manager = SessionManager(tmp_path)
    created = _crashed_session(tmp_path, manager, "large_feature")
    manager.release_lock(created.session_id)

    # The resume a person actually performs: the session comes back off disk.
    resumed = manager.load_session(created.session_id)
    assert resumed.run_intent == "large_feature"
    _stop_after_classification(monkeypatch, IntentCategory.AMBIGUOUS)

    with pytest.raises(_StopHereError):
        await _run_task(
            task="continue",
            config=RotarisConfig(workspace_root=tmp_path),
            session_manager=manager,
            state=resumed,
            max_iterations=1,
        )

    reloaded = manager.load_session(created.session_id)
    assert reloaded.run_intent == "large_feature"

    status = [
        event["content"]
        for event in reloaded.transcript_events
        if event.get("role") == "system" and "Intent classified" in str(event.get("content", ""))
    ]
    assert status == ["Intent classified: large_feature (continued from previous run)"]
