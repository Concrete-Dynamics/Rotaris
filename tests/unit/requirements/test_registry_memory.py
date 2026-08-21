"""What a refresh has to remember between processes (SWR-3119).

The defect these cover is not a missing cache. A removal is a *difference* — an
id the last read saw and this one does not — and until the registry could carry
that across a process boundary, a fresh `rotaris-cli` invocation compared against
nothing, observed no removal, and therefore minted no tombstone to persist. Every
case here is about that boundary, so each one either crosses it or says what
happens when the state on the far side is unusable.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.detection import RequirementBaseline
from rotaris_core.requirements.memory import BaselineStore, RegistryMemory
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.requirements.sources.base import SourceRead
from rotaris_core.requirements.tombstones import Tombstone, TombstoneLog

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
SOURCE = "house"


def read(*ids: str, revision: str = "r1") -> SourceRead:
    return SourceRead(
        source_id=SOURCE,
        revision=revision,
        requirements=tuple(
            CanonicalRequirement(
                req_id=req_id,
                title=f"Title of {req_id}",
                description="Prose nobody may persist.",
                source_id=SOURCE,
                source_path=f"specs/{req_id}.md",
            )
            for req_id in ids
        ),
    )


@verifies(SWR.SWR_3119)
def test_a_baseline_survives_the_process_that_wrote_it(tmp_path: Path) -> None:
    """Productive use: a user closes Rotaris, deletes a requirement, and opens the CLI.
    Expected outcome: the next process knows what the last one saw, which is the only way
    the deletion is a *difference* rather than an unremarkable absence."""
    store = BaselineStore(tmp_path)
    store.save({SOURCE: RequirementBaseline.of_read(read("SWR-1", "SWR-2"))})

    reloaded = BaselineStore(tmp_path).load()

    assert set(reloaded) == {SOURCE}
    baseline = reloaded[SOURCE]
    assert baseline.evaluated is True
    assert sorted(baseline.by_id()) == ["SWR-1", "SWR-2"]
    assert baseline.by_id()["SWR-1"].source_path == "specs/SWR-1.md"


@verifies(SWR.SWR_3119, SWR.SWR_3114)
def test_the_persisted_baseline_carries_no_requirement_text(tmp_path: Path) -> None:
    """Productive use: a project's requirement text stays in the project's own files.
    Expected outcome: what Rotaris remembers is identity and provenance — never a second
    copy of the prose it is supposed to be reading from the source."""
    store = BaselineStore(tmp_path)
    store.save({SOURCE: RequirementBaseline.of_read(read("SWR-1"))})

    written = store.path.read_text(encoding="utf-8")

    assert "Prose nobody may persist." not in written
    assert "Title of SWR-1" not in written
    assert "SWR-1" in written
    assert "specs/SWR-1.md" in written


@verifies(SWR.SWR_3119)
def test_a_first_open_remembers_nothing_and_that_is_not_a_removal(tmp_path: Path) -> None:
    """Productive use: a user opens Rotaris in a project for the first time.
    Expected outcome: an empty memory, so a workspace holding 1500 requirements is not
    read as 1500 removals — "never evaluated" and "evaluated and empty" stay apart."""
    log, baselines = RegistryMemory(tmp_path).load()

    assert log.entries == ()
    assert baselines == {}
    assert RequirementBaseline.unevaluated(SOURCE).evaluated is False


@verifies(SWR.SWR_3119, SWR.SWR_3113)
def test_both_halves_travel_together(tmp_path: Path) -> None:
    """Productive use: a removal recorded once is not re-reported on every later refresh.
    Expected outcome: the log and the baseline come back as one answer — a log without a
    baseline records nothing new, and a baseline without a log repeats itself forever."""
    memory = RegistryMemory(tmp_path)
    log = TombstoneLog(
        entries=(Tombstone(req_id="SWR-2", source_id=SOURCE, removed_at=AT),),
    )

    memory.save(log, {SOURCE: RequirementBaseline.of_read(read("SWR-1", revision="r2"))})
    reloaded_log, reloaded_baselines = RegistryMemory(tmp_path).load()

    assert reloaded_log.retired_ids == frozenset({"SWR-2"})
    assert sorted(reloaded_baselines[SOURCE].by_id()) == ["SWR-1"]
    # The baseline no longer holds SWR-2, and the log already does — so the next
    # refresh has nothing new to say about it.
    assert reloaded_log.get("SWR-2") is not None


@verifies(SWR.SWR_3119)
def test_unreadable_memory_remembers_nothing_rather_than_inventing_removals(
    tmp_path: Path,
) -> None:
    """Productive use: the memory file is truncated by a crash or a bad merge.
    Expected outcome: one refresh with nothing to compare against — never a corrupt file
    that can conjure removals for requirements nobody touched."""
    store = BaselineStore(tmp_path)
    store.path.parent.mkdir(parents=True, exist_ok=True)
    store.path.write_text("{ not json", encoding="utf-8")

    assert store.load() == {}

    store.path.write_text(
        '{"schema_version": 1, "sources": {"house": "nonsense"}}', encoding="utf-8"
    )

    assert store.load() == {}
