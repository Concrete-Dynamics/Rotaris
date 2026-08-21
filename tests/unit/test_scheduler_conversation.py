from __future__ import annotations

import threading
import time

import pytest

from rotaris_core.orchestrator import scheduler_conversation
from rotaris_core.orchestrator.scheduler_conversation import (
    ToolActivityRegistry,
    graceful_pause_conversation,
    pause_with_daemon,
)
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture(autouse=True)
def _drain_graceful_pauses():
    """Leave no in-flight graceful pause behind for the next test.

    `graceful_pause_conversation` keeps a process-wide set of the names it is
    already pausing, so a second call for the same name is dropped as a
    duplicate — the guard that stops two daemons force-closing one conversation.
    A test whose daemon is still in that set when the next test starts therefore
    silences the next test's pause entirely, and the next test simply waits for
    something that will never happen. The wait here is for the daemon, not for
    the clock: it ends as soon as the set drains.
    """
    yield
    deadline = time.monotonic() + 5.0
    while scheduler_conversation._graceful_pause_inflight and time.monotonic() < deadline:
        time.sleep(0.01)
    scheduler_conversation._graceful_pause_inflight.clear()


@verifies(SWR.SWR_162)
def test_registry_tracks_started_and_finished_tools() -> None:
    registry = ToolActivityRegistry()
    assert registry.has_active_tools("child-a") is False

    registry.tool_started("child-a", "call-1")
    registry.tool_started("child-a", "call-2")
    assert registry.has_active_tools("child-a") is True
    assert registry.active_tool_ids("child-a") == {"call-1", "call-2"}

    registry.tool_finished("child-a", "call-1")
    assert registry.has_active_tools("child-a") is True

    registry.tool_finished("child-a", "call-2")
    assert registry.has_active_tools("child-a") is False
    assert registry.active_tool_ids("child-a") == set()


@verifies(SWR.SWR_162)
def test_registry_isolates_children() -> None:
    registry = ToolActivityRegistry()
    registry.tool_started("child-a", "call-1")
    registry.tool_started("child-b", "call-2")

    registry.clear("child-a")
    assert registry.has_active_tools("child-a") is False
    assert registry.has_active_tools("child-b") is True


@verifies(SWR.SWR_162)
def test_registry_finish_unknown_tool_is_noop() -> None:
    registry = ToolActivityRegistry()
    registry.tool_finished("child-a", "never-started")
    assert registry.has_active_tools("child-a") is False


@verifies(SWR.SWR_162)
def test_registry_concurrent_start_finish_is_consistent() -> None:
    """Hammer the registry from many threads.

    The old dict-based tracking had a discard-then-delete window where a
    concurrent start could be lost. With the lock, every started call that
    is also finished must leave the registry empty.
    """
    registry = ToolActivityRegistry()
    iterations = 200
    workers = 8
    barrier = threading.Barrier(workers)

    def worker(worker_id: int) -> None:
        barrier.wait()
        for i in range(iterations):
            call_id = f"w{worker_id}-c{i}"
            registry.tool_started("child-a", call_id)
            registry.tool_finished("child-a", call_id)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert registry.has_active_tools("child-a") is False
    assert registry.active_tool_ids("child-a") == set()


class FakeConversation:
    def __init__(self) -> None:
        self.pause_calls = 0
        self.close_calls = 0
        self.paused = threading.Event()
        self.closed = threading.Event()

    def pause(self) -> None:
        self.pause_calls += 1
        self.paused.set()

    def close(self) -> None:
        self.close_calls += 1
        self.closed.set()


@verifies(SWR.SWR_162)
def test_graceful_pause_pauses_immediately_when_no_tools_active() -> None:
    registry = ToolActivityRegistry()
    conversation = FakeConversation()

    graceful_pause_conversation(conversation, "child-a", registry=registry)

    assert conversation.paused.wait(timeout=5.0)
    assert conversation.close_calls == 0


@verifies(SWR.SWR_162)
def test_graceful_pause_force_close_skips_tool_wait() -> None:
    registry = ToolActivityRegistry()
    registry.tool_started("child-a", "call-1")
    conversation = FakeConversation()

    graceful_pause_conversation(
        conversation,
        "child-a",
        registry=registry,
        force_close_when_stuck=True,
    )

    assert conversation.closed.wait(timeout=5.0)
    assert conversation.pause_calls == 0


@verifies(SWR.SWR_162)
def test_graceful_pause_waits_for_tools_then_pauses() -> None:
    registry = ToolActivityRegistry()
    registry.tool_started("child-a", "call-1")
    conversation = FakeConversation()

    graceful_pause_conversation(
        conversation,
        "child-a",
        registry=registry,
        tool_deadline=5.0,
        poll_interval=0.01,
    )
    assert not conversation.paused.wait(timeout=0.1)

    registry.tool_finished("child-a", "call-1")
    assert conversation.paused.wait(timeout=5.0)
    assert conversation.close_calls == 0


@verifies(SWR.SWR_162)
def test_graceful_pause_closes_when_tool_deadline_expires() -> None:
    registry = ToolActivityRegistry()
    # Named for this test alone: the in-flight guard is keyed by name, so two
    # tests sharing one name can only ever run in lockstep.
    registry.tool_started("deadline-close", "stuck-call")
    conversation = FakeConversation()

    graceful_pause_conversation(
        conversation,
        "deadline-close",
        registry=registry,
        tool_deadline=0.05,
        poll_interval=0.01,
    )

    assert conversation.closed.wait(timeout=5.0)
    assert conversation.pause_calls == 0


@verifies(SWR.SWR_162)
def test_graceful_pause_no_close_on_deadline_when_force_close_on_deadline_false() -> None:
    """When force_close_on_deadline=False, deadline expiry pauses instead of closing.

    Regression test for session 20260709-154816-ba1193672b0c where the
    orchestrator force-closed a parent conversation during a pause for
    background notification injection, killing its MCP clients. The parent
    was later resumed and all MCP tools returned "client has been closed".
    """
    registry = ToolActivityRegistry()
    registry.tool_started("deadline-pause", "stuck-call")
    conversation = FakeConversation()

    graceful_pause_conversation(
        conversation,
        "deadline-pause",
        registry=registry,
        tool_deadline=0.05,
        poll_interval=0.01,
        force_close_on_deadline=False,
    )

    # Should pause, NOT close — the conversation will be resumed later.
    assert conversation.paused.wait(timeout=5.0)
    assert conversation.close_calls == 0


@verifies(SWR.SWR_162)
def test_pause_with_daemon_nonblocking_returns_before_pause_completes() -> None:
    release = threading.Event()

    class _SlowPauseConversation:
        def pause(self) -> None:
            release.wait(timeout=5)

    conversation = _SlowPauseConversation()
    started = time.monotonic()
    pause_with_daemon(conversation, block=False)
    elapsed = time.monotonic() - started
    release.set()

    assert elapsed < 1.0, f"block=False must not wait for pause(), took {elapsed:.1f}s"


@verifies(SWR.SWR_162)
def test_graceful_pause_clears_registry_when_no_tools_active() -> None:
    """When no tools are active, pause immediately and clear registry (safety net)."""
    registry = ToolActivityRegistry()
    # No tools active — the registry is already empty
    conversation = FakeConversation()

    graceful_pause_conversation(conversation, "child-clean", registry=registry)

    assert conversation.paused.wait(timeout=5.0)
    assert conversation.close_calls == 0
    # Safety net: clear() is called even on the empty-registry path
    assert registry.has_active_tools("child-clean") is False


@verifies(SWR.SWR_162)
def test_graceful_pause_clears_registry_after_tool_wait() -> None:
    """After tools finish and pause, registry is cleared."""
    registry = ToolActivityRegistry()
    registry.tool_started("child-wait", "call-1")
    conversation = FakeConversation()

    graceful_pause_conversation(
        conversation,
        "child-wait",
        registry=registry,
        tool_deadline=5.0,
        poll_interval=0.01,
    )
    # Not yet — tool is still active
    assert not conversation.paused.wait(timeout=0.1)

    registry.tool_finished("child-wait", "call-1")
    assert conversation.paused.wait(timeout=5.0)
    assert registry.has_active_tools("child-wait") is False


@verifies(SWR.SWR_162)
def test_graceful_pause_clears_registry_on_force_close() -> None:
    """After deadline expires and force-close, registry is cleared."""
    registry = ToolActivityRegistry()
    registry.tool_started("child-force", "stuck-call")
    conversation = FakeConversation()

    graceful_pause_conversation(
        conversation,
        "child-force",
        registry=registry,
        tool_deadline=0.05,
        poll_interval=0.01,
    )

    assert conversation.closed.wait(timeout=5.0)
    assert conversation.pause_calls == 0
    assert registry.has_active_tools("child-force") is False


@verifies(SWR.SWR_162)
def test_graceful_pause_skips_duplicate_calls_for_same_name() -> None:
    """Only one daemon thread per canonical_name — second call returns immediately."""
    registry = ToolActivityRegistry()
    registry.tool_started("child-dup", "stuck-call")
    conversation = FakeConversation()

    # First call: starts a poll thread
    graceful_pause_conversation(
        conversation,
        "child-dup",
        registry=registry,
        tool_deadline=0.1,
        poll_interval=0.01,
    )
    # Second call: should be a no-op (idempotence)
    graceful_pause_conversation(
        conversation,
        "child-dup",
        registry=registry,
        tool_deadline=0.05,  # shorter — but shouldn't matter, it's skipped
        poll_interval=0.01,
    )

    # The first poll thread is still running (tool not finished yet).
    # The second call should not have started a second thread — so only one
    # close should happen when the first thread's deadline expires.
    assert conversation.closed.wait(timeout=5.0)
    # If idempotence worked, only one close happened despite two calls.
    assert conversation.close_calls == 1


@verifies(SWR.SWR_162)
def test_graceful_pause_idempotence_per_name_allows_different_names() -> None:
    """Idempotence is per canonical_name; different names can be paused concurrently."""
    registry = ToolActivityRegistry()
    registry.tool_started("child-x", "stuck-a")
    registry.tool_started("child-y", "stuck-b")
    conv_x = FakeConversation()
    conv_y = FakeConversation()

    graceful_pause_conversation(
        conv_x,
        "child-x",
        registry=registry,
        tool_deadline=0.05,
        poll_interval=0.01,
    )
    graceful_pause_conversation(
        conv_y,
        "child-y",
        registry=registry,
        tool_deadline=0.05,
        poll_interval=0.01,
    )

    assert conv_x.closed.wait(timeout=5.0)
    assert conv_y.closed.wait(timeout=5.0)
    assert conv_x.close_calls == 1
    assert conv_y.close_calls == 1
