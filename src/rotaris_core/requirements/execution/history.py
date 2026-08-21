"""Every run a requirement ever had, including the ones that failed (SWR-3414).

Auditability (SWR-3213) records what Rotaris *decided*. This records what it
*ran*: which runs touched a requirement, in which worktree, on which branch, from
which base commit, producing which commits, with which verification outcome and
which terminal state — and it keeps the failures, because a history with only the
successes cannot answer why a requirement took four attempts.

```text
history.open(...)      ─▶ a record exists BEFORE the agent starts (outcome: running)
        │                  crash here and the run is still on the board
        ▼
history.complete(result) ─▶ the same run_id, terminal, with its reason if it failed
        │
        ▼
history.load(req_id)   ─▶ RequirementHistory ─┬─ .for_unit(...)     per unit
                                              ├─ .failed            retained, with reasons
                                              └─ .implementation_commits (SWR-3414)
```

Four properties are load-bearing:

- **The record precedes the run.** :meth:`ExecutionHistory.open` writes before
  the host is reached, so a process that dies mid-run leaves a record saying a run
  was in flight rather than leaving no trace at all (SWR-3611 reads exactly
  those).
- **A failure is retained, with its reason.** :class:`RunRecord` refuses to be
  terminal-and-unsuccessful without a stated ``failure_reason``, so "it failed,
  no idea why" is not representable.
- **It outlives the worktree.** The file lives under
  ``<workspace>/.rotaris/requirements/runs/``, never inside the run's own tree, so
  removing the worktree or deleting the branch changes nothing about the history.
  The branch and path stay recorded as *what was used*, which is the only honest
  answer once they are gone.
- **It keeps the deliveries apart.** A requirement can be delivered more than
  once, and the second delivery re-plans the same unit ids on purpose
  (SWR-3417) — so every record carries the delivery ``cycle`` it belongs to, and
  :attr:`RequirementHistory.cycles`, :meth:`RequirementHistory.for_cycle` and the
  ``cycle=`` argument of the per-unit queries let a reader ask what each delivery
  did rather than reading one merged pile.
- **It answers the commit question.**
  :attr:`RequirementHistory.implementation_commits` is "which commits carry this
  requirement's implementation" — the succeeded runs' commits, in run order,
  de-duplicated. Failed runs' commits are reachable separately
  (:meth:`RequirementHistory.commits`) and never confused with them.

Append-only, one file per requirement, one JSON line per write — the same shape
:class:`~rotaris_core.requirements.delivery.audit.AuditStore` uses, for the same
reason: two runs finishing at once append two lines and cannot lose each other.
A run's later line supersedes its earlier one on read, which is how ``open`` and
``complete`` describe one run rather than two.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import json
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, JsonValue, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import (
    CheckOutcome,
    RunOutcome,
    RunSnapshotView,
    RunView,
)
from rotaris_core.requirements.delivery.store import (
    assert_no_requirement_content,
    record_filename,
)
from rotaris_core.requirements.tombstones import requirements_state_dir

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping
    from pathlib import Path

    from rotaris_core.requirements.execution.run_seam import RunResult
    from rotaris_core.requirements.execution.snapshot import RunSnapshot

__all__ = [
    "RUN_HISTORY_SCHEMA_VERSION",
    "RUN_HISTORY_SUBDIRNAME",
    "ExecutionHistory",
    "HistoryError",
    "RequirementHistory",
    "RunRecord",
    "run_history_filename",
]

#: Stamped on every line this build appends. A line written by a newer version is
#: skipped rather than reinterpreted, exactly as the delivery store does.
RUN_HISTORY_SCHEMA_VERSION = 1

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding run histories.
RUN_HISTORY_SUBDIRNAME = "runs"


class HistoryError(RuntimeError):
    """A run record could not be described, written or read coherently."""


@traces(SWR.SWR_3414)
class RunRecord(BaseModel):
    """One unit run, from before it started to after it ended.

    Everything SWR-3414 lists is a field here, and the ones that make it *usable
    after the fact* — the branch, the worktree, the base commit — are kept even
    when the tree they name is gone. A record that dropped them once the worktree
    was removed would answer "where did this work happen" with silence.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    unit_id: str | None = None
    #: Which delivery of the requirement this run belongs to, counted from zero
    #: (SWR-3417). A requirement delivered twice re-plans the same unit ids on
    #: purpose, so ``unit_id`` alone can no longer separate "the run that built
    #: it" from "the run that built it again"; this can.
    cycle: int = 0
    #: The specification version the run worked against (SWR-3402).
    requirement_hash: str = ""
    source_revision: str | None = None
    session_id: str | None = None
    #: Where the work happened. Kept after the tree is removed (SWR-3405).
    worktree_path: str | None = None
    branch: str | None = None
    base_commit: str = ""
    produced_commits: tuple[str, ...] = ()
    changed_files: tuple[str, ...] = ()
    #: What Rotaris measured. ``None`` when nothing verified this run — a
    #: different fact from a failed verification (SWR-3410).
    verified: bool | None = None
    verification_detail: str = ""
    checks: tuple[CheckOutcome, ...] = ()
    outcome: RunOutcome = RunOutcome.RUNNING
    #: Why it failed, stated (SWR-3415). Mandatory for a failed terminal record.
    failure_reason: str = ""
    attempt: int = 1
    started_at: dt.datetime | None = None
    finished_at: dt.datetime | None = None
    agent: str = ""
    agent_summary: str = ""
    agent_risks: tuple[str, ...] = ()
    agent_claimed_complete: bool = False

    @field_validator("run_id", "req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise HistoryError("a run record names the run and the requirement it belongs to")
        return cleaned

    @field_validator("started_at", "finished_at")
    @classmethod
    def _aware(cls, value: dt.datetime | None) -> dt.datetime | None:
        if value is not None and value.tzinfo is None:
            raise HistoryError("a run record carries aware timestamps, never naive ones")
        return value

    @model_validator(mode="after")
    def _a_failure_states_why(self) -> Self:
        unsuccessful = self.outcome in {
            RunOutcome.FAILED,
            RunOutcome.INTERRUPTED,
            RunOutcome.ABANDONED,
        }
        if unsuccessful and not self.failure_reason.strip():
            raise HistoryError(
                f"{self.run_id}: a {self.outcome} run states its reason; a retained failure"
                " nobody can read is worse than no record (SWR-3414, SWR-3415)",
            )
        return self

    @property
    def in_flight(self) -> bool:
        """Whether this run is still expected to produce something."""
        return self.outcome.in_flight

    @property
    def succeeded(self) -> bool:
        """Whether the run reached a successful terminal state."""
        return self.outcome is RunOutcome.SUCCEEDED

    @property
    def duration_s(self) -> float | None:
        """Wall-clock cost of the run, or ``None`` while it has not finished."""
        if self.started_at is None or self.finished_at is None:
            return None
        return (self.finished_at - self.started_at).total_seconds()

    @property
    def message(self) -> str:
        """One line: the run, its unit, its outcome and its reason."""
        where = f" [{self.unit_id}]" if self.unit_id else ""
        because = f" — {self.failure_reason}" if self.failure_reason else ""
        return f"{self.run_id}{where}: {self.outcome.label}{because}"

    @classmethod
    @traces(SWR.SWR_3414, SWR.SWR_3402)
    def opening(
        cls,
        snapshot: RunSnapshot,
        *,
        attempt: int = 1,
        agent: str = "",
        cycle: int = 0,
        at: dt.datetime | None = None,
    ) -> Self:
        """The record that exists *before* the run starts (SWR-3414).

        Everything already known at that point — the run, the unit, the delivery
        cycle, the specification version, the base commit — and nothing that is
        not.
        """
        return cls(
            run_id=snapshot.run_id,
            req_id=snapshot.req_id,
            unit_id=snapshot.unit_id,
            cycle=cycle,
            requirement_hash=snapshot.requirement_hash,
            source_revision=snapshot.source_revision,
            session_id=snapshot.session_id,
            base_commit=snapshot.base_commit,
            outcome=RunOutcome.RUNNING,
            attempt=attempt,
            agent=agent,
            started_at=at or snapshot.captured_at,
        )

    @classmethod
    @traces(SWR.SWR_3414, SWR.SWR_3416)
    def of_result(cls, result: RunResult, *, agent: str = "", cycle: int = 0) -> Self:
        """The completed record of a run the seam launched (SWR-3416).

        Composition, not a second shape: everything comes off the
        :class:`~rotaris_core.requirements.execution.run_seam.RunResult`, so a
        headless run and a desktop-launched one leave identical history.
        """
        report = result.report
        reason = result.failure_reason or (report.failure_reason if report is not None else "")
        outcome = result.outcome
        if outcome is not RunOutcome.SUCCEEDED and not reason.strip():
            reason = f"the run ended {outcome} without a stated reason"
        return cls(
            run_id=result.run_id,
            req_id=result.req_id,
            unit_id=result.unit_id,
            cycle=cycle,
            requirement_hash=result.snapshot.requirement_hash,
            source_revision=result.snapshot.source_revision,
            session_id=(report.session_id if report is not None else None)
            or result.snapshot.session_id,
            worktree_path=result.workspace.path if result.workspace is not None else None,
            branch=result.workspace.branch if result.workspace is not None else None,
            base_commit=result.snapshot.base_commit,
            produced_commits=report.produced_commits if report is not None else (),
            changed_files=report.changed_files if report is not None else (),
            verified=report.verified if report is not None else None,
            verification_detail=report.verification_detail if report is not None else "",
            checks=report.checks if report is not None else (),
            outcome=outcome,
            failure_reason=reason,
            attempt=result.attempt,
            started_at=result.started_at,
            finished_at=result.finished_at,
            agent=agent,
            agent_summary=report.agent_summary if report is not None else "",
            agent_risks=report.agent_risks if report is not None else (),
            agent_claimed_complete=report.agent_claimed_complete if report is not None else False,
        )

    @traces(SWR.SWR_3414, SWR.SWR_3216)
    def to_view(self) -> RunView:
        """This record as the board reads it (SWR-3216)."""
        return RunView(
            run_id=self.run_id,
            unit_id=self.unit_id,
            cycle=self.cycle,
            session_id=self.session_id,
            outcome=self.outcome,
            snapshot=RunSnapshotView(
                req_id=self.req_id,
                requirement_hash=self.requirement_hash,
                source_revision=self.source_revision,
                base_commit=self.base_commit or None,
                unit_id=self.unit_id,
                session_id=self.session_id,
                captured_at=self.started_at,
            ),
            worktree_path=self.worktree_path,
            branch=self.branch,
            base_commit=self.base_commit or None,
            produced_commits=self.produced_commits,
            changed_files=self.changed_files,
            verified=self.verified,
            verification_detail=self.verification_detail,
            checks=self.checks,
            started_at=self.started_at,
            finished_at=self.finished_at,
            failure_reason=self.failure_reason,
            attempt=self.attempt,
            agent_summary=self.agent_summary,
            agent_risks=self.agent_risks,
            agent_claimed_complete=self.agent_claimed_complete,
        )

    @traces(SWR.SWR_3414, SWR.SWR_3114)
    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form: one JSON object, one line, no requirement text.

        Passed through :func:`~rotaris_core.requirements.delivery.store.assert_no_requirement_content`
        on the way out, so a field carrying requirement prose added here later
        fails loudly rather than turning the history into a second store
        (SWR-3114).
        """
        payload: dict[str, JsonValue] = {
            "schema_version": RUN_HISTORY_SCHEMA_VERSION,
            "run_id": self.run_id,
            "req_id": self.req_id,
            "outcome": str(self.outcome),
            "attempt": self.attempt,
        }
        for key, value in (
            ("unit_id", self.unit_id),
            # Omitted for a first delivery, so a workspace that never re-delivers
            # anything keeps writing exactly the lines it wrote before (SWR-3417).
            ("cycle", self.cycle or None),
            ("requirement_hash", self.requirement_hash),
            ("source_revision", self.source_revision),
            ("session_id", self.session_id),
            ("worktree_path", self.worktree_path),
            ("branch", self.branch),
            ("base_commit", self.base_commit),
            ("verification_detail", self.verification_detail),
            ("failure_reason", self.failure_reason),
            ("agent", self.agent),
            ("agent_summary", self.agent_summary),
            ("started_at", self.started_at.isoformat() if self.started_at else None),
            ("finished_at", self.finished_at.isoformat() if self.finished_at else None),
        ):
            if value:
                payload[key] = value
        for key, items in (
            ("produced_commits", self.produced_commits),
            ("changed_files", self.changed_files),
            ("agent_risks", self.agent_risks),
        ):
            if items:
                payload[key] = list(items)
        if self.checks:
            # ``result`` rather than ``status``: the delivery store's content guard
            # reads ``status`` as a requirement's lifecycle wherever it appears
            # (SWR-3114), and a check's outcome is not that. One key renamed here
            # beats a check outcome that cannot be persisted at all.
            payload["checks"] = [
                {"name": check.name, "result": check.status, "detail": check.detail}
                for check in self.checks
            ]
        if self.verified is not None:
            payload["verified"] = self.verified
        if self.agent_claimed_complete:
            payload["agent_claimed_complete"] = True
        assert_no_requirement_content(payload, where=f"run record {self.run_id}")
        return payload

    @classmethod
    @traces(SWR.SWR_3414)
    def from_payload(cls, payload: Mapping[str, JsonValue]) -> Self:
        """One persisted line as a record, or a :class:`HistoryError`."""
        raw_outcome = _text(payload.get("outcome"))
        try:
            outcome = RunOutcome(raw_outcome)
        except ValueError as exc:
            raise HistoryError(f"unknown run outcome {raw_outcome!r}") from exc
        return cls(
            run_id=_text(payload.get("run_id")),
            req_id=_text(payload.get("req_id")),
            unit_id=_optional(payload.get("unit_id")),
            # A line written before SWR-3417 has no cycle, and cycle 0 is what it
            # means: everything recorded then was the first delivery.
            cycle=_count(payload.get("cycle"), default=0),
            requirement_hash=_text(payload.get("requirement_hash")),
            source_revision=_optional(payload.get("source_revision")),
            session_id=_optional(payload.get("session_id")),
            worktree_path=_optional(payload.get("worktree_path")),
            branch=_optional(payload.get("branch")),
            base_commit=_text(payload.get("base_commit")),
            produced_commits=_strings(payload.get("produced_commits")),
            changed_files=_strings(payload.get("changed_files")),
            verified=_flag(payload.get("verified")),
            verification_detail=_text(payload.get("verification_detail")),
            checks=_checks(payload.get("checks")),
            outcome=outcome,
            failure_reason=_text(payload.get("failure_reason")),
            attempt=_count(payload.get("attempt")),
            started_at=_moment(payload.get("started_at")),
            finished_at=_moment(payload.get("finished_at")),
            agent=_text(payload.get("agent")),
            agent_summary=_text(payload.get("agent_summary")),
            agent_risks=_strings(payload.get("agent_risks")),
            agent_claimed_complete=payload.get("agent_claimed_complete") is True,
        )


def _text(value: JsonValue) -> str:
    return value.strip() if isinstance(value, str) else ""


def _optional(value: JsonValue) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _strings(value: JsonValue) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))


def _flag(value: JsonValue) -> bool | None:
    """A stored three-valued flag: ``True`` / ``False`` / not measured."""
    return value if isinstance(value, bool) else None


def _count(value: JsonValue, *, default: int = 1) -> int:
    """A stored counter, defaulting rather than degrading the whole record."""
    return value if isinstance(value, int) and not isinstance(value, bool) else default


def _checks(value: JsonValue) -> tuple[CheckOutcome, ...]:
    if not isinstance(value, list):
        return ()
    found: list[CheckOutcome] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        found.append(
            CheckOutcome(
                name=_text(item.get("name")),
                status=_text(item.get("result")),
                detail=_text(item.get("detail")),
            ),
        )
    return tuple(found)


def _moment(value: JsonValue) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = dt.datetime.fromisoformat(value)
    except ValueError as exc:
        raise HistoryError(f"unreadable run timestamp {value!r}") from exc
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=dt.UTC)


@traces(SWR.SWR_3414)
class RequirementHistory(BaseModel):
    """Every run of one requirement, oldest first — successes and failures alike.

    The queries are the point: SWR-3414 asks the history to *answer* things, and
    a list of records nobody can interrogate is a log file.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    runs: tuple[RunRecord, ...] = ()

    @classmethod
    def of(cls, req_id: str, records: Iterable[RunRecord]) -> Self:
        """A history over *records*, one entry per run, in first-seen order.

        A run written twice — once on ``open``, once on ``complete`` — keeps its
        original position and its **newest** content, so the order is the order
        runs started and the content is what finally happened.
        """
        order: list[str] = []
        latest: dict[str, RunRecord] = {}
        for record in records:
            if record.run_id not in latest:
                order.append(record.run_id)
            latest[record.run_id] = record
        return cls(req_id=req_id, runs=tuple(latest[run_id] for run_id in order))

    @property
    def empty(self) -> bool:
        """Whether nothing has ever run for this requirement."""
        return not self.runs

    @property
    def run_ids(self) -> tuple[str, ...]:
        """Every run, in the order they started."""
        return tuple(record.run_id for record in self.runs)

    def get(self, run_id: str) -> RunRecord | None:
        """One run's record, or ``None``."""
        return next((record for record in self.runs if record.run_id == run_id), None)

    def for_unit(self, unit_id: str, *, cycle: int | None = None) -> tuple[RunRecord, ...]:
        """Every run of one unit, oldest first (SWR-3414's per-unit query).

        With *cycle* given, only that delivery's runs. A requirement delivered
        twice re-plans the same unit ids on purpose (SWR-3417), so the unscoped
        answer is "every run this slice of work ever had, across deliveries" —
        true, and not what a caller looking at the delivery in flight wants.
        """
        return tuple(
            record
            for record in self.runs
            if record.unit_id == unit_id and (cycle is None or record.cycle == cycle)
        )

    @property
    def cycles(self) -> tuple[int, ...]:
        """Every delivery cycle this requirement has runs for, oldest first.

        The reading SWR-3417 exists for: ``(0, 1)`` says the requirement was
        delivered, then delivered again, and :meth:`for_cycle` says what each one
        did.
        """
        return tuple(sorted({record.cycle for record in self.runs}))

    def for_cycle(self, cycle: int) -> tuple[RunRecord, ...]:
        """Every run of one delivery cycle, oldest first (SWR-3417)."""
        return tuple(record for record in self.runs if record.cycle == cycle)

    @property
    def failed(self) -> tuple[RunRecord, ...]:
        """Every retained failure, with its reason (SWR-3415)."""
        return tuple(record for record in self.runs if record.outcome is RunOutcome.FAILED)

    @property
    def in_flight(self) -> tuple[RunRecord, ...]:
        """Runs whose record was opened and never completed (SWR-3611)."""
        return tuple(record for record in self.runs if record.in_flight)

    @property
    def succeeded(self) -> tuple[RunRecord, ...]:
        """Every run that reached a successful terminal state."""
        return tuple(record for record in self.runs if record.succeeded)

    @property
    def last(self) -> RunRecord | None:
        """The newest run, whatever became of it."""
        return self.runs[-1] if self.runs else None

    def attempts_of(self, unit_id: str, *, cycle: int | None = None) -> int:
        """How many times this unit has been run (SWR-3415's retry counter).

        Scoped to one delivery cycle when *cycle* is given: retries are counted
        against the bound of *this* delivery, and carrying the previous
        delivery's attempts into it would exhaust the bound before any work was
        done (SWR-3417).
        """
        return len(self.for_unit(unit_id, cycle=cycle))

    @property
    def implementation_commits(self) -> tuple[str, ...]:
        """Which commits carry this requirement's implementation (SWR-3414).

        The commits of runs that *succeeded*, in run order and de-duplicated. A
        failed run's commits are real commits and are reachable through
        :meth:`commits`, but they are not the implementation — folding them in
        would answer the question wrongly in exactly the case it is asked.
        """
        return self.commits(succeeded_only=True)

    def commits(self, *, succeeded_only: bool = False) -> tuple[str, ...]:
        """Every commit this requirement's runs produced, in run order."""
        seen: list[str] = []
        for record in self.runs:
            if succeeded_only and not record.succeeded:
                continue
            for commit in record.produced_commits:
                if commit not in seen:
                    seen.append(commit)
        return tuple(seen)

    @property
    def changed_files(self) -> tuple[str, ...]:
        """Every file this requirement's runs touched, de-duplicated, in order."""
        seen: list[str] = []
        for record in self.runs:
            for path in record.changed_files:
                if path not in seen:
                    seen.append(path)
        return tuple(seen)

    @property
    def branches(self) -> tuple[str, ...]:
        """Every branch this requirement's work lived on, in run order."""
        seen: list[str] = []
        for record in self.runs:
            if record.branch and record.branch not in seen:
                seen.append(record.branch)
        return tuple(seen)

    @property
    def worktrees(self) -> tuple[str, ...]:
        """Every tree a run used — recorded whether or not it still exists."""
        seen: list[str] = []
        for record in self.runs:
            if record.worktree_path and record.worktree_path not in seen:
                seen.append(record.worktree_path)
        return tuple(seen)

    @traces(SWR.SWR_3414, SWR.SWR_3216)
    def to_views(self) -> tuple[RunView, ...]:
        """Every run as the board reads it (SWR-3216)."""
        return tuple(record.to_view() for record in self.runs)

    @traces(SWR.SWR_3414, SWR.SWR_3216)
    def views_by_unit(self, *, cycle: int | None = None) -> dict[str, tuple[RunView, ...]]:
        """``unit_id → runs`` — what
        :meth:`~rotaris_core.requirements.execution.units.RequirementUnits.to_views`
        needs to attach runs to units.

        With *cycle* given, only that delivery's runs are grouped. The board
        passes the cycle its live units are on, because a unit id repeats across
        deliveries (SWR-3417) and a card that folded both in would show the first
        delivery's runs under the second delivery's unit.
        """
        grouped: dict[str, list[RunView]] = {}
        for record in self.runs:
            if record.unit_id and (cycle is None or record.cycle == cycle):
                grouped.setdefault(record.unit_id, []).append(record.to_view())
        return {unit_id: tuple(views) for unit_id, views in grouped.items()}

    @property
    def summary(self) -> str:
        """One line: how many runs, how many failed, how many commits."""
        return (
            f"{self.req_id}: {len(self.runs)} run(s), {len(self.failed)} failed,"
            f" {len(self.implementation_commits)} commit(s)"
        )


@traces(SWR.SWR_3414)
def run_history_filename(req_id: str) -> str:
    """``SWR-3414.jsonl`` — the file one requirement's run history lives in.

    The stem convention is the delivery store's (SWR-3205), reused rather than
    restated so an id that needs slugging is slugged the same way everywhere and
    a requirement's files stay side by side.
    """
    return record_filename(req_id).removesuffix(".json") + ".jsonl"


@traces(SWR.SWR_3414, SWR.SWR_3114)
class ExecutionHistory:
    """Run records on disk, one append-only file per requirement.

    Outside every worktree by construction: the path is derived from the
    *workspace*, so removing a run's tree or deleting its branch cannot reach the
    record (SWR-3414's third acceptance criterion).

    Reading never fails. An unreadable line costs its own run and nothing else —
    losing a whole requirement's history to one bad byte is the opposite of what
    a history is for.
    """

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/runs/`` — where histories live."""
        return requirements_state_dir(self._workspace) / RUN_HISTORY_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s run history is appended to."""
        return self.directory / run_history_filename(req_id)

    @traces(SWR.SWR_3414)
    def append(self, record: RunRecord) -> RunRecord:
        """Record one state of one run. The only write this store performs."""
        path = self.path_for(record.req_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(record.to_payload(), sort_keys=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(line + "\n")
        return record

    @traces(SWR.SWR_3414, SWR.SWR_3402)
    def open(
        self,
        snapshot: RunSnapshot,
        *,
        attempt: int = 1,
        agent: str = "",
        cycle: int = 0,
        at: dt.datetime | None = None,
    ) -> RunRecord:
        """Record that a run is about to start, before the agent is reached."""
        return self.append(
            RunRecord.opening(snapshot, attempt=attempt, agent=agent, cycle=cycle, at=at),
        )

    @traces(SWR.SWR_3414)
    def complete(self, result: RunResult, *, agent: str = "", cycle: int = 0) -> RunRecord:
        """Record how a run ended — succeeded, failed or abandoned."""
        return self.append(RunRecord.of_result(result, agent=agent, cycle=cycle))

    @traces(SWR.SWR_3414)
    def close(self, record: RunRecord) -> RunRecord:
        """Record a terminal state the seam did not produce — an abandon, a timeout."""
        return self.append(record)

    @traces(SWR.SWR_3414)
    def load(self, req_id: str) -> RequirementHistory:
        """This requirement's whole history, degrading unreadable lines."""
        path = self.path_for(req_id)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return RequirementHistory(req_id=req_id)
        records: list[RunRecord] = []
        for raw in text.splitlines():
            if not raw.strip():
                continue
            try:
                payload = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(payload, dict):
                continue
            version = payload.get("schema_version")
            if isinstance(version, int) and version > RUN_HISTORY_SCHEMA_VERSION:
                continue
            try:
                records.append(RunRecord.from_payload(payload))
            except (HistoryError, ValueError):
                continue
        return RequirementHistory.of(req_id, records)

    @traces(SWR.SWR_3414)
    def for_unit(
        self,
        req_id: str,
        unit_id: str,
        *,
        cycle: int | None = None,
    ) -> tuple[RunRecord, ...]:
        """Every run of one unit — the per-unit query of SWR-3414.

        Narrowed to one delivery cycle when *cycle* is given (SWR-3417).
        """
        return self.load(req_id).for_unit(unit_id, cycle=cycle)

    def req_ids(self) -> tuple[str, ...]:
        """Every requirement this store holds runs for, sorted.

        Read from the records themselves rather than from the file names: a
        slugged name cannot be turned back into the id it came from, and guessing
        would attribute a run to the wrong requirement.
        """
        try:
            files = sorted(path for path in self.directory.glob("*.jsonl") if path.is_file())
        except OSError:
            return ()
        found: set[str] = set()
        for path in files:
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for raw in lines:
                if not raw.strip():
                    continue
                try:
                    payload = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(payload, dict) and isinstance(payload.get("req_id"), str):
                    found.add(str(payload["req_id"]))
                    break
        return tuple(sorted(found))
