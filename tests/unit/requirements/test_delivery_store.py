"""Productive use: two runs finish at the same second, a third is killed mid-write, and
the workspace was last opened by a newer Rotaris. The user restarts and the board still
shows every requirement's state, its delivered version and its history.
Expected outcome: writes are atomic, parallel writers — threads *and* processes — do not
lose each other's updates, a record from a newer schema version is reported instead of
being reinterpreted or overwritten, an unknown field survives a round-trip, and a single
corrupt file costs exactly one requirement."""

from __future__ import annotations

import ast
import datetime as dt
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    DELIVERY_SCHEMA_VERSION,
    DeliveryActor,
    DeliveryRecord,
    DeliveryState,
    DeliveryStatus,
    DeliveryStore,
    DeliveryStoreError,
    DeliveryTransitions,
    FutureRecordError,
    RecordNoticeKind,
    SatisfiedDelivery,
    SatisfiedLog,
    TransitionCause,
    TransitionRequest,
    blank_index,
    record_filename,
)
from rotaris_core.requirements.tombstones import RequirementContentError

pytestmark = pytest.mark.unit

REQ = "SWR-3205"
AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
SYSTEM = DeliveryActor.system("requirement-runner")
REPO_ROOT = Path(__file__).resolve().parents[3]

WORKER = """
import datetime as dt
import sys
from pathlib import Path

from rotaris_core.requirements.delivery import DeliveryStore, SatisfiedDelivery

workspace, tag, count = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
store = DeliveryStore(workspace)
for index in range(count):
    entry = SatisfiedDelivery(
        satisfied_hash=f"{tag}-{index}",
        run_id=f"{tag}-{index}",
        satisfied_at=dt.datetime.now(dt.UTC),
    )
    store.update_record(
        "SWR-3205",
        lambda record, entry=entry: record.evolve(
            satisfied=record.satisfied.appended(entry),
        ),
    )
"""


def delivered(tag: str) -> SatisfiedDelivery:
    """One recorded delivery, distinguishable from every other."""
    return SatisfiedDelivery(
        req_id=REQ,
        satisfied_hash=f"hash-{tag}",
        run_id=f"run-{tag}",
        satisfied_at=AT,
        verified_commit=f"commit-{tag}",
    )


def append(record: DeliveryRecord, entry: SatisfiedDelivery) -> DeliveryRecord:
    """The read-modify-write every run completion performs."""
    return record.evolve(satisfied=record.satisfied.appended(entry))


def blocked_record(req_id: str = REQ) -> DeliveryRecord:
    """A record with something in every field a record can hold."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.BLOCKED,
            blocked_reason="the upstream API is down",
            blocked_from=DeliveryState.RUNNING,
            changed_at=AT,
            changed_by=SYSTEM,
            cause=TransitionCause.BLOCKER_RAISED,
            requirement_hash="hash-now",
        ),
        satisfied=SatisfiedLog(entries=(delivered("1"), delivered("2"))),
    )


# -- reading costs nothing (SWR-3201, SWR-3205) ----------------------------


@verifies(SWR.SWR_3205, SWR.SWR_3201)
def test_a_workspace_rotaris_never_wrote_to_reports_backlog_and_stays_empty(
    tmp_path: Path,
) -> None:
    """Opening a board must not write into a project that only wanted to look."""
    store = DeliveryStore(tmp_path)

    assert store.read("SWR-3101").state is DeliveryState.BACKLOG
    assert store.read("SWR-3101").pristine
    assert store.load_all().records == {}
    assert not store.directory.exists()
    assert list(tmp_path.rglob("*")) == []

    # ... which is exactly what the board renders for a fresh workspace.
    fresh = blank_index(["SWR-3101", "SWR-3102"])
    assert fresh.req_ids == ("SWR-3101", "SWR-3102")
    assert all(fresh.get(req_id).pristine for req_id in fresh.req_ids)


@verifies(SWR.SWR_3205, SWR.SWR_3201)
def test_a_record_persists_only_once_its_state_is_actually_changed(tmp_path: Path) -> None:
    """A default is not news: Backlog needs no file, a moved state does."""
    store = DeliveryStore(tmp_path)

    store.update_record(REQ, lambda record: record)
    assert not store.path_for(REQ).exists()

    store.update_record(
        REQ,
        lambda record: record.evolve(
            delivery=record.delivery.moved_to(
                DeliveryState.READY,
                actor=SYSTEM,
                at=AT,
                cause=TransitionCause.USER_ACTION,
            ),
        ),
    )
    assert store.path_for(REQ).is_file()
    assert store.read(REQ).state is DeliveryState.READY


# -- the round trip --------------------------------------------------------


@verifies(SWR.SWR_3205)
def test_every_field_of_a_record_survives_a_write_and_a_read(tmp_path: Path) -> None:
    """Restart the app: same state, same blocker, same hashes, same history."""
    store = DeliveryStore(tmp_path)
    stored = store.seed(blocked_record())

    reloaded = DeliveryStore(tmp_path).load(REQ)
    assert reloaded.notices == ()
    assert reloaded.record.delivery == blocked_record().delivery
    assert reloaded.record.satisfied == blocked_record().satisfied
    assert reloaded.record.updated_at == stored.updated_at
    assert reloaded.record.schema_version == DELIVERY_SCHEMA_VERSION
    assert DeliveryStore(tmp_path).load_all().records == {REQ: reloaded.record}


@verifies(SWR.SWR_3205)
def test_a_written_record_is_versioned_and_readable_json(tmp_path: Path) -> None:
    """A record a human can read is a record a later version can migrate."""
    store = DeliveryStore(tmp_path)
    store.seed(blocked_record())

    payload = json.loads(store.path_for(REQ).read_text(encoding="utf-8"))
    assert payload["schema_version"] == DELIVERY_SCHEMA_VERSION
    assert payload["req_id"] == REQ
    assert payload["delivery"]["state"] == "blocked"
    assert payload["delivery"]["blocked_from"] == "running"
    assert [entry["run_id"] for entry in payload["satisfied"]] == ["run-1", "run-2"]


@verifies(SWR.SWR_3205, SWR.SWR_3114)
def test_requirement_text_is_never_written_and_never_kept_when_found(tmp_path: Path) -> None:
    """Rotaris does not become a second requirement store, by construction."""
    with pytest.raises(RequirementContentError, match="title"):
        DeliveryRecord(req_id=REQ, extras={"title": "Delivery metadata store"}).to_payload()

    store = DeliveryStore(tmp_path)
    store.seed(blocked_record())
    path = store.path_for(REQ)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["description"] = "the requirement's prose, smuggled in by a well-meaning build"
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = DeliveryStore(tmp_path).load(REQ)
    assert read.record.state is DeliveryState.BLOCKED  # the rest of the record survives
    assert "description" not in read.record.extras
    assert [notice.kind for notice in read.notices] == [RecordNoticeKind.CONTENT_DROPPED]

    # ... and the next write leaves it behind rather than carrying it forward.
    store.update_record(REQ, lambda record: append(record, delivered("3")))
    assert "description" not in path.read_text(encoding="utf-8")
    assert store.read(REQ).satisfied.hashes == ("hash-1", "hash-2", "hash-3")


# -- atomicity and versioning ---------------------------------------------


@verifies(SWR.SWR_3205)
def test_an_interrupted_write_leaves_the_previous_record_intact(tmp_path: Path) -> None:
    """A crash between two writes must not cost the state that was already there."""
    DeliveryStore(tmp_path).seed(blocked_record())
    path = DeliveryStore(tmp_path).path_for(REQ)
    before = path.read_bytes()

    def interrupted(source: str, target: str) -> None:
        raise OSError("the process was killed mid-write")

    crashing = DeliveryStore(tmp_path, replace=interrupted)
    with pytest.raises(OSError, match="mid-write"):
        crashing.update_record(REQ, lambda record: append(record, delivered("3")))

    assert path.read_bytes() == before
    assert [entry.name for entry in path.parent.iterdir()] == [path.name]
    assert DeliveryStore(tmp_path).read(REQ).satisfied.hashes == ("hash-1", "hash-2")


@verifies(SWR.SWR_3205)
def test_a_record_from_a_newer_schema_version_is_reported_and_left_alone(
    tmp_path: Path,
) -> None:
    """A downgrade must not quietly reinterpret — or quietly destroy — newer data."""
    store = DeliveryStore(tmp_path)
    path = store.path_for(REQ)
    path.parent.mkdir(parents=True)
    future = {
        "schema_version": DELIVERY_SCHEMA_VERSION + 1,
        "req_id": REQ,
        "delivery": {"state": "done"},
        "something_new": {"invented": "later"},
    }
    path.write_text(json.dumps(future), encoding="utf-8")
    before = path.read_bytes()

    read = store.load(REQ)
    assert read.from_future
    assert read.record.state is DeliveryState.BACKLOG  # degraded, not reinterpreted
    assert [notice.kind for notice in read.notices] == [RecordNoticeKind.FUTURE_SCHEMA]
    assert str(DELIVERY_SCHEMA_VERSION + 1) in read.notices[0].detail

    with pytest.raises(FutureRecordError, match="refuses to overwrite"):
        store.update_record(REQ, lambda record: append(record, delivered("3")))
    assert path.read_bytes() == before


@verifies(SWR.SWR_3205)
def test_an_older_record_loads_with_defaults_and_an_unknown_field_survives(
    tmp_path: Path,
) -> None:
    """Adding a field must not strand the records written before it existed."""
    store = DeliveryStore(tmp_path)
    path = store.path_for(REQ)
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "req_id": REQ,
                "delivery": {
                    "state": "ready",
                    "changed_at": AT.isoformat(),
                    "changed_by": {"kind": "system", "name": "requirement-runner"},
                    "cause": "user-action",
                },
                "evidence": {"health": "ok"},
            },
        ),
        encoding="utf-8",
    )

    read = store.load(REQ)
    assert read.notices == ()
    assert read.record.state is DeliveryState.READY
    assert read.record.satisfied == SatisfiedLog()  # a missing key is a default
    assert read.record.updated_at is None
    assert read.record.schema_version == DELIVERY_SCHEMA_VERSION
    assert read.record.extras == {"evidence": {"health": "ok"}}

    store.update_record(REQ, lambda record: append(record, delivered("1")))
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["evidence"] == {"health": "ok"}  # not dropped by a build that ignores it


@verifies(SWR.SWR_3205, SWR.SWR_3201)
def test_a_state_that_names_nobody_degrades_without_taking_the_record_with_it(
    tmp_path: Path,
) -> None:
    """A hand-edited state costs its column, not the requirement's delivered version."""
    store = DeliveryStore(tmp_path)
    store.seed(blocked_record())
    path = store.path_for(REQ)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["delivery"] = {"state": "done"}  # no actor, no time, no cause
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = store.load(REQ)
    assert read.record.state is DeliveryState.BACKLOG
    assert read.record.satisfied.hashes == ("hash-1", "hash-2")
    assert [notice.kind for notice in read.notices] == [RecordNoticeKind.UNATTRIBUTED_STATE]
    assert "Done" in read.notices[0].detail


@verifies(SWR.SWR_3205)
def test_one_corrupt_record_degrades_its_own_requirement_and_no_other(
    tmp_path: Path,
) -> None:
    """A half-written file must not stop the board from opening."""
    store = DeliveryStore(tmp_path)
    store.seed(blocked_record("SWR-3201"))
    store.seed(blocked_record("SWR-3202"))
    store.path_for("SWR-3201").write_text("{ this is not json", encoding="utf-8")

    index = store.load_all()
    assert set(index.records) == {"SWR-3202"}
    assert index.get("SWR-3201").state is DeliveryState.BACKLOG
    assert index.get("SWR-3201").pristine
    assert [notice.kind for notice in index.notices] == [RecordNoticeKind.UNREADABLE]
    assert index.notices[0].req_id == "SWR-3201"
    assert "SWR-3201" in index.notices[0].message  # a line a user can act on
    assert store.read("SWR-3202").state is DeliveryState.BLOCKED


@verifies(SWR.SWR_3205, SWR.SWR_3201)
def test_an_unknown_state_on_disk_degrades_that_record_to_backlog_with_a_notice(
    tmp_path: Path,
) -> None:
    """The rest of the record is still worth having, so it is kept."""
    store = DeliveryStore(tmp_path)
    store.seed(blocked_record())
    path = store.path_for(REQ)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["delivery"]["state"] = "shipped"
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = store.load(REQ)
    assert read.record.state is DeliveryState.BACKLOG
    assert read.record.satisfied.hashes == ("hash-1", "hash-2")
    assert [notice.kind for notice in read.notices] == [RecordNoticeKind.UNKNOWN_STATE]
    assert "shipped" in read.notices[0].detail


# -- identity --------------------------------------------------------------


@verifies(SWR.SWR_3205)
def test_ids_that_are_not_file_names_still_get_one_record_each(tmp_path: Path) -> None:
    """A tracker's ``#412`` is as much a requirement id as ``SWR-3205``."""
    assert record_filename("SWR-3205") == "SWR-3205.json"
    assert record_filename("#412") != record_filename("#413")
    assert record_filename("PROJ/7").endswith(".json")
    assert record_filename("NUL") != "NUL.json"

    store = DeliveryStore(tmp_path)
    for req_id in ("#412", "PROJ/7", "SWR-3205"):
        store.seed(blocked_record(req_id))

    assert set(store.load_all().records) == {"#412", "PROJ/7", "SWR-3205"}
    assert store.read("#412").req_id == "#412"
    assert store.read("PROJ/7").state is DeliveryState.BLOCKED


@verifies(SWR.SWR_3205)
def test_a_record_that_names_another_requirement_is_reported_not_served(
    tmp_path: Path,
) -> None:
    """One requirement's state must never be answered with another's."""
    store = DeliveryStore(tmp_path)
    store.seed(blocked_record("SWR-3201"))
    payload = json.loads(store.path_for("SWR-3201").read_text(encoding="utf-8"))
    payload["req_id"] = "SWR-9999"
    store.path_for("SWR-3201").write_text(json.dumps(payload), encoding="utf-8")

    read = store.load("SWR-3201")
    assert read.record.pristine
    assert [notice.kind for notice in read.notices] == [RecordNoticeKind.ID_MISMATCH]
    assert "SWR-9999" in read.notices[0].detail


@verifies(SWR.SWR_3205)
def test_an_update_may_not_rename_the_record_it_was_given(tmp_path: Path) -> None:
    """A mutation that changes the id would file a requirement under another's name."""
    store = DeliveryStore(tmp_path)
    with pytest.raises(DeliveryStoreError, match="may not change the record's id"):
        store.update_record(REQ, lambda record: record.evolve(req_id="SWR-9999"))


# -- parallel writers (SWR-3205) -------------------------------------------


@verifies(SWR.SWR_3205)
def test_concurrent_threads_appending_to_one_record_lose_nothing(tmp_path: Path) -> None:
    """Sixteen run completions on one requirement: sixteen entries, not one."""
    store = DeliveryStore(tmp_path)
    tags = [f"t{index}" for index in range(16)]

    def contribute(tag: str) -> None:
        store.update_record(REQ, lambda record, tag=tag: append(record, delivered(tag)))

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(contribute, tags))

    hashes = DeliveryStore(tmp_path).read(REQ).satisfied.hashes
    assert sorted(hashes) == sorted(f"hash-{tag}" for tag in tags)


@verifies(SWR.SWR_3205)
def test_concurrent_processes_appending_to_one_record_lose_nothing(tmp_path: Path) -> None:
    """Two runs in two OS processes — the case a threading lock would not cover."""
    script = tmp_path / "worker.py"
    script.write_text(WORKER, encoding="utf-8")
    per_process = 6
    tags = ("alpha", "beta", "gamma")

    workers = [
        subprocess.Popen(  # noqa: S603 - fixed argv, no shell
            [sys.executable, str(script), str(tmp_path), tag, str(per_process)],
            cwd=str(tmp_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for tag in tags
    ]
    for worker in workers:
        stdout, stderr = worker.communicate(timeout=90)
        assert worker.returncode == 0, f"worker failed: {stdout}\n{stderr}"

    hashes = DeliveryStore(tmp_path).read(REQ).satisfied.hashes
    expected = {f"{tag}-{index}" for tag in tags for index in range(per_process)}
    assert set(hashes) == expected
    assert len(hashes) == len(expected)


@verifies(SWR.SWR_3205)
def test_two_requirements_are_written_independently(tmp_path: Path) -> None:
    """Parallel runs on different requirements never contend and never collide."""
    store = DeliveryStore(tmp_path)
    ids = [f"SWR-32{index:02d}" for index in range(10)]

    def contribute(req_id: str) -> None:
        store.update_record(req_id, lambda record, req_id=req_id: append(record, delivered(req_id)))

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(contribute, ids))

    index = store.load_all()
    assert index.req_ids == tuple(ids)
    for req_id in ids:
        assert index.get(req_id).satisfied.hashes == (f"hash-{req_id}",)


@verifies(SWR.SWR_3205, SWR.SWR_3204)
def test_a_full_delivery_cycle_is_persisted_and_capped_by_the_stores_history_limit(
    tmp_path: Path,
) -> None:
    """Two deliveries of one requirement, through the only write path there is.

    Also the store's ``history_limit`` (``requirements.store.history_limit``) doing
    its job: an unbounded history would grow with every re-delivery.
    """
    store = DeliveryStore(tmp_path, history_limit=1)
    # Done needs a gate to check SWR-3215's conditions; this store test is about
    # what gets *written*, so the gate answers "every condition holds".
    transitions = DeliveryTransitions(store, completion=lambda _record, _request: ())

    def move(
        target: DeliveryState,
        *,
        actor: DeliveryActor = SYSTEM,
        entry: SatisfiedDelivery | None = None,
    ) -> None:
        outcome = transitions.apply(
            TransitionRequest(
                req_id=REQ,
                target=target,
                actor=actor,
                cause=TransitionCause.USER_ACTION,
                at=AT,
                delivery=entry,
            ),
        )
        assert outcome.accepted, outcome.message

    move(DeliveryState.READY, actor=DeliveryActor.user("dvf"))
    move(DeliveryState.RUNNING)
    move(DeliveryState.REVIEW)
    move(DeliveryState.DONE, entry=delivered("1"))
    assert store.read(REQ).satisfied.hashes == ("hash-1",)

    # The specification moves, and the requirement is delivered a second time.
    move(DeliveryState.NEEDS_UPDATE)
    move(DeliveryState.READY)
    move(DeliveryState.RUNNING)
    move(DeliveryState.REVIEW)
    move(DeliveryState.DONE, entry=delivered("2"))

    reloaded = DeliveryStore(tmp_path).read(REQ)
    assert reloaded.state is DeliveryState.DONE
    assert reloaded.satisfied.hashes == ("hash-2",)  # capped at one, newest kept
    assert reloaded.satisfied_hash == "hash-2"


# -- the write paths that exist, and the ones nothing may use --------------


@lru_cache(maxsize=1)
def _attribute_call_index(roots: tuple[Path, ...]) -> dict[str, dict[str, list[str]]]:
    """Every ``something.<attr>(...)`` call under *roots*, indexed by attribute name.

    One walk over the shipped packages, not one per name asked about. The guard
    below asks about three names, and re-parsing both source trees for each of them
    was the whole of this test's 7.8s -- for an answer that cannot change between
    the three questions.
    """
    index: dict[str, dict[str, list[str]]] = {}
    for root in roots:
        for path in sorted(root.rglob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            where = path.relative_to(REPO_ROOT).as_posix()
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    index.setdefault(node.func.attr, {}).setdefault(where, []).append(
                        f"{where}:{node.lineno}",
                    )
    return index


def _calls_of(name: str, roots: tuple[Path, ...]) -> dict[str, list[str]]:
    """Every ``something.<name>(...)`` call under *roots*, grouped by module.

    An AST walk rather than a text search: ``moved_to`` in a docstring is prose
    about the rule, and a guard that could not tell the two apart would be
    satisfied by deleting a comment.
    """
    return _attribute_call_index(roots).get(name, {})


@verifies(SWR.SWR_3205, SWR.SWR_3203)
def test_only_the_transition_engine_moves_a_stored_delivery_state() -> None:
    """ "One door, and no second one" — asserted over the source, not promised in prose.

    :meth:`DeliveryStatus.moved_to` is what builds a moved status,
    :meth:`DeliveryStore.seed` is a blind overwrite, and
    :meth:`DeliveryStore.update_record` applies an arbitrary mutation. All three
    are public, because a private one would only move the problem to an
    underscore. What keeps the matrix, the actor rules and the completion
    conditions unavoidable is that nothing in the shipped code reaches for any
    of them: every state change in ``src/`` goes through ``apply_transition``,
    and this is the test that notices the day one does not.

    ``update_record`` earns its clumsy name here. As ``update`` it was
    unscannable — the AST sees only an attribute name, and ``dict.update`` is
    everywhere — so it was the one door of the three this guard could not watch
    outside ``delivery/``. It is also the most dangerous of them: an arbitrary
    mutation is exactly the shape that writes a ``Done`` no completion gate
    agreed to.
    """
    roots = (REPO_ROOT / "src", REPO_ROOT / "apps" / "rotaris" / "src")
    assert all(root.is_dir() for root in roots), "the shipped packages are what this scans"

    movers = _calls_of("moved_to", roots)
    assert set(movers) == {"src/rotaris_core/requirements/delivery/transitions.py"}, (
        f"only apply_transition moves a delivery state (SWR-3203); found {movers}"
    )

    seeders = _calls_of("seed", roots)
    assert seeders == {}, (
        f"seed() is a blind overwrite for fixtures and repair, never a write path: {seeders}"
    )

    # Counted by call site, not by file. A second ``update_record`` added beside
    # ``seed()`` inside store.py — a ``force_done`` writing a Done record by hand,
    # say — is exactly the shape this guard exists to refuse, and comparing only
    # the set of *files* would have waved it through.
    mutations = sorted(
        site for sites in _calls_of("update_record", roots).values() for site in sites
    )
    assert len(mutations) == 2, (
        f"an arbitrary delivery mutation belongs to apply_transition and to seed(), "
        f"and to nothing else; found {mutations}"
    )
    # Full paths, not basenames. ``requirements/execution/store.py`` exists
    # alongside ``requirements/delivery/store.py``, so a basename comparison pins
    # *filenames in sort order* rather than files: a third store.py sorting ahead
    # of delivery/transitions.py could take over the first slot while the real
    # delivery store lost its call, and this would still read as unchanged.
    assert [site.split(":")[0] for site in mutations] == [
        "src/rotaris_core/requirements/delivery/store.py",  # seed(), the blind overwrite
        "src/rotaris_core/requirements/delivery/transitions.py",  # apply_transition, the door
    ], f"the two permitted mutation sites moved: {mutations}"

    # And the guard is worth something only if it can see a call at all.
    assert movers and mutations
