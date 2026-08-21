"""Productive use: a requirement disappears from the project's store and the delivery
state, runs and evidence Rotaris holds for it stay findable instead of silently
re-attaching to whatever gets that id next.
Expected outcome: a removal leaves a tombstone naming the id, its source and when it
went; the id is never issued again; a restored requirement resolves back to a live one
without losing its record; and a source that merely failed to load tombstones nothing."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.detection import BaselineEntry
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.requirements.registry import Availability, RequirementRegistry
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceRead,
)
from rotaris_core.requirements.tombstones import (
    NullRetiredIdRecorder,
    Tombstone,
    TombstoneLog,
    TombstoneReason,
    TombstoneStore,
)
from rotaris_core.requirements.writeback import allocate_requirement_id

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REMOVED_AT = dt.datetime(2026, 8, 14, 9, 30, tzinfo=dt.UTC)
RESTORED_AT = dt.datetime(2026, 8, 15, 8, 0, tzinfo=dt.UTC)


class MemorySource(BaseRequirementSource):
    """A store whose content the test moves around, one revision at a time."""

    def __init__(
        self,
        source_id: str,
        titles: dict[str, str],
        *,
        owners: dict[str, str] | None = None,
    ) -> None:
        self._source_id = source_id
        self.titles = dict(titles)
        self.revision_token = "r1"
        self.broken = False
        #: Ids this source merely echoes, mapped to the source that owns them.
        #: A requirement that names another owner is not this source's to
        #: tombstone when it stops appearing here (SWR-3113).
        self.owners = dict(owners or {})

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(
                artifact_id=req_id,
                location=f"specs/{req_id}.md",
                requirement_ids=(req_id,),
            )
            for req_id in sorted(self.titles)
        )

    def read(self) -> SourceRead:
        if self.broken:
            raise self.fail("the store could not be read", location="specs/")
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=tuple(
                CanonicalRequirement(
                    req_id=req_id,
                    title=title,
                    source_id=self.owners.get(req_id, ""),
                    source_path=f"specs/{req_id}.md",
                )
                for req_id, title in sorted(self.titles.items())
            ),
        )

    def revision(self) -> str:
        if self.broken:
            raise self.fail("the store could not be read", location="specs/")
        return self.revision_token


class RecordingRecorder:
    """A stand-in for the store's retired-ids log (SWR-2318)."""

    def __init__(self) -> None:
        self.retired: list[str] = []
        self.restored: list[str] = []

    def record_retired(self, tombstone: Tombstone) -> None:
        self.retired.append(tombstone.req_id)

    def record_restored(self, tombstone: Tombstone) -> None:
        self.restored.append(tombstone.req_id)


class FakeClock:
    """A clock the test moves deliberately, so timestamps are assertable."""

    def __init__(self, now: dt.datetime) -> None:
        self.now = now

    def __call__(self) -> dt.datetime:
        return self.now


def _registry(
    source: MemorySource,
    *,
    clock: FakeClock | None = None,
    recorder: object | None = None,
) -> RequirementRegistry:
    return RequirementRegistry(
        [source],
        clock=clock if clock is not None else FakeClock(REMOVED_AT),
        retired_recorder=recorder,  # type: ignore[arg-type]
    )


@verifies(SWR.SWR_3113)
def test_a_removed_requirement_leaves_a_tombstone_not_a_gap() -> None:
    """The id keeps its meaning: what it was, where it came from, when it went."""
    source = MemorySource("house", {"SWR-1": "Import", "SWR-2": "Export"})
    registry = _registry(source)
    first = registry.refresh()
    hash_before = first.requirement("SWR-2")
    assert hash_before is not None

    del source.titles["SWR-2"]
    source.revision_token = "r2"
    index = registry.refresh()

    assert index.ids == ("SWR-1",)
    tombstone = index.tombstone("SWR-2")
    assert tombstone is not None
    assert tombstone.active
    assert tombstone.source_id == "house"
    assert tombstone.source_path == "specs/SWR-2.md"
    assert tombstone.last_title == "Export"
    assert tombstone.last_hash == hash_before.current_hash
    assert tombstone.removed_at == REMOVED_AT
    assert tombstone.reason is TombstoneReason.REMOVED_FROM_SOURCE
    assert index.availability("SWR-2") is Availability.REMOVED
    assert "was removed from house" in index.unavailable_reason("SWR-2")


@verifies(SWR.SWR_3113)
def test_a_tombstoned_id_is_never_issued_again() -> None:
    """Creation (SWR-3112) reads the retired ids, so history cannot be re-attached."""
    source = MemorySource("house", {"SWR-4201": "Import", "SWR-4202": "Export"})
    registry = _registry(source)
    registry.refresh()

    del source.titles["SWR-4202"]
    source.revision_token = "r2"
    index = registry.refresh()

    retired = registry.tombstones.retired_ids
    assert retired == frozenset({"SWR-4202"})
    assert (
        allocate_requirement_id(used_ids=index.ids, retired_ids=retired, epic="SWR-4200")
        == "SWR-4203"
    )


@verifies(SWR.SWR_3113)
def test_a_restored_requirement_keeps_its_record() -> None:
    """A restored file resolves back to a live requirement; the gap stays readable."""
    source = MemorySource("house", {"SWR-1": "Import", "SWR-2": "Export"})
    clock = FakeClock(REMOVED_AT)
    registry = _registry(source, clock=clock)
    registry.refresh()
    del source.titles["SWR-2"]
    source.revision_token = "r2"
    registry.refresh()

    clock.now = RESTORED_AT
    source.titles["SWR-2"] = "Export"
    source.revision_token = "r3"
    index = registry.refresh()

    assert index.requirement("SWR-2") is not None
    assert index.availability("SWR-2") is Availability.AVAILABLE
    tombstone = index.tombstone("SWR-2")
    assert tombstone is not None
    assert not tombstone.active
    assert tombstone.removed_at == REMOVED_AT
    assert tombstone.restored_at == RESTORED_AT
    # Still retired for allocation purposes: the id has a history either way.
    assert "SWR-2" in registry.tombstones.retired_ids


@verifies(SWR.SWR_3113)
def test_a_failing_source_tombstones_nothing() -> None:
    """An outage is not a removal — the distinction that keeps delivery records alive."""
    source = MemorySource("house", {"SWR-1": "Import", "SWR-2": "Export"})
    registry = _registry(source)
    registry.refresh()

    source.broken = True
    index = registry.refresh()

    assert index.tombstones == ()
    assert registry.tombstones.entries == ()
    assert index.requirements == ()
    assert index.availability("SWR-2") is Availability.SOURCE_UNAVAILABLE
    assert [failure.source_id for failure in index.failures] == ["house"]


@verifies(SWR.SWR_3113)
def test_the_store_side_retired_ids_log_is_a_reachable_seam() -> None:
    """SWR-2318 is not implemented here; the call site for it is, and is exercised."""
    source = MemorySource("house", {"SWR-1": "Import", "SWR-2": "Export"})
    recorder = RecordingRecorder()
    clock = FakeClock(REMOVED_AT)
    registry = _registry(source, clock=clock, recorder=recorder)
    registry.refresh()

    del source.titles["SWR-2"]
    source.revision_token = "r2"
    registry.refresh()
    assert recorder.retired == ["SWR-2"]

    clock.now = RESTORED_AT
    source.titles["SWR-2"] = "Export"
    source.revision_token = "r3"
    registry.refresh()
    assert recorder.restored == ["SWR-2"]


@verifies(SWR.SWR_3113)
def test_without_a_store_side_log_the_gap_is_kept_rather_than_lost() -> None:
    """The default recorder writes nothing and says exactly what it did not write."""
    source = MemorySource("house", {"SWR-1": "Import", "SWR-2": "Export"})
    registry = _registry(source)
    registry.refresh()

    del source.titles["SWR-2"]
    source.revision_token = "r2"
    registry.refresh()

    recorder = registry.retired_recorder
    assert isinstance(recorder, NullRetiredIdRecorder)
    assert [entry.req_id for entry in recorder.skipped] == ["SWR-2"]


@verifies(SWR.SWR_3113, SWR.SWR_3119)
def test_a_source_cannot_carry_another_sources_ids_at_all() -> None:
    """An id that belongs to another source can never reach this source's fold.

    The fold used to guard against it — "an id that moved to another source is not
    this one's removal to report" — over a hand-built map no production path could
    produce. ``SourceRead`` refuses such a read outright, so the guarantee holds a
    layer earlier and unconditionally, and the fold no longer repeats a check on a
    state that cannot exist (SWR-3119).

    Asked here rather than deleted: the property is the point, and a property with
    no test is a property that stops being true quietly.
    """
    house = MemorySource(
        "house",
        {"SWR-1": "Import", "SWR-2": "Export"},
        # SWR-1 claims the tracker owns it. This read must not be accepted.
        owners={"SWR-1": "tracker"},
    )
    registry = _registry(house)

    index = registry.refresh()

    assert index.ids == (), "a read naming a foreign source is refused, not partly kept"
    failure = next(one for one in index.failures if one.source_id == "house")
    assert "SWR-1" in failure.message
    assert "tracker" in failure.message
    assert index.tombstones == (), "a refused read is an outage, never a removal"


@verifies(SWR.SWR_3113)
def test_the_log_is_pure_and_immutable() -> None:
    """Folding a read produces a new log, so a published index cannot change under a reader."""
    original = TombstoneLog()
    requirement = CanonicalRequirement(req_id="SWR-9", title="Gone", source_id="house")

    folded = original.observe(
        source_id="house",
        previous={"SWR-9": BaselineEntry.of(requirement)},
        current={},
        at=REMOVED_AT,
    )
    twice = folded.observe(
        source_id="house",
        previous={"SWR-9": BaselineEntry.of(requirement)},
        current={},
        at=RESTORED_AT,
    )

    assert original.entries == ()
    assert len(folded.entries) == 1
    # A second observation of the same absence does not restamp the removal.
    assert twice.entries[0].removed_at == REMOVED_AT


@verifies(SWR.SWR_3113)
def test_the_persisted_log_survives_a_restart(tmp_path: Path) -> None:
    """Retired ids outlive the process; that is what keeps allocation honest."""
    store = TombstoneStore(tmp_path)
    log = TombstoneLog().observe(
        source_id="house",
        previous={
            "SWR-2": BaselineEntry.of(
                CanonicalRequirement(
                    req_id="SWR-2",
                    title="Export",
                    source_id="house",
                    source_path="specs/SWR-2.md",
                ),
            ),
        },
        current={},
        at=REMOVED_AT,
    )

    store.save(log)
    reloaded = TombstoneStore(tmp_path).load()

    assert reloaded.retired_ids == frozenset({"SWR-2"})
    entry = reloaded.get("SWR-2")
    assert entry is not None
    assert entry.removed_at == REMOVED_AT
    assert entry.source_path == "specs/SWR-2.md"
    assert entry.last_hash == log.entries[0].last_hash


@verifies(SWR.SWR_3113)
def test_an_unreadable_log_does_not_stop_the_board(tmp_path: Path) -> None:
    """Losing the record is bad; refusing to open the workspace over it is worse."""
    store = TombstoneStore(tmp_path)
    store.path.parent.mkdir(parents=True, exist_ok=True)
    store.path.write_text("{ not json", encoding="utf-8")

    assert store.load().entries == ()
