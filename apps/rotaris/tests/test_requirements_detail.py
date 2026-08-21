"""The requirement detail view and its revision history (SWR-3307, SWR-3313).

The detail view is the one place that holds everything about a requirement, so
the tests here are about completeness and about degradation: all five sections
are rendered for a populated requirement, each one states its own emptiness when
it has nothing, and a relation that dangles is *shown* as unresolved rather than
quietly dropped.

The revision history answers the question a classical tracker cannot: which
version of this requirement did we actually build, and which one is not built
yet. The last test drives that over a real projection — a requirement delivered
at one hash whose specification then moved.
"""

from __future__ import annotations

import datetime as dt
import subprocess
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.history import (
    GitArtifactRevisions,
    RecordedHash,
    build_revision_history,
)
from rotaris_core.requirements.delivery.projection import (
    BoardInputs,
    StoredDetails,
    project_board,
)
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.store import DeliveryRecord
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import accessible_names, click_by_name, find_by_accessible_name

from rotaris.models.requirements_state import (
    DETAIL_SECTIONS,
    NO_HISTORY_REASON,
    PENDING_HISTORY_REASON,
    DetailSection,
    RelationLink,
    RequirementDetail,
    RequirementFact,
    Revision,
    build_detail,
)
from rotaris.views.requirement_detail import (
    NO_REVISIONS_MESSAGE,
    RequirementDetailView,
    RevisionHistoryPanel,
)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.delivery.history import RevisionHistory
    from rotaris_core.requirements.delivery.projection import BoardEntry, BoardProjection

pytestmark = pytest.mark.unit

WHEN = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
NOW = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)


def _section(key: str, title: str, empty: str, **kwargs: object) -> DetailSection:
    return DetailSection(key=key, title=title, empty_message=empty, **kwargs)  # type: ignore[arg-type]


def _populated() -> RequirementDetail:
    return RequirementDetail(
        req_id="SWR-6001",
        title="The detail view holds everything",
        sections=(
            _section(
                "requirement",
                "Requirement",
                "This requirement could not be read from its source.",
                body="The product shows one requirement in one place.",
                facts=(
                    RequirementFact(label="Source path", value="docs/requirements/SWR-6001.md"),
                    RequirementFact(label="Current hash", value="cafe0001"),
                    RequirementFact(label="Delivered hash", value="beef0000"),
                ),
            ),
            _section(
                "relations",
                "Relations",
                "This requirement stands on its own: no epic, no relations.",
                links=(
                    RelationLink(
                        kind="parent",
                        label="Parent epic",
                        req_id="SWR-6000",
                    ),
                    RelationLink(
                        kind="depends-on",
                        label="Depends on",
                        req_id="SWR-9999",
                        resolved=False,
                    ),
                ),
            ),
            _section(
                "execution",
                "Execution",
                "Nothing has run for this requirement yet.",
                lines=("unit-1: Succeeded",),
            ),
            _section(
                "traceability",
                "Traceability",
                "No implementation site and no covering test are recorded.",
                facts=(RequirementFact(label="Implementation sites", value="1"),),
                lines=("src/rotaris/views/requirement_detail.py:1",),
            ),
            _section(
                "verification",
                "Verification",
                "Nothing has verified this requirement yet.",
                facts=(
                    RequirementFact(label="Verdict", value="passed"),
                    RequirementFact(label="Verified commit", value="abc1234"),
                    RequirementFact(label="Delivered by run", value="run-88"),
                ),
            ),
        ),
    )


def _stated() -> RequirementDetail:
    """A requirement whose every axis the projection carried."""
    return RequirementDetail(
        req_id="SWR-6003",
        title="Every axis this requirement has",
        sections=(
            _section(
                "requirement",
                "Requirement",
                "This requirement could not be read from its source.",
                facts=(
                    RequirementFact(label="Id", value="SWR-6003"),
                    RequirementFact(label="Lifecycle", value="Approved"),
                    RequirementFact(label="Delivery state", value="In progress"),
                    RequirementFact(label="Health", value="Needs update"),
                    RequirementFact(label="Current hash", value="cafe0003"),
                ),
            ),
        ),
        lifecycle="approved",
        lifecycle_label="Approved",
        delivery="in-progress",
        delivery_label="In progress",
        health="needs-update",
        health_label="Needs update",
        priority="critical",
        priority_label="Critical",
        epic="SWR-6000",
    )


def _bare() -> RequirementDetail:
    return RequirementDetail(
        req_id="SWR-6002",
        title="Nothing has happened to this one",
        sections=tuple(_section(key, title, empty) for key, title, empty in DETAIL_SECTIONS),
    )


def _strip_names(view: RequirementDetailView) -> list[str]:
    """What the state strip announces, badge by badge."""
    return [
        child.accessibleName()
        for child in view.strip.findChildren(QLabel)
        if child.accessibleName()
    ]


def _texts(view: RequirementDetailView) -> list[str]:
    return [label.text() for label in view.findChildren(QLabel) if label.text().strip()]


@verifies(SWR.SWR_3307)
def test_all_five_sections_render_for_a_populated_requirement(qtbot) -> None:
    """Productive use: a user opens a requirement to see everything about it.
    Expected outcome: the five sections SWR-3307 names are on screen, with their content."""
    view = RequirementDetailView()
    qtbot.addWidget(view)

    view.show_detail(_populated())

    for key, title, _empty in DETAIL_SECTIONS:
        section = view.section_widget(key)
        assert section is not None, f"section {key} was not rendered"
        assert section.accessibleName() == f"{title} section"
    texts = _texts(view)
    assert "The product shows one requirement in one place." in texts
    assert "Source path: docs/requirements/SWR-6001.md" in texts
    assert "Current hash: cafe0001" in texts
    assert "unit-1: Succeeded" in texts
    assert "src/rotaris/views/requirement_detail.py:1" in texts
    assert "Verdict: passed" in texts
    assert view.req_id == "SWR-6001"


@verifies(SWR.SWR_3307)
def test_each_section_degrades_to_its_own_stated_empty_message(qtbot) -> None:
    """Productive use: a requirement nobody has run or verified is opened.
    Expected outcome: every empty section says what belongs there, in its own words."""
    view = RequirementDetailView()
    qtbot.addWidget(view)

    view.show_detail(_bare())

    texts = _texts(view)
    for key, _title, empty in DETAIL_SECTIONS:
        assert view.section_widget(key) is not None
        assert empty in texts, f"section {key} rendered no empty message"
    assert len({empty for _k, _t, empty in DETAIL_SECTIONS}) == 5, "one shared empty message"


@verifies(SWR.SWR_3307)
def test_relations_navigate_and_a_dangling_one_still_names_its_target(qtbot) -> None:
    """Productive use: a user follows a requirement to its epic, and meets a dead link.
    Expected outcome: the live relation navigates; the dangling one is shown, named and explained."""
    view = RequirementDetailView()
    qtbot.addWidget(view)
    view.show_detail(_populated())
    view.show()
    qtbot.waitExposed(view)

    with qtbot.waitSignal(view.relation_activated, timeout=1000) as caught:
        click_by_name(qtbot, view, "Parent epic SWR-6000", QPushButton)
    assert caught.args == ["SWR-6000"]

    dangling = find_by_accessible_name(view, "Depends on SWR-9999 (unresolved)", QPushButton)
    assert dangling.isEnabled() is False
    assert "SWR-9999" in dangling.toolTip()
    assert "not in this requirement store" in dangling.toolTip()


@verifies(SWR.SWR_3307, SWR.SWR_3314)
def test_the_detail_view_is_keyboard_operable_and_closes_with_escape(qtbot) -> None:
    """Productive use: a keyboard user opens a requirement, its evidence, then leaves.
    Expected outcome: evidence and graph are reachable by name and Escape closes the view."""
    view = RequirementDetailView()
    qtbot.addWidget(view)
    view.show_detail(_populated())
    view.show()
    qtbot.waitExposed(view)

    names = accessible_names(view, QPushButton)
    assert "Open evidence for SWR-6001" in names
    assert "Open the graph around SWR-6001" in names
    with qtbot.waitSignal(view.evidence_requested, timeout=1000) as evidence:
        click_by_name(qtbot, view, "Open evidence for SWR-6001", QPushButton)
    assert evidence.args == ["SWR-6001"]
    with qtbot.waitSignal(view.graph_requested, timeout=1000) as graph:
        click_by_name(qtbot, view, "Open the graph around SWR-6001", QPushButton)
    assert graph.args == ["SWR-6001"]
    with qtbot.waitSignal(view.close_requested, timeout=1000):
        qtbot.keyClick(view, Qt.Key.Key_Escape)


# ── the revision history (SWR-3313) ────────────────────────────────────────


def _entry_with(history: RevisionHistory | None, *, req_id: str = "SWR-6100") -> BoardEntry:
    """One projected requirement, carrying exactly the history it was given."""
    requirement = CanonicalRequirement(
        req_id=req_id,
        title="A requirement that moved after it was delivered",
        description="The product keeps its promise.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        relations=(Relation(kind=RelationKind.DEPENDS_ON, target="SWR-9999"),),
    )
    projection: BoardProjection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(requirement,), generation=3),
            histories={req_id: history} if history is not None else {},
            evaluated_at=NOW,
        ),
    )
    entry = projection.entry(req_id)
    assert entry is not None
    return entry


def _history(
    *,
    delivered: tuple[str, ...] = (),
    current_hash: str = "cafe0001",
    available: bool = True,
    reason: str = "",
) -> RevisionHistory:
    """A real assembled history: *delivered* versions oldest first, then the current one."""
    return build_revision_history(
        "SWR-6100",
        current_hash=current_hash,
        recorded=tuple(
            RecordedHash(requirement_hash=item, at=WHEN + dt.timedelta(hours=index))
            for index, item in enumerate(delivered)
        ),
        deliveries=tuple(
            SatisfiedDelivery(
                req_id="SWR-6100",
                satisfied_hash=item,
                run_id=f"run-{index + 1}",
                satisfied_at=WHEN + dt.timedelta(hours=index),
                verified_commit=f"commit{index + 1}",
            )
            for index, item in enumerate(delivered)
        ),
        source_history_available=available,
        unavailable_reason=reason,
        current_at=NOW,
    )


@verifies(SWR.SWR_3313)
def test_every_delivered_version_is_listed_oldest_first_with_the_current_one_marked() -> None:
    """Productive use: a requirement delivered three times is opened.
    Expected outcome: three revisions plus the unbuilt current one, in order, from the engine."""
    detail = build_detail(_entry_with(_history(delivered=("v1", "v2", "v3"))), now=NOW)

    assert [revision.requirement_hash for revision in detail.revisions] == [
        "v1",
        "v2",
        "v3",
        "cafe0001",
    ], "a two-hash reconstruction would show one of the three delivered versions"
    assert [revision.run_id for revision in detail.revisions] == ["run-1", "run-2", "run-3", ""]
    assert [revision.commit for revision in detail.revisions[:3]] == [
        "commit1",
        "commit2",
        "commit3",
    ]
    assert all(revision.delivered for revision in detail.revisions[:3])
    assert [revision.current for revision in detail.revisions] == [False, False, False, True]
    current = detail.revisions[-1]
    assert current.outcome == "Not yet delivered"
    assert "current revision" in current.sentence
    assert detail.history_available is True
    assert detail.history_reason == ""


@verifies(SWR.SWR_3313)
def test_a_delivered_requirement_that_never_changed_has_one_current_revision() -> None:
    """Productive use: a requirement is delivered and nobody has touched it since.
    Expected outcome: one revision, marked current, with no phantom undelivered entry."""
    detail = build_detail(
        _entry_with(_history(delivered=("beef0000",), current_hash="beef0000")),
        now=NOW,
    )

    assert len(detail.revisions) == 1
    assert detail.revisions[0].current is True
    assert detail.revisions[0].delivered is True


@verifies(SWR.SWR_3313)
def test_a_source_without_history_says_so_beside_what_rotaris_did_record(qtbot) -> None:
    """Productive use: a requirement store that is not under version control is opened.
    Expected outcome: the panel states that the source's history is unavailable — and still
    lists the versions Rotaris recorded itself, rather than showing an empty list."""
    reason = "this source keeps no revision history of its own"
    detail = build_detail(
        _entry_with(_history(delivered=("v1",), available=False, reason=reason)),
        now=NOW,
    )
    view = RequirementDetailView()
    qtbot.addWidget(view)

    view.show_detail(detail)

    assert detail.history_available is False
    assert detail.history_reason == reason
    assert view.history.source_history_available is False
    assert view.history.empty_label.text() == reason
    assert view.history.empty_label.isHidden() is False, "the reason is shown, not hidden"
    assert [revision.requirement_hash for revision in view.history.revisions] == ["v1", "cafe0001"]
    assert any("v1" in text for text in _texts(view)), "the recorded version is still listed"


@verifies(SWR.SWR_3313)
def test_a_projection_with_no_history_at_all_states_which_absence_it_is(qtbot) -> None:
    """Productive use: the board's own pass, which does not read the deep views.
    Expected outcome: "not read yet" while a deep read may follow, "unavailable" when none can."""
    entry = _entry_with(None)
    view = RequirementDetailView()
    qtbot.addWidget(view)

    pending = build_detail(entry, now=NOW, history_pending=True)
    view.show_detail(pending)
    assert pending.history_reason == PENDING_HISTORY_REASON
    assert view.history.revisions == ()
    assert view.history.empty_label.text() == PENDING_HISTORY_REASON

    settled = build_detail(entry, now=NOW)
    view.show_detail(settled)
    assert settled.history_reason == NO_HISTORY_REASON
    assert view.history.empty_label.text() == NO_HISTORY_REASON
    assert "unavailable" in NO_HISTORY_REASON


@verifies(SWR.SWR_3313)
def test_an_empty_read_history_is_not_reported_as_an_unreadable_one(qtbot) -> None:
    """The two absences stay two: a read history holding nothing says so in its own words."""
    panel = RevisionHistoryPanel()
    qtbot.addWidget(panel)

    panel.set_revisions((), available=True)

    assert panel.empty_label.text() == NO_REVISIONS_MESSAGE
    assert panel.empty_label.text() != NO_HISTORY_REASON


@verifies(SWR.SWR_3313)
def test_a_run_and_a_commit_are_activatable_from_a_revision(qtbot) -> None:
    """Productive use: a user wants the session that built revision B.
    Expected outcome: the run and the commit are named controls that report the intent."""
    panel = RevisionHistoryPanel()
    qtbot.addWidget(panel)
    panel.set_revisions(
        (
            Revision(
                requirement_hash="beef0000",
                outcome="Delivered",
                run_id="run-88",
                commit="abc1234",
                delivered=True,
            ),
            Revision(requirement_hash="cafe0001", outcome="Not yet delivered", current=True),
        ),
    )
    panel.show()
    qtbot.waitExposed(panel)

    with qtbot.waitSignal(panel.run_activated, timeout=1000) as run:
        click_by_name(qtbot, panel, "Open run run-88", QPushButton)
    assert run.args == ["run-88"]
    with qtbot.waitSignal(panel.commit_activated, timeout=1000) as commit:
        click_by_name(qtbot, panel, "Open commit abc1234", QPushButton)
    assert commit.args == ["abc1234"]
    assert panel.empty_label.isVisible() is False


@pytest.mark.integration
@verifies(SWR.SWR_3313, SWR.SWR_3307)
def test_history_over_a_git_fixture_lists_the_real_commits_that_touched_the_file(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the requirement's own file was edited twice in the repository.
    Expected outcome: the panel lists the real commits, from the engine's git seam — and the
    delivered version among them names the run that built it."""
    repo = _git_repo_with_requirement(tmp_path)
    requirement = CanonicalRequirement(
        req_id="SWR-6100",
        title="A requirement with a real history",
        description="The second version of the text.",
        source_id="reqtocode",
        source_path="docs/requirements/SWR-6100.md",
    )
    commits = _commits(repo, "docs/requirements/SWR-6100.md")
    assert len(commits) == 2, "the fixture really has two commits for this file"

    details = StoredDetails(AuditStore(repo), revisions=GitArtifactRevisions.for_repo(repo))
    record = DeliveryRecord(
        req_id="SWR-6100",
        satisfied=SatisfiedLog(
            entries=(
                SatisfiedDelivery(
                    req_id="SWR-6100",
                    satisfied_hash="the-hash-we-built",
                    run_id="run-42",
                    satisfied_at=WHEN,
                ),
            ),
        ),
    )
    projection: BoardProjection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(requirement,), generation=1),
            histories={"SWR-6100": details.history_for(requirement, record)},
            evaluated_at=NOW,
        ),
    )
    entry = projection.entry("SWR-6100")
    assert entry is not None
    view = RequirementDetailView()
    qtbot.addWidget(view)

    view.show_detail(build_detail(entry, now=NOW))

    listed = view.history.revisions
    assert view.history.source_history_available is True
    shown = {revision.commit for revision in listed}
    assert set(commits) <= shown, f"the real commits are listed: {shown}"
    delivered = [revision for revision in listed if revision.delivered]
    assert [revision.run_id for revision in delivered] == ["run-42"]
    assert [revision.requirement_hash for revision in delivered] == ["the-hash-we-built"]
    assert any(revision.current for revision in listed), "the current version is marked"
    assert any("Not yet delivered" in text for text in _texts(view))


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell, test fixture
        ["git", *args],  # noqa: S607
        cwd=repo,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _git_repo_with_requirement(root: Path) -> Path:
    """A checkout whose requirement file has two commits — a real history."""
    repo = root / "workspace"
    (repo / "docs" / "requirements").mkdir(parents=True)
    _git(repo, "init", "-b", "main")
    _git(repo, "config", "user.name", "Test User")
    _git(repo, "config", "user.email", "test@example.invalid")
    document = repo / "docs" / "requirements" / "SWR-6100.md"
    document.write_text("# SWR-6100 - the first version\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "first version of SWR-6100")
    document.write_text("# SWR-6100 - the second version\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "rewrite SWR-6100")
    return repo


def _commits(repo: Path, location: str) -> tuple[str, ...]:
    return tuple(_git(repo, "log", "--format=%H", "--", location).split())


@verifies(SWR.SWR_3304)
def test_the_state_strip_names_every_axis_it_paints(qtbot) -> None:
    """Productive use: a user opens a requirement and reads its state at a glance.
    Expected outcome: each badge states the axis it answers in words, so a reader
    who gets no colour at all still knows which question it answered."""
    view = RequirementDetailView()
    qtbot.addWidget(view)

    view.show_detail(_stated())

    assert _strip_names(view) == [
        "Lifecycle: Approved",
        "Delivery: In progress",
        "Health: Needs update",
        "Priority: Critical",
        "Epic: SWR-6000",
    ]
    # The epic carries its word on screen too: `SWR-6000` beside a priority is
    # not a fact anybody can read.
    assert "Epic SWR-6000" in _texts(view)


@verifies(SWR.SWR_3307)
def test_the_strip_states_each_axis_once_and_the_section_keeps_it(qtbot) -> None:
    """Productive use: the same user reads down the requirement section.
    Expected outcome: the facts the badges already carry are not printed a second
    time as sentences — but the section that owns them still describes them, so
    nothing is lost to a reader walking the page."""
    view = RequirementDetailView()
    qtbot.addWidget(view)
    detail = _stated()

    view.show_detail(detail)

    texts = _texts(view)
    assert "Lifecycle: Approved" not in texts
    assert "Delivery state: In progress" not in texts
    assert "Current hash: cafe0003" in texts
    # The section widget describes every fact it was given, badged or not.
    section = find_by_accessible_name(view, "Requirement section")
    described = section.accessibleDescription()
    assert "Lifecycle: Approved" in described
    assert "Delivery state: In progress" in described


@verifies(SWR.SWR_3304)
def test_a_requirement_with_no_axes_carries_no_strip(qtbot) -> None:
    """Productive use: a projection that carried none of the axes is opened.
    Expected outcome: the strip is absent rather than a row of empty pills."""
    view = RequirementDetailView()
    qtbot.addWidget(view)

    view.show_detail(_bare())

    assert not view.strip.isVisibleTo(view)
    assert _strip_names(view) == []
