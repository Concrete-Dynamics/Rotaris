"""Technical requirements a run discovers it needs (SWR-3411).

Occasionally an implementation creates a genuine, lasting technical obligation
that no product requirement covers — a deterministic merge journal, a migration
format, a compatibility guarantee. That is a *requirement*, not a work split, and
confusing the two loses it the moment the unit finishes:

```text
execution unit          a work split. Rotaris' own. Discarded when the work is done.
technical requirement   the project's. Permanent. Lives in the project's store.
```

The distinction is carried in the code rather than in a comment:
:class:`DerivedArtifactKind` states it, :attr:`DerivedArtifactKind.permanent`
answers it, and :data:`UNIT_ONLY_FIELDS` makes it impossible for a proposal to
smuggle a unit across the line — a payload naming a unit is refused before a
draft is built.

The path is the project's own write path, not a second one:

```text
proposal ──▶ to_draft() ──▶ validate_draft()  (the store's own check, SWR-2331)
                                  │
                                  ▼
                        RequirementWriteBack.create()  (SWR-3112)
                                  │
              read-only source ───┴──▶ WriteRefusal ─▶ outcome.refused, run NOT failed
                                  │
                                  ▼
                        the created requirement, re-read from the source
                                  │
                                  ▼
                        reciprocal_of() ─▶ the origin's `derives` edge (SWR-3109)
```

Four properties are load-bearing:

- **It passes the origin's own check.** :func:`~rotaris_core.requirements.writeback.validate_draft`
  is ReqToCode's ``check_technical_links`` rule at creation time: a technical
  requirement names the origin that made it necessary. A proposal that does not
  is refused *before* a file exists, rather than after ``reqtocode check`` fails.
- **The reciprocal link is derived, never authored twice.** The origin's
  ``derives`` edge is the reverse of the new requirement's ``derived-from``
  (SWR-3109), so :func:`reciprocal_of` reads it off the created requirement and
  :meth:`RequirementDerivation.derive` refuses a creation that did not produce
  one. Writing the link into two files would let them disagree.
- **A refusal is not a failed run.** A read-only source produces
  :attr:`DerivationOutcome.refused` with the source's own stated reason, and
  :attr:`DerivationOutcome.run_failed` is ``False`` on every path: an obligation
  Rotaris could not record must not throw away the work that discovered it.
- **Units are never converted implicitly.** There is no function here that takes
  an :class:`~rotaris_core.requirements.execution.units.ExecutionUnit`, and a
  payload carrying one is refused with :attr:`DerivationRefusalKind.UNIT_PAYLOAD`.

The judgement half — *should* this run propose one — is a model call behind
:class:`DerivationModel`, so unit tests drive it with a fake and never reach a
network. The persona is configuration's (``requirements.personas.execution``).
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import (
    Relation,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
)
from rotaris_core.requirements.sources.base import (
    RequirementDraft,
    WriteRefusal,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.writeback import CreationError, validate_draft

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.writeback import RequirementWriteBack

__all__ = [
    "UNIT_ONLY_FIELDS",
    "DerivationError",
    "DerivationModel",
    "DerivationOutcome",
    "DerivationRefusalKind",
    "DerivationRequest",
    "DerivedArtifactKind",
    "DerivedRequirement",
    "ProposalIntake",
    "ReciprocalLink",
    "RequirementDerivation",
    "TechnicalRequirementProposal",
    "read_technical_proposal",
    "reciprocal_of",
]


class DerivationError(RuntimeError):
    """A derived technical requirement could not be described coherently."""


@traces(SWR.SWR_3411)
class DerivedArtifactKind(StrEnum):
    """What a run produced beside its code — and how long it lasts.

    The sentence SWR-3411 asks Rotaris to state wherever a proposal is presented,
    as a value rather than as prose in one surface: a unit is a work split and
    disappears, a technical requirement is permanent.
    """

    UNIT = "execution-unit"
    TECHNICAL_REQUIREMENT = "technical-requirement"

    @property
    def permanent(self) -> bool:
        """Whether this artefact outlives the run that produced it."""
        return self is DerivedArtifactKind.TECHNICAL_REQUIREMENT

    @property
    def explanation(self) -> str:
        """The one sentence a surface prints beside the proposal (SWR-3411)."""
        if self.permanent:
            return (
                "a technical requirement is permanent: it joins the project's own"
                " requirement store, is traced and tested like any other, and stays"
                " after this run is forgotten"
            )
        return (
            "an execution unit is a work split: it belongs to Rotaris, it exists to"
            " make one run reviewable, and it disappears when the requirement is done"
        )


#: Keys that describe a *unit* rather than a requirement. A payload carrying one
#: is refused outright rather than stripped: unlike a stray field, its presence
#: means the proposal is about a work split, and quietly creating a permanent
#: requirement from it is exactly SWR-3411's fourth acceptance criterion.
UNIT_ONLY_FIELDS: frozenset[str] = frozenset(
    {
        "unit",
        "unit_id",
        "units",
        "execution_unit",
        "execution_units",
        "depends_on",
        "scope",
        "convert_unit",
    },
)

#: Keys a model may not author on a proposal: the id is the store's to issue
#: (SWR-3112), the type is fixed by what this path *is*, and the lifecycle of a
#: freshly proposed requirement is ``draft`` by definition.
_RESERVED_FIELDS: frozenset[str] = frozenset({"req_id", "req_type", "type", "lifecycle", "status"})


@traces(SWR.SWR_3411)
class TechnicalRequirementProposal(BaseModel):
    """What a run proposes: one lasting technical obligation, and its origin.

    ``origin`` is mandatory and is what makes the proposal legal in the project's
    own store (SWR-2331): a technical requirement with no ``derived-from`` fails
    ``reqtocode check``, and creating one and discovering that afterwards leaves
    the user with a broken store to repair by hand.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The product requirement whose implementation made this necessary.
    origin: str
    title: str
    description: str = ""
    #: Why the obligation is lasting rather than part of this unit's work.
    rationale: str = ""
    #: The epic the new requirement belongs under, when the store has one.
    epic: str | None = None
    #: Where it came from, for the audit trail (SWR-3213).
    run_id: str = ""
    unit_id: str | None = None
    proposed_at: dt.datetime | None = None

    @field_validator("origin", "title")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DerivationError(
                "a derived technical requirement names its origin and carries a title"
                " (SWR-3411, SWR-2331)",
            )
        return cleaned

    @property
    def kind(self) -> DerivedArtifactKind:
        """Always a technical requirement — never a unit (SWR-3411)."""
        return DerivedArtifactKind.TECHNICAL_REQUIREMENT

    @traces(SWR.SWR_3411, SWR.SWR_3112)
    def to_draft(self) -> RequirementDraft:
        """This proposal as the source layer's draft, with the origin as a relation.

        ``req_id`` is deliberately left unset: issuing an id follows the target
        store's own convention (SWR-3112) and is the writer's business, not a
        model's.
        """
        return RequirementDraft(
            title=self.title,
            description=self.description or self.rationale,
            lifecycle=RequirementLifecycle.DRAFT,
            req_type=RequirementType.TECHNICAL,
            parent=self.epic,
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target=self.origin),),
        )

    @property
    def message(self) -> str:
        """One line, with the distinction SWR-3411 asks to be stated."""
        return (
            f"{self.origin}: proposes technical requirement {self.title!r} —"
            f" {self.kind.explanation}"
        )


@traces(SWR.SWR_3411)
class ProposalIntake(BaseModel):
    """One model payload read as a proposal — and what was taken out of it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    proposal: TechnicalRequirementProposal | None = None
    #: Reserved keys the payload tried to set, sorted.
    stripped: tuple[str, ...] = ()
    #: Unit-shaped keys the payload carried; their presence refuses the proposal.
    unit_fields: tuple[str, ...] = ()
    ignored: tuple[str, ...] = ()
    #: Why no proposal came out of the payload, when none did.
    reason: str = ""

    @model_validator(mode="after")
    def _a_rejection_states_why(self) -> Self:
        if self.proposal is None and not self.reason.strip():
            raise DerivationError("an unread proposal states why it could not be read")
        return self

    @property
    def accepted(self) -> bool:
        """Whether a usable proposal came out of the payload."""
        return self.proposal is not None


@traces(SWR.SWR_3411)
def read_technical_proposal(
    payload: Mapping[str, object],
    *,
    origin: str,
    run_id: str = "",
    unit_id: str | None = None,
    at: dt.datetime | None = None,
) -> ProposalIntake:
    """Read *payload* as a technical-requirement proposal, or say why it is not one.

    Never raises: a run that produced a nonsensical proposal must report the
    refusal and keep its work (SWR-3411's third acceptance criterion), not crash
    the flow. The *origin* is supplied by the caller — the requirement whose run
    this is — so a model cannot re-parent its own proposal onto something else.
    """
    stripped: list[str] = []
    unit_fields: list[str] = []
    ignored: list[str] = []
    accepted: dict[str, object] = {}
    fields = TechnicalRequirementProposal.model_fields
    for raw_key, value in payload.items():
        name = str(raw_key).replace("-", "_")
        if name in UNIT_ONLY_FIELDS:
            unit_fields.append(name)
            continue
        if name in _RESERVED_FIELDS or name == "origin":
            stripped.append(name)
            continue
        if name not in fields:
            ignored.append(name)
            continue
        accepted[name] = value
    if unit_fields:
        return ProposalIntake(
            stripped=tuple(sorted(set(stripped))),
            unit_fields=tuple(sorted(set(unit_fields))),
            ignored=tuple(sorted(set(ignored))),
            reason=(
                f"the payload describes an execution unit ({sorted(set(unit_fields))});"
                " a unit is never converted into a requirement (SWR-3411)"
            ),
        )
    accepted["origin"] = origin
    accepted["run_id"] = run_id
    accepted["unit_id"] = unit_id
    accepted["proposed_at"] = at
    try:
        proposal = TechnicalRequirementProposal.model_validate(accepted)
    except (DerivationError, ValueError) as exc:
        return ProposalIntake(
            stripped=tuple(sorted(set(stripped))),
            ignored=tuple(sorted(set(ignored))),
            reason=f"the payload is not a usable proposal: {exc}",
        )
    return ProposalIntake(
        proposal=proposal,
        stripped=tuple(sorted(set(stripped))),
        ignored=tuple(sorted(set(ignored))),
    )


@traces(SWR.SWR_3411)
class DerivationRequest(BaseModel):
    """What a run asks the model: did this work create a lasting obligation?"""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    run_id: str = ""
    unit_id: str | None = None
    #: What the run changed — the evidence a proposal has to rest on.
    changed_files: tuple[str, ...] = ()
    agent_summary: str = ""
    persona: str = ""


@runtime_checkable
class DerivationModel(Protocol):
    """Whatever judges that a run created a lasting technical obligation.

    Behind a protocol so the whole decision path — the read, the refusal, the
    write — is exercised against a fake, with no network anywhere near a unit
    test.
    """

    def propose(self, request: DerivationRequest) -> Sequence[Mapping[str, object]]:
        """Zero or more proposals. An empty answer is the normal one."""
        ...


@traces(SWR.SWR_3411, SWR.SWR_3109)
class ReciprocalLink(BaseModel):
    """The origin's side of a derivation: ``origin ──derives──▶ derived``.

    Computed rather than authored a second time. The new requirement declares
    ``derived-from: <origin>``; the origin's ``Derived requirements`` edge is the
    reverse of exactly that (SWR-3109, SWR-3110), which is why the two can never
    disagree and why nothing here writes into the origin's own file.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    origin: str
    derived: str

    @property
    def message(self) -> str:
        """``SWR-3413 derives SWR-3416`` — what the audit trail records."""
        return f"{self.origin} derives {self.derived}"


@traces(SWR.SWR_3411, SWR.SWR_3109)
def reciprocal_of(created: CanonicalRequirement, *, origin: str) -> ReciprocalLink | None:
    """The reciprocal link *created* gives its origin, or ``None`` when it gives none.

    ``None`` means the created requirement does not name *origin* in a
    ``derived-from`` relation, and therefore the origin gained nothing — which is
    a failed derivation, not a successful one with a missing link.
    """
    if origin not in created.related_ids(RelationKind.DERIVED_FROM):
        return None
    return ReciprocalLink(origin=origin, derived=created.req_id)


class DerivationRefusalKind(StrEnum):
    """Why a proposed technical requirement was not created."""

    #: The payload described a unit (SWR-3411's fourth acceptance criterion).
    UNIT_PAYLOAD = "unit-payload"
    #: The payload could not be read as a proposal at all.
    UNREADABLE = "unreadable"
    #: The store's own requirement check rejected the draft (SWR-2331).
    STORE_CHECK = "store-check"
    #: The source declines to create requirements (SWR-3105).
    READ_ONLY_SOURCE = "read-only-source"
    #: The requirement was created but the origin gained no reciprocal link.
    NO_RECIPROCAL_LINK = "no-reciprocal-link"
    #: The write path itself failed.
    WRITE_FAILED = "write-failed"


@traces(SWR.SWR_3411)
class DerivedRequirement(BaseModel):
    """A technical requirement this run actually created."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    origin: str
    title: str = ""
    source_path: str | None = None
    #: What kind of artefact this is — permanent, unlike a unit (SWR-3411).
    kind: DerivedArtifactKind = DerivedArtifactKind.TECHNICAL_REQUIREMENT
    link: ReciprocalLink

    @property
    def permanent(self) -> bool:
        """Whether it outlives the run — always ``True`` here, and stated."""
        return self.kind.permanent

    @property
    def message(self) -> str:
        """One line for the audit trail and the review surface."""
        return f"{self.req_id} derived from {self.origin}: {self.kind.explanation}"


@traces(SWR.SWR_3411)
class DerivationOutcome(BaseModel):
    """What one proposal produced: a requirement, or a stated refusal.

    A refusal is a value on purpose. SWR-3411 says the *run* is not failed by one:
    an obligation Rotaris could not record is worth reporting and worth showing,
    and throwing away a completed unit over it would be the worse answer.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    created: DerivedRequirement | None = None
    refusal_kind: DerivationRefusalKind | None = None
    reason: str = ""
    #: The source's own refusal, when a source declined (SWR-3105).
    refusal: WriteRefusal | None = None
    #: Reserved keys the payload tried to set (SWR-3411).
    stripped_fields: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _one_answer(self) -> Self:
        if (self.created is None) == (self.refusal_kind is None):
            raise DerivationError(
                f"{self.req_id}: a derivation either created a requirement or was refused",
            )
        if self.created is None and not self.reason.strip():
            raise DerivationError(f"{self.req_id}: a refused derivation states why (SWR-3411)")
        return self

    @property
    def accepted(self) -> bool:
        """Whether the project's store now holds the technical requirement."""
        return self.created is not None

    @property
    def refused(self) -> bool:
        """Whether the proposal was declined, for any reason."""
        return self.created is None

    @property
    def run_failed(self) -> bool:
        """Always ``False``: a refused proposal never fails its run (SWR-3411)."""
        return False

    @property
    def message(self) -> str:
        """One line a user can act on."""
        if self.created is not None:
            return self.created.message
        return (
            f"{self.req_id}: technical requirement not created — {self.refusal_kind}: {self.reason}"
        )


@traces(SWR.SWR_3411, SWR.SWR_3112)
class RequirementDerivation:
    """Turn a run's proposal into a requirement in the project's own store.

    The write path is :class:`~rotaris_core.requirements.writeback.RequirementWriteBack`
    (SWR-3112) — the same one a user's "new requirement" goes through — so a
    Rotaris-derived requirement is indistinguishable from a hand-written one and
    passes the store's own check. Nothing here writes a file itself.
    """

    def __init__(
        self,
        writeback: RequirementWriteBack,
        *,
        source_id: str | None = None,
        model: DerivationModel | None = None,
        persona: str = "",
    ) -> None:
        self._writeback = writeback
        self._source_id = source_id
        self._model = model
        self._persona = persona

    @traces(SWR.SWR_3411)
    def propose(self, request: DerivationRequest) -> tuple[TechnicalRequirementProposal, ...]:
        """Ask the configured model whether this run created a lasting obligation.

        An empty answer is the normal one and costs nothing further; a model that
        fails answers "no proposal" rather than failing the run.
        """
        model = self._model
        if model is None:
            return ()
        stamped = request.model_copy(update={"persona": self._persona or request.persona})
        try:
            payloads = tuple(model.propose(stamped))
        except Exception:  # noqa: BLE001 - a failing proposer never fails a finished run.
            return ()
        proposals: list[TechnicalRequirementProposal] = []
        for payload in payloads:
            intake = read_technical_proposal(
                payload,
                origin=request.req_id,
                run_id=request.run_id,
                unit_id=request.unit_id,
            )
            if intake.proposal is not None:
                proposals.append(intake.proposal)
        return tuple(proposals)

    @traces(SWR.SWR_3411, SWR.SWR_3112, SWR.SWR_3105)
    def derive(self, proposal: TechnicalRequirementProposal) -> DerivationOutcome:
        """Create the technical requirement *proposal* describes, or state the refusal.

        The order of operations is the requirement: check the draft against the
        store's own rule first, so nothing is written when it would not pass;
        create through the source's write path, which refuses a read-only source
        without touching it; then confirm the origin gained its reciprocal link
        from the requirement the source actually holds.
        """
        draft = proposal.to_draft()
        try:
            validate_draft(draft)
        except CreationError as exc:
            return DerivationOutcome(
                req_id=proposal.origin,
                refusal_kind=DerivationRefusalKind.STORE_CHECK,
                reason=f"the store's own requirement check rejected the proposal: {exc}",
            )
        try:
            written = self._writeback.create(draft, source_id=self._source_id)
        except Exception as exc:  # noqa: BLE001 - a failed write never fails the run.
            return DerivationOutcome(
                req_id=proposal.origin,
                refusal_kind=DerivationRefusalKind.WRITE_FAILED,
                reason=f"the requirement could not be written: {type(exc).__name__}: {exc}",
            )
        if written.refusal is not None:
            return DerivationOutcome(
                req_id=proposal.origin,
                refusal_kind=DerivationRefusalKind.READ_ONLY_SOURCE,
                reason=written.refusal.message,
                refusal=written.refusal,
            )
        created = written.requirement
        if created is None:  # pragma: no cover - the write path guarantees one
            return DerivationOutcome(
                req_id=proposal.origin,
                refusal_kind=DerivationRefusalKind.WRITE_FAILED,
                reason="the source reported no requirement after the creation",
            )
        link = reciprocal_of(created, origin=proposal.origin)
        if link is None:
            return DerivationOutcome(
                req_id=proposal.origin,
                refusal_kind=DerivationRefusalKind.NO_RECIPROCAL_LINK,
                reason=(
                    f"{created.req_id} was created but does not name {proposal.origin} as its"
                    " origin, so the origin gained no derived link (SWR-3411, SWR-3109)"
                ),
            )
        return DerivationOutcome(
            req_id=proposal.origin,
            created=DerivedRequirement(
                req_id=created.req_id,
                origin=proposal.origin,
                title=created.title,
                source_path=created.source_path,
                link=link,
            ),
        )
