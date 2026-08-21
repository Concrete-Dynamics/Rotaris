"""Productive use: an agent starts implementing a requirement. The author keeps editing it
while the run is in flight — and the run keeps working against the text it was actually
given, so what it reports having delivered is a version that really existed.
Expected outcome: a run captures requirement id, hash, source revision, base commit, unit
and session before it starts; the capture is immutable, is written to disk before the
agent is reached, survives a crash, carries no requirement prose on disk, and is what the
satisfied hash is taken from."""

from __future__ import annotations

import datetime as dt
import json
import re
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.satisfied import DeliverySnapshot, SatisfiedDelivery
from rotaris_core.requirements.execution.snapshot import (
    SNAPSHOT_SCHEMA_VERSION,
    RunSnapshot,
    SnapshotError,
    SnapshotStore,
    capture_snapshot,
)
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.requirements.tombstones import requirements_state_dir

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3402"
AT = dt.datetime(2026, 8, 14, 9, 30, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 11, 0, tzinfo=dt.UTC)

TITLE = "Import a CSV with a preview"
DESCRIPTION = (
    "The user picks a file, sees the parsed rows in a preview, and confirms before "
    "anything is written to the database."
)
EDITED_DESCRIPTION = DESCRIPTION + " Rows that fail validation are listed separately."


def requirement(description: str = DESCRIPTION) -> CanonicalRequirement:
    """The requirement as its source reports it right now."""
    return CanonicalRequirement(
        req_id=REQ,
        title=TITLE,
        description=description,
        source_id="specs",
        source_path="specs/import.md",
        source_revision="r7",
    )


def snapshot_of(
    subject: CanonicalRequirement | None = None,
    *,
    run_id: str = "run-1",
) -> RunSnapshot:
    return capture_snapshot(
        subject if subject is not None else requirement(),
        run_id=run_id,
        base_commit="c0ffee1",
        at=AT,
        unit_id="swr-3402-impl",
        session_id="20260814-abcdef",
    )


# -- what a capture is -----------------------------------------------------


@verifies(SWR.SWR_3402)
def test_a_snapshot_names_everything_the_run_is_judged_against() -> None:
    """Requirement id, hash, source revision, base commit, unit and session."""
    subject = requirement()
    snapshot = snapshot_of(subject)

    assert snapshot.run_id == "run-1"
    assert snapshot.req_id == REQ
    assert snapshot.requirement_hash == subject.current_hash
    assert snapshot.source_revision == "r7"
    assert snapshot.source_path == "specs/import.md"
    assert snapshot.base_commit == "c0ffee1"
    assert snapshot.unit_id == "swr-3402-impl"
    assert snapshot.session_id == "20260814-abcdef"
    assert snapshot.captured_at == AT
    # The captured text is what the agent context is built from (SWR-3407).
    assert snapshot.has_text
    assert TITLE in snapshot.specification
    assert DESCRIPTION in snapshot.specification


@verifies(SWR.SWR_3402)
def test_a_run_cannot_start_without_a_resolvable_base_commit() -> None:
    """No starting point, no run — refused rather than captured half-formed."""
    for missing in (None, "", "   "):
        with pytest.raises(SnapshotError, match="no commit for a run to start from"):
            capture_snapshot(requirement(), run_id="run-1", base_commit=missing, at=AT)


@verifies(SWR.SWR_3402)
def test_a_requirement_without_a_hash_cannot_be_snapshotted() -> None:
    """The hash is what the result is judged against; there is no default for it."""
    hashless = requirement().model_copy(update={"current_hash": ""})
    with pytest.raises(SnapshotError, match="no recorded content hash"):
        capture_snapshot(hashless, run_id="run-1", base_commit="c0ffee1", at=AT)


@verifies(SWR.SWR_3402)
def test_a_refusal_to_snapshot_is_written_for_the_person_who_has_to_fix_it() -> None:
    """Productive use: someone opens Rotaris on a project whose repository has no commit yet
    and releases a requirement.
    Expected outcome: the refusal that ends up under that requirement on the board names the
    fact and the remedy in one sentence, without a requirement id inside it and without one of
    Rotaris' own SWR ids."""
    with pytest.raises(SnapshotError) as refused:
        capture_snapshot(requirement(), run_id="run-1", base_commit="", at=AT)

    stated = str(refused.value)
    assert "no commit" in stated, "the fact: this workspace has nothing to branch from"
    assert "make an initial commit" in stated, "the remedy, in the same sentence"
    # The board labels the row with the requirement's id and the heading already
    # says "blocked"; repeating either inside the sentence is what turned this
    # into four stacked prefixes.
    assert requirement().req_id not in stated
    assert not re.search(r"\(SWR-\d+\)", stated), "a Rotaris requirement id is not user-facing"


@verifies(SWR.SWR_3402)
def test_a_snapshot_timestamp_is_aware() -> None:
    """A naive timestamp cannot be ordered against another machine's."""
    with pytest.raises(ValidationError, match="aware"):
        capture_snapshot(
            requirement(),
            run_id="run-1",
            base_commit="c0ffee1",
            at=dt.datetime(2026, 8, 14, 9, 30),  # noqa: DTZ001 - the point of the test
        )


# -- immutability under a mid-run source change ----------------------------


@verifies(SWR.SWR_3402)
def test_a_requirement_edited_mid_run_does_not_change_the_running_runs_snapshot() -> None:
    """The capture is a value; the source moving cannot reach it."""
    original = requirement()
    snapshot = snapshot_of(original)

    edited = requirement(EDITED_DESCRIPTION)
    assert edited.current_hash != original.current_hash

    assert snapshot.requirement_hash == original.current_hash
    assert DESCRIPTION in snapshot.specification
    assert "listed separately" not in snapshot.specification
    with pytest.raises(ValidationError):
        snapshot.requirement_hash = edited.current_hash  # type: ignore[misc]


@verifies(SWR.SWR_3402, SWR.SWR_3204)
def test_the_satisfied_hash_is_taken_from_the_snapshot_not_the_clock() -> None:
    """The version delivered is the version the run saw (SWR-3204)."""
    original = requirement()
    snapshot = snapshot_of(original)
    edited = requirement(EDITED_DESCRIPTION)

    assert isinstance(snapshot, DeliverySnapshot)
    delivery = SatisfiedDelivery.from_snapshot(
        snapshot,
        run_id=snapshot.run_id,
        at=LATER,
        verified_commit="deadbee",
    )

    assert delivery.satisfied_hash == original.current_hash
    assert delivery.satisfied_hash != edited.current_hash
    assert delivery.run_id == "run-1"
    assert delivery.unit_id == "swr-3402-impl"
    assert delivery.session_id == "20260814-abcdef"
    assert delivery.source_revision == "r7"


# -- persistence -----------------------------------------------------------


@verifies(SWR.SWR_3402)
def test_the_snapshot_is_on_disk_and_survives_a_restart(tmp_path: Path) -> None:
    """Written before the agent starts; read back by a fresh process' store."""
    store = SnapshotStore(tmp_path)
    snapshot = snapshot_of()

    path = store.save(snapshot)
    assert path.is_file()
    assert path.parent == requirements_state_dir(tmp_path) / "snapshots"

    reloaded = SnapshotStore(tmp_path).load("run-1")
    assert reloaded is not None
    assert reloaded.run_id == snapshot.run_id
    assert reloaded.req_id == snapshot.req_id
    assert reloaded.requirement_hash == snapshot.requirement_hash
    assert reloaded.base_commit == snapshot.base_commit
    assert reloaded.unit_id == snapshot.unit_id
    assert reloaded.session_id == snapshot.session_id
    assert reloaded.captured_at == snapshot.captured_at
    assert SnapshotStore(tmp_path).run_ids() == ("run-1",)


@verifies(SWR.SWR_3402)
def test_a_run_with_no_snapshot_reads_as_none_rather_than_a_blank_one(tmp_path: Path) -> None:
    """'Never captured' and 'captured nothing' are different answers."""
    assert SnapshotStore(tmp_path).load("run-never") is None
    assert SnapshotStore(tmp_path).run_ids() == ()


@verifies(SWR.SWR_3402)
def test_an_interrupted_write_leaves_the_previous_snapshot_byte_identical(
    tmp_path: Path,
) -> None:
    """A crash mid-write must not cost the record that was already there."""

    def explode(_source: str, _target: str) -> None:
        raise OSError("the disk went away")

    store = SnapshotStore(tmp_path)
    path = store.save(snapshot_of())
    before = path.read_bytes()

    failing = SnapshotStore(tmp_path, replace=explode)
    with pytest.raises(OSError, match="disk went away"):
        failing.save(snapshot_of(requirement(EDITED_DESCRIPTION)))

    assert path.read_bytes() == before
    assert not list(path.parent.glob("*.tmp"))


@verifies(SWR.SWR_3402, SWR.SWR_3114)
def test_the_persisted_snapshot_carries_no_requirement_prose(tmp_path: Path) -> None:
    """Rotaris' own directory stays free of the project's text (SWR-3114)."""
    store = SnapshotStore(tmp_path)
    store.save(snapshot_of())

    written = [path for path in requirements_state_dir(tmp_path).rglob("*") if path.is_file()]
    assert written
    for path in written:
        text = path.read_text(encoding="utf-8")
        assert TITLE not in text
        assert DESCRIPTION not in text
        assert "title" not in text
        assert "description" not in text
        # What it does carry: identity, hash, provenance, time.
        assert REQ in text
        assert "c0ffee1" in text

    # And the reloaded value says so rather than pretending it has the text.
    reloaded = store.load("run-1")
    assert reloaded is not None
    assert not reloaded.has_text
    assert reloaded.specification == ""


@verifies(SWR.SWR_3402)
def test_a_snapshot_from_a_newer_build_is_refused_not_reinterpreted(tmp_path: Path) -> None:
    """Reading a payload this build does not understand would invent facts."""
    store = SnapshotStore(tmp_path)
    path = store.save(snapshot_of())
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["schema_version"] = SNAPSHOT_SCHEMA_VERSION + 1
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(SnapshotError, match="schema version"):
        store.load("run-1")


@verifies(SWR.SWR_3402)
def test_an_unreadable_snapshot_is_reported_rather_than_guessed(tmp_path: Path) -> None:
    """Half a JSON document is not half a snapshot."""
    store = SnapshotStore(tmp_path)
    path = store.save(snapshot_of())
    path.write_text("{not json", encoding="utf-8")

    with pytest.raises(SnapshotError, match="unreadable"):
        store.load("run-1")


# -- what the board reads --------------------------------------------------


@verifies(SWR.SWR_3402)
def test_every_run_can_name_the_snapshot_it_ran_against() -> None:
    """The execution history's snapshot column (SWR-3414, SWR-3216)."""
    view = snapshot_of().to_view()

    assert view.req_id == REQ
    assert view.requirement_hash == requirement().current_hash
    assert view.source_revision == "r7"
    assert view.base_commit == "c0ffee1"
    assert view.unit_id == "swr-3402-impl"
    assert view.session_id == "20260814-abcdef"
    assert view.captured_at == AT
