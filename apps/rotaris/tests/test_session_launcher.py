"""Productive use: a requirement released on the board starts its unit's work, and the
user keeps working on the board while it runs — then goes to the session when they choose
to, finds a live run there, and can stop or steer it.
Expected outcome: the run is a coordinator session cut over the worktree the flow already
provisioned, it does not steal the workspace's focus when it starts, and the flow's worker
waits for it exactly as long as it runs.

The coordinator here is the real one over fake bridges, so what is under test is the hop
between the flow's thread and Qt's — not a mock of it."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Any

import pytest
from fakes import FakeCoordinatorBridge, FakeRunConfigService
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_actions import SessionLaunch, SessionLauncher
from rotaris.services.requirements_controller import RequirementsController
from rotaris.services.run_coordinator import RunCoordinator
from rotaris.services.session_launcher import CoordinatorSessionLauncher

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

REQ = "SWR-3622"
UNIT = "swr-3622-interactive-a1b2c3d4"


def _coordinator(tmp_path: Path) -> tuple[RunCoordinator, WorkspaceStore, list[Any]]:
    store = WorkspaceStore()
    handles: list[Any] = []

    def factory() -> Any:
        handle = FakeCoordinatorBridge()
        handles.append(handle)
        return handle

    coordinator = RunCoordinator(tmp_path, store, FakeRunConfigService(), bridge_factory=factory)
    return coordinator, store, handles


def _launch(tree: Path) -> SessionLaunch:
    return SessionLaunch(
        prompt="implement the role model",
        tree=tree,
        branch=f"rotaris/req/{UNIT}",
        req_id=REQ,
        unit_id=UNIT,
    )


@verifies(SWR.SWR_3622)
def test_the_desktop_launcher_fills_the_port_the_host_asks_for(tmp_path, qtbot) -> None:
    coordinator, _store, _handles = _coordinator(tmp_path)

    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)

    assert isinstance(launcher, SessionLauncher)


@verifies(SWR.SWR_3622, SWR.SWR_3405)
def test_a_released_unit_adopts_the_worktree_the_flow_already_cut(tmp_path, qtbot) -> None:
    """Productive use: the flow provisions the unit's tree, then asks for a session in it.

    Expected outcome: the session attaches rather than creating a second tree. A run that
    worked in one tree while the report measured commits in another would deliver nothing
    the board could see (SWR-3405).
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    coordinator, _store, handles = _coordinator(tmp_path)
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)

    session_id = launcher.launch(_launch(tree))

    assert session_id
    assert len(handles) == 1
    isolation = handles[0].starts[0][2]
    assert isolation is not None, "the session was started without the flow's tree"
    assert isolation.path == tree
    assert isolation.create is False, "the session provisioned a second worktree"
    assert isolation.branch == f"rotaris/req/{UNIT}"


@verifies(SWR.SWR_3622)
def test_a_released_run_does_not_steal_the_workspace_focus(tmp_path, qtbot) -> None:
    """Productive use: a user releases a requirement and keeps reading the board.

    Expected outcome: the screen stays where they left it. A composer launch focuses,
    because the person typed the prompt and is already looking at the transcript; a board
    release means the opposite, and several units may start at once.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    coordinator, store, _handles = _coordinator(tmp_path)
    composer_session = coordinator.launch_new("something the user typed")
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)

    released = launcher.launch(_launch(tree))

    assert released != composer_session
    assert coordinator.focused_session_id == composer_session
    assert store.focused_session_id == composer_session
    # It is still a real run, with a handle of its own — that is the point.
    assert released in coordinator.session_ids


@verifies(SWR.SWR_3622)
def test_the_flow_waits_for_the_session_and_learns_how_it_ended(tmp_path, qtbot) -> None:
    """The seam is synchronous: the host blocks until the unit's run is over.

    Productive use: the flow reports what the unit did once it is done.
    Expected outcome: the wait ends when the session does, carrying its status.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    coordinator, _store, handles = _coordinator(tmp_path)
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)
    session_id = launcher.launch(_launch(tree))

    ended: list[Any] = []
    waiter = threading.Thread(target=lambda: ended.append(launcher.wait(session_id)))
    waiter.start()
    # Still running: nothing has told the launcher otherwise.
    waiter.join(timeout=0.2)
    assert ended == []

    handles[0].run_finished.emit("completed")
    waiter.join(timeout=5)

    assert ended[0].session_id == session_id
    assert ended[0].status == "completed"


@verifies(SWR.SWR_3622)
def test_a_failed_session_reports_its_reason_rather_than_a_silent_end(tmp_path, qtbot) -> None:
    tree = tmp_path / "worktree"
    tree.mkdir()
    coordinator, _store, handles = _coordinator(tmp_path)
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)
    session_id = launcher.launch(_launch(tree))

    ended: list[Any] = []
    waiter = threading.Thread(target=lambda: ended.append(launcher.wait(session_id)))
    waiter.start()
    handles[0].run_failed.emit("the sandbox refused to start")
    waiter.join(timeout=5)

    assert ended[0].error == "the sandbox refused to start"
    assert ended[0].status == "failed"


@verifies(SWR.SWR_3622)
def test_waiting_on_a_session_nobody_launched_here_ends_rather_than_parks(
    tmp_path,
    qtbot,
) -> None:
    """A worker parked forever on a session that was never started is a flow that never
    finishes and a requirement stuck in Running."""
    coordinator, _store, _handles = _coordinator(tmp_path)
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)

    ended = launcher.wait("a-session-from-somewhere-else")

    assert ended.error


@verifies(SWR.SWR_3622, SWR.SWR_2415)
def test_a_released_run_answers_the_controls_a_user_session_answers(tmp_path, qtbot) -> None:
    """Productive use: a user opens the run their release started and takes it over —
    queues a correction, pauses it, stops it.

    Expected outcome: the controls act on it. Every one of them is written
    ``handle is not None and …``, so before the run had a handle they all returned
    False for exactly the runs a user most wants to reach.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    coordinator, _store, handles = _coordinator(tmp_path)
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)
    session_id = launcher.launch(_launch(tree))

    assert coordinator.focus(session_id) is True

    assert coordinator.running is True
    assert coordinator.queue_prompt("use the other schema") == "prompt-1"
    assert coordinator.pause() is True
    coordinator.cancel()
    assert handles[0].cancels == 1


@verifies(SWR.SWR_3622, SWR.SWR_2415)
def test_closing_the_application_stops_a_released_run_rather_than_abandoning_it(
    tmp_path,
    qtbot,
) -> None:
    """Productive use: the user closes Rotaris while a released requirement is working.

    Expected outcome: the run is asked to stop and waited for, like any other. A run
    nobody can stop ends only by finishing or by the process dying, which is how a
    requirement's work comes back hours later as interrupted.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    coordinator, _store, handles = _coordinator(tmp_path)
    launcher = CoordinatorSessionLauncher(coordinator, tmp_path)
    launcher.launch(_launch(tree))

    coordinator.shutdown_all()

    assert handles[0].cancels == 1
    assert handles[0].shutdowns == 1


# ── who builds it (SWR-3315) ───────────────────────────────────────────────


@verifies(SWR.SWR_3622, SWR.SWR_3315)
def test_the_board_area_builds_its_own_launcher_from_the_coordinator_it_is_given(
    tmp_path,
    qtbot,
) -> None:
    """Productive use: the desktop opens, and the first requirement released in it runs
    as a session the user can join.

    Expected outcome: the area has its launcher from the moment it exists. The window
    constructs this controller and registers its surface and does nothing else with the
    requirements area (SWR-3315), so the coordinator is handed over as a collaborator
    and the launcher around it is built here — a release that silently took the
    self-contained path would be the failure this wiring exists to prevent.
    """
    coordinator, _store, _handles = _coordinator(tmp_path)

    controller = RequirementsController(
        WorkspaceStore(),
        workspace=tmp_path,
        coordinator=coordinator,
    )
    qtbot.addWidget(controller.surface)

    # The private field is the whole effect of the wiring: what it feeds is the
    # write path, which needs a writable requirement store to exist at all.
    assert isinstance(controller._launcher, CoordinatorSessionLauncher)  # noqa: SLF001


@verifies(SWR.SWR_3622)
def test_a_composition_that_brings_no_coordinator_leaves_the_launcher_unset(
    tmp_path,
    qtbot,
) -> None:
    """Every headless composition and most tests: asked structurally, so a double that
    is not a coordinator leaves releases running exactly as they did before."""
    controller = RequirementsController(
        WorkspaceStore(),
        workspace=tmp_path,
        coordinator=object(),
    )
    qtbot.addWidget(controller.surface)

    assert controller._launcher is None  # noqa: SLF001
