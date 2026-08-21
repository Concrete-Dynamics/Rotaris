"""Productive use: somebody deletes a requirement from the store, and its code, its tests
and everything that pointed at it are still there.
Expected outcome: the removal is tombstoned and the analysis names every trace, every
test, every derived requirement and every dependant of the vanished id; the dependants are
reported as dangling rather than quietly satisfied; nothing is deleted — the analysis holds
nothing that could delete, and every site of its worklist is an open question until a
human answers it; and the whole report is retained under that tombstone.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.impact import read_only_report
from rotaris_core.requirements.change.removal import (
    DanglingDependent,
    RemovalAnalyzer,
    RemovalImpact,
    RemovalLedger,
    analyse_removal,
    dangling_dependents,
)
from rotaris_core.requirements.change.superseding import (
    MigrationAction,
    MigrationInventory,
    MigrationRequest,
    plan_migration,
)
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.relations import build_relation_graph
from rotaris_core.requirements.tombstones import Tombstone

pytestmark = pytest.mark.unit

GONE = "SWR-501"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(days=1)


@dataclass(frozen=True)
class Site:
    """One coverage occurrence, shaped like ReqToCode's ``CoverageSite``."""

    path: str
    line: int
    kind: str


@dataclass(frozen=True)
class Coverage:
    """Everything that claims one requirement."""

    implementations: tuple[Site, ...] = ()
    tests: tuple[Site, ...] = ()


COVERAGE = {
    GONE: Coverage(
        implementations=(
            Site("src/pkg/basket.py", 41, "traces"),
            Site("src/pkg/receipt.py", 12, "traces"),
        ),
        tests=(Site("tests/unit/test_basket.py", 20, "verifies"),),
    ),
}


def requirement(
    req_id: str,
    *,
    relations: tuple[Relation, ...] = (),
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
) -> CanonicalRequirement:
    """One requirement as a source read produces it."""
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} does something",
        description="The user gets what they asked for.",
        lifecycle=lifecycle,
        source_id="store",
        source_path=f"docs/requirements/{req_id}.md",
        relations=relations,
    )


def survivors() -> tuple[CanonicalRequirement, ...]:
    """The store after SWR-501 was deleted: four requirements still pointing at it."""
    return (
        requirement(
            "SWR-502",
            relations=(Relation(kind=RelationKind.DEPENDS_ON, target=GONE),),
        ),
        requirement(
            "SWR-503",
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target=GONE),),
        ),
        requirement(
            "SWR-504",
            relations=(Relation(kind=RelationKind.SUPERSEDES, target=GONE),),
        ),
        requirement(
            "SWR-505",
            relations=(Relation(kind=RelationKind.RELATED_TO, target=GONE),),
        ),
    )


def removed_requirement() -> CanonicalRequirement:
    """The last version of SWR-501 that was read before it disappeared."""
    return requirement(
        GONE,
        relations=(Relation(kind=RelationKind.SUPERSEDES, target="SWR-400"),),
    )


def impact_of(
    *,
    coverage: dict[str, Coverage] | None = None,
    last_known: CanonicalRequirement | None = None,
) -> RemovalImpact:
    """The removal analysis for SWR-501 over the surviving store."""
    return analyse_removal(
        Tombstone.for_requirement(removed_requirement(), at=AT),
        graph=build_relation_graph(survivors()),
        coverage=coverage if coverage is not None else COVERAGE,
        requirements={req.req_id: req for req in survivors()},
        last_known=last_known,
        at=LATER,
    )


@verifies(SWR.SWR_3509)
def test_every_trace_test_derived_requirement_and_dependant_is_named() -> None:
    """The first acceptance criterion, as one flat list nobody can half-read."""
    impact = impact_of()

    assert [site.location for site in impact.traces] == [
        "src/pkg/basket.py:41",
        "src/pkg/receipt.py:12",
    ]
    assert [site.location for site in impact.tests] == ["tests/unit/test_basket.py:20"]
    assert impact.derived == ("SWR-503",)
    assert impact.depending == ("SWR-502",)
    assert impact.superseding == ("SWR-504",)
    assert set(impact.named) == {
        "src/pkg/basket.py:41",
        "src/pkg/receipt.py:12",
        "tests/unit/test_basket.py:20",
        "SWR-502",
        "SWR-503",
        "SWR-504",
        "SWR-505",
    }


@verifies(SWR.SWR_3509)
def test_dependants_are_dangling_and_never_read_as_satisfied() -> None:
    """A vanished dependency must not release the work that waited for it."""
    impact = impact_of()

    assert [entry.req_id for entry in impact.dependents] == [
        "SWR-502",
        "SWR-503",
        "SWR-504",
        "SWR-505",
    ]
    assert all(entry.satisfied is False for entry in impact.dependents)
    assert [entry.req_id for entry in impact.dependents if entry.blocks] == [
        "SWR-502",
        "SWR-503",
    ]
    message = impact.dependents[0].message
    assert "SWR-502" in message
    assert "depends-on SWR-501" in message
    assert "dangling, not satisfied" in message
    assert "docs/requirements/SWR-502.md" in message


@verifies(SWR.SWR_3509)
def test_a_relation_kind_nobody_thought_of_is_still_reported() -> None:
    """Every inbound edge is named, not only ``depends-on``."""
    dependents = dangling_dependents(GONE, build_relation_graph(survivors()))

    assert {entry.kind for entry in dependents} == {
        RelationKind.DEPENDS_ON,
        RelationKind.DERIVED_FROM,
        RelationKind.SUPERSEDES,
        RelationKind.RELATED_TO,
    }


@verifies(SWR.SWR_3509)
def test_nothing_is_deleted_and_nothing_can_be() -> None:
    """No writable collaborator, and no site classified as ``remove``."""
    analyzer = RemovalAnalyzer()

    assert read_only_report(analyzer) == ()

    impact = analyzer.analyse(
        Tombstone.for_requirement(removed_requirement(), at=AT),
        graph=build_relation_graph(survivors()),
        coverage=COVERAGE,
        at=LATER,
    )

    assert len(impact.awaiting_decision) == len(impact.plan.entries) == 3
    assert {entry.action for entry in impact.plan.entries} == {
        MigrationAction.DECISION_REQUIRED,
    }
    assert impact.plan.worklist.of_action(MigrationAction.REMOVE) == ()
    assert impact.plan.ready_for_approval is False


@verifies(SWR.SWR_3509)
def test_the_removed_requirements_own_superseding_relations_are_reported() -> None:
    """SWR-400 lost its successor when SWR-501 went; that is a fact, not a gap."""
    impact = impact_of(last_known=removed_requirement())

    assert impact.released == ("SWR-400",)
    assert any("SWR-400" in line and "no successor" in line for line in impact.report)


@verifies(SWR.SWR_3509, SWR.SWR_3113)
def test_the_analysis_is_retained_under_the_tombstone_that_recorded_the_removal() -> None:
    """A second disappearance of the same id must not show the first analysis."""
    impact = impact_of()
    ledger = RemovalLedger().with_impact(impact)

    assert ledger.get(GONE) is impact
    assert ledger.for_tombstone(impact.tombstone) is impact

    second_removal = Tombstone.for_requirement(removed_requirement(), at=LATER)
    assert ledger.for_tombstone(second_removal) is None


@verifies(SWR.SWR_3509)
def test_a_removal_with_no_code_at_all_still_names_its_dependants() -> None:
    """An uncovered requirement leaves relations behind even when it leaves no code."""
    impact = impact_of(coverage={})

    assert impact.inventory.empty
    assert impact.plan.entries == ()
    assert impact.depending == ("SWR-502",)
    assert "0 trace(s)" in impact.message
    assert "nothing was deleted" in impact.message


@verifies(SWR.SWR_3509)
def test_the_report_is_recorded_row_by_row() -> None:
    """ "What was left behind when SWR-501 went" has to be answerable months later."""
    impact = impact_of(last_known=removed_requirement())

    record = impact.to_record()

    assert record.req_id == GONE
    assert record.outcome == "removal-impact"
    assert record.considered == impact.report
    assert any("src/pkg/basket.py:41" in line for line in record.considered)
    assert any("SWR-502" in line for line in record.considered)
    assert record.question != ""


@verifies(SWR.SWR_3509)
def test_an_impact_carrying_another_requirements_worklist_is_refused() -> None:
    """One removal, one worklist — a mixed-up report would misattribute a deletion."""
    stranger = plan_migration(
        MigrationRequest(
            superseded_ids=("SWR-999",),
            inventory=MigrationInventory(),
        ),
        at=LATER,
    )

    with pytest.raises(ValidationError, match="one removal, one worklist"):
        RemovalImpact(
            tombstone=Tombstone.for_requirement(removed_requirement(), at=AT),
            plan=stranger,
            at=LATER,
        )


@verifies(SWR.SWR_3509)
def test_a_dangling_relation_cannot_be_built_without_both_of_its_ends() -> None:
    """A report naming only one id is not something a user can act on."""
    with pytest.raises(ValidationError, match="names both of its ends"):
        DanglingDependent(req_id="SWR-502", removed_id="  ", kind=RelationKind.DEPENDS_ON)
