"""The one seam between the desktop board and the requirement engine.

Everything the Requirements area shows comes through here, and here calls the
engine's board projection API (SWR-3216) as a **library**. Nothing under
``apps/rotaris/src`` may start a ``reqtocode`` or verifier process, read its
output, or re-derive evidence health, requirement health or epic progress
(SWR-3311) — a second answer computed in the desktop would drift from the one
the agents act on, and the agents' one is the real one. A guard test sweeps this
package for exactly that.

The second half of the file is why the board can *follow* the repository
(SWR-3312). A projection reads the requirement store, re-reads every source that
moved and sweeps the repository for annotations; on this repository that is
seconds, not milliseconds. So it runs on a worker thread and comes back as two
values: the new board state, and a :class:`BoardDelta` naming exactly which
cards moved. A view that receives "these three ids changed" can repaint three
cards and keep selection, scroll and the open detail view — which is the
difference between a board that follows the repository and a board that blinks
every time somebody commits.

```text
refresh() ─▶ QThread ─▶ BoardSource.project() ─▶ build_board_state()
                                                      │
        evaluated(state, delta) ◀─ diff_board() ◀──────┘

open_detail(id) ─▶ QThread ─▶ DetailSource.project_detail(id) ─▶ build_detail()
                                                      │
                        detail_ready(detail) ◀─────────┘
```

The detail read is a *second* pass, and deliberately not part of the first. The
deep views of SWR-3213 – SWR-3215 — the audit trail, the revision history, the
completion report — each read a log of their own, and the revision history reads
the source's own commits: on this repository that is roughly a second **per
requirement**, which is fine for the one card a user opens and impossible for
the fifteen hundred on the board. So the board pass carries the cards and the
detail pass carries the depth, which is exactly the split
:meth:`~rotaris_core.requirements.delivery.projection.BoardProjector.inputs`
offers through its ``req_ids`` argument. Until it returns, the panel says the
history is being read — a third state, distinct from "there is none" and from
"this source keeps none" (SWR-3313).

Failure has three shapes and they are deliberately not one:

- **unavailable** — this workspace has no requirement store, or none is
  configured. Not an error; the area states it and offers nothing to retry.
- **failed** — the projection was attempted and raised. The last good board
  stays on screen and the notice says what happened (SWR-3312).
- **busy** — a pass of that kind is already in flight. A second request is
  refused rather than queued, so a user hammering *Refresh* cannot stack passes.
  The two kinds are refused *separately*: a card still opens while the board is
  refreshing, which is why :class:`WorkspaceBoard` states a threading contract
  rather than assuming one pass at a time.
"""

from __future__ import annotations

import datetime as dt
import threading
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from PySide6.QtCore import QObject, QThread, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import (
    RequirementsBoardState,
    build_board_state,
    build_detail,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Collection
    from pathlib import Path

    from rotaris_core.requirements.change_host import EvaluationDepth, RelationBlockers
    from rotaris_core.requirements.delivery.projection import BoardProjection, EvidenceReader
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.execution.scheduler import ScheduleDecision
    from rotaris_core.requirements.registry import (
        CancelToken,
        RequirementIndex,
        RequirementRegistry,
    )
    from rotaris_core.requirements.sources.base import RequirementSource
    from rotaris_core.requirements.sources.discovery import DiscoveryOutcome

    from rotaris.models.requirements_state import RequirementDetail

__all__ = [
    "NO_SOURCE_REASON",
    "BoardDelta",
    "BoardEvaluation",
    "BoardSource",
    "EvaluationOutcome",
    "DetailSource",
    "RefreshKind",
    "RequirementsBridge",
    "RequirementsUnavailableError",
    "WorkspaceBoard",
    "board_source_for",
    "describe_proposal",
    "diff_board",
    "discover_requirement_source",
    "propose_requirement_source",
]

#: What the area says when nothing can produce a projection at all. A sentence,
#: not an empty board: "there is nothing here" and "we cannot look" are
#: different facts and the user can act on only one of them.
NO_SOURCE_REASON = (
    "No requirement source is available for this workspace. "
    "Open a workspace whose project keeps a requirement store, "
    "or configure a requirement source in Settings."
)


class RequirementsUnavailableError(RuntimeError):
    """No projection can be produced, and the reason is fit to show a user.

    Distinct from an ordinary failure on purpose: a workspace without a
    requirement store is a normal state of a normal project, and reporting it as
    an error would teach users to ignore the error channel.

    Carries the discovery outcome behind the reason when there was one
    (SWR-3120): the sentence says what was found, and a user offered a mapping
    has to be able to *accept* it, which a formatted string cannot support.
    """

    def __init__(self, message: str, *, outcome: DiscoveryOutcome | None = None) -> None:
        super().__init__(message)
        self.outcome = outcome


@traces(SWR.SWR_3106, SWR.SWR_3120)
def discover_requirement_source(workspace: Path) -> DiscoveryOutcome | None:
    """Survey *workspace* and propose a source for it, or ``None`` if it cannot.

    The structured half of :func:`propose_requirement_source`, which formats
    exactly this. Separate because a proposal a user is asked to accept has to
    survive as data all the way to
    :func:`~rotaris_core.requirements.sources.discovery.accept_proposal` — a
    board that could only render the summary would be offering something it had
    already thrown away.

    Writes nothing, here as there. A survey that cannot run at all is ``None``
    rather than an exception: this is already the unhappy path, and failing it
    twice replaces a fixable message with an unreadable one.
    """
    import logging

    from rotaris_core.config.loader import load_config
    from rotaris_core.requirements.analysis.analysts import source_analysts_for
    from rotaris_core.requirements.sources.discovery import discover_source

    try:
        return discover_source(workspace, source_analysts_for(load_config(workspace)))
    except Exception:  # noqa: BLE001 — the absence is the message, never a second failure
        logging.getLogger(__name__).info("Source discovery failed for %s", workspace, exc_info=True)
        return None


@traces(SWR.SWR_3106)
def propose_requirement_source(workspace: Path) -> str:
    """What Rotaris found in *workspace*, and the mapping it would propose (SWR-3106).

    A repository whose requirement layout Rotaris does not recognise should not
    leave a user at a blank configuration file, and this is where that repository
    turns up: the one place the product says "no requirement source". So it
    surveys, proposes, and — crucially — *validates the proposal by loading it*,
    then hands back what was found and what would be written.

    **It writes nothing.** Adopting a proposal is
    :func:`~rotaris_core.requirements.sources.discovery.accept_proposal`, a
    separate call with the store to write into, and nothing on this path takes
    one. SWR-3106's "presented for confirmation before being persisted" is
    therefore a property of the code rather than of the caller's manners.

    The analyst is the deterministic one, with the workspace's configured persona
    behind it for the layouts a frontmatter heuristic cannot map. A survey that
    cannot be run at all costs a sentence, not an exception: this is already the
    unhappy path, and failing it twice would replace a fixable message with an
    unreadable one.
    """
    return describe_proposal(discover_requirement_source(workspace))


@traces(SWR.SWR_3106)
def describe_proposal(outcome: DiscoveryOutcome | None) -> str:
    """*outcome* as the sentences a user reads. Pure; the formatter half."""
    if outcome is None:
        return NO_SOURCE_REASON
    if not outcome.is_acceptable:
        return f"{outcome.summary()}\n\n{NO_SOURCE_REASON}"
    return (
        f"{outcome.summary()}\n\n"
        "Nothing has been written. Accept this mapping to configure it as this "
        "workspace's requirement source."
    )


@traces(SWR.SWR_3319)
class RefreshKind(StrEnum):
    """What one board refresh is allowed to cost.

    The desktop's own axis, deliberately not the engine's
    :class:`~rotaris_core.requirements.change_host.EvaluationDepth` passed
    through. They map one to one today, and the wrapper is the point: what a
    call site is choosing here is *policy* — "an accepted action must not wait
    on a provider" — and that sentence belongs in the words the desktop uses.
    Handing the controller the engine's enum would also hand it every depth the
    engine grows later, as a choice it never made.

    There is no "project only" member. A projection with no evaluation is
    already reachable by holding a plain :class:`BoardSource` — which is exactly
    what the review panel's fallback does — so a third kind would be surface
    with no caller.
    """

    #: The deterministic rules, and nothing that reaches an analyst. Cards still
    #: move: SWR-3502 is owed on every refresh, and it costs no model call.
    EVALUATE = "evaluate"
    #: Every rule, including the impact analysis, the clarification pass, the
    #: migration planner and the removal analysis (SWR-3503, SWR-3506 …). This
    #: is the one that can take minutes, and the only one worth cancelling.
    ANALYSE = "analyse"


@runtime_checkable
class BoardSource(Protocol):
    """Anything that can answer with a board projection.

    The port the bridge is written against, so a test drives the real threading,
    diffing and failure paths with a projection it built itself — and so the
    desktop never depends on *how* a projection is produced.
    """

    def project(self) -> BoardProjection:
        """The whole board, read fresh.

        **Reads only; never writes** (SWR-3216) — and since SWR-3519 that is true
        of the shipped implementation too, not only of the port. The propagation
        pass that used to run inside this call is :class:`BoardEvaluation`, which
        a source satisfies separately and a caller asks for on purpose.
        """
        ...


@runtime_checkable
class DetailSource(Protocol):
    """Anything that can answer with *one* requirement's deep views.

    Separate from :class:`BoardSource` because the two have different costs and
    different lifetimes: the board is read on every refresh, the detail only for
    the card a user opened. A source that cannot answer deeply simply does not
    satisfy this protocol, and the bridge then shows the board's own entry
    rather than pretending a history it never read.
    """

    def project_detail(self, req_id: str) -> BoardProjection:
        """A projection whose entry for *req_id* carries history, audit and
        completion (SWR-3213 – SWR-3215). Reads only."""
        ...


@dataclass(frozen=True)
class _BoardSnapshot:
    """One pass's coherent read, plus what that pass's evaluation moved.

    Index, evidence and relations from the *same* moment, in one frozen value
    swapped through a single attribute. A reader on another thread therefore
    sees the previous generation whole or this one whole — never an index from
    one pass beside evidence from the next, which is what three separate
    attribute stores allowed.

    ``moves`` carries its default so a writer can publish the read phase before
    the evaluation it then runs over it.
    """

    index: RequirementIndex
    evidence: EvidenceReader
    relations: RelationBlockers
    moves: tuple[str, ...] = ()


@traces(SWR.SWR_3519)
@dataclass(frozen=True)
class EvaluationOutcome:
    """What one propagation pass did, for the caller that asked for it."""

    #: One sentence per thing the pass did (SWR-3502, SWR-3503, SWR-3513 …).
    moves: tuple[str, ...] = ()
    #: Whether it stopped because it was asked to. What it applied stands.
    cancelled: bool = False
    #: Requirements it did not judge — by depth, by policy, or by the stop.
    #: Reporting only: the next full pass finds them from state (SWR-3519).
    unanalysed: tuple[str, ...] = ()
    #: Whether this workspace permits the analysis at all (SWR-3117). Only
    #: meaningful beside :attr:`unanalysed`, and that pairing is the whole
    #: reason it is carried: work owed that no pass will ever pay is a sentence
    #: to show, not an action to offer.
    analysis_enabled: bool = True


@runtime_checkable
class BoardEvaluation(Protocol):
    """Anything that can run the propagation pass over its workspace.

    **The write half of the seam, and the only call on this path that writes.**
    Separate from :class:`BoardSource` for the reason SWR-3216 gives and the
    shipped code did not keep: a projection is a read, an evaluation applies
    system-actor transitions and may wait on a language model, and a port that
    calls both "project" cannot tell a caller which one it is getting. A source
    that satisfies only :class:`BoardSource` is a pure reader, by construction.
    """

    def evaluate(
        self,
        *,
        depth: EvaluationDepth | None = None,
        cancel: CancelToken | None = None,
    ) -> EvaluationOutcome:
        """Run the propagation rules once, and say what they did.

        *depth* is the engine's own (SWR-3519); ``None`` takes its default, which
        runs every rule. *cancel* stops the pass at its next checkpoint.
        """
        ...


@traces(SWR.SWR_3311)
class WorkspaceBoard:
    """One workspace's requirements, projected through the engine's own API.

    Construction is cheap and touches nothing: :meth:`project` does the reading,
    and it is only ever called on the bridge's worker thread. The engine is
    imported there too — the requirement layer pulls in the whole delivery
    package, and a desktop launch that never opens the board should not pay for
    it.

    **Two threads share this object, and that is by design.** The bridge refuses
    a second board pass while one is in flight and a second detail pass while one
    is in flight, but those are two different refusals: a detail read runs on its
    own thread while a board pass is running, because blocking a card behind a
    full refresh would be a worse product for no correctness gain. So
    :meth:`project` is the writer of :attr:`_snapshot` and
    :meth:`project_detail` is its reader, concurrently.

    What makes that safe is the shape, not a lock: one pass's index, evidence,
    relations and moves are a single frozen :class:`_BoardSnapshot`, published by
    one reference assignment when all four exist. A reference store is atomic
    under the GIL and stays a single store on a free-threaded build, and a frozen
    value cannot be observed half-written — so a reader sees the previous
    generation whole or this one whole. A reader must therefore load the
    attribute *once* and use that value throughout; loading it again for the next
    field is the race, rebuilt by hand. The one thing a lock does guard is
    :meth:`_opened`, where lazily building the registry is a check-then-act that
    two cold threads would otherwise both perform.

    The corollary for the next editor: **a mutable field beside `_snapshot`
    breaks this.** Anything a pass computes and a later reader needs belongs
    inside the snapshot, so it travels with its own generation. A guard test
    holds this class's attribute inventory to exactly that. A *collaborator* is
    a different thing and is allowed — the registry, the store, and the callable
    that answers what this process is running are all set once and asked during
    a pass, so none of them is a generation anybody could see half of.

    Every read is a library call. The registry re-reads the sources that moved
    (SWR-3116), the evidence half is
    :class:`~rotaris_core.requirements.delivery.projection.WorkspaceEvidence` —
    the coverage sweep, the last recorded verification (SWR-3220) and how far the
    repository has moved since it (SWR-3209) — the execution half is
    :class:`~rotaris_core.requirements.execution.reader.WorkspaceExecution`, and
    the delivery store is opened read-only. No process is started *by this
    module* and no command output is parsed here (SWR-3311); the one `git` the
    freshness source runs is the engine's own, on the engine's side of the seam.
    """

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace
        #: What this process is running right now, asked at the moment of the
        #: pass. A callable rather than a value: the scheduler starts and
        #: finishes flows between passes, and a set captured at construction
        #: would let the recovery step (SWR-3611) call a live flow abandoned.
        #: ``None`` until :meth:`follow_runs` is called, which says the truth
        #: about a board nobody has wired a run starter to — it runs nothing.
        self._running_here: Callable[[], Collection[str]] | None = None
        self._registry: RequirementRegistry | None = None
        self._store: DeliveryStore | None = None
        self._source: RequirementSource | None = None
        #: The last completed pass, whole (see :class:`_BoardSnapshot`). One
        #: attribute, because the detail pass reads it from another thread while
        #: a board pass may be replacing it.
        self._snapshot: _BoardSnapshot | None = None
        #: Guards the one lazy construction in :meth:`_opened`, and only that.
        self._lock = threading.Lock()

    @property
    def workspace(self) -> Path:
        """The workspace whose requirements this reads."""
        return self._workspace

    @traces(SWR.SWR_3611)
    def follow_runs(self, running_here: Callable[[], Collection[str]]) -> None:
        """Ask *running_here* which requirements this process is running.

        Wired by whatever owns the run starter, and left unset everywhere else.
        Without it the recovery step falls back on session liveness and its
        grace period alone, which is correct but slower to conclude — and with
        it, a flow this very process is driving is never even considered.
        """
        self._running_here = running_here

    @property
    @traces(SWR.SWR_3502)
    def specification_moves(self) -> tuple[str, ...]:
        """What the last evaluation moved, one line per requirement.

        Empty for the overwhelmingly common read in which nothing was edited.
        Reported rather than kept private: "the board moved a card by itself" is
        a fact a user is owed, and a test asserts on it instead of on a mock.
        """
        snapshot = self._snapshot
        return snapshot.moves if snapshot is not None else ()

    @traces(SWR.SWR_3502, SWR.SWR_3503, SWR.SWR_3515, SWR.SWR_3519)
    def evaluate(
        self,
        *,
        depth: EvaluationDepth | None = None,
        cancel: CancelToken | None = None,
    ) -> EvaluationOutcome:
        """Run the engine's propagation pass, and publish what it read.

        **The one call on this path that writes**, said out loud rather than
        hidden inside a read (SWR-3216). It does the read phase — the registry
        refresh and the evidence sweep — because the pass needs both, then runs
        the rules over them, then derives the relation blockers, then publishes
        all four as this generation's snapshot. :meth:`project` renders that
        snapshot and writes nothing.

        The order is load-bearing and is not a sequence to tidy. The blockers are
        derived *after* the rules because
        :func:`~rotaris_core.requirements.change_host.board_blockers` reads the
        decision store, which the pass's clarification step may have just written
        into; deriving them first would silently drop the questions this very
        pass opened.

        The pass itself is
        :func:`~rotaris_core.requirements.change_host.evaluate_workspace`
        (SWR-3515) — every rule, in the one order, in the engine. What this side
        of the seam contributes is the two things only the *reader* has: the
        evidence sweep it just made, and the source it opened.

        The evidence health handed to the pass is this sweep's own answer to "are
        the traces and covering tests of the delivered version still there"
        (SWR-3513) — which is what decides whether a reverted edit gives ``Done``
        back or leaves the requirement asking for evidence.

        The same sweep supplies the analyses their inputs. For SWR-3503 that is
        the trace and test sites it already computed plus — through
        :func:`~rotaris_core.requirements.sources.base.history_of` — the source's
        own history read, which is the only place the *delivered* version's text
        can come from (SWR-3114); a source that keeps no history contributes
        none, and the pass then moves the card without judging the change. For
        SWR-3507 it is the inventory of every site claiming a requirement that
        something now supersedes.
        """
        from rotaris_core.requirements.change_host import (
            EvaluationDepth as Depth,
        )
        from rotaris_core.requirements.change_host import (
            board_blockers,
            evaluate_workspace,
            evidence_of,
        )
        from rotaris_core.requirements.delivery.projection import WorkspaceEvidence
        from rotaris_core.requirements.sources.base import history_of

        registry, _store = self._opened()
        index = registry.refresh()
        # Built per pass, never cached across one: the freshness memo must not
        # answer from before the merge that just happened (SWR-3220, SWR-3209).
        evidence = WorkspaceEvidence.for_repository(self._workspace)
        history = history_of(self._source) if self._source is not None else None
        report = evaluate_workspace(
            self._workspace,
            requirements=index.requirements,
            current_for=index.requirement,
            swept=evidence_of(index.requirements, evidence),
            version_at=history.read_requirement_at if history is not None else None,
            # What this refresh observed to have gone (SWR-3113). The index has
            # them because the registry's memory outlived the last session
            # (SWR-3119) — before that, a board reopened tomorrow saw none.
            tombstones=index.tombstones,
            at=dt.datetime.now(dt.UTC),
            # ``None`` takes the engine's own default rather than restating it
            # here, so the two cannot drift apart (SWR-3519).
            depth=depth if depth is not None else Depth.FULL,
            cancel=cancel,
            # Asked now, not remembered (SWR-3611): a flow that started since the
            # last pass has to be in this answer or the pass would free it.
            running_here=tuple(self._running_here()) if self._running_here is not None else (),
        )
        relations = board_blockers(self._workspace, index.requirements)
        self._snapshot = _BoardSnapshot(
            index=index,
            evidence=evidence,
            relations=relations,
            moves=report.lines,
        )
        return EvaluationOutcome(
            moves=report.lines,
            cancelled=report.cancelled,
            unanalysed=report.unanalysed,
            analysis_enabled=report.analysis_enabled,
        )

    def _read_now(self) -> _BoardSnapshot:
        """One coherent read of this workspace, published to nobody.

        What a pure reader does when no evaluation has run yet. Deliberately not
        stored: a read is not a generation, and only :meth:`evaluate` publishes.
        """
        from rotaris_core.requirements.change_host import board_blockers
        from rotaris_core.requirements.delivery.projection import WorkspaceEvidence

        registry, _store = self._opened()
        index = registry.refresh()
        return _BoardSnapshot(
            index=index,
            evidence=WorkspaceEvidence.for_repository(self._workspace),
            relations=board_blockers(self._workspace, index.requirements),
        )

    @traces(SWR.SWR_3412, SWR.SWR_3608, SWR.SWR_3510, SWR.SWR_3511)
    def _decision(
        self,
        index: RequirementIndex,
        relations: RelationBlockers,
    ) -> ScheduleDecision:
        """What the scheduler would start right now, for the board to show.

        The limits are the workspace's own (SWR-3608) — the same
        :func:`~rotaris.views.requirement_queue.load_scheduling_limits` the queue
        panel and the run starter read, so a concurrency the user lowered is
        reflected in the queue on the next read rather than at the next launch.

        A stopped queue still produces a decision: SWR-3608 asks a stop to be
        *visible*, and a queue view that emptied itself would say "nothing to
        do" where the truth is "you stopped me".

        *relations* holds the contradictions, so a requirement that cannot run
        until somebody decides between it and another is *held* rather than
        selected (SWR-3511's third criterion). Computed once per pass and shared
        with the reader, so the queue and the blocker panel cannot disagree about
        which requirements are stopped.
        """
        from rotaris.services.requirements_actions import schedule_now
        from rotaris.views.requirement_queue import load_scheduling_limits

        return schedule_now(
            self._workspace,
            limits=load_scheduling_limits(self._workspace),
            requirement_for=index.requirement,
            relations=relations,
            at=dt.datetime.now(dt.UTC),
        )

    def _opened(self) -> tuple[RequirementRegistry, DeliveryStore]:
        """The registry and store of this workspace, opened once.

        Raises :class:`RequirementsUnavailableError` when the workspace has no
        requirement store — a stated absence, never an empty board pretending
        the project has no requirements.

        *Once* is what the lock is for. The board pass and the detail pass run
        on two threads, and on a cold board both arrive here: unguarded, each
        builds its own registry, one is silently dropped with the snapshot cache
        it just filled, and the source is read twice.
        """
        from rotaris_core.requirements.delivery.store import DeliveryStore as Store
        from rotaris_core.requirements.registry import RequirementRegistry as Registry

        from rotaris.services.requirements_actions import requirement_source_for

        with self._lock:
            registry, store = self._registry, self._store
            if registry is None or store is None:
                # The same choice the write path makes (SWR-3115): a configured
                # source if the workspace has one, the built-in store otherwise. Two
                # different answers here and there would let a user edit through one
                # store and read from another.
                source = requirement_source_for(self._workspace)
                if source is None:
                    # Discovery runs here and its result travels with the refusal
                    # (SWR-3120): the board states what was found *and* can offer
                    # the mapping, which a formatted sentence alone cannot.
                    outcome = discover_requirement_source(self._workspace)
                    raise RequirementsUnavailableError(
                        f"{self._workspace} keeps no requirement store that Rotaris can read.\n\n"
                        + describe_proposal(outcome),
                        outcome=outcome,
                    )
                registry = Registry([source])
                store = Store(self._workspace)
                self._registry, self._store, self._source = registry, store, source
        return registry, store

    @traces(SWR.SWR_3311, SWR.SWR_3216)
    def project(self) -> BoardProjection:
        """The board this workspace's last evaluation left, projected.

        **Reads only; never writes** — which is what the port has always said and
        what this implementation did not do (SWR-3216). The propagation pass that
        used to run first is :meth:`evaluate`, and a caller that wants a card
        moved asks for it by name.

        Renders the generation :meth:`evaluate` published, so a projection issued
        straight after one shows the moves it made — the delivery records are read
        fresh by the projector on every call, which is why they are not part of
        the snapshot. With no evaluation yet, it reads the workspace itself and
        publishes nothing: a read is not a generation.

        SWR-3502 is not weakened by this. It asks a delivered requirement whose
        text moved to reach ``Needs Update`` *on evaluation, without user action*,
        and an evaluation is exactly what now runs — on the pass that says so.
        """
        from rotaris_core.requirements.delivery.projection import BoardProjector
        from rotaris_core.requirements.execution.reader import WorkspaceExecution

        _registry, store = self._opened()
        # One load, used whole (see :class:`_BoardSnapshot`).
        snapshot = self._snapshot
        if snapshot is None:
            snapshot = self._read_now()
        index, evidence, relations = snapshot.index, snapshot.evidence, snapshot.relations
        projector = BoardProjector(
            index,
            store,
            evidence=evidence,
            # Units, runs, integrations and the review payload as SWR-3400 left
            # them on disk. Without this the board would render every execution
            # field empty forever, which is the one way the two halves of this
            # feature can look correct separately and be wrong together.
            execution=WorkspaceExecution(
                self._workspace,
                delivery=store,
                requirement_for=index.requirement,
                # The scheduler's decision, computed here (SWR-3412). This
                # replaces the reasoning that stood here while nothing consumed
                # a decision: "a board that computed one would show a queue no
                # scheduler agreed to". That was true of a board deriving its own
                # ordering; it is not true of this, because
                # `schedule()` is *pure* and this is the same call the run
                # starter makes, over the same stores. Same facts, same answer —
                # the only difference between the queue a user reads and the work
                # that starts is the moment each was asked, which is what "live"
                # means. Deriving it twice is what would produce two answers.
                decision=self._decision(index, relations),
                relations=relations,
            ),
            clock=lambda: dt.datetime.now(dt.UTC),
        )
        return projector.project()

    @traces(SWR.SWR_3313, SWR.SWR_3311)
    def project_detail(self, req_id: str) -> BoardProjection:
        """The board again, with *req_id*'s deep views filled in (SWR-3216).

        The half :meth:`project` leaves out. The revision history is the engine's
        own join of the source's commits, the hashes Rotaris recorded and the
        deliveries (SWR-3214); the audit trail is what actually happened
        (SWR-3213). Both are read through
        :class:`~rotaris_core.requirements.delivery.projection.StoredDetails` —
        the desktop assembles neither, and could not: the join needs the
        requirement's own revisions and this side of the seam has no business
        reading a git log (SWR-3311).

        ``GitArtifactRevisions.for_repo`` answers ``None`` for a workspace that
        is not a checkout, and the assembled history then *states* that the
        source keeps no history of its own rather than presenting the hashes
        Rotaris happens to have recorded as if they were the whole story.
        """
        from rotaris_core.requirements.change_host import board_blockers
        from rotaris_core.requirements.delivery.audit import AuditStore
        from rotaris_core.requirements.delivery.history import GitArtifactRevisions
        from rotaris_core.requirements.delivery.projection import (
            BoardProjector,
            StoredDetails,
            WorkspaceEvidence,
        )
        from rotaris_core.requirements.execution.reader import WorkspaceExecution

        registry, store = self._opened()
        # One load of the whole snapshot, never three of its parts: the board
        # pass this interleaves with replaces all of them together, and a detail
        # built from one pass's index beside the next pass's evidence would
        # describe a board that never existed. No snapshot at all means no board
        # pass has run yet, and then everything is rebuilt — all of it or none
        # of it. What is rebuilt here stays unpublished: a detail pass never
        # becomes the board's generation.
        snapshot = self._snapshot
        if snapshot is not None:
            index, evidence, relations = snapshot.index, snapshot.evidence, snapshot.relations
        else:
            index = registry.refresh()
            evidence = WorkspaceEvidence.for_repository(self._workspace)
            relations = board_blockers(self._workspace, index.requirements)
        projector = BoardProjector(
            index,
            store,
            evidence=evidence,
            execution=WorkspaceExecution(
                self._workspace,
                delivery=store,
                requirement_for=index.requirement,
                # The same decision the board behind this card is showing: a
                # detail pass that omitted it would drop the card's queue entry
                # and its dependency blockers the moment a user opened it.
                decision=self._decision(index, relations),
                relations=relations,
            ),
            # ``workspace`` is only for the offer (SWR-3616): what this
            # requirement's last analysis concluded, and what accepting it would
            # do. Read here rather than on the board pass because it costs an
            # analysis-log read per card and the board has fifteen hundred.
            details=StoredDetails(
                AuditStore(self._workspace),
                revisions=GitArtifactRevisions.for_repo(self._workspace),
                workspace=self._workspace,
            ),
            clock=lambda: dt.datetime.now(dt.UTC),
        )
        # Narrowed to the one card: every deep view reads a log of its own, and
        # the revision history reads the source's history per requirement.
        return projector.project(req_ids=(req_id,))


@traces(SWR.SWR_3311)
def board_source_for(workspace: Path | None) -> WorkspaceBoard | None:
    """The board source for *workspace*, or ``None`` when there is no workspace.

    Deliberately does not check whether the workspace *has* a store: that read
    belongs on the worker thread, and answering it here would put filesystem
    work in the window's constructor.
    """
    return WorkspaceBoard(workspace) if workspace is not None else None


# ── what changed (SWR-3312) ────────────────────────────────────────────────


@traces(SWR.SWR_3312)
@dataclass(frozen=True)
class BoardDelta:
    """Which cards an evaluation moved — the input of an in-place update.

    A view given this repaints :attr:`changed` and leaves everything else, and
    with it the selection, the scroll position and the open detail view. A view
    given only "here is a new board" cannot do that, which is why the diff is
    computed here, on the worker thread, rather than guessed at in a paint
    handler.
    """

    changed: tuple[str, ...] = ()
    added: tuple[str, ...] = ()
    removed: tuple[str, ...] = ()
    #: Whether any card sits in a different column than before. Column
    #: membership is the one change a card repaint cannot express.
    columns_changed: bool = False
    #: The first board of a session: there is nothing to update in place.
    first: bool = False

    @property
    def empty(self) -> bool:
        """Whether the evaluation changed nothing a user could see."""
        return not (self.changed or self.added or self.removed or self.columns_changed)

    @property
    def rebuild_required(self) -> bool:
        """Whether the board's layout has to be rebuilt rather than repainted."""
        return self.first or bool(self.added or self.removed) or self.columns_changed

    @property
    def touched(self) -> tuple[str, ...]:
        """Every id this evaluation affected, in board order."""
        return (*self.added, *self.changed, *self.removed)


@traces(SWR.SWR_3312)
def diff_board(
    previous: RequirementsBoardState,
    current: RequirementsBoardState,
) -> BoardDelta:
    """What changed between two boards — pure, and exact.

    "Changed" is structural equality of the rendered card, not of the
    projection: two passes over an unchanged repository produce equal cards and
    therefore an empty delta, and a re-evaluation that only re-timestamped the
    board repaints nothing.
    """
    if not previous.available:
        return BoardDelta(added=current.ids, first=True, columns_changed=bool(current.columns))
    before, after = previous.ids, current.ids
    was, now = set(before), set(after)
    added = tuple(req_id for req_id in after if req_id not in was)
    removed = tuple(req_id for req_id in before if req_id not in now)
    arrived = set(added)
    changed = tuple(
        req_id
        for req_id in after
        if req_id not in arrived and previous.card(req_id) != current.card(req_id)
    )
    columns_changed = tuple((column.key, column.req_ids) for column in previous.columns) != tuple(
        (column.key, column.req_ids) for column in current.columns
    )
    return BoardDelta(
        changed=changed,
        added=added,
        removed=removed,
        columns_changed=columns_changed,
    )


# ── the bridge ─────────────────────────────────────────────────────────────


class _ProjectionWorker(QObject):
    """One evaluation, on a thread of its own.

    Holds nothing the main thread can mutate: the source, an immutable previous
    board and a clock. That is what makes emitting the result across the thread
    boundary safe without a lock.
    """

    finished = Signal()
    #: ``(state, delta, projection, EvaluationOutcome | None)`` — the outcome
    #: rides along rather than taking a signal of its own, so one pass is one
    #: delivery. ``None`` when the source is a pure reader, which is the only
    #: case where no evaluation ran.
    produced = Signal(object, object, object, object)
    failed = Signal(str)
    #: The reason, and the discovery outcome behind it when there was one
    #: (SWR-3120). A frozen pydantic model, so it crosses this boundary under
    #: the same rule the projection does.
    unavailable = Signal(str, object)

    def __init__(
        self,
        source: BoardSource,
        previous: RequirementsBoardState,
        clock: Callable[[], dt.datetime],
        *,
        kind: RefreshKind = RefreshKind.ANALYSE,
        cancel: CancelToken | None = None,
    ) -> None:
        super().__init__()
        self._source = source
        self._previous = previous
        self._clock = clock
        self._kind = kind
        self._cancel = cancel

    @Slot()
    def run(self) -> None:
        outcome: EvaluationOutcome | None = None
        try:
            # Two stages, one thread run, in this order. The evaluation is the
            # write (SWR-3216) and the projection is the read that renders what
            # it left; a source that satisfies only ``BoardSource`` — every test
            # double, and any future read-only implementation — is simply never
            # asked to write, which is the whole point of the split.
            if isinstance(self._source, BoardEvaluation):
                from rotaris_core.requirements.change_host import EvaluationDepth as Depth

                outcome = self._source.evaluate(
                    depth=Depth.FULL if self._kind is RefreshKind.ANALYSE else Depth.RULES_ONLY,
                    cancel=self._cancel,
                )
            projection = self._source.project()
            state = build_board_state(projection, now=self._clock())
            delta = diff_board(self._previous, state)
        except RequirementsUnavailableError as exc:
            self.unavailable.emit(str(exc) or NO_SOURCE_REASON, exc.outcome)
        except Exception as exc:  # noqa: BLE001 — every failure is one sentence to the user
            self.failed.emit(f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__)
        else:
            # The projection travels with the board: the detail view is built
            # from one entry on demand (SWR-3307), and rebuilding several
            # hundred details per pass to keep it out of the bridge would cost
            # every evaluation for the one card a user opens.
            self.produced.emit(state, delta, projection, outcome)
        finally:
            self.finished.emit()


class _DetailWorker(QObject):
    """One requirement's deep read, on a thread of its own (SWR-3313).

    Same shape as :class:`_ProjectionWorker` and for the same reason: it reads
    the audit trail and the source's own revision history, and neither belongs on
    the thread that is painting the panel.
    """

    finished = Signal()
    produced = Signal(str, object)
    failed = Signal(str, str)

    def __init__(self, source: DetailSource, req_id: str) -> None:
        super().__init__()
        self._source = source
        self._req_id = req_id

    @Slot()
    def run(self) -> None:
        try:
            projection = self._source.project_detail(self._req_id)
        except Exception as exc:  # noqa: BLE001 — a failed deep read is one sentence
            self.failed.emit(
                self._req_id,
                f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__,
            )
        else:
            self.produced.emit(self._req_id, projection)
        finally:
            self.finished.emit()


@traces(SWR.SWR_3311, SWR.SWR_3312)
class RequirementsBridge(QObject):
    """Evaluates the board off the Qt thread and reports what moved.

    The only object in the desktop that talks to the requirement engine. It
    keeps the last good board so a failed evaluation can leave it on screen
    (SWR-3312), and refuses a second evaluation while one is in flight so a
    board cannot be rebuilt from two passes at once.
    """

    #: ``(RequirementsBoardState, BoardDelta)`` — a complete board and what
    #: changed in it since the last one.
    evaluated = Signal(object, object)
    #: A projection was attempted and raised; the last good board still stands.
    failed = Signal(str)
    #: ``(reason, DiscoveryOutcome | None)`` — nothing can produce a projection
    #: here, this is why, and this is the mapping Rotaris would propose instead
    #: (SWR-3120).
    unavailable = Signal(str, object)
    busy_changed = Signal(bool)
    #: True while a pass that may consult a model is in flight, false when it
    #: ends (SWR-3319). Deliberately not a second name for :attr:`busy_changed`:
    #: every refresh is busy, and only this one can take minutes and is worth
    #: offering a stop for. A surface that overloads ``loading`` for both cannot
    #: tell a user which one they are waiting on.
    analysing_changed = Signal(bool)
    #: ``RequirementDetail`` — one requirement's detail with its deep views read
    #: (SWR-3313). Arrives after :meth:`detail_for` has already answered with the
    #: board's own entry, so a panel opens at once and deepens when this lands.
    detail_ready = Signal(object)
    #: ``(req_id, message)`` — the deep read of one requirement failed. The
    #: shallow detail stays on screen; only its history says it could not be read.
    detail_failed = Signal(str, str)

    def __init__(
        self,
        source: BoardSource | None = None,
        *,
        clock: Callable[[], dt.datetime] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._source = source
        self._clock: Callable[[], dt.datetime] = (
            clock if clock is not None else lambda: dt.datetime.now(dt.UTC)
        )
        self._state = RequirementsBoardState()
        self._projection: BoardProjection | None = None
        self._thread: QThread | None = None
        self._worker: _ProjectionWorker | None = None
        #: The in-flight analysing pass's stop signal, or ``None`` when the pass
        #: running is a cheap one — which is also what makes :attr:`analysing`
        #: answerable without a second flag to keep in step.
        self._cancel: CancelToken | None = None
        self._detail_thread: QThread | None = None
        self._detail_worker: _DetailWorker | None = None

    @property
    def source(self) -> BoardSource | None:
        """What produces projections here, or ``None`` when nothing does."""
        return self._source

    @traces(SWR.SWR_3307)
    def detail_for(self, req_id: str) -> RequirementDetail | None:
        """One requirement's detail view, built from the last projection.

        ``None`` when the last projection did not carry that id — a card that
        vanished between the click and the open is a real race, and inventing a
        detail for it would show a requirement that no longer exists.

        The board's own projection carries no revision history (see the module
        docstring), so the detail this returns says the history is still being
        read whenever a deep read can follow — never that there is none.
        """
        projection = self._projection
        entry = projection.entry(req_id) if projection is not None else None
        if entry is None:
            return None
        return build_detail(
            entry,
            now=self._clock(),
            history_pending=entry.history is None and self._detail_source is not None,
        )

    @property
    def _detail_source(self) -> DetailSource | None:
        """The source's deep half, when it has one."""
        source = self._source
        return source if isinstance(source, DetailSource) else None

    @traces(SWR.SWR_3313, SWR.SWR_3307)
    def open_detail(self, req_id: str) -> bool:
        """Read *req_id*'s deep views off the Qt thread. ``False`` if none started.

        The answer arrives on :attr:`detail_ready`. Refused rather than queued
        while another deep read is in flight, for the same reason a second board
        evaluation is: two answers for two different cards racing into one panel
        is worse than the second click doing nothing.
        """
        source = self._detail_source
        if source is None or not req_id:
            return False
        if self._detail_thread is not None and self._detail_thread.isRunning():
            return False
        worker = _DetailWorker(source, req_id)
        worker.produced.connect(self._detail_produced)
        worker.failed.connect(self.detail_failed)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        # Collected on this thread, exactly as the projection worker is, and for
        # the same PySide reason — see :meth:`refresh`.
        thread.finished.connect(self._detail_finished)
        self._detail_thread = thread
        self._detail_worker = worker
        thread.start()
        return True

    @Slot(str, object)
    def _detail_produced(self, req_id: str, projection: BoardProjection) -> None:
        entry = projection.entry(req_id)
        if entry is None:
            self.detail_failed.emit(req_id, f"{req_id} is no longer in the projection")
            return
        self.detail_ready.emit(build_detail(entry, now=self._clock()))

    @Slot()
    def _detail_finished(self) -> None:
        """Retire the finishing thread, and only its own — see :meth:`_finished`."""
        thread = self.sender()
        if not isinstance(thread, QThread):
            return
        thread.deleteLater()
        if thread is not self._detail_thread:
            return  # already reaped, or a predecessor finishing late
        self._detail_thread = None
        self._detail_worker = None

    @property
    def busy(self) -> bool:
        """Whether an evaluation is in flight."""
        return self._thread is not None and self._thread.isRunning()

    @property
    def analysing(self) -> bool:
        """Whether the pass in flight is one that may consult a model (SWR-3319)."""
        return self._cancel is not None and self.busy

    @traces(SWR.SWR_3319)
    def cancel_analysis(self) -> bool:
        """Ask the analysing pass to stop. ``False`` when there is nothing to stop.

        Never abandons the pass. The deterministic rules have already been
        applied and are not taken back (SWR-3519), the projection still runs,
        and the board lands on the truth — a stop is the difference between
        waiting for the remaining judgements and not, never the difference
        between a board and no board.
        """
        token = self._cancel
        if token is None or not self.busy:
            return False
        token.cancel()
        return True

    @property
    def state(self) -> RequirementsBoardState:
        """The last board this bridge produced — the one a failure keeps."""
        return self._state

    @traces(SWR.SWR_3312, SWR.SWR_3319)
    def refresh(self, kind: RefreshKind = RefreshKind.ANALYSE) -> bool:
        """Start an evaluation. ``False`` when it did not start, and why is stated.

        Never blocks the caller: the read happens on a worker thread and the
        answer arrives on :attr:`evaluated`. A window that calls this while
        painting stays painted.

        *kind* is what this refresh is allowed to cost (SWR-3319). It defaults to
        the expensive one so that a caller which says nothing gets exactly the
        behaviour this bridge had before the kinds existed; the decision of which
        refresh deserves which cost belongs to the call site, and the controller
        makes it one trigger at a time.
        """
        if self._source is None:
            # No workspace at all: there is no tree to survey, so no proposal
            # can exist. Distinct from a workspace whose store went unread.
            self.unavailable.emit(NO_SOURCE_REASON, None)
            return False
        if self.busy:
            return False
        cancel = None
        if kind is RefreshKind.ANALYSE:
            from rotaris_core.requirements.registry import CancelToken

            # One token per pass: it is an `Event` that never resets, so reusing
            # one would make every pass after the first cancelled on arrival.
            cancel = CancelToken()
        worker = _ProjectionWorker(
            self._source,
            self._state,
            self._clock,
            kind=kind,
            cancel=cancel,
        )
        worker.produced.connect(self._produced)
        worker.failed.connect(self.failed)
        worker.unavailable.connect(self.unavailable)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        # Deliberately *not* `thread.finished.connect(worker.deleteLater)`, the
        # usual Qt recipe: this worker holds Python objects (the source, the
        # previous board, the clock), and a deferred delete delivered on the
        # finishing thread frees that wrapper off the main thread — PySide 6.8
        # faults there. `_finished` runs on this thread and drops the last
        # reference, so the worker is collected where it was created.
        thread.finished.connect(self._finished)
        self._thread = thread
        self._worker = worker
        self._cancel = cancel
        thread.start()
        self.busy_changed.emit(True)
        if cancel is not None:
            self.analysing_changed.emit(True)
        return True

    @Slot(object, object, object, object)
    def _produced(
        self,
        state: RequirementsBoardState,
        delta: BoardDelta,
        projection: BoardProjection,
        outcome: EvaluationOutcome | None,
    ) -> None:
        # What is owed and whether asking would pay it off are facts about the
        # workspace, not about this projection, so a pass that ran no evaluation
        # carries the last answer forward rather than blanking it — a pure
        # reader knows nothing about the worklist, and saying "none" would make
        # the offer flicker off and back on.
        previous = self._state
        self._state = replace(
            state,
            unanalysed=outcome.unanalysed if outcome is not None else previous.unanalysed,
            analysis_enabled=(
                outcome.analysis_enabled if outcome is not None else previous.analysis_enabled
            ),
        )
        self._projection = projection
        self.evaluated.emit(self._state, delta)

    def _retire(self) -> None:
        """Drop the current pass's bookkeeping and say it ended.

        Not the thread's own destruction — that stays on :meth:`_finished`, so
        ``deleteLater`` is called exactly once, from the signal, on this thread.
        """
        analysing = self._cancel is not None
        self._thread = None
        self._worker = None
        self._cancel = None
        self.busy_changed.emit(False)
        if analysing:
            self.analysing_changed.emit(False)

    @Slot()
    def _finished(self) -> None:
        """Retire the thread that finished, and only its own bookkeeping.

        ``QThread.finished`` is delivered to this thread as a queued call, so it
        can arrive *after* the next pass has already started: :attr:`busy` reads
        ``isRunning()``, which goes false the moment the thread stops, while this
        slot may still be sitting in the event queue. A caller refreshing in that
        window used to have its pass's thread, worker and cancellation token
        cleared out from under it by its predecessor — leaving ``busy`` false
        during a live pass, so a third refresh could start beside it, and leaving
        :meth:`cancel_analysis` with nothing to cancel while an analysis ran.

        Which pass is finishing is therefore not a question to answer from the
        attribute — it is asked of the signal, through :meth:`~QObject.sender`.
        Deliberately not a bound thread captured in the connection: a connection
        that keeps its own reference to the ``QThread`` outlives the
        ``deleteLater`` below, and PySide faults on the stale wrapper during
        teardown.
        """
        thread = self.sender()
        if not isinstance(thread, QThread):
            return
        thread.deleteLater()
        if thread is not self._thread:
            return  # already reaped, or a predecessor finishing late
        self._retire()

    def shutdown(self) -> None:
        """Let in-flight reads finish, so no thread outlives the window."""
        for thread in (self._thread, self._detail_thread):
            if thread is not None and thread.isRunning():
                thread.quit()
                thread.wait(5000)
