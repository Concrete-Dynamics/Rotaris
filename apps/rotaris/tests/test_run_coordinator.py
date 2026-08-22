"""Productive use: a user runs several Rotaris sessions in one workspace at once.
Expected outcome: each run keeps its own worker, prompts and lifecycle, while the
window only ever shows — and only ever commands — the focused run."""

from __future__ import annotations

from typing import Any

import pytest
from fakes import FakeCoordinatorBridge, FakeRunConfigService
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import SessionInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.run_coordinator import RunCoordinator

pytestmark = pytest.mark.integration


def _coordinator(tmp_path) -> tuple[RunCoordinator, WorkspaceStore, list[FakeCoordinatorBridge]]:
    store = WorkspaceStore()
    config = FakeRunConfigService()
    handles: list[FakeCoordinatorBridge] = []

    def factory() -> Any:
        handle = FakeCoordinatorBridge()
        handles.append(handle)
        return handle

    coordinator = RunCoordinator(tmp_path, store, config, bridge_factory=factory)
    return coordinator, store, handles


@verifies(SWR.SWR_2415, SWR.SWR_2434)
def test_two_launches_get_independent_handles_and_focused_routing(tmp_path, qtbot) -> None:
    coordinator, store, handles = _coordinator(tmp_path)

    first = coordinator.launch_new("build the parser")
    second = coordinator.launch_new("write the docs")

    assert first and second and first != second
    assert len(handles) == 2
    assert sorted(coordinator.active_session_ids) == sorted([first, second])
    assert coordinator.focused_session_id == second
    assert store.focused_session_id == second

    coordinator.queue_prompt("follow-up for the docs run")
    assert handles[0].queued == []
    assert handles[1].queued == ["follow-up for the docs run"]


@verifies(SWR.SWR_2415)
def test_second_and_third_concurrent_launches_are_forced_into_worktrees(tmp_path, qtbot) -> None:
    coordinator, _store, handles = _coordinator(tmp_path)

    first = coordinator.launch_new("first task")
    assert handles[0].starts[0][2] is None  # base workspace is fine for run one

    second = coordinator.launch_new("second task")
    third = coordinator.launch_new("third task")

    for index, session_id in ((1, second), (2, third)):
        isolation = handles[index].starts[0][2]
        assert isolation is not None
        assert isolation.create is True
        assert isolation.session_id == session_id
    assert first not in {second, third}


@verifies(SWR.SWR_2415)
def test_focus_switches_projection_without_touching_background_lifecycles(tmp_path, qtbot) -> None:
    coordinator, store, handles = _coordinator(tmp_path)
    first = coordinator.launch_new("first task")
    second = coordinator.launch_new("second task")

    assert coordinator.focus(first) is True

    assert handles[0].projection_enabled is True
    assert handles[1].projection_enabled is False
    assert handles[0].cancels == 0
    assert handles[1].cancels == 0
    assert handles[1].running is True
    assert sorted(coordinator.active_session_ids) == sorted([first, second])
    assert store.focused_session_id == first
    assert [session.focused for session in store.sessions if session.id == first] == [True]
    assert [session.focused for session in store.sessions if session.id == second] == [False]


@verifies(SWR.SWR_2415, SWR.SWR_2434)
def test_continuing_an_already_focused_session_projects_the_run_it_starts(tmp_path, qtbot) -> None:
    """Continuing a run from the dashboard focuses the session first, while it
    still has no handle. The handle `resume` creates afterwards must project,
    or the run streams into its snapshot behind a workspace that never moves."""
    coordinator, store, handles = _coordinator(tmp_path)
    store.set_sessions(
        [SessionInfo(id="older", name="older", status="completed", branch="rotaris/session/older")]
    )

    assert coordinator.focus("older") is True  # no handle exists for it yet
    assert coordinator.resume("older", "continue please") is True

    assert len(handles) == 1
    assert handles[0].projection_enabled is True
    assert handles[0].synced == 1


@verifies(SWR.SWR_2415)
def test_cancel_and_failure_affect_only_one_handle(tmp_path, qtbot) -> None:
    coordinator, _store, handles = _coordinator(tmp_path)
    first = coordinator.launch_new("first task")
    second = coordinator.launch_new("second task")
    finished: list[tuple[str, str]] = []
    failed: list[tuple[str, str]] = []
    focused_failed: list[str] = []
    coordinator.session_run_finished.connect(lambda sid, status: finished.append((sid, status)))
    coordinator.session_run_failed.connect(lambda sid, message: failed.append((sid, message)))
    coordinator.run_failed.connect(focused_failed.append)

    coordinator.cancel()  # focused run is `second`
    assert handles[1].cancels == 1
    assert handles[0].cancels == 0

    handles[0].running = False
    handles[0].run_failed.emit("provider exploded")

    assert failed == [(first, "provider exploded")]
    assert focused_failed == []  # background failure never hijacks the focused run
    assert coordinator.active_session_ids == [second] or coordinator.active_session_ids == []
    assert finished == []


@verifies(SWR.SWR_2415)
def test_improvement_indicator_stays_lit_until_every_handle_is_done(tmp_path, qtbot) -> None:
    coordinator, store, handles = _coordinator(tmp_path)
    coordinator.launch_new("first task")
    coordinator.launch_new("second task")

    handles[0].improvement_active = True
    handles[0].improvement_activity_changed.emit(True)
    handles[1].improvement_active = True
    handles[1].improvement_activity_changed.emit(True)
    assert store.improvement_collection_active is True

    handles[1].improvement_active = False
    handles[1].improvement_activity_changed.emit(False)
    assert store.improvement_collection_active is True

    handles[0].improvement_active = False
    handles[0].improvement_activity_changed.emit(False)
    assert store.improvement_collection_active is False


@verifies(SWR.SWR_2415)
def test_shutdown_requests_every_handle_before_waiting_on_any(tmp_path, qtbot) -> None:
    coordinator, _store, handles = _coordinator(tmp_path)
    order: list[str] = []

    coordinator.launch_new("first task")
    coordinator.launch_new("second task")
    for index, handle in enumerate(handles):
        handle.cancel = (  # type: ignore[method-assign]
            lambda idx=index: order.append(f"request-{idx}")
        )
        handle.shutdown = (  # type: ignore[method-assign]
            lambda idx=index: order.append(f"join-{idx}")
        )

    coordinator.shutdown_all()

    assert order == ["request-0", "request-1", "join-0", "join-1"]


@verifies(SWR.SWR_2415)
def test_background_summary_updates_session_row_without_projecting(tmp_path, qtbot) -> None:
    coordinator, store, handles = _coordinator(tmp_path)
    first = coordinator.launch_new("first task")
    coordinator.launch_new("second task")
    store.set_sessions(
        [
            SessionInfo(id=first, name=first, status="running", branch="rotaris/session/a"),
            SessionInfo(id="other", name="other", status="idle"),
        ]
    )
    updates: list[bool] = []
    coordinator.store_updated.connect(lambda: updates.append(True))

    handles[0].session_summary.emit(first, "completed", "rotaris/session/a-2")
    handles[0].store_updated.emit()

    row = next(session for session in store.sessions if session.id == first)
    assert row.status == "completed"
    assert row.branch == "rotaris/session/a-2"
    assert updates == []  # unfocused run must not repaint the workspace


@verifies(SWR.SWR_2504)
def test_approval_decision_reaches_the_run_that_is_blocked_on_it(tmp_path, qtbot) -> None:
    coordinator, _store, handles = _coordinator(tmp_path)
    coordinator.launch_new("first task")
    coordinator.launch_new("second task")
    handles[1].pending_approval_ids.add("req-1")

    assert coordinator.resolve_approval("req-1", "approve_once") is True

    assert handles[1].approvals == [("req-1", "approve_once")]
    assert handles[0].approvals == []


@verifies(SWR.SWR_2504)
def test_approval_still_reaches_a_run_the_user_focused_away_from(tmp_path, qtbot) -> None:
    """The modal outlives a focus switch, so the decision must not be lost."""
    coordinator, _store, handles = _coordinator(tmp_path)
    first = coordinator.launch_new("first task")
    coordinator.launch_new("second task")
    handles[0].pending_approval_ids.add("req-1")
    assert coordinator.focused_session_id != first

    assert coordinator.resolve_approval("req-1", "approve_once") is True

    assert handles[0].approvals == [("req-1", "approve_once")]


@verifies(SWR.SWR_2504)
def test_approval_nobody_waits_on_is_reported_as_undeliverable(tmp_path, qtbot) -> None:
    coordinator, _store, _handles = _coordinator(tmp_path)
    coordinator.launch_new("first task")

    assert coordinator.resolve_approval("req-gone", "deny") is False


@verifies(SWR.SWR_2503, SWR.SWR_2509)
def test_a_mode_change_reaches_only_the_focused_run(tmp_path, qtbot) -> None:
    """A background run keeps the mode it launched with — the composer chip is
    part of the focused run's controls, like the model and reasoning switches."""
    coordinator, _store, handles = _coordinator(tmp_path)
    coordinator.launch_new("first task")
    coordinator.launch_new("second task")
    background, focused = handles

    assert coordinator.set_permission_mode("restricted") is True

    assert focused.permission_modes == ["restricted"]
    assert background.permission_modes == []


@verifies(SWR.SWR_2415, SWR.SWR_2504)
def test_coordinator_mirrors_every_run_bridge_control_the_views_call() -> None:
    """Views are handed a coordinator through a RunBridge-shaped slot.

    Nothing type-checks that hand-off, so a control the coordinator forgot to
    forward only shows up as an AttributeError when the user clicks it.
    """
    from PySide6.QtCore import QObject

    from rotaris.services.run_bridge import RunBridge

    # Per-handle plumbing the coordinator consumes rather than exposes: it
    # decides projection ownership itself and aggregates these signals.
    handle_internals = {
        "improvement_active",
        "improvement_activity_changed",
        "session_summary",
        "set_projection_enabled",
        "worktree_resolved",
    }
    inherited = set(dir(QObject))
    facade = {name for name in dir(RunBridge) if not name.startswith("_")} - inherited
    exposed = {name for name in dir(RunCoordinator) if not name.startswith("_")} - inherited

    assert facade - exposed == handle_internals


@verifies(SWR.SWR_2415)
def test_resume_of_a_base_workspace_session_is_refused_while_a_run_is_active(
    tmp_path, qtbot
) -> None:
    coordinator, store, handles = _coordinator(tmp_path)
    coordinator.launch_new("first task")
    store.set_sessions([SessionInfo(id="older", name="older", status="completed", branch="—")])

    assert coordinator.resume("older", "continue please") is False
    assert len(handles) == 1

    store.set_sessions(
        [SessionInfo(id="older", name="older", status="completed", branch="rotaris/session/older")]
    )
    assert coordinator.resume("older", "continue please") is True
    assert handles[1].starts[0][1] == "older"
