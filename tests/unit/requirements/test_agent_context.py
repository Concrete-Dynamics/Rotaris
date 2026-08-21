"""Productive use: an agent asked to implement one execution unit is handed everything
Rotaris already knows about the requirement — the version it is judged against, its
relations, the code that implements it today, the tests that cover it, what ReqToCode says
about it, its scope, its base revision, its worktree and the conditions it will be measured
against — instead of rediscovering all of it.
Expected outcome: every listed element is either present or named as absent with a reason,
the context is assembled from the projection and the snapshot rather than from a fresh
scan, two assemblies over the same inputs are byte-identical, and the acceptance conditions
handed to the agent are exactly the ones the completion contract evaluates."""

from __future__ import annotations

import datetime as dt

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.projection import (
    BoardEntry,
    BoardInputs,
    project_board,
)
from rotaris_core.requirements.execution.context import (
    CONTEXT_ELEMENTS,
    AbsentElement,
    AgentContext,
    ChangedSpecification,
    ContextElement,
    ContextError,
    SupersededRequirement,
    SupersedingContext,
    acceptance_conditions,
    build_agent_context,
)
from rotaris_core.requirements.execution.contract import COMPLETION_CONDITIONS
from rotaris_core.requirements.execution.run_seam import RunWorkspace
from rotaris_core.requirements.execution.snapshot import capture_snapshot, detect_drift
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.model import CanonicalRequirement, RelationKind
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.unit

REQ = "SWR-3407"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
IMPL = "src/rotaris_core/requirements/execution/context.py"
TEST = "tests/unit/requirements/test_agent_context.py"


def requirement(
    req_id: str = REQ,
    *,
    title: str = "Requirement agents receive a structured context",
    description: str = "An agent gets the snapshot, the relations, the traces and the tests.",
    relations: tuple[tuple[str, str], ...] = (),
) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=title,
        description=description,
        relations=relations,
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
        source_revision="rev-1",
    )


def board_entry(
    *requirements: CanonicalRequirement,
    evidence: dict[str, EvidenceInputs] | None = None,
    req_id: str = REQ,
) -> BoardEntry:
    """One requirement's projection entry — the only source a context is built from."""
    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=requirements, generation=1),
            evidence=evidence or {},
        ),
    )
    entry = projection.entry(req_id)
    assert entry is not None
    return entry


def evidence_for(
    req_id: str = REQ,
    *,
    traced: bool = True,
    tested: bool = True,
) -> EvidenceInputs:
    return EvidenceInputs(
        req_id=req_id,
        implementations=(RequirementSite(path=IMPL, line=120),) if traced else (),
        covering_tests=(
            (CoveringTest(path=TEST, line=42, executed=True, check_status="passed"),)
            if tested
            else ()
        ),
    )


def snapshot_of(requirement_value: CanonicalRequirement, *, run_id: str = "run-1") -> object:
    return capture_snapshot(
        requirement_value,
        run_id=run_id,
        base_commit="c0ffee1234",
        at=AT,
        unit_id="unit-1",
    )


def unit_of(req_id: str = REQ, *, scope: str = "src/rotaris_core/requirements/execution/"):  # noqa: ANN201
    return plan_units(req_id, [UnitSpec(key="impl", title="Context builder", scope=scope)]).units[0]


def context_for(
    *,
    entry: BoardEntry | None = None,
    workspace: RunWorkspace | None = None,
    architecture: tuple[str, ...] = ("docs/architecture/02-code-topology.md",),
    change: ChangedSpecification | None = None,
    superseding: SupersedingContext | None = None,
) -> AgentContext:
    subject = requirement()
    resolved = entry if entry is not None else board_entry(subject, evidence={REQ: evidence_for()})
    return build_agent_context(
        entry=resolved,
        snapshot=snapshot_of(subject),  # type: ignore[arg-type]
        unit=unit_of(),
        workspace=workspace,
        architecture=architecture,
        change=change,
        superseding=superseding,
    )


# -- completeness: present, or explicitly absent ----------------------------


@verifies(SWR.SWR_3407)
def test_every_listed_element_is_present_or_stated_as_absent() -> None:
    context = context_for(
        workspace=RunWorkspace(path="/tmp/wt", branch="rotaris/req/swr-3407/impl"),
    )

    accounted = {element for element in CONTEXT_ELEMENTS if context.present(element)} | {
        entry.element for entry in context.absent
    }
    assert accounted == set(CONTEXT_ELEMENTS)
    for entry in context.absent:
        assert entry.reason.strip(), f"{entry.element} is absent without a reason"


@verifies(SWR.SWR_3407)
def test_an_absence_without_a_reason_cannot_be_constructed() -> None:
    with pytest.raises(ContextError, match="states why it is absent"):
        AbsentElement(element=ContextElement.RELATIONS, reason="  ")


@verifies(SWR.SWR_3407)
def test_a_silently_omitted_element_is_refused() -> None:
    subject = requirement()
    with pytest.raises(ContextError, match="neither present nor stated"):
        AgentContext(
            req_id=REQ,
            unit_id="unit-1",
            snapshot=snapshot_of(subject),  # type: ignore[arg-type]
            acceptance=acceptance_conditions(),
            # Relations, traces, tests, findings, architecture, scope, worktree,
            # change and superseding are all missing and none of them is declared.
            absent=(),
        )


@verifies(SWR.SWR_3407)
def test_an_element_cannot_be_present_and_declared_absent_at_once() -> None:
    subject = requirement()
    with pytest.raises(ContextError, match="declared absent while carrying content"):
        AgentContext(
            req_id=REQ,
            unit_id="unit-1",
            snapshot=snapshot_of(subject),  # type: ignore[arg-type]
            architecture=("docs/architecture.md",),
            acceptance=acceptance_conditions(),
            absent=tuple(
                AbsentElement(element=element, reason="nothing here")
                for element in CONTEXT_ELEMENTS
                if element
                not in {
                    ContextElement.SNAPSHOT,
                    ContextElement.BASE_REVISION,
                    ContextElement.ACCEPTANCE_CONDITIONS,
                }
            ),
        )


@verifies(SWR.SWR_3407)
def test_missing_traces_and_tests_are_named_with_the_reason_they_are_missing() -> None:
    entry = board_entry(requirement(), evidence={REQ: evidence_for(traced=False, tested=False)})

    context = context_for(entry=entry)

    assert not context.present(ContextElement.IMPLEMENTATION_TRACES)
    assert not context.present(ContextElement.COVERING_TESTS)
    assert "first one" in context.reason_for(ContextElement.IMPLEMENTATION_TRACES)
    assert "no test declares" in context.reason_for(ContextElement.COVERING_TESTS)
    assert any("covering-tests" in line for line in context.absences)


@verifies(SWR.SWR_3407)
def test_a_missing_worktree_is_stated_rather_than_omitted() -> None:
    context = context_for(workspace=None)

    assert not context.present(ContextElement.WORKTREE)
    assert "no worktree has been provisioned" in context.reason_for(ContextElement.WORKTREE)
    assert "(absent)" in context.render()


# -- assembled from the projection, not from a scan -------------------------


@verifies(SWR.SWR_3407)
def test_the_context_carries_exactly_what_the_projection_reported() -> None:
    entry = board_entry(requirement(), evidence={REQ: evidence_for()})

    context = context_for(entry=entry)

    assert context.implementations == entry.implementations
    assert context.covering_tests == entry.covering_tests
    assert context.trace_addresses == (f"{IMPL}:120",)
    assert context.test_addresses == (f"{TEST}:42",)
    assert context.findings == tuple(o.detail for o in entry.evidence.obligations)


@verifies(SWR.SWR_3407)
def test_a_trace_that_does_not_exist_on_disk_is_still_reported() -> None:
    """Proof there is no repository scan: the projection is believed, not re-checked."""
    ghost = "src/rotaris_core/does_not_exist_anywhere.py"
    entry = board_entry(
        requirement(),
        evidence={
            REQ: EvidenceInputs(
                req_id=REQ,
                implementations=(RequirementSite(path=ghost, line=7),),
            ),
        },
    )

    context = context_for(entry=entry)

    assert context.trace_addresses == (f"{ghost}:7",)


@verifies(SWR.SWR_3407)
def test_the_relations_come_from_the_projection() -> None:
    subject = requirement(relations=((RelationKind.DEPENDS_ON, "SWR-3402"),))
    entry = board_entry(subject, requirement("SWR-3402"), evidence={REQ: evidence_for()})

    context = build_agent_context(
        entry=entry,
        snapshot=snapshot_of(subject),  # type: ignore[arg-type]
        unit=unit_of(),
    )

    assert context.relations is not None
    assert ("depends-on", "SWR-3402") in context.relations.edges
    assert "depends-on: SWR-3402" in context.render()


@verifies(SWR.SWR_3407)
def test_a_requirement_with_no_relation_says_so() -> None:
    context = context_for()

    assert context.relations is None
    assert "authors no relation" in context.reason_for(ContextElement.RELATIONS)


# -- determinism ------------------------------------------------------------


@verifies(SWR.SWR_3407)
def test_context_assembly_is_deterministic_for_one_snapshot() -> None:
    first = context_for(workspace=RunWorkspace(path="/tmp/wt", branch="b"))
    second = context_for(workspace=RunWorkspace(path="/tmp/wt", branch="b"))

    assert first == second
    assert first.render() == second.render()
    assert first.digest == second.digest


@verifies(SWR.SWR_3407)
def test_a_different_snapshot_produces_a_different_context() -> None:
    first = context_for()
    other = requirement(description="A different specification entirely.")
    second = build_agent_context(
        entry=board_entry(other, evidence={REQ: evidence_for()}),
        snapshot=snapshot_of(other),  # type: ignore[arg-type]
        unit=unit_of(),
        architecture=("docs/architecture/02-code-topology.md",),
    )

    assert first.digest != second.digest


# -- the conditions it will actually be judged against (SWR-3408) -----------


@verifies(SWR.SWR_3407)
def test_the_acceptance_conditions_are_the_ones_the_contract_evaluates() -> None:
    context = context_for()

    assert context.acceptance_names == tuple(c.name for c in COMPLETION_CONDITIONS)
    assert [c.detail for c in context.acceptance] == [c.detail for c in COMPLETION_CONDITIONS]
    rendered = context.render()
    for condition in COMPLETION_CONDITIONS:
        assert condition.name in rendered


# -- the changed requirement (SWR-3403) -------------------------------------


@verifies(SWR.SWR_3407)
def test_a_changed_requirement_carries_both_versions_the_diff_and_what_it_affects() -> None:
    before = requirement(description="The old behaviour.")
    after = before.evolve(description="The new behaviour.")
    drift = detect_drift(snapshot_of(before), after)  # type: ignore[arg-type]
    change = ChangedSpecification.of(
        drift,
        old_version=before.description,
        new_version=after.description,
        affected_traces=(f"{IMPL}:120",),
        affected_tests=(f"{TEST}:42",),
    )

    context = context_for(change=change)

    assert context.present(ContextElement.SPECIFICATION_CHANGE)
    assert context.change is not None
    assert context.change.old_hash == before.current_hash
    assert context.change.new_hash == after.current_hash
    assert "The old behaviour." in context.change.diff
    assert "The new behaviour." in context.change.diff
    rendered = context.render()
    assert "### Previous version" in rendered
    assert f"trace {IMPL}:120" in rendered
    assert f"test {TEST}:42" in rendered


@verifies(SWR.SWR_3407)
def test_an_unchanged_requirement_states_that_it_did_not_change() -> None:
    context = context_for()

    assert context.change is None
    assert "did not change" in context.reason_for(ContextElement.SPECIFICATION_CHANGE)


# -- the superseding requirement (SWR-3507) ---------------------------------


@verifies(SWR.SWR_3407)
def test_a_superseding_requirement_carries_the_replaced_ids_and_the_migration_duty() -> None:
    subject = requirement(relations=((RelationKind.SUPERSEDES, "SWR-1200"),))
    entry = board_entry(subject, requirement("SWR-1200"), evidence={REQ: evidence_for()})

    context = build_agent_context(
        entry=entry,
        snapshot=snapshot_of(subject),  # type: ignore[arg-type]
        unit=unit_of(),
        superseded_evidence={"SWR-1200": (("src/old.py:9",), ("tests/test_old.py:3",))},
    )

    assert context.superseding is not None
    assert context.superseding.req_ids == ("SWR-1200",)
    assert context.superseding.superseded[0].traces == ("src/old.py:9",)
    assert context.superseding.superseded[0].tests == ("tests/test_old.py:3",)
    assert any("SWR-3507" in duty for duty in context.superseding.migration_obligations)
    assert "SWR-1200" in context.render()


@verifies(SWR.SWR_3407)
def test_a_requirement_that_supersedes_nothing_says_so() -> None:
    context = context_for()

    assert context.superseding is None
    assert context.reason_for(ContextElement.SUPERSEDING) == "this requirement supersedes nothing"


@verifies(SWR.SWR_3407)
def test_an_explicit_superseding_context_is_used_unchanged() -> None:
    supplied = SupersedingContext(
        superseded=(SupersededRequirement(req_id="SWR-1200", title="Old"),),
        migration_obligations=("delete the old adapter",),
    )

    context = context_for(superseding=supplied)

    assert context.superseding == supplied


# -- one requirement, one context -------------------------------------------


@verifies(SWR.SWR_3407)
def test_a_context_refuses_a_snapshot_of_a_different_requirement() -> None:
    other = requirement("SWR-3402")
    with pytest.raises(ContextError, match="assembled around"):
        build_agent_context(
            entry=board_entry(requirement(), evidence={REQ: evidence_for()}),
            snapshot=snapshot_of(other),  # type: ignore[arg-type]
            unit=unit_of(),
        )


@verifies(SWR.SWR_3407)
def test_a_context_refuses_a_unit_of_a_different_requirement() -> None:
    with pytest.raises(ContextError, match="belongs to"):
        build_agent_context(
            entry=board_entry(requirement(), evidence={REQ: evidence_for()}),
            snapshot=snapshot_of(requirement()),  # type: ignore[arg-type]
            unit=unit_of("SWR-3402"),
        )


@verifies(SWR.SWR_3407)
def test_the_rendered_context_names_every_element_as_a_section() -> None:
    rendered = context_for(
        workspace=RunWorkspace(path="/tmp/wt", branch="rotaris/req/swr-3407/impl"),
    ).render()

    for element in CONTEXT_ELEMENTS:
        assert f"## {element.label}" in rendered
    assert "c0ffee1234" in rendered
    assert "rotaris/req/swr-3407/impl" in rendered
