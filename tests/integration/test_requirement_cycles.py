"""Productive use: a team releases a requirement, Rotaris delivers it, the review says it is
not right, and the team releases the very same requirement again. The second delivery has to
happen without the first one being erased — the branches, the commits and the runs of the
first attempt are what the team is comparing against.
Expected outcome: both deliveries run end to end over a real checkout; the first delivery's
runs are still reported after the second delivery has saved; the run history says which
delivery each run belongs to; the board shows the second delivery's units with only the
second delivery's runs and says which delivery it is; and a worktree that Windows refuses on
path length reaches the run's failure reason in Rotaris' words rather than Git's."""

from __future__ import annotations

import datetime as dt
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import RunOutcome
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.flow import (
    FlowProgress,
    FlowStage,
    FlowStateStore,
    RequirementFlow,
)
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.reader import WorkspaceExecution
from rotaris_core.requirements.execution.run_seam import (
    GitIsolation,
    IsolationError,
    RequirementRunSeam,
    RunReport,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, SnapshotStore
from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.session.worktrees import GitWorktreeService

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.requirements.execution.run_seam import UnitLaunch

pytestmark = pytest.mark.integration

REQ = "SWR-3417"
AT = dt.datetime(2026, 8, 15, 9, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")


def git(cwd: Path, *args: str) -> str:
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


def repository(root: Path) -> Path:
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "base.txt").write_text("base\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-m", "initial")
    return root


def requirement() -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=REQ,
        title="One identity per delivery cycle",
        description="A requirement can be delivered more than once.",
        source_id="specs",
        source_path=f"docs/requirements/{REQ}.md",
        source_revision="rev-1",
    )


def ticking(start: dt.datetime = AT) -> Callable[[], dt.datetime]:
    counter = iter(range(100_000))
    return lambda: start + dt.timedelta(seconds=next(counter))


class CommittingHost:
    """A host that does what an agent does: change a file in its own worktree."""

    def __init__(self) -> None:
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        tree = Path(launch.workspace.path)
        (tree / "unit.txt").write_text(f"{launch.run_id}\n", encoding="utf-8")
        git(tree, "add", "unit.txt")
        git(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"work for {launch.unit_id}",
        )
        return RunReport(
            outcome=RunOutcome.SUCCEEDED,
            session_id=launch.run_id,
            produced_commits=(git(tree, "rev-parse", "HEAD").strip(),),
            changed_files=("unit.txt",),
            verified=True,
            verification_detail="1 check(s) passed",
            agent_summary="committed the unit's work",
            agent_claimed_complete=True,
        )


def writer(base: Path) -> ExecutionTransitions:
    """The one writer a run may use (SWR-3403, SWR-3213)."""
    return ExecutionTransitions.for_workspace(base, current_for=lambda _: requirement())


def release(base: Path, *, at: dt.datetime = AT, reason: str = "") -> None:
    """Put the requirement on Ready — the only thing a user does to start a delivery."""
    outcome = writer(base).apply(
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=at,
            reason=reason,
        ),
    )
    assert outcome.accepted, outcome.message


def flow_over(base: Path, host: object) -> RequirementFlow:
    return RequirementFlow(
        transitions=writer(base),
        seam=RequirementRunSeam(
            isolation=GitIsolation(base),
            host=host,  # type: ignore[arg-type]
            clock=ticking(),
            snapshots=SnapshotStore(base),
        ),
        current_for=lambda _: requirement(),
        history=ExecutionHistory(base),
        clock=ticking(),
        progress=FlowStateStore(base),
        units=UnitStore(base),
        integrations=IntegrationLog(base),
    )


@verifies(SWR.SWR_3417, SWR.SWR_3401, SWR.SWR_3414)
def test_two_deliveries_of_one_requirement_both_keep_their_runs(tmp_path: Path) -> None:
    """The defect this requirement exists for: the second delivery used to erase the first."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()
    units_store = UnitStore(base)
    history = ExecutionHistory(base)

    # ── first delivery ────────────────────────────────────────────────────
    release(base)
    first = flow_over(base, host).start(requirement(), base_commit=head)

    assert first.succeeded, first.message
    assert first.final_state is DeliveryState.REVIEW
    after_first = units_store.load(REQ)
    assert after_first.cycle == 0
    assert after_first.run_ids == first.run_ids
    assert after_first.complete

    # ── the review sends it back, and the team releases it again ──────────
    release(
        base,
        at=AT + dt.timedelta(hours=1),
        reason="the reviewer wants it done again",
    )
    second = flow_over(base, host).start(requirement(), base_commit=head)

    assert second.succeeded, second.message
    assert second.run_ids != first.run_ids, "a second delivery is not the first one's runs"

    # The unit set on disk, after the second delivery has written it several times.
    stored = units_store.load(REQ)
    assert stored.cycle == 1
    assert stored.cycles == (0, 1)
    assert stored.ids == after_first.ids, "the same slices of work, minted the same way"
    assert stored.run_ids_of(0) == first.run_ids, (
        "the first delivery's runs survived every save the second delivery made"
    )
    assert stored.run_ids_of(1) == second.run_ids
    assert set(first.run_ids) <= set(stored.run_ids)

    # ── the history tells the two deliveries apart ────────────────────────
    recorded = history.load(REQ)
    assert recorded.cycles == (0, 1)
    assert [record.run_id for record in recorded.for_cycle(0)] == list(first.run_ids)
    assert [record.run_id for record in recorded.for_cycle(1)] == list(second.run_ids)
    unit_id = stored.ids[0]
    assert len(recorded.for_unit(unit_id)) == 2, "one slice of work, delivered twice"
    assert len(recorded.for_unit(unit_id, cycle=1)) == 1

    # Two deliveries, two branches — the second never landed on the first's.
    branches = [launch.workspace.branch for launch in host.launches]
    assert len(set(branches)) == 2
    assert branches[1].endswith("-c2")
    assert all(name in git(base, "branch", "--list", "rotaris/req/*") for name in branches)

    # Nothing was written into the base checkout, either time (SWR-3405).
    assert git(base, "rev-parse", "HEAD").strip() == head
    assert git(base, "status", "--porcelain").strip() == ""


@verifies(SWR.SWR_3417, SWR.SWR_3611)
def test_a_crash_after_the_last_unit_resumes_instead_of_delivering_again(
    tmp_path: Path,
) -> None:
    """Productive use: the machine dies after the last unit committed, before the
    flow could finalise the delivery, and the user starts Rotaris again.

    Expected outcome: the interrupted delivery is resumed and finished. It is
    NOT treated as a second delivery — re-running every unit would throw away
    work already sitting on a branch, which is the one thing SWR-3611 exists to
    prevent.

    "Every unit finished" looks identical whether the delivery ended or merely
    stopped, so the unit set alone cannot tell them apart. The progress store
    can: it is cleared on success, so progress left behind means the previous
    attempt did not reach the end.
    """
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()
    units_store = UnitStore(base)
    progress = FlowStateStore(base)

    release(base)
    first = flow_over(base, host).start(requirement(), base_commit=head)
    assert first.succeeded, first.message
    delivered = units_store.load(REQ)
    assert delivered.complete and delivered.cycle == 0
    launched_once = len(host.launches)

    # The crash, reconstructed: every unit finished on disk, and the progress the
    # dying process wrote is still there because clearing it is the last thing a
    # successful flow does. Recovery puts the requirement back on Ready, which is
    # where a restart finds it — the flow is what moves it into Running, so the
    # state a restart sees is Ready, not the Running it died in.
    release(base, at=AT + dt.timedelta(hours=1), reason="picked back up after the crash")
    progress.save(
        FlowProgress(
            req_id=REQ,
            cycle=0,
            completed=(FlowStage.DECOMPOSITION,),
            finished_units=delivered.ids,
            unit_runs=dict(zip(delivered.ids, first.run_ids, strict=False)),
        ),
    )

    resumed = flow_over(base, host).start(requirement(), base_commit=head)

    assert resumed.succeeded, resumed.message
    stored = units_store.load(REQ)
    assert stored.cycle == 0, "an interrupted delivery resumed as a second delivery"
    assert stored.cycles == (0,), "a crash must not open a delivery cycle"
    assert len(host.launches) == launched_once, (
        "work already on a branch was run again instead of being recovered"
    )
    assert stored.run_ids_of(0) == first.run_ids


@verifies(SWR.SWR_3417, SWR.SWR_3216)
def test_the_board_shows_the_second_delivery_and_says_that_is_what_it_is(
    tmp_path: Path,
) -> None:
    """The wiring: the cycle reaches a rendered line with no surface change at all."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()

    release(base)
    first = flow_over(base, host).start(requirement(), base_commit=head)
    assert first.succeeded, first.message

    release(base, at=AT + dt.timedelta(hours=1))
    second = flow_over(base, host).start(requirement(), base_commit=head)
    assert second.succeeded, second.message

    summary = WorkspaceExecution(base).execution_for(REQ)

    assert [view.cycle for view in summary.units] == [1]
    unit = summary.units[0]
    assert "delivery cycle 2" in unit.summary
    # The runs hanging off the unit are this delivery's — the first delivery's
    # are still in the requirement's history, under their own cycle.
    assert [run.run_id for run in unit.runs] == list(second.run_ids)
    assert {run.cycle for run in unit.runs} == {1}
    assert set(first.run_ids) <= {run.run_id for run in summary.runs}
    assert {run.cycle for run in summary.runs} == {0, 1}


@verifies(SWR.SWR_3418, SWR.SWR_3405)
def test_a_path_windows_refuses_reaches_the_run_in_rotaris_words(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The message a user actually reads is about their workspace, not about Git."""
    base = repository(tmp_path)
    refusal = (
        "error: unable to create file docs/requirements/very/deep/path.md: Filename too long\n"
        "fatal: could not create work tree dir"
    )
    real = GitWorktreeService._git_result

    def refusing(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
        if args[0] == "worktree":
            return subprocess.CompletedProcess(args=list(args), returncode=128, stderr=refusal)
        return real(cwd, *args)

    monkeypatch.setattr(GitWorktreeService, "_git_result", staticmethod(refusing))

    with pytest.raises(IsolationError) as failed:
        GitIsolation(base).provide(unit_isolation(REQ, "impl", run_id="run-1"))

    stated = str(failed.value)
    assert "longer than Windows allows (260 characters)" in stated
    assert "git config --global core.longpaths true" in stated
    assert str(base.resolve()) in stated
    assert "Filename too long" in stated, "Git's own words are still there, as the detail"
    assert not stated.startswith("error: unable to create file")


@verifies(SWR.SWR_3418)
def test_the_translated_failure_becomes_the_runs_stated_reason(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """It has to survive the whole seam, or the user still reads Git's sentence."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    refusal = "error: unable to create file a/b/c.md: Filename too long"
    real = GitWorktreeService._git_result

    def refusing(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
        if args[0] == "worktree":
            return subprocess.CompletedProcess(args=list(args), returncode=128, stderr=refusal)
        return real(cwd, *args)

    monkeypatch.setattr(GitWorktreeService, "_git_result", staticmethod(refusing))

    release(base)
    result = flow_over(base, CommittingHost()).start(requirement(), base_commit=head)

    assert not result.succeeded
    assert "longer than Windows allows (260 characters)" in result.reason
    assert "core.longpaths" in result.reason
    stored = ExecutionHistory(base).load(REQ)
    assert stored.failed, "the failed run is retained, with its reason (SWR-3414)"
    assert "longer than Windows allows" in stored.failed[-1].failure_reason
    assert DeliveryStore(base).read(REQ).state is DeliveryState.BLOCKED
