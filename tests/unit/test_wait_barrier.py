"""Tests for the wait barrier (explicit wait_for_tasks ↔ drain handshake)."""

from __future__ import annotations

import threading

from rotaris_core.orchestrator.wait_barrier import WaitBarrier
from rotaris_core.reqtocode import SWR, verifies


class FakeConversation:
    pass


@verifies(SWR.SWR_142)
def test_consume_returns_requested_ids_once() -> None:
    barrier = WaitBarrier()
    conversation = FakeConversation()
    barrier.request_wait(conversation, ["t-1", "t-2"])
    assert barrier.consume(conversation) == ["t-1", "t-2"]
    assert barrier.consume(conversation) is None


@verifies(SWR.SWR_142)
def test_consume_without_request_returns_none() -> None:
    barrier = WaitBarrier()
    assert barrier.consume(FakeConversation()) is None


@verifies(SWR.SWR_142)
def test_requests_are_isolated_per_conversation() -> None:
    barrier = WaitBarrier()
    first, second = FakeConversation(), FakeConversation()
    barrier.request_wait(first, ["a"])
    barrier.request_wait(second, ["b"])
    assert barrier.consume(second) == ["b"]
    assert barrier.consume(first) == ["a"]


@verifies(SWR.SWR_142)
def test_request_stores_a_copy() -> None:
    barrier = WaitBarrier()
    conversation = FakeConversation()
    ids = ["t-1"]
    barrier.request_wait(conversation, ids)
    ids.append("t-2")
    assert barrier.consume(conversation) == ["t-1"]


@verifies(SWR.SWR_142)
def test_discard_removes_pending_request() -> None:
    barrier = WaitBarrier()
    conversation = FakeConversation()
    barrier.request_wait(conversation, ["t-1"])
    barrier.discard(conversation)
    assert barrier.consume(conversation) is None
    barrier.discard(conversation)  # idempotent


@verifies(SWR.SWR_142)
def test_concurrent_request_and_consume_do_not_corrupt() -> None:
    barrier = WaitBarrier()
    conversations = [FakeConversation() for _ in range(8)]
    errors: list[Exception] = []

    def hammer(conversation: FakeConversation, index: int) -> None:
        try:
            for i in range(200):
                barrier.request_wait(conversation, [f"c{index}-{i}"])
                consumed = barrier.consume(conversation)
                assert consumed == [f"c{index}-{i}"]
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [
        threading.Thread(target=hammer, args=(conversation, index))
        for index, conversation in enumerate(conversations)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
