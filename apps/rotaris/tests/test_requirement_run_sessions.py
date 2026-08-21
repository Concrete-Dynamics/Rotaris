"""Productive use: a user releases a requirement and wants to take part in the work it
started — watch it, steer it, answer it, stop it — instead of watching a card and hoping.
Expected outcome: the unit's run is a session the desktop's run coordinator drives, cut
over the worktree the seam already provisioned; its session id is on the run record while
the run is still going, so the board can open it at the time that matters; and a
composition with no coordinator behind it still runs the unit exactly as it always did.

The launcher is a local double throughout. Nothing here starts a provider, a Qt event
loop or an agent — the seam under test is the one between the flow's worker thread and
whatever starts sessions.
"""

from __future__ import annotations

import datetime as dt
import threading
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import RunOutcome
from rotaris_core.requirements.execution.history import ExecutionHistory, RunRecord
from rotaris_core.requirements.execution.run_seam import (
    RunWorkspace,
    UnitLaunch,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import capture_snapshot
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.run_result import RunResult, RunStatus

from rotaris.services.requirements_actions import (
    AgentRunHost,
    SessionLaunch,
    SessionLauncher,
    SessionRunResult,
    attach_session_to_run,
)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.execution.snapshot import RunSnapshot

pytestmark = pytest.mark.unit

REQ = "SWR-3624"
UNIT = "swr-3624-interactive-a1b2c3d4"
RUN = "run-1"
AT = dt.datetime(2026, 8, 21, 12, 0, tzinfo=dt.UTC)
SESSION = "20260821-131700-7bf1aecac209"


# --------------------------------------------------------------------------
# The world: a launch, and a launcher that records what it was asked
# --------------------------------------------------------------------------


def _snapshot() -> RunSnapshot:
    return capture_snapshot(
        CanonicalRequirement(
            req_id=REQ,
            title="A released requirement runs as an interactive session",
            description="The run is a session the user can take part in.",
            source_id="specs",
            source_revision="r1",
        ),
        run_id=RUN,
        base_commit="c0ffee1",
        at=AT,
        unit_id=UNIT,
    )


def _launch(tree: Path, *, prompt: str = "implement it") -> UnitLaunch:
    return UnitLaunch(
        run_id=RUN,
        req_id=REQ,
        unit_id=UNIT,
        snapshot=_snapshot(),
        isolation=unit_isolation(REQ, UNIT, run_id=RUN),
        workspace=RunWorkspace(
            path=str(tree),
            branch=f"rotaris/req/{UNIT}",
            base_branch="main",
            base_revision="c0ffee1",
        ),
        prompt=prompt,
    )


class ScriptedLauncher:
    """A run coordinator's answer, without a coordinator.

    Records the launch it was handed and how long the caller waited, because both
    are the contract: the launch says which tree the session runs in, and the wait
    is what keeps the seam synchronous.
    """

    def __init__(
        self,
        *,
        session_id: str = SESSION,
        ended: SessionRunResult | None = None,
    ) -> None:
        self.launched: list[SessionLaunch] = []
        self.waited: list[str] = []
        self._session_id = session_id
        self._ended = ended or SessionRunResult(session_id=session_id, status="completed")

    def launch(self, launch: SessionLaunch) -> str:
        self.launched.append(launch)
        return self._session_id

    def wait(self, session_id: str) -> SessionRunResult:
        self.waited.append(session_id)
        return self._ended


class RefusingLauncher:
    """The desktop could not start a session at all."""

    def launch(self, launch: SessionLaunch) -> str:
        del launch
        return ""

    def wait(self, session_id: str) -> SessionRunResult:  # pragma: no cover — never reached
        raise AssertionError(f"waited on {session_id!r} for a session that never started")


# --------------------------------------------------------------------------
# SWR-3624 — the run is a session the coordinator drives
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3624)
def test_the_launcher_is_the_shape_the_host_asks_for() -> None:
    """The port is structural, so a composition that fills it wrongly fails here."""
    assert isinstance(ScriptedLauncher(), SessionLauncher)


@verifies(SWR.SWR_3624)
def test_a_released_unit_is_run_as_a_session_over_the_tree_the_seam_provisioned(
    tmp_path: Path,
) -> None:
    """Productive use: a release starts a unit whose worktree the flow already cut.

    Expected outcome: the session runs *in that tree*, on that branch. A launcher that
    provisioned its own would give the unit two trees, and the report measures commits
    from the tree the seam knows — so the run would report on the wrong one (SWR-3405).
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    launcher = ScriptedLauncher()
    host = AgentRunHost(tmp_path, launcher=launcher, run_checks=lambda _tree: ())
    launch = _launch(tree, prompt="implement the role model")

    host.start(launch)

    assert len(launcher.launched) == 1
    started = launcher.launched[0]
    assert started.tree == tree
    assert started.branch == launch.workspace.branch
    assert started.req_id == REQ
    assert started.unit_id == UNIT
    assert "implement the role model" in started.prompt
    # The seam is synchronous: the host waited for the session it started.
    assert launcher.waited == [SESSION]


@verifies(SWR.SWR_3624)
def test_the_report_carries_the_session_the_run_actually_used(tmp_path: Path) -> None:
    tree = tmp_path / "worktree"
    tree.mkdir()
    host = AgentRunHost(
        tmp_path,
        launcher=ScriptedLauncher(ended=SessionRunResult(session_id=SESSION, status="completed")),
        run_checks=lambda _tree: (),
    )

    report = host.start(_launch(tree))

    assert report.session_id == SESSION


@verifies(SWR.SWR_3624)
@pytest.mark.parametrize(
    ("status", "error", "expected"),
    [
        ("completed", "", RunOutcome.SUCCEEDED),
        ("interrupted", "", RunOutcome.INTERRUPTED),
        ("max_iterations", "", RunOutcome.FAILED),
        ("", "the session could not start its agent", RunOutcome.FAILED),
        ("a word nobody named", "", RunOutcome.FAILED),
    ],
)
def test_how_a_session_ended_becomes_how_the_unit_ran(
    tmp_path: Path,
    status: str,
    error: str,
    expected: RunOutcome,
) -> None:
    """A status crosses two Qt signals as a bare string; an unknown one must not read
    as a delivery."""
    tree = tmp_path / "worktree"
    tree.mkdir()
    host = AgentRunHost(
        tmp_path,
        launcher=ScriptedLauncher(
            ended=SessionRunResult(session_id=SESSION, status=status, error=error),
        ),
        run_checks=lambda _tree: (),
    )

    assert host.start(_launch(tree)).outcome is expected


@verifies(SWR.SWR_3624)
def test_a_session_that_never_started_is_a_stated_failure_not_a_wait(tmp_path: Path) -> None:
    """A launch that produced no session is a launch that did not happen; waiting on it
    would park the flow's worker for the life of the process."""
    tree = tmp_path / "worktree"
    tree.mkdir()
    host = AgentRunHost(tmp_path, launcher=RefusingLauncher(), run_checks=lambda _tree: ())

    report = host.start(_launch(tree))

    assert report.outcome is RunOutcome.FAILED
    assert "could not start a session" in report.failure_reason


@verifies(SWR.SWR_3624)
def test_a_composition_with_no_coordinator_still_runs_the_unit(tmp_path: Path) -> None:
    """Productive use: the headless CLI, and every test with an injected agent.

    Expected outcome: unchanged. The launcher is what a desktop adds, not a dependency
    the run acquired — a host without one must not reach for a coordinator that is not
    there.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    seen: list[tuple[str, Path]] = []

    def run_agent(task: str, where: Path) -> RunResult:
        seen.append((task, where))
        return RunResult(session_id="injected", status=RunStatus.COMPLETED, summary="done")

    host = AgentRunHost(tmp_path, run_agent=run_agent, run_checks=lambda _tree: ())

    report = host.start(_launch(tree))

    assert len(seen) == 1
    assert seen[0][1] == tree
    assert report.session_id == "injected"


@verifies(SWR.SWR_3624)
def test_the_session_is_announced_while_the_run_is_still_going(tmp_path: Path) -> None:
    """The whole point of the announcement: it happens before the wait, not after it.

    Productive use: a user clicks into the run of a unit that is working right now.
    Expected outcome: there is a session id to click, because it was recorded when the
    session was created rather than when the run reported.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    announced: list[tuple[str, str]] = []
    waited = threading.Event()

    class SlowLauncher(ScriptedLauncher):
        def wait(self, session_id: str) -> SessionRunResult:
            waited.set()
            return super().wait(session_id)

    def started(session_id: str, launch: UnitLaunch) -> None:
        assert not waited.is_set(), "the session was announced only after the run ended"
        announced.append((session_id, launch.run_id))

    host = AgentRunHost(
        tmp_path,
        launcher=SlowLauncher(),
        session_started=started,
        run_checks=lambda _tree: (),
    )

    host.start(_launch(tree))

    assert announced == [(SESSION, RUN)]


# --------------------------------------------------------------------------
# SWR-3612 — the run record can be opened while the run is live
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3612, SWR.SWR_3624)
def test_a_live_run_record_gains_the_session_it_is_running_in(tmp_path: Path) -> None:
    """Productive use: the board opens the run of a unit that is working right now.

    Expected outcome: the record names the session. ``of_start`` seeds that field from
    the specification snapshot, which is captured before any agent session exists, so a
    live run used to have nothing for ``open_run`` to focus.
    """
    history = ExecutionHistory(tmp_path)
    launch = _launch(tmp_path / "worktree")
    history.append(RunRecord.opening(launch.snapshot))
    assert history.load(REQ).get(RUN).session_id != SESSION

    assert attach_session_to_run(tmp_path, SESSION, launch) is True

    assert history.load(REQ).get(RUN).session_id == SESSION
    # One run, not two: the history keeps a run's newest content at its first
    # position, which is how ``open`` and ``complete`` already write it twice.
    assert history.load(REQ).run_ids == (RUN,)
    assert history.load(REQ).get(RUN).outcome is RunOutcome.RUNNING


@verifies(SWR.SWR_3612, SWR.SWR_3624)
def test_recording_the_session_twice_changes_nothing(tmp_path: Path) -> None:
    history = ExecutionHistory(tmp_path)
    launch = _launch(tmp_path / "worktree")
    history.append(RunRecord.opening(launch.snapshot))
    attach_session_to_run(tmp_path, SESSION, launch)

    assert attach_session_to_run(tmp_path, SESSION, launch) is False
    assert history.load(REQ).get(RUN).session_id == SESSION


@verifies(SWR.SWR_3612, SWR.SWR_3624)
def test_a_history_that_cannot_be_amended_never_fails_the_run(tmp_path: Path) -> None:
    """Navigation is not worth failing a run over."""
    launch = _launch(tmp_path / "worktree")

    # No record opened for this run at all.
    assert attach_session_to_run(tmp_path, SESSION, launch) is False
    assert attach_session_to_run(tmp_path, "", launch) is False
