"""Productive use: Rotaris re-reads a project's requirements and has to say what moved
since the last time it looked — for a Markdown store and for a tracker alike.
Expected outcome: every difference lands in exactly one of added / removed / modified /
status; a source whose revision has not moved is not read at all; the first evaluation of
a workspace reports nothing rather than a wave of additions; and a requirement whose text
moved while its implementation and test files did not is reported as drifted.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.detection import (
    ChangeKind,
    RequirementBaseline,
    SourceChangeDetector,
    classify_changes,
)
from rotaris_core.requirements.model import (
    READ_ONLY,
    CanonicalRequirement,
    RequirementLifecycle,
)
from rotaris_core.requirements.sources.base import SourceRead

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.requirements.sources.base import RequirementArtifact

pytestmark = pytest.mark.unit

SOURCE = "tracker"


def requirement(
    req_id: str,
    *,
    title: str = "A title",
    description: str = "The requirement text.",
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
    current_hash: str = "",
    source_hash: str | None = None,
    source_path: str | None = None,
) -> CanonicalRequirement:
    """One canonical requirement, with the fields detection actually compares."""
    return CanonicalRequirement(
        req_id=req_id,
        title=title,
        description=description,
        lifecycle=lifecycle,
        current_hash=current_hash,
        source_hash=source_hash,
        source_id=SOURCE,
        source_path=source_path,
    )


def baseline_over(
    requirements: Sequence[CanonicalRequirement],
    *,
    revision: str = "r1",
) -> RequirementBaseline:
    """The baseline an evaluation over *requirements* would leave behind."""
    return RequirementBaseline.of_read(
        SourceRead(source_id=SOURCE, revision=revision, requirements=tuple(requirements)),
    )


class InMemorySource:
    """A requirement source that is not a file: a tracker, in twenty lines.

    Counts its own reads, which is the only way to assert that an unchanged
    revision really did short-circuit rather than merely produce no changes.
    """

    capabilities = READ_ONLY

    def __init__(
        self,
        requirements: Sequence[CanonicalRequirement],
        *,
        revision: str = "r1",
        source_id: str = SOURCE,
    ) -> None:
        self._requirements = tuple(requirements)
        self._revision = revision
        self._source_id = source_id
        self.reads = 0
        self.revisions = 0

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return ()

    def read(self) -> SourceRead:
        self.reads += 1
        return SourceRead(
            source_id=self._source_id,
            revision=self._revision,
            requirements=self._requirements,
        )

    def revision(self) -> str:
        self.revisions += 1
        return self._revision

    def publish(self, requirements: Sequence[CanonicalRequirement], *, revision: str) -> None:
        """What an edit in the tracker looks like from outside."""
        self._requirements = tuple(requirements)
        self._revision = revision


# --------------------------------------------------------------------------
# The four classes (SWR-3501)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3501)
def test_a_requirement_the_last_evaluation_did_not_have_is_added() -> None:
    """A new requirement is one ``added`` change carrying its hash and lifecycle."""
    before = baseline_over([requirement("SWR-9001")])
    after = [requirement("SWR-9001"), requirement("SWR-9002", title="A second one")]

    changes = classify_changes(before, after)

    assert [change.req_id for change in changes.changes] == ["SWR-9002"]
    added = changes.by_id()["SWR-9002"]
    assert added.kind is ChangeKind.ADDED
    assert added.before_hash == ""
    assert added.after_hash == after[1].current_hash
    assert added.lifecycle_from is None
    assert added.lifecycle_to is RequirementLifecycle.APPROVED


@verifies(SWR.SWR_3501)
def test_a_requirement_the_source_no_longer_declares_is_removed() -> None:
    """Removal is reported from the baseline, with the hash that was last seen."""
    gone = requirement("SWR-9002")
    before = baseline_over([requirement("SWR-9001"), gone])

    changes = classify_changes(before, [requirement("SWR-9001")])

    removed = changes.by_id()["SWR-9002"]
    assert removed.kind is ChangeKind.REMOVED
    assert removed.before_hash == gone.current_hash
    assert removed.after_hash == ""
    assert removed.lifecycle_to is None


@verifies(SWR.SWR_3501)
def test_an_edited_requirement_is_modified_with_both_hashes() -> None:
    """A changed sentence moves the canonical hash and is reported as ``modified``."""
    original = requirement("SWR-9001", description="The user signs in.")
    edited = requirement("SWR-9001", description="The user signs in with a passkey.")
    assert original.current_hash != edited.current_hash

    changes = classify_changes(baseline_over([original]), [edited])

    modified = changes.by_id()["SWR-9001"]
    assert modified.kind is ChangeKind.MODIFIED
    assert modified.before_hash == original.current_hash
    assert modified.after_hash == edited.current_hash
    assert modified.canonical_change
    assert not modified.lifecycle_moved


@verifies(SWR.SWR_3501)
def test_a_lifecycle_move_with_an_unchanged_hash_is_a_status_change() -> None:
    """A tracker that supplies its own hash can move a lifecycle without moving it.

    This is the class SWR-3501 names ``status``: content identical, lifecycle
    different. A source hashing only the description — an issue tracker, an
    exported specification — produces it whenever a ticket is accepted.
    """
    before = baseline_over(
        [requirement("SWR-9001", lifecycle=RequirementLifecycle.DRAFT, current_hash="tok-1")],
    )
    after = [
        requirement("SWR-9001", lifecycle=RequirementLifecycle.APPROVED, current_hash="tok-1"),
    ]

    changes = classify_changes(before, after)

    status = changes.by_id()["SWR-9001"]
    assert status.kind is ChangeKind.STATUS
    assert not status.canonical_change
    assert status.lifecycle_moved
    assert status.lifecycle_from is RequirementLifecycle.DRAFT
    assert status.lifecycle_to is RequirementLifecycle.APPROVED


@verifies(SWR.SWR_3501)
def test_a_lifecycle_move_that_also_moves_the_hash_is_one_modified_change() -> None:
    """One requirement, one change — with the lifecycle transition reported on it.

    Two entries for one edit would make a worklist double-count every approval in
    a Markdown store, where the lifecycle is part of the hashed content.
    """
    before = baseline_over([requirement("SWR-9001", lifecycle=RequirementLifecycle.DRAFT)])
    after = [requirement("SWR-9001", lifecycle=RequirementLifecycle.APPROVED)]

    changes = classify_changes(before, after)

    assert len(changes.changes) == 1
    change = changes.changes[0]
    assert change.kind is ChangeKind.MODIFIED
    assert change.lifecycle_from is RequirementLifecycle.DRAFT
    assert change.lifecycle_to is RequirementLifecycle.APPROVED


@verifies(SWR.SWR_3501)
def test_an_artefact_that_moved_around_unchanged_meaning_is_still_modified() -> None:
    """The source's own token moving is a change even when the meaning did not.

    A store's acceptance-criteria section is not part of the canonical model, so
    editing one leaves ``current_hash`` alone. It is still a requirement change,
    and reporting nothing would hide exactly the edit SWR-3503 is about.
    """
    before = baseline_over([requirement("SWR-9001", source_hash="file-1")])
    after = [requirement("SWR-9001", source_hash="file-2")]

    change = classify_changes(before, after).by_id()["SWR-9001"]

    assert change.kind is ChangeKind.MODIFIED
    assert not change.canonical_change
    assert change.artifact_change


@verifies(SWR.SWR_3501)
def test_an_unchanged_requirement_produces_no_change_at_all() -> None:
    """Re-reading a store nobody touched reports nothing."""
    same = [requirement("SWR-9001"), requirement("SWR-9002")]

    changes = classify_changes(baseline_over(same), same)

    assert changes.empty
    assert not changes.first_evaluation


# --------------------------------------------------------------------------
# The first evaluation (SWR-3501)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3501)
def test_the_first_evaluation_of_a_workspace_reports_no_changes() -> None:
    """Opening a workspace with a full store is not 1500 additions."""
    changes = classify_changes(
        RequirementBaseline.unevaluated(SOURCE),
        [requirement("SWR-9001"), requirement("SWR-9002")],
    )

    assert changes.empty
    assert changes.first_evaluation


@verifies(SWR.SWR_3501)
def test_an_evaluated_empty_source_that_gains_a_requirement_reports_it() -> None:
    """ "Never evaluated" and "evaluated and empty" are different facts.

    Collapsing them would make the first requirement a project ever writes
    invisible, which is the mirror image of the first-run wave.
    """
    empty = baseline_over([])
    assert empty.evaluated

    changes = classify_changes(empty, [requirement("SWR-9001")])

    assert [change.kind for change in changes.changes] == [ChangeKind.ADDED]


# --------------------------------------------------------------------------
# Drift: the requirement moved, the code claiming to implement it did not
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3501)
def test_a_modified_requirement_whose_sites_were_not_touched_is_drifted() -> None:
    """The signal ``reqtocode diff --strict`` fails on, restated source-agnostically."""
    before = baseline_over([requirement("SWR-9001", description="Old.")])
    after = [requirement("SWR-9001", description="New.")]
    sites = {"SWR-9001": ("src/pkg/login.py", "tests/unit/test_login.py")}

    untouched = classify_changes(before, after, sites=sites, touched_files=("docs/notes.md",))
    touched = classify_changes(
        before,
        after,
        sites=sites,
        touched_files=("src/pkg/login.py",),
    )

    assert untouched.by_id()["SWR-9001"].drift
    assert untouched.drifted
    assert not touched.by_id()["SWR-9001"].drift
    assert not touched.drifted


@verifies(SWR.SWR_3501)
def test_a_requirement_with_no_known_sites_is_never_reported_as_drifted() -> None:
    """An unknown site index reports no drift rather than reporting everything."""
    before = baseline_over([requirement("SWR-9001", description="Old.")])
    after = [requirement("SWR-9001", description="New.")]

    changes = classify_changes(before, after, sites=None, touched_files=())

    assert not changes.by_id()["SWR-9001"].drift


@verifies(SWR.SWR_3501)
def test_a_draft_requirement_does_not_drift_but_a_removed_one_does() -> None:
    """Drift follows ``reqtocode``'s rule so the two classifications agree.

    A modified *draft* has no dependants to betray yet; a *removed* requirement
    leaves dangling references whatever lifecycle it was in.
    """
    draft_before = baseline_over(
        [requirement("SWR-9001", lifecycle=RequirementLifecycle.DRAFT, description="Old.")],
    )
    draft_after = [
        requirement("SWR-9001", lifecycle=RequirementLifecycle.DRAFT, description="New."),
    ]
    sites = {"SWR-9001": ("src/pkg/login.py",)}

    modified = classify_changes(draft_before, draft_after, sites=sites)
    removed = classify_changes(draft_before, [], sites=sites)

    assert not modified.by_id()["SWR-9001"].drift
    assert removed.by_id()["SWR-9001"].kind is ChangeKind.REMOVED
    assert removed.by_id()["SWR-9001"].drift


# --------------------------------------------------------------------------
# The detector over a source (SWR-3501, SWR-3102)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3501)
def test_a_source_whose_revision_did_not_move_is_not_read() -> None:
    """The short-circuit is the difference between a board that polls and one that cannot."""
    source = InMemorySource([requirement("SWR-9001")], revision="r1")
    detector = SourceChangeDetector()

    first = detector.detect(source, RequirementBaseline.unevaluated(SOURCE))
    assert source.reads == 1

    second = detector.detect(source, first.baseline)

    assert source.reads == 1, "an unchanged revision must not cost a read"
    assert second.skipped
    assert second.changes.unchanged_revision
    assert second.changes.empty
    assert second.baseline == first.baseline


@verifies(SWR.SWR_3501)
def test_a_source_that_moved_is_read_and_classified() -> None:
    """The whole cycle over a non-file source: read, classify, hand back a new baseline."""
    original = requirement("SWR-9001", description="The user signs in.")
    source = InMemorySource([original], revision="r1")
    detector = SourceChangeDetector()
    first = detector.detect(source, RequirementBaseline.unevaluated(SOURCE))

    edited = requirement("SWR-9001", description="The user signs in with a passkey.")
    source.publish([edited, requirement("SWR-9002")], revision="r2")
    second = detector.detect(source, first.baseline)

    assert source.reads == 2
    assert not second.skipped
    assert second.changes.kinds() == {"modified": 1, "added": 1}
    assert second.baseline.revision == "r2"
    assert second.baseline.req_ids == ("SWR-9001", "SWR-9002")

    third = detector.detect(source, second.baseline)
    assert third.changes.empty, "the new baseline is what makes a change stop repeating"


@verifies(SWR.SWR_3501, SWR.SWR_3114)
def test_the_baseline_keeps_hashes_and_never_requirement_text() -> None:
    """The last evaluated set is identity only — the text stays in the source."""
    read = SourceRead(
        source_id=SOURCE,
        revision="r1",
        requirements=(requirement("SWR-9001", title="Log in", description="Prose."),),
    )

    baseline = RequirementBaseline.of_read(read)

    entry = baseline.entries[0]
    assert entry.content_hash == read.requirements[0].current_hash
    stored = entry.model_dump()
    # Identity, hashes, lifecycle and provenance. ``source_path`` is where the
    # text lives, not the text — the same field a tombstone persists (SWR-3114),
    # and what lets a removal noticed in a later process name the file (SWR-3119).
    assert set(stored) == {"req_id", "content_hash", "source_hash", "lifecycle", "source_path"}
    assert entry.source_path == read.requirements[0].source_path
    assert "Prose." not in repr(stored)
    assert "Log in" not in repr(stored)
