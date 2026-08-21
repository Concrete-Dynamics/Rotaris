"""Productive use: a team drops a requirement onto Ready. A small one becomes one piece of
work; a large one becomes several that depend on each other — and neither outcome edits a
single character of the requirement the team wrote.
Expected outcome: units are Rotaris' own artefacts with stable, unique ids and a declared
dependency order; planning, splitting and discarding them leaves the project's requirement
files byte-identical and their hashes unchanged; and a discarded unit's runs stay in the
history."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import ExecutionUnitView, UnitState
from rotaris_core.requirements.execution.units import (
    ExecutionUnit,
    RequirementUnits,
    UnitError,
    UnitSpec,
    mint_unit_id,
    plan_units,
    units_for,
)
from rotaris_core.requirements.sources.declarative import (
    DeclarativeSource,
    DeclarativeSourceConfig,
)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.model import CanonicalRequirement

pytestmark = pytest.mark.unit

REQ = "SWR-3401"

#: A five-way decomposition of one requirement: two independent starts, an
#: implementation that waits for both, tests that wait for it, and docs last.
FIVE = (
    UnitSpec(key="schema", title="Schema", scope="the persisted shape"),
    UnitSpec(key="reader", title="Reader", scope="reading it back"),
    UnitSpec(key="impl", title="Implementation", depends_on=("schema", "reader")),
    UnitSpec(key="tests", title="Tests", depends_on=("impl",)),
    UnitSpec(key="docs", title="Docs", depends_on=("impl",)),
)

ONE = (UnitSpec(key="impl", title="Implementation", scope="all of it"),)

SPEC_DOCUMENT = """---
id: REQ-1
state: accepted
---

# Import a CSV with a preview

The user picks a file, sees the parsed rows, and confirms before anything is written.
"""

SOURCE_CONFIG: dict[str, object] = {
    "source-id": "specs",
    "type": "markdown",
    "glob": "specs/**/*.md",
    "id": "frontmatter.id",
    "title": "heading",
    "status": "frontmatter.state",
    "description": "body",
    "status-values": {"open": "draft", "accepted": "approved"},
}


def _spec_tree(root: Path) -> DeclarativeSource:
    """A real project store with one requirement in it."""
    specs = root / "specs"
    specs.mkdir(parents=True)
    (specs / "import.md").write_text(SPEC_DOCUMENT, encoding="utf-8")
    return DeclarativeSource(root, DeclarativeSourceConfig.model_validate(SOURCE_CONFIG))


def _bytes_under(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _only_requirement(source: DeclarativeSource) -> CanonicalRequirement:
    read = source.read()
    assert len(read.requirements) == 1
    return read.requirements[0]


# -- one unit and five, on the same path -----------------------------------


@verifies(SWR.SWR_3401)
def test_a_one_unit_requirement_and_a_five_unit_one_take_the_same_path() -> None:
    """No 'simple requirement' short-cut a large one would have to work around."""
    small = plan_units(REQ, ONE)
    large = plan_units(REQ, FIVE)

    assert type(small) is type(large) is RequirementUnits
    assert small.count == 1
    assert large.count == 5
    # The same queries answer for both, and answer differently only because the
    # decomposition differs — not because a different code path ran.
    assert [unit.unit_id for unit in small.ready()] == list(small.ids)
    assert [unit.title for unit in large.ready()] == ["Schema", "Reader"]
    assert small.outstanding == small.ids
    assert not small.complete and not large.complete


@verifies(SWR.SWR_3401)
def test_a_requirement_with_no_units_has_delivered_nothing() -> None:
    """An empty plan is not a finished one — otherwise it would reach Done for free."""
    empty = RequirementUnits.blank(REQ)
    assert empty.count == 0
    assert empty.outstanding == ()
    assert not empty.complete
    assert empty.run_ids == ()


# -- ids: stable, unique, derived ------------------------------------------


@verifies(SWR.SWR_3401)
def test_unit_ids_are_stable_across_restarts() -> None:
    """Planning the same decomposition again yields byte-identical ids."""
    first = plan_units(REQ, FIVE)
    second = plan_units(REQ, FIVE)
    assert first.ids == second.ids
    assert first == second
    # Derived from the *pair*: the same key under another requirement is another id.
    assert mint_unit_id(REQ, "impl") != mint_unit_id("SWR-3402", "impl")
    assert mint_unit_id(REQ, "impl") == mint_unit_id(" SWR-3401 ", " impl ")


@verifies(SWR.SWR_3401)
def test_unit_ids_are_unique_within_a_requirement() -> None:
    """A collision is resolved deterministically, and never by reusing an id."""
    taken = {mint_unit_id(REQ, "impl")}
    second = mint_unit_id(REQ, "impl", taken=taken)
    assert second not in taken
    assert second == mint_unit_id(REQ, "impl", taken=taken)

    with pytest.raises(UnitError, match="keyed"):
        plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="impl")))

    with pytest.raises(UnitError, match="used twice"):
        RequirementUnits(
            req_id=REQ,
            units=(
                ExecutionUnit(unit_id="u-1", req_id=REQ),
                ExecutionUnit(unit_id="u-1", req_id=REQ),
            ),
        )


@verifies(SWR.SWR_3401)
def test_a_unit_belongs_to_exactly_one_requirement() -> None:
    """The artefact is owned by one requirement; a foreign unit is refused."""
    with pytest.raises(UnitError, match="belongs to"):
        RequirementUnits(
            req_id=REQ,
            units=(ExecutionUnit(unit_id="u-1", req_id="SWR-3402"),),
        )
    with pytest.raises(UnitError, match="wait for itself"):
        ExecutionUnit(unit_id="u-1", req_id=REQ, depends_on=("u-1",))


# -- the dependency order --------------------------------------------------


@verifies(SWR.SWR_3401)
def test_dependencies_are_declared_over_siblings_and_resolved_to_ids() -> None:
    """A spec names sibling *keys*; the plan turns them into sibling unit ids."""
    units = plan_units(REQ, FIVE)
    by_title = {unit.title: unit for unit in units.units}

    assert by_title["Schema"].depends_on == ()
    assert set(by_title["Implementation"].depends_on) == {
        by_title["Schema"].unit_id,
        by_title["Reader"].unit_id,
    }
    assert by_title["Tests"].depends_on == (by_title["Implementation"].unit_id,)
    assert units.dependents_of(by_title["Implementation"].unit_id) == (
        by_title["Tests"].unit_id,
        by_title["Docs"].unit_id,
    )


@verifies(SWR.SWR_3401)
def test_an_unknown_or_circular_dependency_is_refused() -> None:
    """An incoherent set cannot be built and then discovered later."""
    with pytest.raises(UnitError, match="neither a sibling"):
        plan_units(REQ, (UnitSpec(key="impl", depends_on=("nothing-like-this",)),))

    planned = plan_units(REQ, (UnitSpec(key="a"), UnitSpec(key="b", depends_on=("a",))))
    first, second = planned.units
    with pytest.raises(UnitError, match="cycle"):
        RequirementUnits(
            req_id=REQ,
            units=(first.evolve(depends_on=(second.unit_id,)), second),
        )


@verifies(SWR.SWR_3401)
def test_a_unit_becomes_ready_only_once_its_dependencies_have_finished() -> None:
    """Declaration order is not run order; the dependency list is."""
    units = plan_units(REQ, FIVE)
    by_title = {unit.title: unit for unit in units.units}

    assert [unit.title for unit in units.ready()] == ["Schema", "Reader"]

    units = units.with_state(by_title["Schema"].unit_id, UnitState.FINISHED)
    assert [unit.title for unit in units.ready()] == ["Reader"]

    units = units.with_state(by_title["Reader"].unit_id, UnitState.FINISHED)
    assert [unit.title for unit in units.ready()] == ["Implementation"]

    units = units.with_state(by_title["Implementation"].unit_id, UnitState.FINISHED)
    assert [unit.title for unit in units.ready()] == ["Tests", "Docs"]


# -- discarding keeps the runs (SWR-3401 acceptance 4) ---------------------


@verifies(SWR.SWR_3401)
def test_discarding_a_unit_keeps_its_runs_in_the_execution_history() -> None:
    """The plan loses the unit; the history loses nothing."""
    units = plan_units(REQ, FIVE)
    by_title = {unit.title: unit for unit in units.units}
    reader = by_title["Reader"].unit_id
    impl = by_title["Implementation"].unit_id

    units = units.with_run(reader, "run-1").with_run(reader, "run-2")
    units = units.with_run(impl, "run-3")
    assert units.run_ids == ("run-1", "run-2", "run-3")

    units = units.discard(reader, reason="folded into the implementation")

    assert reader not in units.ids
    assert units.get(reader) is None
    assert set(units.run_ids) == {"run-1", "run-2", "run-3"}
    assert len(units.run_ids) == 3
    retired = units.discarded[0]
    assert retired.unit_id == reader
    assert retired.state is UnitState.ABANDONED
    assert retired.failure_reason == "folded into the implementation"
    assert retired.run_ids == ("run-1", "run-2")
    # And nothing is left waiting for a unit that will never run.
    assert reader not in units.require(impl).depends_on


@verifies(SWR.SWR_3401)
def test_a_discarded_id_is_never_handed_out_again() -> None:
    """Its runs still point at it, so the id stays spoken for."""
    units = plan_units(REQ, ONE)
    only = units.ids[0]
    units = units.with_run(only, "run-1").discard(only)

    replanned = units.added(ONE)
    assert replanned.ids[0] != only
    assert only in {unit.unit_id for unit in replanned.discarded}


# -- splitting -------------------------------------------------------------


@verifies(SWR.SWR_3401)
def test_splitting_a_unit_rewires_what_waited_for_it() -> None:
    """A unit that turned out too big becomes several, in its place."""
    units = plan_units(REQ, FIVE)
    by_title = {unit.title: unit for unit in units.units}
    impl = by_title["Implementation"]
    tests = by_title["Tests"].unit_id

    units = units.with_run(impl.unit_id, "run-9").split(
        impl.unit_id,
        (UnitSpec(key="impl-a"), UnitSpec(key="impl-b", depends_on=("impl-a",))),
    )

    new_ids = tuple(unit.unit_id for unit in units.units if unit.title in {"impl-a", "impl-b"})
    assert len(new_ids) == 2
    assert impl.unit_id not in units.ids
    # The pieces inherit what the original waited for …
    assert set(units.require(new_ids[0]).depends_on) == set(impl.depends_on)
    # … and everything that waited for the original now waits for all the pieces.
    assert set(units.require(tests).depends_on) == set(new_ids)
    # The original is retired, not deleted: its run survives.
    assert units.run_ids == ("run-9",)


@verifies(SWR.SWR_3401)
def test_splitting_into_nothing_is_refused() -> None:
    """'Split' that removes work is a discard, and has to say so."""
    units = plan_units(REQ, ONE)
    with pytest.raises(UnitError, match="none were given"):
        units.split(units.ids[0], ())


# -- no unit operation writes to a requirement source ----------------------


@verifies(SWR.SWR_3401)
def test_no_unit_operation_writes_to_the_requirement_source(tmp_path: Path) -> None:
    """Asserted against a real store on disk, not assumed from the call graph."""
    source = _spec_tree(tmp_path)
    requirement = _only_requirement(source)
    before_bytes = _bytes_under(tmp_path)
    before_hash = requirement.current_hash
    assert before_bytes, "the spec tree has to exist for this test to mean anything"

    units = units_for(requirement, FIVE)
    units = units.with_run(units.ids[0], "run-1")
    units = units.with_state(units.ids[0], UnitState.FINISHED)
    units = units.split(units.ids[1], (UnitSpec(key="reader-a"), UnitSpec(key="reader-b")))
    units = units.discard(units.ids[-1], reason="not needed")
    units = units.added((UnitSpec(key="late"),))

    assert _bytes_under(tmp_path) == before_bytes
    reread = _only_requirement(source)
    assert reread.current_hash == before_hash
    assert reread == requirement
    # The units know only the id — no text, no hash travelled into them.
    dumped = units.model_dump_json()
    assert "Import a CSV" not in dumped
    assert before_hash not in dumped
    assert requirement.req_id in dumped


@verifies(SWR.SWR_3401)
def test_planning_reads_nothing_from_the_requirement_but_its_id(tmp_path: Path) -> None:
    """Two requirements that differ only in text plan to the same unit ids."""
    source = _spec_tree(tmp_path)
    requirement = _only_requirement(source)
    reworded = requirement.model_copy(update={"description": "Something else entirely."})

    assert plan_units(requirement.req_id, FIVE).ids == units_for(reworded, FIVE).ids


# -- the board contract (SWR-3216) -----------------------------------------


@verifies(SWR.SWR_3401)
def test_units_project_onto_the_shared_board_shape() -> None:
    """The card's 'N execution units' reads this value, not a second one."""
    units = plan_units(REQ, FIVE).with_state(
        plan_units(REQ, FIVE).ids[0],
        UnitState.RUNNING,
    )
    views = units.to_views()

    assert len(views) == 5
    assert all(isinstance(view, ExecutionUnitView) for view in views)
    assert views[0].state is UnitState.RUNNING
    assert views[2].depends_on == units.units[2].depends_on
    assert views[2].summary.startswith(units.units[2].unit_id)
    # Discarded units are not on the board, but their runs are in the history.
    trimmed = units.with_run(units.ids[4], "run-4").discard(units.ids[4])
    assert len(trimmed.to_views()) == 4
    assert "run-4" in trimmed.run_ids
