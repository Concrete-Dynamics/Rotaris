"""Agentic impact analysis of a requirement change (SWR-3503).

A text change is not a behaviour change. Fixing a typo, rewording a sentence or
adding a link must not cost an agent run and a code change; changing an
acceptance criterion must. Nothing but a reading of both versions can tell the
two apart — which is why this is the one place in the whole board where a model's
judgement decides whether code gets modified.

That makes two properties non-negotiable, and both are structural here rather
than promised in prose.

**The analysis is read-only.** It is not "careful not to write"; it *has nothing
to write with*. :class:`ImpactAnalyzer` is constructed with a model, a persona, a
model name and a clock — no source, no store, no workspace, no path. Its input is
:class:`ImpactRequest`, a frozen value carrying two requirement versions, their
diff and some site references; there is no handle in it that could edit a file.
:func:`read_only_report` turns that from an argument into a check a test runs:
it walks the analyser's own attributes and names anything exposing a write
operation, and an empty report is the read-only guarantee (SWR-3503's third
acceptance criterion, and Gate 4's fourth question).

**Undecidable is an outcome; failed is not.** The six outcomes SWR-3503 lists are
the complete answer space, and an analysis that cannot decide answers
``human clarification required`` rather than guessing — a guess here becomes a
code change nobody asked for. An analysis that *failed* — no analyst configured,
the model raised — reaches no outcome at all: :attr:`ImpactAnalysis.failure`
states why, and the requirement stays in ``Needs Update`` with the failure
visible instead of in an invented state (SWR-3503's fourth acceptance criterion).
The two are different values here because they are different facts, and
collapsing them would let an outage read as "a human should look at this".

```text
ImpactRequest ─▶ ImpactAnalyzer.analyse()
                      │
                      ├── canonically identical ─▶ no-behavioural-impact   (no model call)
                      ├── no model / model raised ─▶ ImpactFailure          (no outcome)
                      └── ImpactModel.analyse() ─▶ read_verdict() ─▶ one of the six
                                                        │
                                                        └── unreadable ─▶ human clarification
```

Every analysis yields exactly one :class:`~rotaris_core.requirements.change.records.AnalysisRecord`
(SWR-3514) via :meth:`ImpactAnalysis.to_record`, and the id linking the two is
computed from the decision's own fields, so an outcome shown to a user is always
one lookup away from the reasoning behind it.

Pure with respect to the world: the clock is injected, the model is a protocol,
and nothing here opens a file, spawns a process or a socket. The persona is named
in configuration (``requirements.personas.impact``, SWR-3117) and resolved by the
caller.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import difflib
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.records import (
    AnalysisInputs,
    AnalysisKind,
    AnalysisRecord,
    analysis_record_id,
    diff_digest,
)
from rotaris_core.requirements.model import RequirementLifecycle

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "RULE_DECIDER",
    "RULE_PERSONA",
    "WRITE_OPERATIONS",
    "ImpactAnalysis",
    "ImpactAnalyzer",
    "ImpactFailure",
    "ImpactFailureKind",
    "ImpactModel",
    "ImpactOutcome",
    "ImpactRequest",
    "ProposedVerdict",
    "RequirementVersion",
    "read_only_report",
    "read_verdict",
    "version_diff",
]

#: Method names that mean "this object can change something". Used by
#: :func:`read_only_report` to check the analyser structurally rather than by
#: reading its constructor and trusting what it says.
WRITE_OPERATIONS: frozenset[str] = frozenset(
    {
        "create",
        "update",
        "delete",
        "write",
        "write_text",
        "write_bytes",
        "save",
        "commit",
        "unlink",
        "rename",
        "mkdir",
        "apply",
        "append",
        "extend",
    },
)

#: How many lines of context a requirement diff carries. Three is ``diff -u``'s
#: own default and enough for a reader to see which paragraph moved.
_DIFF_CONTEXT = 3

#: Who a *rule-based* outcome is attributed to. SWR-3514 requires every recorded
#: outcome to name its persona and its model, and the honest answer for the
#: canonically-identical short-circuit is "a deterministic comparison decided
#: this, no model was asked" — not the configured persona, which never saw it.
RULE_PERSONA = "change-detection"
RULE_DECIDER = "canonical-content-comparison"


@traces(SWR.SWR_3503)
class ImpactOutcome(StrEnum):
    """The complete answer space of an impact analysis (SWR-3503).

    Closed, and exactly the six SWR-3503 names. A seventh answer is not a new
    branch inside a function — it is a change to this enum, to the requirement
    and to everything that switches on it, which is what stops "it depends" from
    becoming a silent seventh outcome.
    """

    #: The change is wording, formatting or documentation. No run, no code.
    NO_BEHAVIOURAL_IMPACT = "no-behavioural-impact"
    #: The behaviour is unchanged but what proves it is not.
    TESTS_AFFECTED = "tests-affected"
    #: The behaviour changed; the existing tests still describe it.
    IMPLEMENTATION_AFFECTED = "implementation-affected"
    #: Both moved: the ordinary shape of a changed acceptance criterion.
    IMPLEMENTATION_AND_TESTS_AFFECTED = "implementation-and-tests-affected"
    #: Too large for one unit; SWR-3404 has to split it first.
    DECOMPOSITION_REQUIRED = "decomposition-required"
    #: Undecidable from the diff alone. A question, not a guess (SWR-3506).
    HUMAN_CLARIFICATION_REQUIRED = "human-clarification-required"

    @property
    def label(self) -> str:
        """``Implementation And Tests Affected`` — what a card prints."""
        return " ".join(part.capitalize() for part in self.value.split("-"))

    @property
    def touches_implementation(self) -> bool:
        """Whether implementation code has to change."""
        return self in {
            ImpactOutcome.IMPLEMENTATION_AFFECTED,
            ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED,
        }

    @property
    def touches_tests(self) -> bool:
        """Whether covering tests have to change."""
        return self in {
            ImpactOutcome.TESTS_AFFECTED,
            ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED,
        }

    @property
    def costs_a_run(self) -> bool:
        """Whether an agent run follows from this outcome (SWR-3505).

        ``no behavioural impact`` and the two blocking outcomes cost none: the
        first because there is nothing to build (SWR-3504), the other two because
        something has to happen before anything can be built.
        """
        return self.touches_implementation or self.touches_tests

    @property
    def blocks(self) -> bool:
        """Whether this outcome stops work until somebody acts (SWR-3506)."""
        return self in {
            ImpactOutcome.DECOMPOSITION_REQUIRED,
            ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
        }


@traces(SWR.SWR_3503)
class RequirementVersion(BaseModel):
    """One version of a requirement's canonical content, as read from its source.

    A transient value: it is built from a
    :class:`~rotaris_core.requirements.model.CanonicalRequirement` for the length
    of one analysis and never persisted. What *is* persisted is its hash
    (SWR-3514, SWR-3114) — the text stays where it belongs, in the source.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    title: str = ""
    description: str = ""
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    content_hash: str = ""
    #: The source revision this version was read at (SWR-3102), so the analysis
    #: can be re-run against exactly the same two versions.
    source_revision: str | None = None

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a requirement version names the requirement it is a version of")
        return cleaned

    @classmethod
    def of(cls, requirement: CanonicalRequirement) -> Self:
        """The analysable version of a canonical requirement."""
        return cls(
            req_id=requirement.req_id,
            title=requirement.title,
            description=requirement.description,
            lifecycle=requirement.lifecycle,
            content_hash=requirement.current_hash,
            source_revision=requirement.source_revision,
        )

    @property
    def lines(self) -> tuple[str, ...]:
        """The version as text to diff: the fields the canonical hash covers.

        Labelled rather than concatenated, so a diff shows *which* field moved —
        "the title changed" and "a sentence of the description changed" are
        different signals to an analyst and must not read alike.
        """
        return (
            f"title: {self.title}",
            f"lifecycle: {self.lifecycle}",
            "description:",
            *self.description.splitlines(),
        )


@traces(SWR.SWR_3503)
def version_diff(before: RequirementVersion, after: RequirementVersion) -> tuple[str, ...]:
    """The unified diff between two versions of one requirement. Pure.

    Empty when the two are textually identical, which is the cheap answer this
    module short-circuits on: two canonically identical versions cannot have a
    behavioural difference, so no model is worth consulting about them.
    """
    return tuple(
        difflib.unified_diff(
            list(before.lines),
            list(after.lines),
            fromfile=f"{before.req_id}@{before.content_hash or 'satisfied'}",
            tofile=f"{after.req_id}@{after.content_hash or 'current'}",
            n=_DIFF_CONTEXT,
            lineterm="",
        ),
    )


@traces(SWR.SWR_3503, SWR.SWR_3514)
class ImpactRequest(BaseModel):
    """Everything an impact analysis is given — and nothing it could write with.

    The four inputs SWR-3503 names: the requirement diff, the existing traces,
    the existing tests, and the evidence health. Values only: the traces and
    tests are ``path:line`` references and the evidence is a token, so an analyst
    can reason about what exists without being handed anything that could change
    it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The version the delivery was made against (SWR-3204).
    before: RequirementVersion
    #: The version the requirement now has (SWR-3107).
    after: RequirementVersion
    diff: tuple[str, ...] = ()
    #: ``@traces`` sites as ``path:line`` (SWR-3206).
    traces: tuple[str, ...] = ()
    #: ``@verifies`` sites as ``path:line``.
    tests: tuple[str, ...] = ()
    #: The requirement's evidence health (SWR-3207), as its own token.
    evidence: str = ""
    #: The run that delivered :attr:`before`, for the record (SWR-3514).
    delivering_run: str | None = None
    verified_commit: str | None = None

    @model_validator(mode="after")
    def _one_requirement(self) -> Self:
        if not (self.req_id == self.before.req_id == self.after.req_id):
            raise ValueError(
                f"an impact request analyses one requirement; got {self.req_id!r},"
                f" {self.before.req_id!r} and {self.after.req_id!r}",
            )
        return self

    # No ``@traces`` decorator here on purpose: inside this class body the name
    # ``traces`` is the *field* above, not the annotation helper. The class
    # itself carries the annotation.
    @classmethod
    def between(
        cls,
        before: RequirementVersion,
        after: RequirementVersion,
        *,
        traces: Sequence[str] = (),
        tests: Sequence[str] = (),
        evidence: str = "",
        delivering_run: str | None = None,
        verified_commit: str | None = None,
    ) -> Self:
        """The request for the change from *before* to *after*, diff computed."""
        return cls(
            req_id=after.req_id,
            before=before,
            after=after,
            diff=version_diff(before, after),
            traces=tuple(traces),
            tests=tuple(tests),
            evidence=evidence,
            delivering_run=delivering_run,
            verified_commit=verified_commit,
        )

    @property
    def identical(self) -> bool:
        """Whether the two versions carry the same canonical content.

        Checked on the *text*, not on the hashes: a source that supplies its own
        hash (SWR-3103) can report two tokens for one meaning, and answering
        "changed" for two identical texts would schedule a run for nothing.
        """
        return not self.diff

    @property
    def has_tests(self) -> bool:
        """Whether anything claims to cover this requirement today."""
        return bool(self.tests)

    @property
    def inputs(self) -> AnalysisInputs:
        """This request as the recordable, content-free identity of its inputs."""
        return AnalysisInputs(
            before_hash=self.before.content_hash,
            after_hash=self.after.content_hash,
            before_revision=self.before.source_revision,
            after_revision=self.after.source_revision,
            diff_digest=diff_digest(self.diff),
            diff_lines=len(self.diff),
            traces=self.traces,
            tests=self.tests,
            evidence=self.evidence,
        )


class ImpactFailureKind(StrEnum):
    """Why an analysis reached no outcome at all."""

    #: No analyst was configured, so nothing could be asked.
    NO_ANALYST = "no-analyst"
    #: The model raised, timed out or was unreachable.
    MODEL_ERROR = "model-error"


@traces(SWR.SWR_3503)
class ImpactFailure(BaseModel):
    """An analysis that did not happen, stated rather than invented.

    Deliberately *not* an :class:`ImpactOutcome`. A failure that arrived as
    ``human clarification required`` would put a question in front of a user that
    nobody asked, and one that arrived as ``no behavioural impact`` would let an
    outage close a requirement.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: ImpactFailureKind
    detail: str = ""

    @property
    def message(self) -> str:
        """One line naming what failed."""
        return f"{self.kind}: {self.detail}" if self.detail else str(self.kind)


@traces(SWR.SWR_3503)
class ProposedVerdict(BaseModel):
    """What an analyst answered, after validation but before it is recorded.

    Separate from :class:`ImpactAnalysis` because the two are produced by
    different things: this is the model's claim, that is Rotaris' record of
    having asked. Keeping them apart is what lets :func:`read_verdict` downgrade
    an unreadable claim to ``human clarification required`` without the analyser
    having to know how a payload is shaped.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    outcome: ImpactOutcome
    reasoning: str = ""
    #: The facts the analyst says it weighed.
    considered: tuple[str, ...] = ()
    #: The question to put to a human, for a clarification outcome (SWR-3506).
    question: str = ""


def _text_of(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _strings_of(value: object) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value.strip(),) if value.strip() else ()
    if isinstance(value, list | tuple):
        return tuple(item.strip() for item in value if isinstance(item, str) and item.strip())
    return ()


@traces(SWR.SWR_3503)
def read_verdict(payload: Mapping[str, object]) -> ProposedVerdict:
    """Read an analyst's answer, downgrading anything unreadable. Pure.

    Three ways a payload fails, and all three land on ``human clarification
    required`` with the reason stated rather than on a guess:

    - the ``outcome`` names none of the six;
    - the ``outcome`` is missing entirely;
    - the outcome is valid but carries no reasoning — an answer nobody can check
      is not an answer, and acting on it would make SWR-3514's record a record of
      nothing.

    The undecided answer keeps whatever reasoning and question the analyst *did*
    provide, so the human who has to look at it is not starting from an empty
    page.
    """
    raw = _text_of(payload.get("outcome"))
    reasoning = _text_of(payload.get("reasoning")) or _text_of(payload.get("rationale"))
    considered = _strings_of(payload.get("considered"))
    question = _text_of(payload.get("question"))

    def undecided(why: str) -> ProposedVerdict:
        return ProposedVerdict(
            outcome=ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
            reasoning=f"{why}{f'; the analyst said: {reasoning}' if reasoning else ''}",
            considered=considered,
            question=question,
        )

    if not raw:
        return undecided("the analysis named no outcome")
    try:
        outcome = ImpactOutcome(raw)
    except ValueError:
        return undecided(f"the analysis answered {raw!r}, which is not one of the six outcomes")
    if not reasoning:
        return undecided(f"the analysis answered {outcome} without stating why")
    return ProposedVerdict(
        outcome=outcome,
        reasoning=reasoning,
        considered=considered,
        question=question,
    )


@traces(SWR.SWR_3503, SWR.SWR_3514)
class ImpactAnalysis(BaseModel):
    """One impact analysis: what was asked, what came back, and who answered.

    Exactly one of :attr:`outcome` and :attr:`failure` is set — "decided" and
    "could not be asked" are different facts and a caller must not be able to
    read one as the other. :attr:`record_id` is derived from the analysis' own
    fields, so the id a card shows and the id the record is filed under are the
    same value by construction (SWR-3514).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    at: dt.datetime
    inputs: AnalysisInputs = AnalysisInputs()
    outcome: ImpactOutcome | None = None
    reasoning: str = ""
    considered: tuple[str, ...] = ()
    question: str = ""
    failure: ImpactFailure | None = None
    persona: str = ""
    model: str = ""

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an impact analysis carries an aware timestamp, never a naive one")
        return value

    @model_validator(mode="after")
    def _one_answer(self) -> Self:
        if (self.outcome is None) == (self.failure is None):
            raise ValueError(
                "an impact analysis either reached one of the six outcomes or states"
                " why it reached none, never both and never neither (SWR-3503)",
            )
        if self.outcome is not None and not self.reasoning.strip():
            raise ValueError(
                f"{self.req_id}: an outcome without reasoning cannot be reviewed (SWR-3503)",
            )
        return self

    @property
    def decided(self) -> bool:
        """Whether an outcome was reached."""
        return self.outcome is not None

    @property
    def costs_a_run(self) -> bool:
        """Whether work follows from this analysis. A failure never does."""
        return self.outcome is not None and self.outcome.costs_a_run

    @property
    def record_id(self) -> str:
        """The id of the record that explains this outcome (SWR-3514)."""
        return analysis_record_id(
            kind=AnalysisKind.IMPACT,
            req_id=self.req_id,
            at=self.at,
            inputs_digest=self.inputs.digest,
            outcome=str(self.outcome) if self.outcome is not None else "",
            persona=self.persona,
            model=self.model,
            reasoning=self.reasoning,
        )

    @property
    def message(self) -> str:
        """One line: what was decided about what, and by whom."""
        if self.failure is not None:
            return (
                f"{self.req_id}: impact analysis did not run ({self.failure.message});"
                " the requirement stays in Needs Update"
            )
        return f"{self.req_id}: {self.outcome} — {self.reasoning}"

    @traces(SWR.SWR_3514)
    def to_record(self) -> AnalysisRecord:
        """The auditable record of this analysis (SWR-3514).

        Exactly one per analysis, decided or failed. A failed analysis leaves a
        record too: "we asked and the model was unreachable" is a fact a reviewer
        needs months later just as much as a verdict is.
        """
        return AnalysisRecord(
            record_id=self.record_id,
            kind=AnalysisKind.IMPACT,
            req_id=self.req_id,
            at=self.at,
            inputs=self.inputs,
            outcome=str(self.outcome) if self.outcome is not None else "",
            reasoning=self.reasoning,
            considered=self.considered,
            question=self.question,
            failure=self.failure.message if self.failure is not None else "",
            persona=self.persona,
            model=self.model,
        )


@runtime_checkable
class ImpactModel(Protocol):
    """Whatever reads two requirement versions and judges the difference.

    One method, taking a value and answering a payload — so the whole decision
    path is exercised in unit tests against three lines of fake and never reaches
    a network. The real implementation runs the configured persona
    (``requirements.personas.impact``, SWR-3117); this module never learns which.

    The protocol has no write operation, which is not an oversight: an analyst
    that could edit is exactly what SWR-3503's third acceptance criterion
    forbids.
    """

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        """Answer *request* with an outcome and its reasoning."""
        ...


@traces(SWR.SWR_3503)
def read_only_report(analyzer: object) -> tuple[str, ...]:
    """Name every write operation reachable from *analyzer*'s own attributes.

    The read-only guarantee, as a check rather than a claim: an impact analyser
    holds a model, a persona, a model name and a clock, and none of those may
    expose a way to change a file, a record or a requirement. An empty result is
    the guarantee; a non-empty one names ``attribute.operation`` so the offending
    collaborator is obvious.

    Deliberately shallow — one level of attributes. A deep walk would report the
    write methods of every string and every module a value transitively touches,
    and a check that always fires is a check nobody reads.
    """
    found: list[str] = []
    for name, value in sorted(vars(analyzer).items()):
        if value is None or isinstance(value, str | int | float | bool | bytes):
            continue
        found.extend(
            f"{name.lstrip('_')}.{operation}"
            for operation in sorted(WRITE_OPERATIONS)
            if callable(getattr(value, operation, None))
        )
    return tuple(found)


def _utc_now() -> dt.datetime:
    """The default clock, replaced in every test."""
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3503, SWR.SWR_3514)
class ImpactAnalyzer:
    """Decide what a requirement change costs, and record how the decision was made.

    Everything that could reach the world is injected: the model is a protocol
    and the clock is a callable. Everything else — when the model is consulted at
    all, what an answer may contain, and what happens when it cannot be read — is
    this class, and it is exercised end to end without a network.

    **Nothing here can write.** The constructor takes no source, no store and no
    path, so there is no handle to misuse; :func:`read_only_report` is the check
    that keeps it that way as the class grows.
    """

    def __init__(
        self,
        *,
        model: ImpactModel | None = None,
        persona: str = "",
        model_name: str = "",
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._model = model
        self._persona = persona.strip()
        self._model_name = model_name.strip()
        self._clock = clock
        if model is not None and not (self._persona and self._model_name):
            # Refused at construction rather than at the first analysis: an
            # analyst nobody can name produces records nobody can audit, and
            # discovering that when the first requirement changed is too late
            # (SWR-3514).
            raise ValueError(
                "an impact analyst is configured with both the persona and the model"
                " its outcomes are recorded against (SWR-3514)",
            )

    @property
    def persona(self) -> str:
        """The persona carrying the judgement (SWR-3117)."""
        return self._persona

    @property
    def model_name(self) -> str:
        """The model recorded as having produced the outcome (SWR-3514)."""
        return self._model_name

    @property
    def available(self) -> bool:
        """Whether an analyst is configured at all."""
        return self._model is not None

    @traces(SWR.SWR_3503)
    def analyse(self, request: ImpactRequest) -> ImpactAnalysis:
        """Judge *request*, or state why no judgement was reached.

        Three paths, in the order they cost:

        1. **canonically identical versions** — answered ``no behavioural
           impact`` without a model call. Two texts that normalise to the same
           thing cannot differ in behaviour, and paying for a model to say so
           would put a prompt on the path of every whitespace change;
        2. **no analyst, or the model raised** — an :class:`ImpactFailure`. The
           requirement stays in ``Needs Update`` with the failure stated;
        3. **an answer** — validated by :func:`read_verdict`, which downgrades
           anything unreadable to ``human clarification required``.
        """
        at = self._clock()
        if request.identical:
            return self._decided(
                request,
                ProposedVerdict(
                    outcome=ImpactOutcome.NO_BEHAVIOURAL_IMPACT,
                    reasoning=(
                        f"{request.req_id}: the two versions are canonically identical"
                        " — the edit did not reach the requirement's meaning"
                    ),
                    considered=("canonical diff is empty",),
                ),
                at=at,
                persona=RULE_PERSONA,
                model=RULE_DECIDER,
            )
        if self._model is None:
            return self._failed(
                request,
                ImpactFailure(
                    kind=ImpactFailureKind.NO_ANALYST,
                    detail=("no impact analyst is configured, so the change was never judged"),
                ),
                at=at,
            )
        try:
            payload = self._model.analyse(request)
        except Exception as error:  # noqa: BLE001 - any analyst failure is a stated result
            return self._failed(
                request,
                ImpactFailure(
                    kind=ImpactFailureKind.MODEL_ERROR,
                    detail=f"{type(error).__name__}: {error}",
                ),
                at=at,
            )
        return self._decided(request, read_verdict(payload), at=at)

    def _decided(
        self,
        request: ImpactRequest,
        verdict: ProposedVerdict,
        *,
        at: dt.datetime,
        persona: str | None = None,
        model: str | None = None,
    ) -> ImpactAnalysis:
        return ImpactAnalysis(
            req_id=request.req_id,
            at=at,
            inputs=request.inputs,
            outcome=verdict.outcome,
            reasoning=verdict.reasoning,
            considered=verdict.considered,
            question=verdict.question,
            persona=persona if persona is not None else self._persona,
            model=model if model is not None else self._model_name,
        )

    def _failed(
        self,
        request: ImpactRequest,
        failure: ImpactFailure,
        *,
        at: dt.datetime,
    ) -> ImpactAnalysis:
        return ImpactAnalysis(
            req_id=request.req_id,
            at=at,
            inputs=request.inputs,
            failure=failure,
            persona=self._persona,
            model=self._model_name,
        )
