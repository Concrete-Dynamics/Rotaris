"""Auditable, reproducible analysis records (SWR-3514).

Impact analysis is the one place where a model's judgement decides whether code
gets changed. Six months later the only defensible answer to "why did Rotaris
decide this change needed no code" is the record of that decision — its inputs,
its outcome, its reasoning, and who produced it. Without one, the delivery record
degrades to "an agent decided something once", which is exactly the claim this
product exists to replace.

**A record names the decider.** Persona *and* model, because neither answers the
other's question: "the impact-analyst persona" does not say which model's
judgement it was, and ``claude-opus-5`` does not say what it was asked to be. A
record carrying an outcome is refused without both (:class:`AnalysisRecord`
validates it), so an unattributable decision cannot be written at all. A record
of a *failed* analysis may leave them empty — there was no judgement to attribute
— and that asymmetry is the whole difference between "nobody decided" and "we do
not know who did".

**Inputs are recorded as identity, not as copies.** SWR-3114 forbids Rotaris from
storing requirement prose, so :class:`AnalysisInputs` holds the two version
hashes, the two source revisions, a digest of the diff and the site references —
never the text. That is still sufficient to re-run the analysis over the same
inputs: the versions are re-read from the source at the recorded revisions
(SWR-3102's history seam), the diff is recomputed from them, and
:meth:`AnalysisInputs.matches` proves the reconstruction *is* what was analysed
rather than something that merely resembles it. :meth:`AnalysisRecord.to_payload`
asserts the content-freedom rather than promising it.

**Append-only, like the audit trail it sits beside.** :class:`AnalysisLog` has
:meth:`~AnalysisLog.appended` and no method that removes, replaces or reorders a
record; :class:`AnalysisRecordStore` has exactly one write operation and it opens
the file in append mode. Re-running an analysis therefore *adds* a record — which
is what makes "the outcome changed after the model was upgraded" a visible fact
instead of a lost one (SWR-3514's fourth acceptance criterion).

**The link from an outcome to its record is computed, not carried.**
:func:`analysis_record_id` digests the decision's own fields, so the id an
analysis reports and the id its record is filed under cannot drift apart: they
are the same function of the same values. An outcome shown to a user is therefore
always one lookup away from the reasoning that produced it.

Pure with respect to the world apart from :class:`AnalysisRecordStore`: the
models take their timestamps as arguments and reach no clock, no network and no
model.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import json
import logging
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, JsonValue, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.store import (
    assert_no_requirement_content,
    record_filename,
)
from rotaris_core.requirements.hashing import content_hash
from rotaris_core.requirements.model import requirement_sort_key
from rotaris_core.requirements.tombstones import requirements_state_dir

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence
    from pathlib import Path

_log = logging.getLogger(__name__)

__all__ = [
    "ANALYSIS_SCHEMA_VERSION",
    "ANALYSIS_SUBDIRNAME",
    "AnalysisInputs",
    "AnalysisKind",
    "AnalysisLog",
    "AnalysisNotice",
    "AnalysisNoticeKind",
    "AnalysisRead",
    "AnalysisRecord",
    "AnalysisRecordStore",
    "analysis_filename",
    "analysis_record_id",
    "diff_digest",
]

#: Stamped on every line this build appends. A line written by a newer version is
#: reported and kept, never reinterpreted — the rule the delivery store (SWR-3205)
#: and the audit trail (SWR-3213) already apply.
ANALYSIS_SCHEMA_VERSION = 1

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding the logs.
ANALYSIS_SUBDIRNAME = "analyses"

#: Field/record separators for the digested payloads, so no value can impersonate
#: a field boundary. The same convention :mod:`rotaris_core.requirements.hashing`
#: uses, for the same reason.
_FIELD_SEP = "\x1f"
_RECORD_SEP = "\x1e"


class AnalysisKind(StrEnum):
    """Which judgement was made (SWR-3514).

    The three SWR-3514 names, and no catch-all: an analysis that fits none of
    them is a new kind of decision and should be visible as one rather than
    filed under ``other``.
    """

    #: Does this requirement change cost code, tests, both or nothing (SWR-3503).
    IMPACT = "impact"
    #: Into how many units does this requirement split (SWR-3404).
    DECOMPOSITION = "decomposition"
    #: What happens to each trace and test of a superseded requirement (SWR-3507).
    MIGRATION = "migration"

    @property
    def label(self) -> str:
        """``Impact`` — what an inspection panel prints."""
        return self.value.capitalize()


@traces(SWR.SWR_3514)
def diff_digest(lines: Sequence[str]) -> str:
    """A stable digest of a diff, so the recorded inputs can be re-checked.

    The diff itself is *not* recorded — it is requirement prose in another shape,
    and SWR-3114 keeps that in the source. The digest still answers the question
    the record has to answer: "is the diff I just recomputed the one that was
    analysed".
    """
    return content_hash("\n".join(lines))


@traces(SWR.SWR_3514, SWR.SWR_3114)
class AnalysisInputs(BaseModel):
    """What an analysis was given, recorded as identity rather than as content.

    Every field is a hash, a revision token or a code-site reference. None of
    them is requirement text, which is what lets the record live beside the
    delivery store without turning Rotaris into a second requirement repository
    (SWR-3114) — and what makes :meth:`to_payload`'s content assertion pass
    rather than merely be hoped for.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The requirement version the delivery was made against (SWR-3204).
    before_hash: str = ""
    #: The requirement version analysed against it (SWR-3107).
    after_hash: str = ""
    #: The source revisions the two versions were read at, so the *source* can
    #: reproduce them (SWR-3102). ``None`` for a source without history.
    before_revision: str | None = None
    after_revision: str | None = None
    #: Digest of the diff between the two versions — see :func:`diff_digest`.
    diff_digest: str = ""
    #: How large the diff was, so a record read later says whether "no impact"
    #: was decided over one line or over two hundred.
    diff_lines: int = 0
    #: ``@traces`` sites as ``path:line`` (SWR-3206).
    traces: tuple[str, ...] = ()
    #: ``@verifies`` sites as ``path:line``.
    tests: tuple[str, ...] = ()
    #: The requirement's evidence health at analysis time (SWR-3207), as its own
    #: token — a string rather than the enum, so a record written by a build with
    #: more states still reads.
    evidence: str = ""

    @field_validator("diff_lines")
    @classmethod
    def _not_negative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("a diff has a non-negative number of lines")
        return value

    @property
    def payload(self) -> str:
        """The exact string :attr:`digest` hashes.

        Exposed rather than hidden so a digest mismatch can be *explained*: two
        payloads can be diffed to see which input moved, instead of bisecting
        analyses.
        """
        records = [
            f"before{_FIELD_SEP}{self.before_hash}",
            f"after{_FIELD_SEP}{self.after_hash}",
            f"before-revision{_FIELD_SEP}{self.before_revision or ''}",
            f"after-revision{_FIELD_SEP}{self.after_revision or ''}",
            f"diff{_FIELD_SEP}{self.diff_digest}{_FIELD_SEP}{self.diff_lines}",
            f"evidence{_FIELD_SEP}{self.evidence}",
        ]
        records.extend(f"trace{_FIELD_SEP}{site}" for site in sorted(self.traces))
        records.extend(f"test{_FIELD_SEP}{site}" for site in sorted(self.tests))
        return _RECORD_SEP.join(records)

    @property
    def digest(self) -> str:
        """One token naming this exact set of inputs."""
        return content_hash(self.payload)

    def matches(self, other: AnalysisInputs) -> bool:
        """Whether *other* is the same set of inputs, re-derived.

        The operational meaning of SWR-3514's "sufficient to re-run": read both
        versions from the source at the recorded revisions, recompute the diff
        and the sites, and this answers whether what you rebuilt is what was
        analysed.
        """
        return self.digest == other.digest

    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form. Empty fields are omitted, never written as null."""
        payload: dict[str, JsonValue] = {}
        for key, value in (
            ("before_hash", self.before_hash),
            ("after_hash", self.after_hash),
            ("before_revision", self.before_revision),
            ("after_revision", self.after_revision),
            ("diff_digest", self.diff_digest),
            ("evidence", self.evidence),
        ):
            if value:
                payload[key] = value
        if self.diff_lines:
            payload["diff_lines"] = self.diff_lines
        if self.traces:
            payload["traces"] = list(self.traces)
        if self.tests:
            payload["tests"] = list(self.tests)
        return payload

    @classmethod
    def from_payload(cls, payload: Mapping[str, JsonValue]) -> Self:
        """Read persisted inputs, ignoring keys this build does not model."""
        return cls(
            before_hash=_text(payload.get("before_hash")),
            after_hash=_text(payload.get("after_hash")),
            before_revision=_optional(payload.get("before_revision")),
            after_revision=_optional(payload.get("after_revision")),
            diff_digest=_text(payload.get("diff_digest")),
            diff_lines=_count(payload.get("diff_lines")),
            traces=_strings(payload.get("traces")),
            tests=_strings(payload.get("tests")),
            evidence=_text(payload.get("evidence")),
        )


@traces(SWR.SWR_3514)
def analysis_record_id(
    *,
    kind: AnalysisKind,
    req_id: str,
    at: dt.datetime,
    inputs_digest: str,
    outcome: str,
    persona: str,
    model: str,
    reasoning: str,
) -> str:
    """The id under which this decision is filed.

    A function of the decision's own fields, so the id an outcome reports and the
    id its record carries are the same value by construction rather than by a
    caller remembering to copy one into the other (SWR-3514's third acceptance
    criterion). Two analyses of the same inputs at different moments get
    different ids, which is what makes a re-run an *appended* record instead of a
    collision.
    """
    payload = _RECORD_SEP.join(
        (
            f"kind{_FIELD_SEP}{kind}",
            f"req{_FIELD_SEP}{req_id.strip()}",
            f"at{_FIELD_SEP}{at.isoformat()}",
            f"inputs{_FIELD_SEP}{inputs_digest}",
            f"outcome{_FIELD_SEP}{outcome}",
            f"persona{_FIELD_SEP}{persona.strip()}",
            f"model{_FIELD_SEP}{model.strip()}",
            f"reasoning{_FIELD_SEP}{content_hash(reasoning.strip())}",
        ),
    )
    return content_hash(payload)


@traces(SWR.SWR_3514, SWR.SWR_3213)
class AnalysisRecord(BaseModel):
    """One analysis, complete enough to reconstruct the decision months later.

    Immutable and self-contained. The fields are the six things SWR-3514 asks
    for — inputs, outcome, reasoning, persona, model, timestamp — plus the
    identity that links an outcome back here.

    Two completeness rules are validated rather than documented:

    - a record carries an **outcome or a failure**, never both and never
      neither: an analysis that produced no answer and reported no reason is not
      a record of anything;
    - a record carrying an outcome **names its persona, its model and its
      reasoning**. An unattributed judgement is precisely what SWR-3514 exists
      to make impossible; a failed analysis may leave persona and model empty,
      because there was no judgement to attribute.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    record_id: str
    kind: AnalysisKind
    req_id: str
    at: dt.datetime
    inputs: AnalysisInputs = AnalysisInputs()
    #: The decision, as the analysing module's own token
    #: (``no-behavioural-impact``). A plain string rather than an enum per kind,
    #: so this module does not have to know every analysis' vocabulary and a
    #: record written by a build with more outcomes still reads.
    outcome: str = ""
    #: Why, in the analyst's words. Not requirement prose: an argument about it.
    reasoning: str = ""
    #: The facts the analyst says it weighed, quoted rather than referenced.
    considered: tuple[str, ...] = ()
    #: The question a ``human clarification required`` outcome asked (SWR-3506).
    question: str = ""
    #: Why no decision was reached. Empty for a decided analysis.
    failure: str = ""
    #: Which persona carried the judgement (``requirements.personas.impact``).
    persona: str = ""
    #: Which model produced it.
    model: str = ""
    schema_version: int = ANALYSIS_SCHEMA_VERSION

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an analysis record carries an aware timestamp, never a naive one")
        return value

    @field_validator("req_id", "record_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("an analysis record names the requirement it is about and itself")
        return cleaned

    @model_validator(mode="after")
    def _complete(self) -> Self:
        decided = bool(self.outcome.strip())
        failed = bool(self.failure.strip())
        if decided == failed:
            raise ValueError(
                "an analysis record states either the outcome it reached or why it"
                " reached none, never both and never neither (SWR-3514)",
            )
        if decided and not self.reasoning.strip():
            raise ValueError(
                f"{self.req_id}: an outcome without reasoning cannot be reviewed;"
                " SWR-3514 records the judgement, not only its verdict",
            )
        if decided and not (self.persona.strip() and self.model.strip()):
            raise ValueError(
                f"{self.req_id}: an analysis record names the persona and the model"
                " that produced the outcome (SWR-3514)",
            )
        return self

    @property
    def decided(self) -> bool:
        """Whether this record carries an outcome rather than a failure."""
        return bool(self.outcome.strip())

    @property
    def decider(self) -> str:
        """``impact-analyst (claude-opus-5)`` — who to attribute the judgement to."""
        if not self.persona and not self.model:
            return "no analyst"
        if not self.model:
            return self.persona
        return f"{self.persona} ({self.model})" if self.persona else self.model

    @property
    def message(self) -> str:
        """One line for a history view: what was decided, by whom, and when."""
        verdict = self.outcome if self.decided else f"no decision: {self.failure}"
        return (
            f"{self.req_id}: {self.kind} — {verdict} by {self.decider}"
            f" on {self.at.isoformat()} [{self.record_id}]"
        )

    def explains(self, record_id: str) -> bool:
        """Whether this is the record an outcome pointed at."""
        return self.record_id == record_id.strip()

    @traces(SWR.SWR_3514, SWR.SWR_3114)
    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form: one JSON object, one line, no requirement text.

        The content assertion runs on every write. It is not decoration: the
        reasoning of an analysis is free text a model produced, and the cheapest
        way for requirement prose to end up persisted is for someone to add a
        ``description`` of "what the requirement now says" to this record.
        """
        payload: dict[str, JsonValue] = {
            "schema_version": ANALYSIS_SCHEMA_VERSION,
            "record_id": self.record_id,
            "kind": str(self.kind),
            "req_id": self.req_id,
            "at": self.at.isoformat(),
            "inputs": self.inputs.to_payload(),
        }
        for key, value in (
            ("outcome", self.outcome),
            ("reasoning", self.reasoning),
            ("question", self.question),
            ("failure", self.failure),
            ("persona", self.persona),
            ("model", self.model),
        ):
            if value:
                payload[key] = value
        if self.considered:
            payload["considered"] = list(self.considered)
        assert_no_requirement_content(payload, where=f"analysis record {self.record_id}")
        return payload

    @classmethod
    def from_payload(cls, payload: Mapping[str, JsonValue]) -> Self:
        """One persisted line as a record, or a :class:`ValueError` naming the fault."""
        raw_kind = _text(payload.get("kind"))
        try:
            kind = AnalysisKind(raw_kind)
        except ValueError as exc:
            raise ValueError(f"unknown analysis kind {raw_kind!r}") from exc
        moment = dt.datetime.fromisoformat(_text(payload.get("at")))
        raw_inputs = payload.get("inputs")
        return cls(
            record_id=_text(payload.get("record_id")),
            kind=kind,
            req_id=_text(payload.get("req_id")),
            at=moment if moment.tzinfo is not None else moment.replace(tzinfo=dt.UTC),
            inputs=(
                AnalysisInputs.from_payload(raw_inputs)
                if isinstance(raw_inputs, dict)
                else AnalysisInputs()
            ),
            outcome=_text(payload.get("outcome")),
            reasoning=_text(payload.get("reasoning")),
            considered=_strings(payload.get("considered")),
            question=_text(payload.get("question")),
            failure=_text(payload.get("failure")),
            persona=_text(payload.get("persona")),
            model=_text(payload.get("model")),
        )


@traces(SWR.SWR_3514)
class AnalysisLog(BaseModel):
    """Every analysis of one requirement, oldest first.

    Append-only by construction: :meth:`appended` returns a new log and there is
    no method that removes, replaces or reorders a record. Re-running an analysis
    therefore leaves two records — which is how "the answer changed" stays
    visible (SWR-3514's fourth acceptance criterion) instead of the second run
    quietly erasing the first.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    records: tuple[AnalysisRecord, ...] = ()

    @property
    def empty(self) -> bool:
        """Whether no analysis of this requirement was ever recorded."""
        return not self.records

    @property
    def latest(self) -> AnalysisRecord | None:
        """The most recent analysis, or ``None`` when there is none."""
        return self.records[-1] if self.records else None

    def appended(self, record: AnalysisRecord) -> AnalysisLog:
        """This log with *record* as its newest entry.

        A record naming a different requirement is refused rather than filed:
        one requirement's reasoning attributed to another is worse than a gap.
        """
        if record.req_id != self.req_id:
            raise ValueError(
                f"{record.req_id}'s analysis cannot be appended to {self.req_id}'s log",
            )
        return AnalysisLog(req_id=self.req_id, records=(*self.records, record))

    def get(self, record_id: str) -> AnalysisRecord | None:
        """The record an outcome pointed at, or ``None`` when it is not here."""
        return next((record for record in self.records if record.explains(record_id)), None)

    def of_kind(self, *kinds: AnalysisKind) -> tuple[AnalysisRecord, ...]:
        """Every analysis of the given kinds, oldest first."""
        wanted = frozenset(kinds)
        return tuple(record for record in self.records if record.kind in wanted)

    def over(self, inputs: AnalysisInputs) -> tuple[AnalysisRecord, ...]:
        """Every analysis made over exactly these inputs, oldest first.

        What "re-running an analysis appends a record" is checked with, and what
        a reviewer asks when two runs disagreed: were they even given the same
        thing to look at.
        """
        return tuple(record for record in self.records if record.inputs.matches(inputs))

    def decided(self) -> tuple[AnalysisRecord, ...]:
        """Every analysis that reached an outcome."""
        return tuple(record for record in self.records if record.decided)


class AnalysisNoticeKind(StrEnum):
    """Why a recorded line did not load as written."""

    UNREADABLE = "unreadable"
    UNKNOWN_FIELD = "unknown-field"
    FUTURE_SCHEMA = "future-schema"
    ID_MISMATCH = "id-mismatch"


@traces(SWR.SWR_3514)
class AnalysisNotice(BaseModel):
    """One line that could not be read, reported instead of raised.

    A corrupted line costs its own record and nothing else: refusing the whole
    log would turn one bad byte into the loss of every decision ever made about
    a requirement.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: AnalysisNoticeKind
    req_id: str
    line: int
    path: str = ""
    detail: str = ""

    @property
    def message(self) -> str:
        """One line a diagnostic can print."""
        where = f"{self.path}:{self.line}" if self.path else f"line {self.line}"
        detail = f": {self.detail}" if self.detail else ""
        return f"{self.req_id} ({where}) — {self.kind}{detail}"


@traces(SWR.SWR_3514)
class AnalysisRead(BaseModel):
    """One log as it came off disk, together with what could not be read."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    log: AnalysisLog
    notices: tuple[AnalysisNotice, ...] = ()

    @property
    def degraded(self) -> bool:
        """Whether the log returned is less than what the file holds."""
        return bool(self.notices)


@traces(SWR.SWR_3514)
def analysis_filename(req_id: str) -> str:
    """The file a requirement's analyses live in — ``SWR-3503.jsonl``.

    The stem convention is the delivery store's (SWR-3205), reused rather than
    restated so an id that needs slugging is slugged the same way everywhere and
    a requirement's three files sit side by side.
    """
    return record_filename(req_id).removesuffix(".json") + ".jsonl"


@traces(SWR.SWR_3514, SWR.SWR_3114)
class AnalysisRecordStore:
    """The analysis logs on disk, one append-only file per requirement.

    **One write operation.** :meth:`append` opens the file in append mode and
    writes one line. There is deliberately no update, no delete and no
    compaction, so a record already written is byte-identical after every later
    write — the property an auditable decision trail rests on.

    Reading never fails: a corrupt line becomes an :class:`AnalysisNotice` and
    the remaining records still load.
    """

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/analyses/`` — where logs live."""
        return requirements_state_dir(self._workspace) / ANALYSIS_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s analyses are appended to."""
        return self.directory / analysis_filename(req_id)

    def append(self, record: AnalysisRecord) -> AnalysisRecord:
        """Record one analysis. The only write this store performs."""
        path = self.path_for(record.req_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(record.to_payload(), sort_keys=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(line + "\n")
        return record

    def extend(self, records: Iterable[AnalysisRecord]) -> tuple[AnalysisRecord, ...]:
        """Record several analyses, oldest first."""
        return tuple(self.append(record) for record in records)

    def load(self, req_id: str) -> AnalysisRead:
        """Read one log, degrading unreadable lines rather than raising."""
        path = self.path_for(req_id)
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return AnalysisRead(log=AnalysisLog(req_id=req_id))
        except OSError as exc:
            _log.warning("Unreadable analysis log %s: %s", path, exc)
            return AnalysisRead(
                log=AnalysisLog(req_id=req_id),
                notices=(
                    AnalysisNotice(
                        kind=AnalysisNoticeKind.UNREADABLE,
                        req_id=req_id,
                        line=0,
                        path=str(path),
                        detail=str(exc),
                    ),
                ),
            )
        records: list[AnalysisRecord] = []
        notices: list[AnalysisNotice] = []
        for number, raw in enumerate(text.splitlines(), start=1):
            if not raw.strip():
                continue
            record, notice = _read_line(raw, req_id=req_id, path=path, line=number)
            if record is not None:
                records.append(record)
            if notice is not None:
                notices.append(notice)
        return AnalysisRead(
            log=AnalysisLog(req_id=req_id, records=tuple(records)),
            notices=tuple(notices),
        )

    def read(self, req_id: str) -> AnalysisLog:
        """One log. The answer without the diagnostics."""
        return self.load(req_id).log

    def req_ids(self) -> tuple[str, ...]:
        """Every requirement with an analysis log, in natural id order.

        Read from the records themselves rather than from the file names: a
        slugged file name cannot be turned back into the id it came from, and
        guessing one would attribute a decision to the wrong requirement.
        """
        try:
            files = sorted(path for path in self.directory.glob("*.jsonl") if path.is_file())
        except OSError:
            return ()
        found: set[str] = set()
        for path in files:
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for raw in lines:
                if not raw.strip():
                    continue
                try:
                    payload = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(payload, dict) and isinstance(payload.get("req_id"), str):
                    found.add(payload["req_id"])
                    break
        return tuple(sorted(found, key=requirement_sort_key))


def _read_line(
    raw: str,
    *,
    req_id: str,
    path: Path,
    line: int,
) -> tuple[AnalysisRecord | None, AnalysisNotice | None]:
    """One persisted line as a record, or the notice explaining why not."""

    def notice(kind: AnalysisNoticeKind, detail: str) -> tuple[None, AnalysisNotice]:
        return None, AnalysisNotice(
            kind=kind,
            req_id=req_id,
            line=line,
            path=str(path),
            detail=detail,
        )

    try:
        payload = json.loads(raw)
    except ValueError as exc:
        return notice(AnalysisNoticeKind.UNREADABLE, str(exc))
    if not isinstance(payload, dict):
        return notice(AnalysisNoticeKind.UNREADABLE, "the record is not a JSON object")
    version = payload.get("schema_version")
    if isinstance(version, int) and version > ANALYSIS_SCHEMA_VERSION:
        return notice(
            AnalysisNoticeKind.FUTURE_SCHEMA,
            f"written by schema version {version}, this build reads {ANALYSIS_SCHEMA_VERSION}",
        )
    stored_id = payload.get("req_id")
    if isinstance(stored_id, str) and stored_id.strip() and stored_id != req_id:
        return notice(AnalysisNoticeKind.ID_MISMATCH, f"the line holds {stored_id!r}")
    try:
        return AnalysisRecord.from_payload(payload), None
    except ValueError as exc:
        return notice(AnalysisNoticeKind.UNKNOWN_FIELD, str(exc))


def _text(value: JsonValue) -> str:
    return value if isinstance(value, str) else ""


def _optional(value: JsonValue) -> str | None:
    return value if isinstance(value, str) and value else None


def _count(value: JsonValue) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _strings(value: JsonValue) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))
