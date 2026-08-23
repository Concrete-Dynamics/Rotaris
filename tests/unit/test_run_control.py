"""Productive use: a person acts on a run — answers a prompt, pauses it, types into
its terminal — and the run is reached through one narrow interface rather than by
reaching into whatever object happens to be live.
Expected outcome: every operation lands on the right run, refuses cleanly when the run
is gone, and carries nothing across that a second process could not."""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace
from typing import Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.runchannel import CONTROL_MESSAGES, InProcessRunControl
from rotaris_core.runchannel.control import RunSurface

pytestmark = pytest.mark.unit


class _Surface:
    """A live run, recording what was asked of it."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.answer = True

    def _record(self, name: str, *args: Any) -> bool:
        self.calls.append((name, args))
        return self.answer

    def cancel(self) -> None:
        self._record("cancel")

    def cancel_pending_questions(self) -> None:
        self._record("cancel_pending_questions")

    def cancel_pending_approvals(self) -> None:
        self._record("cancel_pending_approvals")

    def pause(self) -> bool:
        return self._record("pause")

    def cancel_agent(self, agent_id: str) -> bool:
        return self._record("cancel_agent", agent_id)

    def skip_verifier_check(self) -> bool:
        return self._record("skip_verifier_check")

    def switch_entry_model(self, model_key: str) -> bool:
        return self._record("switch_entry_model", model_key)

    def switch_entry_reasoning(self, reasoning: str) -> bool:
        return self._record("switch_entry_reasoning", reasoning)

    def set_permission_mode(self, mode: str) -> bool:
        return self._record("set_permission_mode", mode)

    def force_compress(self) -> bool:
        return self._record("force_compress")

    def clear_transcript(self) -> bool:
        return self._record("clear_transcript")

    def edit_todo(self, operation: str, target_id: str, text: str = "") -> bool:
        return self._record("edit_todo", operation, target_id, text)

    def resolve_questions(self, agent_id: str, prompt_id: str, answers: object) -> bool:
        return self._record("resolve_questions", agent_id, prompt_id, answers)

    def cancel_questions(self, agent_id: str, prompt_id: str) -> bool:
        return self._record("cancel_questions", agent_id, prompt_id)


def _control(surface: _Surface | None, session_id: str = "sess-a") -> InProcessRunControl:
    return InProcessRunControl(lambda: session_id, lambda: surface)


@verifies(SWR.SWR_2453)
def test_nothing_a_host_can_ask_carries_more_than_a_value() -> None:
    """Productive use: the run moves into its own process later.

    Expected outcome: every message still describes itself completely. An
    argument that cannot be written down cannot cross a process boundary, and a
    message that can reach a live engine object would drag the engine across
    with it — which is how a boundary quietly becomes a shared heap again."""
    allowed = (str, int, float, bool, type(None), dict, tuple, list)
    offenders: list[str] = []
    for message in CONTROL_MESSAGES:
        assert dataclasses.is_dataclass(message)
        for entry in dataclasses.fields(message):
            annotation = str(entry.type)
            if not any(name in annotation for name in (t.__name__ for t in allowed)):
                offenders.append(f"{message.__name__}.{entry.name}: {annotation}")
    assert not offenders, f"these arguments cannot cross a process boundary: {offenders}"


@verifies(SWR.SWR_2453)
def test_a_run_that_has_ended_refuses_instead_of_raising() -> None:
    """Productive use: someone clicks Pause as the run finishes.

    Expected outcome: the click is reported as not landing. A stale reference to
    the run that just ended would raise into a click handler instead."""
    control = _control(None)

    assert not control.pause()
    assert not control.force_compress()
    assert not control.cancel()
    assert not control.edit_todo("complete", "todo-1")
    assert not control.resolve_questions("agent-a", "prompt-1", {})


@verifies(SWR.SWR_2453)
def test_each_request_reaches_the_run_it_names() -> None:
    surface = _Surface()
    control = _control(surface)

    assert control.pause()
    assert control.switch_entry_model("gpt-5")
    assert control.set_permission_mode("plan")
    assert control.edit_todo("complete", "todo-1", "done")
    assert control.cancel_agent("coder-1")

    assert surface.calls == [
        ("pause", ()),
        ("switch_entry_model", ("gpt-5",)),
        ("set_permission_mode", ("plan",)),
        ("edit_todo", ("complete", "todo-1", "done")),
        ("cancel_agent", ("coder-1",)),
    ]


@verifies(SWR.SWR_2453)
def test_cancelling_releases_what_is_blocked_on_a_person_first() -> None:
    """Productive use: a user cancels a run that is waiting on their approval.

    Expected outcome: it actually stops. The dispatch waiting on that approval
    is a synchronous block *inside* the run, so cancelling without releasing it
    first leaves the run unwinding against a wait nobody will satisfy."""
    surface = _Surface()

    assert _control(surface).cancel()

    assert [name for name, _ in surface.calls] == [
        "cancel_pending_questions",
        "cancel_pending_approvals",
        "cancel",
    ]


@verifies(SWR.SWR_2453)
def test_an_empty_request_is_refused_before_it_reaches_the_run() -> None:
    surface = _Surface()
    control = _control(surface)

    assert not control.switch_entry_model("")
    assert not control.set_permission_mode("")
    assert not control.steer("coder-1", "   ")
    assert surface.calls == []


@verifies(SWR.SWR_2453, SWR.SWR_2504)
def test_an_approval_reaches_the_run_that_asked_for_it() -> None:
    """Productive use: two runs are open and one of them is waiting on a decision.

    Expected outcome: the answer resolves that run's request. Approvals resolve
    by session id, which is why this operation needs no live object at all —
    and why it would cross a process boundary unchanged."""
    from rotaris_core.permissions import ApprovalHost, discard_approval_host, register_approval_host

    resolved: list[tuple[str, str]] = []

    def _host(session: str) -> ApprovalHost:
        host = ApprovalHost(present=lambda _r: None, dismiss=lambda _r: None)
        host.barrier.create("request-1")
        original = host.barrier.resolve

        def _resolve(request_id: str, option: Any) -> bool:
            resolved.append((session, request_id))
            return original(request_id, option)

        host.barrier.resolve = _resolve  # type: ignore[method-assign]
        return host

    register_approval_host("sess-a", _host("sess-a"))
    register_approval_host("sess-b", _host("sess-b"))
    try:
        assert _control(_Surface(), "sess-a").resolve_approval("request-1", "approve_once")
    finally:
        discard_approval_host("sess-a")
        discard_approval_host("sess-b")

    assert resolved == [("sess-a", "request-1")]


@verifies(SWR.SWR_2453)
def test_the_run_worker_is_the_surface_the_control_expects() -> None:
    """Productive use: the desktop's worker is what an in-process control drives.

    Expected outcome: it satisfies the declared interface. Without this the
    binding is whatever attribute the caller reached for — which is how the
    question barrier ended up being addressed through a ``_ralph`` attribute the
    worker never had, with every answered question silently dropped."""
    pytest.importorskip("PySide6")
    from rotaris.services.run_bridge import _RunWorker

    missing = [
        name
        for name in RunSurface.__protocol_attrs__  # type: ignore[attr-defined]
        if not hasattr(_RunWorker, name)
    ]
    assert not missing, f"the run worker cannot answer: {missing}"
    assert isinstance(SimpleNamespace(), RunSurface) is False
