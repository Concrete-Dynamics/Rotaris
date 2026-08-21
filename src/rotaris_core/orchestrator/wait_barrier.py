"""Explicit wait-barrier handshake between ``wait_for_tasks`` and the drain."""

from __future__ import annotations

import threading

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_142)
class WaitBarrier:
    """Pending parent-wait requests, keyed by conversation identity.

    ``wait_for_tasks`` (running on the SDK worker thread inside the parent
    conversation's own run loop) registers the task ids the parent wants to
    block on; ``SchedulerDrainMixin._run_wait_barrier_if_requested`` (event
    loop) consumes them.  This replaces the previous handshake of smuggling
    a ``_rotaris_waited_ids`` attribute onto the conversation object.

    Keys are ``id(conversation)`` — the same one-pending-wait-per-parent
    semantics as the old attribute.  ``consume`` pops the entry; call
    ``discard`` on conversation teardown so an unconsumed entry cannot
    outlive its conversation and be misread if the object id is reused.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: dict[int, list[str]] = {}

    def request_wait(self, conversation: object, task_ids: list[str]) -> None:
        with self._lock:
            self._pending[id(conversation)] = list(task_ids)

    def consume(self, conversation: object) -> list[str] | None:
        with self._lock:
            return self._pending.pop(id(conversation), None)

    def discard(self, conversation: object) -> None:
        with self._lock:
            self._pending.pop(id(conversation), None)
