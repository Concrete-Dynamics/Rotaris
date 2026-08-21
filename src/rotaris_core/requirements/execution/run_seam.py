"""The engine seam requirement runs are launched through (SWR-3416).

Run launching lives in the desktop app's ``RunCoordinator`` today. That is the
right place for a user pressing a button and the wrong place for a scheduler that
has to work in a headless run, in CI and under test: building requirement
execution on a Qt object would make the engine untestable without a display and
would put the desktop package in the dependency path of the CLI.

So the seam lives here, in ``rotaris_core``, and has **no Qt in its import
graph**:

```text
scheduler / CLI / test ──▶ RequirementRunSeam.start(snapshot, isolation)
                                 │
                                 ├── IsolationProvider  ──▶ a worktree (SWR-3405)
                                 └── RunHost            ──▶ the agent run
                                                    ◀── RunReport
                           ──▶ RunResult ── to_view() ──▶ RunView (SWR-3216)
```

Both collaborators are protocols, and the two real implementations sit on
opposite sides of the seam: :class:`GitIsolation` adapts the existing
:class:`~rotaris_core.session.worktrees.GitWorktreeService` — this slice composes
that service, it does not reimplement it — while the desktop coordinator becomes
one :class:`RunHost` among several.

Four properties are load-bearing:

- **Every start is observable.** :attr:`RunResult.events` is the ordered
  lifecycle: requested → isolated → started → finished/failed. A caller that
  wants live updates passes an *observer*; a caller that wants the record reads
  the tuple afterwards. Neither needs a signal, a slot or an event loop.
- **The clock is injected.** ``RequirementRunSeam`` takes a callable, so a test
  can assert timestamps without sleeping and a scheduler can share one clock.
- **A failure keeps the evidence.** When the host fails, the worktree is kept and
  named on the result so it can be inspected (SWR-3405, SWR-3415); only an
  isolation failure has no workspace to report, and then the host is never
  called at all.
- **Requirement worktrees have their own namespace.** Branches are
  ``rotaris/req/…`` and paths live under
  ``<workspace>/.rotaris/requirements/worktrees/``, so they cannot collide with
  session worktrees (``rotaris/session/…`` under ``.rotaris/worktrees/``) or with
  a harness' own tree.
"""

from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import CheckOutcome, RunOutcome, RunView
from rotaris_core.requirements.execution.snapshot import (
    RunSnapshot,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.execution.units import slug_token

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.requirements.execution.snapshot import SnapshotStore
    from rotaris_core.requirements.execution.target import TargetBranch
    from rotaris_core.session.worktrees import WorktreeLaunchRequest

__all__ = [
    "REQUIREMENT_BRANCH_PREFIX",
    "REQUIREMENT_WORKTREE_SUBPATH",
    "GitIsolation",
    "IsolationError",
    "IsolationProvider",
    "IsolationRequest",
    "RequirementRunSeam",
    "RunEvent",
    "RunHost",
    "RunPhase",
    "RunReport",
    "RunResult",
    "RunWorkspace",
    "UnitLaunch",
    "unit_branch",
    "unit_isolation",
]

#: The branch namespace requirement runs own. Deliberately a sibling of
#: ``rotaris/session/`` rather than a child, so neither can ever prefix-match the
#: other, and a `git branch --list 'rotaris/req/*'` lists exactly this slice's work.
REQUIREMENT_BRANCH_PREFIX = "rotaris/req"

#: Where requirement worktrees live, relative to ``<workspace>/.rotaris/``.
#: Under ``requirements/`` beside the delivery store, never in ``worktrees/``
#: where sessions keep theirs.
REQUIREMENT_WORKTREE_SUBPATH = "requirements/worktrees"


class IsolationError(RuntimeError):
    """A run could not be given a workspace of its own."""


@traces(SWR.SWR_3416)
class IsolationRequest(BaseModel):
    """How a run wants to be isolated — the seam's half of SWR-3405.

    A value, not a service call: the scheduler decides isolation, the seam passes
    it on, and the provider is the only part that touches Git. Mirrors
    :class:`~rotaris_core.session.worktrees.WorktreeLaunchRequest` field for
    field, and :meth:`to_launch_request` is the one conversion — so the two
    cannot drift while staying serialisable (the launch request holds a
    :class:`~pathlib.Path`; this holds a string).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The branch the run works on. ``None`` lets the provider derive one.
    branch: str | None = None
    #: An existing worktree to attach to instead of creating one.
    path: str | None = None
    create: bool = True
    #: The id the worktree is filed under. For a requirement run this is the run
    #: id, so two attempts of one unit get two directories.
    session_id: str | None = None

    def to_launch_request(self) -> WorktreeLaunchRequest:
        """This request as the session layer's launch request."""
        from pathlib import Path

        from rotaris_core.session.worktrees import WorktreeLaunchRequest

        return WorktreeLaunchRequest(
            branch=self.branch,
            path=Path(self.path) if self.path else None,
            create=self.create,
            session_id=self.session_id,
        )


@traces(SWR.SWR_3416, SWR.SWR_3405)
def unit_branch(req_id: str, unit_id: str, *, attempt: int = 1, cycle: int = 0) -> str:
    """The branch one unit's run works on.

    ``rotaris/req/<requirement>/<unit>``, plus ``-c<n>`` from the second delivery
    cycle on (SWR-3417) and ``-a<n>`` from the second attempt on — so neither a
    retry (SWR-3415) nor a re-delivery reuses the branch whose work is still
    being looked at. Every component is slugged by the same rule unit ids are
    (:func:`~rotaris_core.requirements.execution.units.slug_token`), which is what
    keeps an id like ``PROJ/7`` from producing a branch with a stray path
    separator in it.

    The cycle is a *branch* component and never part of the unit id: the id has
    to stay byte-identical across deliveries, because the desktop mints it
    independently when a user starts a unit by hand (SWR-3417).
    """
    requirement = slug_token(req_id, limit=0)
    unit = slug_token(unit_id, limit=0)
    if not requirement or not unit:
        raise IsolationError(
            f"cannot derive a branch for requirement {req_id!r} / unit {unit_id!r}",
        )
    again = "" if cycle <= 0 else f"-c{cycle + 1}"
    suffix = "" if attempt <= 1 else f"-a{attempt}"
    return f"{REQUIREMENT_BRANCH_PREFIX}/{requirement}/{unit}{again}{suffix}"


@traces(SWR.SWR_3416)
def unit_isolation(
    req_id: str,
    unit_id: str,
    *,
    run_id: str,
    attempt: int = 1,
    cycle: int = 0,
) -> IsolationRequest:
    """The standard isolation request for a unit run: its own branch and tree."""
    return IsolationRequest(
        branch=unit_branch(req_id, unit_id, attempt=attempt, cycle=cycle),
        session_id=run_id,
        create=True,
    )


@traces(SWR.SWR_3416)
class RunWorkspace(BaseModel):
    """The tree a run works in, as the seam reports it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    path: str
    branch: str
    base_branch: str = ""
    base_revision: str = ""
    #: False when the run attached to a tree that already existed.
    created: bool = True


@runtime_checkable
class IsolationProvider(Protocol):
    """Where a run's workspace comes from (SWR-3405).

    One method, so a test can supply three lines and a scheduler can supply
    :class:`GitIsolation`. Raising :class:`IsolationError` is how a provider says
    "no tree"; the seam turns that into a failed run rather than an exception at
    the call site.
    """

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        """Give this run a workspace of its own."""
        ...


@traces(SWR.SWR_3416, SWR.SWR_3405)
class GitIsolation:
    """:class:`~rotaris_core.session.worktrees.GitWorktreeService`, as a provider.

    Composition, not reimplementation: branch sanitising, collision resolution
    and the "must be a repository root" precondition are all the session
    service's and stay there. What this adds is the namespace — requirement
    worktrees under ``.rotaris/requirements/worktrees/`` on ``rotaris/req/…``
    branches — so a requirement run and a session run can never take each other's
    directory or branch.
    """

    def __init__(
        self,
        base_workspace: Path,
        *,
        storage_subpath: str = REQUIREMENT_WORKTREE_SUBPATH,
        target: TargetBranch | None = None,
    ) -> None:
        self._base_workspace = base_workspace
        self._storage_subpath = storage_subpath
        self._target = target

    @property
    def base_workspace(self) -> Path:
        """The checkout requirement worktrees are cut from."""
        return self._base_workspace

    @property
    def target(self) -> TargetBranch | None:
        """The branch unit trees fork from, when the workspace declared one (SWR-3419).

        ``None`` means "whatever the checkout has out", which is both the default
        and what every provider did before the target branch existed.
        """
        return self._target

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        """Create (or attach to) the worktree *request* asks for."""
        from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService

        service = GitWorktreeService(
            self._base_workspace,
            storage_subpath=self._storage_subpath,
        )
        try:
            if not request.create:
                if not request.path:
                    raise IsolationError(
                        "attaching to an existing worktree needs the path to attach to",
                    )
                from pathlib import Path as _Path

                bound = service.attach_existing(_Path(request.path))
                return RunWorkspace(
                    path=bound.path,
                    branch=bound.branch,
                    base_branch=bound.base_branch,
                    base_revision=bound.base_revision,
                    created=False,
                )
            if not request.session_id:
                raise IsolationError("a requirement run worktree is filed under its run id")
            created = service.create_for_session_unique(
                request.session_id,
                request.branch,
                base_revision=self._target.revision if self._target is not None else None,
                base_branch=(
                    self._target.branch
                    if self._target is not None and self._target.stated
                    else None
                ),
            )
        except GitWorktreeError as exc:
            raise IsolationError(str(exc)) from exc
        return RunWorkspace(
            path=created.path,
            branch=created.branch,
            base_branch=created.base_branch,
            base_revision=created.base_revision,
            created=True,
        )


@traces(SWR.SWR_3416)
class UnitLaunch(BaseModel):
    """Everything a host needs to run one unit — and nothing it has to look up."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    unit_id: str | None = None
    #: The specification version this run works against, for its whole life
    #: (SWR-3402). The host must not re-read the requirement.
    snapshot: RunSnapshot
    isolation: IsolationRequest
    workspace: RunWorkspace
    #: The agent context (SWR-3407), rendered by the caller.
    prompt: str = ""
    agent: str = ""
    attempt: int = 1


@traces(SWR.SWR_3416)
class RunReport(BaseModel):
    """What a host reports back when the run is over.

    Everything here is either the host's own observation or the agent's claim,
    and the two are kept apart by name (``agent_*``) so the review surface can
    show them side by side (SWR-3603) rather than as one merged "result".
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    outcome: RunOutcome = RunOutcome.SUCCEEDED
    session_id: str | None = None
    produced_commits: tuple[str, ...] = ()
    changed_files: tuple[str, ...] = ()
    #: What Rotaris measured. ``None`` when nothing verified this run — a
    #: different fact from a failed verification.
    verified: bool | None = None
    verification_detail: str = ""
    checks: tuple[CheckOutcome, ...] = ()
    failure_reason: str = ""
    agent_summary: str = ""
    agent_risks: tuple[str, ...] = ()
    agent_claimed_complete: bool = False

    @field_validator("outcome")
    @classmethod
    def _terminal(cls, value: RunOutcome) -> RunOutcome:
        if value.in_flight:
            raise ValueError(
                f"a run report describes a finished run; {value.label} is still in flight",
            )
        return value


@runtime_checkable
class RunHost(Protocol):
    """Whatever actually runs the agent (SWR-3416).

    Synchronous on purpose. The seam is the *launch* contract; concurrency is the
    scheduler's decision (SWR-3406, SWR-3412), and a host that blocks is trivially
    wrapped in a thread while a host that hides its own event loop is not.
    """

    def start(self, launch: UnitLaunch) -> RunReport:
        """Run the unit and report what happened."""
        ...


class RunPhase(StrEnum):
    """The lifecycle a launched run passes through (SWR-3416)."""

    REQUESTED = "requested"
    ISOLATED = "isolated"
    STARTED = "started"
    FINISHED = "finished"
    FAILED = "failed"

    @property
    def terminal(self) -> bool:
        """Whether nothing more follows this phase."""
        return self in {RunPhase.FINISHED, RunPhase.FAILED}


@traces(SWR.SWR_3416)
class RunEvent(BaseModel):
    """One thing that happened to a run, in order."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    unit_id: str | None = None
    phase: RunPhase
    at: dt.datetime
    detail: str = ""
    #: Set on a terminal phase, ``None`` before it.
    outcome: RunOutcome | None = None

    @property
    def message(self) -> str:
        """``run-7: started`` / ``run-7: failed — worktree path already exists``."""
        because = f" — {self.detail}" if self.detail else ""
        return f"{self.run_id}: {self.phase}{because}"


@traces(SWR.SWR_3416)
class RunResult(BaseModel):
    """One launched run, from the request to its terminal state."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    unit_id: str | None = None
    snapshot: RunSnapshot
    isolation: IsolationRequest
    #: ``None`` only when isolation itself failed — the one case in which no
    #: workspace exists to inspect.
    workspace: RunWorkspace | None = None
    report: RunReport | None = None
    events: tuple[RunEvent, ...] = ()
    started_at: dt.datetime | None = None
    finished_at: dt.datetime | None = None
    attempt: int = 1
    failure_reason: str = ""

    @property
    def outcome(self) -> RunOutcome:
        """The terminal state of this run."""
        return self.report.outcome if self.report is not None else RunOutcome.FAILED

    @property
    def succeeded(self) -> bool:
        """Whether the run reached a successful terminal state."""
        return self.outcome is RunOutcome.SUCCEEDED

    @property
    def phases(self) -> tuple[RunPhase, ...]:
        """The lifecycle as it actually happened — what a test asserts on."""
        return tuple(event.phase for event in self.events)

    @traces(SWR.SWR_3416, SWR.SWR_3216)
    def to_view(self) -> RunView:
        """This run as the board reads it (SWR-3216).

        The seam's whole output in the shared shape: a headless launch produces
        exactly what the desktop would have, which is what makes SWR-3416 a seam
        rather than a second implementation.
        """
        report = self.report
        return RunView(
            run_id=self.run_id,
            unit_id=self.unit_id,
            session_id=(report.session_id if report is not None else None)
            or self.snapshot.session_id,
            outcome=self.outcome,
            snapshot=self.snapshot.to_view(),
            worktree_path=self.workspace.path if self.workspace is not None else None,
            branch=self.workspace.branch if self.workspace is not None else None,
            base_commit=self.snapshot.base_commit,
            produced_commits=report.produced_commits if report is not None else (),
            changed_files=report.changed_files if report is not None else (),
            verified=report.verified if report is not None else None,
            verification_detail=report.verification_detail if report is not None else "",
            checks=report.checks if report is not None else (),
            started_at=self.started_at,
            finished_at=self.finished_at,
            failure_reason=self.failure_reason,
            attempt=self.attempt,
            agent_summary=report.agent_summary if report is not None else "",
            agent_risks=report.agent_risks if report is not None else (),
            agent_claimed_complete=report.agent_claimed_complete if report is not None else False,
        )


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3416)
class RequirementRunSeam:
    """Start a run for an execution unit and report its lifecycle. No Qt.

    The one entry point requirement execution uses to reach the run machinery.
    Everything that could need a display, a Git binary or a model is injected:
    the isolation provider, the host, the clock and the optional snapshot store.
    What is left — the order of the lifecycle, what a failure keeps, what the
    result reports — is this class, and it is testable with two fakes.
    """

    def __init__(
        self,
        *,
        isolation: IsolationProvider,
        host: RunHost,
        clock: Callable[[], dt.datetime] = _utc_now,
        observer: Callable[[RunEvent], None] | None = None,
        snapshots: SnapshotStore | None = None,
    ) -> None:
        self._isolation = isolation
        self._host = host
        self._clock = clock
        self._observer = observer
        self._snapshots = snapshots

    @traces(SWR.SWR_3416, SWR.SWR_3402)
    def start(
        self,
        *,
        snapshot: RunSnapshot,
        isolation_request: IsolationRequest,
        prompt: str = "",
        agent: str = "",
        attempt: int = 1,
    ) -> RunResult:
        """Launch the run *snapshot* belongs to, and report what happened.

        Never raises for a run that failed: an isolation failure and a host
        failure are both *results* — a scheduler has to record them, retry them
        and show them (SWR-3415), and an exception at the call site would make
        the first of those the caller's problem.

        The snapshot is persisted, when a store was given, **before** the host is
        reached, so a crash between here and the agent still leaves the record of
        which specification version the work was aimed at (SWR-3402).
        """
        events: list[RunEvent] = []
        started_at = self._clock()

        def emit(phase: RunPhase, *, detail: str = "", outcome: RunOutcome | None = None) -> None:
            event = RunEvent(
                run_id=snapshot.run_id,
                req_id=snapshot.req_id,
                unit_id=snapshot.unit_id,
                phase=phase,
                at=self._clock(),
                detail=detail,
                outcome=outcome,
            )
            events.append(event)
            if self._observer is not None:
                self._observer(event)

        emit(RunPhase.REQUESTED, detail=isolation_request.branch or "")
        if self._snapshots is not None:
            self._snapshots.save(snapshot)

        try:
            workspace = self._isolation.provide(isolation_request)
        except IsolationError as exc:
            emit(RunPhase.FAILED, detail=str(exc), outcome=RunOutcome.FAILED)
            return RunResult(
                run_id=snapshot.run_id,
                req_id=snapshot.req_id,
                unit_id=snapshot.unit_id,
                snapshot=snapshot,
                isolation=isolation_request,
                workspace=None,
                report=RunReport(outcome=RunOutcome.FAILED, failure_reason=str(exc)),
                events=tuple(events),
                started_at=started_at,
                finished_at=events[-1].at,
                attempt=attempt,
                failure_reason=str(exc),
            )

        emit(RunPhase.ISOLATED, detail=workspace.path)
        launch = UnitLaunch(
            run_id=snapshot.run_id,
            req_id=snapshot.req_id,
            unit_id=snapshot.unit_id,
            snapshot=snapshot,
            isolation=isolation_request,
            workspace=workspace,
            prompt=prompt,
            agent=agent,
            attempt=attempt,
        )
        emit(RunPhase.STARTED, detail=agent)

        try:
            report = self._host.start(launch)
        except Exception as exc:  # noqa: BLE001 - a host failure is a failed run, not a crash.
            reason = f"{type(exc).__name__}: {exc}"
            emit(RunPhase.FAILED, detail=reason, outcome=RunOutcome.FAILED)
            return RunResult(
                run_id=snapshot.run_id,
                req_id=snapshot.req_id,
                unit_id=snapshot.unit_id,
                snapshot=snapshot,
                isolation=isolation_request,
                # Kept, not cleaned up: the tree is where the failure can be
                # inspected and where a retry starts from (SWR-3405, SWR-3415).
                workspace=workspace,
                report=RunReport(outcome=RunOutcome.FAILED, failure_reason=reason),
                events=tuple(events),
                started_at=started_at,
                finished_at=events[-1].at,
                attempt=attempt,
                failure_reason=reason,
            )

        failed = report.outcome is not RunOutcome.SUCCEEDED
        emit(
            RunPhase.FAILED if failed else RunPhase.FINISHED,
            detail=report.failure_reason,
            outcome=report.outcome,
        )
        return RunResult(
            run_id=snapshot.run_id,
            req_id=snapshot.req_id,
            unit_id=snapshot.unit_id,
            snapshot=snapshot,
            isolation=isolation_request,
            workspace=workspace,
            report=report,
            events=tuple(events),
            started_at=started_at,
            finished_at=events[-1].at,
            attempt=attempt,
            failure_reason=report.failure_reason,
        )
