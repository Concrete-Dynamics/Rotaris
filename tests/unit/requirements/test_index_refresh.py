"""Productive use: the board of a repository with hundreds of requirements stays
responsive while the repository moves under it — a one-file edit costs one file, and
the window never freezes while the store is re-read.
Expected outcome: an unchanged source is not read at all, a changed artefact is the only
one re-read, a refresh runs off the calling thread, a consumer never observes a
half-built index, and a cancelled or failed refresh leaves the previous one standing."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.requirements.registry import (
    CancelToken,
    RefreshCancelledError,
    RequirementIndex,
    RequirementRegistry,
)
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceRead,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

pytestmark = pytest.mark.unit


@dataclass
class Artifact:
    """One file of a synthetic store: its own revision and what it declares."""

    revision: str
    titles: dict[str, str] = field(default_factory=dict)


class IncrementalStore(BaseRequirementSource):
    """A store that can address its artefacts, and counts every read it serves."""

    def __init__(self, artifacts: dict[str, Artifact], source_id: str = "house") -> None:
        self._source_id = source_id
        self.artifacts = artifacts
        self.full_reads = 0
        self.artifact_reads: list[str] = []
        self.before_read: threading.Event | None = None

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(
                artifact_id=name,
                location=f"specs/{name}",
                revision=artifact.revision,
                requirement_ids=tuple(sorted(artifact.titles)),
            )
            for name, artifact in sorted(self.artifacts.items())
        )

    def revision(self) -> str:
        return "|".join(
            f"{name}:{artifact.revision}" for name, artifact in sorted(self.artifacts.items())
        )

    def _requirements(self, names: Sequence[str]) -> tuple[CanonicalRequirement, ...]:
        return tuple(
            CanonicalRequirement(req_id=req_id, title=title, source_path=f"specs/{name}")
            for name in sorted(names)
            for req_id, title in sorted(self.artifacts[name].titles.items())
        )

    def read(self) -> SourceRead:
        if self.before_read is not None:
            self.before_read.wait(timeout=5)
        self.full_reads += 1
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=self._requirements(list(self.artifacts)),
        )

    def read_artifacts(self, artifact_ids: Sequence[str]) -> SourceRead:
        self.artifact_reads.extend(artifact_ids)
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=self._requirements(list(artifact_ids)),
        )


class WholeFileStore(BaseRequirementSource):
    """A store that cannot address its artefacts — the read-only-adapter case."""

    def __init__(self, titles: dict[str, str], source_id: str = "tracker") -> None:
        self._source_id = source_id
        self.titles = titles
        self.revision_token = "r1"
        self.full_reads = 0

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return (RequirementArtifact(artifact_id="all", location="tracker://all"),)

    def revision(self) -> str:
        return self.revision_token

    def read(self) -> SourceRead:
        self.full_reads += 1
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision_token,
            requirements=tuple(
                CanonicalRequirement(req_id=req_id, title=title, source_path="tracker://all")
                for req_id, title in sorted(self.titles.items())
            ),
        )


def _store() -> IncrementalStore:
    return IncrementalStore(
        {
            "a.md": Artifact(revision="1", titles={"SWR-1": "Import a CSV"}),
            "b.md": Artifact(revision="1", titles={"SWR-2": "Export a CSV"}),
            "c.md": Artifact(revision="1", titles={"SWR-3": "Print a table"}),
        },
    )


@verifies(SWR.SWR_3116)
def test_an_unchanged_source_is_not_read_again() -> None:
    """The source's own revision is the cache key; unchanged means zero reads."""
    store = _store()
    registry = RequirementRegistry([store])
    registry.refresh()
    assert store.full_reads == 1

    index = registry.refresh()

    assert store.full_reads == 1
    assert store.artifact_reads == []
    report = registry.last_refresh.of_source("house")
    assert report is not None
    assert report.reused
    assert registry.last_refresh.artifacts_read == ()
    assert index.ids == ("SWR-1", "SWR-2", "SWR-3")


@verifies(SWR.SWR_3116)
def test_only_the_changed_artefact_is_re_read() -> None:
    """A one-file edit in a three-file store costs one file, not three."""
    store = _store()
    registry = RequirementRegistry([store])
    first = registry.refresh()
    unchanged_before = first.requirement("SWR-1")
    assert unchanged_before is not None

    store.artifacts["b.md"] = Artifact(revision="2", titles={"SWR-2": "Export a TSV"})
    index = registry.refresh()

    assert store.artifact_reads == ["b.md"]
    assert store.full_reads == 1
    report = registry.last_refresh.of_source("house")
    assert report is not None
    assert report.incremental
    assert report.artifacts_read == ("b.md",)
    # The changed artefact's content is fresh …
    changed = index.requirement("SWR-2")
    assert changed is not None
    assert changed.title == "Export a TSV"
    # … and the untouched ones are carried over unchanged, hash included.
    unchanged = index.requirement("SWR-1")
    assert unchanged is not None
    assert unchanged.title == "Import a CSV"
    assert unchanged.current_hash == unchanged_before.current_hash
    assert index.ids == ("SWR-1", "SWR-2", "SWR-3")


@verifies(SWR.SWR_3116)
def test_a_removed_artefact_drops_its_requirements_without_a_full_read() -> None:
    """Incremental must not mean "additive": a deleted file loses its ids."""
    store = _store()
    registry = RequirementRegistry([store])
    registry.refresh()

    del store.artifacts["c.md"]
    index = registry.refresh()

    assert index.ids == ("SWR-1", "SWR-2")
    assert store.full_reads == 1
    assert store.artifact_reads == []


@verifies(SWR.SWR_3116)
def test_a_new_artefact_is_the_only_one_read() -> None:
    """Adding a file reads that file."""
    store = _store()
    registry = RequirementRegistry([store])
    registry.refresh()

    store.artifacts["d.md"] = Artifact(revision="1", titles={"SWR-4": "Sort a table"})
    index = registry.refresh()

    assert store.artifact_reads == ["d.md"]
    assert index.ids == ("SWR-1", "SWR-2", "SWR-3", "SWR-4")


@verifies(SWR.SWR_3116)
def test_a_source_that_cannot_address_artefacts_is_read_whole_only_when_it_moved() -> None:
    """A read-only adapter without per-artefact revisions is still cheap when idle."""
    tracker = WholeFileStore({"REQ-1": "Dark mode"})
    registry = RequirementRegistry([tracker])
    registry.refresh()
    registry.refresh()
    assert tracker.full_reads == 1

    tracker.titles["REQ-2"] = "Light mode"
    tracker.revision_token = "r2"
    index = registry.refresh()

    assert tracker.full_reads == 2
    report = registry.last_refresh.of_source("tracker")
    assert report is not None
    assert report.full_read
    assert index.ids == ("REQ-1", "REQ-2")


@verifies(SWR.SWR_3116)
def test_a_forced_refresh_re_reads_everything() -> None:
    """The escape hatch for a source whose revision lies; never the default."""
    store = _store()
    registry = RequirementRegistry([store])
    registry.refresh()

    registry.refresh(force=True)

    assert store.full_reads == 2
    report = registry.last_refresh.of_source("house")
    assert report is not None
    assert report.full_read


@verifies(SWR.SWR_3116)
def test_a_cancelled_refresh_leaves_the_previous_index_standing() -> None:
    """Cancellation publishes nothing at all — no partial index, no lost one."""
    store = _store()
    registry = RequirementRegistry([store])
    published = registry.refresh()

    store.artifacts["b.md"] = Artifact(revision="2", titles={"SWR-2": "Export a TSV"})
    token = CancelToken()
    token.cancel()
    with pytest.raises(RefreshCancelledError):
        registry.refresh(cancel=token)

    assert registry.index is published
    assert registry.index.generation == 1
    changed = registry.index.requirement("SWR-2")
    assert changed is not None
    assert changed.title == "Export a CSV"
    # And the snapshot cache survived, so the next refresh is still incremental.
    registry.refresh()
    assert store.artifact_reads == ["b.md"]


@verifies(SWR.SWR_3116)
def test_a_refresh_runs_off_the_calling_thread() -> None:
    """The Qt main thread starts a refresh and is handed a finished index."""
    store = _store()
    registry = RequirementRegistry([store])
    caller = threading.get_ident()
    observed: dict[str, object] = {}

    def done(index: RequirementIndex) -> None:
        observed["thread"] = threading.get_ident()
        observed["ids"] = index.ids

    thread = registry.refresh_in_background(on_done=done)
    thread.join(timeout=5)

    assert not thread.is_alive()
    assert observed["thread"] != caller
    assert observed["ids"] == ("SWR-1", "SWR-2", "SWR-3")
    assert registry.index.generation == 1


@verifies(SWR.SWR_3116)
def test_a_background_failure_reaches_the_caller_and_keeps_the_index() -> None:
    """A failed refresh is reported, not swallowed, and nothing is published."""
    store = _store()
    registry = RequirementRegistry([store])
    token = CancelToken()
    token.cancel()
    errors: list[BaseException] = []

    thread = registry.refresh_in_background(cancel=token, on_error=errors.append)
    thread.join(timeout=5)

    assert [type(error) for error in errors] == [RefreshCancelledError]
    assert registry.index.generation == 0
    assert registry.index.requirements == ()


@verifies(SWR.SWR_3116)
def test_a_consumer_never_observes_a_half_built_index() -> None:
    """While a refresh is inside a source read, readers still see the last whole index."""
    store = _store()
    registry = RequirementRegistry([store])
    first = registry.refresh()

    gate = threading.Event()
    store.before_read = gate
    store.artifacts["b.md"] = Artifact(revision="2", titles={"SWR-2": "Export a TSV"})
    thread = registry.refresh_in_background(force=True)
    try:
        # The refresh is now blocked inside `read()`; the published index is the
        # complete previous one, not a partially assembled new one.
        during = registry.index
        assert during is first
        assert during.ids == ("SWR-1", "SWR-2", "SWR-3")
        assert during.generation == 1
    finally:
        gate.set()
        thread.join(timeout=5)

    assert registry.index is not first
    assert registry.index.generation == 2
    changed = registry.index.requirement("SWR-2")
    assert changed is not None
    assert changed.title == "Export a TSV"
