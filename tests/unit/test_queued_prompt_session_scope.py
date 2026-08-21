"""Productive use: a user queues follow-up messages while several sessions run.
Expected outcome: each queued message reaches the session it was typed into, and
single-session hosts keep their unscoped queue behavior."""

from __future__ import annotations

from rotaris_core.api.prompts import prompt_api
from rotaris_core.core.prompt_types import PromptRegistry, QueuedStatus
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_2415, SWR.SWR_2434)
def test_queued_prompts_are_listed_only_for_their_owning_session() -> None:
    registry = PromptRegistry()
    first = registry.add_queued_prompt("run A follow-up", {}, session_id="session-a")
    second = registry.add_queued_prompt("run B follow-up", {}, session_id="session-b")

    assert [prompt.id for prompt in registry.get_queued_prompts("session-a")] == [first]
    assert [prompt.id for prompt in registry.get_queued_prompts("session-b")] == [second]
    assert {prompt.id for prompt in registry.get_queued_prompts()} == {first, second}


@verifies(SWR.SWR_2434)
def test_session_ownership_can_come_from_the_context_snapshot() -> None:
    registry = PromptRegistry()
    registry.add_queued_prompt("desktop follow-up", {"session_id": "session-a"})

    owned = registry.get_queued_prompts("session-a")
    assert [prompt.content for prompt in owned] == ["desktop follow-up"]


@verifies(SWR.SWR_2434)
def test_unscoped_prompts_stay_invisible_to_scoped_sessions() -> None:
    registry = PromptRegistry()
    registry.add_queued_prompt("headless follow-up", {})

    assert registry.get_queued_prompts("session-a") == []
    assert len(registry.get_queued_prompts()) == 1


@verifies(SWR.SWR_2434)
def test_edits_and_triggering_preserve_session_ownership() -> None:
    registry = PromptRegistry()
    prompt_id = registry.add_queued_prompt("first draft", {}, session_id="session-a")

    registry.update_queued_prompt(prompt_id, "second draft")
    assert registry.get_queued_prompts("session-a")[0].content == "second draft"

    registry.mark_queued_as_triggered(prompt_id)
    triggered = registry.get_queued_prompts("session-a")[0]
    assert triggered.status is QueuedStatus.TRIGGERED
    assert triggered.session_id == "session-a"


@verifies(SWR.SWR_2434)
def test_prompt_api_keeps_the_legacy_unscoped_contract() -> None:
    prompt_api.submit_queued("tui follow-up")
    scoped_id = prompt_api.submit_queued("desktop follow-up", session_id="session-a")

    assert len(prompt_api.list_queued()) == 2
    assert [prompt.id for prompt in prompt_api.list_queued("session-a")] == [scoped_id]
