"""Productive use: a desktop user decides on a tool call an agent is blocked on.
Expected outcome: the modal opens by itself, the chosen answer reaches the waiting agent,
and closing without a choice never reads as consent."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

import pytest
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.permissions import ApprovalOption
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState

from rotaris.models.store import WorkspaceStore
from rotaris.services.session_projection import (
    SessionProjectionContext,
    build_session_projection,
)
from rotaris.views.transcript import TranscriptListView

pytestmark = pytest.mark.integration

if TYPE_CHECKING:
    from collections.abc import Sequence


def _payload(request_id: str = "req-1", command: str = "git push") -> dict[str, Any]:
    return {
        "request_id": request_id,
        "session_id": "session-approval",
        "agent_id": "coder-1",
        "persona": "coder",
        "tool_name": "terminal",
        "command": command,
        "argument_summary": "",
        "rule_id": "ask:mutating",
        "reason": "Mutating tool.",
    }


class _FakeBridge:
    """Stands in for RunBridge: records deliveries, can report a lost waiter."""

    def __init__(self, *, deliverable: bool = True) -> None:
        self.deliverable = deliverable
        self.calls: list[tuple[str, str]] = []

    def resolve_approval(self, request_id: str, option: str) -> bool:
        self.calls.append((request_id, option))
        return self.deliverable


def _wired_view(
    qtbot: Any,
    bridge: _FakeBridge,
) -> tuple[TranscriptListView, WorkspaceStore]:
    store = WorkspaceStore()
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_store_and_bridge(store, bridge)  # type: ignore[arg-type]
    return view, store


def _dialogs(view: TranscriptListView) -> Sequence[Any]:
    from rotaris.widgets.approval_dialog import ApprovalDialog

    return [child for child in view.children() if isinstance(child, ApprovalDialog)]


@verifies(SWR.SWR_2504)
def test_pending_approval_is_projected_into_the_transcript() -> None:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-approval",
        workspace_root="/workspace",
        created_at=now,
        updated_at=now,
        pending_approvals={"req-1": _payload()},
    )

    projection = build_session_projection(state, RotarisConfig(), SessionProjectionContext(), [])

    assert projection.transcript[-1].kind == "approval"
    assert "git push" in projection.transcript[-1].text
    assert projection.pending_approvals[0]["request_id"] == "req-1"

    # The projection owns its copy: later snapshot mutations cannot rewrite it.
    state.pending_approvals["req-1"]["command"] = "rm -rf /"
    assert projection.pending_approvals[0]["command"] == "git push"


@verifies(SWR.SWR_2504)
def test_store_emits_pending_approvals_only_on_change() -> None:
    store = WorkspaceStore()
    emissions: list[object] = []
    store.pending_approvals_changed.connect(emissions.append)

    store.set_pending_approvals((_payload(),))
    store.set_pending_approvals((_payload(),))

    assert emissions == [(_payload(),)]


@verifies(SWR.SWR_2504)
def test_approving_once_delivers_the_decision_and_closes_the_modal(qtbot) -> None:
    bridge = _FakeBridge()
    view, store = _wired_view(qtbot, bridge)

    store.set_pending_approvals((_payload(),))

    dialogs = _dialogs(view)
    assert len(dialogs) == 1, "a blocked call must open its modal without being hunted for"
    dialog = dialogs[0]
    assert dialog.request_id == "req-1"
    dialog._once_button.click()

    assert bridge.calls == [("req-1", "approve_once")]
    assert not dialog.isVisible()


@verifies(SWR.SWR_2504)
def test_closing_the_modal_denies_instead_of_allowing(qtbot) -> None:
    bridge = _FakeBridge()
    view, store = _wired_view(qtbot, bridge)
    store.set_pending_approvals((_payload(),))

    _dialogs(view)[0].close()

    assert bridge.calls == [("req-1", "deny")]


@verifies(SWR.SWR_2504)
def test_undeliverable_decision_shows_a_recoverable_error(qtbot) -> None:
    bridge = _FakeBridge(deliverable=False)
    view, store = _wired_view(qtbot, bridge)
    store.set_pending_approvals((_payload(),))
    dialog = _dialogs(view)[0]

    dialog.decided.emit("approve_once")

    assert dialog.isVisible()
    assert dialog._status_label.isVisible()
    assert "no longer available" in dialog._status_label.text()


@verifies(SWR.SWR_2504)
def test_queued_requests_are_shown_one_after_another(qtbot) -> None:
    bridge = _FakeBridge()
    view, store = _wired_view(qtbot, bridge)

    store.set_pending_approvals((_payload(), _payload("req-2", "pytest -q")))
    first = _dialogs(view)[0]
    assert first.request_id == "req-1"

    first.decided.emit("deny")

    remaining = [dialog for dialog in _dialogs(view) if dialog.isVisible()]
    assert len(remaining) == 1
    assert remaining[0].request_id == "req-2"
    assert bridge.calls == [("req-1", "deny")]


@verifies(SWR.SWR_2504)
def test_run_bridge_answer_reaches_the_waiting_agent(tmp_path) -> None:
    """The desktop decision resolves the exact barrier the agent thread waits on."""
    from rotaris_core.permissions import (
        ApprovalHost,
        ApprovalWaitStatus,
        register_approval_host,
        reset_approval_registry,
    )

    from rotaris.services.config_service import ConfigService
    from rotaris.services.run_bridge import RunBridge

    reset_approval_registry()
    try:
        store = WorkspaceStore()
        bridge = RunBridge(tmp_path, store, ConfigService(tmp_path, store))
        bridge._session_id = "session-approval"
        host = register_approval_host("session-approval", ApprovalHost(present=lambda _: None))
        host.barrier.create("req-1")

        assert bridge.resolve_approval("req-1", "approve_once") is True
        response = host.barrier.wait_for_response("req-1", timeout=0.5)

        assert response.status is ApprovalWaitStatus.RESOLVED
        assert response.option is ApprovalOption.APPROVE_ONCE
        # A request nobody is waiting on must be reported as undeliverable.
        assert bridge.resolve_approval("req-1", "approve_once") is False
        assert bridge.resolve_approval("req-1", "not-an-option") is False
    finally:
        reset_approval_registry()


@verifies(SWR.SWR_2504)
def test_session_observer_publishes_and_clears_pending_approvals(tmp_path) -> None:
    """The presenter writes into the persisted snapshot the desktop polls."""
    import asyncio
    from types import SimpleNamespace

    from rotaris.services.run_bridge import _SessionObserver

    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-approval",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
    )
    saved: list[object] = []
    manager = SimpleNamespace(persister=SimpleNamespace(request_save=saved.append))
    loop = asyncio.new_event_loop()
    try:
        observer = _SessionObserver(loop, manager, state)
        observer.present_approval(_payload())
        _run_pending_callbacks(loop)

        assert state.pending_approvals["req-1"]["command"] == "git push"
        assert saved

        observer.dismiss_approval("req-1")
        _run_pending_callbacks(loop)

        assert state.pending_approvals == {}
    finally:
        loop.close()


def _run_pending_callbacks(loop: Any) -> None:
    """Drain the callbacks the observer scheduled onto the run loop."""
    loop.call_soon(loop.stop)
    loop.run_forever()


@verifies(SWR.SWR_2504)
def test_request_resolved_elsewhere_closes_the_modal_without_a_second_answer(qtbot) -> None:
    bridge = _FakeBridge()
    view, store = _wired_view(qtbot, bridge)
    store.set_pending_approvals((_payload(),))
    dialog = _dialogs(view)[0]

    # The run ended (or the request timed out) while the modal was open.
    store.set_pending_approvals(())

    assert not dialog.isVisible()
    assert bridge.calls == []
