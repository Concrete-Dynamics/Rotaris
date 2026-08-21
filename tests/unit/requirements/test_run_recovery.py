"""Productive use: a flow is killed — the window is closed, the machine reboots, the
process crashes — while a requirement is in ``Running``. Rotaris is opened again.
Expected outcome: the pass that runs on every board read closes the run nobody owns as
interrupted, keeping its worktree and its branch, moves the requirement out of ``Running``
with a stated reason, and leaves alone every run that is still alive, still young, or
still being driven by this very process (SWR-3611)."""

from __future__ import annotations

import datetime as dt
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
from rotaris_core.requirements.execution.history import ExecutionHistory, RunRecord
from rotaris_core.requirements.execution.recovery import (
    ABANDONED_AFTER,
    reconcile_abandoned_runs,
)
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 21, 14, 0, tzinfo=dt.UTC)
REQ = "SWR-4301"
LONG_AGO = NOW - dt.timedelta(hours=2)


def _requirement(req_id: str) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
    )


INDEX = RequirementIndex(requirements=(_requirement(REQ),), generation=1)


def _released_and_running(root: Path, *, at: dt.datetime = LONG_AGO) -> None:
    """A requirement a flow moved into ``Running`` and never moved out of.

    Written through the real transition matrix, so what the pass finds is what a
    flow that died would actually have left behind.
    """
    writer = ExecutionTransitions.for_workspace(root, current_for=INDEX.requirement)
    for offset, (state, cause) in enumerate(
        (
            (DeliveryState.READY, TransitionCause.USER_ACTION),
            (DeliveryState.RUNNING, TransitionCause.RUN_STARTED),
        ),
    ):
        outcome = writer.apply(
            TransitionRequest(
                req_id=REQ,
                target=state,
                actor=DeliveryActor.system("requirement-flow"),
                cause=cause,
                at=at + dt.timedelta(seconds=offset),
                requirement_hash="hash-now",
            ),
        )
        assert outcome.accepted, outcome.message


def _open_run(
    root: Path,
    *,
    run_id: str = "run-1",
    session_id: str | None = None,
    started_at: dt.datetime = LONG_AGO,
) -> RunRecord:
    """A run record as ``history.open`` leaves one: in flight, nothing finished."""
    return ExecutionHistory(root).append(
        RunRecord(
            run_id=run_id,
            req_id=REQ,
            unit_id="unit-1",
            session_id=session_id,
            worktree_path=f".rotaris/worktrees/{REQ}-unit-1",
            branch=f"feat/{REQ.lower()}-unit-1",
            base_commit="a1b2c3d",
            changed_files=("src/importer.py",),
            outcome=RunOutcome.RUNNING,
            started_at=started_at,
        ),
    )


def _reconcile(root: Path, **kwargs: object) -> tuple[str, ...]:
    return reconcile_abandoned_runs(
        root,
        current_for=INDEX.requirement,
        at=NOW,
        **kwargs,  # type: ignore[arg-type]
    )


@verifies(SWR.SWR_3611)
def test_a_run_whose_process_is_gone_is_closed_and_its_requirement_freed(tmp_path: Path) -> None:
    """Productive use: the exact state a killed flow leaves behind.
    Expected outcome: one sentence naming the requirement, a terminal run record
    that still carries its worktree and branch, and a delivery state a person can
    act on rather than one that claims work is in flight."""
    _released_and_running(tmp_path)
    _open_run(tmp_path)

    freed = _reconcile(tmp_path)

    assert len(freed) == 1
    assert REQ in freed[0]
    assert "Running" in freed[0] and "Blocked" in freed[0]

    record = ExecutionHistory(tmp_path).load(REQ).get("run-1")
    assert record is not None
    assert record.outcome is RunOutcome.INTERRUPTED
    assert record.in_flight is False
    assert record.failure_reason.strip(), "an interrupted run states what stopped it"
    assert record.finished_at == NOW
    # SWR-3611's second criterion: the work itself is untouched.
    assert record.worktree_path == f".rotaris/worktrees/{REQ}-unit-1"
    assert record.branch == f"feat/{REQ.lower()}-unit-1"
    assert record.changed_files == ("src/importer.py",)

    delivery = DeliveryStore(tmp_path).read(REQ).delivery
    assert delivery.state is DeliveryState.BLOCKED
    assert "process is gone" in delivery.blocked_reason
    assert delivery.changed_by.kind.value == "system"
    assert delivery.cause is TransitionCause.RUN_FAILED


@verifies(SWR.SWR_3611)
def test_a_second_pass_over_a_recovered_workspace_writes_nothing(tmp_path: Path) -> None:
    """Productive use: the board evaluates on every refresh, not once at startup.
    Expected outcome: the correction happens once. A pass that re-blocked an
    already-blocked requirement would append an audit record per refresh and bury
    the trail under its own noise."""
    _released_and_running(tmp_path)
    _open_run(tmp_path)
    assert _reconcile(tmp_path)

    before = ExecutionHistory(tmp_path).path_for(REQ).read_text(encoding="utf-8")

    assert _reconcile(tmp_path) == ()
    assert ExecutionHistory(tmp_path).path_for(REQ).read_text(encoding="utf-8") == before


@verifies(SWR.SWR_3611)
def test_a_run_whose_session_is_alive_is_left_entirely_alone(tmp_path: Path) -> None:
    """Productive use: a run that has been going for hours is still a run.
    Expected outcome: nothing is closed and nothing is moved, however old the
    record is — age is not evidence of death when something is answering."""
    _released_and_running(tmp_path)
    _open_run(tmp_path, session_id="session-1")

    assert _reconcile(tmp_path, is_live=lambda session_id: session_id == "session-1") == ()

    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.RUNNING
    assert ExecutionHistory(tmp_path).load(REQ).in_flight != ()


@verifies(SWR.SWR_3611)
def test_a_flow_this_process_is_running_is_never_considered(tmp_path: Path) -> None:
    """Productive use: the board refreshes while this very Rotaris drives a flow.
    Expected outcome: the requirement its own scheduler is running is not examined
    at all — the one fact that settles it, before any probe or timeout."""
    _released_and_running(tmp_path)
    _open_run(tmp_path)

    assert _reconcile(tmp_path, running_here=(REQ,)) == ()

    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.RUNNING


@verifies(SWR.SWR_3611)
def test_a_run_that_started_moments_ago_is_given_its_grace(tmp_path: Path) -> None:
    """Productive use: a run record exists before the agent's session does.
    Expected outcome: a young run with nothing to probe is left alone, and the
    same run is corrected once the margin has passed — so the window between
    "opened" and "has a session" cannot be mistaken for death."""
    _released_and_running(tmp_path, at=NOW - dt.timedelta(seconds=30))
    _open_run(tmp_path, started_at=NOW - dt.timedelta(seconds=30))

    assert _reconcile(tmp_path) == ()
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.RUNNING

    later = reconcile_abandoned_runs(
        tmp_path,
        current_for=INDEX.requirement,
        at=NOW + ABANDONED_AFTER + dt.timedelta(minutes=1),
    )

    assert len(later) == 1
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.BLOCKED


@verifies(SWR.SWR_3611)
def test_a_requirement_stranded_before_its_first_run_record_is_freed(tmp_path: Path) -> None:
    """Productive use: the process died during the snapshot or the decomposition.
    Expected outcome: the requirement is freed even though no run was ever opened
    for it — "nothing is running this" is the fact, and an empty history is the
    strongest possible form of it."""
    _released_and_running(tmp_path)

    freed = _reconcile(tmp_path)

    assert len(freed) == 1
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.BLOCKED


@verifies(SWR.SWR_3611)
def test_a_flow_that_started_moments_ago_is_given_its_grace(tmp_path: Path) -> None:
    """Productive use: the board refreshes in the second after a release, while the
    flow is still snapshotting and has opened no run record yet.
    Expected outcome: nothing is freed. The delivery's own move into ``Running`` is
    the sign of life for the one window a run record cannot cover, and a pass that
    measured only run records would close a flow that began a second ago — the
    board's own audit would then read `ready → running` and `running → blocked`
    less than a second apart."""
    _released_and_running(tmp_path, at=NOW - dt.timedelta(seconds=1))

    assert _reconcile(tmp_path) == ()
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.RUNNING

    later = reconcile_abandoned_runs(
        tmp_path,
        current_for=INDEX.requirement,
        at=NOW + ABANDONED_AFTER + dt.timedelta(minutes=1),
    )

    assert len(later) == 1, "the same flow is freed once nothing has touched it for the margin"
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.BLOCKED


@verifies(SWR.SWR_3611)
def test_a_requirement_that_is_not_running_is_never_touched(tmp_path: Path) -> None:
    """Productive use: the overwhelmingly common board read, over a quiet workspace.
    Expected outcome: nothing at all — a pass that moved a Ready or a Done
    requirement would be a board rewriting states nobody asked it to."""
    writer = ExecutionTransitions.for_workspace(tmp_path, current_for=INDEX.requirement)
    outcome = writer.apply(
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.READY,
            actor=DeliveryActor.user("dvf"),
            cause=TransitionCause.USER_ACTION,
            at=LONG_AGO,
            requirement_hash="hash-now",
        ),
    )
    assert outcome.accepted

    assert _reconcile(tmp_path) == ()

    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.READY
