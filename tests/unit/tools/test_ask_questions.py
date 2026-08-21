"""Unit tests for the ask_questions tool."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from rotaris_core.tools.ask_questions import AskQuestionsObservation


# ── Action validation ─────────────────────────────────────────────────


@verifies(SWR.SWR_563)
def test_action_validation_min_steps() -> None:
    """Empty steps list is rejected."""
    from rotaris_core.tools.ask_questions import AskQuestionsAction

    with pytest.raises(ValueError):
        AskQuestionsAction(steps=[])
    with pytest.raises(ValueError):
        AskQuestionsAction(steps=[])


@verifies(SWR.SWR_563)
def test_action_validation_max_steps() -> None:
    """More than 10 steps is rejected."""
    from rotaris_core.tools.ask_questions import AskQuestionsAction, AskQuestionsStep

    with pytest.raises(ValueError):
        AskQuestionsAction(
            steps=[AskQuestionsStep(id=f"s{i}", title=f"Step {i}") for i in range(11)],
        )


@verifies(SWR.SWR_563)
def test_action_validation_duplicate_ids() -> None:
    """Duplicate step ids are rejected."""
    from rotaris_core.tools.ask_questions import AskQuestionsAction, AskQuestionsStep

    with pytest.raises(ValueError, match="Duplicate step id"):
        AskQuestionsAction(
            steps=[
                AskQuestionsStep(id="dup", title="First"),
                AskQuestionsStep(id="dup", title="Second"),
            ],
        )


@verifies(SWR.SWR_563)
def test_action_validation_empty_title() -> None:
    """Steps must have non-empty titles."""
    from rotaris_core.tools.ask_questions import AskQuestionsAction, AskQuestionsStep

    with pytest.raises(ValueError):
        AskQuestionsAction(steps=[AskQuestionsStep(id="s1", title="   ")])


@verifies(SWR.SWR_563)
def test_action_validation_empty_option_label() -> None:
    """Options must have non-empty labels."""
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsOption,
        AskQuestionsStep,
    )

    with pytest.raises(ValueError):
        AskQuestionsAction(
            steps=[
                AskQuestionsStep(
                    id="s1",
                    title="Test",
                    options=[AskQuestionsOption(label="   ")],
                ),
            ],
        )


@verifies(SWR.SWR_563)
def test_action_validation_max_options() -> None:
    """More than 8 options per step is rejected."""
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsOption,
        AskQuestionsStep,
    )

    with pytest.raises(ValueError):
        AskQuestionsAction(
            steps=[
                AskQuestionsStep(
                    id="s1",
                    title="Test",
                    options=[AskQuestionsOption(label=f"Opt {i}") for i in range(9)],
                ),
            ],
        )


@verifies(SWR.SWR_563)
def test_action_rejects_step_with_no_answer_mechanism() -> None:
    """Productive use: an agent can ask only questions the user can answer.
    Expected outcome: a step without options or freeform input is rejected.
    """
    from rotaris_core.tools.ask_questions import AskQuestionsAction, AskQuestionsStep

    with pytest.raises(ValueError, match="must provide options"):
        AskQuestionsAction(
            steps=[AskQuestionsStep(id="blocked", title="Impossible", allow_freeform=False)]
        )


@verifies(SWR.SWR_563)
def test_action_valid_minimal() -> None:
    """A single step with no options is valid."""
    from rotaris_core.tools.ask_questions import AskQuestionsAction, AskQuestionsStep

    action = AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="What?")])
    assert len(action.steps) == 1
    assert action.steps[0].id == "q1"


@verifies(SWR.SWR_563)
def test_action_valid_full() -> None:
    """Full action with options and description is valid."""
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsOption,
        AskQuestionsStep,
    )

    action = AskQuestionsAction(
        steps=[
            AskQuestionsStep(
                id="scope",
                title="What scope?",
                description="Pick the work scope.",
                options=[
                    AskQuestionsOption(label="Small", description="Quick fix"),
                    AskQuestionsOption(label="Large", description="Full feature"),
                ],
                allow_freeform=True,
            ),
            AskQuestionsStep(
                id="confirm",
                title="Confirm?",
                options=[AskQuestionsOption(label="Yes"), AskQuestionsOption(label="No")],
                allow_freeform=False,
            ),
        ],
    )
    assert len(action.steps) == 2


# ── Observation rendering ─────────────────────────────────────────────


@verifies(SWR.SWR_563)
def test_observation_renders_answers() -> None:
    """Observation with answers renders structured Q&A for the LLM."""
    from rotaris_core.tools.ask_questions import AskQuestionsObservation

    obs: AskQuestionsObservation = AskQuestionsObservation.from_text(
        "Got answers.",
        answers={
            "scope": {"selected_option": "Small", "freeform_text": None},
            "confirm": {"selected_option": None, "freeform_text": "Let me think..."},
        },
    )
    content = list(obs.to_llm_content)
    assert len(content) == 1
    text = content[0].text
    assert isinstance(text, str)
    assert "**scope**" in text
    assert "Small" in text
    assert "**confirm**" in text
    assert "Let me think..." in text


@verifies(SWR.SWR_563)
def test_observation_renders_cancelled() -> None:
    """Cancelled observation renders cancellation message."""
    from rotaris_core.tools.ask_questions import AskQuestionsObservation

    obs: AskQuestionsObservation = AskQuestionsObservation.from_text(
        "Cancelled.",
        cancelled=True,
    )
    content = list(obs.to_llm_content)
    assert len(content) == 1
    assert "cancelled" in content[0].text.lower()


@verifies(SWR.SWR_563)
def test_observation_renders_timed_out() -> None:
    """Timed-out observation renders timeout message."""
    from rotaris_core.tools.ask_questions import AskQuestionsObservation

    obs: AskQuestionsObservation = AskQuestionsObservation.from_text(
        "Timed out.",
        timed_out=True,
    )
    content = list(obs.to_llm_content)
    assert len(content) == 1
    assert "not respond" in content[0].text.lower()


@verifies(SWR.SWR_563)
def test_observation_renders_empty_answers() -> None:
    """Empty answers observation renders no-answers message."""
    from rotaris_core.tools.ask_questions import AskQuestionsObservation

    obs: AskQuestionsObservation = AskQuestionsObservation.from_text("No answers")
    content = list(obs.to_llm_content)
    assert len(content) == 1
    assert "no answers" in content[0].text.lower()


# ── Executor ──────────────────────────────────────────────────────────


@verifies(SWR.SWR_563)
def test_executor_reentrant_guard() -> None:
    """Executor refuses a second prompt while one is already pending."""
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    class _FakeBarrier:
        def create_prompt(self, _conversation):
            raise RuntimeError("already waiting")

    executor = AskQuestionsExecutor(
        _FakeBarrier(),  # type: ignore[arg-type]
        response_timeout=1.0,
    )
    obs = executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=object(),
    )
    assert obs.cancelled
    assert "already waiting" in obs.text.lower()


@verifies(SWR.SWR_563)
def test_executor_no_conversation() -> None:
    """Executor with no conversation returns cancelled."""
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    executor = AskQuestionsExecutor(
        None,  # type: ignore[arg-type]
        response_timeout=1.0,
    )
    obs = executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=None,
    )
    assert obs.cancelled


@verifies(SWR.SWR_563)
def test_executor_calls_on_questions_stored() -> None:
    """Productive use: Rotaris can identify the exact prompt before the executor waits.
    Expected outcome: callback receives conversation, generated prompt ID, and steps.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptResponse,
        PromptWaitStatus,
    )
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    stored: list[object] = []

    class _FakeBarrier:
        def create_prompt(self, conversation):
            return "pid-1"

        def wait_for_response(self, conversation, prompt_id, **kwargs):
            stored.append("create")
            return PromptResponse(
                PromptWaitStatus.RESOLVED,
                {"q1": {"selected_option": "yes", "freeform_text": None}},
            )

    executor = AskQuestionsExecutor(
        _FakeBarrier(),  # type: ignore[arg-type]
        on_questions_stored=lambda conversation, prompt_id, steps: stored.append(
            (conversation, prompt_id, steps)
        ),
        response_timeout=1.0,
    )
    executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=object(),
    )
    assert len(stored) == 2
    assert isinstance(stored[0], tuple)
    assert stored[0][1] == "pid-1"
    assert stored[1] == "create"


@verifies(SWR.SWR_563)
def test_executor_callback_failure_cleans_pending_prompt() -> None:
    """Productive use: an agent can recover when the UI cannot expose its questions.
    Expected outcome: executor cancels cleanly and leaves no stale pending prompt.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import UserPromptBarrier
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    barrier = UserPromptBarrier()
    conversation = SimpleNamespace(id="conversation-callback-failure")

    def _fail_callback(_conversation, _prompt_id, _steps) -> None:
        raise RuntimeError("UI unavailable")

    executor = AskQuestionsExecutor(
        barrier,
        on_questions_stored=_fail_callback,
        response_timeout=1.0,
    )
    observation = executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=conversation,
    )

    assert observation.cancelled
    assert barrier.create_prompt(conversation)


@verifies(SWR.SWR_563)
def test_executor_success_path() -> None:
    """Productive use: an agent can continue with submitted structured answers.
    Expected outcome: resolved barrier payload becomes the tool observation.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptResponse,
        PromptWaitStatus,
    )
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    expected_answers = {"q1": {"selected_option": "yes", "freeform_text": None}}

    class _FakeBarrier:
        def create_prompt(self, _conversation):
            return "pid-1"

        def wait_for_response(self, _conversation, _prompt_id, **kwargs):
            return PromptResponse(PromptWaitStatus.RESOLVED, expected_answers)

    executor = AskQuestionsExecutor(
        _FakeBarrier(),  # type: ignore[arg-type]
        response_timeout=1.0,
    )
    obs = executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=object(),
    )
    assert not obs.cancelled
    assert not obs.timed_out
    assert obs.answers == expected_answers


@verifies(SWR.SWR_563)
def test_executor_timeout_path() -> None:
    """Productive use: an agent can distinguish an unanswered prompt.
    Expected outcome: barrier timeout becomes a timed-out observation.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptResponse,
        PromptWaitStatus,
    )
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    class _FakeBarrier:
        def create_prompt(self, _conversation):
            return "pid-1"

        def wait_for_response(self, _conversation, _prompt_id, **kwargs):
            return PromptResponse(PromptWaitStatus.TIMED_OUT)

    executor = AskQuestionsExecutor(
        _FakeBarrier(),  # type: ignore[arg-type]
        response_timeout=1.0,
    )
    obs = executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=object(),
    )
    assert obs.timed_out


@verifies(SWR.SWR_563)
def test_executor_cancelled_path() -> None:
    """Productive use: a user can cancel without waiting for timeout.
    Expected outcome: barrier cancellation becomes a cancelled observation.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptResponse,
        PromptWaitStatus,
    )
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsStep,
    )

    class _FakeBarrier:
        def create_prompt(self, _conversation):
            return "pid-1"

        def wait_for_response(self, _conversation, _prompt_id, **kwargs):
            return PromptResponse(PromptWaitStatus.CANCELLED)

    executor = AskQuestionsExecutor(
        _FakeBarrier(),  # type: ignore[arg-type]
        response_timeout=1.0,
    )
    obs = executor(
        AskQuestionsAction(steps=[AskQuestionsStep(id="q1", title="test")]),
        conversation=object(),
    )
    assert obs.cancelled
