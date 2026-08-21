"""Productive use: an execution run discovers a lasting technical obligation nobody wrote a
requirement for — a merge journal, a migration format — and proposes it as a *technical
requirement* that joins the project's own store, rather than losing it when the unit that
found it disappears.
Expected outcome: the proposal passes the store's own requirement check before anything is
written, the origin gains the reciprocal derived link, a read-only source is refused with
its reason without failing the run, and a payload describing an execution unit is never
turned into a permanent requirement."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.execution.derivation import (
    UNIT_ONLY_FIELDS,
    DerivationError,
    DerivationRefusalKind,
    DerivationRequest,
    DerivedArtifactKind,
    RequirementDerivation,
    TechnicalRequirementProposal,
    read_technical_proposal,
    reciprocal_of,
)
from rotaris_core.requirements.model import (
    FULL_CAPABILITIES,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementType,
)
from rotaris_core.requirements.relations import ReverseRelationKind, build_relation_graph
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementDraft,
    SourceRead,
)
from rotaris_core.requirements.writeback import RequirementWriteBack

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.requirements.sources.base import RequirementArtifact

pytestmark = pytest.mark.unit

ORIGIN = "SWR-3411"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


def origin_requirement(req_id: str = ORIGIN) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Execution can derive technical requirements",
        description="A run may propose a lasting technical obligation.",
        source_id="memory",
        source_path=f"specs/{req_id}.md",
    )


class MemorySource(BaseRequirementSource):
    """A writable requirement store in memory — the project's own write path, faked."""

    capabilities = FULL_CAPABILITIES

    def __init__(
        self,
        *requirements: CanonicalRequirement,
        source_id: str = "memory",
        next_id: str = "SWR-3417",
    ) -> None:
        self._id = source_id
        self._next_id = next_id
        self._by_id = {one.req_id: one for one in requirements}
        self._revision = 1
        self.drafts: list[RequirementDraft] = []

    @property
    def source_id(self) -> str:
        return self._id

    def discover(self) -> Sequence[RequirementArtifact]:
        return ()

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self._id,
            revision=str(self._revision),
            requirements=tuple(self._by_id.values()),
        )

    def revision(self) -> str:
        return str(self._revision)

    def create(self, draft: RequirementDraft) -> CanonicalRequirement:
        self.drafts.append(draft)
        created = CanonicalRequirement(
            req_id=draft.req_id or self._next_id,
            title=draft.title,
            description=draft.description,
            lifecycle=draft.lifecycle,
            req_type=draft.req_type,
            parent=draft.parent,
            relations=draft.relations,
            source_id=self._id,
            source_path=f"specs/{draft.req_id or self._next_id}.md",
        )
        self._by_id[created.req_id] = created
        self._revision += 1
        return created

    @property
    def requirements(self) -> tuple[CanonicalRequirement, ...]:
        return tuple(self._by_id.values())


class ForgetfulSource(MemorySource):
    """A source that drops the ``derived-from`` relation on the way in."""

    def create(self, draft: RequirementDraft) -> CanonicalRequirement:
        return super().create(draft.model_copy(update={"relations": ()}))


class ReadOnlySource(BaseRequirementSource):
    """A source that declares nothing but ``read`` (SWR-3105)."""

    def __init__(self, *requirements: CanonicalRequirement, source_id: str = "readonly") -> None:
        self._id = source_id
        self._by_id = {one.req_id: one for one in requirements}

    @property
    def source_id(self) -> str:
        return self._id

    def discover(self) -> Sequence[RequirementArtifact]:
        return ()

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self._id,
            revision="1",
            requirements=tuple(self._by_id.values()),
        )

    def revision(self) -> str:
        return "1"

    def locate(self, req_id: str) -> str | None:
        return f"specs/{req_id}.md"


class ScriptedProposer:
    """A model that answers with fixed payloads and records what it was asked."""

    def __init__(self, *payloads: Mapping[str, object]) -> None:
        self.payloads = payloads
        self.requests: list[DerivationRequest] = []

    def propose(self, request: DerivationRequest) -> Sequence[Mapping[str, object]]:
        self.requests.append(request)
        return self.payloads


def proposal(**changes: object) -> TechnicalRequirementProposal:
    data: dict[str, object] = {
        "origin": ORIGIN,
        "title": "Deterministic merge journal",
        "description": "Every integration writes a replayable journal entry.",
        "rationale": "the format outlives the unit that introduced it",
        "run_id": "run-1",
        "proposed_at": AT,
    }
    data.update(changes)
    return TechnicalRequirementProposal.model_validate(data)


# -- what a technical requirement is, and is not ---------------------------


@verifies(SWR.SWR_3411)
def test_a_unit_and_a_technical_requirement_are_stated_to_be_different_things() -> None:
    assert DerivedArtifactKind.TECHNICAL_REQUIREMENT.permanent
    assert not DerivedArtifactKind.UNIT.permanent
    assert "permanent" in DerivedArtifactKind.TECHNICAL_REQUIREMENT.explanation
    assert "disappears" in DerivedArtifactKind.UNIT.explanation
    assert proposal().kind is DerivedArtifactKind.TECHNICAL_REQUIREMENT
    assert "permanent" in proposal().message


@verifies(SWR.SWR_3411)
def test_a_proposal_without_an_origin_cannot_exist() -> None:
    with pytest.raises(DerivationError, match="names its origin"):
        TechnicalRequirementProposal(origin="  ", title="Something")


@verifies(SWR.SWR_3411)
def test_the_draft_is_technical_and_names_its_origin() -> None:
    draft = proposal().to_draft()

    assert draft.req_type is RequirementType.TECHNICAL
    assert draft.relations == (Relation(kind=RelationKind.DERIVED_FROM, target=ORIGIN),)
    # The id is the store's to issue (SWR-3112), never the model's.
    assert draft.req_id is None


# -- reading a model payload ------------------------------------------------


@verifies(SWR.SWR_3411)
def test_a_payload_describing_a_unit_is_never_turned_into_a_requirement() -> None:
    intake = read_technical_proposal(
        {"title": "Split the store work", "unit_id": "swr-3411-store", "depends_on": ["impl"]},
        origin=ORIGIN,
    )

    assert not intake.accepted
    assert intake.proposal is None
    assert set(intake.unit_fields) == {"unit_id", "depends_on"}
    assert "never converted into a requirement" in intake.reason


@verifies(SWR.SWR_3411)
def test_every_unit_shaped_key_refuses_the_proposal() -> None:
    for field in UNIT_ONLY_FIELDS:
        intake = read_technical_proposal({"title": "T", field: "x"}, origin=ORIGIN)
        assert not intake.accepted, field


@verifies(SWR.SWR_3411)
def test_reserved_keys_are_stripped_and_the_origin_is_the_callers() -> None:
    intake = read_technical_proposal(
        {
            "title": "Deterministic merge journal",
            "req_id": "SWR-9999",
            "type": "product",
            "lifecycle": "approved",
            "origin": "SWR-0001",
            "nonsense": True,
        },
        origin=ORIGIN,
        run_id="run-9",
    )

    assert intake.accepted
    assert intake.proposal is not None
    assert intake.proposal.origin == ORIGIN, "a model cannot re-parent its own proposal"
    assert intake.proposal.run_id == "run-9"
    assert set(intake.stripped) == {"req_id", "type", "lifecycle", "origin"}
    assert intake.ignored == ("nonsense",)


@verifies(SWR.SWR_3411)
def test_an_unreadable_payload_is_reported_not_raised() -> None:
    intake = read_technical_proposal({"title": "   "}, origin=ORIGIN)

    assert not intake.accepted
    assert "not a usable proposal" in intake.reason


# -- creating it through the project's own write path ----------------------


@verifies(SWR.SWR_3411)
def test_a_proposal_is_created_and_the_origin_gains_the_reciprocal_link() -> None:
    source = MemorySource(origin_requirement())
    derivation = RequirementDerivation(RequirementWriteBack([source]), source_id="memory")

    outcome = derivation.derive(proposal())

    assert outcome.accepted
    created = outcome.created
    assert created is not None
    assert created.req_id == "SWR-3417"
    assert created.permanent
    assert created.link.origin == ORIGIN
    assert created.link.derived == "SWR-3417"

    # The origin's side is computed from the new requirement's derived-from edge
    # (SWR-3109) — one fact, one place, so the two can never disagree.
    graph = build_relation_graph(source.requirements)
    assert graph.sources(ORIGIN, ReverseRelationKind.DERIVED_REQUIREMENTS) == ("SWR-3417",)
    assert graph.targets("SWR-3417", RelationKind.DERIVED_FROM) == (ORIGIN,)


@verifies(SWR.SWR_3411)
def test_the_created_requirement_passes_the_stores_own_technical_check() -> None:
    source = MemorySource(origin_requirement())
    RequirementDerivation(RequirementWriteBack([source]), source_id="memory").derive(proposal())

    created = next(one for one in source.requirements if one.req_id == "SWR-3417")
    assert created.req_type is RequirementType.TECHNICAL
    assert created.related_ids(RelationKind.DERIVED_FROM) == (ORIGIN,)


@verifies(SWR.SWR_3411)
def test_a_creation_that_loses_the_link_is_refused_rather_than_reported_as_derived() -> None:
    source = ForgetfulSource(origin_requirement())
    derivation = RequirementDerivation(RequirementWriteBack([source]), source_id="memory")

    outcome = derivation.derive(proposal())

    assert outcome.refused
    assert outcome.refusal_kind is DerivationRefusalKind.NO_RECIPROCAL_LINK
    assert ORIGIN in outcome.reason
    assert not outcome.run_failed


@verifies(SWR.SWR_3411)
def test_a_read_only_source_is_refused_with_its_reason_and_the_run_is_not_failed() -> None:
    source = ReadOnlySource(origin_requirement())
    derivation = RequirementDerivation(RequirementWriteBack([source]), source_id="readonly")

    outcome = derivation.derive(proposal())

    assert outcome.refused
    assert outcome.refusal_kind is DerivationRefusalKind.READ_ONLY_SOURCE
    assert outcome.refusal is not None
    assert "does not support" in outcome.reason
    assert "readonly" in outcome.reason
    assert not outcome.run_failed
    assert "not created" in outcome.message


@verifies(SWR.SWR_3411)
def test_a_write_that_explodes_is_a_refusal_not_a_failed_run() -> None:
    class Exploding(MemorySource):
        def create(self, draft: RequirementDraft) -> CanonicalRequirement:
            raise OSError("the store is on a full disk")

    derivation = RequirementDerivation(
        RequirementWriteBack([Exploding(origin_requirement())]),
        source_id="memory",
    )

    outcome = derivation.derive(proposal())

    assert outcome.refusal_kind is DerivationRefusalKind.WRITE_FAILED
    assert "full disk" in outcome.reason
    assert not outcome.run_failed


@verifies(SWR.SWR_3411)
def test_an_outcome_is_either_created_or_refused_never_both() -> None:
    with pytest.raises(DerivationError, match="either created a requirement or was refused"):
        from rotaris_core.requirements.execution.derivation import DerivationOutcome

        DerivationOutcome(req_id=ORIGIN)


# -- the model seam ---------------------------------------------------------


@verifies(SWR.SWR_3411)
def test_the_proposer_is_asked_with_what_the_run_produced() -> None:
    proposer = ScriptedProposer({"title": "Deterministic merge journal"})
    derivation = RequirementDerivation(
        RequirementWriteBack([MemorySource(origin_requirement())]),
        source_id="memory",
        model=proposer,
        persona="coding-agent",
    )

    proposals = derivation.propose(
        DerivationRequest(
            req_id=ORIGIN,
            run_id="run-1",
            unit_id="unit-1",
            changed_files=("src/rotaris_core/requirements/execution/integration.py",),
            agent_summary="added a replayable journal",
        ),
    )

    assert len(proposals) == 1
    assert proposals[0].origin == ORIGIN
    assert proposals[0].run_id == "run-1"
    assert proposer.requests[0].persona == "coding-agent"
    assert proposer.requests[0].changed_files


@verifies(SWR.SWR_3411)
def test_no_proposal_is_the_normal_answer_and_costs_nothing() -> None:
    derivation = RequirementDerivation(
        RequirementWriteBack([MemorySource(origin_requirement())]),
        source_id="memory",
    )

    assert derivation.propose(DerivationRequest(req_id=ORIGIN)) == ()


@verifies(SWR.SWR_3411)
def test_a_failing_proposer_never_fails_a_finished_run() -> None:
    class Exploding:
        def propose(self, request: DerivationRequest) -> Sequence[Mapping[str, object]]:
            raise RuntimeError("the provider is down")

    derivation = RequirementDerivation(
        RequirementWriteBack([MemorySource(origin_requirement())]),
        source_id="memory",
        model=Exploding(),
    )

    assert derivation.propose(DerivationRequest(req_id=ORIGIN)) == ()


@verifies(SWR.SWR_3411)
def test_a_unit_payload_from_the_model_produces_no_proposal() -> None:
    derivation = RequirementDerivation(
        RequirementWriteBack([MemorySource(origin_requirement())]),
        source_id="memory",
        model=ScriptedProposer({"title": "Split it", "unit_id": "swr-3411-impl"}),
    )

    assert derivation.propose(DerivationRequest(req_id=ORIGIN)) == ()


@verifies(SWR.SWR_3411)
def test_reciprocal_of_answers_none_when_the_origin_is_not_named() -> None:
    unrelated = CanonicalRequirement(req_id="SWR-3417", title="Something else")

    assert reciprocal_of(unrelated, origin=ORIGIN) is None
