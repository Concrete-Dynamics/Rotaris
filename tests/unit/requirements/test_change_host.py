"""Productive use: a person edits a requirement Rotaris already delivered, or writes a new
requirement that replaces an old one, and opens the board.
Expected outcome: the board read that moves the card also asks the configured analyst what
the change costs and what has to happen to the replaced requirement's code — and files both
answers where a reviewer can find them months later. A workspace whose source keeps no
history, or that configures no analyst, moves the card and says nothing, exactly as before.

These are the compositions, not the engines: the engines are unit-tested next door. What is
proved here is that a user gesture reaches them, that they are handed the inputs their
requirements name, and that a failing analyst leaves a stated record rather than a verdict.
The analysts are local, duck-typed classes — no Mock, and nothing reaches a network.

The composition lives in ``rotaris_core.requirements.change_host`` (SWR-3515), so this file
does too. It sat in ``apps/rotaris/tests/`` for as long as the composition sat in the desktop
package — and it never imported a Qt binding even then, which is what said the code it tests
was in the wrong place.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.impact import (
    ImpactAnalyzer,
    ImpactOutcome,
    ImpactRequest,
)
from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore
from rotaris_core.requirements.change.superseding import MigrationAction, MigrationRequest
from rotaris_core.requirements.change_host import (
    Analysts,
    ChangePolicy,
    EvaluationDepth,
    PropagationReport,
    SweptEvidence,
    analyse_removals,
    evaluate_specification_changes,
    evaluate_workspace,
    evidence_of,
    impact_worklist,
    plan_superseding_migrations,
    run_specification_pass,
    workspace_transitions,
)
from rotaris_core.requirements.delivery.projection import NoEvidence
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.registry import CancelToken
from rotaris_core.requirements.tombstones import Tombstone

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
OLD = "SWR-9101"
NEW = "SWR-9102"
AT = dt.datetime(2026, 8, 15, 9, 0, tzinfo=dt.UTC)
SYSTEM = DeliveryActor.system("requirement-flow")
PERSONA = "requirements-engineer"
MODEL = "scripted-analyst-1"

DELIVERED_TEXT = "The user signs in with an email and a password."
EDITED_TEXT = (
    "The user signs in with an email and a password.\n\n"
    "A sixth failed attempt locks the account for fifteen minutes."
)

TRACES = (("src/pkg/login.py", 41),)
TESTS = (("tests/unit/test_login.py", 12),)


# --------------------------------------------------------------------------
# Scripted analysts — the shape the engines accept, three lines each
# --------------------------------------------------------------------------


class ScriptedAnalyst:
    """An impact analyst that answers a fixed payload and keeps what it was asked."""

    def __init__(self, payload: Mapping[str, object]) -> None:
        self._payload = payload
        self.requests: list[ImpactRequest] = []

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        self.requests.append(request)
        return self._payload


class OfflineAnalyst:
    """An analyst that cannot be reached."""

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        del request
        raise ConnectionError("connection reset by peer")


class ScriptedMigrationAnalyst:
    """A migration analyst answering a fixed decision per site key."""

    def __init__(self, answers: Mapping[str, Mapping[str, object]]) -> None:
        self._answers = dict(answers)
        self.requests: list[MigrationRequest] = []

    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        self.requests.append(request)
        return self._answers


# --------------------------------------------------------------------------
# The workspace a board read finds
# --------------------------------------------------------------------------


def requirement(text: str, *, req_id: str = REQ, revision: str) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Log in",
        description=text,
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_revision=revision,
    )


def deliver(workspace: Path, delivered: CanonicalRequirement) -> None:
    """Seed the delivery *delivered* was accepted as — a fixture, never a transition."""
    DeliveryStore(workspace).seed(
        DeliveryRecord(
            req_id=delivered.req_id,
            delivery=DeliveryStatus(
                state=DeliveryState.DONE,
                changed_at=AT,
                changed_by=SYSTEM,
                cause=TransitionCause.COMPLETION_ACCEPTED,
                requirement_hash=delivered.current_hash,
            ),
            satisfied=SatisfiedLog(
                entries=(
                    SatisfiedDelivery(
                        req_id=delivered.req_id,
                        satisfied_hash=delivered.current_hash,
                        run_id="run-17",
                        satisfied_at=AT,
                        verified_commit="c0ffee",
                        source_revision=delivered.source_revision,
                    ),
                ),
            ),
        ),
    )


def evaluate(
    workspace: Path,
    *,
    analyzer: ImpactAnalyzer | None,
    with_history: bool = True,
) -> tuple[str, ...]:
    """One board read over a workspace whose delivered requirement has been edited."""
    delivered = requirement(DELIVERED_TEXT, revision="r1")
    current = requirement(EDITED_TEXT, revision="r2")

    def version_at(req_id: str, revision: str) -> CanonicalRequirement | None:
        return delivered if req_id == REQ and revision == "r1" else None

    return evaluate_specification_changes(
        workspace,
        current_for=lambda req_id: current if req_id == REQ else None,
        evidence_current={REQ: True},
        at=AT,
        version_at=version_at if with_history else None,
        coverage={REQ: (TRACES, TESTS)},
        analyzer=analyzer,
    )


def analyses(workspace: Path, req_id: str = REQ) -> tuple[object, ...]:
    return AnalysisRecordStore(workspace).load(req_id).log.records


# --------------------------------------------------------------------------
# SWR-3503 — the edit that reaches an analyst
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3503, SWR.SWR_3502)
def test_the_board_read_that_moves_the_card_also_asks_what_the_change_costs(
    tmp_path: Path,
) -> None:
    """Productive use: a person adds an acceptance criterion to a delivered requirement.
    Expected outcome: the card moves to Needs Update *and* the read says what the change
    costs, instead of leaving a user to work it out from a diff."""
    deliver(tmp_path, requirement(DELIVERED_TEXT, revision="r1"))
    analyst = ScriptedAnalyst(
        {
            "outcome": "implementation-and-tests-affected",
            "reasoning": "a new acceptance criterion adds behaviour nothing proves yet",
        },
    )

    lines = evaluate(
        tmp_path,
        analyzer=ImpactAnalyzer(
            model=analyst,
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )

    assert any("Needs Update" in line or "needs-update" in line for line in lines), lines
    assert any(str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED) in line for line in lines), (
        lines
    )
    assert len(analyst.requests) == 1, "the analyst is asked once per requirement that moved"


@verifies(SWR.SWR_3503)
def test_the_analysis_receives_the_diff_the_traces_the_tests_and_the_evidence(
    tmp_path: Path,
) -> None:
    """The four inputs SWR-3503 names, assembled from what the board read already had."""
    deliver(tmp_path, requirement(DELIVERED_TEXT, revision="r1"))
    analyst = ScriptedAnalyst({"outcome": "tests-affected", "reasoning": "the criterion moved"})

    evaluate(
        tmp_path,
        analyzer=ImpactAnalyzer(
            model=analyst,
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )

    (asked,) = analyst.requests
    assert any("locks the account" in line for line in asked.diff), asked.diff
    assert asked.traces == ("src/pkg/login.py:41",)
    assert asked.tests == ("tests/unit/test_login.py:12",)
    assert asked.evidence == "present"
    # The delivery it is being compared against, so the record can be reproduced.
    assert asked.delivering_run == "run-17"
    assert asked.verified_commit == "c0ffee"


@verifies(SWR.SWR_3503, SWR.SWR_3514)
def test_the_outcome_is_recorded_where_a_reviewer_can_find_it(tmp_path: Path) -> None:
    deliver(tmp_path, requirement(DELIVERED_TEXT, revision="r1"))

    evaluate(
        tmp_path,
        analyzer=ImpactAnalyzer(
            model=ScriptedAnalyst(
                {"outcome": "no-behavioural-impact", "reasoning": "wording only"},
            ),
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )

    (record,) = analyses(tmp_path)
    assert record.kind is AnalysisKind.IMPACT  # type: ignore[attr-defined]
    assert record.outcome == str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT)  # type: ignore[attr-defined]
    assert record.persona == PERSONA  # type: ignore[attr-defined]
    assert record.model == MODEL  # type: ignore[attr-defined]


@verifies(SWR.SWR_3503, SWR.SWR_3514)
def test_an_analysis_that_could_not_run_is_recorded_as_a_failure_not_as_a_verdict(
    tmp_path: Path,
) -> None:
    """An outage must not close a requirement, and must not vanish either."""
    deliver(tmp_path, requirement(DELIVERED_TEXT, revision="r1"))

    lines = evaluate(
        tmp_path,
        analyzer=ImpactAnalyzer(
            model=OfflineAnalyst(),
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )

    assert any("did not run" in line for line in lines), lines
    (record,) = analyses(tmp_path)
    assert record.outcome == ""  # type: ignore[attr-defined]
    assert "model-error" in record.failure  # type: ignore[attr-defined]


@verifies(SWR.SWR_3503)
def test_a_source_that_keeps_no_history_moves_the_card_and_judges_nothing(
    tmp_path: Path,
) -> None:
    """The delivered *text* lives only in the source (SWR-3114); without it there is no diff."""
    deliver(tmp_path, requirement(DELIVERED_TEXT, revision="r1"))
    analyst = ScriptedAnalyst({"outcome": "tests-affected", "reasoning": "unused"})

    lines = evaluate(
        tmp_path,
        analyzer=ImpactAnalyzer(
            model=analyst,
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
        with_history=False,
    )

    assert lines, "the card still moves"
    assert analyst.requests == []
    assert analyses(tmp_path) == ()


@verifies(SWR.SWR_3503)
def test_a_board_read_that_moves_nothing_asks_nothing(tmp_path: Path) -> None:
    """The analysis is on the path of an *edit*, never on the path of every read."""
    delivered = requirement(DELIVERED_TEXT, revision="r1")
    deliver(tmp_path, delivered)
    analyst = ScriptedAnalyst({"outcome": "tests-affected", "reasoning": "unused"})

    lines = evaluate_specification_changes(
        tmp_path,
        current_for=lambda req_id: delivered if req_id == REQ else None,
        evidence_current={REQ: True},
        at=AT,
        version_at=lambda _req, _rev: delivered,
        coverage={REQ: (TRACES, TESTS)},
        analyzer=ImpactAnalyzer(
            model=analyst,
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )

    assert lines == ()
    assert analyst.requests == []


# --------------------------------------------------------------------------
# SWR-3507 — the supersession that reaches an analyst
# --------------------------------------------------------------------------


def superseding() -> tuple[CanonicalRequirement, ...]:
    """A new requirement that replaces an old one, and the old one."""
    return (
        CanonicalRequirement(
            req_id=NEW,
            title="Sign in with a passkey",
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
            relations=(Relation(kind=RelationKind.SUPERSEDES, target=OLD),),
        ),
        CanonicalRequirement(
            req_id=OLD,
            title="Sign in with a password",
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
        ),
    )


OLD_COVERAGE = {OLD: ((("src/pkg/login.py", 41),), (("tests/unit/test_login.py", 12),))}


@verifies(SWR.SWR_3507)
def test_a_supersession_produces_a_worklist_covering_every_site(tmp_path: Path) -> None:
    """Productive use: a person writes a requirement that replaces an old one.
    Expected outcome: the board read says what happens to the old requirement's code,
    with every trace and every test accounted for."""
    analyst = ScriptedMigrationAnalyst({})

    lines = plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage=OLD_COVERAGE,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )

    (request,) = analyst.requests
    assert request.superseding_id == NEW
    assert request.superseded_ids == (OLD,)
    assert len(request.inventory.sites) == 2, "the trace and the covering test"
    assert lines and NEW in lines[0]
    # Nothing was classified, so nothing is executable — the safe answer.
    assert "decision" in lines[0].casefold(), lines


@verifies(SWR.SWR_3507)
def test_the_analyst_decisions_reach_the_worklist(tmp_path: Path) -> None:
    trace_key = f"trace|{OLD}|src/pkg/login.py:41"
    test_key = f"test|{OLD}|tests/unit/test_login.py:12"
    analyst = ScriptedMigrationAnalyst(
        {
            trace_key: {"action": "re-point", "reasoning": "the code still holds", "target": NEW},
            test_key: {"action": "remove", "reasoning": "the password test is obsolete"},
        },
    )

    plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage=OLD_COVERAGE,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )

    (record,) = analyses(tmp_path, NEW)
    assert record.kind is AnalysisKind.MIGRATION  # type: ignore[attr-defined]
    assert record.outcome == "migration-planned"  # type: ignore[attr-defined]
    considered = " ".join(record.considered)  # type: ignore[attr-defined]
    assert MigrationAction.RE_POINT.label in considered
    assert MigrationAction.REMOVE.label in considered
    assert NEW in considered, "a re-pointed site names where it moves"
    assert "the password test is obsolete" in considered, "and every row keeps its reasoning"


@verifies(SWR.SWR_3507, SWR.SWR_3514)
def test_the_same_sites_are_never_planned_twice(tmp_path: Path) -> None:
    """A worklist on every board read would cost a model call for an unchanged answer."""
    analyst = ScriptedMigrationAnalyst({})

    first = plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage=OLD_COVERAGE,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )
    second = plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage=OLD_COVERAGE,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )

    assert first and second == ()
    assert len(analyst.requests) == 1
    assert len(analyses(tmp_path, NEW)) == 1


@verifies(SWR.SWR_3507)
def test_a_site_that_moved_is_planned_again(tmp_path: Path) -> None:
    """The old worklist stopped being true the moment the sites did."""
    analyst = ScriptedMigrationAnalyst({})
    moved = {OLD: ((("src/pkg/login.py", 58),), (("tests/unit/test_login.py", 12),))}

    plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage=OLD_COVERAGE,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )
    again = plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage=moved,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )

    assert again
    assert len(analyst.requests) == 2


@verifies(SWR.SWR_3507)
def test_a_requirement_nothing_claims_costs_no_analysis(tmp_path: Path) -> None:
    analyst = ScriptedMigrationAnalyst({})

    lines = plan_superseding_migrations(
        tmp_path,
        superseding(),
        coverage={},
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )

    assert lines == ()
    assert analyst.requests == []


@verifies(SWR.SWR_3106)
def test_an_unrecognised_layout_is_offered_a_mapping_instead_of_a_blank_page(
    tmp_path: Path,
) -> None:
    """Productive use: a person opens a project whose requirement layout Rotaris does not
    know. Expected outcome: instead of "configure it yourself" they are shown what was
    found and the exact configuration that would read it — and nothing is written."""
    from rotaris.services.requirements_bridge import (
        RequirementsUnavailableError,
        WorkspaceBoard,
    )

    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "login.md").write_text(
        "---\nid: REQ-1\nstatus: draft\n---\n\n# Log in\n\nThe user logs in.\n",
        encoding="utf-8",
    )

    with pytest.raises(RequirementsUnavailableError) as refused:
        WorkspaceBoard(tmp_path).project()

    message = str(refused.value)
    assert "specs/**/*.md" in message, message
    assert "frontmatter.id" in message, "the mapping it would write is in the message"
    assert "Validated: 1 requirement" in message, "and it was proved by loading it"
    assert "Nothing has been written" in message
    # A proposal is data a user accepts, so no configuration reached the workspace.
    assert not (tmp_path / ".rotaris").exists()


@verifies(SWR.SWR_3106)
def test_a_project_with_no_specifications_is_simply_told_so(tmp_path: Path) -> None:
    from rotaris.services.requirements_bridge import (
        NO_SOURCE_REASON,
        RequirementsUnavailableError,
        WorkspaceBoard,
    )

    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("print('hello')\n", encoding="utf-8")

    with pytest.raises(RequirementsUnavailableError) as refused:
        WorkspaceBoard(tmp_path).project()

    assert NO_SOURCE_REASON in str(refused.value)


@verifies(SWR.SWR_3312, SWR.SWR_3503)
def test_opening_a_review_never_reads_the_whole_board() -> None:
    """Productive use: a person opens a card's review while a pulled branch has edited
    three delivered requirements.
    Expected outcome: the pane answers from that one requirement's projection. The
    whole-board read is what runs the evaluation pass, and since W2 that pass asks a
    model what a change costs — up to 90 s per requirement, on the Qt thread the pane
    is opened from, with no progress and no cancel."""
    from rotaris.views.requirement_review import ProjectionReviews

    class _Projection:
        def entry(self, req_id: str) -> None:
            del req_id
            return None

    class _Source:
        """The board's two reads, one of which evaluates."""

        def __init__(self) -> None:
            self.deep: list[str] = []

        def project(self) -> _Projection:  # pragma: no cover - the assertion is that it is not
            raise AssertionError(
                "opening a review must not read the whole board: that read evaluates,"
                " and evaluation calls a model (SWR-3312, SWR-3503)",
            )

        def project_detail(self, req_id: str) -> _Projection:
            self.deep.append(req_id)
            return _Projection()

    source = _Source()

    assert ProjectionReviews(source.project_detail).review_for(REQ) is None
    assert source.deep == [REQ], "the review read exactly its own requirement"


@verifies(SWR.SWR_3507)
def test_a_store_without_supersessions_costs_nothing(tmp_path: Path) -> None:
    analyst = ScriptedMigrationAnalyst({})

    lines = plan_superseding_migrations(
        tmp_path,
        (requirement(DELIVERED_TEXT, revision="r1"),),
        coverage=OLD_COVERAGE,
        at=AT,
        analyst=analyst,
        persona=PERSONA,
        model=MODEL,
    )

    assert lines == ()
    assert analyst.requests == []


# --------------------------------------------------------------------------
# SWR-3515 — one pass, one writer, and nothing written when nothing changed
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3515, SWR.SWR_3403, SWR.SWR_3215)
def test_the_pass_writes_through_the_guarded_gated_door_and_no_other(tmp_path: Path) -> None:
    """Productive use: any rule in this epic asks for a delivery state to change.
    Expected outcome: it goes through the one writer the pass built — the one carrying the
    specification guard and the completion gate — so no rule can be the one that forgot."""
    door = workspace_transitions(tmp_path, current_for=lambda _req_id: None)

    # SWR-3403's half, checked the way `RequirementFlow` checks it: a writer
    # without this cannot refuse a Done for a requirement edited mid-run.
    assert door.enforces_specification_guard
    # SWR-3215's half: a Review → Done with no gate would be granted by default,
    # which is the same failure from the other side.
    assert door.enforces_completion_gate


@verifies(SWR.SWR_3515)
def test_an_evaluation_of_a_workspace_nobody_changed_writes_nothing(tmp_path: Path) -> None:
    """Productive use: a person opens the Requirements area, twice, having edited nothing.
    Expected outcome: the pass says nothing and leaves no file behind — which is what makes
    it safe to run on every evaluation instead of only when somebody remembers."""
    current = requirement(DELIVERED_TEXT, revision="r1")

    report = evaluate_workspace(
        tmp_path,
        requirements=(current,),
        current_for=lambda req_id: current if req_id == REQ else None,
        swept=SweptEvidence(
            health={REQ: True},
            coverage={REQ: (TRACES, TESTS)},
            staleness={},
        ),
        at=AT,
    )

    assert report.quiet
    assert report.lines == ()
    # Not "an empty .rotaris directory": nothing at all. A pass that creates the
    # store to find it empty has already written to a project that asked for
    # nothing (SWR-3201).
    assert not (tmp_path / ".rotaris").exists()


@verifies(SWR.SWR_3515, SWR.SWR_3502, SWR.SWR_3507)
def test_the_report_keeps_each_rules_answer_apart(tmp_path: Path) -> None:
    """Productive use: one board read finds an edited requirement *and* a supersession.
    Expected outcome: the report says which sentence came from which rule, because a
    surface shows a moved card and a planned worklist in different places."""
    delivered = requirement(DELIVERED_TEXT, revision="r1")
    current = requirement(EDITED_TEXT, revision="r2")
    replacing = CanonicalRequirement(
        req_id=NEW,
        title="Log in, revised",
        description="The user signs in with a passkey.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        relations=(Relation(kind=RelationKind.SUPERSEDES, target=OLD),),
    )
    deliver(tmp_path, delivered)

    report = evaluate_workspace(
        tmp_path,
        requirements=(current, replacing),
        current_for=lambda req_id: current if req_id == REQ else None,
        swept=SweptEvidence(
            health={REQ: True},
            coverage={REQ: (TRACES, TESTS), OLD: OLD_COVERAGE[OLD]},
            staleness={},
        ),
        version_at=lambda req_id, revision: (
            delivered if req_id == REQ and revision == "r1" else None
        ),
        at=AT,
        analysts=Analysts(
            impact=ImpactAnalyzer(
                model=ScriptedAnalyst(
                    {"outcome": "tests-affected", "reasoning": "the criterion moved"},
                ),
                persona=PERSONA,
                model_name=MODEL,
                clock=lambda: AT,
            ),
            migration=ScriptedMigrationAnalyst(
                {
                    "src/pkg/login.py:41": {
                        "action": "re-point",
                        "reasoning": "the behaviour survives under the new id",
                    },
                    "tests/unit/test_login.py:12": {
                        "action": "adapt",
                        "reasoning": "the test asserts the old wording",
                    },
                },
            ),
            persona=PERSONA,
            model=MODEL,
        ),
    )

    assert len(report.moved) == 1, report.moved
    assert REQ in report.moved[0]
    assert len(report.analysed) == 1, report.analysed
    assert str(ImpactOutcome.TESTS_AFFECTED) in report.analysed[0]
    assert len(report.migrations) == 1, report.migrations
    assert OLD in report.migrations[0]
    # Each rule's sentence is retrievable on its own; `lines` is the flat reading
    # a text surface wants, and it is a concatenation rather than a re-derivation.
    assert report.lines == report.moved + report.analysed + report.migrations


# --------------------------------------------------------------------------
# SWR-3519 — how deep a pass goes, when it stops, and what it owes afterwards
# --------------------------------------------------------------------------


def counting_analyst(counter: list[str]) -> ImpactAnalyzer:
    """An impact analyst that answers, and records that it was asked."""

    class Counting(ScriptedAnalyst):
        def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
            counter.append(request.after.req_id)
            return super().analyse(request)

    return ImpactAnalyzer(
        model=Counting({"outcome": "tests-affected", "reasoning": "the criterion moved"}),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )


def edited_workspace(workspace: Path, *req_ids: str) -> tuple[CanonicalRequirement, ...]:
    """A workspace whose delivered requirements have each since been edited."""
    ids = req_ids or (REQ,)
    for req_id in ids:
        deliver(workspace, requirement(DELIVERED_TEXT, req_id=req_id, revision="r1"))
    return tuple(requirement(EDITED_TEXT, req_id=req_id, revision="r2") for req_id in ids)


def a_pass(
    workspace: Path,
    current: tuple[CanonicalRequirement, ...],
    *,
    analyzer: ImpactAnalyzer | None = None,
    depth: EvaluationDepth = EvaluationDepth.FULL,
    policy: ChangePolicy | None = None,
    cancel: CancelToken | None = None,
) -> PropagationReport:
    """One evaluation over *workspace*, at the depth the caller names."""
    by_id = {item.req_id: item for item in current}
    delivered = {
        req_id: requirement(DELIVERED_TEXT, req_id=req_id, revision="r1") for req_id in by_id
    }
    return evaluate_workspace(
        workspace,
        requirements=tuple(current),
        current_for=by_id.get,
        swept=SweptEvidence(
            health=dict.fromkeys(by_id, True),
            coverage=dict.fromkeys(by_id, (TRACES, TESTS)),
            staleness={},
        ),
        version_at=lambda req_id, revision: delivered.get(req_id) if revision == "r1" else None,
        at=AT,
        analysts=Analysts(impact=analyzer),
        policy=policy,
        depth=depth,
        cancel=cancel,
    )


@verifies(SWR.SWR_3519)
def test_a_rules_only_pass_moves_the_card_and_reaches_no_analyst(tmp_path: Path) -> None:
    """Productive use: a background commit refreshes a board while somebody is reading it.
    Expected outcome: the rules still move the card — that is what SWR-3502 owes — and
    nothing waits on a provider, because that pass never asked for a judgement."""
    current = edited_workspace(tmp_path)
    asked: list[str] = []

    report = a_pass(
        tmp_path,
        current,
        analyzer=counting_analyst(asked),
        depth=EvaluationDepth.RULES_ONLY,
    )

    assert asked == [], "a rules-only pass reaches no analyst"
    assert report.moved, "the deterministic rules still ran"
    assert report.analysed == ()
    assert report.unanalysed == (REQ,), "and it says what it did not judge"
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.NEEDS_UPDATE


@verifies(SWR.SWR_3519)
def test_a_full_pass_is_what_it_was_before_the_depth_existed(tmp_path: Path) -> None:
    """The other half of the claim: the default depth changes nothing for a caller."""
    current = edited_workspace(tmp_path)
    asked: list[str] = []

    report = a_pass(tmp_path, current, analyzer=counting_analyst(asked))

    assert asked == [REQ]
    assert report.analysed and report.unanalysed == ()
    assert report.cancelled is False


@verifies(SWR.SWR_3519, SWR.SWR_3503)
def test_a_requirement_no_pass_analysed_is_picked_up_by_the_next_full_one(
    tmp_path: Path,
) -> None:
    """Productive use: the card moved during a refresh that was not allowed to think, and
    a full evaluation comes along minutes later.
    Expected outcome: the analysis happens then. Step 1 moves nothing that time — the card
    is already in Needs Update — so a pass that analysed only what it had just moved would
    leave this requirement judged by nobody, carrying no offer, looking like nothing to do."""
    current = edited_workspace(tmp_path)
    a_pass(tmp_path, current, analyzer=counting_analyst([]), depth=EvaluationDepth.RULES_ONLY)
    assert analyses(tmp_path) == (), "nothing was judged yet"

    asked: list[str] = []
    report = a_pass(tmp_path, current, analyzer=counting_analyst(asked))

    assert report.moved == (), "the second pass moves nothing: the card is already there"
    assert asked == [REQ], "and analyses it anyway, because nobody had"
    assert report.analysed and report.unanalysed == ()


@verifies(SWR.SWR_3519, SWR.SWR_3514)
def test_a_version_already_judged_is_never_judged_twice(tmp_path: Path) -> None:
    """Records append (SWR-3514), so a pass that re-analysed what it had already analysed
    would cost a model call per card on every refresh and grow the log without bound."""
    current = edited_workspace(tmp_path)
    asked: list[str] = []

    a_pass(tmp_path, current, analyzer=counting_analyst(asked))
    second = a_pass(tmp_path, current, analyzer=counting_analyst(asked))

    assert asked == [REQ], "asked once across two passes over an unchanged workspace"
    assert len(analyses(tmp_path)) == 1
    assert second.analysed == () and second.unanalysed == ()


@verifies(SWR.SWR_3519, SWR.SWR_3503)
def test_analysis_switched_off_and_later_on_judges_what_it_skipped(tmp_path: Path) -> None:
    """The same hole, reachable with no depth at all: a workspace that ran with
    ``analyze_changes`` off, or whose persona did not resolve, and later did not."""
    current = edited_workspace(tmp_path)
    asked: list[str] = []

    off = a_pass(
        tmp_path,
        current,
        analyzer=counting_analyst(asked),
        policy=ChangePolicy(analyze_changes=False),
    )
    assert asked == [] and off.unanalysed == (REQ,)

    a_pass(tmp_path, current, analyzer=counting_analyst(asked))

    assert asked == [REQ], "the switch decided that pass, not the requirement's fate"


@verifies(SWR.SWR_3519)
def test_a_policy_switch_still_decides_at_every_depth(tmp_path: Path) -> None:
    """Depth subtracts; it never adds. A rule the workspace disabled stays disabled."""
    current = edited_workspace(tmp_path)
    asked: list[str] = []
    off = ChangePolicy(analyze_changes=False)

    for depth in (EvaluationDepth.RULES_ONLY, EvaluationDepth.FULL):
        a_pass(tmp_path, current, analyzer=counting_analyst(asked), depth=depth, policy=off)

    assert asked == []


@verifies(SWR.SWR_3519)
def test_a_cancelled_pass_stops_at_the_next_requirement_and_keeps_what_it_applied(
    tmp_path: Path,
) -> None:
    """Productive use: a user cancels an evaluation that has been thinking for a while.
    Expected outcome: it stops at the next requirement rather than mid-judgement, the
    transitions it already made stand, and it names what is left for the next pass."""
    second = "SWR-9002"
    current = edited_workspace(tmp_path, REQ, second)
    token = CancelToken()
    asked: list[str] = []

    class StopsAfterOne(ScriptedAnalyst):
        def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
            asked.append(request.after.req_id)
            token.cancel()
            return super().analyse(request)

    analyzer = ImpactAnalyzer(
        model=StopsAfterOne({"outcome": "tests-affected", "reasoning": "the criterion moved"}),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )

    report = a_pass(tmp_path, current, analyzer=analyzer, cancel=token)

    assert len(asked) == 1, f"stopped after one analysis, not part-way through it: {asked}"
    assert report.cancelled is True
    assert set(report.unanalysed) == {REQ, second} - set(asked), "the remainder is named"
    # The deterministic rules are not a cancellation point: both cards moved
    # before any analysis ran, and a cancel never takes that back.
    store = DeliveryStore(tmp_path)
    assert store.read(REQ).state is DeliveryState.NEEDS_UPDATE
    assert store.read(second).state is DeliveryState.NEEDS_UPDATE


@verifies(SWR.SWR_3519, SWR.SWR_3515)
def test_the_headless_evaluation_still_takes_the_whole_pass() -> None:
    """SWR-3515's second consumer must not quietly become the cheap one.

    A depth exists so a *board* can choose what a refresh costs. The CLI, a CI
    job and a scheduler are the callers that should never have to, and they get
    the whole pass by saying nothing — so both halves of that are asserted: the
    default is full, and the headless entry point does not pass a depth at all.
    """
    import ast
    import inspect
    import pathlib

    from rotaris_core.requirements.execution import cli_host

    assert (
        inspect.signature(evaluate_workspace).parameters["depth"].default is EvaluationDepth.FULL
    ), "a caller that says nothing runs every rule"

    source = pathlib.Path(cli_host.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    depths = [
        keyword.arg
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "evaluate_workspace"
        for keyword in node.keywords
        if keyword.arg == "depth"
    ]
    assert depths == [], "the headless evaluation names no depth, so it takes the default"


@verifies(SWR.SWR_3519, SWR.SWR_3117)
def test_a_pass_says_whether_this_workspace_wants_an_analysis_at_all(tmp_path: Path) -> None:
    """Productive use: a surface holding a worklist has to decide whether to offer
    "analyse these" or to explain why it cannot.
    Expected outcome: the pass answers from the workspace's own switch, at either depth,
    so the offer is never a button that would do nothing however many times it is
    pressed — and never withheld from a workspace that simply had an analysis fail."""
    current = edited_workspace(tmp_path)

    off = a_pass(
        tmp_path,
        current,
        analyzer=counting_analyst([]),
        depth=EvaluationDepth.RULES_ONLY,
        policy=ChangePolicy(analyze_changes=False),
    )
    assert off.unanalysed == (REQ,) and off.analysis_enabled is False, (
        "work is owed and no pass will ever pay it — both halves, or the caller cannot tell"
    )

    on = a_pass(
        tmp_path,
        current,
        analyzer=counting_analyst([]),
        depth=EvaluationDepth.RULES_ONLY,
    )
    assert on.unanalysed == (REQ,) and on.analysis_enabled is True, (
        "the same worklist, and this one a full pass would clear"
    )


@verifies(SWR.SWR_3519, SWR.SWR_3503)
def test_an_analysis_that_failed_is_not_reported_as_a_workspace_that_wanted_none(
    tmp_path: Path,
) -> None:
    """The confusion the flag exists to prevent, asked directly.

    A provider that raised leaves exactly the shape a disabled workspace leaves —
    the card in ``Needs Update``, no record, the requirement still owed. Inferring
    the switch from that shape would tell a user their configuration is off when
    their provider is down, so the flag is read from the policy and nothing else.
    """
    current = edited_workspace(tmp_path)
    reached: list[str] = []

    class Raises(ScriptedAnalyst):
        def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
            reached.append(request.after.req_id)
            raise RuntimeError("the provider is unreachable")

    report = a_pass(
        tmp_path,
        current,
        analyzer=ImpactAnalyzer(
            model=Raises({}),
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )

    assert reached == [REQ], "the pass did try — otherwise this proves nothing"
    assert report.unanalysed == (REQ,), "and the analysis still did not happen"
    assert report.analysis_enabled is True, "but this workspace asked for one"


@verifies(SWR.SWR_3519)
def test_the_worklist_is_what_the_workspace_owes_not_what_a_pass_just_did(
    tmp_path: Path,
) -> None:
    """The seam the whole guarantee rests on, asked directly."""
    current = edited_workspace(tmp_path)
    a_pass(tmp_path, current, analyzer=counting_analyst([]), depth=EvaluationDepth.RULES_ONLY)

    outcomes = run_specification_pass(
        tmp_path,
        current_for={item.req_id: item for item in current}.get,
        evidence_current={REQ: True},
        at=AT,
    )

    assert impact_worklist(tmp_path, outcomes) == (REQ,), "owed, though this pass moved nothing"


# --------------------------------------------------------------------------
# SWR-3511, SWR-3510 — what the relations block, by name
# --------------------------------------------------------------------------


def related(req_id: str, *relations: Relation) -> CanonicalRequirement:
    """One requirement carrying exactly the relations a rule is about."""
    return CanonicalRequirement(
        req_id=req_id,
        title=f"Requirement {req_id}",
        description="Something a person wanted.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        relations=relations,
    )


def contradicting(left: str, right: str) -> tuple[CanonicalRequirement, ...]:
    """Two requirements that declare they contradict each other."""
    return tuple(
        related(req_id, Relation(kind=RelationKind.CONFLICTS_WITH, target=other))
        for req_id, other in ((left, right), (right, left))
    )


@verifies(SWR.SWR_3511)
def test_a_contradiction_blocks_both_sides_and_names_both_ids() -> None:
    """Productive use: a person writes a requirement that contradicts one already there.
    Expected outcome: both cards stop, each naming the other and the contradiction —
    because blocking only the newer one implements a decision nobody made."""
    from rotaris_core.requirements.change_host import relation_blockers

    blockers = relation_blockers(contradicting("SWR-9001", "SWR-9002"))

    left = blockers.for_requirement("SWR-9001")
    right = blockers.for_requirement("SWR-9002")
    assert len(left) == 1, left
    assert len(right) == 1, right
    assert left[0].blocking_ids == ("SWR-9002",)
    assert right[0].blocking_ids == ("SWR-9001",)
    # The contradiction, not the word "conflict": a user needs to know what
    # cannot both hold (SWR-3511's second criterion).
    assert "SWR-9001" in left[0].reason and "SWR-9002" in left[0].reason
    # And each option says what choosing it will cause.
    assert left[0].options, "a blocker with no answer path is what SWR-3607 abolishes"
    assert all(option.consequence for option in left[0].options)


@verifies(SWR.SWR_3511)
def test_resolving_the_contradiction_in_the_source_clears_both() -> None:
    """SWR-3511's fourth criterion, free by construction: the blocks are *derived*, so a
    conflict edge deleted from the source is simply absent from the next evaluation.
    There is nothing to clear and nothing that can be left behind."""
    from rotaris_core.requirements.change_host import relation_blockers

    resolved = relation_blockers((related("SWR-9001"), related("SWR-9002")))

    assert resolved.for_requirement("SWR-9001") == ()
    assert resolved.for_requirement("SWR-9002") == ()
    assert resolved.contradicting("SWR-9001") == ()


@verifies(SWR.SWR_3511)
def test_neither_side_of_a_contradiction_is_scheduled() -> None:
    """No unit runs for either while the contradiction stands, and the hold says why —
    not "waits for SWR-x", which would send its owner to a card that never unblocks it."""
    from rotaris_core.requirements.change_host import relation_blockers
    from rotaris_core.requirements.execution.scheduler import (
        HoldReason,
        ScheduledRequirement,
        UnitCandidate,
        schedule,
    )

    blockers = relation_blockers(contradicting("SWR-9001", "SWR-9002"))
    decision = schedule(
        [
            ScheduledRequirement(
                req_id=req_id,
                state=DeliveryState.READY,
                contradicts=blockers.contradicting(req_id),
                units=(UnitCandidate(req_id=req_id, unit_id=f"{req_id}-impl"),),
            )
            for req_id in ("SWR-9001", "SWR-9002")
        ],
    )

    assert decision.selected == ()
    assert {hold.reason for hold in decision.held} == {HoldReason.CONTRADICTION}
    assert all("product decision" in hold.detail for hold in decision.held)


@verifies(SWR.SWR_3510)
def test_a_dependency_cycle_blocks_every_member_with_the_cycle_named() -> None:
    """SWR-3510's fourth criterion. The scheduler already holds each of them — a cycle
    looks like an unmet dependency from the inside — but "waits for SWR-x" and "waits
    forever" are the same sentence there, and only one is something a user can act on."""
    from rotaris_core.requirements.change_host import relation_blockers
    from rotaris_core.requirements.delivery.projection import BlockerKind

    ring = tuple(
        related(req_id, Relation(kind=RelationKind.DEPENDS_ON, target=nxt))
        for req_id, nxt in (
            ("SWR-9001", "SWR-9002"),
            ("SWR-9002", "SWR-9003"),
            ("SWR-9003", "SWR-9001"),
        )
    )

    blockers = relation_blockers(ring)

    for req_id in ("SWR-9001", "SWR-9002", "SWR-9003"):
        found = blockers.for_requirement(req_id)
        assert len(found) == 1, (req_id, found)
        assert found[0].kind is BlockerKind.DEPENDENCY
        assert "dependency cycle" in found[0].reason
        # The whole ring, so a user can see where to cut it.
        assert all(member in found[0].reason for member in ("SWR-9001", "SWR-9002", "SWR-9003"))


@verifies(SWR.SWR_3511, SWR.SWR_3510)
def test_a_requirement_set_with_no_contradiction_and_no_cycle_blocks_nothing() -> None:
    """The overwhelmingly common case costs one pass over the relations and answers
    nothing — which is what makes it safe on every evaluation."""
    from rotaris_core.requirements.change_host import relation_blockers

    blockers = relation_blockers((related("SWR-9001"),))

    assert blockers.blockers == {}
    assert blockers.contradictions == {}


# -- what a removal leaves behind (SWR-3509) -------------------------------


def _tombstone(req_id: str = "SWR-501") -> Tombstone:
    return Tombstone(
        req_id=req_id,
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
        last_hash="h1",
        removed_at=AT,
    )


def _survivors(gone: str = "SWR-501") -> tuple[CanonicalRequirement, ...]:
    """Two requirements still pointing at an id that no longer resolves."""
    return (
        CanonicalRequirement(
            req_id="SWR-502",
            title="A payment can be refunded",
            source_id="specs",
            source_path="docs/requirements/SWR-502.md",
            relations=(Relation(kind=RelationKind.DEPENDS_ON, target=gone),),
        ),
        CanonicalRequirement(
            req_id="SWR-503",
            title="The receipt is rendered as PDF",
            source_id="specs",
            source_path="docs/requirements/SWR-503.md",
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target=gone),),
        ),
    )


@verifies(SWR.SWR_3509, SWR.SWR_3113)
def test_a_removal_names_its_traces_tests_and_dangling_dependants(tmp_path: Path) -> None:
    """Productive use: a user deletes a requirement and wants to know what it left behind.
    Expected outcome: the pass names its code, its tests and everything still pointing at it —
    on the same board read the rest of the propagation rules run on."""
    lines = analyse_removals(
        tmp_path,
        tombstones=(_tombstone(),),
        requirements=_survivors(),
        coverage={"SWR-501": (TRACES, TESTS)},
        at=AT,
    )

    report = "\n".join(lines)
    assert "SWR-501" in report
    for path, _line in (*TRACES, *TESTS):
        assert path in report, f"{path} is unaccounted for and must be named"
    assert "SWR-502" in report
    assert "SWR-503" in report
    assert "dangling" in report


@verifies(SWR.SWR_3509, SWR.SWR_3117)
def test_the_dangling_report_can_be_switched_off_and_then_decides_nothing(
    tmp_path: Path,
) -> None:
    """Productive use: a project that does not want removal reports turns them off.
    Expected outcome: the setting changes what the pass says. It was declared from slice 1 and
    read by nothing, so a user could set it and the product behaved identically."""
    from rotaris_core.requirements.change_host import ChangePolicy

    on = evaluate_workspace(
        tmp_path,
        requirements=_survivors(),
        current_for=lambda req_id: next(
            (one for one in _survivors() if one.req_id == req_id),
            None,
        ),
        swept=evidence_of(_survivors(), NoEvidence()),
        tombstones=(_tombstone(),),
        at=AT,
        policy=ChangePolicy(report_dangling_dependents=True),
    )

    assert on.removals, "the switch on means the removal is reported"
    assert any("SWR-501" in line for line in on.lines)

    off = evaluate_workspace(
        tmp_path / "quiet",
        requirements=_survivors(),
        current_for=lambda req_id: next(
            (one for one in _survivors() if one.req_id == req_id),
            None,
        ),
        swept=evidence_of(_survivors(), NoEvidence()),
        tombstones=(_tombstone(),),
        at=AT,
        policy=ChangePolicy(report_dangling_dependents=False),
    )

    assert off.removals == ()


@verifies(SWR.SWR_3509, SWR.SWR_3514)
def test_a_removal_is_analysed_once_however_often_the_board_is_read(tmp_path: Path) -> None:
    """Productive use: a user leaves the board open after deleting a requirement.
    Expected outcome: one analysis, one record — not one per refresh, which is a file per
    look and a report that repeats itself forever."""
    first = analyse_removals(
        tmp_path,
        tombstones=(_tombstone(),),
        requirements=_survivors(),
        coverage={"SWR-501": (TRACES, TESTS)},
        at=AT,
    )
    second = analyse_removals(
        tmp_path,
        tombstones=(_tombstone(),),
        requirements=_survivors(),
        coverage={"SWR-501": (TRACES, TESTS)},
        at=AT,
    )

    assert first
    assert second == (), "the second read finds the record already filed and asks nothing"
