"""Unit tests for the exact-conversation user-prompt handshake."""

from __future__ import annotations

import threading
from types import SimpleNamespace
from typing import Any

import pytest

from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture
def barrier() -> Any:
    from rotaris_core.orchestrator.user_prompt_barrier import UserPromptBarrier

    return UserPromptBarrier()


def _conversation(conversation_id: str = "conversation-1") -> object:
    return SimpleNamespace(id=conversation_id)


@verifies(SWR.SWR_2423)
def test_create_prompt_guards_stable_conversation_id(barrier: Any) -> None:
    """Productive use: an agent can expose only one active prompt per conversation.
    Expected outcome: a second object with the same stable SDK ID cannot create another prompt.
    """
    barrier.create_prompt(_conversation())
    with pytest.raises(RuntimeError, match="already waiting"):
        barrier.create_prompt(_conversation())


@verifies(SWR.SWR_2423)
def test_create_prompt_requires_stable_conversation_id(barrier: Any) -> None:
    """Productive use: prompt routing can survive Python object collection and reuse.
    Expected outcome: conversations without a stable SDK ID are rejected.
    """
    with pytest.raises(ValueError, match="non-empty string id"):
        barrier.create_prompt(object())


@verifies(SWR.SWR_2423)
def test_resolve_exact_prompt_unblocks_waiter(barrier: Any) -> None:
    """Productive use: a user can answer the exact agent prompt shown by Rotaris.
    Expected outcome: only that waiter receives the submitted answers.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

    conversation = _conversation()
    prompt_id = barrier.create_prompt(conversation)
    answers = {"scope": {"selected_option": "Small", "freeform_text": None}}

    thread = threading.Thread(
        target=lambda: barrier.resolve(conversation, prompt_id, answers),
    )
    thread.start()
    response = barrier.wait_for_response(conversation, prompt_id, timeout=1.0)
    thread.join()

    assert response.status is PromptWaitStatus.RESOLVED
    assert response.answers == answers


@verifies(SWR.SWR_2423)
def test_wrong_prompt_id_cannot_resolve_waiter(barrier: Any) -> None:
    """Productive use: concurrent prompts cannot receive another prompt's answers.
    Expected outcome: mismatched prompt identity is rejected and original wait remains cancellable.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

    conversation = _conversation()
    prompt_id = barrier.create_prompt(conversation)

    assert not barrier.resolve(conversation, "other-prompt", {"scope": {}})
    assert barrier.cancel(conversation, prompt_id)
    response = barrier.wait_for_response(conversation, prompt_id, timeout=1.0)
    assert response.status is PromptWaitStatus.CANCELLED


@verifies(SWR.SWR_2423)
def test_cancel_releases_wait_and_allows_next_prompt(barrier: Any) -> None:
    """Productive use: a user can abandon a question without stalling the agent for five minutes.
    Expected outcome: cancellation releases the waiter and leaves no stale prompt entry.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

    conversation = _conversation()
    prompt_id = barrier.create_prompt(conversation)
    assert barrier.cancel(conversation, prompt_id)

    response = barrier.wait_for_response(conversation, prompt_id, timeout=1.0)
    assert response.status is PromptWaitStatus.CANCELLED
    assert barrier.create_prompt(conversation)


@verifies(SWR.SWR_2423)
def test_timeout_is_distinct_and_cleans_up(barrier: Any) -> None:
    """Productive use: an agent can distinguish no response from user cancellation.
    Expected outcome: timeout has its own status and does not poison later prompts.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

    conversation = _conversation()
    prompt_id = barrier.create_prompt(conversation)
    response = barrier.wait_for_response(conversation, prompt_id, timeout=0.01)

    assert response.status is PromptWaitStatus.TIMED_OUT
    assert barrier.create_prompt(conversation)


@verifies(SWR.SWR_2423)
def test_discard_releases_active_waiter(barrier: Any) -> None:
    """Productive use: conversation teardown can release an abandoned prompt wait.
    Expected outcome: discard wakes the waiter with cancellation.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

    conversation = _conversation()
    prompt_id = barrier.create_prompt(conversation)
    responses: list[object] = []
    thread = threading.Thread(
        target=lambda: responses.append(
            barrier.wait_for_response(conversation, prompt_id, timeout=1.0)
        )
    )
    thread.start()
    barrier.discard(conversation)
    thread.join()

    assert responses[0].status is PromptWaitStatus.CANCELLED


@verifies(SWR.SWR_2423)
def test_cancel_all_releases_prompts_for_multiple_agents(barrier: Any) -> None:
    """Productive use: stopping a run can release every waiting agent promptly.
    Expected outcome: every active prompt returns cancellation.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import PromptWaitStatus

    conversations = [_conversation("agent-a"), _conversation("agent-b")]
    prompt_ids = [barrier.create_prompt(conversation) for conversation in conversations]
    barrier.cancel_all()

    responses = [
        barrier.wait_for_response(conversation, prompt_id, timeout=1.0)
        for conversation, prompt_id in zip(conversations, prompt_ids, strict=True)
    ]
    assert all(response.status is PromptWaitStatus.CANCELLED for response in responses)
