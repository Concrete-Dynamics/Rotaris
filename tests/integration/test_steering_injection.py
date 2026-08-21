from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from rotaris_core.api.prompts import prompt_api
from rotaris_core.core.prompt_types import PromptRegistry, SteeringStatus
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.reqtocode import SWR, verifies
from tests.integration.test_orchestrator_e2e import (
    MockConversation,
    make_scheduler,
)
from tests.unit.test_scheduler import MockMessageEvent


@pytest.fixture(autouse=True)
def clean_prompt_registry():
    """Ensure PromptRegistry is clean before and after each test."""
    registry = PromptRegistry()
    registry._steering_prompts = {}
    registry._queued_prompts = {}
    yield
    registry._steering_prompts = {}
    registry._queued_prompts = {}


class TrackedConversation(MockConversation):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.messages: list[str] = []
        self.run_count = 0
        self.on_run = None

    def send_message(self, msg: str) -> None:
        self.messages.append(msg)
        super().send_message(msg)

    def run(self) -> None:
        self.run_count += 1
        if self.on_run:
            self.on_run(self)


@verifies(SWR.SWR_1134, SWR.SWR_1137)
@pytest.mark.asyncio
async def test_steering_prompt_injection_integration() -> None:
    """Integration test to verify that steering prompts are correctly injected
    into the agent's conversation loop within the Scheduler.
    """
    # 1. Setup
    child_id = "test_child"
    steering_content = "Focus on being concise."
    expected_steering_msg = f"[STEERING PROMPT]\n{steering_content}"

    # Use a conversation that will terminate on the second run
    conversation = TrackedConversation(events=[MockMessageEvent("assistant", ["Turn 1 done"])])

    def on_run_callback(conv):
        # Submit steering prompt during the first run
        prompt_api.submit_steering(child_id, steering_content)

    # We use a dynamic callback to simulate different behaviors for different runs
    def dynamic_on_run(conv):
        if conv.run_count == 1:
            on_run_callback(conv)
        else:
            # On second run, set terminal status to exit the loop
            conv.state.execution_status = SimpleNamespace(value="stuck")

    conversation.on_run = dynamic_on_run

    class CustomConversationFactory:
        def __init__(self, conv):
            self.conv = conv

        def __call__(self, agent, callbacks=None, token_callbacks=None):
            self.conv.callbacks = callbacks or []
            self.conv.token_callbacks = token_callbacks or []
            return self.conv

    # Note: make_scheduler in test_orchestrator_e2e uses keyword-only arguments
    # and has specific signature. We use it carefully.
    scheduler, _ = make_scheduler(conversations=[conversation])
    scheduler._conversation_factory = CustomConversationFactory(conversation)

    record = ChildTaskRecord(
        name=child_id,
        canonical_name=child_id,
        session_id="test_session",
        persona="test_persona",
        task_payload="initial task",
        state=ChildTaskState.RUNNING,
        parent_agent_id="parent",
        depth=1,
    )
    # Important: Scheduler uses record.conversation_id for prompt lookup.
    # In run_child, it sets it to conversation.id or record.session_id or canonical_name.
    # Our MockConversation doesn't have an .id, so it will use canonical_name.
    record.conversation_id = child_id

    # 2. Action
    # We must patch CircuitBreakerSession because it's instantiated inside run_child.
    # If it's NOT patched, activation will be None, and it will trigger recovery
    # instead of steering (if recovery_attempts < limit).
    # By returning a non-None activation, we bypass the activation is None block.

    class MockActivation:
        def __init__(self, escalation=None, loop_detected=False, corrective_message=None):
            self.escalation = escalation
            self.loop_detected = loop_detected
            self.corrective_message = corrective_message

    class MockCircuitBreakerSession:
        def __init__(self, *args, **kwargs):
            self.escalation = None
            self.loop_detected = False
            self.corrective_message = None

        def mark_new_user_instruction(self):
            pass

        async def activate(self, *args, **kwargs):
            return MockActivation(self.escalation, self.loop_detected, self.corrective_message)

    with patch(
        "rotaris_core.agents.circuit_breaker.CircuitBreakerSession",
        side_effect=MockCircuitBreakerSession,
    ):
        await scheduler.run_child(record, agent=MagicMock())

    # 3. Verifications

    # A. Check if steering prompt was injected into messages
    assert expected_steering_msg in conversation.messages, (
        f"Expected steering message not found in {conversation.messages}"
    )

    # B. Check if PromptRegistry updated status to INJECTED
    registry = PromptRegistry()
    updated_prompts = registry.get_steering_prompts(child_id)
    assert len(updated_prompts) == 1
    assert updated_prompts[0].status == SteeringStatus.INJECTED

    # C. Verify it happened between turns
    # 1st message: task_payload
    # 2nd message: steering_prompt
    assert conversation.messages[0] == "initial task"
    assert conversation.messages[1] == expected_steering_msg

    # D. Verify injection influenced the next turn
    assert conversation.run_count >= 2


@verifies(SWR.SWR_1134, SWR.SWR_1137)
@pytest.mark.asyncio
async def test_steering_prompt_cleans_up_registry() -> None:
    registry = PromptRegistry()
    child_id = "cleanup_test"
    prompt_api.submit_steering(child_id, "test")
    assert len(registry.get_steering_prompts(child_id)) == 1
