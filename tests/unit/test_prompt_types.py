import threading
from datetime import datetime

import pytest

from rotaris_core.core.prompt_types import (
    PromptRegistry,
    PromptType,
    QueuedPrompt,
    QueuedStatus,
    SteeringPrompt,
    SteeringStatus,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_1102)
@verifies(SWR.SWR_1322)
def test_prompt_type_enum():
    """Verify PromptType enum contains the correct values."""
    assert PromptType.STANDARD.value == "STANDARD"
    assert PromptType.STEERING.value == "STEERING"
    assert PromptType.QUEUED.value == "QUEUED"


@verifies(SWR.SWR_1102)
def test_steering_prompt_dataclass():
    """Verify SteeringPrompt correctly stores and retrieves its fields."""
    child_id = "child-123"
    content = "test steering content"
    prompt = SteeringPrompt(target_child_id=child_id, content=content)

    assert prompt.target_child_id == child_id
    assert prompt.content == content
    assert isinstance(prompt.id, str)
    assert isinstance(prompt.timestamp, datetime)
    assert prompt.status == SteeringStatus.PENDING


@verifies(SWR.SWR_1102)
def test_queued_prompt_dataclass():
    """Verify QueuedPrompt correctly stores and retrieves its fields."""
    content = "test queued content"
    context = {"key": "value"}
    prompt = QueuedPrompt(content=content, context_snapshot=context)

    assert prompt.content == content
    assert prompt.context_snapshot == context
    assert isinstance(prompt.id, str)
    assert isinstance(prompt.timestamp, datetime)
    assert prompt.status == QueuedStatus.QUEUED


@verifies(SWR.SWR_1102)
def test_prompt_registry_singleton():
    """Verify that PromptRegistry behaves as a true singleton."""
    registry1 = PromptRegistry()
    registry2 = PromptRegistry()
    assert registry1 is registry2


@verifies(SWR.SWR_1322)
def test_clearing_the_registry_empties_it_for_everyone_holding_it():
    """Productive use: a harness that needs the prompt registry to start empty can say so.
    Expected outcome: both stores are emptied, and the caller that was already holding the
    singleton -- ``prompt_api``, the desktop bridge, a running loop -- sees the same
    emptied registry rather than being left talking to a stale one."""
    from rotaris_core.api.prompts import prompt_api

    registry = PromptRegistry()
    registry.add_steering_prompt("child-1", "be concise")
    queued_id = prompt_api.submit_queued("run this next", {"session_id": "s1"})

    assert registry.get_steering_prompts("child-1")
    assert any(prompt.id == queued_id for prompt in registry.get_queued_prompts())

    registry.clear()

    assert registry.get_steering_prompts("child-1") == []
    assert registry.get_queued_prompts() == []
    # The API submitted through its own reference to the singleton, so that one has to
    # be empty too -- replacing the instance instead of emptying it would not show here.
    assert prompt_api.list_queued() == []


@pytest.fixture
def clean_registry():
    """The process-wide registry, empty.

    ``tests/conftest.py::_isolate_prompt_registry`` has already emptied it for this
    test; the ``clear()`` here is what makes that a promise this fixture keeps
    rather than one it inherits, and it is cheap.
    """
    registry = PromptRegistry()
    registry.clear()
    return registry


@verifies(SWR.SWR_1102)
def test_prompt_registry_steering_prompts(clean_registry):
    """Verify adding steering prompts and retrieving them by child_id."""
    child_id = "child-1"
    content = "steering content"

    prompt_id = clean_registry.add_steering_prompt(child_id, content)
    prompts = clean_registry.get_steering_prompts(child_id)

    assert len(prompts) == 1
    assert prompts[0].id == prompt_id
    assert prompts[0].target_child_id == child_id
    assert prompts[0].content == content
    assert prompts[0].status == SteeringStatus.PENDING


@verifies(SWR.SWR_1102)
def test_prompt_registry_update_steering_status(clean_registry):
    """Verify updating steering prompt status."""
    child_id = "child-1"
    content = "steering content"
    prompt_id = clean_registry.add_steering_prompt(child_id, content)

    clean_registry.mark_steering_as_injected(prompt_id)

    prompts = clean_registry.get_steering_prompts(child_id)
    assert len(prompts) == 1
    assert prompts[0].status == SteeringStatus.INJECTED
    assert prompts[0].id == prompt_id


@verifies(SWR.SWR_1102)
def test_prompt_registry_update_steering_status_not_found(clean_registry):
    """Verify updating steering prompt status with non-existent ID raises KeyError."""
    with pytest.raises(KeyError):
        clean_registry.mark_steering_as_injected("non-existent-id")


@verifies(SWR.SWR_1102)
def test_prompt_registry_queued_prompts(clean_registry):
    """Verify adding queued prompts and retrieving them."""
    content = "queued content"
    context = {"user": "test"}

    prompt_id = clean_registry.add_queued_prompt(content, context)
    prompts = clean_registry.get_queued_prompts()

    assert len(prompts) == 1
    assert prompts[0].id == prompt_id
    assert prompts[0].content == content
    assert prompts[0].context_snapshot == context
    assert prompts[0].status == QueuedStatus.QUEUED


@verifies(SWR.SWR_1102)
def test_prompt_registry_update_queued_status(clean_registry):
    """Verify updating queued prompt status."""
    content = "queued content"
    context = {}
    prompt_id = clean_registry.add_queued_prompt(content, context)

    clean_registry.mark_queued_as_triggered(prompt_id)

    prompts = clean_registry.get_queued_prompts()
    assert len(prompts) == 1
    assert prompts[0].status == QueuedStatus.TRIGGERED
    assert prompts[0].id == prompt_id


@verifies(SWR.SWR_1102)
def test_prompt_registry_update_queued_status_not_found(clean_registry):
    """Verify updating queued prompt status with non-existent ID raises KeyError."""
    with pytest.raises(KeyError):
        clean_registry.mark_queued_as_triggered("non-existent-id")


@verifies(SWR.SWR_1102)
def test_prompt_registry_remove_queued_prompt(clean_registry):
    prompt_id = clean_registry.add_queued_prompt("queued content", {})

    removed = clean_registry.remove_queued_prompt(prompt_id)

    assert removed.id == prompt_id
    assert clean_registry.get_queued_prompts() == []


@verifies(SWR.SWR_1102)
def test_prompt_registry_remove_queued_prompt_rejects_triggered(clean_registry):
    prompt_id = clean_registry.add_queued_prompt("queued content", {})
    clean_registry.mark_queued_as_triggered(prompt_id)

    with pytest.raises(ValueError):
        clean_registry.remove_queued_prompt(prompt_id)


@verifies(SWR.SWR_1322)
def test_prompt_registry_edits_queued_prompt_without_changing_identity(clean_registry):
    prompt_id = clean_registry.add_queued_prompt("before", {"session": "one"})
    original = clean_registry.get_queued_prompts()[0]

    updated = clean_registry.update_queued_prompt(prompt_id, "after")

    assert updated.id == original.id
    assert updated.timestamp == original.timestamp
    assert updated.context_snapshot == {"session": "one"}
    assert updated.content == "after"


@verifies(SWR.SWR_1322)
def test_prompt_registry_rejects_edit_after_prompt_is_triggered(clean_registry):
    prompt_id = clean_registry.add_queued_prompt("before", {})
    clean_registry.mark_queued_as_triggered(prompt_id)

    with pytest.raises(ValueError):
        clean_registry.update_queued_prompt(prompt_id, "too late")


@verifies(SWR.SWR_1102)
def test_prompt_registry_thread_safety(clean_registry):
    """Verify thread-safety during concurrent additions/retrievals."""
    num_threads = 10
    iterations = 50

    def worker(child_id):
        for i in range(iterations):
            clean_registry.add_steering_prompt(child_id, f"content-{i}")
            clean_registry.add_queued_prompt(f"queued-{i}", {})

    threads = []
    for i in range(num_threads):
        t = threading.Thread(target=worker, args=(f"child-{i}",))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Total steering prompts should be num_threads * iterations
    total_steering = sum(
        len(clean_registry.get_steering_prompts(f"child-{i}")) for i in range(num_threads)
    )
    assert total_steering == num_threads * iterations

    # Total queued prompts should be num_threads * iterations
    assert len(clean_registry.get_queued_prompts()) == num_threads * iterations
