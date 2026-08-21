"""Productive use: a user asks what a requirement owes before anyone claims it is done,
and gets a different answer for a product requirement, a technical one and an epic —
without a single check having run.
Expected outcome: the source's own `trace`/`test` flags decide the implementation and
test obligations, so a `trace: optional` requirement never reports a missing
implementation; a technical requirement owes implementation and test but no integration;
an epic asserts nothing itself and derives everything from its children, naming them;
and the whole answer is plain data that round-trips."""

from __future__ import annotations

import pytest

from rotaris_core.config.schema import RequirementEvidenceConfig, RequirementObligationConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceState,
    project_evidence,
)
from rotaris_core.requirements.delivery.obligations import (
    DEFAULT_OBLIGATION_POLICY,
    EVIDENCE_KINDS,
    EvidenceKind,
    EvidenceObligation,
    ObligationLevel,
    ObligationOrigin,
    ObligationPolicy,
    ObligationSet,
    RequirementObligations,
    parse_obligation_level,
    resolve_obligations,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementType

pytestmark = pytest.mark.unit


def product(req_id: str = "SWR-3206", **changes: object) -> CanonicalRequirement:
    """A product requirement whose source demands both a trace and a test."""
    fields: dict[str, object] = {"req_id": req_id, "title": "Evidence obligations"}
    fields.update(changes)
    return CanonicalRequirement.model_validate(fields)


# -- the source's own flags (SWR-3206) -------------------------------------


@verifies(SWR.SWR_3206)
def test_the_source_flags_map_straight_onto_the_two_obligations_they_describe() -> None:
    """`trace: required` / `test: required` are the answer, not a hint about it."""
    strict = resolve_obligations(product())
    assert strict.level_of(EvidenceKind.IMPLEMENTATION) is ObligationLevel.REQUIRED
    assert strict.level_of(EvidenceKind.TEST) is ObligationLevel.REQUIRED

    lenient = resolve_obligations(product(trace_required=False, test_required=False))
    assert lenient.level_of(EvidenceKind.IMPLEMENTATION) is ObligationLevel.OPTIONAL
    assert lenient.level_of(EvidenceKind.TEST) is ObligationLevel.OPTIONAL
    for kind in (EvidenceKind.IMPLEMENTATION, EvidenceKind.TEST):
        assert lenient.obligation_for(kind).origin is ObligationOrigin.SOURCE_FLAG
        assert not lenient.requires(kind)


@verifies(SWR.SWR_3206)
def test_a_trace_optional_requirement_never_reports_a_missing_implementation() -> None:
    """The acceptance criterion, end to end: no obligation, therefore no gap."""
    lenient = product(trace_required=False)
    projection = project_evidence(
        resolve_obligations(lenient),
        EvidenceInputs(req_id=lenient.req_id),
    )
    assert projection.for_kind(EvidenceKind.IMPLEMENTATION).state is not EvidenceState.MISSING
    assert EvidenceKind.IMPLEMENTATION not in {o.kind for o in projection.blocking}
    # The test obligation the source *did* demand still reports its gap.
    assert projection.for_kind(EvidenceKind.TEST).state is EvidenceState.MISSING


@verifies(SWR.SWR_3206)
def test_a_policy_that_ignores_source_flags_pins_every_requirement_to_its_type() -> None:
    """The diagnostic setting really does stop reading the front matter."""
    pinned = ObligationPolicy(follow_source_flags=False)
    resolved = resolve_obligations(product(trace_required=False), policy=pinned)
    assert resolved.level_of(EvidenceKind.IMPLEMENTATION) is ObligationLevel.REQUIRED
    assert resolved.obligation_for(EvidenceKind.IMPLEMENTATION).origin is (
        ObligationOrigin.TYPE_DEFAULT
    )


@verifies(SWR.SWR_3206)
def test_a_source_flag_cannot_resurrect_a_kind_the_type_declares_not_applicable() -> None:
    """A type that has no such evidence outranks one artefact's front matter."""
    policy = ObligationPolicy(
        product=ObligationSet(implementation=ObligationLevel.NOT_APPLICABLE),
    )
    resolved = resolve_obligations(product(trace_required=True), policy=policy)
    assert resolved.level_of(EvidenceKind.IMPLEMENTATION) is ObligationLevel.NOT_APPLICABLE
    assert not resolved.applies(EvidenceKind.IMPLEMENTATION)


# -- per requirement type (SWR-3206) ---------------------------------------


@verifies(SWR.SWR_3206)
def test_a_technical_requirement_owes_implementation_and_test_but_no_integration() -> None:
    """A technical necessity is still built and still covered; it integrates with nothing."""
    technical = resolve_obligations(product(req_type=RequirementType.TECHNICAL))

    assert technical.req_type is RequirementType.TECHNICAL
    assert technical.requires(EvidenceKind.IMPLEMENTATION)
    assert technical.requires(EvidenceKind.TEST)
    assert technical.level_of(EvidenceKind.INTEGRATION) is ObligationLevel.NOT_APPLICABLE
    assert EvidenceKind.INTEGRATION not in technical.applicable_kinds
    # A product requirement of the same shape keeps integration in play.
    assert resolve_obligations(product()).level_of(EvidenceKind.INTEGRATION) is (
        ObligationLevel.OPTIONAL
    )


@verifies(SWR.SWR_3206, SWR.SWR_3212)
def test_an_epic_derives_its_obligations_from_its_children_and_names_them() -> None:
    """An epic asserts nothing itself, so it is never reported as untraced."""
    child_a = resolve_obligations(product("SWR-3201"))
    child_b = resolve_obligations(product("SWR-3202", trace_required=False))
    epic = resolve_obligations(product("SWR-3200"), children=(child_a, child_b))

    assert epic.is_epic
    implementation = epic.obligation_for(EvidenceKind.IMPLEMENTATION)
    assert implementation.origin is ObligationOrigin.DERIVED_FROM_CHILDREN
    # The strongest a child carries wins: SWR-3201 requires it, SWR-3202 does not.
    assert implementation.level is ObligationLevel.REQUIRED
    assert implementation.derived_from == ("SWR-3201", "SWR-3202")
    assert all(
        obligation.origin is ObligationOrigin.DERIVED_FROM_CHILDREN
        for obligation in epic.obligations
    )


@verifies(SWR.SWR_3206)
def test_an_epic_whose_children_owe_nothing_owes_nothing() -> None:
    """Derivation, not assertion: nothing underneath means nothing above."""
    child = resolve_obligations(
        product("SWR-3201", trace_required=False, test_required=False),
        policy=ObligationPolicy(
            product=ObligationSet(
                implementation=ObligationLevel.NOT_APPLICABLE,
                test=ObligationLevel.NOT_APPLICABLE,
                verification=ObligationLevel.NOT_APPLICABLE,
                execution=ObligationLevel.NOT_APPLICABLE,
                integration=ObligationLevel.NOT_APPLICABLE,
            ),
        ),
    )
    epic = resolve_obligations(product("SWR-3200"), children=(child,))
    assert epic.required_kinds == ()
    assert epic.applicable_kinds == ()
    assert epic.obligation_for(EvidenceKind.TEST).derived_from == ()


@verifies(SWR.SWR_3206)
def test_an_epic_with_no_children_resolved_yet_still_asserts_nothing() -> None:
    """An epic declared before its children exist is not a pile of gaps."""
    epic = resolve_obligations(product("SWR-3200"), is_epic=True)
    assert epic.is_epic
    assert epic.required_kinds == ()


# -- obligations are data (SWR-3206) ---------------------------------------


@verifies(SWR.SWR_3206)
def test_obligations_are_complete_ordered_data_that_round_trips() -> None:
    """Readable without running a check, and persistable without losing anything."""
    resolved = resolve_obligations(product())

    assert tuple(o.kind for o in resolved.obligations) == EVIDENCE_KINDS
    restored = RequirementObligations.model_validate(resolved.model_dump(mode="json"))
    assert restored == resolved
    assert resolved.obligation_for(EvidenceKind.TEST).detail.startswith("Test: required")


@verifies(SWR.SWR_3206)
def test_an_incomplete_obligation_set_is_refused_rather_than_half_answered() -> None:
    """A consumer never has to tell "not resolved" from "not applicable"."""
    complete = resolve_obligations(product())
    with pytest.raises(ValueError, match="one per kind"):
        RequirementObligations(req_id="SWR-3206", obligations=complete.obligations[:2])


@verifies(SWR.SWR_3206)
def test_only_a_derived_obligation_may_name_children() -> None:
    """Provenance stays honest: a type default did not come from anywhere else."""
    with pytest.raises(ValueError, match="only a derived obligation"):
        EvidenceObligation(
            kind=EvidenceKind.IMPLEMENTATION,
            level=ObligationLevel.REQUIRED,
            origin=ObligationOrigin.TYPE_DEFAULT,
            derived_from=("SWR-1",),
        )


# -- the configuration seam (SWR-3117) -------------------------------------


@verifies(SWR.SWR_3206)
def test_the_policy_reads_the_configuration_block_without_importing_its_model() -> None:
    """A workspace that overrides one field still gets a complete policy."""
    configured = RequirementEvidenceConfig(
        follow_source_flags=False,
        product=RequirementObligationConfig(execution="required"),
    )
    policy = ObligationPolicy.read(configured)

    assert policy.follow_source_flags is False
    assert policy.product.level_of(EvidenceKind.EXECUTION) is ObligationLevel.REQUIRED
    # The blocks the workspace did not touch keep the shipped defaults.
    assert policy.technical.level_of(EvidenceKind.INTEGRATION) is ObligationLevel.NOT_APPLICABLE
    assert policy.epic == DEFAULT_OBLIGATION_POLICY.epic


@verifies(SWR.SWR_3206)
def test_a_missing_or_unreadable_configuration_block_keeps_the_shipped_defaults() -> None:
    """One unparsable value degrades one field, never the whole policy."""
    assert ObligationPolicy.read(None) == DEFAULT_OBLIGATION_POLICY

    class Garbled:
        implementation = "definitely-not-a-level"
        test = "optional"

    partial = ObligationSet.read(Garbled())
    assert partial.implementation is ObligationLevel.REQUIRED
    assert partial.test is ObligationLevel.OPTIONAL


@verifies(SWR.SWR_3206)
def test_levels_are_read_tolerantly_and_never_invented() -> None:
    """`Not Applicable`, `not_applicable` and `n/a` are one level; `soon` is none."""
    for spelling in ("not-applicable", "Not Applicable", "NOT_APPLICABLE", "n/a"):
        assert parse_obligation_level(spelling) is ObligationLevel.NOT_APPLICABLE
    assert parse_obligation_level("required") is ObligationLevel.REQUIRED
    assert parse_obligation_level("soon") is None
    assert parse_obligation_level(None) is None
    assert parse_obligation_level(3) is None
