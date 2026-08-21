"""Productive use: a requirement was rewritten twice since it was first delivered. Someone
opens its history to see which wording was implemented, by which run, and whether the
newest wording ever was.
Expected outcome: one list, oldest to newest, joining the store's own commits with the
hashes and deliveries Rotaris recorded; the current version is marked; a version nobody
delivered shows no run and no commit instead of vanishing; and a project without version
control still gets the versions Rotaris saw, with the gap stated."""

from __future__ import annotations

import datetime as dt

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import DeliveryActor, SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind, AuditTrail
from rotaris_core.requirements.delivery.history import (
    GIT_LOG_FORMAT,
    ArtifactRevision,
    RecordedHash,
    RevisionOrigin,
    RevisionOutcome,
    build_revision_history,
    recorded_hashes,
    resolve_hashes,
    revisions_from_log,
)

pytestmark = pytest.mark.unit

REQ = "SWR-3214"
MARCH = dt.datetime(2026, 3, 1, 10, 0, tzinfo=dt.UTC)
JUNE = dt.datetime(2026, 6, 1, 10, 0, tzinfo=dt.UTC)
AUGUST = dt.datetime(2026, 8, 1, 10, 0, tzinfo=dt.UTC)
V1, V2, V3 = "hash-march", "hash-june", "hash-august"
SEP = "\x1f"


def commits() -> tuple[ArtifactRevision, ...]:
    """Three commits of the requirement's own document, oldest first."""
    return (
        ArtifactRevision(
            revision="aaa111",
            at=MARCH,
            author="dvf",
            subject="SWR-3214: draft the revision history",
            requirement_hash=V1,
        ),
        ArtifactRevision(
            revision="bbb222",
            at=JUNE,
            author="dvf",
            subject="SWR-3214: state the undelivered case",
            requirement_hash=V2,
        ),
        ArtifactRevision(
            revision="ccc333",
            at=AUGUST,
            author="reviewer",
            subject="SWR-3214: name the current revision",
            requirement_hash=V3,
        ),
    )


def delivery(
    requirement_hash: str,
    *,
    run_id: str = "run-4",
    at: dt.datetime = JUNE,
    commit: str | None = "c0ffee",
) -> SatisfiedDelivery:
    return SatisfiedDelivery(
        req_id=REQ,
        satisfied_hash=requirement_hash,
        run_id=run_id,
        satisfied_at=at,
        verified_commit=commit,
    )


@verifies(SWR.SWR_3214)
def test_the_history_joins_the_stores_commits_with_what_rotaris_delivered() -> None:
    """The join nobody else can make: text versions on one side, runs on the other."""
    history = build_revision_history(
        REQ,
        current_hash=V3,
        revisions=commits(),
        deliveries=(delivery(V1, run_id="run-1", at=MARCH, commit="commit-of-run-1"),),
    )

    assert [entry.requirement_hash for entry in history.entries] == [V1, V2, V3]
    assert history.source_history_available

    first, second, third = history.entries
    assert first.artefact_commit == "aaa111"
    assert first.subject == "SWR-3214: draft the revision history"
    assert first.outcome is RevisionOutcome.DELIVERED
    assert first.run_id == "run-1"
    assert first.implementing_commit == "commit-of-run-1"
    assert not first.current

    # The two later wordings were never implemented, and say so rather than
    # being left out of the list.
    for entry in (second, third):
        assert entry.outcome is RevisionOutcome.NOT_DELIVERED
        assert entry.run_id is None
        assert entry.implementing_commit is None

    assert third.current
    assert history.current is not None
    assert history.current.requirement_hash == V3
    assert [entry.requirement_hash for entry in history.undelivered] == [V2, V3]
    assert "3 revision(s), 1 delivered" in history.summary


@verifies(SWR.SWR_3214)
def test_a_commit_whose_text_was_never_resolved_still_appears() -> None:
    """The artefact moved. Saying nothing about it would hide a gap from the reader."""
    history = build_revision_history(
        REQ,
        current_hash=V2,
        revisions=(
            ArtifactRevision(revision="aaa111", at=MARCH, subject="a commit nobody resolved"),
            ArtifactRevision(revision="bbb222", at=JUNE, requirement_hash=V2),
        ),
    )

    assert len(history.entries) == 2
    unresolved = history.entries[0]
    assert unresolved.requirement_hash == ""
    assert unresolved.artefact_commit == "aaa111"
    assert not unresolved.current
    assert history.hashes == (V2,)


@verifies(SWR.SWR_3214)
def test_a_project_without_version_control_keeps_the_hashes_rotaris_recorded() -> None:
    """No git, no lie: the recorded versions, and a stated reason for the rest."""
    history = build_revision_history(
        REQ,
        current_hash=V2,
        recorded=(
            RecordedHash(requirement_hash=V1, at=MARCH),
            RecordedHash(requirement_hash=V2, at=JUNE, source_revision="rev-9"),
        ),
        deliveries=(delivery(V1, run_id="run-1", at=MARCH),),
        source_history_available=False,
        unavailable_reason="the requirement store is not under version control",
    )

    assert not history.source_history_available
    assert "not under version control" in history.unavailable_reason
    assert [entry.requirement_hash for entry in history.entries] == [V1, V2]
    assert all(entry.artefact_commit is None for entry in history.entries)
    assert history.entries[0].origin is RevisionOrigin.RECORDED_HASH
    assert history.entries[1].source_revision == "rev-9"
    assert history.entries[1].current
    assert "source history unavailable" in history.summary


@verifies(SWR.SWR_3214, SWR.SWR_3213)
def test_the_recorded_versions_are_read_from_the_audit_trail_and_the_satisfied_log() -> None:
    """Rotaris' own two memories of a version, joined into one input for the history."""
    trail = AuditTrail.of(
        REQ,
        (
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.SPECIFICATION_CHANGED,
                at=MARCH,
                actor=DeliveryActor.user("dvf"),
                requirement_hash=V1,
            ),
            AuditEvent(
                req_id=REQ,
                kind=AuditEventKind.DELIVERY_TRANSITION,
                at=JUNE,
                actor=DeliveryActor.system("runner"),
                requirement_hash=V2,
                satisfied_hash=V1,
            ),
        ),
    )
    log = SatisfiedLog().appended(delivery(V1, run_id="run-1", at=MARCH))

    found = recorded_hashes(trail, log.entries)

    assert [entry.requirement_hash for entry in found] == [V1, V2]
    assert found[0].at == MARCH, "the earliest sighting of a version is when it appeared"
    assert found[1].at == JUNE

    history = build_revision_history(
        REQ,
        current_hash=V2,
        recorded=found,
        deliveries=log.entries,
        source_history_available=False,
    )
    assert history.entries[0].run_id == "run-1"
    assert history.entries[1].run_id is None


@verifies(SWR.SWR_3214)
def test_the_current_version_is_identified_even_when_no_revision_carries_it() -> None:
    """An uncommitted edit is exactly when "was this ever delivered" matters most."""
    history = build_revision_history(
        REQ,
        current_hash="hash-of-the-uncommitted-edit",
        revisions=commits(),
        deliveries=(delivery(V3, run_id="run-9", at=AUGUST),),
    )

    assert len(history.entries) == 4
    current = history.current
    assert current is not None
    assert current.requirement_hash == "hash-of-the-uncommitted-edit"
    assert current.origin is RevisionOrigin.WORKING_TREE
    assert current.at is None
    assert current.outcome is RevisionOutcome.NOT_DELIVERED
    assert history.entries[-1] is history.entries[history.entries.index(current)], (
        "an undated current revision is the newest, not the oldest"
    )


@verifies(SWR.SWR_3214)
def test_a_version_delivered_twice_reports_the_delivery_that_still_stands() -> None:
    """Re-delivering a version must not leave the first run's commit on the card."""
    history = build_revision_history(
        REQ,
        current_hash=V1,
        revisions=commits()[:1],
        deliveries=(
            delivery(V1, run_id="run-1", at=MARCH, commit="first-commit"),
            delivery(V1, run_id="run-2", at=AUGUST, commit="second-commit"),
        ),
    )

    assert len(history.entries) == 1
    assert history.entries[0].run_id == "run-2"
    assert history.entries[0].implementing_commit == "second-commit"
    assert history.entries[0].at == MARCH, "the version is as old as its first appearance"
    assert history.entries[0].delivered_at == AUGUST


@verifies(SWR.SWR_3214)
def test_the_first_commit_carrying_a_version_is_the_one_that_introduced_it() -> None:
    """A later commit that left the wording alone did not create that wording."""
    history = build_revision_history(
        REQ,
        current_hash=V1,
        revisions=(
            ArtifactRevision(revision="bbb222", at=JUNE, subject="reformat", requirement_hash=V1),
            ArtifactRevision(revision="aaa111", at=MARCH, subject="write it", requirement_hash=V1),
        ),
    )

    assert len(history.entries) == 1
    assert history.entries[0].artefact_commit == "aaa111"
    assert history.entries[0].subject == "write it"
    assert history.entries[0].at == MARCH


@verifies(SWR.SWR_3214)
def test_crafted_git_output_becomes_revisions_oldest_first() -> None:
    """The parser, against the format this module asks git for."""
    assert GIT_LOG_FORMAT.count(SEP) == 3

    revisions = revisions_from_log(
        [
            f"ccc333{SEP}2026-08-01T10:00:00+00:00{SEP}reviewer{SEP}SWR-3214: name it",
            f"aaa111{SEP}2026-03-01T10:00:00+00:00{SEP}dvf{SEP}SWR-3214: draft: with a colon",
            "",
            f"ddd444{SEP}not-a-date{SEP}dvf{SEP}a commit git dated oddly",
            "a line from something else entirely",
        ],
    )

    assert [revision.revision for revision in revisions] == ["ddd444", "aaa111", "ccc333"]
    assert revisions[-1].at == AUGUST
    assert revisions[-1].author == "reviewer"
    assert revisions[1].subject == "SWR-3214: draft: with a colon"
    assert revisions[0].at is None, "an unparsable date is unknown, not invented"
    assert all(revision.requirement_hash == "" for revision in revisions)


@verifies(SWR.SWR_3214)
def test_resolving_a_revisions_text_fills_in_only_what_the_source_can_answer() -> None:
    """Reading a past version is the source's job (SWR-3102) and it may decline."""
    known = {"aaa111": V1, "ccc333": V3}
    asked: list[str] = []

    def read_hash_at(revision: str) -> str | None:
        asked.append(revision)
        return known.get(revision)

    resolved = resolve_hashes(
        (
            ArtifactRevision(revision="aaa111", at=MARCH),
            ArtifactRevision(revision="bbb222", at=JUNE),
            ArtifactRevision(revision="ccc333", at=AUGUST, requirement_hash=V3),
        ),
        read_hash_at,
    )

    assert [revision.requirement_hash for revision in resolved] == [V1, "", V3]
    assert asked == ["aaa111", "bbb222"], "a revision that already knows its hash is not re-read"

    history = build_revision_history(REQ, current_hash=V3, revisions=resolved)
    assert [entry.requirement_hash for entry in history.entries] == [V1, "", V3]
    assert history.entries[-1].current
