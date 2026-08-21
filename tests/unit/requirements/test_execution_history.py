"""Productive use: months after a requirement was delivered, someone asks which runs touched
it, in which worktree, on which branch, producing which commits — and why the two that
failed did.
Expected outcome: a run's record exists before the agent starts and is completed when it
ends; failed and abandoned runs are retained with their reasons; removing the worktree or
deleting the branch leaves the record untouched; and the history answers "which commits
carry this requirement's implementation" without confusing them with a failed run's."""

from __future__ import annotations

import datetime as dt
import json

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import CheckOutcome, RunOutcome
from rotaris_core.requirements.execution.history import (
    ExecutionHistory,
    HistoryError,
    RequirementHistory,
    RunRecord,
    run_history_filename,
)
from rotaris_core.requirements.execution.run_seam import (
    IsolationRequest,
    RunReport,
    RunResult,
    RunWorkspace,
)
from rotaris_core.requirements.execution.snapshot import RunSnapshot, capture_snapshot
from rotaris_core.requirements.model import CanonicalRequirement

pytestmark = pytest.mark.unit

REQ = "SWR-3414"
UNIT = "swr-3414-impl"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 9, 30, tzinfo=dt.UTC)
SECRET_TEXT = "every unit run is recorded with its unit, snapshot and session id"


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Execution history per requirement",
        description=SECRET_TEXT,
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
        source_revision="rev-7",
    )


def snapshot_of(*, run_id: str = "run-1", unit_id: str = UNIT) -> RunSnapshot:
    return capture_snapshot(
        requirement(),
        run_id=run_id,
        base_commit="base0001",
        at=AT,
        unit_id=unit_id,
        session_id="20260814-abcdef",
    )


def result_of(
    *,
    run_id: str = "run-1",
    unit_id: str = UNIT,
    outcome: RunOutcome = RunOutcome.SUCCEEDED,
    commits: tuple[str, ...] = ("commit-a",),
    path: str = "/tmp/wt/run-1",
    reason: str = "",
    attempt: int = 1,
) -> RunResult:
    workspace = RunWorkspace(path=path, branch=f"rotaris/req/swr-3414/{unit_id}")
    return RunResult(
        run_id=run_id,
        req_id=REQ,
        unit_id=unit_id,
        snapshot=snapshot_of(run_id=run_id, unit_id=unit_id),
        isolation=IsolationRequest(branch=workspace.branch, session_id=run_id),
        workspace=workspace,
        report=RunReport(
            outcome=outcome,
            produced_commits=commits,
            changed_files=("src/rotaris_core/requirements/execution/history.py",),
            verified=outcome is RunOutcome.SUCCEEDED,
            verification_detail="1 check(s) passed",
            checks=(CheckOutcome(name="pytest", status="passed"),),
            failure_reason=reason,
            agent_summary="wrote the history store",
            agent_claimed_complete=outcome is RunOutcome.SUCCEEDED,
        ),
        started_at=AT,
        finished_at=LATER,
        attempt=attempt,
        failure_reason=reason,
    )


# -- the record precedes the run --------------------------------------------


@verifies(SWR.SWR_3414)
def test_a_records_exists_before_the_run_starts(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)

    opened = history.open(snapshot_of(), agent="coding-agent")

    assert opened.outcome is RunOutcome.RUNNING
    assert opened.in_flight
    assert opened.base_commit == "base0001"
    assert opened.requirement_hash == requirement().current_hash
    stored = history.load(REQ)
    assert stored.run_ids == ("run-1",)
    assert stored.in_flight == (opened,)


@verifies(SWR.SWR_3414)
def test_completing_a_run_supersedes_its_opening_record(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.open(snapshot_of())

    history.complete(result_of())

    stored = history.load(REQ)
    assert stored.run_ids == ("run-1",), "one run, not two"
    record = stored.get("run-1")
    assert record is not None
    assert record.succeeded
    assert record.produced_commits == ("commit-a",)
    assert record.duration_s == 1800.0


@verifies(SWR.SWR_3414)
def test_the_history_survives_a_process_boundary(tmp_path) -> None:  # noqa: ANN001
    ExecutionHistory(tmp_path).open(snapshot_of())
    ExecutionHistory(tmp_path).complete(result_of())

    assert ExecutionHistory(tmp_path).load(REQ).succeeded[0].run_id == "run-1"


# -- failures are retained ---------------------------------------------------


@verifies(SWR.SWR_3414)
def test_failed_runs_are_retained_with_their_reason(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(
        result_of(
            run_id="run-1",
            outcome=RunOutcome.FAILED,
            commits=(),
            reason="the provider went down",
        ),
    )
    history.complete(result_of(run_id="run-2", attempt=2))

    stored = history.load(REQ)
    assert stored.run_ids == ("run-1", "run-2")
    assert [one.run_id for one in stored.failed] == ["run-1"]
    assert stored.failed[0].failure_reason == "the provider went down"
    assert "the provider went down" in stored.failed[0].message


@verifies(SWR.SWR_3414)
def test_a_failed_record_without_a_reason_cannot_be_written() -> None:
    with pytest.raises(HistoryError, match="states its reason"):
        RunRecord(run_id="run-1", req_id=REQ, outcome=RunOutcome.FAILED)


@verifies(SWR.SWR_3414)
def test_a_run_that_ended_without_a_reason_still_gets_one(tmp_path) -> None:  # noqa: ANN001
    """A failed run must be readable even when the host said nothing."""
    history = ExecutionHistory(tmp_path)

    record = history.complete(
        result_of(outcome=RunOutcome.ABANDONED, commits=(), reason=""),
    )

    assert record.failure_reason
    assert "abandoned" in record.failure_reason


# -- the record outlives the worktree ---------------------------------------


@verifies(SWR.SWR_3414)
def test_removing_the_worktree_does_not_remove_the_record(tmp_path) -> None:  # noqa: ANN001
    worktree = tmp_path / "trees" / "run-1"
    worktree.mkdir(parents=True)
    (worktree / "file.txt").write_text("work", encoding="utf-8")
    history = ExecutionHistory(tmp_path / "workspace")
    history.complete(result_of(path=str(worktree)))

    (worktree / "file.txt").unlink()
    worktree.rmdir()

    assert not worktree.exists()
    stored = history.load(REQ)
    assert stored.worktrees == (str(worktree),)
    assert stored.branches == (f"rotaris/req/swr-3414/{UNIT}",)
    assert stored.get("run-1") is not None


@verifies(SWR.SWR_3414)
def test_the_history_lives_outside_every_worktree(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)

    path = history.path_for(REQ)

    assert path.parent == tmp_path / ".rotaris" / "requirements" / "runs"
    assert path.name == run_history_filename(REQ)


# -- the questions it answers ------------------------------------------------


@verifies(SWR.SWR_3414)
def test_the_history_answers_which_commits_carry_the_implementation(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(
        result_of(
            run_id="run-1",
            outcome=RunOutcome.FAILED,
            commits=("half-done",),
            reason="the suite failed",
        ),
    )
    history.complete(result_of(run_id="run-2", commits=("commit-a", "commit-b"), attempt=2))

    stored = history.load(REQ)
    assert stored.implementation_commits == ("commit-a", "commit-b")
    assert stored.commits() == ("half-done", "commit-a", "commit-b")


@verifies(SWR.SWR_3414)
def test_the_history_is_queryable_per_unit(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(result_of(run_id="run-1", unit_id="unit-a"))
    history.complete(result_of(run_id="run-2", unit_id="unit-b"))
    history.complete(result_of(run_id="run-3", unit_id="unit-a", attempt=2))

    assert [one.run_id for one in history.for_unit(REQ, "unit-a")] == ["run-1", "run-3"]
    assert history.load(REQ).attempts_of("unit-a") == 2
    assert set(history.load(REQ).views_by_unit()) == {"unit-a", "unit-b"}


@verifies(SWR.SWR_3414)
def test_a_record_becomes_the_run_the_board_reads(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(result_of())

    view = history.load(REQ).to_views()[0]

    assert view.run_id == "run-1"
    assert view.branch == f"rotaris/req/swr-3414/{UNIT}"
    assert view.outcome is RunOutcome.SUCCEEDED
    assert view.snapshot is not None
    assert view.snapshot.requirement_hash == requirement().current_hash
    assert view.checks[0].name == "pytest"


@verifies(SWR.SWR_3414)
def test_the_summary_counts_runs_failures_and_commits(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(result_of(run_id="run-1", outcome=RunOutcome.FAILED, commits=(), reason="x"))
    history.complete(result_of(run_id="run-2"))

    assert history.load(REQ).summary == f"{REQ}: 2 run(s), 1 failed, 1 commit(s)"


@verifies(SWR.SWR_3414)
def test_a_requirement_that_never_ran_has_an_empty_history(tmp_path) -> None:  # noqa: ANN001
    stored = ExecutionHistory(tmp_path).load("SWR-9999")

    assert stored.empty
    assert stored.implementation_commits == ()
    assert stored.last is None


# -- what the file may and may not contain ----------------------------------


@verifies(SWR.SWR_3414)
def test_the_history_stores_no_requirement_text(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.open(snapshot_of())
    history.complete(result_of())

    raw = history.path_for(REQ).read_text(encoding="utf-8")

    assert SECRET_TEXT not in raw
    assert "Execution history per requirement" not in raw
    for line in raw.splitlines():
        payload = json.loads(line)
        assert "title" not in payload
        assert "description" not in payload


@verifies(SWR.SWR_3414)
def test_an_unreadable_line_costs_only_its_own_run(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(result_of(run_id="run-1"))
    with history.path_for(REQ).open("a", encoding="utf-8") as handle:
        handle.write("{not json at all\n")
        handle.write(
            json.dumps({"schema_version": 99, "run_id": "run-future", "req_id": REQ}) + "\n"
        )
    history.complete(result_of(run_id="run-2"))

    stored = history.load(REQ)

    assert stored.run_ids == ("run-1", "run-2")


@verifies(SWR.SWR_3414)
def test_the_store_names_every_requirement_it_holds_runs_for(tmp_path) -> None:  # noqa: ANN001
    history = ExecutionHistory(tmp_path)
    history.complete(result_of())

    assert history.req_ids() == (REQ,)


@verifies(SWR.SWR_3414)
def test_a_record_round_trips_through_its_payload() -> None:
    record = RunRecord.of_result(result_of(), agent="coding-agent")

    assert RunRecord.from_payload(record.to_payload()) == record


@verifies(SWR.SWR_3414)
def test_a_history_keeps_the_order_runs_started() -> None:
    records = (
        RunRecord.opening(snapshot_of(run_id="run-1")),
        RunRecord.opening(snapshot_of(run_id="run-2")),
        RunRecord.of_result(result_of(run_id="run-1")),
    )

    stored = RequirementHistory.of(REQ, records)

    assert stored.run_ids == ("run-1", "run-2")
    first = stored.get("run-1")
    assert first is not None
    assert first.succeeded, "the newest state of a run wins, its position does not move"
