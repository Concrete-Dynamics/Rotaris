"""The execution half of the board projection, read off one workspace.

Slice 2 declared
:class:`~rotaris_core.requirements.delivery.projection.ExecutionReader` and
answered it with :class:`~rotaris_core.requirements.delivery.projection.NoExecution`
— the honest answer for a workspace that has never run anything, and the only
answer available while this package was being written. This module is the other
implementation: the one that reads what execution actually left behind.

```text
UnitStore.load(req_id)        units, live and discarded          SWR-3401
ExecutionHistory.load(req_id) every run, failures included       SWR-3414
IntegrationLog.load(req_id)   every integration attempt          SWR-3409
DeliveryStore.load(req_id)    whether the result awaits review   SWR-3201
a scheduler decision          this requirement's queue position  SWR-3412
                    │
                    ▼
            ExecutionSummary / BlockerView / ReviewView / QueueView   SWR-3216
```

Three properties make it usable from the desktop, which is where it is used
(SWR-3311):

- **It only reads.** No store here writes, nothing is repaired on read, and a
  projection therefore cannot change what it is projecting (SWR-3216).
- **It never raises for missing or broken data.** Every store degrades to its
  empty value, so a requirement that has never run and a requirement whose file
  is corrupt both project as "nothing has run" rather than as an exception on
  the Qt thread.
- **It joins, it does not recompute.** Units hold run *ids* and the history holds
  run *records* (SWR-3401); this is the one place that resolves one against the
  other, so neither store has to know about the other.
- **It reads each file once per pass.** One projection asks for the summary, the
  blockers and the review of the same requirement, and all three need the same
  two files. A reader instance is built per evaluation and remembers what it
  already read, so a board of a thousand cards costs one read per store per card
  rather than one per question.

The scheduler's decision is passed in rather than read: which unit runs next
follows from live capacity (:func:`~rotaris_core.requirements.execution.scheduler.schedule`),
not from a file, and a reader that invented one would show a board a queue no
scheduler agreed to. It arrives as the decision rather than as its projected
queue because the projection erases the machine-readable
:class:`~rotaris_core.requirements.execution.scheduler.HoldReason`, and telling a
requirement dependency from a sibling-unit one is the difference between a
blocker and normal sequencing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import (
    BlockerKind,
    BlockerView,
    ExecutionSummary,
    QueueView,
    ReviewView,
    RunOutcome,
)
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.scheduler import HoldReason
from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.requirements.change_host import RelationBlockers
    from rotaris_core.requirements.delivery.completion import CompletionEvidence
    from rotaris_core.requirements.delivery.projection import QueueEntryView, RunView
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.execution.history import RequirementHistory
    from rotaris_core.requirements.execution.scheduler import ScheduleDecision
    from rotaris_core.requirements.execution.units import RequirementUnits
    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = ["WorkspaceExecution", "completion_evidence_for"]


@traces(SWR.SWR_3401, SWR.SWR_3403, SWR.SWR_3409, SWR.SWR_3412, SWR.SWR_3414, SWR.SWR_3415)
class WorkspaceExecution:
    """One workspace's execution records, in the shape the board reads.

    Satisfies
    :class:`~rotaris_core.requirements.delivery.projection.ExecutionReader`, so a
    caller swaps it for
    :class:`~rotaris_core.requirements.delivery.projection.NoExecution` and gets
    the same board with the execution fields filled.

    Every collaborator is injectable and every default is derived from the
    workspace, so a test drives it over ``tmp_path`` without a git repository and
    the desktop constructs it with one argument.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        units: UnitStore | None = None,
        history: ExecutionHistory | None = None,
        integrations: IntegrationLog | None = None,
        delivery: DeliveryStore | None = None,
        decision: ScheduleDecision | None = None,
        relations: RelationBlockers | None = None,
        requirement_for: Callable[[str], CanonicalRequirement | None] | None = None,
    ) -> None:
        self._workspace = workspace
        self._relations = relations
        self._units = units if units is not None else UnitStore(workspace)
        self._history = history if history is not None else ExecutionHistory(workspace)
        self._integrations = integrations if integrations is not None else IntegrationLog(workspace)
        self._delivery = delivery
        self._decision = decision
        self._requirement_for = requirement_for
        self._entries: tuple[QueueEntryView, ...] | None = None
        # One projection pass asks this reader three questions per requirement —
        # the summary, the blockers and the review — and each of them needs the
        # same two files. A reader lives for exactly one pass (the board builds a
        # new one per evaluation), so remembering what this pass already read is
        # what keeps a board of 1500 cards at two reads per card instead of five.
        self._histories: dict[str, RequirementHistory] = {}
        self._unit_sets: dict[str, RequirementUnits] = {}

    @property
    def workspace(self) -> Path:
        """The workspace whose execution records this reads."""
        return self._workspace

    # ── the ExecutionReader contract (SWR-3216) ───────────────────────────

    @traces(SWR.SWR_3401, SWR.SWR_3414)
    def execution_for(self, req_id: str) -> ExecutionSummary:
        """Units, runs, integrations and queue position for one requirement.

        The join SWR-3401 leaves open: a unit names the runs that executed it by
        id, the history holds the records, and the board needs them together on
        one value. Resolved here rather than in either store, because a store
        that reached into the other would make each unreadable on its own.
        """
        history = self._history_of(req_id)
        runs = history.to_views()
        units = self._units_of(req_id)
        # Scoped to the cycle the live units are on. A requirement delivered
        # twice re-plans the same unit ids (SWR-3417), so an unscoped join would
        # hang the first delivery's runs off the second delivery's units — the
        # card would look right and describe work that is not there. ``runs``
        # above stays whole: that list is the requirement's history, and each
        # entry says which delivery it belongs to.
        unit_views = units.to_views(history.views_by_unit(cycle=units.cycle))
        # ``worth_showing``, not ``not skipped``: a single-unit requirement's
        # landing is recorded as a skipped *integration* that promoted (SWR-3420),
        # and filtering on the skip alone would hide the only integration record
        # most requirements ever get.
        integrations = tuple(
            outcome.to_view()
            for outcome in self._integrations.load(req_id)
            if outcome.worth_showing
        )
        active = next((run for run in reversed(runs) if run.outcome.in_flight), None)
        return ExecutionSummary(
            req_id=req_id,
            units=unit_views,
            runs=runs,
            integrations=integrations,
            queue_entry=next(
                (entry for entry in self._queue_entries() if entry.req_id == req_id),
                None,
            ),
            # The specification version the work in flight is aimed at
            # (SWR-3402). Only for a run that is still going: for a finished one
            # the snapshot belongs to the review, where it is compared.
            active_snapshot=active.snapshot if active is not None else None,
        )

    @traces(SWR.SWR_3415, SWR.SWR_3412, SWR.SWR_3511)
    def blockers_for(self, req_id: str) -> tuple[BlockerView, ...]:
        """What has stopped this requirement, with the reason stated (SWR-3607).

        Two kinds arise from *execution* and nowhere else. A unit whose retries
        are spent is a ``run-failure`` blocker: retrying again is not an option
        the board may offer, so the requirement is waiting on a person
        (SWR-3415). A unit the scheduler holds on a *requirement* dependency is a
        ``dependency`` blocker naming what it waits for (SWR-3510) — "queued" and
        "will never start until SWR-3201 is Done" look identical on a board that
        does not distinguish them.

        A hold on a sibling unit is deliberately **not** a blocker: that is the
        dependency graph doing its job inside one requirement (SWR-3406), and
        reporting normal sequencing as a blocker would make the word useless.

        The **relation** blockers — a contradiction (SWR-3511), a dependency
        cycle (SWR-3510) — are computed from the whole requirement set and handed
        in, for the same reason the scheduler decision is: a reader asked one
        requirement at a time cannot see either. They come first: a requirement
        that contradicts another is not waiting for a run, and offering the run
        failure as the thing to look at would send its owner to the wrong place.
        """
        found: list[BlockerView] = list(
            self._relations.for_requirement(req_id) if self._relations is not None else (),
        )
        history = self._history_of(req_id)
        units = self._units_of(req_id)
        for unit in units.units:
            if not unit.retries_exhausted or not unit.failure_reason:
                continue
            last = history.for_unit(unit.unit_id, cycle=unit.cycle)
            found.append(
                BlockerView(
                    req_id=req_id,
                    kind=BlockerKind.RUN_FAILURE,
                    reason=f"{unit.unit_id}: {unit.failure_reason}",
                    raised_at=last[-1].finished_at if last else None,
                ),
            )
        decision = self._decision
        if decision is None:
            return tuple(found)
        for unit in units.units:
            hold = decision.hold_for(unit.unit_id)
            if hold is None or hold.reason is not HoldReason.REQUIREMENT_DEPENDENCY:
                continue
            found.append(
                BlockerView(
                    req_id=req_id,
                    kind=BlockerKind.DEPENDENCY,
                    reason=hold.message,
                    blocking_ids=hold.waiting_for,
                ),
            )
        return tuple(found)

    @traces(SWR.SWR_3403)
    def review_for(self, req_id: str) -> ReviewView | None:
        """What a requirement awaiting review presents — both hashes included.

        ``None`` unless the requirement is actually in ``Review``: the delivery
        state is the authority on that (SWR-3201), and a review payload attached
        to a requirement nobody is reviewing would put "awaiting review" on a
        card that is running.

        The comparison is SWR-3403's: the hash the run worked against against the
        hash the specification holds *now*. A difference means somebody edited
        the requirement mid-flight, and it is stated here rather than discovered
        when ``Done`` is refused.
        """
        if self._delivery is None or self._requirement_for is None:
            return None
        if self._delivery.load(req_id).record.state is not DeliveryState.REVIEW:
            return None
        run = self._reviewable_run(req_id)
        if run is None:
            return None
        current = self._requirement_for(req_id)
        snapshot_hash = run.snapshot.requirement_hash if run.snapshot is not None else ""
        current_hash = current.current_hash if current is not None else ""
        changed = bool(snapshot_hash and current_hash) and snapshot_hash != current_hash
        return ReviewView(
            req_id=req_id,
            run_id=run.run_id,
            snapshot_hash=snapshot_hash,
            current_hash=current_hash,
            reason=(
                "specification changed during execution"
                if changed
                else "the run finished and is awaiting review"
            ),
            agent_summary=run.agent_summary,
            agent_risks=run.agent_risks,
            agent_claimed_complete=run.agent_claimed_complete,
            checks=run.checks,
            verified=run.verified,
            changed_files=run.changed_files,
            branch=run.branch,
            worktree_path=run.worktree_path,
        )

    @traces(SWR.SWR_3412)
    def queue(self) -> QueueView:
        """The scheduler's decision, with the runs actually in flight filled in.

        The entries are the decision's; the running list is read from the
        histories, so a decision taken before a run started still shows what is
        in flight when the board asks (SWR-3412, SWR-3608). A reader with no
        decision answers with an empty queue rather than inventing one — which
        unit runs next is not a fact on disk.
        """
        if self._decision is None:
            return QueueView()
        return self._decision.to_queue_view(self._running())

    # ── internals ─────────────────────────────────────────────────────────

    def _queue_entries(self) -> tuple[QueueEntryView, ...]:
        """The decision's entries, projected once and reused.

        Cached because the projector asks per requirement and the decision is
        immutable: re-deriving several hundred entries per card would make the
        cheapest field on the board the most expensive one.
        """
        if self._entries is None:
            self._entries = (
                self._decision.to_queue_view().entries if self._decision is not None else ()
            )
        return self._entries

    def _history_of(self, req_id: str) -> RequirementHistory:
        """This requirement's runs, read once per pass (SWR-3414)."""
        history = self._histories.get(req_id)
        if history is None:
            history = self._history.load(req_id)
            self._histories[req_id] = history
        return history

    def _units_of(self, req_id: str) -> RequirementUnits:
        """This requirement's unit set, read once per pass (SWR-3401)."""
        units = self._unit_sets.get(req_id)
        if units is None:
            units = self._units.load(req_id)
            self._unit_sets[req_id] = units
        return units

    def _reviewable_run(self, req_id: str) -> RunView | None:
        """The newest run that produced something worth reviewing."""
        runs = self._history_of(req_id).to_views()
        return next(
            (run for run in reversed(runs) if run.outcome is RunOutcome.SUCCEEDED),
            None,
        )

    def _running(self) -> tuple[RunView, ...]:
        """Every run still in flight across the workspace, oldest first."""
        in_flight = [
            run
            for req_id in self._history.req_ids()
            for run in self._history.load(req_id).to_views()
            if run.outcome.in_flight
        ]
        # A run whose record was written before it reported a start time sorts
        # last rather than blowing up the comparison: an unknown time is a fact
        # about the record, not a reason to refuse the whole queue.
        in_flight.sort(
            key=lambda run: (
                run.started_at is None,
                run.started_at.isoformat() if run.started_at is not None else "",
                run.run_id,
            ),
        )
        return tuple(in_flight)


# ── the execution records as the completion gate reads them (SWR-3215) ──────


#: A changed path is a covering test when it lives in a ``tests`` directory or is
#: named like one. Deliberately not "under ``tests/``": a project that keeps its
#: tests beside its code still has covering tests, and a rule that only knew one
#: layout would silently report every such run as untested.
def _is_test_path(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    name = parts[-1]
    return any(part in {"test", "tests"} for part in parts[:-1]) or (
        name.startswith("test_") or name.endswith(("_test.py", "_test.ts", ".spec.ts"))
    )


@traces(SWR.SWR_3215, SWR.SWR_3603)
def completion_evidence_for(
    execution: WorkspaceExecution,
    req_id: str,
    *,
    current_hash: str,
) -> CompletionEvidence:
    """Everything SWR-3215's check reads, gathered from what actually ran.

    Nothing here is anybody's own claim. The units are this reader's units, the
    implementation traces are the non-test files the delivering run changed and
    the covering tests are the test files it changed — and whether those *ran and
    passed* is **Rotaris' measurement** of that run (``review.verified``), never
    the agent's ``agent_claimed_complete``. That separation is SWR-3603's, and
    keeping it here is what stops an agent from talking a requirement into
    ``Done``: a run that produced no test, or whose checks did not execute,
    cannot satisfy the covering-test condition however confidently it reported.

    Pure over the reader it is given: no clock, no subprocess, no store of its
    own. The reader is re-created per call by the composition root, so the gate
    reads the records as they stand at the moment of the transition.

    It lives beside :class:`WorkspaceExecution` rather than in the desktop module
    that used to hold it, because it is a *reading* of the execution records and
    both the board's write path and the propagation pass (SWR-3515) need the same
    one. Two copies of this join would be two answers to "was this delivered".
    """
    from rotaris_core.requirements.delivery.completion import (
        CompletionEvidence as Evidence,
    )
    from rotaris_core.requirements.delivery.completion import (
        CoveringTestEvidence,
        UnitEvidence,
        UnitExecution,
    )
    from rotaris_core.requirements.delivery.projection import UnitState

    summary = execution.execution_for(req_id)
    review = execution.review_for(req_id)
    changed = review.changed_files if review is not None else ()
    measured = bool(review is not None and review.verified)
    checks = review.checks if review is not None else ()
    states = {
        UnitState.FINISHED: UnitExecution.FINISHED,
        UnitState.RUNNING: UnitExecution.RUNNING,
        UnitState.ABANDONED: UnitExecution.ABANDONED,
    }
    return Evidence(
        req_id=req_id,
        current_hash=current_hash,
        units=tuple(
            UnitEvidence(
                unit_id=unit.unit_id,
                execution=states.get(unit.state, UnitExecution.PENDING),
            )
            for unit in summary.units
        ),
        implementation_traces=tuple(path for path in changed if not _is_test_path(path)),
        covering_tests=tuple(
            CoveringTestEvidence(path=path, executed=measured, passed=measured)
            for path in changed
            if _is_test_path(path)
        ),
        gate_passed=bool(checks) and all(check.passed for check in checks),
        gate_detail="; ".join(f"{check.name} {check.status}" for check in checks),
        integration_complete=bool(summary.integrations),
        blockers=tuple(blocker.reason for blocker in execution.blockers_for(req_id)),
    )
