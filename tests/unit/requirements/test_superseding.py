"""Productive use: a product owner replaces an old requirement with a new one, and the old
requirement's implementation and tests have to become something — obsolete, adapted,
moved, or re-pointed at the replacement.
Expected outcome: the worklist names every trace and every test of the replaced
requirements exactly once with an assigned action; anything the analysis cannot classify
is listed as needing a decision instead of defaulting to keep or remove; no code can be
touched before a named human approved the exact list; and after the execution nothing
points at a requirement the migration retired. The replaced requirement is then
deprecated — once, only after the migration ran — and never deleted.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.decisions import DecisionError
from rotaris_core.requirements.change.superseding import (
    ApprovedMigration,
    MigrationAction,
    MigrationApproval,
    MigrationApprovalError,
    MigrationEntry,
    MigrationExecutor,
    MigrationInventory,
    MigrationPlan,
    MigrationRequest,
    MigrationSite,
    MigrationWorklist,
    SiteKind,
    SupersedingCompletion,
    TraceEdit,
    TraceOperation,
    approve_migration,
    dangling_traces,
    plan_migration,
    read_action,
    superseded_standing,
)
from rotaris_core.requirements.delivery.state import ActorKind, DeliveryActor
from rotaris_core.requirements.model import (
    FULL_CAPABILITIES,
    READ_ONLY,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
    SourceCapabilities,
    SourceCapability,
)
from rotaris_core.requirements.relations import build_relation_graph
from rotaris_core.requirements.sources.base import RequirementEdit, WriteRefusal
from rotaris_core.requirements.writeback import WriteBackOutcome

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

pytestmark = pytest.mark.unit

OLD = "SWR-501"
OTHER_OLD = "SWR-502"
NEW = "SWR-601"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(hours=2)

#: The person who signs off a migration. A user actor, because the approval type
#: refuses anything else — see the SWR-3512 tests below.
ADA = DeliveryActor.user("ada")
#: The analysis that proposed the migration. It may never approve its own list.
ANALYST = DeliveryActor.system("superseding-migration")
PERSONA = "migration-analyst"
MODEL = "scripted-analyst-1"


@dataclass(frozen=True)
class Site:
    """One coverage occurrence, shaped exactly like ReqToCode's ``CoverageSite``."""

    path: str
    line: int
    kind: str


@dataclass(frozen=True)
class Coverage:
    """Everything that claims one requirement, as a coverage query answers it."""

    implementations: tuple[Site, ...] = ()
    tests: tuple[Site, ...] = ()


COVERAGE: dict[str, Coverage] = {
    OLD: Coverage(
        implementations=(
            Site("src/pkg/basket.py", 41, "traces"),
            Site("src/pkg/receipt.py", 12, "traces"),
        ),
        tests=(Site("tests/unit/test_basket.py", 20, "verifies"),),
    ),
    OTHER_OLD: Coverage(
        implementations=(Site("src/pkg/refund.py", 9, "traces"),),
        tests=(
            Site("tests/unit/test_refund.py", 15, "verifies"),
            Site("tests/unit/test_refund.py", 30, "@req"),
        ),
    ),
}


class ScriptedAnalyst:
    """A migration analyst answering a fixed payload per site key."""

    def __init__(self, answers: Mapping[str, Mapping[str, object]]) -> None:
        self._answers = dict(answers)
        self.requests: list[MigrationRequest] = []

    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        self.requests.append(request)
        return self._answers


class OfflineAnalyst:
    """An analyst that cannot be reached."""

    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        raise RuntimeError("the migration analyst is unreachable")


class RecordingEditor:
    """A trace editor that records what it was asked to do and claims success."""

    def __init__(self) -> None:
        self.operations: list[TraceOperation] = []

    def apply(self, operation: TraceOperation) -> TraceEdit:
        self.operations.append(operation)
        return TraceEdit(site=operation.site, action=operation.action, applied=True)


class LineDeletingEditor:
    """A rewriter that does what a real one does: it **removes the line**.

    No blanking, no placeholder. That is the whole point of this fake — a
    rewriter that blanks lines cannot notice a wrong application order, because
    the line numbers below the edit never move. This one shifts everything below
    it up by one, exactly like ``ruff``, ``libcst`` or a text editor would, so a
    worklist applied top-down edits the wrong lines and the resulting file says
    so.
    """

    def __init__(self, files: Mapping[str, Sequence[str]]) -> None:
        self.files: dict[str, list[str]] = {path: list(lines) for path, lines in files.items()}
        self.operations: list[TraceOperation] = []

    def apply(self, operation: TraceOperation) -> TraceEdit:
        self.operations.append(operation)
        lines = self.files[operation.site.path]
        index = operation.site.line - 1
        if not 0 <= index < len(lines):
            raise IndexError(f"{operation.site.location} is past the end of the file")
        if operation.action is MigrationAction.REMOVE:
            del lines[index]
        else:
            lines[index] = lines[index].replace(operation.site.req_id, operation.target)
        return TraceEdit(site=operation.site, action=operation.action, applied=True)


class BrokenEditor:
    """A trace editor that fails on the second operation it is given."""

    def __init__(self) -> None:
        self.operations: list[TraceOperation] = []

    def apply(self, operation: TraceOperation) -> TraceEdit:
        self.operations.append(operation)
        if len(self.operations) > 1:
            raise OSError("the file is read-only")
        return TraceEdit(site=operation.site, action=operation.action, applied=True)


def requirement(
    req_id: str,
    *,
    title: str = "A basket can be paid for",
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
    relations: tuple[Relation, ...] = (),
    capabilities: SourceCapabilities = FULL_CAPABILITIES,
) -> CanonicalRequirement:
    """One requirement as a source read produces it."""
    return CanonicalRequirement(
        req_id=req_id,
        title=title,
        description="The user pays for the basket and receives a receipt.",
        lifecycle=lifecycle,
        source_id="store",
        source_path=f"docs/requirements/{req_id}.md",
        relations=relations,
        capabilities=capabilities,
    )


class RecordingWriter:
    """A write path that records the edits it was handed and reports success."""

    def __init__(self, *, refuse: bool = False) -> None:
        self.calls: list[tuple[str, RequirementEdit]] = []
        self._refuse = refuse

    def update(self, req_id: str, edit: RequirementEdit) -> WriteBackOutcome:
        self.calls.append((req_id, edit))
        if self._refuse:
            return WriteBackOutcome(
                requirement=requirement(req_id, capabilities=READ_ONLY),
                refusal=WriteRefusal(
                    source_id="tracker",
                    operation=SourceCapability.UPDATE,
                    location=f"docs/requirements/{req_id}.md",
                    detail="the tracker is read-only for this user",
                ),
            )
        return WriteBackOutcome(
            requirement=requirement(req_id, lifecycle=RequirementLifecycle.DEPRECATED),
            written=True,
        )


def request_for(*replaced: str) -> MigrationRequest:
    """The migration request for ``NEW supersedes replaced``."""
    return MigrationRequest.for_supersession(NEW, replaced, coverage=COVERAGE)


def full_answers(request: MigrationRequest) -> dict[str, dict[str, object]]:
    """An analyst answer that classifies every site of *request*."""
    answers: dict[str, dict[str, object]] = {}
    for site in request.inventory.sites:
        if site.kind is SiteKind.TEST:
            answers[site.key] = {
                "action": "re-point",
                "reasoning": "the test still describes the behaviour, under the new id",
                "target": NEW,
            }
        else:
            answers[site.key] = {
                "action": "adapt",
                "reasoning": "the implementation stays but has to satisfy the new wording",
            }
    return answers


def decided_plan(*replaced: str) -> MigrationPlan:
    """A plan in which every site carries one of the five actions."""
    request = request_for(*replaced)
    analyst = ScriptedAnalyst(full_answers(request))
    return plan_migration(request, analyst=analyst, at=AT, persona=PERSONA, model=MODEL)


# -- SWR-3507: the worklist ------------------------------------------------


@verifies(SWR.SWR_3507)
def test_every_trace_and_test_appears_exactly_once_with_an_action() -> None:
    """Completeness *and* exactly-once, over both replaced requirements."""
    request = request_for(OLD, OTHER_OLD)
    plan = plan_migration(
        request,
        analyst=ScriptedAnalyst(full_answers(request)),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )

    expected = {
        "trace|SWR-501|src/pkg/basket.py:41",
        "trace|SWR-501|src/pkg/receipt.py:12",
        "test|SWR-501|tests/unit/test_basket.py:20",
        "trace|SWR-502|src/pkg/refund.py:9",
        "test|SWR-502|tests/unit/test_refund.py:15",
        "test|SWR-502|tests/unit/test_refund.py:30",
    }
    keys = [entry.key for entry in plan.entries]
    assert set(keys) == expected
    assert len(keys) == len(set(keys)) == 6
    assert all(entry.action.decided for entry in plan.entries)
    assert plan.ready_for_approval


@verifies(SWR.SWR_3507)
def test_a_site_the_analysis_skipped_needs_a_decision_rather_than_keep() -> None:
    """The undecidable case: an omitted site is a question, never a default."""
    request = request_for(OLD)
    answers = full_answers(request)
    skipped = "trace|SWR-501|src/pkg/receipt.py:12"
    del answers[skipped]

    plan = plan_migration(
        request,
        analyst=ScriptedAnalyst(answers),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )

    entry = plan.worklist.get(skipped)
    assert entry is not None
    assert entry.action is MigrationAction.DECISION_REQUIRED
    assert entry.action not in {MigrationAction.KEEP, MigrationAction.REMOVE}
    assert "did not mention this site" in entry.question
    assert plan.ready_for_approval is False
    assert [row.key for row in plan.undecided] == [skipped]


@pytest.mark.parametrize(
    ("payload", "expected_fragment"),
    [
        ({}, "named no action"),
        ({"action": "delete", "reasoning": "it is gone"}, "not a migration action"),
        ({"action": "remove"}, "without stating why"),
        ({"action": "re-point", "reasoning": "it moves"}, "without naming a target"),
        (
            {"action": "re-point", "reasoning": "it moves", "target": OLD},
            "onto the id being replaced",
        ),
        (
            {"action": "remove", "reasoning": "obsolete", "target": NEW},
            "also named a target",
        ),
    ],
)
@verifies(SWR.SWR_3507)
def test_every_unreadable_answer_lands_on_decision_required(
    payload: dict[str, object],
    expected_fragment: str,
) -> None:
    """Six ways an answer fails, and none of them becomes keep or remove."""
    site = MigrationSite(kind=SiteKind.TRACE, req_id=OLD, path="src/pkg/basket.py", line=41)

    entry = read_action(site, payload, decided_by=f"{PERSONA} ({MODEL})")

    assert entry.action is MigrationAction.DECISION_REQUIRED
    assert expected_fragment in entry.question
    assert entry.target == ""


@verifies(SWR.SWR_3507)
def test_the_action_vocabulary_is_the_five_names_plus_the_undecided_outcome() -> None:
    """SWR-3507 names five actions; the sixth member is the explicit non-answer."""
    assert {str(action) for action in MigrationAction} == {
        "remove",
        "adapt",
        "keep",
        "migrate",
        "re-point",
        "decision-required",
    }
    assert {str(a) for a in MigrationAction if a.decided} == {
        "remove",
        "adapt",
        "keep",
        "migrate",
        "re-point",
    }


@verifies(SWR.SWR_3507)
def test_an_analyst_that_fails_leaves_every_site_undecided() -> None:
    """An outage must not half-migrate a requirement."""
    request = request_for(OLD)

    plan = plan_migration(
        request,
        analyst=OfflineAnalyst(),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )

    assert len(plan.undecided) == len(plan.entries) == 3
    assert "unreachable" in plan.entries[0].decided_by
    with pytest.raises(MigrationApprovalError):
        approve_migration(plan, approver=ADA, at=LATER)


@verifies(SWR.SWR_3507)
def test_a_worklist_that_misses_or_invents_a_site_is_not_a_plan() -> None:
    """Completeness is a construction rule, not something a reviewer must spot."""
    request = request_for(OLD)
    complete = decided_plan(OLD).worklist

    short = MigrationWorklist(entries=complete.entries[:-1])
    with pytest.raises(ValidationError, match="says nothing about"):
        MigrationPlan(request=request, worklist=short, at=AT)

    stranger = MigrationEntry(
        site=MigrationSite(kind=SiteKind.TRACE, req_id=OLD, path="src/pkg/other.py", line=3),
        action=MigrationAction.KEEP,
        reasoning="unrelated",
    )
    with pytest.raises(ValidationError, match="which the inventory does not contain"):
        MigrationPlan(
            request=request,
            worklist=MigrationWorklist(entries=(*complete.entries, stranger)),
            at=AT,
        )


@verifies(SWR.SWR_3507)
def test_the_same_site_cannot_be_listed_or_decided_twice() -> None:
    """A site migrated twice is how a removal takes a neighbouring line with it."""
    site = MigrationSite(kind=SiteKind.TRACE, req_id=OLD, path="src/pkg/basket.py", line=41)
    with pytest.raises(ValidationError, match="listed twice"):
        MigrationInventory(sites=(site, site))

    entry = MigrationEntry(site=site, action=MigrationAction.KEEP, reasoning="fine as it is")
    with pytest.raises(ValidationError, match="decided twice"):
        MigrationWorklist(entries=(entry, entry))


@verifies(SWR.SWR_3507)
def test_an_undecided_worklist_cannot_be_approved_or_executed() -> None:
    """The hard stop: not classifiable means nothing runs."""
    request = request_for(OLD)
    plan = plan_migration(request, at=AT)
    assert len(plan.undecided) == 3

    with pytest.raises(MigrationApprovalError, match="still need a decision"):
        approve_migration(plan, approver=ADA, at=LATER)


@verifies(SWR.SWR_3507)
def test_a_plan_edited_after_approval_is_refused() -> None:
    """An approval is for one exact list, not for migrations in general."""
    plan = decided_plan(OLD)
    approval = approve_migration(plan, approver=ADA, at=LATER).approval

    edited = plan.with_decision(
        "trace|SWR-501|src/pkg/basket.py:41",
        MigrationAction.REMOVE,
        reasoning="on second thought this is dead",
        decided_by="ada",
    )

    assert edited.digest != plan.digest
    with pytest.raises(MigrationApprovalError, match="changed after it was approved"):
        ApprovedMigration(plan=edited, approval=approval)


@verifies(SWR.SWR_3507)
def test_execution_applies_exactly_the_approved_annotation_edits() -> None:
    """Remove and re-point are applied; adapt and migrate become units; keep is untouched."""
    request = request_for(OLD)
    sites = request.inventory.sites
    answers: dict[str, dict[str, object]] = {
        sites[0].key: {"action": "remove", "reasoning": "the behaviour is gone"},
        sites[1].key: {"action": "keep", "reasoning": "still correct as it stands"},
        sites[2].key: {"action": "re-point", "reasoning": "same test, new id", "target": NEW},
    }
    plan = plan_migration(
        request,
        analyst=ScriptedAnalyst(answers),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )
    approved = approve_migration(plan, approver=ADA, at=LATER)
    editor = RecordingEditor()

    execution = MigrationExecutor(editor=editor).execute(approved, at=LATER)

    assert [op.action for op in editor.operations] == [
        MigrationAction.REMOVE,
        MigrationAction.RE_POINT,
    ]
    assert [op.site.location for op in editor.operations] == [
        "src/pkg/basket.py:41",
        "tests/unit/test_basket.py:20",
    ]
    assert execution.completed
    assert [entry.site.location for entry in execution.untouched] == ["src/pkg/receipt.py:12"]
    assert execution.handed_to_units == ()


@verifies(SWR.SWR_3507)
def test_after_execution_no_trace_points_at_a_retired_requirement() -> None:
    """The fourth acceptance criterion, checked against the post-migration inventory."""
    request = request_for(OLD)
    answers = {
        site.key: {"action": "re-point", "reasoning": "moves to the successor", "target": NEW}
        for site in request.inventory.sites
    }
    plan = plan_migration(
        request,
        analyst=ScriptedAnalyst(answers),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )
    approved = approve_migration(plan, approver=ADA, at=LATER)

    execution = MigrationExecutor(editor=RecordingEditor()).execute(approved, at=LATER)

    assert execution.retired_ids == (OLD,)
    after = MigrationInventory.from_coverage({NEW: COVERAGE[OLD]})
    assert execution.residual_traces(after) == ()

    stale = MigrationInventory.from_coverage({OLD: COVERAGE[OLD]})
    assert [site.location for site in execution.residual_traces(stale)] == [
        "src/pkg/basket.py:41",
        "src/pkg/receipt.py:12",
        "tests/unit/test_basket.py:20",
    ]
    assert dangling_traces(stale, ()) == ()


@verifies(SWR.SWR_3507)
def test_two_edits_in_one_file_are_applied_bottom_up() -> None:
    """The worklist reads top-down; the rewriter must be driven bottom-up.

    ``SWR-502``'s two covering tests sit in one file, at lines 15 and 30. Every
    ``site.line`` was planned against the file *before* the migration, so
    removing line 15 first moves line 30 up to 29 and the second operation
    deletes the wrong line — silently, in somebody else's repository.

    The order is therefore part of the executor's contract, not of each
    rewriter's cleverness: paths ascend, lines descend within a path.
    """
    request = request_for(OTHER_OLD)
    answers = {
        site.key: {"action": "remove", "reasoning": "obsolete with the requirement"}
        for site in request.inventory.sites
    }
    approved = approve_migration(
        plan_migration(
            request, analyst=ScriptedAnalyst(answers), at=AT, persona=PERSONA, model=MODEL
        ),
        approver=ADA,
        at=LATER,
    )

    # The worklist a human reads is ascending; the operations are not.
    assert [entry.site.location for entry in approved.entries] == [
        "src/pkg/refund.py:9",
        "tests/unit/test_refund.py:15",
        "tests/unit/test_refund.py:30",
    ]
    assert [op.site.location for op in approved.operations] == [
        "src/pkg/refund.py:9",
        "tests/unit/test_refund.py:30",
        "tests/unit/test_refund.py:15",
    ]

    editor = LineDeletingEditor(
        {
            "src/pkg/refund.py": [f"line {number}" for number in range(1, 12)],
            "tests/unit/test_refund.py": [f"line {number}" for number in range(1, 33)],
        },
    )

    execution = MigrationExecutor(editor=editor).execute(approved, at=LATER)

    assert execution.completed
    # Exactly the three planned lines are gone, and nothing else moved.
    assert "line 9" not in editor.files["src/pkg/refund.py"]
    assert editor.files["src/pkg/refund.py"] == [
        f"line {number}" for number in range(1, 12) if number != 9
    ]
    assert editor.files["tests/unit/test_refund.py"] == [
        f"line {number}" for number in range(1, 33) if number not in {15, 30}
    ]
    # The neighbours a top-down application would have eaten instead.
    assert "line 29" in editor.files["tests/unit/test_refund.py"]
    assert "line 16" in editor.files["tests/unit/test_refund.py"]


@verifies(SWR.SWR_3507)
def test_a_migration_without_a_rewriter_refuses_instead_of_reporting_success() -> None:
    """No editor means nothing was applied, and the report says so."""
    approved = approve_migration(decided_plan(OLD), approver=ADA, at=LATER)

    execution = MigrationExecutor().execute(approved, at=LATER)

    assert execution.edits == ()
    assert execution.completed is False
    assert "no trace editor is configured" in execution.failure


@verifies(SWR.SWR_3507)
def test_a_failing_rewriter_stops_the_migration_where_it_failed() -> None:
    """Continuing past a failed edit would touch a file whose state nobody knows."""
    request = request_for(OLD)
    answers = {
        site.key: {"action": "remove", "reasoning": "obsolete with the requirement"}
        for site in request.inventory.sites
    }
    approved = approve_migration(
        plan_migration(
            request,
            analyst=ScriptedAnalyst(answers),
            at=AT,
            persona=PERSONA,
            model=MODEL,
        ),
        approver=ADA,
        at=LATER,
    )
    editor = BrokenEditor()

    execution = MigrationExecutor(editor=editor).execute(approved, at=LATER)

    assert len(editor.operations) == 2
    assert len(execution.edits) == 1
    assert execution.completed is False
    assert "the file is read-only" in execution.failure


@verifies(SWR.SWR_3507)
def test_the_worklist_is_inspectable_and_recorded_row_by_row() -> None:
    """A record that only counts sites cannot explain a deletion months later."""
    plan = decided_plan(OLD)

    record = plan.to_record()

    assert record.outcome == "migration-planned"
    assert len(record.considered) == len(plan.entries) == 3
    assert any("src/pkg/basket.py:41" in line for line in record.considered)
    assert record.persona == PERSONA
    assert record.model == MODEL
    assert record.record_id == plan.record_id


# -- SWR-3508: deprecation, never deletion ---------------------------------


@verifies(SWR.SWR_3508)
def test_deprecation_happens_only_after_the_migration_completed() -> None:
    """A requirement marked replaced while its code still claims it is the bug."""
    approved = approve_migration(decided_plan(OLD), approver=ADA, at=LATER)
    execution = MigrationExecutor().execute(approved, at=LATER)
    writer = RecordingWriter()

    result = SupersedingCompletion(writer).complete(execution)

    assert writer.calls == []
    assert result.completed is False
    assert "did not complete" in result.refusal


@verifies(SWR.SWR_3508)
def test_a_completed_migration_deprecates_each_replaced_id_once() -> None:
    """The lifecycle change is written to the source, once, and nothing is deleted."""
    approved = approve_migration(decided_plan(OLD, OTHER_OLD), approver=ADA, at=LATER)
    execution = MigrationExecutor(editor=RecordingEditor()).execute(approved, at=LATER)
    writer = RecordingWriter()
    current = {OLD: requirement(OLD), OTHER_OLD: requirement(OTHER_OLD)}

    result = SupersedingCompletion(writer).complete(execution, requirements=current)

    assert [req_id for req_id, _ in writer.calls] == [OLD, OTHER_OLD]
    assert all(edit.changed_fields() == ("lifecycle",) for _, edit in writer.calls)
    assert all(edit.lifecycle is RequirementLifecycle.DEPRECATED for _, edit in writer.calls)
    assert [edit.expected_hash for _, edit in writer.calls] == [
        current[OLD].current_hash,
        current[OTHER_OLD].current_hash,
    ]
    assert result.deprecated_ids == (OLD, OTHER_OLD)
    assert result.completed


@verifies(SWR.SWR_3508)
def test_an_already_deprecated_requirement_is_not_written_a_second_time() -> None:
    """ "Once" means once, even when the completion is re-run."""
    approved = approve_migration(decided_plan(OLD), approver=ADA, at=LATER)
    execution = MigrationExecutor(editor=RecordingEditor()).execute(approved, at=LATER)
    writer = RecordingWriter()
    already = {OLD: requirement(OLD, lifecycle=RequirementLifecycle.DEPRECATED)}

    result = SupersedingCompletion(writer).complete(execution, requirements=already)

    assert writer.calls == []
    assert result.completed
    assert result.deprecated_ids == ()
    assert "already deprecated" in result.outcomes[0].message


@verifies(SWR.SWR_3508)
def test_a_read_only_source_yields_a_stated_manual_step() -> None:
    """A refusal is a value the user can act on, not a silent skip."""
    approved = approve_migration(decided_plan(OLD), approver=ADA, at=LATER)
    execution = MigrationExecutor(editor=RecordingEditor()).execute(approved, at=LATER)
    writer = RecordingWriter(refuse=True)

    result = SupersedingCompletion(writer).complete(execution)

    assert result.completed is False
    assert len(result.manual_steps) == 1
    step = result.manual_steps[0]
    assert step.req_id == OLD
    assert "set the lifecycle to 'deprecated' by hand" in step.message
    assert "tracker" in step.message


@verifies(SWR.SWR_3508)
def test_a_superseded_requirement_leaves_the_flow_but_stays_visible() -> None:
    """Excluded from scheduling and progress; stated as superseded, never hidden."""
    old = requirement(OLD)
    new = requirement(
        NEW,
        title="A basket can be paid for in instalments",
        relations=(Relation(kind=RelationKind.SUPERSEDES, target=OLD),),
    )
    graph = build_relation_graph((old, new))

    standing = superseded_standing(old, graph)
    successor = superseded_standing(new, graph)

    assert standing.superseded
    assert standing.superseded_by == (NEW,)
    assert standing.schedulable is False
    assert standing.counts_towards_progress is False
    assert standing.visible is True
    assert standing.statement == f"{OLD} is superseded by {NEW}"
    assert successor.schedulable is True
    assert successor.superseded is False


@verifies(SWR.SWR_3508)
def test_a_deprecated_requirement_is_out_of_the_flow_even_without_a_successor() -> None:
    """The lifecycle axis alone already stops scheduling (SWR-3412)."""
    retired = requirement(OLD, lifecycle=RequirementLifecycle.DEPRECATED)

    standing = superseded_standing(retired, build_relation_graph((retired,)))

    assert standing.superseded is False
    assert standing.schedulable is False
    assert standing.visible is True
    assert standing.statement == f"{OLD} is not superseded"


@verifies(SWR.SWR_3507)
def test_an_approval_names_the_person_who_gave_it() -> None:
    """An anonymous approval is not a human having seen the list."""
    plan = decided_plan(OLD)
    with pytest.raises(DecisionError, match="names the person"):
        MigrationApproval(approver=DeliveryActor.user(""), at=LATER, plan_digest=plan.digest)


@verifies(SWR.SWR_3507, SWR.SWR_3512)
def test_an_agent_cannot_approve_the_migration_it_proposed() -> None:
    """The one path in the board that deletes somebody else's code.

    The migration analyst is a system actor. If ``approver`` were a string it
    would read ``"superseding-migration"`` — indistinguishable from a person's
    handle — and the analysis would be able to sign off its own proposal and hand
    the result straight to :class:`MigrationExecutor`. The type refuses it.
    """
    plan = decided_plan(OLD)

    with pytest.raises(DecisionError, match="is not a person"):
        approve_migration(plan, approver=ANALYST, at=LATER)

    with pytest.raises(DecisionError, match="is not a person"):
        MigrationApproval(approver=ANALYST, at=LATER, plan_digest=plan.digest)

    # And there is no way round it: an executor takes an ApprovedMigration, and
    # an ApprovedMigration cannot be built without a MigrationApproval.
    approved = approve_migration(plan, approver=ADA, at=LATER)
    assert approved.approval.approver == ADA
    assert approved.approval.approver.kind is ActorKind.USER
    assert "user (ada)" in approved.message
