"""The verification artefact and its store (SWR-3220).

The subject is one question asked twice: can a stored verification still answer
*what it saw* and *what it proved*, weeks after the run that produced it? Every
test here is a way of losing that ability, and the assertion is that the store
notices instead of serving a confident half-answer.
"""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import VerificationRecord
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.verification import (
    VERIFICATION_SCHEMA_VERSION,
    RequirementVerification,
    VerificationNoticeKind,
    VerificationOrigin,
    VerificationStore,
    verifications_by_id,
)
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from pathlib import Path

AT = dt.datetime(2026, 8, 16, 9, 30, tzinfo=dt.UTC)
COMMIT = "0912c7be0912c7be0912c7be0912c7be0912c7be"


def _record(
    *,
    verdict: str = "passed",
    commit: str = COMMIT,
    requirement_hash: str = "hash-1",
    run_id: str = "run-7",
) -> VerificationRecord:
    return VerificationRecord(
        verdict=verdict,  # type: ignore[arg-type]
        commit=commit,
        requirement_hash=requirement_hash,
        run_id=run_id,
        verified_at=AT,
        checks=("pytest",),
    )


def _verification(
    req_id: str = "SWR-3220",
    *,
    executed: bool = True,
    origin: VerificationOrigin = VerificationOrigin.ROTARIS,
    target_branch: str = "master",
) -> RequirementVerification:
    return RequirementVerification(
        req_id=req_id,
        record=_record(),
        implementations=(RequirementSite(path="src/a.py", line=12),),
        covering_tests=(
            CoveringTest(
                path="tests/test_a.py",
                line=40,
                executed=executed,
                check_name="pytest" if executed else None,
                check_status="passed" if executed else None,
            ),
        ),
        origin=origin,
        target_branch=target_branch,
    )


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_a_verification_round_trips_with_its_verdict_baseline_and_test_outcomes(
    tmp_path: Path,
) -> None:
    """Productive use: a verification is written today and read back next week.
    Expected outcome: all three parts survive — the verdict, the sites it saw, and
    which covering test actually ran."""
    store = VerificationStore(tmp_path)
    store.save(_verification())

    loaded = store.read("SWR-3220")

    assert loaded is not None
    assert loaded.record.verdict == "passed"
    assert loaded.record.run_id == "run-7"
    assert loaded.implementations == (RequirementSite(path="src/a.py", line=12),)
    assert [(test.path, test.executed, test.check_status) for test in loaded.covering_tests] == [
        ("tests/test_a.py", True, "passed"),
    ]
    assert loaded.target_branch == "master"


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_the_freshness_baseline_is_derived_from_the_sites_rather_than_stored_twice() -> None:
    """Productive use: SWR-3209 compares today's repository with what the run saw.
    Expected outcome: the baseline reports the same sites the artefact holds, so the
    two copies cannot disagree about whether a trace moved."""
    verification = _verification()

    baseline = verification.baseline

    assert baseline.commit == COMMIT
    assert baseline.requirement_hash == "hash-1"
    assert baseline.implementations == verification.implementations
    assert baseline.covering_tests == (RequirementSite(path="tests/test_a.py", line=40),)


@pytest.mark.unit
@verifies(SWR.SWR_3220)
@pytest.mark.parametrize("lost", ["implementations", "covering_tests"])
def test_an_artefact_that_lost_its_sites_is_unreadable_rather_than_empty(
    tmp_path: Path,
    lost: str,
) -> None:
    """Productive use: an older or foreign writer stored only the verdict.
    Expected outcome: the store refuses it. Reading it as "the run saw nothing"
    would make every later freshness comparison report drift that never happened."""
    store = VerificationStore(tmp_path)
    store.save(_verification())
    path = store.path_for("SWR-3220")
    payload = json.loads(path.read_text(encoding="utf-8"))
    del payload[lost]
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = store.load("SWR-3220")

    assert read.verification is None
    assert [notice.kind for notice in read.notices] == [VerificationNoticeKind.UNREADABLE]
    assert lost in read.notices[0].detail


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_an_artefact_with_no_sites_at_all_is_a_real_answer_and_loads(tmp_path: Path) -> None:
    """Productive use: a requirement with no traces is verified and fails.
    Expected outcome: empty is not absent — the artefact loads, with empty sites."""
    store = VerificationStore(tmp_path)
    store.save(
        RequirementVerification(
            req_id="SWR-9001",
            record=_record(verdict="failed"),
        ),
    )

    loaded = store.read("SWR-9001")

    assert loaded is not None
    assert loaded.implementations == ()
    assert loaded.covering_tests == ()
    assert loaded.passed is False


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_a_record_from_a_newer_build_is_reported_and_left_alone(tmp_path: Path) -> None:
    """Productive use: a colleague on a newer Rotaris verified this workspace.
    Expected outcome: the artefact is reported as future-schema, not reinterpreted."""
    store = VerificationStore(tmp_path)
    store.save(_verification())
    path = store.path_for("SWR-3220")
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["schema_version"] = VERIFICATION_SCHEMA_VERSION + 1
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = store.load("SWR-3220")

    assert read.verification is None
    assert read.from_future is True
    assert [notice.kind for notice in read.notices] == [VerificationNoticeKind.FUTURE_SCHEMA]


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_one_corrupt_artefact_costs_its_own_requirement_and_no_other(tmp_path: Path) -> None:
    """Productive use: one file is truncated by a crash mid-write on another machine.
    Expected outcome: the other requirements still load. A board that refused to
    render because one artefact was corrupt would be worse than one that says
    "not verified"."""
    store = VerificationStore(tmp_path)
    store.save(_verification("SWR-1"))
    store.save(_verification("SWR-2"))
    store.path_for("SWR-1").write_text("{ not json", encoding="utf-8")

    index = store.load_all()

    assert sorted(index.verifications) == ["SWR-2"]
    assert [notice.kind for notice in index.notices] == [VerificationNoticeKind.UNREADABLE]


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_an_artefact_written_without_an_origin_reads_back_as_a_rotaris_one(
    tmp_path: Path,
) -> None:
    """Productive use: a file written before the origin field existed is read.
    Expected outcome: `rotaris` — what it actually was — and the field is omitted
    on write, so a Rotaris artefact stays byte-identical to the older format."""
    store = VerificationStore(tmp_path)
    store.save(_verification())

    payload = json.loads(store.path_for("SWR-3220").read_text(encoding="utf-8"))

    assert "origin" not in payload
    loaded = store.read("SWR-3220")
    assert loaded is not None
    assert loaded.origin is VerificationOrigin.ROTARIS


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_an_adopted_verification_says_so_and_an_unknown_origin_is_refused(
    tmp_path: Path,
) -> None:
    """Productive use: adoption records what its suite measured (SWR-3217).
    Expected outcome: the artefact names `adopted`; a token this build does not know
    is an error rather than a silent downgrade to `rotaris`, which would attribute
    someone else's measurement to a Rotaris run."""
    store = VerificationStore(tmp_path)
    store.save(_verification(origin=VerificationOrigin.ADOPTED))

    loaded = store.read("SWR-3220")
    assert loaded is not None
    assert loaded.origin is VerificationOrigin.ADOPTED

    path = store.path_for("SWR-3220")
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["origin"] = "jenkins"
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = store.load("SWR-3220")
    assert read.verification is None
    assert "jenkins" in read.notices[0].detail


@pytest.mark.unit
@verifies(SWR.SWR_3220, SWR.SWR_3201)
def test_verifying_a_backlog_requirement_writes_no_delivery_record(tmp_path: Path) -> None:
    """Productive use: a user verifies before deciding whether to adopt (SWR-3615).
    Expected outcome: a verification exists and the delivery store is still empty —
    SWR-3201's "Backlog without a write" survives having evidence."""
    VerificationStore(tmp_path).save(_verification("SWR-4242"))

    delivery = DeliveryStore(tmp_path)

    assert delivery.load_all().records == {}
    assert not delivery.path_for("SWR-4242").exists()
    assert VerificationStore(tmp_path).read("SWR-4242") is not None


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_a_second_verification_replaces_the_first(tmp_path: Path) -> None:
    """Productive use: the same requirement is verified again a day later.
    Expected outcome: one artefact, the newer one. SWR-3208 asks for *the* last
    verification; the sequence lives in the audit trail (SWR-3213)."""
    store = VerificationStore(tmp_path)
    store.save(_verification())
    store.save(
        RequirementVerification(
            req_id="SWR-3220",
            record=_record(commit="f" * 40, run_id="run-8", requirement_hash="hash-2"),
            implementations=(RequirementSite(path="src/a.py", line=15),),
            covering_tests=(),
        ),
    )

    loaded = store.read("SWR-3220")

    assert loaded is not None
    assert loaded.record.run_id == "run-8"
    assert loaded.implementations == (RequirementSite(path="src/a.py", line=15),)
    assert len(list(store.directory.glob("*.json"))) == 1


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_an_artefact_naming_another_requirement_is_reported_not_served(tmp_path: Path) -> None:
    """Productive use: a case-insensitive filesystem maps two ids onto one file.
    Expected outcome: an id mismatch, never one requirement's evidence served for
    another's."""
    store = VerificationStore(tmp_path)
    store.save(_verification("SWR-1"))
    path = store.path_for("SWR-1")
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["req_id"] = "SWR-2"
    path.write_text(json.dumps(payload), encoding="utf-8")

    read = store.load("SWR-1")

    assert read.verification is None
    assert [notice.kind for notice in read.notices] == [VerificationNoticeKind.ID_MISMATCH]


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_reading_a_workspace_that_was_never_verified_answers_none(tmp_path: Path) -> None:
    """Productive use: the board projects a workspace nobody has verified.
    Expected outcome: no verification and no notice — nothing went wrong, there is
    simply nothing to report."""
    store = VerificationStore(tmp_path)

    read = store.load("SWR-1")

    assert read.verification is None
    assert read.notices == ()
    assert store.load_all().verifications == {}


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_narrowing_the_read_answers_only_the_requirements_asked_about(tmp_path: Path) -> None:
    """Productive use: a detail pass opens one card of a thousand.
    Expected outcome: the narrowed read answers for that one."""
    store = VerificationStore(tmp_path)
    store.save(_verification("SWR-1"))
    store.save(_verification("SWR-2"))

    assert sorted(verifications_by_id(store)) == ["SWR-1", "SWR-2"]
    assert sorted(verifications_by_id(store, ["SWR-2"])) == ["SWR-2"]


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_the_summary_says_what_ran_where_and_under_which_origin() -> None:
    """Productive use: a card shows one line about the last verification.
    Expected outcome: the verdict, the branch, how many covering tests actually ran,
    and who measured it."""
    summary = _verification(origin=VerificationOrigin.ADOPTED).summary

    assert "passed" in summary
    assert "on master" in summary
    assert "1/1 covering test(s) ran" in summary
    assert "adopted" in summary


@pytest.mark.unit
@verifies(SWR.SWR_3220)
def test_a_verification_whose_covering_test_never_ran_reports_none_executed() -> None:
    """Productive use: the suite skipped the file the covering test lives in.
    Expected outcome: the artefact keeps the test and says nothing executed it —
    SWR-2606's distinction, carried through persistence."""
    verification = _verification(executed=False)

    assert verification.covering_tests != ()
    assert verification.executed_tests == ()
    assert "0/1 covering test(s) ran" in verification.summary
