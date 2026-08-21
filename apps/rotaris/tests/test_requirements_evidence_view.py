"""The evidence view the ring opens (SWR-3306).

An indicator that cannot be opened teaches a user to ignore it, so the point of
this view is the path from "this looks wrong" to the file that is wrong. These
tests assert that path exists: every site is activatable and carries its file and
line, what is missing is named rather than left as an empty list, and the
verification block states verdict, commit and requirement hash.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import accessible_names, click_by_name, find_by_accessible_name

from rotaris.models.requirements_state import (
    DetailSection,
    EvidenceSegment,
    RequirementCard,
    RequirementDetail,
    RequirementFact,
)
from rotaris.widgets.evidence_ring import (
    EvidenceView,
    evidence_sites,
    missing_evidence,
    verification_facts,
)

pytestmark = pytest.mark.unit

IMPLEMENTATIONS = ("src/rotaris_core/thing.py:12", "src/rotaris_core/other.py:40")
TESTS = ("tests/unit/test_thing.py:88",)


def _segments(test_state: str = "failed") -> tuple[EvidenceSegment, ...]:
    return (
        EvidenceSegment(
            kind="implementation",
            label="Implementation",
            state="satisfied",
            state_label="Satisfied",
        ),
        EvidenceSegment(
            kind="test",
            label="Test",
            state=test_state,
            state_label=test_state.replace("-", " ").capitalize(),
            detail="covering-test-failed" if test_state == "failed" else "",
        ),
        EvidenceSegment(
            kind="verification",
            label="Verification",
            state="missing",
            state_label="Missing",
        ),
    )


def _card(evidence: tuple[EvidenceSegment, ...] | None = None) -> RequirementCard:
    return RequirementCard(
        req_id="SWR-5001",
        title="Evidence opens from the ring",
        lifecycle="approved",
        lifecycle_label="Approved",
        delivery="done",
        delivery_label="Done",
        health="verification-failed",
        health_label="Verification Failed",
        evidence_state="failed",
        evidence=_segments() if evidence is None else evidence,
    )


def _detail(*, with_sites: bool = True) -> RequirementDetail:
    traceability = DetailSection(
        key="traceability",
        title="Traceability",
        empty_message="No implementation site and no covering test are recorded.",
        facts=(
            RequirementFact(label="Implementation sites", value="2"),
            RequirementFact(label="Test sites", value="1"),
        )
        if with_sites
        else (),
        lines=(*IMPLEMENTATIONS, *TESTS, "tests/unit/test_thing.py moved after the last run")
        if with_sites
        else (),
    )
    return RequirementDetail(
        req_id="SWR-5001",
        title="Evidence opens from the ring",
        sections=(
            DetailSection(
                key="requirement",
                title="Requirement",
                empty_message="unreadable",
                facts=(
                    RequirementFact(label="Current hash", value="c0ffee11"),
                    RequirementFact(label="Delivered hash", value="dec0de22"),
                ),
            ),
            traceability,
            DetailSection(
                key="execution",
                title="Execution",
                empty_message="Nothing has run for this requirement yet.",
                lines=("unit-1: Succeeded", "integration-3: merged 9 files"),
            ),
            DetailSection(
                key="verification",
                title="Verification",
                empty_message="Nothing has verified this requirement yet.",
                facts=(
                    RequirementFact(label="Verdict", value="failed"),
                    RequirementFact(label="Verified commit", value="abc1234"),
                    RequirementFact(label="Delivered by run", value="run-7"),
                ),
            ),
        ),
    )


@verifies(SWR.SWR_3306)
def test_sites_are_split_into_implementations_and_tests_by_the_engines_counts() -> None:
    """Productive use: a user wants the failing test, not the module beside it.
    Expected outcome: each address is attributed to the kind the projection counted it as."""
    sites = evidence_sites(_card(), _detail())

    assert [(site.kind, site.address) for site in sites] == [
        ("implementation", IMPLEMENTATIONS[0]),
        ("implementation", IMPLEMENTATIONS[1]),
        ("test", TESTS[0]),
    ]
    assert [site.line for site in sites] == [12, 40, 88]
    # The state is the engine's per-obligation verdict, carried through.
    assert {site.state for site in sites if site.kind == "test"} == {"failed"}
    assert {site.state for site in sites if site.kind == "implementation"} == {"satisfied"}
    assert sites[-1].sentence == "Covering test tests/unit/test_thing.py:88 — Failed"


@verifies(SWR.SWR_3306)
def test_every_listed_site_reaches_its_file_at_its_line(qtbot) -> None:
    """Productive use: a user clicks a red ring and lands on the failing test.
    Expected outcome: activating a site reports the file and the line, by mouse and by name."""
    view = EvidenceView()
    qtbot.addWidget(view)
    view.set_evidence(_card(), _detail())
    view.show()
    qtbot.waitExposed(view)

    assert len(view.sites) == 3
    with qtbot.waitSignal(view.site_activated, timeout=1000) as caught:
        click_by_name(
            qtbot,
            view,
            "Covering test tests/unit/test_thing.py:88 — Failed",
            QPushButton,
        )
    assert caught.args == ["tests/unit/test_thing.py", 88]

    button = find_by_accessible_name(
        view,
        "Implementation src/rotaris_core/thing.py:12 — Satisfied",
        QPushButton,
    )
    assert "line 12" in button.accessibleDescription()


@verifies(SWR.SWR_3306)
def test_missing_evidence_is_named_rather_than_shown_as_an_empty_list(qtbot) -> None:
    """Productive use: a requirement owes verification it never got.
    Expected outcome: the view names each missing or failing obligation with its reason."""
    card = _card()
    view = EvidenceView()
    qtbot.addWidget(view)
    view.set_evidence(card, _detail())

    assert missing_evidence(card) == (
        "Test: Failed — covering-test-failed",
        "Verification: Missing",
    )
    texts = [label.text() for label in view.findChildren(QLabel)]
    assert "• Test: Failed — covering-test-failed" in texts
    assert "• Verification: Missing" in texts


@verifies(SWR.SWR_3306)
def test_the_verification_block_names_verdict_commit_and_requirement_hash(qtbot) -> None:
    """Productive use: an auditor asks what proved this requirement, and for which version.
    Expected outcome: verdict, commit and both hashes are on screen and copyable."""
    detail = _detail()

    facts = {fact.label: fact.value for fact in verification_facts(detail)}

    assert facts["Verdict"] == "failed"
    assert facts["Verified commit"] == "abc1234"
    assert facts["Requirement hash"] == "c0ffee11"
    assert facts["Delivered hash"] == "dec0de22"

    view = EvidenceView()
    qtbot.addWidget(view)
    view.set_evidence(_card(), detail)
    texts = [label.text() for label in view.findChildren(QLabel)]
    assert "Requirement hash: c0ffee11" in texts
    assert "Verified commit: abc1234" in texts
    # The execution and integration records are listed beside the verdict.
    assert "unit-1: Succeeded" in texts
    assert "integration-3: merged 9 files" in texts
    assert "Open run run-7" in accessible_names(view, QPushButton)


@verifies(SWR.SWR_3306)
def test_a_requirement_with_no_evidence_at_all_states_that(qtbot) -> None:
    """Productive use: a user opens the ring of a requirement nobody has implemented.
    Expected outcome: the view says no site is recorded rather than showing an empty pane."""
    card = _card(
        evidence=(
            EvidenceSegment(
                kind="implementation",
                label="Implementation",
                state="not-applicable",
                state_label="Not applicable",
            ),
        ),
    )
    view = EvidenceView()
    qtbot.addWidget(view)

    view.set_evidence(card, _detail(with_sites=False))

    texts = [label.text() for label in view.findChildren(QLabel)]
    assert view.sites == ()
    assert any("No implementation site and no covering test" in text for text in texts)


@verifies(SWR.SWR_3306, SWR.SWR_3314)
def test_the_evidence_view_closes_with_escape_and_with_a_named_control(qtbot) -> None:
    """Productive use: a keyboard user is done reading the evidence.
    Expected outcome: Escape and the back control both return them to the board."""
    view = EvidenceView()
    qtbot.addWidget(view)
    view.set_evidence(_card(), _detail())
    view.show()
    qtbot.waitExposed(view)

    with qtbot.waitSignal(view.close_requested, timeout=1000):
        qtbot.keyClick(view, Qt.Key.Key_Escape)
    with qtbot.waitSignal(view.close_requested, timeout=1000):
        click_by_name(qtbot, view, "Back to the requirement board", QPushButton)
    assert view.req_id == "SWR-5001"
