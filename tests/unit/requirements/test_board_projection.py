"""Productive use: the Requirements board asks the engine one question — "what is true
about every requirement right now" — and renders the answer. Cards, rings, epic cards,
the detail view, the graph, the queue and the review surface all read that one value,
and the execution slice fills the half of it that is still empty.
Expected outcome: every requirement lands in exactly one column with its two badges, its
health and its evidence per obligation; a complete-but-failing requirement projects
`failed` rather than a green ring; an epic carries its children's aggregate and no
delivery action; the execution fields exist and degrade to a stated empty state; the
whole projection survives a JSON round-trip; and building it — over a crafted store and
over this repository's real one — writes nothing at all."""

from __future__ import annotations

import datetime as dt
import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditStore
from rotaris_core.requirements.delivery.completion import (
    CompletionEvidence,
    CoveringTestEvidence,
    evaluate_completion,
)
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceState,
    VerificationRecord,
)
from rotaris_core.requirements.delivery.health import RequirementHealth
from rotaris_core.requirements.delivery.obligations import EvidenceKind
from rotaris_core.requirements.delivery.projection import (
    PRIORITY_ORDER,
    PRIORITY_RECORD_KEY,
    BlockerKind,
    BlockerOption,
    BlockerView,
    BoardEntry,
    BoardInputs,
    BoardProjection,
    BoardProjector,
    CheckOutcome,
    CoverageEvidence,
    ExecutionSummary,
    ExecutionUnitView,
    IntegrationView,
    NoDetails,
    NoEvidence,
    NoExecution,
    QueueEntryView,
    QueueView,
    RequirementPriority,
    ReviewView,
    RunOutcome,
    RunSnapshotView,
    RunView,
    StoredDetails,
    UnitState,
    parse_priority,
    project_board,
    read_priority,
    requirement_number,
)
from rotaris_core.requirements.delivery.satisfied import SatisfactionState, SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import (
    DeliveryIndex,
    DeliveryRecord,
    DeliveryStore,
)
from rotaris_core.requirements.delivery.transitions import DeliveryTransitions, TransitionRequest
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
)
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
RUNNER = DeliveryActor.system("requirement-runner")
IMPL = "src/rotaris_core/requirements/delivery/projection.py"
TEST = "tests/unit/requirements/test_board_projection.py"
REPO_ROOT = Path(__file__).resolve().parents[3]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def requirement(
    req_id: str,
    *,
    title: str = "",
    parent: str | None = None,
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
    req_type: RequirementType = RequirementType.PRODUCT,
    relations: tuple[tuple[str, str], ...] = (),
    source_id: str = "reqtocode",
    source_path: str | None = None,
) -> CanonicalRequirement:
    """One canonical requirement, as a source would hand it over."""
    return CanonicalRequirement(
        req_id=req_id,
        title=title or f"{req_id} title",
        description=f"{req_id} says something.",
        lifecycle=lifecycle,
        req_type=req_type,
        parent=parent,
        relations=relations,
        source_id=source_id,
        source_path=source_path or f"docs/requirements/{req_id}.md",
    )


def index_of(*requirements: CanonicalRequirement, generation: int = 1) -> RequirementIndex:
    """A published index over *requirements*."""
    return RequirementIndex(requirements=requirements, generation=generation)


def evidence(
    req_id: str,
    *,
    requirement_hash: str = "",
    traced: bool = True,
    tested: bool = True,
    executed: bool = True,
    status: str = "passed",
    verified: str | None = "passed",
) -> EvidenceInputs:
    """The repository facts behind one requirement's evidence."""
    return EvidenceInputs(
        req_id=req_id,
        requirement_hash=requirement_hash,
        implementations=(RequirementSite(path=IMPL, line=42),) if traced else (),
        covering_tests=(
            (
                CoveringTest(
                    path=TEST,
                    line=17,
                    executed=executed,
                    check_name="pytest" if executed else None,
                    check_status=status if executed else None,
                    # *status* names this test's own outcome in these fixtures.
                    verdict=(
                        ("passed" if status == "passed" else "failed") if executed else "not_run"
                    ),
                ),
            )
            if tested
            else ()
        ),
        verification=(
            VerificationRecord(
                verdict=verified,  # type: ignore[arg-type]
                commit="c0ffee123456",
                requirement_hash=requirement_hash or "h-1",
                run_id="run-7",
                verified_at=AT,
            )
            if verified is not None
            else None
        ),
    )


def record(
    req_id: str,
    state: DeliveryState = DeliveryState.BACKLOG,
    *,
    satisfied_hash: str | None = None,
    priority: str | None = None,
    at: dt.datetime = AT,
) -> DeliveryRecord:
    """A delivery record in *state*, optionally carrying a delivered version."""
    status = (
        DeliveryStatus()
        if state is DeliveryState.BACKLOG
        else DeliveryStatus(
            state=state,
            changed_at=at,
            changed_by=RUNNER,
            cause=TransitionCause.RUN_COMPLETED,
        )
    )
    log = (
        DeliveryRecord.blank(req_id).satisfied.appended(
            SatisfiedDelivery(
                req_id=req_id,
                satisfied_hash=satisfied_hash,
                run_id="run-7",
                satisfied_at=at,
                verified_commit="c0ffee123456",
            ),
        )
        if satisfied_hash
        else DeliveryRecord.blank(req_id).satisfied
    )
    extras: dict[str, Any] = {PRIORITY_RECORD_KEY: priority} if priority is not None else {}
    return DeliveryRecord(req_id=req_id, delivery=status, satisfied=log, extras=extras)


def delivery_of(*records: DeliveryRecord) -> DeliveryIndex:
    """A delivery index holding *records*."""
    return DeliveryIndex(records={one.req_id: one for one in records})


class WriteAttemptedError(AssertionError):
    """A projection touched the filesystem for writing. That is the defect."""


@contextmanager
def writes_forbidden() -> Iterator[None]:
    """Make every write path raise, so a write cannot pass unnoticed.

    Patches the seams a Python write actually goes through — ``Path`` mutators,
    ``open`` in a writing mode, and the ``os`` primitives the delivery store uses
    for its atomic replace — rather than inspecting the tree afterwards. A store
    that created and removed a lock file would leave no trace to inspect, and
    that is exactly the kind of write a read API must not perform.

    A context manager rather than a fixture, because a test has to be able to
    *write* its store first and arm the guard only around the projection.
    """
    real_open = Path.open

    def refuse(name: str) -> Any:
        def guard(*args: object, **kwargs: object) -> Any:
            raise WriteAttemptedError(f"the board projection called {name}")

        return guard

    def guarded_open(self: Path, mode: str = "r", *args: object, **kwargs: object) -> Any:
        if any(flag in mode for flag in "wxa+"):
            raise WriteAttemptedError(f"the board projection opened {self} for writing")
        return real_open(self, mode, *args, **kwargs)  # type: ignore[arg-type]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(Path, "open", guarded_open)
        patch.setattr(Path, "write_text", refuse("Path.write_text"))
        patch.setattr(Path, "write_bytes", refuse("Path.write_bytes"))
        patch.setattr(Path, "mkdir", refuse("Path.mkdir"))
        patch.setattr(Path, "touch", refuse("Path.touch"))
        patch.setattr(Path, "unlink", refuse("Path.unlink"))
        patch.setattr(Path, "rename", refuse("Path.rename"))
        patch.setattr(os, "replace", refuse("os.replace"))
        patch.setattr(os, "remove", refuse("os.remove"))
        patch.setattr(os, "mkdir", refuse("os.mkdir"))
        patch.setattr(os, "makedirs", refuse("os.makedirs"))
        yield


# --------------------------------------------------------------------------
# the shape (SWR-3216)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3216)
def test_every_requirement_is_projected_once_into_exactly_one_column() -> None:
    """One entry per requirement, one column per entry, every column present."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement("SWR-3201", parent="SWR-3200"),
                requirement("SWR-3202", parent="SWR-3200"),
            ),
            delivery=delivery_of(
                record("SWR-3201", DeliveryState.RUNNING),
                record("SWR-3202", DeliveryState.DONE, satisfied_hash="whatever"),
            ),
        ),
    )

    assert board.ids == ("SWR-3200", "SWR-3201", "SWR-3202")
    columns = board.columns()
    assert set(columns) == set(DeliveryState), "every column exists, even the empty ones"
    placed = [req_id for ids in columns.values() for req_id in ids]
    assert sorted(placed) == ["SWR-3200", "SWR-3201", "SWR-3202"]
    assert len(placed) == len(set(placed)), "no requirement appears in two columns"
    assert columns[DeliveryState.DONE] == ("SWR-3202",)
    assert board.counts()[DeliveryState.READY] == 0
    # The epic sits in the column its children imply, not in the one its untouched
    # record holds: nothing ever writes an epic's state (SWR-3212), so reading the
    # stored one would leave every epic in Backlog for ever.
    assert columns[DeliveryState.RUNNING] == ("SWR-3200", "SWR-3201")


@verifies(SWR.SWR_3216)
def test_the_projection_carries_the_canonical_fields_the_detail_view_shows() -> None:
    """Id, title, description, source, path, hash, lifecycle and delivery state."""
    one = requirement("SWR-3216", title="Board projection API", req_type=RequirementType.TECHNICAL)
    board = project_board(BoardInputs(index=index_of(one)))
    entry = board.entry("SWR-3216")

    assert entry is not None
    assert entry.title == "Board projection API"
    assert entry.description == one.description
    assert entry.req_type is RequirementType.TECHNICAL
    assert entry.source_id == "reqtocode"
    assert entry.source_path == "docs/requirements/SWR-3216.md"
    assert entry.current_hash == one.current_hash
    assert entry.badges == ("approved", "Backlog")
    assert entry.state is DeliveryState.BACKLOG


@verifies(SWR.SWR_3216)
def test_a_projection_of_the_same_inputs_twice_is_equal() -> None:
    """Deterministic: SWR-3210 compares passes, so two passes must be comparable."""
    inputs = BoardInputs(
        index=index_of(requirement("SWR-3201"), requirement("SWR-3202")),
        evidence={"SWR-3201": evidence("SWR-3201")},
    )

    assert project_board(inputs) == project_board(inputs)


@verifies(SWR.SWR_3216)
def test_an_entry_refuses_evidence_that_belongs_to_another_requirement() -> None:
    """Joining two requirements' answers is the one error a board could not notice."""
    board = project_board(BoardInputs(index=index_of(requirement("SWR-3201"))))
    entry = board.entry("SWR-3201")
    assert entry is not None

    with pytest.raises(ValidationError, match="belong to"):
        BoardEntry(
            req_id="SWR-3202",
            obligations=entry.obligations,
            evidence=entry.evidence,
            health=entry.health,
        )


@verifies(SWR.SWR_3216)
def test_the_board_refuses_to_project_one_requirement_twice() -> None:
    """A duplicated entry would put one card in two columns."""
    board = project_board(BoardInputs(index=index_of(requirement("SWR-3201"))))
    entry = board.entry("SWR-3201")
    assert entry is not None

    with pytest.raises(ValidationError, match="each requirement once"):
        BoardProjection(entries=(entry, entry))


# --------------------------------------------------------------------------
# evidence and health on the card (SWR-3207, SWR-3211, SWR-3305)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3216)
def test_complete_traceability_with_a_failing_test_projects_failed() -> None:
    """The case §22 of the target picture exists for, read off the projection."""
    one = requirement("SWR-3201")
    board = project_board(
        BoardInputs(
            index=index_of(one),
            evidence={"SWR-3201": evidence("SWR-3201", status="failed")},
            delivery=delivery_of(record("SWR-3201", DeliveryState.DONE, satisfied_hash="x")),
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.implementations, "traceability is complete"
    assert entry.covering_tests, "a covering test exists"
    assert entry.evidence_state is EvidenceState.FAILED
    assert entry.evidence.state_of(EvidenceKind.TEST) is EvidenceState.FAILED
    assert entry.health.health is RequirementHealth.VERIFICATION_FAILED
    assert entry.blocking_evidence == (EvidenceKind.TEST,)


@verifies(SWR.SWR_3216)
def test_a_test_that_never_ran_projects_stale_and_is_not_satisfied() -> None:
    """`stale` is a third answer, distinguishable from `satisfied` and from `missing`."""
    inputs = BoardInputs(
        index=index_of(requirement("SWR-3201"), requirement("SWR-3202")),
        evidence={
            "SWR-3201": evidence("SWR-3201", executed=False),
            "SWR-3202": evidence("SWR-3202"),
        },
    )
    board = project_board(inputs)
    never_ran = board.entry("SWR-3201")
    ran = board.entry("SWR-3202")

    assert never_ran is not None
    assert ran is not None
    assert never_ran.evidence.state_of(EvidenceKind.TEST) is EvidenceState.STALE
    assert ran.evidence.state_of(EvidenceKind.TEST) is EvidenceState.SATISFIED
    assert never_ran.evidence_state is not ran.evidence_state
    stale = never_ran.evidence.for_kind(EvidenceKind.TEST)
    assert stale.staleness, "stale evidence names the reason, never only a colour"


@verifies(SWR.SWR_3216)
def test_evidence_details_travel_with_every_obligation() -> None:
    """The ring is openable: each obligation carries the records behind it."""
    board = project_board(
        BoardInputs(
            index=index_of(requirement("SWR-3201")),
            evidence={"SWR-3201": evidence("SWR-3201")},
        ),
    )
    entry = board.entry("SWR-3201")
    assert entry is not None

    kinds = tuple(obligation.kind for obligation in entry.evidence.obligations)
    assert kinds == tuple(EvidenceKind), "one obligation per kind, always"
    assert f"{IMPL}:42" in entry.evidence.for_kind(EvidenceKind.IMPLEMENTATION).addresses
    assert f"{TEST}:17" in entry.evidence.for_kind(EvidenceKind.TEST).addresses
    verification = entry.evidence.for_kind(EvidenceKind.VERIFICATION).verification
    assert verification is not None
    assert verification.commit == "c0ffee123456"
    assert verification.run_id == "run-7"


@verifies(SWR.SWR_3216)
def test_a_delivered_requirement_whose_text_moved_says_so() -> None:
    """`Specification changed` on the card, derived from the two hashes."""
    one = requirement("SWR-3201")
    board = project_board(
        BoardInputs(
            index=index_of(one),
            delivery=delivery_of(
                record("SWR-3201", DeliveryState.DONE, satisfied_hash="an-older-version"),
            ),
            evidence={"SWR-3201": evidence("SWR-3201")},
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.satisfied_hash == "an-older-version"
    assert entry.satisfaction is SatisfactionState.STALE
    assert entry.specification_changed
    assert entry.health.health is RequirementHealth.NEEDS_UPDATE


@verifies(SWR.SWR_3216)
def test_a_requirement_delivered_at_its_current_version_is_healthy() -> None:
    """The other half of the same comparison, so the first one means something."""
    one = requirement("SWR-3201")
    board = project_board(
        BoardInputs(
            index=index_of(one),
            delivery=delivery_of(
                record("SWR-3201", DeliveryState.DONE, satisfied_hash=one.current_hash),
            ),
            evidence={"SWR-3201": evidence("SWR-3201", requirement_hash=one.current_hash)},
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.satisfaction is SatisfactionState.SATISFIED
    assert not entry.specification_changed
    assert entry.health.health is RequirementHealth.HEALTHY


@verifies(SWR.SWR_3216)
def test_a_blocked_requirement_is_blocked_whatever_its_evidence_says() -> None:
    """Work stopped on purpose outranks the evidence it is stopped on."""
    blocked = DeliveryRecord(
        req_id="SWR-3201",
        delivery=DeliveryStatus(
            state=DeliveryState.BLOCKED,
            blocked_reason="the upstream API is undecided",
            blocked_from=DeliveryState.RUNNING,
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.BLOCKER_RAISED,
        ),
    )
    board = project_board(
        BoardInputs(
            index=index_of(requirement("SWR-3201")),
            delivery=delivery_of(blocked),
            evidence={"SWR-3201": evidence("SWR-3201")},
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.state is DeliveryState.BLOCKED
    assert entry.delivery.blocked_reason == "the upstream API is undecided"
    assert entry.health.health is RequirementHealth.BLOCKED


# --------------------------------------------------------------------------
# epics and relations (SWR-3212, SWR-3307, SWR-3308, SWR-3310)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3216)
def test_an_epic_entry_carries_its_children_aggregate_and_no_delivery_action() -> None:
    """The epic card's numbers come from the projection, not from the view."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement("SWR-3201", parent="SWR-3200"),
                requirement("SWR-3202", parent="SWR-3200"),
                requirement(
                    "SWR-3203",
                    parent="SWR-3200",
                    lifecycle=RequirementLifecycle.DEPRECATED,
                ),
            ),
            delivery=delivery_of(record("SWR-3201", DeliveryState.DONE, satisfied_hash="x")),
            evidence={"SWR-3201": evidence("SWR-3201")},
        ),
    )
    epic = board.entry("SWR-3200")
    leaf = board.entry("SWR-3201")

    assert epic is not None
    assert leaf is not None
    assert epic.is_epic and epic.epic is not None
    assert epic.epic.total == 2, "the deprecated child is excluded, not counted"
    assert epic.epic.deprecated == ("SWR-3203",)
    assert epic.epic.done == 1
    assert epic.epic.traceability_percent == 50.0
    assert not epic.schedulable, "an epic carries no delivery action (SWR-3308)"
    assert leaf.schedulable
    assert leaf.epic is None and not leaf.is_epic
    assert board.epics["SWR-3200"] == epic.epic
    assert board.of_epic("SWR-3200") == (leaf, board.entry("SWR-3202"), board.entry("SWR-3203"))


@verifies(SWR.SWR_3216, SWR.SWR_3212)
def test_an_epics_whole_delivery_surface_is_the_one_its_children_imply() -> None:
    """The column, the badge, the health and the aggregate are one answer, not two.

    An epic's stored record stays pristine by construction — every direct
    transition is refused (SWR-3212) — so every surface that reads a delivery
    status off the entry has to read the *derived* one. Reading the stored one is
    not a cosmetic slip: the card would print "Backlog" beside "1 of 2 done, 1
    blocked", and the board's blocked column would be missing the epic that is in
    fact blocked.
    """
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement("SWR-3201", parent="SWR-3200"),
                requirement("SWR-3202", parent="SWR-3200"),
            ),
            delivery=delivery_of(
                record("SWR-3201", DeliveryState.DONE, satisfied_hash="x"),
                DeliveryRecord(
                    req_id="SWR-3202",
                    delivery=DeliveryStatus(
                        state=DeliveryState.BLOCKED,
                        blocked_reason="the upstream API is down",
                        blocked_from=DeliveryState.RUNNING,
                        changed_at=LATER,
                        changed_by=RUNNER,
                        cause=TransitionCause.BLOCKER_RAISED,
                    ),
                ),
            ),
        ),
    )
    epic = board.entry("SWR-3200")
    stored = board.entry("SWR-3201")

    assert epic is not None
    assert stored is not None
    assert epic.epic is not None
    assert epic.epic.state is DeliveryState.BLOCKED, "one blocked child blocks the epic"
    # Everything a surface reads off the entry agrees with that, rather than with
    # the Backlog the store holds for an epic nobody ever wrote.
    assert epic.state is DeliveryState.BLOCKED
    assert epic.delivery.state is DeliveryState.BLOCKED
    assert epic.badges == ("approved", "Blocked")
    assert epic.view.state is DeliveryState.BLOCKED
    assert epic.health.health is RequirementHealth.BLOCKED
    assert "the upstream API is down" in epic.delivery.blocked_reason
    assert "SWR-3202" in epic.delivery.blocked_reason, "and it names the child that is blocked"
    # The derived status names who moved the child that decided it and when.
    assert epic.delivery.changed_by == RUNNER
    assert epic.last_changed_at == LATER
    assert board.columns()[DeliveryState.BLOCKED] == ("SWR-3200", "SWR-3202")
    assert [entry.req_id for entry in board.blocked] == [], "no blocker view was handed in"
    assert stored.state is DeliveryState.DONE, "a leaf still reads its own stored state"


@verifies(SWR.SWR_3216, SWR.SWR_3212)
def test_an_entry_whose_column_disagrees_with_its_epic_aggregate_cannot_be_built() -> None:
    """The guard behind the rule above: two states on one card is not representable."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement("SWR-3201", parent="SWR-3200"),
            ),
            delivery=delivery_of(record("SWR-3201", DeliveryState.RUNNING)),
        ),
    )
    epic = board.entry("SWR-3200")
    assert epic is not None
    assert epic.state is DeliveryState.RUNNING

    with pytest.raises(ValidationError, match="children imply"):
        BoardEntry.model_validate(
            epic.model_dump() | {"delivery": DeliveryStatus().model_dump()},
        )


@verifies(SWR.SWR_3216)
def test_an_empty_epic_reports_backlog_rather_than_a_hundred_percent() -> None:
    """ "Every child is done" is vacuously true of no children — and misleading."""
    board = project_board(
        BoardInputs(index=index_of(requirement("SWR-3200"), requirement("SWR-3201"))),
    )
    entry = board.entry("SWR-3200")

    assert entry is not None
    assert not entry.is_epic, "a requirement without children is not an epic"
    assert entry.epic is None
    assert board.epics == {}


@verifies(SWR.SWR_3216)
def test_relations_travel_in_both_directions_and_name_what_did_not_resolve() -> None:
    """The detail view and the graph read one resolved neighbourhood, not two."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement(
                    "SWR-3216",
                    parent="SWR-3200",
                    relations=(
                        (RelationKind.DERIVED_FROM, "SWR-3201"),
                        (RelationKind.DEPENDS_ON, "SWR-9999"),
                    ),
                ),
                requirement("SWR-3201", parent="SWR-3200"),
                requirement(
                    "SWR-3300",
                    relations=((RelationKind.SUPERSEDES, "SWR-3216"),),
                ),
            ),
        ),
    )
    entry = board.entry("SWR-3216")
    origin = board.entry("SWR-3201")

    assert entry is not None
    assert origin is not None
    assert entry.relations.parent == "SWR-3200"
    assert entry.relations.epic == "SWR-3200"
    assert entry.relations.derived_from == ("SWR-3201",)
    assert origin.relations.derives == ("SWR-3216",)
    assert entry.relations.superseded_by == ("SWR-3300",)
    assert entry.relations.unresolved[0].target == "SWR-9999"
    assert entry.relations.depends_on == ("SWR-9999",), "the edge is kept, not dropped"
    assert ("depends-on", "SWR-9999") in entry.relations.edges
    assert entry.health.health is RequirementHealth.SUPERSEDED
    assert any("SWR-9999" in line for line in entry.notices), "the dangling edge is reported"


# --------------------------------------------------------------------------
# priority, sorting and filtering (SWR-3309)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3216)
def test_priority_comes_off_the_delivery_record_and_sorts_before_the_id() -> None:
    """Priority is Rotaris' data, never the source's text (SWR-3114)."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3201"),
                requirement("SWR-3202"),
                requirement("SWR-3203"),
            ),
            delivery=delivery_of(
                record("SWR-3202", priority="low"),
                record("SWR-3203", priority="critical"),
            ),
        ),
    )

    assert board.entry("SWR-3201") is not None
    assert board.entry("SWR-3201").priority is RequirementPriority.NONE  # type: ignore[union-attr]
    assert [entry.req_id for entry in board.sorted_entries()] == [
        "SWR-3203",
        "SWR-3202",
        "SWR-3201",
    ], "critical, then low, then the unprioritised one — never randomly"


@verifies(SWR.SWR_3216)
def test_an_unreadable_priority_degrades_one_card_not_the_board() -> None:
    """The same tolerance the delivery state gets, for the same reason."""
    assert read_priority(record("SWR-3201", priority="P1")) is RequirementPriority.HIGH
    assert read_priority(record("SWR-3201", priority="banana")) is RequirementPriority.NONE
    assert read_priority(DeliveryRecord.blank("SWR-3201")) is RequirementPriority.NONE
    assert parse_priority("Needs Coffee") is None
    assert PRIORITY_ORDER[-1] is RequirementPriority.NONE
    assert RequirementPriority.NONE.rank > RequirementPriority.LOW.rank


@verifies(SWR.SWR_3216)
def test_the_filter_dimensions_the_board_offers_are_answerable_from_the_entry() -> None:
    """Epic, source, lifecycle, health, priority and free text — all on the value."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement("SWR-3216", title="Board projection API", parent="SWR-3200"),
                requirement("SWR-3301", source_id="specs"),
            ),
        ),
    )

    assert [entry.req_id for entry in board.of_source("specs")] == ["SWR-3301"]
    assert [entry.req_id for entry in board.of_epic("SWR-3200")] == ["SWR-3216"]
    incomplete = board.with_health(RequirementHealth.INCOMPLETE_TRACEABILITY)
    assert {entry.req_id for entry in incomplete} == {"SWR-3200", "SWR-3216", "SWR-3301"}
    entry = board.entry("SWR-3216")
    assert entry is not None
    assert entry.matches_text("projection") and entry.matches_text("3216")
    assert not entry.matches_text("kanban")
    assert entry.matches_text("  "), "an empty filter matches everything"


# --------------------------------------------------------------------------
# the execution half — declared now, filled by SWR-3400
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3216)
def test_the_execution_fields_exist_and_degrade_cleanly_while_they_are_empty() -> None:
    """The board renders them before the execution slice has written a line."""
    board = project_board(BoardInputs(index=index_of(requirement("SWR-3201"))))
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.execution.empty
    assert entry.execution.unit_count == 0
    assert entry.execution.last_run is None
    assert entry.execution.last_run_at is None
    assert entry.execution.active_run is None
    assert entry.execution.commits == () and entry.execution.branches == ()
    assert entry.review is None
    assert entry.blockers == ()
    assert board.queue.empty


@verifies(SWR.SWR_3216)
def test_a_filled_execution_summary_answers_everything_a_card_and_a_detail_view_ask() -> None:
    """Unit count, last run, worktree, branch, commits — the SWR-3414 record, projected."""
    snapshot = RunSnapshotView(
        req_id="SWR-3201",
        requirement_hash="h-snapshot",
        base_commit="base123456789",
        unit_id="unit-1",
        session_id="session-9",
        captured_at=AT,
    )
    first = RunView(
        run_id="run-1",
        unit_id="unit-1",
        session_id="session-9",
        outcome=RunOutcome.FAILED,
        snapshot=snapshot,
        worktree_path=".rotaris/worktrees/req-3201-unit-1",
        branch="rotaris/req/SWR-3201/unit-1",
        base_commit="base123456789",
        changed_files=(IMPL,),
        failure_reason="the provider timed out",
        started_at=AT,
        finished_at=AT,
    )
    second = RunView(
        run_id="run-2",
        unit_id="unit-1",
        outcome=RunOutcome.SUCCEEDED,
        snapshot=snapshot,
        branch="rotaris/req/SWR-3201/unit-1",
        produced_commits=("abc1234",),
        changed_files=(IMPL, TEST),
        verified=True,
        checks=(CheckOutcome(name="pytest", status="passed"),),
        attempt=2,
        agent_summary="implemented the projection",
        agent_claimed_complete=True,
        started_at=AT,
        finished_at=LATER,
    )
    interrupted = RunView(run_id="run-3", unit_id="unit-2", outcome=RunOutcome.INTERRUPTED)
    summary = ExecutionSummary(
        req_id="SWR-3201",
        units=(
            ExecutionUnitView(
                unit_id="unit-1",
                title="the engine half",
                state=UnitState.FINISHED,
                runs=(first, second),
                retries=1,
                retry_limit=3,
                agent="requirements-engineer",
            ),
            ExecutionUnitView(
                unit_id="unit-2",
                state=UnitState.RUNNING,
                depends_on=("unit-1",),
                runs=(interrupted,),
            ),
        ),
        runs=(first, second, interrupted),
        integrations=(
            IntegrationView(
                integration_id="int-1",
                unit_ids=("unit-1", "unit-2"),
                succeeded=False,
                conflicting_units=("unit-2",),
                conflicting_files=(IMPL,),
            ),
        ),
    )
    board = project_board(
        BoardInputs(
            index=index_of(requirement("SWR-3201")),
            delivery=delivery_of(record("SWR-3201", DeliveryState.RUNNING)),
            execution={"SWR-3201": summary},
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.execution.unit_count == 2
    assert entry.execution.last_run is not None
    assert entry.execution.last_run.run_id == "run-3"
    assert entry.execution.last_run_at is None, "an interrupted run never finished"
    assert entry.execution.commits == ("abc1234",)
    assert entry.execution.changed_files == (IMPL, TEST)
    assert entry.execution.branches == ("rotaris/req/SWR-3201/unit-1",)
    assert entry.execution.outstanding_units == ("unit-2",)
    assert [run.run_id for run in entry.execution.interrupted_runs] == ["run-3"]
    assert entry.execution.agent == "requirements-engineer"
    unit = entry.execution.units[0]
    assert unit.worktree_path is None and unit.branch == "rotaris/req/SWR-3201/unit-1"
    assert unit.retries == 1 and not unit.retries_exhausted
    assert not entry.execution.integrations[0].succeeded
    assert entry.execution.integrations[0].conflicting_units == ("unit-2",)
    assert second.address == "run:run-2"
    assert first.address == "session:session-9/run:run-1"


@verifies(SWR.SWR_3216)
def test_a_review_states_which_version_was_built_and_who_claimed_what() -> None:
    """SWR-3403's two hashes, and SWR-3603's claimed-versus-measured split."""
    one = requirement("SWR-3201")
    review = ReviewView(
        req_id="SWR-3201",
        run_id="run-2",
        snapshot_hash="h-snapshot",
        current_hash=one.current_hash,
        reason="specification changed during execution",
        agent_summary="implemented the old text",
        agent_risks=("the acceptance criteria moved",),
        agent_claimed_complete=True,
        checks=(CheckOutcome(name="pytest", status="failed", detail="1 failed"),),
        verified=False,
        branch="rotaris/req/SWR-3201/unit-1",
    )
    board = project_board(
        BoardInputs(
            index=index_of(one),
            delivery=delivery_of(record("SWR-3201", DeliveryState.REVIEW)),
            reviews={"SWR-3201": review},
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.review is not None
    assert entry.review.specification_changed
    assert entry.review.agent_claimed_complete, "the agent claimed it was done"
    assert entry.review.verified is False, "Rotaris measured otherwise"
    assert entry.review.checks[0].status == "failed"
    assert [one.req_id for one in board.in_review] == ["SWR-3201"]


@verifies(SWR.SWR_3216)
def test_a_held_queue_candidate_must_state_the_reason_it_is_held() -> None:
    """A queue that shows what is held without why is what SWR-3608 calls a risk."""
    queue = QueueView(
        entries=(
            QueueEntryView(req_id="SWR-3202", position=1, priority=RequirementPriority.HIGH),
            QueueEntryView(
                req_id="SWR-3203",
                position=2,
                held=True,
                hold_reason="SWR-3202 is not Done",
                waiting_for=("SWR-3202",),
            ),
        ),
        automatic=True,
        concurrency_limit=2,
    )
    board = project_board(BoardInputs(index=index_of(requirement("SWR-3202")), queue=queue))

    assert board.queue.next_up is not None
    assert board.queue.next_up.req_id == "SWR-3202"
    assert [entry.req_id for entry in board.queue.held] == ["SWR-3203"]
    assert "SWR-3202 is not Done" in board.queue.held[0].message

    with pytest.raises(ValidationError, match="names the reason it is held"):
        QueueEntryView(req_id="SWR-3204", held=True)


@verifies(SWR.SWR_3216)
def test_a_blocker_carries_its_question_and_its_answer_path() -> None:
    """A blocked card the user cannot answer is a dead end (SWR-3607)."""
    blocker = BlockerView(
        req_id="SWR-3201",
        kind=BlockerKind.DECISION,
        reason="two requirements describe the same behaviour differently",
        question="which one stands?",
        options=(
            BlockerOption(key="keep-3201", label="Keep SWR-3201", consequence="supersedes 3202"),
            BlockerOption(key="keep-3202", label="Keep SWR-3202", consequence="supersedes 3201"),
        ),
        blocking_ids=("SWR-3202",),
        raised_at=AT,
    )
    board = project_board(
        BoardInputs(
            index=index_of(requirement("SWR-3201")),
            blockers={"SWR-3201": (blocker,)},
        ),
    )
    entry = board.entry("SWR-3201")

    assert entry is not None
    assert entry.blockers[0].answerable
    assert entry.blockers[0].blocking_ids == ("SWR-3202",)
    assert [one.req_id for one in board.blocked] == ["SWR-3201"]


# --------------------------------------------------------------------------
# serialisability and the write guard (SWR-3216 acceptance criteria 6 and 7)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3216)
def test_the_whole_projection_survives_a_json_round_trip() -> None:
    """Plain serialisable objects: it has to cross a thread and a signal."""
    board = project_board(
        BoardInputs(
            index=index_of(
                requirement("SWR-3200"),
                requirement("SWR-3201", parent="SWR-3200"),
            ),
            delivery=delivery_of(record("SWR-3201", DeliveryState.DONE, satisfied_hash="x")),
            evidence={"SWR-3201": evidence("SWR-3201")},
            execution={
                "SWR-3201": ExecutionSummary(
                    req_id="SWR-3201",
                    runs=(RunView(run_id="run-1", outcome=RunOutcome.SUCCEEDED),),
                ),
            },
            evaluated_at=AT,
        ),
    )

    text = json.dumps(board.model_dump(mode="json"))
    restored = BoardProjection.model_validate(json.loads(text))

    assert restored == board
    assert restored.entry("SWR-3201") is not None
    assert restored.evaluated_at == AT


@verifies(SWR.SWR_3216)
def test_projecting_a_real_store_writes_nothing(tmp_path: Path) -> None:
    """The guard SWR-3216 asks for: a read API that writes is a defect, not a nuance."""
    workspace = tmp_path / "workspace"
    store = DeliveryStore(workspace)
    one = requirement("SWR-3201")
    transitions = DeliveryTransitions(store)
    # Written *before* the guard is armed: the projection must survive a store
    # that already has files, which is the case a lock file would show up in.
    outcome = transitions.apply(
        TransitionRequest(
            req_id="SWR-3201",
            target=DeliveryState.READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
    )
    assert outcome.accepted, outcome.refusal
    written = sorted(path.name for path in store.directory.glob("*.json"))
    assert written, "the store has a record to be read back"

    projector = BoardProjector(index_of(one), store)
    with writes_forbidden():
        board = projector.project()

    assert board.entry("SWR-3201") is not None
    assert board.entry("SWR-3201").state is DeliveryState.READY  # type: ignore[union-attr]
    assert sorted(path.name for path in store.directory.glob("*.json")) == written


@verifies(SWR.SWR_3216)
def test_the_write_guard_would_actually_catch_a_write(tmp_path: Path) -> None:
    """The guard above is only worth something if it fails on a real write.

    Both halves matter: a bare ``write_text`` and the store's own update path,
    which is what a projection that decided to persist something would reach for.
    """
    store = DeliveryStore(tmp_path / "workspace")
    with writes_forbidden(), pytest.raises(WriteAttemptedError):
        (tmp_path / "proof.txt").write_text("a projection that wrote", encoding="utf-8")
    with writes_forbidden(), pytest.raises(WriteAttemptedError):
        DeliveryTransitions(store).apply(
            TransitionRequest(
                req_id="SWR-3201",
                target=DeliveryState.READY,
                actor=USER,
                cause=TransitionCause.USER_ACTION,
                at=AT,
            ),
        )


@verifies(SWR.SWR_3216)
def test_the_projector_reads_nothing_it_was_not_asked_for(tmp_path: Path) -> None:
    """Construction is cheap: the store is touched by `project`, not by `__init__`."""
    store = DeliveryStore(tmp_path / "workspace")
    projector = BoardProjector(index_of(requirement("SWR-3201")), store)

    assert not store.directory.exists(), "constructing a projector creates no directory"

    board = projector.project()

    assert board.entry("SWR-3201") is not None
    assert not store.directory.exists(), "projecting a fresh workspace creates no directory"


@verifies(SWR.SWR_3216)
def test_the_default_readers_answer_the_empty_workspace_honestly() -> None:
    """`nothing has run` is the answer until SWR-3400 lands, not a placeholder."""
    one = requirement("SWR-3201")
    blank = DeliveryRecord.blank("SWR-3201")

    assert NoEvidence().evidence_for(one).implementations == ()
    assert NoEvidence().evidence_for(one).requirement_hash == one.current_hash
    assert NoExecution().execution_for("SWR-3201").empty
    assert NoExecution().blockers_for("SWR-3201") == ()
    assert NoExecution().review_for("SWR-3201") is None
    assert NoExecution().queue().empty
    assert NoDetails().history_for(one, blank) is None
    assert NoDetails().audit_for(one, blank) is None
    assert NoDetails().completion_for(one, blank) is None


# --------------------------------------------------------------------------
# the deep views (SWR-3213, SWR-3214, SWR-3215 through SWR-3216)
# --------------------------------------------------------------------------


def delivered_workspace(tmp_path: Path) -> tuple[DeliveryStore, AuditStore, CanonicalRequirement]:
    """A workspace where one requirement was delivered once, and it was recorded.

    Written through the two write paths that exist — the transition engine and
    the audit store — so what the projection reads back afterwards is what a real
    delivery leaves behind, not a fixture shaped like one.
    """
    one = requirement("SWR-3214", title="Requirement revision history")
    store = DeliveryStore(tmp_path / "workspace")
    audit = AuditStore(tmp_path / "workspace")
    transitions = DeliveryTransitions(store, completion=lambda _record, _request: ())
    moves = (
        (DeliveryState.READY, USER, TransitionCause.USER_ACTION, None),
        (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED, None),
        (DeliveryState.REVIEW, RUNNER, TransitionCause.RUN_COMPLETED, None),
        (
            DeliveryState.DONE,
            USER,
            TransitionCause.COMPLETION_ACCEPTED,
            SatisfiedDelivery(
                req_id=one.req_id,
                satisfied_hash=one.current_hash,
                run_id="run-9",
                satisfied_at=LATER,
                verified_commit="c0ffee123456",
            ),
        ),
    )
    for target, actor, cause, delivery in moves:
        outcome = transitions.apply(
            TransitionRequest(
                req_id=one.req_id,
                target=target,
                actor=actor,
                cause=cause,
                at=AT,
                requirement_hash=one.current_hash,
                run_id="run-9",
                delivery=delivery,
            ),
        )
        assert outcome.accepted, outcome.message
        assert outcome.transition is not None
        audit.append(AuditEvent.of_transition(outcome.transition, commit="c0ffee123456"))
    return store, audit, one


@verifies(SWR.SWR_3216, SWR.SWR_3213, SWR.SWR_3214)
def test_the_deep_views_reach_the_entry_through_the_only_read_api(tmp_path: Path) -> None:
    """The history panel's data path: recorded once, read back through the board.

    SWR-3216 says the projection is the *only* surface a user interface consumes.
    So "which run and commit satisfied which version" (SWR-3213) and the revision
    list (SWR-3214, SWR-3313) have to arrive on the entry — a field that nothing
    can fill is the same as a field that does not exist, and the panel would have
    to reach past this module for its data.
    """
    store, audit, one = delivered_workspace(tmp_path)
    projector = BoardProjector(
        index_of(one),
        store,
        details=StoredDetails(audit),
    )
    with writes_forbidden():
        entry = projector.project().entry(one.req_id)

    assert entry is not None
    assert entry.state is DeliveryState.DONE

    trail = entry.audit
    assert trail is not None
    assert trail.implementing_run(one.current_hash) == "run-9"
    assert trail.commit_for(one.current_hash) == "c0ffee123456"
    assert [event.to_state for event in trail.transitions()] == [
        DeliveryState.READY,
        DeliveryState.RUNNING,
        DeliveryState.REVIEW,
        DeliveryState.DONE,
    ]

    history = entry.history
    assert history is not None
    current = history.current
    assert current is not None, "the version that stands is marked as such"
    assert current.requirement_hash == one.current_hash
    assert current.delivered
    assert current.run_id == "run-9"
    assert current.implementing_commit == "c0ffee123456"
    assert not history.source_history_available, "no revision reader was configured, and it says so"
    assert history.unavailable_reason


@verifies(SWR.SWR_3216)
def test_without_a_detail_reader_the_deep_views_are_absent_rather_than_invented(
    tmp_path: Path,
) -> None:
    """The default is honest: nothing was gathered, so nothing is claimed."""
    store, _audit, one = delivered_workspace(tmp_path)
    entry = BoardProjector(index_of(one), store).project().entry(one.req_id)

    assert entry is not None
    assert entry.history is None
    assert entry.audit is None
    assert entry.completion is None


@verifies(SWR.SWR_3216)
def test_req_ids_narrows_the_deep_views_and_never_the_board(tmp_path: Path) -> None:
    """A detail panel shows one card; the board still has to show every column."""
    store, audit, one = delivered_workspace(tmp_path)
    other = requirement("SWR-3213")
    projector = BoardProjector(index_of(one, other), store, details=StoredDetails(audit))

    narrowed = projector.project(req_ids=[one.req_id])

    assert sorted(narrowed.ids) == ["SWR-3213", "SWR-3214"], "the board stays complete"
    asked = narrowed.entry(one.req_id)
    unasked = narrowed.entry("SWR-3213")
    assert asked is not None
    assert unasked is not None
    assert asked.history is not None and asked.audit is not None
    assert unasked.history is None, "a requirement nobody asked about costs no log read"
    assert unasked.audit is None


@verifies(SWR.SWR_3216, SWR.SWR_3215)
def test_a_completion_report_handed_to_the_reader_arrives_on_the_entry(tmp_path: Path) -> None:
    """SWR-3215's report is produced by a Done attempt, and shown by the review surface."""
    store, audit, one = delivered_workspace(tmp_path)
    report = evaluate_completion(
        CompletionEvidence(
            req_id=one.req_id,
            current_hash=one.current_hash,
            satisfied_hash=one.current_hash,
            implementation_traces=(IMPL,),
            covering_tests=(CoveringTestEvidence(path=TEST, line=17, executed=True, passed=True),),
            gate_passed=True,
            integration_complete=True,
        ),
    )
    assert report.complete

    entry = (
        BoardProjector(
            index_of(one),
            store,
            details=StoredDetails(audit, completions={one.req_id: report}),
        )
        .project()
        .entry(one.req_id)
    )

    assert entry is not None
    assert entry.completion == report
    assert entry.completion.unmet == ()


@verifies(SWR.SWR_3216)
def test_coverage_sites_reach_the_projection_without_running_a_process() -> None:
    """ReqToCode's index is read as data — the board never spawns a CLI (SWR-3311)."""

    class Site:
        def __init__(self, path: str, line: int) -> None:
            self.path = path
            self.line = line

    class Entry:
        def __init__(self) -> None:
            self.implementations = (Site(IMPL, 42),)
            self.tests = (Site(TEST, 17),)

    reader = CoverageEvidence({3216: Entry()})
    one = requirement("SWR-3216")
    inputs = reader.evidence_for(one)

    assert requirement_number("SWR-3216") == 3216
    assert requirement_number("REQ-alpha") is None
    assert inputs.implementations[0].path == IMPL
    assert inputs.covering_tests[0].line == 17
    assert not inputs.covering_tests[0].executed, (
        "a coverage sweep knows a test exists, never that anything ran it"
    )

    board = project_board(
        BoardInputs(index=index_of(one), evidence={"SWR-3216": inputs}),
    )
    entry = board.entry("SWR-3216")
    assert entry is not None
    assert entry.evidence.state_of(EvidenceKind.IMPLEMENTATION) is EvidenceState.SATISFIED
    assert entry.evidence.state_of(EvidenceKind.TEST) is EvidenceState.STALE


@verifies(SWR.SWR_3216)
def test_no_desktop_module_shells_out_to_reqtocode_or_the_verifier() -> None:
    """What SWR-3311 depends on, asserted here so slice 3 inherits it green.

    The projection exists so the user interface never has to run a process to
    learn what is true. This scan is what stops that promise from decaying the
    first time somebody finds it easier to parse CLI output.
    """
    sources = sorted((REPO_ROOT / "apps" / "rotaris" / "src").rglob("*.py"))
    assert sources, "the desktop package is where this repository keeps its views"

    spawns = ("subprocess.", "Popen(", "QProcess", "os.system(")
    engines = ("reqtocode", "verifier")
    offenders: list[str] = []
    for path in sources:
        where = str(path.relative_to(REPO_ROOT))
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            # The traceability decorators come from ``rotaris_core.reqtocode``
            # and every module imports them; what must not appear is the engine
            # being *run*, or its internals being imported to recompute health.
            if any(token in line for token in spawns) and any(one in line for one in engines):
                offenders.append(f"{where}:{number} runs the engine as a process")
            if line.startswith(("from rotaris_core.reqtocode.", "import rotaris_core.reqtocode.")):
                offenders.append(f"{where}:{number} imports a ReqToCode internal")
            if line.startswith(("from rotaris_core.verifier", "import rotaris_core.verifier")):
                offenders.append(f"{where}:{number} imports a verifier internal")
    assert not offenders, (
        f"the desktop must read the projection, not the engine: {offenders} (SWR-3216, SWR-3311)"
    )
