"""One requirement index over several sources (SWR-3115), refreshed incrementally
and off the UI thread (SWR-3116).

Real projects rarely keep requirements in exactly one place: a Markdown store for
product requirements and an issue tracker for customer requests is the normal
case. The registry is what makes that one board — it reads every configured
source, tags each requirement with the source it came from, and publishes a
single :class:`RequirementIndex` that hierarchy (SWR-3108), relations (SWR-3109)
and everything downstream reads.

Four behaviours carry the weight, and each of them is a test:

- **Nothing shadows anything.** An id two sources both declare is a
  :class:`IdCollision` naming *both* source ids and *both* artefact paths. One
  of them wins deterministically (configuration order) so the board is usable,
  and the collision is reported so the duplicate is fixable rather than
  invisible.
- **One broken source does not empty the board.** A source that raises becomes a
  named :class:`~rotaris_core.requirements.sources.base.SourceFailure`; the other
  sources still load. Its requirements are *dropped*, not served from an older
  read — serving them would make Rotaris a second requirement repository
  (SWR-3114) — but their ids are remembered as
  :class:`UnavailableRequirement`, which is how the product can say "unavailable"
  instead of either lying or forgetting.
- **An unchanged artefact is not re-read.** Refresh is keyed on each source's
  ``revision()`` and, for a source that can address its artefacts, on each
  artefact's own revision. A source whose revision did not move costs one call;
  a source where one file changed costs one file. :class:`RefreshReport` states
  exactly what was read, so "incremental" is asserted by counting reads rather
  than by timing anything.
- **Consumers never see a half-built index.** The new index is assembled in full
  and then published by a single attribute rebind under a lock. A cancelled or
  failed refresh publishes nothing at all, which is what "leaves the previous
  index intact" means. :meth:`RequirementRegistry.refresh_in_background` runs the
  same code on a worker thread, because the caller of a refresh is the Qt main
  thread (SWR-3312) and a store of several hundred requirements is filesystem
  work.

Removals are folded in here too: comparing the previous read of a source against
its current one is where a tombstone comes from (SWR-3113), and the registry is
the only place that holds both sides of that comparison.
"""

from __future__ import annotations

import datetime as dt
import logging
import threading
from enum import StrEnum
from functools import cached_property
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    RequirementHierarchy,
    build_hierarchy,
    requirement_sort_key,
)
from rotaris_core.requirements.relations import RelationGraph, build_relation_graph
from rotaris_core.requirements.sources.base import (
    RequirementArtifact,
    RequirementSource,
    SourceFailure,
    SourceIssue,
    SourceRead,
)
from rotaris_core.requirements.tombstones import (
    NullRetiredIdRecorder,
    RetiredIdRecorder,
    Tombstone,
    TombstoneLog,
)

if TYPE_CHECKING:
    # ``change.detection`` reaches ``delivery``, and ``delivery`` reaches back
    # here — so the baseline value this module persists is imported where it is
    # used, never at module scope (AGENTS.md § Imports and boundaries).
    from collections.abc import Callable, Iterable, Mapping, Sequence

    from rotaris_core.requirements.change.detection import BaselineEntry, RequirementBaseline
    from rotaris_core.requirements.memory import RegistryMemory

__all__ = [
    "Availability",
    "CancelToken",
    "IdCollision",
    "IncrementalRequirementSource",
    "RefreshCancelledError",
    "RefreshReport",
    "RequirementIndex",
    "RequirementRegistry",
    "SourceClaim",
    "SourceRefresh",
    "SourceSnapshot",
    "UnavailableRequirement",
]

#: How the registry stamps the moment a removal was observed.
type Clock = Callable[[], dt.datetime]


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class RefreshCancelledError(RuntimeError):
    """A refresh was cancelled; the previously published index still stands."""


@traces(SWR.SWR_3116)
class CancelToken:
    """A refresh's stop signal, safe to set from another thread.

    Cancellation exists because the trigger for a refresh (SWR-3210) can fire
    again while one is running, and because the user can close the view. It is
    checked between sources and between artefacts, so the cost of a cancelled
    refresh is bounded by one artefact read rather than by the whole store.
    """

    __slots__ = ("_event",)

    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        """Ask the running refresh to stop at its next checkpoint."""
        self._event.set()

    @property
    def cancelled(self) -> bool:
        """Whether cancellation has been requested."""
        return self._event.is_set()

    def raise_if_cancelled(self, where: str = "") -> None:
        """Abort the refresh when cancellation has been requested."""
        if self._event.is_set():
            suffix = f" at {where}" if where else ""
            raise RefreshCancelledError(f"requirement index refresh cancelled{suffix}")


@runtime_checkable
class IncrementalRequirementSource(RequirementSource, Protocol):
    """A source that can read *some* of its artefacts (SWR-3116).

    Optional, exactly like the write capabilities of SWR-3105: an adapter that
    cannot address its artefacts individually is still a first-class source and
    is simply re-read in full when its revision moves. Declaring this is what
    lets a one-file change in a four-hundred-requirement store cost one file.
    """

    def read_artifacts(self, artifact_ids: Sequence[str]) -> SourceRead: ...


@traces(SWR.SWR_3115)
class SourceClaim(BaseModel):
    """One source's claim on a requirement id, with the artefact behind it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    location: str | None = None


@traces(SWR.SWR_3115)
class IdCollision(BaseModel):
    """One id declared by more than one source — reported, never resolved silently."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: In configuration order; the first claim is the one the index serves.
    claims: tuple[SourceClaim, ...]

    @property
    def winner(self) -> str:
        """The source whose requirement the index holds."""
        return self.claims[0].source_id

    @property
    def message(self) -> str:
        """One line naming every source and artefact that declared the id."""
        parts = [
            f"{claim.source_id}" + (f" ({claim.location})" if claim.location else "")
            for claim in self.claims
        ]
        return (
            f"{self.req_id} is declared by several sources: {', '.join(parts)};"
            f" the board shows {self.winner}'s"
        )


class Availability(StrEnum):
    """Whether a requirement id can be answered for right now (SWR-3114)."""

    AVAILABLE = "available"
    #: The source no longer declares it — see the tombstone (SWR-3113).
    REMOVED = "removed"
    #: Its source could not be read; its text is not Rotaris' to serve.
    SOURCE_UNAVAILABLE = "source-unavailable"
    UNKNOWN = "unknown"


@traces(SWR.SWR_3114, SWR.SWR_3115)
class UnavailableRequirement(BaseModel):
    """An id whose source failed to read: remembered, but never served from cache.

    Carries identity and provenance only. That is the whole point — Rotaris knows
    *that* the id existed and where it came from, and cannot answer what it said,
    because requirement text is the project's and is read from the source
    (SWR-3114).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    source_id: str
    reason: str = ""


@traces(SWR.SWR_3116)
class SourceRefresh(BaseModel):
    """What one source cost in one refresh — the incremental claim, as data."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    revision: str = ""
    #: True when nothing at all was read: the source's revision had not moved.
    reused: bool = False
    #: True when the whole source was re-read (no snapshot, or not addressable).
    full_read: bool = False
    #: Artefact ids re-read individually, in read order.
    artifacts_read: tuple[str, ...] = ()
    failed: bool = False

    @property
    def incremental(self) -> bool:
        """True when this source was refreshed artefact by artefact."""
        return not (self.reused or self.full_read or self.failed)


@traces(SWR.SWR_3116)
class RefreshReport(BaseModel):
    """What a refresh did, per source. The evidence for "incremental"."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    sources: tuple[SourceRefresh, ...] = ()
    generation: int = 0

    def of_source(self, source_id: str) -> SourceRefresh | None:
        """This refresh's record for one source."""
        return next((entry for entry in self.sources if entry.source_id == source_id), None)

    @property
    def artifacts_read(self) -> tuple[str, ...]:
        """Every artefact re-read in this refresh, across all sources."""
        return tuple(artifact_id for entry in self.sources for artifact_id in entry.artifacts_read)

    @property
    def full_reads(self) -> tuple[str, ...]:
        """Sources that had to be read whole."""
        return tuple(entry.source_id for entry in self.sources if entry.full_read)


@traces(SWR.SWR_3114, SWR.SWR_3116)
class SourceSnapshot(BaseModel):
    """One source's last successful read, keyed by the revision it was read at.

    The only cache SWR-3114 permits: a revision-keyed read-through that is
    discarded the moment ``revision()`` reports something else. It holds no
    authority — the source does — and it is never consulted for a source that is
    currently failing.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    revision: str
    requirements: tuple[CanonicalRequirement, ...] = ()
    issues: tuple[SourceIssue, ...] = ()
    #: Per-artefact revision at that read, for the artefacts that declared one.
    artifact_revisions: dict[str, str] = {}
    #: Which requirement ids each artefact declared, for the partial-read path.
    artifact_requirements: dict[str, tuple[str, ...]] = {}

    def matches(self, revision: str) -> bool:
        """Whether this snapshot still describes the source's current content."""
        return self.revision == revision

    def by_id(self) -> dict[str, CanonicalRequirement]:
        """The snapshot's requirements indexed by id."""
        return {requirement.req_id: requirement for requirement in self.requirements}


@traces(SWR.SWR_3115, SWR.SWR_3116)
class RequirementIndex(BaseModel):
    """Every requirement this workspace has, from every source, at one moment.

    Immutable and complete: the registry publishes it in one rebind, so a
    consumer either sees the whole previous index or the whole new one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    requirements: tuple[CanonicalRequirement, ...] = ()
    #: Source id -> the revision that source was read at.
    revisions: dict[str, str] = {}
    failures: tuple[SourceFailure, ...] = ()
    issues: tuple[SourceIssue, ...] = ()
    collisions: tuple[IdCollision, ...] = ()
    tombstones: tuple[Tombstone, ...] = ()
    unavailable: tuple[UnavailableRequirement, ...] = ()
    #: Increments once per published refresh, so a consumer can tell two indexes
    #: apart without comparing their contents.
    generation: int = 0

    @cached_property
    @traces(SWR.SWR_3223)
    def _by_id(self) -> dict[str, CanonicalRequirement]:
        """The id map, built once for an index that cannot change.

        The index is frozen and published in one rebind (SWR-3116), so a mapping
        derived from its requirements is as immutable as they are — this is a
        shape, not a cache with a lifetime. It is here because the projection
        asked :meth:`availability` per requirement and each ask rebuilt a
        1527-entry dict: 0.19s of a 2.2s board pass, for a dict that is the same
        dict every time (SWR-3317).
        """
        return {requirement.req_id: requirement for requirement in self.requirements}

    @cached_property
    @traces(SWR.SWR_3223)
    def _unavailable_ids(self) -> frozenset[str]:
        """Ids whose source could not be read, for the same reason as :attr:`_by_id`."""
        return frozenset(entry.req_id for entry in self.unavailable)

    @cached_property
    @traces(SWR.SWR_3223)
    def _tombstones_by_id(self) -> dict[str, Tombstone]:
        """Tombstones keyed by id, for the same reason as :attr:`_by_id`."""
        return {entry.req_id: entry for entry in self.tombstones}

    def by_id(self) -> dict[str, CanonicalRequirement]:
        """The index keyed by requirement id.

        Returns the shared mapping rather than a copy. Callers have always been
        readers — mutating it would have been meaningless before, when every call
        built a fresh dict nobody else could see, and is now visible to the next
        caller, so it is a bug either way. Kept a method rather than turned into a
        property because every call site in the repository already spells it as
        one, and renaming a reader to say the same thing is churn.
        """
        return self._by_id

    def requirement(self, req_id: str) -> CanonicalRequirement | None:
        """The live requirement with that id, or ``None``."""
        return self._by_id.get(req_id)

    @property
    def ids(self) -> tuple[str, ...]:
        """Every live id, in natural id order."""
        return tuple(requirement.req_id for requirement in self.requirements)

    def of_source(self, source_id: str) -> tuple[CanonicalRequirement, ...]:
        """The requirements one source contributed (SWR-3115 attribution)."""
        return tuple(
            requirement for requirement in self.requirements if requirement.source_id == source_id
        )

    def source_of(self, req_id: str) -> str | None:
        """Which source a requirement came from."""
        requirement = self.requirement(req_id)
        return requirement.source_id if requirement is not None else None

    def tombstone(self, req_id: str) -> Tombstone | None:
        """The tombstone for a removed id, when there is one (SWR-3113)."""
        return self._tombstones_by_id.get(req_id)

    @traces(SWR.SWR_3114)
    def availability(self, req_id: str) -> Availability:
        """Whether *req_id* can be answered for, and if not, why not.

        The product-visible half of SWR-3114: with the source gone, the answer is
        "unavailable", never a cached rendering of what it used to say.
        """
        if req_id in self._by_id:
            return Availability.AVAILABLE
        if req_id in self._unavailable_ids:
            return Availability.SOURCE_UNAVAILABLE
        tombstone = self.tombstone(req_id)
        if tombstone is not None and tombstone.active:
            return Availability.REMOVED
        return Availability.UNKNOWN

    def unavailable_reason(self, req_id: str) -> str:
        """Why *req_id* has no answer, or ``""`` when it does."""
        state = self.availability(req_id)
        if state is Availability.AVAILABLE:
            return ""
        if state is Availability.SOURCE_UNAVAILABLE:
            entry = next(entry for entry in self.unavailable if entry.req_id == req_id)
            return f"{req_id} is unavailable: its source {entry.source_id!r} could not be read" + (
                f" ({entry.reason})" if entry.reason else ""
            )
        if state is Availability.REMOVED:
            tombstone = self.tombstone(req_id)
            return tombstone.message if tombstone is not None else f"{req_id} was removed"
        return f"{req_id} is not declared by any configured requirement source"

    def hierarchy(self) -> RequirementHierarchy:
        """Parent/child structure over this index (SWR-3108)."""
        return build_hierarchy(self.requirements)

    def relation_graph(self) -> RelationGraph:
        """Authored and computed relations over this index (SWR-3109, SWR-3110)."""
        return build_relation_graph(self.requirements)


@traces(SWR.SWR_3115, SWR.SWR_3116)
class RequirementRegistry:
    """The configured requirement sources, and the index they produce together.

    Construction is cheap and reads nothing: the first :meth:`refresh` is what
    touches a source, which keeps importing this module free of filesystem work
    and lets a caller decide which thread pays for the read.
    """

    def __init__(
        self,
        sources: Iterable[RequirementSource] = (),
        *,
        clock: Clock = _utc_now,
        tombstones: TombstoneLog | None = None,
        retired_recorder: RetiredIdRecorder | None = None,
        memory: RegistryMemory | None = None,
    ) -> None:
        self._sources: tuple[RequirementSource, ...] = tuple(sources)
        self._clock = clock
        self._recorder: RetiredIdRecorder = (
            retired_recorder if retired_recorder is not None else NullRetiredIdRecorder()
        )
        self._tombstones = tombstones if tombstones is not None else TombstoneLog()
        self._snapshots: dict[str, SourceSnapshot] = {}
        # What the last process left behind (SWR-3119). Read on the first
        # refresh, never in ``__init__`` — construction stays free of I/O, which
        # is what lets a caller decide which thread pays for the read.
        self._memory = memory
        self._baselines: dict[str, RequirementBaseline] = {}
        self._remembered = tombstones is not None or memory is None
        self._index = RequirementIndex()
        self._report = RefreshReport()
        self._lock = threading.Lock()
        self._generation = 0

    # -- configuration -------------------------------------------------------

    def sources(self) -> Sequence[RequirementSource]:
        """The configured sources, in configuration order (SWR-3115 precedence)."""
        return self._sources

    def source(self, source_id: str) -> RequirementSource | None:
        """One configured source by id."""
        return next((one for one in self._sources if one.source_id == source_id), None)

    # -- published state -----------------------------------------------------

    @property
    def index(self) -> RequirementIndex:
        """The last completely built index. Never a partial one."""
        return self._index

    @property
    def last_refresh(self) -> RefreshReport:
        """What the last refresh read — the incremental evidence (SWR-3116)."""
        return self._report

    @property
    def tombstones(self) -> TombstoneLog:
        """Every id seen to disappear so far (SWR-3113)."""
        return self._tombstones

    @property
    def retired_recorder(self) -> RetiredIdRecorder:
        """The store-side retired-ids seam (SWR-2318, unimplemented here)."""
        return self._recorder

    # -- refreshing ----------------------------------------------------------

    @traces(SWR.SWR_3115, SWR.SWR_3116)
    def refresh(
        self,
        *,
        cancel: CancelToken | None = None,
        force: bool = False,
    ) -> RequirementIndex:
        """Re-read what moved and publish a new index.

        Serialised: two refreshes cannot interleave and produce a merged index.
        Cancellation and any unexpected failure propagate *before* publication,
        so the previously published index and the snapshot cache stay exactly as
        they were.
        """
        with self._lock:
            self._remember()
            snapshots, refreshes, failures, unavailable = self._read_sources(cancel, force)
            if cancel is not None:
                cancel.raise_if_cancelled("index assembly")
            tombstones = self._fold_tombstones(snapshots, failures)
            requirements, collisions = _merge(self._sources, snapshots)
            index = RequirementIndex(
                requirements=requirements,
                revisions={source_id: snap.revision for source_id, snap in snapshots.items()},
                failures=failures,
                issues=tuple(issue for snap in snapshots.values() for issue in snap.issues),
                collisions=collisions,
                tombstones=tombstones.entries,
                unavailable=unavailable,
                generation=self._generation + 1,
            )
            # Publication: everything above is local, so a raise anywhere in it
            # leaves the registry on its previous index (SWR-3116).
            self._snapshots = snapshots
            self._tombstones = tombstones
            failed = {failure.source_id for failure in failures}
            self._baselines = self._baselines | {
                source_id: _baseline_of(snapshot)
                for source_id, snapshot in snapshots.items()
                if source_id not in failed
            }
            self._generation += 1
            self._report = RefreshReport(sources=refreshes, generation=self._generation)
            self._index = index
            self._persist()
            return index

    @traces(SWR.SWR_3116)
    def refresh_in_background(
        self,
        *,
        cancel: CancelToken | None = None,
        force: bool = False,
        on_done: Callable[[RequirementIndex], None] | None = None,
        on_error: Callable[[BaseException], None] | None = None,
    ) -> threading.Thread:
        """Run :meth:`refresh` on a worker thread and report the outcome.

        The seam SWR-3116 asks for: the Qt main thread starts this and is handed
        a finished index (or an error) through the callback, instead of blocking
        on a store whose read cost grows with the project. The thread object is
        returned so a caller — a test above all — can join it deterministically.
        """

        def run() -> None:
            try:
                index = self.refresh(cancel=cancel, force=force)
            except BaseException as error:  # noqa: BLE001 - handed to the caller intact
                if on_error is not None:
                    on_error(error)
                return
            if on_done is not None:
                on_done(index)

        thread = threading.Thread(
            target=run,
            name="rotaris-requirement-refresh",
            daemon=True,
        )
        thread.start()
        return thread

    # -- internals -----------------------------------------------------------

    def _read_sources(
        self,
        cancel: CancelToken | None,
        force: bool,
    ) -> tuple[
        dict[str, SourceSnapshot],
        tuple[SourceRefresh, ...],
        tuple[SourceFailure, ...],
        tuple[UnavailableRequirement, ...],
    ]:
        snapshots: dict[str, SourceSnapshot] = {}
        refreshes: list[SourceRefresh] = []
        failures: list[SourceFailure] = []
        unavailable: list[UnavailableRequirement] = []
        for source in self._sources:
            if cancel is not None:
                cancel.raise_if_cancelled(f"source {source.source_id!r}")
            previous = self._snapshots.get(source.source_id)
            try:
                snapshot, refresh = _refresh_source(source, previous, cancel=cancel, force=force)
            except RefreshCancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - one source, named, not the board
                failure = SourceFailure.from_error(source.source_id, error)
                failures.append(failure)
                refreshes.append(SourceRefresh(source_id=source.source_id, failed=True))
                unavailable.extend(
                    UnavailableRequirement(
                        req_id=requirement.req_id,
                        source_id=source.source_id,
                        reason=failure.message,
                    )
                    for requirement in (previous.requirements if previous else ())
                )
                continue
            snapshots[source.source_id] = snapshot
            refreshes.append(refresh)
        return snapshots, tuple(refreshes), tuple(failures), tuple(unavailable)

    def _fold_tombstones(
        self,
        snapshots: Mapping[str, SourceSnapshot],
        failures: Sequence[SourceFailure],
    ) -> TombstoneLog:
        """Turn "was there, is not now" into tombstones — for readable sources only.

        A source that failed contributes nothing here on purpose: its silence is
        an outage, not a removal, and tombstoning its whole set would strand
        every one of its requirements' delivery records.

        "Was there" comes from this process's own snapshot when it has one and
        from the persisted baseline otherwise (SWR-3119). Both arrive as
        ``BaselineEntry`` rather than one being a requirement and the other a
        record, because a fold with two shapes has a path it never exercises —
        and the one it would never have exercised is the cross-process removal,
        which is the only kind a CLI invocation can ever see.

        A source with **no** baseline at all is skipped rather than compared
        against nothing: a first read is not a mass removal, which is the
        distinction ``RequirementBaseline.evaluated`` exists to draw.
        """
        failed = {failure.source_id for failure in failures}
        log = self._tombstones
        at = self._clock()
        for source_id, snapshot in snapshots.items():
            if source_id in failed:
                continue
            previous = self._remembered_for(source_id)
            if previous is None:
                continue
            log = log.observe(
                source_id=source_id,
                previous=previous,
                current={entry.req_id: entry for entry in _entries_of(snapshot)},
                at=at,
                # Only what this process still holds. A removal noticed across a
                # restart has no title, and says so by not inventing one.
                titles=self._titles_for(source_id),
                recorder=self._recorder,
            )
        return log

    def _remembered_for(self, source_id: str) -> dict[str, BaselineEntry] | None:
        """What the last read of *source_id* left behind, or ``None`` for a first read."""
        snapshot = self._snapshots.get(source_id)
        if snapshot is not None:
            return {entry.req_id: entry for entry in _entries_of(snapshot)}
        baseline = self._baselines.get(source_id)
        if baseline is not None and baseline.evaluated:
            return baseline.by_id()
        return None

    def _titles_for(self, source_id: str) -> dict[str, str]:
        """Titles from this process's own previous read of *source_id*, if it had one."""
        snapshot = self._snapshots.get(source_id)
        if snapshot is None:
            return {}
        return {requirement.req_id: requirement.title for requirement in snapshot.requirements}

    @traces(SWR.SWR_3119)
    def _remember(self) -> None:
        """Load what the last process left behind, once, on the first refresh."""
        if self._remembered:
            return
        self._remembered = True
        if self._memory is None:
            return
        try:
            log, baselines = self._memory.load()
        except Exception:  # noqa: BLE001 - remembering nothing beats refusing to open
            logging.getLogger(__name__).warning(
                "Could not read what the last session remembered; starting from empty",
                exc_info=True,
            )
            return
        self._tombstones = log
        self._baselines = dict(baselines)

    @traces(SWR.SWR_3119)
    def _persist(self) -> None:
        """Leave this refresh behind for the next process.

        Never fails a refresh. A board that could not write its memory is a board
        that will re-read from scratch next time, which is a cost; a board that
        refused to publish an index it already computed would be a defect.
        """
        if self._memory is None:
            return
        try:
            self._memory.save(self._tombstones, self._baselines)
        except Exception:  # noqa: BLE001 - a published index is not un-published by this
            logging.getLogger(__name__).warning(
                "Could not persist what this refresh observed",
                exc_info=True,
            )


@traces(SWR.SWR_3119)
def _baseline_of(snapshot: SourceSnapshot) -> RequirementBaseline:
    """One source's read as the baseline the next one compares against."""
    from rotaris_core.requirements.change.detection import RequirementBaseline as Baseline

    return Baseline(
        source_id=snapshot.source_id,
        revision=snapshot.revision,
        entries=_entries_of(snapshot),
        evaluated=True,
    )


@traces(SWR.SWR_3119, SWR.SWR_3113)
def _entries_of(snapshot: SourceSnapshot) -> tuple[BaselineEntry, ...]:
    """*snapshot*'s requirements, reduced to identity, hashes and provenance.

    The one conversion, used for both the value that is persisted and the value
    the tombstone fold compares — so "what we remember" and "what we compare"
    cannot be two different reductions of the same read (SWR-3114, SWR-3119).

    No filtering by owner happens here, and it is worth saying why not, because
    the fold this replaced did filter. ``TombstoneLog.observe`` skipped a
    requirement whose ``source_id`` named a different source — "an id that moved
    to another source is not this one's removal to report". That branch could
    never fire on a real read: :class:`~rotaris_core.requirements.sources.base.SourceRead`
    validates that every requirement it carries names *its* source and raises
    otherwise, so a snapshot holding a foreign id does not exist. The guarantee
    is real and is enforced one layer up; repeating it here would be a second
    check on an impossible state, which reads as though the state were possible.
    """
    from rotaris_core.requirements.change.detection import BaselineEntry as Entry

    return tuple(
        Entry.of(requirement)
        for requirement in sorted(
            snapshot.requirements,
            key=lambda requirement: requirement_sort_key(requirement.req_id),
        )
    )


def _artifact_index(
    artifacts: Sequence[RequirementArtifact],
) -> tuple[dict[str, str], dict[str, tuple[str, ...]]]:
    revisions = {
        artifact.artifact_id: artifact.revision
        for artifact in artifacts
        if artifact.revision is not None
    }
    declared = {
        artifact.artifact_id: artifact.requirement_ids
        for artifact in artifacts
        if artifact.requirement_ids
    }
    return revisions, declared


def _is_addressable(artifacts: Sequence[RequirementArtifact]) -> bool:
    """Whether artefact-level refresh is possible for this discovery result.

    Both halves are needed: a per-artefact revision to tell what moved, and the
    ids each artefact declares to know which requirements to keep from the
    snapshot. Without either, a full read is the only honest answer.
    """
    return bool(artifacts) and all(
        artifact.revision is not None and artifact.requirement_ids for artifact in artifacts
    )


def _refresh_source(
    source: RequirementSource,
    snapshot: SourceSnapshot | None,
    *,
    cancel: CancelToken | None,
    force: bool,
) -> tuple[SourceSnapshot, SourceRefresh]:
    """Read one source as cheaply as its own revisions allow (SWR-3116)."""
    revision = source.revision()
    if snapshot is not None and not force and snapshot.matches(revision):
        return snapshot, SourceRefresh(
            source_id=source.source_id,
            revision=revision,
            reused=True,
        )

    artifacts = tuple(source.discover())
    if cancel is not None:
        cancel.raise_if_cancelled(f"source {source.source_id!r} discovery")

    if (
        snapshot is not None
        and not force
        and _is_addressable(artifacts)
        and isinstance(source, IncrementalRequirementSource)
    ):
        return _partial_read(source, snapshot, artifacts, revision=revision, cancel=cancel)
    return _full_read(source, artifacts)


def _full_read(
    source: RequirementSource,
    artifacts: Sequence[RequirementArtifact],
) -> tuple[SourceSnapshot, SourceRefresh]:
    """Read the whole source: no snapshot, no addressable artefacts, or forced."""
    read = source.read()
    revisions, declared = _artifact_index(artifacts)
    return (
        SourceSnapshot(
            source_id=source.source_id,
            revision=read.revision,
            requirements=read.requirements,
            issues=read.issues,
            artifact_revisions=revisions,
            artifact_requirements=declared,
        ),
        SourceRefresh(source_id=source.source_id, revision=read.revision, full_read=True),
    )


def _partial_read(
    source: IncrementalRequirementSource,
    snapshot: SourceSnapshot,
    artifacts: Sequence[RequirementArtifact],
    *,
    revision: str,
    cancel: CancelToken | None,
) -> tuple[SourceSnapshot, SourceRefresh]:
    """Re-read only the artefacts whose own revision moved (SWR-3116).

    Requirements from untouched artefacts are carried over from the snapshot and
    re-stamped with the source's new revision — the content did not change, but
    the read did, and SWR-3107 wants every requirement to name the revision it
    was observed at.
    """
    revisions, declared = _artifact_index(artifacts)
    changed = tuple(
        artifact_id
        for artifact_id, artifact_revision in revisions.items()
        if snapshot.artifact_revisions.get(artifact_id) != artifact_revision
    )
    kept_ids = {
        req_id
        for artifact_id, ids in declared.items()
        if artifact_id not in changed
        for req_id in ids
    }
    known = snapshot.by_id()
    carried = [
        known[req_id].stamped(source_revision=revision)
        for req_id in sorted(kept_ids & set(known), key=requirement_sort_key)
    ]
    fresh: tuple[CanonicalRequirement, ...] = ()
    issues: tuple[SourceIssue, ...] = ()
    if changed:
        if cancel is not None:
            cancel.raise_if_cancelled(f"source {source.source_id!r} artefacts")
        partial = source.read_artifacts(list(changed))
        fresh = partial.requirements
        issues = partial.issues
    return (
        SourceSnapshot(
            source_id=source.source_id,
            revision=revision,
            requirements=tuple(
                sorted(
                    (*carried, *fresh),
                    key=lambda requirement: requirement_sort_key(requirement.req_id),
                ),
            ),
            issues=issues,
            artifact_revisions=revisions,
            artifact_requirements=declared,
        ),
        SourceRefresh(
            source_id=source.source_id,
            revision=revision,
            artifacts_read=changed,
        ),
    )


def _merge(
    sources: Sequence[RequirementSource],
    snapshots: Mapping[str, SourceSnapshot],
) -> tuple[tuple[CanonicalRequirement, ...], tuple[IdCollision, ...]]:
    """Merge every source's read into one id-ordered set, reporting collisions."""
    claimed: dict[str, list[SourceClaim]] = {}
    chosen: dict[str, CanonicalRequirement] = {}
    for source in sources:
        snapshot = snapshots.get(source.source_id)
        if snapshot is None:
            continue
        for requirement in snapshot.requirements:
            claims = claimed.setdefault(requirement.req_id, [])
            claims.append(
                SourceClaim(source_id=source.source_id, location=requirement.source_path),
            )
            chosen.setdefault(requirement.req_id, requirement)
    collisions = tuple(
        IdCollision(req_id=req_id, claims=tuple(claims))
        for req_id, claims in sorted(
            claimed.items(), key=lambda item: requirement_sort_key(item[0])
        )
        if len(claims) > 1
    )
    requirements = tuple(chosen[req_id] for req_id in sorted(chosen, key=requirement_sort_key))
    return requirements, collisions
