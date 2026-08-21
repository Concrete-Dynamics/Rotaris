"""What a requirement owes before it may be considered delivered (SWR-3206).

Counting ``@traces`` annotations measures annotation, not delivery. What makes a
requirement trustworthy is that the evidence it is *expected* to have exists and
is current — and which evidence is expected differs between a product
requirement, a technical one and an epic.

This module answers only the first half of that: **which obligations apply**. It
never looks at whether they are met (that is
:mod:`~rotaris_core.requirements.delivery.evidence`), and it never touches a
repository — the resolver is a pure function of a
:class:`~rotaris_core.requirements.model.CanonicalRequirement`, a policy and, for
an epic, its children's already-resolved obligations.

Three decisions are load-bearing:

- **Obligations are data.** :class:`RequirementObligations` is a value a board
  can render, a store can persist and a test can compare, so "what does this
  requirement owe" is answerable without running a check (SWR-3206).
- **The source's own flags come first.** ReqToCode's ``trace: required`` /
  ``test: required`` map straight onto the implementation and test obligations,
  so a ``trace: optional`` requirement never reports a missing implementation.
  The per-type policy block (SWR-3117) decides everything the source is silent
  about, and it alone may declare a kind *not applicable* — "this kind of
  requirement has no such evidence" is a statement about the type, not about one
  artefact's front matter.
- **An epic asserts nothing itself.** Its obligations are the strongest its
  children carry, and :attr:`EvidenceObligation.derived_from` names them, so an
  epic is never reported as untraced merely for being an epic (SWR-3212).
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import RequirementType

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "DEFAULT_OBLIGATION_POLICY",
    "EVIDENCE_KINDS",
    "EvidenceKind",
    "EvidenceObligation",
    "ObligationLevel",
    "ObligationOrigin",
    "ObligationPolicy",
    "ObligationSet",
    "RequirementObligations",
    "parse_obligation_level",
    "resolve_obligations",
]


@traces(SWR.SWR_3206)
class EvidenceKind(StrEnum):
    """The five kinds of evidence a requirement can owe (SWR-3206).

    The values are the field names of the configuration block (SWR-3117), so a
    policy read from the config and a policy written by hand cannot drift apart
    on spelling.
    """

    IMPLEMENTATION = "implementation"
    TEST = "test"
    VERIFICATION = "verification"
    EXECUTION = "execution"
    INTEGRATION = "integration"

    @property
    def label(self) -> str:
        """What a user reads — ``Implementation``, not ``implementation``."""
        return self.value.capitalize()


#: Every kind, in the order a board shows them: what was built, what covers it,
#: what proved it, what ran it, what integrated it.
EVIDENCE_KINDS: tuple[EvidenceKind, ...] = tuple(EvidenceKind)


@traces(SWR.SWR_3206)
class ObligationLevel(StrEnum):
    """How strongly one kind of evidence is owed (SWR-3206)."""

    REQUIRED = "required"
    OPTIONAL = "optional"
    #: The kind does not exist for this requirement — an epic's own
    #: implementation, a technical requirement's integration. Distinct from
    #: ``optional``: nothing is ever reported as absent for it.
    NOT_APPLICABLE = "not-applicable"

    @property
    def applicable(self) -> bool:
        """Whether this kind of evidence is expected at all."""
        return self is not ObligationLevel.NOT_APPLICABLE

    @property
    def rank(self) -> int:
        """``0`` … ``2``, so "the strongest of these" is expressible."""
        return _LEVEL_RANK[self]


_LEVEL_RANK: dict[ObligationLevel, int] = {
    ObligationLevel.NOT_APPLICABLE: 0,
    ObligationLevel.OPTIONAL: 1,
    ObligationLevel.REQUIRED: 2,
}

#: Spellings accepted from a configuration file or a hand-written policy beyond
#: the canonical token.
_LEVEL_ALIASES: dict[str, ObligationLevel] = {
    "not-applicable": ObligationLevel.NOT_APPLICABLE,
    "notapplicable": ObligationLevel.NOT_APPLICABLE,
    "n/a": ObligationLevel.NOT_APPLICABLE,
    "na": ObligationLevel.NOT_APPLICABLE,
    "none": ObligationLevel.NOT_APPLICABLE,
    "mandatory": ObligationLevel.REQUIRED,
}


@traces(SWR.SWR_3206)
def parse_obligation_level(raw: object) -> ObligationLevel | None:
    """The level *raw* names, or ``None`` when it names none.

    Tolerant about spelling — ``Not Applicable``, ``not_applicable`` and ``n/a``
    are one level — and strict about membership: an unrecognised value is
    ``None`` here rather than a silently invented obligation.
    """
    if isinstance(raw, ObligationLevel):
        return raw
    if not isinstance(raw, str):
        return None
    token = raw.strip().casefold().replace("_", "-").replace(" ", "-")
    if not token:
        return None
    try:
        return ObligationLevel(token)
    except ValueError:
        return _LEVEL_ALIASES.get(token)


@traces(SWR.SWR_3206, SWR.SWR_3117)
class ObligationSet(BaseModel):
    """The five levels one *kind* of requirement carries by default.

    The defaults are the configuration's (SWR-3117): implementation, test and
    verification are owed; execution and integration are optional, because a
    requirement delivered by hand is still delivered and a single-unit
    requirement never integrates with anything.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    implementation: ObligationLevel = ObligationLevel.REQUIRED
    test: ObligationLevel = ObligationLevel.REQUIRED
    verification: ObligationLevel = ObligationLevel.REQUIRED
    execution: ObligationLevel = ObligationLevel.OPTIONAL
    integration: ObligationLevel = ObligationLevel.OPTIONAL

    def as_mapping(self) -> dict[EvidenceKind, ObligationLevel]:
        """The set keyed by kind, written out rather than reflected over."""
        return {
            EvidenceKind.IMPLEMENTATION: self.implementation,
            EvidenceKind.TEST: self.test,
            EvidenceKind.VERIFICATION: self.verification,
            EvidenceKind.EXECUTION: self.execution,
            EvidenceKind.INTEGRATION: self.integration,
        }

    def level_of(self, kind: EvidenceKind) -> ObligationLevel:
        """The level this kind of requirement carries for *kind*."""
        return self.as_mapping()[kind]

    @classmethod
    def read(cls, block: object) -> Self:
        """Read a configuration block structurally, keeping unknown values out.

        Structural rather than nominal for the same reason
        :class:`~rotaris_core.requirements.delivery.satisfied.DeliverySnapshot`
        is: the configuration schema owns its model, this module owns the
        domain, and neither has to import the other to agree. A field this build
        does not recognise, or one carrying a value it cannot parse, keeps the
        default instead of degrading the whole policy.
        """
        values: dict[str, ObligationLevel] = {}
        for kind in EVIDENCE_KINDS:
            level = parse_obligation_level(getattr(block, str(kind), None))
            if level is not None:
                values[str(kind)] = level
        return cls(**values)


def _technical_default() -> ObligationSet:
    """Implementation and test, but nothing user-flow-shaped (SWR-3206)."""
    return ObligationSet(integration=ObligationLevel.NOT_APPLICABLE)


def _epic_default() -> ObligationSet:
    """An epic asserts no evidence of its own; its children carry it."""
    return ObligationSet(
        implementation=ObligationLevel.NOT_APPLICABLE,
        test=ObligationLevel.NOT_APPLICABLE,
        verification=ObligationLevel.NOT_APPLICABLE,
        execution=ObligationLevel.NOT_APPLICABLE,
        integration=ObligationLevel.NOT_APPLICABLE,
    )


@traces(SWR.SWR_3206, SWR.SWR_3117)
class ObligationPolicy(BaseModel):
    """Which obligations each requirement type carries, and whose word wins.

    The workspace-configurable half of SWR-3206. :meth:`read` accepts the
    ``requirements.evidence`` configuration block (SWR-3117) structurally, so a
    workspace that overrides one field of one type still gets a complete policy.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Take the source's own ``trace``/``test`` flags for the implementation and
    #: test obligations. False pins every requirement to its type's block, which
    #: is a diagnostic setting rather than a normal one.
    follow_source_flags: bool = True
    product: ObligationSet = Field(default_factory=ObligationSet)
    technical: ObligationSet = Field(default_factory=_technical_default)
    epic: ObligationSet = Field(default_factory=_epic_default)

    def set_for(self, req_type: RequirementType, *, is_epic: bool = False) -> ObligationSet:
        """The block that applies to a requirement of this type."""
        if is_epic:
            return self.epic
        if req_type is RequirementType.TECHNICAL:
            return self.technical
        return self.product

    @classmethod
    def read(cls, evidence_config: object) -> Self:
        """Read ``requirements.evidence`` (SWR-3117) without importing its model."""
        follow = getattr(evidence_config, "follow_source_flags", None)
        return cls(
            follow_source_flags=follow if isinstance(follow, bool) else True,
            product=ObligationSet.read(getattr(evidence_config, "product", None)),
            technical=_read_or(getattr(evidence_config, "technical", None), _technical_default),
            epic=_read_or(getattr(evidence_config, "epic", None), _epic_default),
        )


def _read_or(block: object, fallback: Callable[[], ObligationSet]) -> ObligationSet:
    """*block* read structurally, or the built-in default when it is absent.

    ``ObligationSet.read(None)`` would answer with the *product* defaults, which
    is the wrong answer for the technical and epic blocks: a missing block means
    "this build has nothing configured", not "treat an epic like a product
    requirement".
    """
    return fallback() if block is None else ObligationSet.read(block)


#: The policy of a workspace that configured nothing.
DEFAULT_OBLIGATION_POLICY = ObligationPolicy()


@traces(SWR.SWR_3206)
class ObligationOrigin(StrEnum):
    """Where an obligation's level came from — the audit half of "it is data"."""

    #: The per-type policy block (SWR-3117).
    TYPE_DEFAULT = "type-default"
    #: The requirement source's own ``trace``/``test`` flag.
    SOURCE_FLAG = "source-flag"
    #: An epic, whose obligations are its children's (SWR-3212).
    DERIVED_FROM_CHILDREN = "derived-from-children"


@traces(SWR.SWR_3206)
class EvidenceObligation(BaseModel):
    """One kind of evidence, how strongly it is owed, and why."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: EvidenceKind
    level: ObligationLevel
    origin: ObligationOrigin = ObligationOrigin.TYPE_DEFAULT
    #: For a derived obligation: the children that carry it, in id order. Empty
    #: for every other origin, and for a derived obligation no child owes.
    derived_from: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _derivation_names_its_source(self) -> Self:
        if self.derived_from and self.origin is not ObligationOrigin.DERIVED_FROM_CHILDREN:
            raise ValueError(
                f"{self.kind}: only a derived obligation names children, {self.origin} does not",
            )
        return self

    @property
    def required(self) -> bool:
        """Whether missing this evidence is a gap rather than an absence."""
        return self.level is ObligationLevel.REQUIRED

    @property
    def applicable(self) -> bool:
        """Whether this kind of evidence is expected at all."""
        return self.level.applicable

    @property
    def detail(self) -> str:
        """One line: the kind, its level and where the level came from."""
        source = f" ({', '.join(self.derived_from)})" if self.derived_from else ""
        return f"{self.kind.label}: {self.level} per {self.origin}{source}"


@traces(SWR.SWR_3206)
class RequirementObligations(BaseModel):
    """Everything one requirement owes — one obligation per kind, always.

    Complete by construction: a consumer never has to distinguish "this kind was
    not resolved" from "this kind is not applicable", because only the second is
    representable.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    req_type: RequirementType = RequirementType.PRODUCT
    is_epic: bool = False
    obligations: tuple[EvidenceObligation, ...] = ()

    @model_validator(mode="after")
    def _one_per_kind_in_order(self) -> Self:
        kinds = tuple(obligation.kind for obligation in self.obligations)
        if kinds != EVIDENCE_KINDS:
            raise ValueError(
                f"{self.req_id}: obligations are one per kind in {EVIDENCE_KINDS} order,"
                f" got {kinds}",
            )
        return self

    def obligation_for(self, kind: EvidenceKind) -> EvidenceObligation:
        """The obligation for *kind* — never ``None``, every kind is present."""
        return self.obligations[EVIDENCE_KINDS.index(kind)]

    def level_of(self, kind: EvidenceKind) -> ObligationLevel:
        """How strongly *kind* is owed."""
        return self.obligation_for(kind).level

    def requires(self, kind: EvidenceKind) -> bool:
        """Whether *kind* is required — the question a gap report asks."""
        return self.obligation_for(kind).required

    def applies(self, kind: EvidenceKind) -> bool:
        """Whether *kind* is expected at all."""
        return self.obligation_for(kind).applicable

    @property
    def required_kinds(self) -> tuple[EvidenceKind, ...]:
        """The kinds whose absence is a gap, in board order."""
        return tuple(o.kind for o in self.obligations if o.required)

    @property
    def applicable_kinds(self) -> tuple[EvidenceKind, ...]:
        """The kinds that are expected at all, in board order."""
        return tuple(o.kind for o in self.obligations if o.applicable)


def _source_flag(requirement: CanonicalRequirement, kind: EvidenceKind) -> bool | None:
    """The source's own flag for *kind*, or ``None`` when the source has none."""
    if kind is EvidenceKind.IMPLEMENTATION:
        return requirement.trace_required
    if kind is EvidenceKind.TEST:
        return requirement.test_required
    return None


def _derived(kind: EvidenceKind, children: Sequence[RequirementObligations]) -> EvidenceObligation:
    """The epic's obligation for *kind*: the strongest any child carries."""
    level = ObligationLevel.NOT_APPLICABLE
    carriers: list[str] = []
    for child in children:
        child_level = child.level_of(kind)
        if child_level.rank > level.rank:
            level = child_level
        if child_level.applicable:
            carriers.append(child.req_id)
    return EvidenceObligation(
        kind=kind,
        level=level,
        origin=ObligationOrigin.DERIVED_FROM_CHILDREN,
        derived_from=tuple(sorted(carriers)),
    )


@traces(SWR.SWR_3206)
def resolve_obligations(
    requirement: CanonicalRequirement,
    *,
    policy: ObligationPolicy = DEFAULT_OBLIGATION_POLICY,
    children: Sequence[RequirementObligations] = (),
    is_epic: bool | None = None,
) -> RequirementObligations:
    """What *requirement* owes — pure, and readable without running any check.

    An epic (``children`` non-empty, or ``is_epic=True``) derives every
    obligation from its children and asserts none itself. Everything else starts
    from its type's policy block, and — when the policy follows source flags —
    lets the source's own ``trace``/``test`` flags set the implementation and
    test levels directly. A flag can move a kind between *required* and
    *optional*; it can never resurrect a kind the type declares not applicable,
    because "an epic has no implementation of its own" is a statement about the
    type that one artefact's front matter must not override.
    """
    epic = bool(children) if is_epic is None else is_epic
    if epic:
        return RequirementObligations(
            req_id=requirement.req_id,
            req_type=requirement.req_type,
            is_epic=True,
            obligations=tuple(_derived(kind, children) for kind in EVIDENCE_KINDS),
        )

    block = policy.set_for(requirement.req_type)
    resolved: list[EvidenceObligation] = []
    for kind in EVIDENCE_KINDS:
        level = block.level_of(kind)
        origin = ObligationOrigin.TYPE_DEFAULT
        flag = _source_flag(requirement, kind) if policy.follow_source_flags else None
        if flag is not None and level.applicable:
            flagged = ObligationLevel.REQUIRED if flag else ObligationLevel.OPTIONAL
            if flagged is not level:
                level, origin = flagged, ObligationOrigin.SOURCE_FLAG
        resolved.append(EvidenceObligation(kind=kind, level=level, origin=origin))
    return RequirementObligations(
        req_id=requirement.req_id,
        req_type=requirement.req_type,
        is_epic=False,
        obligations=tuple(resolved),
    )
