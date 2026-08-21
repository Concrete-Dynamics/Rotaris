"""Change detection over any source, and what a change does to a delivery (SWR-3501, SWR-3502).

``reqtocode diff`` (SWR-2332) already classifies requirement changes — between
two git revisions of *this* repository's store, against a committed ``swr.py``
that only this repository has. Requirement management needs the same
classification continuously and for every configured source, including sources
that are not files, have no git history and never heard of a generated module.

So the classifier here takes **values, not a repository**: the set the last
evaluation saw and the set just read. That is what makes it source-agnostic, and
it is also what makes it testable without a checkout.

```text
RequirementBaseline  ─┐
                      ├─▶ classify_changes() ─▶ ChangeSet ─▶ RequirementChange*
SourceRead (now)     ─┘        (pure)                          added / removed
                                                               modified / status
```

**What counts as "modified" is deliberately wider than the canonical hash.** A
requirement changed when its canonical content moved (``current_hash``,
SWR-3107) **or** when the artefact it was read from moved (``source_hash`` — the
source's own token, ReqToCode's ``content_hash``, an ETag). Both are needed and
neither subsumes the other: the canonical hash is blind to everything the model
does not represent — a store's acceptance-criteria section, its test-portfolio
table — while the artefact token is blind to a requirement whose *parent* moved
because its document was filed elsewhere. Detecting on either is what makes the
classification agree with ``reqtocode diff`` over the same content, and
:attr:`RequirementChange.canonical_change` / :attr:`RequirementChange.artifact_change`
keep the two distinguishable for the consumer that cares (SWR-3503).

**A source that did not move is not read.** :meth:`SourceChangeDetector.detect`
compares :meth:`~rotaris_core.requirements.sources.base.RequirementSource.revision`
against the baseline's *before* touching :meth:`read`, so a refresh over an
unchanged store costs one revision call — the difference between a board that can
poll and one that cannot (SWR-3102, SWR-3116).

**The first evaluation is not a wave of changes.** A baseline that was never
evaluated is a different value from an evaluated empty one
(:attr:`RequirementBaseline.evaluated`), so opening a workspace with 1500
requirements reports nothing, while a source that genuinely gained its first
requirement reports one ``added``.

The second half of this module is SWR-3502, and it is the product promise the
first half exists for: a delivered requirement whose specification moved becomes
``Needs Update`` — never ``Backlog`` — keeping the hash, the run and the commit
that delivered it. :func:`assess_specification` is the pure rule;
:class:`NeedsUpdatePass` is the rule bound to the one door that may move a
delivery state (:func:`~rotaris_core.requirements.delivery.transitions.apply_transition`,
SWR-3203) and to the audit trail that records it (SWR-3213).

Pure by construction apart from :class:`SourceChangeDetector`, whose only impurity
is the source it is handed: no clock (timestamps are arguments), no filesystem, no
subprocess, no network.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind
from rotaris_core.requirements.delivery.satisfied import (
    SatisfiedDelivery,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import (
    TransitionOutcome,  # noqa: TC001 - Pydantic resolves this at runtime.
    TransitionRequest,
)
from rotaris_core.requirements.model import (
    RequirementLifecycle,
    requirement_sort_key,
)

if TYPE_CHECKING:
    import datetime as dt
    from collections.abc import Collection, Iterable, Mapping, Sequence
    from types import TracebackType

    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.sources.base import RequirementSource, SourceRead

__all__ = [
    "DEFAULT_DRIFT_LIFECYCLES",
    "SPECIFICATION_ACTOR",
    "AuditSink",
    "BaselineEntry",
    "ChangeKind",
    "ChangeSet",
    "DetectionResult",
    "NeedsUpdateOutcome",
    "NeedsUpdatePass",
    "PropagationLoopError",
    "ReentrancyGuard",
    "RequirementBaseline",
    "RequirementChange",
    "SourceChangeDetector",
    "SpecificationAssessment",
    "SpecificationVerdict",
    "TransitionDoor",
    "assess_specification",
    "classify_changes",
]


class PropagationLoopError(RuntimeError):
    """A propagation pass was re-entered while it was still running.

    The abort criterion of Gate 4's last question. Raised rather than tolerated:
    a second pass started from inside the first would evaluate a half-applied
    state, and two of them would never agree on when to stop.
    """


@traces(SWR.SWR_3502, SWR.SWR_3504, SWR.SWR_3506)
class ReentrancyGuard:
    """One pass at a time — the structural reason propagation terminates.

    Every pass in this package walks a finite set of requirements exactly once
    and holds no collaborator that could ask for another pass. This guard closes
    the one remaining door: an injected door, sink or verifier that calls back
    into the pass it is serving raises :class:`PropagationLoopError` instead of
    starting a second, nested evaluation.

    A context manager rather than a decorator so the release happens on the
    exception path too — a guard that stays closed after one failure would turn
    a loop into a deadlock, which is a worse bug than the one it prevents.

    It lives in this module, the bottom of the package, so that *every* pass can
    hold one — :class:`NeedsUpdatePass` here, the outcome resolvers in
    :mod:`~rotaris_core.requirements.change.outcomes`,
    :class:`~rotaris_core.requirements.change.decisions.HumanDecisions` and the
    evidence pass in :mod:`~rotaris_core.requirements.change.propagation`. A pass
    that claimed to terminate "by construction" while being the one without a
    guard is the pass the claim was never checked on.
    """

    def __init__(self, what: str) -> None:
        self._what = what
        self._inside = False

    @property
    def inside(self) -> bool:
        """Whether a pass is running right now."""
        return self._inside

    def __enter__(self) -> Self:
        if self._inside:
            raise PropagationLoopError(
                f"{self._what} was re-entered while it was still running;"
                " an evaluation may not trigger an evaluation (SWR-3210)",
            )
        self._inside = True
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exc_type, exc, traceback
        self._inside = False


#: The actor a change-propagation pass acts as. Named rather than anonymous: the
#: audit trail has to distinguish "the specification moved and Rotaris noticed"
#: from "somebody dragged a card" (SWR-3203, SWR-3213).
SPECIFICATION_ACTOR = DeliveryActor.system("change-detection")

#: Which lifecycles a *modified* requirement can drift in. Mirrors
#: ``reqtocode``'s rule (``diff._is_drift`` only flags approved requirements), so
#: the two classifications agree over the same content; a workspace whose
#: requirements never leave ``draft`` can widen it.
DEFAULT_DRIFT_LIFECYCLES: frozenset[RequirementLifecycle] = frozenset(
    {RequirementLifecycle.APPROVED},
)


class ChangeKind(StrEnum):
    """How one requirement differs from the last evaluated set (SWR-3501).

    The four classes SWR-3501 names, spelled exactly as ``reqtocode diff``
    spells them — the two are compared against each other over the same content,
    and a translation table between the vocabularies would be one more thing that
    can be wrong.
    """

    #: Present now, absent from the last evaluated set.
    ADDED = "added"
    #: Present in the last evaluated set, absent now.
    REMOVED = "removed"
    #: Present in both; a content hash differs.
    MODIFIED = "modified"
    #: Present in both, both hashes equal, lifecycle moved.
    STATUS = "status"

    @property
    def label(self) -> str:
        """``Modified`` — what a report prints."""
        return self.value.capitalize()


@traces(SWR.SWR_3501, SWR.SWR_3114)
class BaselineEntry(BaseModel):
    """One requirement as the last evaluation saw it: identity, never content.

    Hashes and a lifecycle token — no title, no description. Detection needs to
    know *that* something moved, and the source is where the text lives
    (SWR-3114); keeping a copy here to make the report prettier is how a change
    detector becomes a second requirement store.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The canonical content hash at that evaluation (SWR-3107).
    content_hash: str = ""
    #: The source's own artefact token, when it had one.
    source_hash: str | None = None
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    #: Where the source held it. Provenance, not content — the same field a
    #: tombstone persists (SWR-3114), and the reason a removal noticed in a later
    #: process can still say *which file* stopped declaring the id (SWR-3119).
    source_path: str | None = None

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a baseline entry names the requirement it describes")
        return cleaned

    @classmethod
    def of(cls, requirement: CanonicalRequirement) -> Self:
        """The entry a freshly read requirement leaves behind."""
        return cls(
            req_id=requirement.req_id,
            content_hash=requirement.current_hash,
            source_hash=requirement.source_hash,
            lifecycle=requirement.lifecycle,
            source_path=requirement.source_path,
        )


@traces(SWR.SWR_3501)
class RequirementBaseline(BaseModel):
    """The requirement set the last evaluation of one source saw.

    :attr:`evaluated` is not derivable from :attr:`entries`: "this source has
    never been evaluated" and "this source was evaluated and held nothing" are
    different facts and produce different answers on the next pass — no changes
    at all versus one ``added`` per requirement. Collapsing them would make the
    first open of any workspace look like the whole store had just been written.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    #: The source's revision at that evaluation (SWR-3102). Empty when the source
    #: could not name one, which simply means the short-circuit cannot fire.
    revision: str = ""
    entries: tuple[BaselineEntry, ...] = ()
    #: False for a source no evaluation has ever seen.
    evaluated: bool = False

    @classmethod
    def unevaluated(cls, source_id: str) -> Self:
        """The baseline of a source nothing has ever been compared against."""
        return cls(source_id=source_id)

    @classmethod
    def of_read(cls, read: SourceRead) -> Self:
        """The baseline one source read leaves behind."""
        return cls(
            source_id=read.source_id,
            revision=read.revision,
            entries=tuple(
                BaselineEntry.of(requirement)
                for requirement in sorted(
                    read.requirements,
                    key=lambda requirement: requirement_sort_key(requirement.req_id),
                )
            ),
            evaluated=True,
        )

    def by_id(self) -> dict[str, BaselineEntry]:
        """The baseline indexed by requirement id (first wins on a duplicate)."""
        index: dict[str, BaselineEntry] = {}
        for entry in self.entries:
            index.setdefault(entry.req_id, entry)
        return index

    @property
    def req_ids(self) -> tuple[str, ...]:
        """Every id the last evaluation saw."""
        return tuple(entry.req_id for entry in self.entries)


@traces(SWR.SWR_3501)
class RequirementChange(BaseModel):
    """One requirement's difference from the last evaluated set.

    Carries both hashes on both sides, because "it changed" is not actionable and
    "``a1b2`` → ``c3d4``, artefact token unchanged" is: it says the *meaning*
    moved rather than the document around it, which is exactly the distinction
    impact analysis is about to make (SWR-3503).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    kind: ChangeKind
    before_hash: str = ""
    after_hash: str = ""
    before_source_hash: str | None = None
    after_source_hash: str | None = None
    #: The lifecycle before, when the requirement existed before.
    lifecycle_from: RequirementLifecycle | None = None
    #: The lifecycle now, when the requirement still exists.
    lifecycle_to: RequirementLifecycle | None = None
    source_id: str = ""
    #: Where it lives, for a report a user can act on.
    source_path: str | None = None
    #: The ``@traces`` / ``@verifies`` files claiming to implement it.
    sites: tuple[str, ...] = ()
    #: True when the requirement moved and *none* of its sites did — the signal
    #: ``reqtocode diff --strict`` fails on, restated source-agnostically
    #: (SWR-3501's fifth sentence).
    drift: bool = False

    @property
    def canonical_change(self) -> bool:
        """Whether the requirement's canonical content moved (SWR-3107)."""
        return self.before_hash != self.after_hash

    @property
    def artifact_change(self) -> bool:
        """Whether the source's own token for the artefact moved."""
        return self.before_source_hash != self.after_source_hash

    @property
    def lifecycle_moved(self) -> bool:
        """Whether the lifecycle differs across the two evaluations."""
        return (
            self.lifecycle_from is not None
            and self.lifecycle_to is not None
            and self.lifecycle_from is not self.lifecycle_to
        )

    @property
    def message(self) -> str:
        """One line: what happened to what, and whether anything followed it."""
        transition = (
            f" ({self.lifecycle_from} -> {self.lifecycle_to})" if self.lifecycle_moved else ""
        )
        drift = "; no implementation or test site was touched" if self.drift else ""
        return f"{self.req_id}: {self.kind}{transition}{drift}"


@traces(SWR.SWR_3501)
class ChangeSet(BaseModel):
    """Everything one detection pass over one source found.

    A value with the *reason* it is empty attached: nothing changed, the source's
    revision never moved, or this was the first evaluation. Those are three
    different facts, and a caller that cannot tell them apart cannot decide
    whether to schedule an impact analysis (SWR-3503) or to say nothing.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_id: str
    revision: str = ""
    changes: tuple[RequirementChange, ...] = ()
    #: True when the source had never been evaluated before this pass.
    first_evaluation: bool = False
    #: True when the source's revision matched the baseline and it was not read.
    unchanged_revision: bool = False

    @property
    def empty(self) -> bool:
        """Whether nothing at all differs."""
        return not self.changes

    def of_kind(self, *kinds: ChangeKind) -> tuple[RequirementChange, ...]:
        """Every change of the given kinds, in id order."""
        wanted = frozenset(kinds)
        return tuple(change for change in self.changes if change.kind in wanted)

    def by_id(self) -> dict[str, RequirementChange]:
        """The pass indexed by requirement id."""
        return {change.req_id: change for change in self.changes}

    @property
    def req_ids(self) -> tuple[str, ...]:
        """Every requirement this pass reports on, in id order."""
        return tuple(change.req_id for change in self.changes)

    @property
    def drifted(self) -> tuple[RequirementChange, ...]:
        """Every change whose implementation and test sites were not touched."""
        return tuple(change for change in self.changes if change.drift)

    def kinds(self) -> dict[str, int]:
        """How many of each class, for a one-line summary."""
        counts: dict[str, int] = {}
        for change in self.changes:
            counts[str(change.kind)] = counts.get(str(change.kind), 0) + 1
        return counts


def _drifted(
    *,
    sites: Sequence[str],
    touched: Collection[str],
    lifecycle: RequirementLifecycle | None,
    gated: bool,
    drift_lifecycles: Collection[RequirementLifecycle],
) -> bool:
    """Whether a change left its claimed sites untouched.

    *gated* restates ``reqtocode``'s asymmetry rather than smoothing it over: a
    *modified* requirement only drifts once its lifecycle says somebody relies on
    it, while a *removed* one drifts whatever its lifecycle was — the references
    are dangling either way.
    """
    if not sites:
        return False
    if gated and (lifecycle is None or lifecycle not in drift_lifecycles):
        return False
    return not any(site in touched for site in sites)


@traces(SWR.SWR_3501)
def classify_changes(
    baseline: RequirementBaseline,
    requirements: Sequence[CanonicalRequirement],
    *,
    revision: str = "",
    sites: Mapping[str, Sequence[str]] | None = None,
    touched_files: Collection[str] = (),
    drift_lifecycles: Collection[RequirementLifecycle] = DEFAULT_DRIFT_LIFECYCLES,
) -> ChangeSet:
    """Classify *requirements* against the set *baseline* recorded. Pure.

    Every difference lands in exactly one class. A requirement whose content hash
    moved is ``modified`` even when its lifecycle moved too — the lifecycle
    transition is then reported *on* the modification
    (:attr:`RequirementChange.lifecycle_from`) rather than as a second change,
    which is how ``reqtocode diff`` reports it and how a worklist stays one line
    per requirement.

    *sites* maps a requirement id to the files claiming to implement or cover it,
    and *touched_files* is what the change under evaluation touched; together they
    produce :attr:`RequirementChange.drift`. Both default to "unknown", and an
    unknown site index reports no drift rather than reporting everything as
    drifted.
    """
    if not baseline.evaluated:
        # Nothing to compare against. Reporting every requirement as ``added``
        # here is the classic first-run wave, and it would make the very first
        # evaluation of a real store look like 1500 new requirements.
        return ChangeSet(
            source_id=baseline.source_id,
            revision=revision,
            first_evaluation=True,
        )

    before = baseline.by_id()
    site_index = dict(sites) if sites is not None else {}
    changes: list[RequirementChange] = []
    seen: set[str] = set()

    for requirement in requirements:
        req_id = requirement.req_id
        seen.add(req_id)
        entry = before.get(req_id)
        req_sites = tuple(site_index.get(req_id, ()))
        if entry is None:
            changes.append(
                RequirementChange(
                    req_id=req_id,
                    kind=ChangeKind.ADDED,
                    after_hash=requirement.current_hash,
                    after_source_hash=requirement.source_hash,
                    lifecycle_to=requirement.lifecycle,
                    source_id=requirement.source_id,
                    source_path=requirement.source_path,
                    sites=req_sites,
                ),
            )
            continue
        canonical_moved = entry.content_hash != requirement.current_hash
        artifact_moved = entry.source_hash != requirement.source_hash
        lifecycle_moved = entry.lifecycle is not requirement.lifecycle
        if not (canonical_moved or artifact_moved or lifecycle_moved):
            continue
        kind = ChangeKind.MODIFIED if (canonical_moved or artifact_moved) else ChangeKind.STATUS
        changes.append(
            RequirementChange(
                req_id=req_id,
                kind=kind,
                before_hash=entry.content_hash,
                after_hash=requirement.current_hash,
                before_source_hash=entry.source_hash,
                after_source_hash=requirement.source_hash,
                lifecycle_from=entry.lifecycle,
                lifecycle_to=requirement.lifecycle,
                source_id=requirement.source_id,
                source_path=requirement.source_path,
                sites=req_sites,
                drift=(
                    kind is ChangeKind.MODIFIED
                    and _drifted(
                        sites=req_sites,
                        touched=touched_files,
                        lifecycle=requirement.lifecycle,
                        gated=True,
                        drift_lifecycles=drift_lifecycles,
                    )
                ),
            ),
        )

    for entry in baseline.entries:
        if entry.req_id in seen:
            continue
        req_sites = tuple(site_index.get(entry.req_id, ()))
        changes.append(
            RequirementChange(
                req_id=entry.req_id,
                kind=ChangeKind.REMOVED,
                before_hash=entry.content_hash,
                before_source_hash=entry.source_hash,
                lifecycle_from=entry.lifecycle,
                source_id=baseline.source_id,
                sites=req_sites,
                drift=_drifted(
                    sites=req_sites,
                    touched=touched_files,
                    lifecycle=entry.lifecycle,
                    gated=False,
                    drift_lifecycles=drift_lifecycles,
                ),
            ),
        )

    changes.sort(key=lambda change: requirement_sort_key(change.req_id))
    return ChangeSet(
        source_id=baseline.source_id,
        revision=revision,
        changes=tuple(changes),
    )


@traces(SWR.SWR_3501)
class DetectionResult(BaseModel):
    """What one detection pass produced: the changes, and the new baseline.

    The baseline travels with the change set so a caller cannot store one without
    the other — a pass whose changes were consumed but whose baseline was dropped
    would report the same changes again forever.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    changes: ChangeSet
    baseline: RequirementBaseline
    #: True when the source's revision had not moved, so it was never read.
    skipped: bool = False

    @property
    def source_id(self) -> str:
        """The source this pass was over."""
        return self.baseline.source_id


@traces(SWR.SWR_3501, SWR.SWR_3102)
class SourceChangeDetector:
    """Change detection over any adapter, with the read skipped when it can be.

    Holds no source and no state: both are arguments, so one detector serves
    every configured source and a test can drive it with three lines of fake.
    The only thing it owns is policy — which lifecycles can drift, and which
    files count as touched.
    """

    def __init__(
        self,
        *,
        drift_lifecycles: Collection[RequirementLifecycle] = DEFAULT_DRIFT_LIFECYCLES,
    ) -> None:
        self._drift_lifecycles = frozenset(drift_lifecycles)

    @property
    def drift_lifecycles(self) -> frozenset[RequirementLifecycle]:
        """Which lifecycles a modified requirement can be reported as drifted in."""
        return self._drift_lifecycles

    @traces(SWR.SWR_3501)
    def detect(
        self,
        source: RequirementSource,
        baseline: RequirementBaseline,
        *,
        sites: Mapping[str, Sequence[str]] | None = None,
        touched_files: Collection[str] = (),
    ) -> DetectionResult:
        """Compare *source* against *baseline*, reading it only if it moved.

        The revision check comes first and is the whole point of SWR-3102's third
        mandatory operation: a store of 1500 Markdown files that nobody edited
        must cost one hash, not 1500 file reads. A source that cannot name a
        revision the baseline recognises is simply read — an unknown revision is
        never treated as "unchanged".
        """
        if baseline.evaluated and baseline.revision:
            revision = source.revision()
            if revision == baseline.revision:
                return DetectionResult(
                    changes=ChangeSet(
                        source_id=baseline.source_id,
                        revision=revision,
                        unchanged_revision=True,
                    ),
                    baseline=baseline,
                    skipped=True,
                )
        read = source.read()
        changes = classify_changes(
            baseline,
            read.requirements,
            revision=read.revision,
            sites=sites,
            touched_files=touched_files,
            drift_lifecycles=self._drift_lifecycles,
        )
        return DetectionResult(changes=changes, baseline=RequirementBaseline.of_read(read))


# --------------------------------------------------------------------------
# What a change does to a delivered requirement (SWR-3502)
# --------------------------------------------------------------------------


class SpecificationVerdict(StrEnum):
    """What a requirement's hash says about its delivery right now (SWR-3502)."""

    #: Never delivered, or in a state a specification change does not touch. A
    #: requirement that was never ``Done`` is unaffected by hash changes — it has
    #: no claim to invalidate.
    UNAFFECTED = "unaffected"
    #: ``Done`` and the specification has moved since: → ``Needs Update``.
    DIVERGED = "diverged"
    #: ``Needs Update`` and the text is back at the delivered version, with
    #: current evidence: → ``Done``, without a new run.
    RESTORED = "restored"
    #: The text is back at the delivered version but its evidence is not current,
    #: so ``Done`` would be a claim nobody checked (SWR-3209, SWR-3215).
    AWAITING_EVIDENCE = "awaiting-evidence"
    #: Nothing to do: ``Done`` and still matching, or ``Needs Update`` and still
    #: diverged.
    STEADY = "steady"


@traces(SWR.SWR_3502)
class SpecificationAssessment(BaseModel):
    """One requirement's delivery, judged against the specification it now has.

    Carries the *retained* delivery — the hash, the run and the verified commit
    that were recorded when it was built — because that is the most valuable
    thing about a requirement that has just become ``Needs Update``: not "this is
    unbuilt" but "this was built, against that version, by that run" (SWR-3502).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    verdict: SpecificationVerdict
    state: DeliveryState
    #: The state this assessment asks for, or ``None`` when it asks for nothing.
    #: Never ``Backlog``: a delivered requirement whose text moved has not become
    #: unbuilt work, and SWR-3502's first acceptance criterion says so.
    target: DeliveryState | None = None
    current_hash: str = ""
    satisfied_hash: str | None = None
    #: The delivery that stands, kept whole so the run and the commit survive the
    #: transition (SWR-3204, SWR-3214).
    retained: SatisfiedDelivery | None = None
    evidence_current: bool = True

    @model_validator(mode="after")
    def _never_backlog(self) -> Self:
        if self.target is DeliveryState.BACKLOG:
            raise ValueError(
                f"{self.req_id}: a specification change never sends a delivered"
                " requirement back to Backlog (SWR-3502)",
            )
        return self

    @property
    def moves(self) -> bool:
        """Whether this assessment asks for a delivery transition."""
        return self.target is not None

    @property
    def message(self) -> str:
        """One line a card, a log line and an audit record can all use."""
        if self.verdict is SpecificationVerdict.DIVERGED:
            return (
                f"{self.req_id}: the specification changed since delivery"
                f" ({self.satisfied_hash} → {self.current_hash})"
            )
        if self.verdict is SpecificationVerdict.RESTORED:
            return (
                f"{self.req_id}: the specification is back at the delivered version"
                f" {self.satisfied_hash}; the delivery still stands"
            )
        if self.verdict is SpecificationVerdict.AWAITING_EVIDENCE:
            return (
                f"{self.req_id}: the specification is back at {self.satisfied_hash}"
                " but its evidence is not current, so Done is not re-granted"
            )
        return f"{self.req_id}: {self.verdict}"


@traces(SWR.SWR_3502, SWR.SWR_3204)
def assess_specification(
    record: DeliveryRecord,
    *,
    current_hash: str,
    evidence_current: bool = True,
) -> SpecificationAssessment:
    """What *record*'s delivery state should be, given the requirement's hash now.

    Pure, and the only rule SWR-3502 has:

    - ``Done`` and ``current_hash != satisfied_hash`` → ``Needs Update``, keeping
      the satisfied hash, the delivering run and the verified commit;
    - ``Needs Update`` and the text back at the satisfied version → ``Done``
      again, without a new run — *provided* the evidence is still current, since
      "the text is what we built" and "what we built still passes" are two
      claims and ``Done`` needs both (SWR-3215);
    - anything never delivered, and anything in another state, is unaffected: a
      hash change cannot invalidate a claim nobody made.

    *evidence_current* is injected rather than computed here so this stays free
    of the evidence projection (SWR-3207) and of everything it reads.
    """
    wanted = current_hash.strip()
    satisfied = record.satisfied.current
    satisfied_hash = record.satisfied_hash
    state = record.state

    if satisfied is None or satisfied_hash is None:
        return SpecificationAssessment(
            req_id=record.req_id,
            verdict=SpecificationVerdict.UNAFFECTED,
            state=state,
            current_hash=wanted,
            evidence_current=evidence_current,
        )

    matches = satisfied_hash == wanted

    def judged(
        verdict: SpecificationVerdict,
        target: DeliveryState | None = None,
    ) -> SpecificationAssessment:
        return SpecificationAssessment(
            req_id=record.req_id,
            verdict=verdict,
            state=state,
            target=target,
            current_hash=wanted,
            satisfied_hash=satisfied_hash,
            retained=satisfied,
            evidence_current=evidence_current,
        )

    if state is DeliveryState.DONE:
        if matches:
            return judged(SpecificationVerdict.STEADY)
        return judged(SpecificationVerdict.DIVERGED, DeliveryState.NEEDS_UPDATE)

    if state is DeliveryState.NEEDS_UPDATE:
        if not matches:
            return judged(SpecificationVerdict.STEADY)
        if not evidence_current:
            return judged(SpecificationVerdict.AWAITING_EVIDENCE)
        return judged(SpecificationVerdict.RESTORED, DeliveryState.DONE)

    # Delivered once, but since moved on by something else — a re-run in flight,
    # a blocker. The specification's opinion is not what decides those states.
    return judged(SpecificationVerdict.UNAFFECTED)


@runtime_checkable
class TransitionDoor(Protocol):
    """The one way a delivery state changes (SWR-3203).

    A protocol rather than the concrete
    :class:`~rotaris_core.requirements.delivery.transitions.DeliveryTransitions`,
    so this pass can be exercised without a workspace on disk — and so it can
    never reach around the state machine to write a record itself.
    """

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        """Attempt one transition, persisting it when it is accepted."""
        ...


@runtime_checkable
class AuditSink(Protocol):
    """Where a recorded specification change goes (SWR-3213).

    :class:`~rotaris_core.requirements.delivery.audit.AuditStore` satisfies this
    structurally; a test satisfies it with a list.
    """

    def append(self, event: AuditEvent) -> AuditEvent:
        """Record one event."""
        ...


@traces(SWR.SWR_3502)
class NeedsUpdateOutcome(BaseModel):
    """What one requirement's specification assessment actually produced."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    assessment: SpecificationAssessment
    #: The state machine's answer, or ``None`` when no transition was attempted.
    outcome: TransitionOutcome | None = None
    #: The audit record written, or ``None`` when nothing moved.
    event: AuditEvent | None = None

    @property
    def moved(self) -> bool:
        """Whether the delivery state actually changed."""
        return self.outcome is not None and self.outcome.accepted

    @property
    def refused(self) -> bool:
        """Whether a transition was attempted and the state machine refused it."""
        return self.outcome is not None and not self.outcome.accepted

    @property
    def message(self) -> str:
        """The transition's line when one happened, else the assessment's."""
        if self.outcome is not None:
            return self.outcome.message
        return self.assessment.message


@traces(SWR.SWR_3502, SWR.SWR_3213)
class NeedsUpdatePass:
    """Apply SWR-3502's rule through the state machine and the audit trail.

    Two collaborators, both injected and both narrow: a
    :class:`TransitionDoor` — because a delivery state may only move through
    :func:`~rotaris_core.requirements.delivery.transitions.apply_transition`
    (SWR-3203) and this pass must not be able to write a record itself — and an
    optional :class:`AuditSink`, because SWR-3502 asks for the transition to be
    recorded and SWR-3213 owns where.

    The audit event is written **only** for a transition the state machine
    accepted. A refused move that still left a "the specification changed" entry
    would make the trail claim something that did not happen, which is the one
    failure an audit trail may not have.

    **Propagation terminates by construction.** :meth:`run` walks a finite set of
    records exactly once, and the pass holds nothing that could ask for another
    evaluation: a :class:`TransitionDoor` moves one state, an
    :class:`AuditSink` appends one line, and neither is given a reference back
    here. An evaluation therefore cannot trigger an evaluation — the same
    property :class:`~rotaris_core.requirements.delivery.evaluation.RequirementEvaluator`
    enforces one layer up (SWR-3210).

    "By construction" is the claim, and a :class:`ReentrancyGuard` on :meth:`run`
    is the check. Both collaborators are *injected*, so the one thing this pass
    cannot verify about itself is that a door handed to it does not call back —
    and a re-entrant door would recurse here until the stack ran out. The guard
    turns that into a stated :class:`PropagationLoopError`.
    """

    def __init__(
        self,
        transitions: TransitionDoor,
        *,
        audit: AuditSink | None = None,
        actor: DeliveryActor = SPECIFICATION_ACTOR,
    ) -> None:
        self._transitions = transitions
        self._audit = audit
        self._actor = actor
        self._guard = ReentrancyGuard(f"{type(self).__name__}.run")

    @property
    def actor(self) -> DeliveryActor:
        """Who this pass acts as."""
        return self._actor

    @traces(SWR.SWR_3502)
    def request_for(
        self,
        assessment: SpecificationAssessment,
        *,
        at: dt.datetime,
    ) -> TransitionRequest | None:
        """The transition *assessment* asks for, or ``None`` when it asks for none.

        Exposed because it is the interesting half: a reviewer checking that a
        specification change can never send a requirement to ``Backlog``, or that
        a restore records no *new* delivery, reads this rather than a mock's call
        log. A restore re-states the delivery that already stands — SWR-3204
        refuses ``Done`` without one, and inventing a fresh record for a run that
        never happened would be worse than re-stating the real one.
        """
        if assessment.target is None:
            return None
        delivery = assessment.retained if assessment.target is DeliveryState.DONE else None
        return TransitionRequest(
            req_id=assessment.req_id,
            target=assessment.target,
            actor=self._actor,
            cause=TransitionCause.SPECIFICATION_CHANGED,
            at=at,
            requirement_hash=assessment.current_hash,
            delivery=delivery,
            run_id=assessment.retained.run_id if assessment.retained is not None else None,
            detail=assessment.message,
        )

    @traces(SWR.SWR_3502, SWR.SWR_3213)
    def apply(
        self,
        assessment: SpecificationAssessment,
        *,
        at: dt.datetime,
    ) -> NeedsUpdateOutcome:
        """Carry out *assessment*, recording what happened.

        An assessment that asks for nothing costs nothing: no transition, no
        audit line, no write. That is what makes this safe to run on every
        evaluation (SWR-3210) rather than only when someone remembers to.
        """
        request = self.request_for(assessment, at=at)
        if request is None:
            return NeedsUpdateOutcome(assessment=assessment)
        outcome = self._transitions.apply(request)
        if not outcome.accepted:
            return NeedsUpdateOutcome(assessment=assessment, outcome=outcome)
        event = self._record(assessment, at=at)
        return NeedsUpdateOutcome(assessment=assessment, outcome=outcome, event=event)

    def _record(
        self,
        assessment: SpecificationAssessment,
        *,
        at: dt.datetime,
    ) -> AuditEvent | None:
        """The ``specification-changed`` entry for an accepted move."""
        if self._audit is None:
            return None
        retained = assessment.retained
        event = AuditEvent(
            req_id=assessment.req_id,
            kind=AuditEventKind.SPECIFICATION_CHANGED,
            at=at,
            actor=self._actor,
            from_state=assessment.state,
            to_state=assessment.target,
            cause=TransitionCause.SPECIFICATION_CHANGED,
            reason=assessment.message,
            requirement_hash=assessment.current_hash,
            satisfied_hash=assessment.satisfied_hash,
            run_id=retained.run_id if retained is not None else None,
            commit=retained.verified_commit if retained is not None else None,
            evidence=(
                (f"evidence current: {assessment.evidence_current}",)
                if assessment.verdict
                in {SpecificationVerdict.RESTORED, SpecificationVerdict.AWAITING_EVIDENCE}
                else ()
            ),
            detail=str(assessment.verdict),
        )
        return self._audit.append(event)

    @traces(SWR.SWR_3502)
    def run(
        self,
        records: Iterable[DeliveryRecord],
        hashes: Mapping[str, str],
        *,
        at: dt.datetime,
        evidence_current: Mapping[str, bool] | None = None,
    ) -> tuple[NeedsUpdateOutcome, ...]:
        """Assess and apply a whole evaluation pass, in id order.

        A record whose requirement *hashes* does not name is skipped rather than
        assessed against an empty hash: a requirement the current read did not
        contain has been removed or failed to load, and both are SWR-3509's
        question, not this one's. Treating it as "hash changed to nothing" would
        move every delivered requirement of an unreadable source to ``Needs
        Update`` in one pass.

        Re-entered — by a transition door or an audit sink that evaluates on
        write — this raises :class:`PropagationLoopError` rather than starting a
        second pass over a half-applied state.
        """
        health = evidence_current or {}
        outcomes: list[NeedsUpdateOutcome] = []
        with self._guard:
            for record in sorted(records, key=lambda item: requirement_sort_key(item.req_id)):
                current = hashes.get(record.req_id)
                if current is None:
                    continue
                assessment = assess_specification(
                    record,
                    current_hash=current,
                    evidence_current=health.get(record.req_id, True),
                )
                outcomes.append(self.apply(assessment, at=at))
        return tuple(outcomes)
