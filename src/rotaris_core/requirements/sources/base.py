"""The requirement source adapter interface (SWR-3102) and its capabilities (SWR-3105).

A requirement source is anything that can say which requirements a project has:
this repository's ReqToCode store, a YAML specification tree, an issue tracker.
They differ enormously in what they can *do* — a Markdown store can be written,
a legacy export can only be read, a tracker can be written but not reordered —
and none of those differences may leak into the code that consumes requirements.

**Three mandatory operations, three optional ones.** Every adapter implements
:meth:`RequirementSource.discover` (which artefacts exist),
:meth:`RequirementSource.read` (canonical requirements, SWR-3101) and
:meth:`RequirementSource.revision` (an opaque token that changes exactly when
the content changes). ``create`` / ``update`` / ``delete`` are optional. An
adapter that implements only the mandatory three is a first-class adapter and
drives the board end to end; a writable one *adds capability*, it does not
implement a different interface. That is why the interface is a
:class:`typing.Protocol` plus a declared :class:`SourceCapabilities` descriptor
rather than an abstract base class per flavour.

**Declared, never inferred.** A capability is what the adapter says it has, not
what a failed write revealed (SWR-3105). Calling an undeclared operation raises
:class:`UnsupportedOperation` carrying a :class:`WriteRefusal` that names the
source and the artefact — so a write path can either ask first
(:func:`refusal_for`) and show the reason, or attempt and be refused, and both
routes produce the same stated outcome instead of a silent degradation.

**Errors are named, never empty.** An unreadable file or an unreachable tracker
raises :class:`RequirementSourceError`; a registry turns that into a
:class:`SourceFailure` naming the source (SWR-3115). What must never happen is
an empty requirement set that reads as "this project has no requirements".

**Enough for change detection.** Slice 5 compares reads: :meth:`read` returns a
:class:`SourceRead` that carries the revision *of that read* alongside the
requirements, so a read and its revision cannot be observed out of step, and
every requirement in it is stamped with that revision (SWR-3107). Together with
:meth:`discover`'s per-artefact revisions, an incremental refresh (SWR-3116) can
skip artefacts that did not move without re-reading them.

**"What changed", not only "something changed".** Comparing hashes says a
requirement moved; deciding whether a *behaviour* moved needs both texts
(SWR-3503), and Rotaris may not keep the old one — persisting requirement prose
is exactly what SWR-3114 forbids. The fourth optional operation therefore asks
the source itself:
:meth:`BaseRequirementSource.read_requirement_at` reconstructs one requirement as
of a past revision. It is optional in the same declared-never-inferred way as the
writes — :attr:`BaseRequirementSource.provides_history` says whether the adapter
can do it, :func:`history_of` is the ask-first check, and a source that cannot
raises :class:`SourceHistoryUnavailable` instead of returning a guess. A tracker
with no history and a store with no version control are then *stated* gaps a
caller can fall back from, not silent wrong answers.

Adapters are constructed by the registry (SWR-3115) from configuration
(SWR-3117); registering one therefore costs no edit in any consumer.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import (
    FULL_CAPABILITIES,
    READ_ONLY,
    CanonicalRequirement,
    Relation,
    RequirementLifecycle,
    RequirementType,
    SourceCapabilities,
    SourceCapability,
)

if TYPE_CHECKING:
    from collections.abc import Collection, Sequence

    # Typing only, and it must stay that way: ``writeback`` imports *this* module
    # at run time, so the reverse edge would be a cycle. ``runtime_checkable``
    # checks method presence, never annotations, so nothing here needs the class.
    from rotaris_core.requirements.writeback import RequirementCreation

__all__ = [
    "FULL_CAPABILITIES",
    "READ_ONLY",
    "BaseRequirementSource",
    "CreationPreviewSource",
    "HistoricalRequirementSource",
    "RequirementArtifact",
    "RequirementDraft",
    "RequirementEdit",
    "RequirementSource",
    "RequirementSourceError",
    "SourceCapabilities",
    "SourceCapability",
    "SourceFailure",
    "SourceHistoryUnavailable",
    "SourceIssue",
    "SourceRead",
    "UnsupportedOperation",
    "WritableRequirementSource",
    "WriteRefusal",
    "history_of",
    "preview_of",
    "refusal_for",
    "require_capability",
    "supports",
]


@traces(SWR.SWR_3105)
class WriteRefusal(BaseModel):
    """A stated read-only outcome: which source refused, and where it lives.

    A refusal is a *value*, not a log line, so the same fact can be shown in the
    detail view (SWR-3605), returned from a write path (SWR-3111) and carried by
    the exception raised when someone attempts the write anyway.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    operation: SourceCapability
    #: The artefact the write would have touched, when one is known.
    location: str | None = None
    #: Free-text detail an adapter may add ("tracker is read-only for this user").
    detail: str = ""

    @property
    def message(self) -> str:
        """One line naming the source, the operation and the artefact."""
        where = f" at {self.location}" if self.location else ""
        detail = f": {self.detail}" if self.detail else ""
        return (
            f"requirement source {self.source_id!r} does not support"
            f" {str(self.operation)!r}{where}{detail}"
        )


class RequirementSourceError(RuntimeError):
    """A named failure of one source (SWR-3102).

    Carries the source id so a registry can report *which* source failed while
    the others still load, instead of an empty board with a stack trace behind
    it.
    """

    def __init__(self, source_id: str, message: str, *, location: str | None = None) -> None:
        self.source_id = source_id
        self.location = location
        where = f" ({location})" if location else ""
        super().__init__(f"[{source_id}]{where} {message}")


class UnsupportedOperation(RequirementSourceError):  # noqa: N818 - the name SWR-3102 gives it
    """Raised when an operation the adapter never declared is called.

    Named without the ``Error`` suffix on purpose: SWR-3102 and its test
    portfolio name this exception, and :class:`io.UnsupportedOperation` is the
    stdlib precedent for exactly this meaning.
    """

    def __init__(self, refusal: WriteRefusal) -> None:
        self.refusal = refusal
        super().__init__(refusal.source_id, refusal.message, location=refusal.location)


class SourceHistoryUnavailable(RequirementSourceError):  # noqa: N818 - reads as a state
    """Raised when a past state was asked of a source that cannot reconstruct one.

    A stated gap (SWR-3102): the caller learns that *this* source has no history
    — an issue tracker without revisions, a store outside version control — and
    can fall back to hash-only change detection instead of being handed a
    fabricated "old version" (SWR-3503).
    """

    def __init__(self, source_id: str, revision: str, *, detail: str = "") -> None:
        self.revision = revision
        suffix = f": {detail}" if detail else ""
        super().__init__(
            source_id,
            f"cannot reconstruct requirements as of revision {revision!r}{suffix}",
        )


@traces(SWR.SWR_3102)
class RequirementArtifact(BaseModel):
    """One thing a source holds requirements in: a file, an issue, a row.

    Discovery is deliberately separate from reading: it is what makes an
    incremental refresh possible (SWR-3116), and it is what lets a source report
    "this file exists but could not be parsed" instead of losing the file.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Stable within the source; identifies the artefact across reads.
    artifact_id: str
    #: Human-meaningful location — repository-relative path, URL, issue key.
    location: str
    #: Per-artefact revision, when the source can produce one cheaply (an mtime,
    #: a size/mtime pair, an ETag). ``None`` means "ask the source".
    revision: str | None = None
    #: Requirement ids this artefact declares, when discovery already knows them
    #: (a multi-id spec file declares several).
    requirement_ids: tuple[str, ...] = ()


@traces(SWR.SWR_3102)
class SourceIssue(BaseModel):
    """Something a read noticed but survived: a skipped file, an odd field."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    message: str
    location: str | None = None
    req_id: str | None = None


@traces(SWR.SWR_3115)
class SourceFailure(BaseModel):
    """A source that could not be read at all, named for reporting.

    The registry's answer to "one source is down": the others still load and
    this says which one did not and why (SWR-3102, SWR-3115).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    message: str
    location: str | None = None
    error_type: str = ""

    @classmethod
    def from_error(cls, source_id: str, error: BaseException) -> Self:
        """Turn any adapter exception into a named failure."""
        location = getattr(error, "location", None)
        named = getattr(error, "source_id", None)
        return cls(
            source_id=named if isinstance(named, str) and named else source_id,
            message=str(error),
            location=location if isinstance(location, str) else None,
            error_type=type(error).__name__,
        )


@traces(SWR.SWR_3102)
class SourceRead(BaseModel):
    """Everything one read of a source produced, and the revision it saw.

    Requirements and revision travel together on purpose: a caller that read the
    requirements and then asked for the revision separately could store a token
    that never described the content it holds, and every hash comparison built
    on that would be wrong in the direction that hides changes.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    revision: str
    requirements: tuple[CanonicalRequirement, ...] = ()
    issues: tuple[SourceIssue, ...] = ()

    @field_validator("source_id", "revision")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a source read carries a source id and a revision token")
        return cleaned

    @model_validator(mode="after")
    def _stamp_provenance(self) -> Self:
        """Give every requirement this read's source id and revision.

        Stamping rather than demanding: an adapter builds requirements from
        content and should not have to repeat its own identity on each one. A
        requirement that already carries a *different* source id or revision is
        a real inconsistency and is rejected, because it would make SWR-3107's
        "revision recorded per read" untrue for exactly one requirement.
        """
        stamped: list[CanonicalRequirement] = []
        for requirement in self.requirements:
            if requirement.source_id and requirement.source_id != self.source_id:
                raise ValueError(
                    f"{requirement.req_id}: source id {requirement.source_id!r} does not match"
                    f" the read's {self.source_id!r}",
                )
            if requirement.source_revision and requirement.source_revision != self.revision:
                raise ValueError(
                    f"{requirement.req_id}: source revision {requirement.source_revision!r}"
                    f" does not match the read's {self.revision!r}",
                )
            stamped.append(
                requirement.stamped(source_id=self.source_id, source_revision=self.revision),
            )
        # Assigned in place rather than returned as a copy: pydantic does not
        # accept a replacement instance from a top-level validator during
        # ``__init__``, and the model is frozen for callers, not for its own
        # construction.
        object.__setattr__(self, "requirements", tuple(stamped))
        return self

    @property
    def requirement_ids(self) -> tuple[str, ...]:
        """Ids in the order the source produced them."""
        return tuple(requirement.req_id for requirement in self.requirements)

    def by_id(self) -> dict[str, CanonicalRequirement]:
        """The read indexed by requirement id (first wins on a duplicate)."""
        index: dict[str, CanonicalRequirement] = {}
        for requirement in self.requirements:
            index.setdefault(requirement.req_id, requirement)
        return index


@traces(SWR.SWR_3102)
class RequirementDraft(BaseModel):
    """The content of a requirement that does not exist yet (``create``).

    ``req_id`` is optional because issuing an id is the source's business and
    follows the project's own conventions (SWR-3112) — an adapter that numbers
    its own requirements must not be handed one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str | None = None
    title: str = ""
    description: str = ""
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    req_type: RequirementType = RequirementType.PRODUCT
    parent: str | None = None
    relations: tuple[Relation, ...] = ()
    trace_required: bool = True
    test_required: bool = True


@traces(SWR.SWR_3102)
class RequirementEdit(BaseModel):
    """A partial change to an existing requirement (``update``).

    Every field is optional and ``None`` means *unchanged*, so an adapter
    rewrites only what moved and leaves the source's own format, field order and
    unmodelled content alone (SWR-3111).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    title: str | None = None
    description: str | None = None
    lifecycle: RequirementLifecycle | None = None
    req_type: RequirementType | None = None
    parent: str | None = None
    relations: tuple[Relation, ...] | None = None
    trace_required: bool | None = None
    test_required: bool | None = None
    #: The ``current_hash`` the editor believed it was changing. An adapter that
    #: supports it refuses the write when the source moved underneath — the
    #: difference between a lost edit and a reported conflict.
    expected_hash: str | None = None

    def changed_fields(self) -> tuple[str, ...]:
        """Field names this edit actually sets, in declaration order."""
        return tuple(
            name
            for name in type(self).model_fields
            if name != "expected_hash" and getattr(self, name) is not None
        )

    @property
    def is_empty(self) -> bool:
        """True when the edit would change nothing."""
        return not self.changed_fields()


@runtime_checkable
class RequirementSource(Protocol):
    """What every requirement source can do (SWR-3102).

    The mandatory surface, and nothing more: an adapter satisfying exactly this
    is complete. Implement it directly, or inherit
    :class:`BaseRequirementSource` to get the capability guards for free.
    """

    @property
    def source_id(self) -> str:
        """Stable id of this configured source, used for attribution."""
        ...

    @property
    def capabilities(self) -> SourceCapabilities:
        """What this source declares it can do (SWR-3105)."""
        ...

    def discover(self) -> Sequence[RequirementArtifact]:
        """Which artefacts this source holds requirements in."""
        ...

    def read(self) -> SourceRead:
        """Canonical requirements plus the revision they were read at."""
        ...

    def revision(self) -> str:
        """Opaque token; changes exactly when the source's content changes."""
        ...


@runtime_checkable
class WritableRequirementSource(RequirementSource, Protocol):
    """A source that additionally declares write operations.

    Purely a typing convenience for call sites that already checked the
    capability. It is **not** a capability check: ``isinstance`` against a
    Protocol only sees which methods exist, and every
    :class:`BaseRequirementSource` has ``create`` / ``update`` / ``delete`` —
    precisely so that they can refuse. Whether a write is possible is what the
    adapter *declared* (:func:`supports`, SWR-3105), never what a type check or
    a failed attempt suggested.
    """

    def create(self, draft: RequirementDraft) -> CanonicalRequirement: ...

    def update(self, req_id: str, edit: RequirementEdit) -> CanonicalRequirement: ...

    def delete(self, req_id: str) -> None: ...


@runtime_checkable
@traces(SWR.SWR_3102)
class HistoricalRequirementSource(RequirementSource, Protocol):
    """A source that can also say what a requirement looked like *before*.

    The seam change detection (SWR-3501) and impact analysis (SWR-3503) build on:
    the current version comes from :meth:`RequirementSource.read`, the satisfied
    version comes from here, and the diff between them is what decides whether a
    change costs an agent run. Neither Rotaris' snapshots nor its delivery
    records may hold the old text (SWR-3114), so the source is the only place it
    can come from.

    ``revision`` is a token *this* source understands: a git revision for a
    file-backed store, a version number for a tracker, the ``source_revision``
    a run snapshot recorded (SWR-3402). ``None`` means the requirement did not
    exist at that revision — a real answer, and different from a source that
    cannot answer at all (:class:`SourceHistoryUnavailable`).
    """

    @property
    def provides_history(self) -> bool:
        """Whether this adapter can reconstruct a past state at all."""
        ...

    def read_requirement_at(self, req_id: str, revision: str) -> CanonicalRequirement | None:
        """*req_id* as of *revision*, or ``None`` when it did not exist then."""
        ...


@traces(SWR.SWR_3102)
def history_of(source: RequirementSource) -> HistoricalRequirementSource | None:
    """The same source typed for history reads, or ``None`` when it has none.

    The ask-first check for the fourth optional operation, mirroring
    :func:`refusal_for`: the declaration decides, never a failed attempt. The
    ``isinstance`` is a structural check that the methods exist *and*
    ``provides_history`` is what the adapter says — both are required, because
    :class:`BaseRequirementSource` gives every adapter the method precisely so
    that it can refuse.
    """
    if isinstance(source, HistoricalRequirementSource) and source.provides_history:
        return source
    return None


@runtime_checkable
@traces(SWR.SWR_3606, SWR.SWR_3112)
class CreationPreviewSource(RequirementSource, Protocol):
    """A source that can also say *where* a draft would land, without writing it.

    SWR-3606 asks the user to see where the artefact will be written before it is
    written, and only the adapter knows: the id block an epic allocates from, the
    folder its index points at, the file name its conventions build. A surface
    that worked that out for itself would be making a promise the write is free
    to break — and would have to learn the next source kind's layout too
    (SWR-3122, SWR-3118).

    Optional in the same declared-never-inferred way as history, and for the same
    reason: an adapter that cannot name a location before the write says so, and
    the caller shows *that* rather than a plausible path it made up. A tracker
    that issues ids on submit is not broken; it simply has no answer yet.

    The refusals are the write's own. An implementation resolves the location the
    way it creates — one rule, not two that agree today — so a preview that
    cannot be honoured raises :class:`~rotaris_core.requirements.writeback.CreationError`
    instead of naming a file the create would then refuse.
    """

    @property
    def previews_creation(self) -> bool:
        """Whether this adapter can name a location before the write."""
        ...

    def preview_creation(
        self,
        draft: RequirementDraft,
        *,
        used_ids: Collection[str] | None = None,
    ) -> RequirementCreation:
        """Where *draft* would be created, resolved without writing anything."""
        ...


@traces(SWR.SWR_3606, SWR.SWR_3112)
def preview_of(source: RequirementSource) -> CreationPreviewSource | None:
    """The same source typed for creation previews, or ``None`` when it has none.

    The ask-first check for the fifth optional operation, mirroring
    :func:`history_of` exactly: the declaration decides, never a failed attempt.
    Both halves are required for the same reason they are there —
    :class:`BaseRequirementSource` gives every adapter the method precisely so it
    can refuse, so the method's presence alone would say nothing.
    """
    if isinstance(source, CreationPreviewSource) and source.previews_creation:
        return source
    return None


@traces(SWR.SWR_3105)
def supports(source: RequirementSource, operation: SourceCapability) -> bool:
    """Whether *source* declares *operation*."""
    return source.capabilities.can(operation)


@traces(SWR.SWR_3105)
def refusal_for(
    source: RequirementSource,
    operation: SourceCapability,
    *,
    location: str | None = None,
    detail: str = "",
) -> WriteRefusal | None:
    """``None`` when the operation is supported, else the stated refusal.

    The ask-first half of SWR-3105: a write path consults this *before*
    attempting anything, so the source is never touched and the user is told
    which source refused and where its artefact lives.
    """
    if supports(source, operation):
        return None
    return WriteRefusal(
        source_id=source.source_id,
        operation=operation,
        location=location,
        detail=detail,
    )


@traces(SWR.SWR_3102, SWR.SWR_3105)
def require_capability(
    source: RequirementSource,
    operation: SourceCapability,
    *,
    location: str | None = None,
    detail: str = "",
) -> None:
    """Raise :class:`UnsupportedOperation` unless *operation* is declared.

    The guard every optional operation opens with. Raising rather than degrading
    is the point: a write that quietly did nothing would leave the user
    believing the project's own store had been changed.
    """
    refusal = refusal_for(source, operation, location=location, detail=detail)
    if refusal is not None:
        raise UnsupportedOperation(refusal)


@traces(SWR.SWR_3102, SWR.SWR_3105)
class BaseRequirementSource(ABC):
    """Optional base class: the three mandatory operations, guarded optionals.

    Subclassing is not required — :class:`RequirementSource` is a Protocol — but
    it is the shortest correct path: a read-only adapter implements
    :meth:`discover`, :meth:`read` and :meth:`revision`, declares nothing else,
    and its inherited ``create`` / ``update`` / ``delete`` refuse with a
    :class:`WriteRefusal` naming the source. A writable adapter declares the
    capability and overrides the method; declaring one without overriding it is
    a programming error and says so.
    """

    #: Default: a source is read-only until it declares otherwise, so a missing
    #: declaration can never produce an offer the source cannot honour.
    capabilities: SourceCapabilities = READ_ONLY

    @property
    @abstractmethod
    def source_id(self) -> str:
        """Stable id of this configured source."""

    @abstractmethod
    def discover(self) -> Sequence[RequirementArtifact]:
        """Which artefacts this source holds requirements in."""

    @abstractmethod
    def read(self) -> SourceRead:
        """Canonical requirements plus the revision they were read at."""

    @abstractmethod
    def revision(self) -> str:
        """Opaque token; changes exactly when the source's content changes."""

    def create(self, draft: RequirementDraft) -> CanonicalRequirement:
        """Create a requirement in the source. Refused unless declared."""
        require_capability(self, SourceCapability.CREATE)
        raise NotImplementedError(
            f"{type(self).__name__} declares 'create' but does not implement it",
        )

    def update(self, req_id: str, edit: RequirementEdit) -> CanonicalRequirement:
        """Write an edit back to the source. Refused unless declared."""
        require_capability(self, SourceCapability.UPDATE, location=self.locate(req_id))
        raise NotImplementedError(
            f"{type(self).__name__} declares 'update' but does not implement it",
        )

    def delete(self, req_id: str) -> None:
        """Remove a requirement from the source. Refused unless declared."""
        require_capability(self, SourceCapability.DELETE, location=self.locate(req_id))
        raise NotImplementedError(
            f"{type(self).__name__} declares 'delete' but does not implement it",
        )

    @property
    def provides_history(self) -> bool:
        """Whether this adapter can reconstruct a past state (SWR-3102).

        ``False`` by default, for the same reason capabilities default to
        read-only: an adapter that never thought about history must not be asked
        to answer from one.
        """
        return False

    def read_requirement_at(self, req_id: str, revision: str) -> CanonicalRequirement | None:
        """*req_id* as of *revision*. Refused unless the adapter declares history."""
        del req_id
        raise SourceHistoryUnavailable(
            self.source_id,
            revision,
            detail=f"{type(self).__name__} keeps no requirement history",
        )

    @property
    def previews_creation(self) -> bool:
        """Whether this adapter can name a creation's location first (SWR-3606).

        ``False`` by default, for the reason :attr:`provides_history` is: the
        method exists on every adapter so that it can refuse, so its presence
        must not be what a caller reads.
        """
        return False

    def preview_creation(
        self,
        draft: RequirementDraft,
        *,
        used_ids: Collection[str] | None = None,
    ) -> RequirementCreation:
        """Where *draft* would land. Refused unless the adapter declares previews."""
        del draft, used_ids
        raise UnsupportedOperation(
            WriteRefusal(
                source_id=self.source_id,
                operation=SourceCapability.CREATE,
                detail=(
                    f"{type(self).__name__} does not name a file location for a new"
                    " requirement before it is created"
                ),
            ),
        )

    def locate(self, req_id: str) -> str | None:
        """Where *req_id* lives in this source, when the adapter can say.

        Used to name the artefact in a refusal (SWR-3105). The default answer is
        "unknown", which weakens the message but never invents a location.
        """
        del req_id
        return None

    def fail(self, message: str, *, location: str | None = None) -> RequirementSourceError:
        """Build the named error this source should raise (SWR-3102)."""
        return RequirementSourceError(self.source_id, message, location=location)
