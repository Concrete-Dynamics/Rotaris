"""Productive use: a scheduler — or a CLI, or a test — starts an agent run for one
execution unit and follows it to its end, on a machine with no display and no desktop app
installed.
Expected outcome: the seam takes an isolation request, hands the unit a worktree of its
own on a `rotaris/req/…` branch, reports every lifecycle step, keeps the tree when the run
fails, produces the board's own run shape — and pulls no Qt and no `rotaris` desktop module
into the import graph while doing it."""

from __future__ import annotations

import datetime as dt
import subprocess
import sys
import textwrap
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import RunOutcome
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    REQUIREMENT_WORKTREE_SUBPATH,
    GitIsolation,
    IsolationError,
    IsolationRequest,
    RequirementRunSeam,
    RunEvent,
    RunPhase,
    RunReport,
    RunWorkspace,
    UnitLaunch,
    unit_branch,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import (
    RunSnapshot,
    SnapshotStore,
    capture_snapshot,
)
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator
    from pathlib import Path

REQ = "SWR-3416"
UNIT = "swr-3416-impl"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Requirement runs are launchable without the desktop",
        description="A scheduler starts a unit run without a Qt object in sight.",
        source_id="specs",
        source_path="specs/run-seam.md",
        source_revision="r3",
    )


def snapshot_of(
    *,
    run_id: str = "run-1",
    unit_id: str = UNIT,
    base_commit: str = "c0ffee1",
) -> RunSnapshot:
    return capture_snapshot(
        requirement(),
        run_id=run_id,
        base_commit=base_commit,
        at=AT,
        unit_id=unit_id,
        session_id="20260814-abcdef",
    )


def ticking(start: dt.datetime = AT) -> Callable[[], dt.datetime]:
    """A clock that advances one second per read, so ordering is observable."""
    counter = iter(range(1000))

    def clock() -> dt.datetime:
        return start + dt.timedelta(seconds=next(counter))

    return clock


class FakeIsolation:
    """An isolation provider that records what it was asked for."""

    def __init__(self, *, fail: str = "") -> None:
        self.requests: list[IsolationRequest] = []
        self._fail = fail

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        self.requests.append(request)
        if self._fail:
            raise IsolationError(self._fail)
        return RunWorkspace(
            path=f"/tmp/wt/{request.session_id}",
            branch=request.branch or "detached",
            base_branch="master",
            base_revision="c0ffee1",
        )


class FakeHost:
    """A run host that records its launches and answers with a scripted report."""

    def __init__(
        self,
        report: RunReport | None = None,
        *,
        raises: Exception | None = None,
        on_start: Callable[[UnitLaunch], None] | None = None,
    ) -> None:
        self.launches: list[UnitLaunch] = []
        self._report = report or RunReport(
            outcome=RunOutcome.SUCCEEDED,
            session_id="20260814-abcdef",
            produced_commits=("deadbee",),
            changed_files=("src/rotaris_core/thing.py",),
            verified=True,
            agent_summary="did the thing",
            agent_claimed_complete=True,
        )
        self._raises = raises
        self._on_start = on_start

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        if self._on_start is not None:
            self._on_start(launch)
        if self._raises is not None:
            raise self._raises
        return self._report


# -- the lifecycle ---------------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_the_seam_passes_the_isolation_request_through_and_reports_the_lifecycle() -> None:
    """Requested → isolated → started → finished, with the request as given."""
    isolation = FakeIsolation()
    host = FakeHost()
    seen: list[RunEvent] = []
    seam = RequirementRunSeam(
        isolation=isolation,
        host=host,
        clock=ticking(),
        observer=seen.append,
    )
    snapshot = snapshot_of()
    request = unit_isolation(REQ, UNIT, run_id=snapshot.run_id)

    result = seam.start(snapshot=snapshot, isolation_request=request, agent="implementer")

    assert isolation.requests == [request]
    assert request.branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3416/{UNIT}"
    assert request.session_id == "run-1"

    assert result.phases == (
        RunPhase.REQUESTED,
        RunPhase.ISOLATED,
        RunPhase.STARTED,
        RunPhase.FINISHED,
    )
    assert [event.at for event in result.events] == sorted(event.at for event in result.events)
    assert [event.run_id for event in result.events] == ["run-1"] * 4
    assert result.events[-1].outcome is RunOutcome.SUCCEEDED
    assert seen == list(result.events)

    assert result.outcome is RunOutcome.SUCCEEDED
    assert result.succeeded
    assert result.workspace is not None
    assert result.workspace.branch == request.branch
    assert result.started_at is not None and result.finished_at is not None
    assert result.finished_at > result.started_at


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_the_host_receives_the_snapshot_and_the_workspace_it_must_work_in() -> None:
    """A host never re-reads the requirement: it is handed the captured version."""
    host = FakeHost()
    seam = RequirementRunSeam(isolation=FakeIsolation(), host=host, clock=ticking())
    snapshot = snapshot_of()

    seam.start(
        snapshot=snapshot,
        isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"),
        prompt="implement it",
        agent="implementer",
        attempt=2,
    )

    launch = host.launches[0]
    assert launch.snapshot == snapshot
    assert launch.req_id == REQ
    assert launch.unit_id == UNIT
    assert launch.prompt == "implement it"
    assert launch.agent == "implementer"
    assert launch.attempt == 2
    assert launch.workspace.path.endswith("run-1")


@pytest.mark.unit
@verifies(SWR.SWR_3416, SWR.SWR_3216)
def test_a_finished_run_produces_the_boards_own_run_shape() -> None:
    """Headless or desktop, the projection reads exactly one shape (SWR-3216)."""
    seam = RequirementRunSeam(isolation=FakeIsolation(), host=FakeHost(), clock=ticking())
    snapshot = snapshot_of()

    view = seam.start(
        snapshot=snapshot,
        isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"),
    ).to_view()

    assert view.run_id == "run-1"
    assert view.unit_id == UNIT
    assert view.session_id == "20260814-abcdef"
    assert view.outcome is RunOutcome.SUCCEEDED
    assert view.snapshot is not None
    assert view.snapshot.requirement_hash == requirement().current_hash
    assert view.base_commit == "c0ffee1"
    assert view.branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3416/{UNIT}"
    assert view.worktree_path == "/tmp/wt/run-1"
    assert view.produced_commits == ("deadbee",)
    assert view.changed_files == ("src/rotaris_core/thing.py",)
    assert view.verified is True
    assert view.agent_summary == "did the thing"
    assert view.agent_claimed_complete
    assert view.address == "session:20260814-abcdef/run:run-1"


# -- the failure paths -----------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_an_isolation_failure_never_reaches_the_host() -> None:
    """No tree, no run — and the failure is a result, not an exception."""
    isolation = FakeIsolation(fail="worktree path already exists")
    host = FakeHost()
    seam = RequirementRunSeam(isolation=isolation, host=host, clock=ticking())

    result = seam.start(
        snapshot=snapshot_of(),
        isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"),
    )

    assert host.launches == []
    assert result.phases == (RunPhase.REQUESTED, RunPhase.FAILED)
    assert result.outcome is RunOutcome.FAILED
    assert result.workspace is None
    assert "worktree path already exists" in result.failure_reason
    assert result.to_view().worktree_path is None
    assert result.to_view().failure_reason == result.failure_reason


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_a_host_that_raises_leaves_the_worktree_to_be_inspected() -> None:
    """The evidence of a failed run is the tree it failed in (SWR-3405, SWR-3415)."""
    seam = RequirementRunSeam(
        isolation=FakeIsolation(),
        host=FakeHost(raises=RuntimeError("the model went away")),
        clock=ticking(),
    )

    result = seam.start(
        snapshot=snapshot_of(),
        isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"),
    )

    assert result.phases == (
        RunPhase.REQUESTED,
        RunPhase.ISOLATED,
        RunPhase.STARTED,
        RunPhase.FAILED,
    )
    assert result.outcome is RunOutcome.FAILED
    assert result.workspace is not None
    assert result.workspace.path == "/tmp/wt/run-1"
    assert result.failure_reason == "RuntimeError: the model went away"


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_a_reported_failure_is_carried_through_rather_than_raised() -> None:
    """A host that fails cleanly says so, and the seam records what it said."""
    seam = RequirementRunSeam(
        isolation=FakeIsolation(),
        host=FakeHost(
            RunReport(
                outcome=RunOutcome.FAILED,
                failure_reason="the check suite did not pass",
                agent_summary="I could not fix the last test",
            ),
        ),
        clock=ticking(),
    )

    result = seam.start(
        snapshot=snapshot_of(),
        isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"),
    )

    assert result.phases[-1] is RunPhase.FAILED
    assert result.outcome is RunOutcome.FAILED
    assert result.failure_reason == "the check suite did not pass"
    assert result.to_view().agent_summary == "I could not fix the last test"


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_a_run_report_describes_a_finished_run() -> None:
    """'Still running' is not an answer to 'what happened'."""
    for still_going in (RunOutcome.PENDING, RunOutcome.RUNNING):
        with pytest.raises(ValidationError, match="in flight"):
            RunReport(outcome=still_going)
    assert RunReport(outcome=RunOutcome.INTERRUPTED).outcome is RunOutcome.INTERRUPTED


# -- the snapshot is on disk before the agent is reached -------------------


@pytest.mark.unit
@verifies(SWR.SWR_3416, SWR.SWR_3402)
def test_the_snapshot_is_persisted_before_the_host_is_reached(tmp_path: Path) -> None:
    """Asserted from inside the host, which is the only moment that proves it."""
    store = SnapshotStore(tmp_path)
    found: list[bool] = []

    seam = RequirementRunSeam(
        isolation=FakeIsolation(),
        host=FakeHost(on_start=lambda launch: found.append(store.load(launch.run_id) is not None)),
        clock=ticking(),
        snapshots=store,
    )

    seam.start(snapshot=snapshot_of(), isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"))

    assert found == [True]


# -- the branch namespace --------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3416, SWR.SWR_3405)
def test_requirement_branches_cannot_collide_with_session_or_harness_worktrees() -> None:
    """A namespace of their own, and a Git-legal name in it."""
    from rotaris_core.session.worktrees import GitWorktreeService

    branch = unit_branch("SWR-3416", "swr-3416-impl-a1b2c3d4")

    assert branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3416/swr-3416-impl-a1b2c3d4"
    assert not branch.startswith("rotaris/session/")
    assert GitWorktreeService.sanitize_branch(branch) == branch
    assert REQUIREMENT_WORKTREE_SUBPATH.startswith("requirements/")

    # An id with characters Git refuses still yields a legal branch.
    awkward = unit_branch("PROJ/7", "unit one:two")
    assert GitWorktreeService.sanitize_branch(awkward) == awkward
    assert awkward == f"{REQUIREMENT_BRANCH_PREFIX}/proj-7/unit-one-two"

    # A retry gets its own branch, so the failed one stays inspectable.
    assert unit_branch(REQ, UNIT, attempt=2).endswith("-a2")
    assert unit_branch(REQ, UNIT, attempt=1) != unit_branch(REQ, UNIT, attempt=2)

    with pytest.raises(IsolationError, match="cannot derive a branch"):
        unit_branch("...", "***")


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_the_isolation_request_converts_to_the_session_layers_launch_request() -> None:
    """One conversion, so the two shapes cannot drift apart."""
    from rotaris_core.session.worktrees import WorktreeLaunchRequest

    request = IsolationRequest(branch="rotaris/req/x/y", path="/tmp/wt", session_id="run-1")
    launch = request.to_launch_request()

    assert isinstance(launch, WorktreeLaunchRequest)
    assert launch.branch == "rotaris/req/x/y"
    assert launch.session_id == "run-1"
    assert launch.create is True
    assert launch.path is not None
    assert launch.path.name == "wt"


# -- no desktop in the import graph ----------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3416)
def test_the_seam_pulls_in_neither_qt_nor_the_desktop_package() -> None:
    """Checked in a fresh interpreter, so nothing another test imported can hide it."""
    program = textwrap.dedent(
        """
        import sys
        import rotaris_core.requirements.execution as execution

        assert execution.RequirementRunSeam is not None
        offenders = sorted(
            name
            for name in sys.modules
            if name == "rotaris"
            or name.startswith(("rotaris.", "PySide6", "PyQt", "shiboken"))
        )
        print(",".join(offenders))
        """,
    )
    completed = subprocess.run(
        [sys.executable, "-c", program],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == ""


# -- headless, against a real repository -----------------------------------


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _repository(root: Path) -> Path:
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "base.txt").write_text("base\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


class CommittingHost:
    """A host that does what an agent would: change a file in its own worktree."""

    def __init__(self, filename: str = "unit.txt") -> None:
        self.filename = filename

    def start(self, launch: UnitLaunch) -> RunReport:
        worktree = launch.workspace.path
        target = f"{worktree}/{self.filename}"
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(f"{launch.req_id}/{launch.unit_id}\n")
        _git(_as_path(worktree), "add", self.filename)
        _git(_as_path(worktree), "commit", "-m", f"work for {launch.unit_id}")
        commit = _git(_as_path(worktree), "rev-parse", "HEAD").strip()
        return RunReport(
            outcome=RunOutcome.SUCCEEDED,
            session_id=launch.run_id,
            produced_commits=(commit,),
            changed_files=(self.filename,),
            verified=True,
            agent_summary="committed the unit's work",
            agent_claimed_complete=True,
        )


def _as_path(value: str) -> Path:
    from pathlib import Path as _Path

    return _Path(value)


def _desktop_modules() -> set[str]:
    return {
        name
        for name in sys.modules
        if name == "rotaris" or name.startswith(("rotaris.", "PySide6", "PyQt"))
    }


@pytest.fixture
def no_desktop_import() -> Iterator[None]:
    """Fails if the test body pulls the desktop package into the interpreter."""
    before = _desktop_modules()
    yield
    assert _desktop_modules() - before == set()


@pytest.mark.integration
@verifies(SWR.SWR_3416, SWR.SWR_3405)
def test_a_unit_run_starts_headlessly_and_produces_worktree_run_and_terminal_state(
    tmp_path: Path,
    no_desktop_import: None,
) -> None:
    """The acceptance criterion of the slice: a real run, no desktop, real Git."""
    base = _repository(tmp_path)
    head = _git(base, "rev-parse", "HEAD").strip()
    snapshot = snapshot_of(base_commit=head)

    seam = RequirementRunSeam(
        isolation=GitIsolation(base),
        host=CommittingHost(),
        clock=ticking(),
        snapshots=SnapshotStore(base),
    )

    result = seam.start(
        snapshot=snapshot,
        isolation_request=unit_isolation(REQ, UNIT, run_id=snapshot.run_id),
        agent="implementer",
    )

    assert result.outcome is RunOutcome.SUCCEEDED, result.failure_reason
    assert result.phases[-1] is RunPhase.FINISHED

    # A worktree of its own, in the requirement namespace …
    workspace = result.workspace
    assert workspace is not None
    worktree = _as_path(workspace.path)
    assert worktree.is_dir()
    assert worktree.parent == base / ".rotaris" / "requirements" / "worktrees"
    assert workspace.branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3416/{UNIT}"
    assert (worktree / "unit.txt").is_file()

    # … and the base checkout is untouched by the work.
    assert not (base / "unit.txt").exists()
    assert _git(base, "rev-parse", "HEAD").strip() == head
    assert _git(base, "branch", "--show-current").strip() == "main"

    # Terminal state, in the board's shape.
    view = result.to_view()
    assert view.outcome is RunOutcome.SUCCEEDED
    assert view.branch == workspace.branch
    assert view.worktree_path == workspace.path
    assert view.base_commit == head
    assert len(view.produced_commits) == 1
    assert view.produced_commits[0] != head
    assert view.snapshot is not None
    assert view.snapshot.requirement_hash == requirement().current_hash

    # And the snapshot the run worked against is on disk beside it.
    assert SnapshotStore(base).load(snapshot.run_id) is not None


@pytest.mark.integration
@verifies(SWR.SWR_3416, SWR.SWR_3405)
def test_two_units_of_one_requirement_get_two_branches_and_two_worktrees(
    tmp_path: Path,
    no_desktop_import: None,
) -> None:
    """Parallel units cannot land in each other's tree (SWR-3405, SWR-3406)."""
    base = _repository(tmp_path)
    head = _git(base, "rev-parse", "HEAD").strip()
    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="tests")))
    seam = RequirementRunSeam(
        isolation=GitIsolation(base),
        host=CommittingHost(),
        clock=ticking(),
    )

    results = [
        seam.start(
            snapshot=capture_snapshot(
                requirement(),
                run_id=f"run-{index}",
                base_commit=head,
                at=AT,
                unit_id=unit.unit_id,
            ),
            isolation_request=unit_isolation(REQ, unit.unit_id, run_id=f"run-{index}"),
        )
        for index, unit in enumerate(units.units, start=1)
    ]

    assert [result.outcome for result in results] == [RunOutcome.SUCCEEDED] * 2
    paths = {result.workspace.path for result in results if result.workspace is not None}
    branches = {result.workspace.branch for result in results if result.workspace is not None}
    assert len(paths) == 2
    assert len(branches) == 2
    assert all(branch.startswith(f"{REQUIREMENT_BRANCH_PREFIX}/swr-3416/") for branch in branches)
    assert not (base / "unit.txt").exists()
    assert _git(base, "rev-parse", "HEAD").strip() == head


@pytest.mark.integration
@verifies(SWR.SWR_3416)
def test_a_repository_that_cannot_host_a_worktree_fails_the_run_not_the_caller(
    tmp_path: Path,
) -> None:
    """A directory that is not a repository is a failed run with a stated reason."""
    seam = RequirementRunSeam(
        isolation=GitIsolation(tmp_path),
        host=FakeHost(),
        clock=ticking(),
    )

    result = seam.start(
        snapshot=snapshot_of(),
        isolation_request=unit_isolation(REQ, UNIT, run_id="run-1"),
    )

    assert result.outcome is RunOutcome.FAILED
    assert result.workspace is None
    assert result.failure_reason
    assert result.phases == (RunPhase.REQUESTED, RunPhase.FAILED)
