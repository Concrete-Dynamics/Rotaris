"""The append-only audit trail of one requirement (SWR-3213).

A task tracker can say a card is done. The advantage Rotaris claims over one is
that every such claim can be traced to something that actually happened — and
that only holds if the events are written *as they happen*, each naming its actor
and its cause, and never rewritten afterwards.

**Nine questions, one trail.** SWR-3213 lists what the trail has to answer, and
each is a query here rather than a reconstruction someone performs by reading
records:

| Question | Query |
| --- | --- |
| who changed the specification | :meth:`AuditTrail.last_specification_change` → ``.actor`` |
| and when | the same event's ``.at`` |
| which requirement version was implemented | :meth:`AuditTrail.implemented_versions` |
| which run implemented it | :meth:`AuditTrail.implementing_run` |
| which files that run changed | :meth:`AuditTrail.files_changed_by` |
| which tests verify it | :meth:`AuditTrail.verifying_tests` |
| when it was last successfully verified | :meth:`AuditTrail.last_verified_at` |
| which commit carries the satisfied hash | :meth:`AuditTrail.commit_for` |
| which requirements it superseded | :meth:`AuditTrail.superseded` |

**Append-only is a property of the code, not a promise in prose.**
:class:`AuditStore` has exactly one write operation and it opens the file in
append mode; there is no update, no delete, no compaction, and no method that
takes an event's position. A record already on disk is therefore byte-identical
after every later write, which is what the tests assert.

**It outlives the requirement.** Nothing here deletes a trail, so a requirement
the sources no longer declare (SWR-3113) keeps its history: "what happened to
SWR-1234 before it was retired" stays answerable, which is the case a trail that
is garbage-collected with its subject cannot serve.

**Not the revision history.** This trail records what *Rotaris* did — states,
runs, verifications, write-backs. The history of the requirement's *text* is
git's and the source's, and it is assembled on read by
:mod:`~rotaris_core.requirements.delivery.history` (SWR-3214). Keeping them apart
is what stops Rotaris from becoming a second store of requirement content
(SWR-3114).
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import json
import logging
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, JsonValue, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.state import (
    ActorKind,
    DeliveryActor,
    DeliveryState,
    TransitionCause,
    parse_delivery_state,
)
from rotaris_core.requirements.delivery.store import (
    assert_no_requirement_content,
    record_filename,
)
from rotaris_core.requirements.model import requirement_sort_key
from rotaris_core.requirements.tombstones import requirements_state_dir

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping, Sequence
    from pathlib import Path

    from rotaris_core.requirements.delivery.completion import CompletionOverride, CompletionReport
    from rotaris_core.requirements.delivery.transitions import TransitionRecord

_log = logging.getLogger(__name__)

__all__ = [
    "AUDIT_SCHEMA_VERSION",
    "AUDIT_SUBDIRNAME",
    "AuditEvent",
    "AuditEventKind",
    "AuditNotice",
    "AuditNoticeKind",
    "AuditRead",
    "AuditStore",
    "AuditTrail",
    "audit_filename",
    "override_event",
    "record_overrides",
]

#: Stamped on every line this build appends. A line written by a newer version is
#: reported and kept, never reinterpreted — the same rule the delivery store
#: applies to its records (SWR-3205).
AUDIT_SCHEMA_VERSION = 1

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding the trails.
AUDIT_SUBDIRNAME = "audit"


class AuditEventKind(StrEnum):
    """What kind of thing happened.

    Every one of them is something Rotaris *did* or *observed*, never something
    it inferred: an inference can be recomputed from the trail, and recording it
    would make the trail disagree with itself the day the inference changes.
    """

    #: The specification itself moved (SWR-3501 detected an edit).
    SPECIFICATION_CHANGED = "specification-changed"
    #: A delivery state moved (SWR-3203). One per accepted transition.
    DELIVERY_TRANSITION = "delivery-transition"
    RUN_STARTED = "run-started"
    RUN_FINISHED = "run-finished"
    #: A verification pass over the requirement's covering tests (SWR-2606).
    VERIFICATION = "verification"
    #: Rotaris wrote to the requirement's own artefact (SWR-3111).
    WRITE_BACK = "write-back"
    #: This requirement replaced others (SWR-3109).
    SUPERSEDED = "superseded"
    #: The completion conditions were overridden by a named actor (SWR-3215).
    COMPLETION_OVERRIDE = "completion-override"


@traces(SWR.SWR_3213)
class AuditEvent(BaseModel):
    """One thing that happened to one requirement, as it was recorded.

    Immutable and self-contained: everything needed to understand the entry is
    *in* the entry, because a trail read months later has no access to the world
    that produced it. The fields that are empty for a given kind stay empty
    rather than being repurposed — a ``run_id`` on a specification change would
    be a guess, and a guess in an audit trail is worse than a gap.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    kind: AuditEventKind
    at: dt.datetime
    #: Who did it — a person, or a named part of Rotaris (SWR-3203).
    actor: DeliveryActor
    #: Position in the trail, assigned on read from the file's own order. Never
    #: persisted: the order *is* the file, and a stored counter would be a second
    #: source of truth that two concurrent appends could disagree about.
    seq: int = 0
    from_state: DeliveryState | None = None
    to_state: DeliveryState | None = None
    cause: TransitionCause | None = None
    #: Why, in the actor's own words — a blocker's reason, an override's
    #: justification, a change's motive.
    reason: str = ""
    #: The requirement's ``current_hash`` when this happened (SWR-3107).
    requirement_hash: str = ""
    #: The version recorded as delivered, for the events that deliver one.
    satisfied_hash: str | None = None
    run_id: str | None = None
    #: The commit this event points at: the verified commit of a delivery, the
    #: commit a write-back produced.
    commit: str | None = None
    #: Repository-relative paths this run changed.
    changed_files: tuple[str, ...] = ()
    #: Covering tests, as ``path`` or ``path:line``.
    tests: tuple[str, ...] = ()
    #: Whether a :attr:`AuditEventKind.VERIFICATION` succeeded. Meaningless for
    #: every other kind, and left ``False`` there rather than ``None`` so the
    #: "last successful verification" query never has to guess.
    verified: bool = False
    #: Requirements this one replaced (SWR-3109).
    superseded_ids: tuple[str, ...] = ()
    #: The evidence the decision rested on, quoted rather than referenced: the
    #: unmet conditions of a refusal, the gate's verdict, the tests that ran.
    #: A reference would rot; the sentence stays readable in ten years.
    evidence: tuple[str, ...] = ()
    detail: str = ""

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an audit record carries an aware timestamp, never a naive one")
        return value

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("an audit record names the requirement it is about")
        return cleaned

    @classmethod
    @traces(SWR.SWR_3213)
    def of_transition(
        cls,
        transition: TransitionRecord,
        *,
        evidence: Sequence[str] = (),
        commit: str | None = None,
    ) -> Self:
        """The audit record of one accepted delivery transition (SWR-3203).

        The bridge between the state machine and the trail: every accepted
        transition produces exactly one :class:`TransitionRecord`, and every one
        of those becomes exactly one event here, so "every delivery transition
        appends a record" needs no discipline at the call site.
        """
        return cls(
            req_id=transition.req_id,
            kind=AuditEventKind.DELIVERY_TRANSITION,
            at=transition.at,
            actor=transition.actor,
            from_state=transition.source,
            to_state=transition.target,
            cause=transition.cause,
            reason=transition.reason,
            requirement_hash=transition.requirement_hash,
            satisfied_hash=transition.satisfied_hash,
            run_id=transition.run_id,
            commit=commit,
            evidence=tuple(evidence),
            detail=transition.detail,
        )

    @classmethod
    @traces(SWR.SWR_3213, SWR.SWR_3215)
    def of_override(
        cls,
        override: CompletionOverride,
        *,
        req_id: str,
        forgiven: Sequence[str] = (),
        run_id: str | None = None,
    ) -> Self:
        """The audit record of a forced completion (SWR-3215).

        Recorded *as an override* rather than as an ordinary acceptance: the
        conditions that did not hold are quoted in :attr:`evidence`, so the trail
        answers "was this Done earned or granted" without anyone having to
        recompute the conditions of that day.
        """
        return cls(
            req_id=req_id,
            kind=AuditEventKind.COMPLETION_OVERRIDE,
            at=override.at,
            actor=override.actor,
            to_state=DeliveryState.DONE,
            reason=override.reason,
            run_id=run_id,
            evidence=tuple(forgiven),
            detail=override.message,
        )

    @property
    def message(self) -> str:
        """One line: what happened, to what, by whom."""
        move = (
            f" {self.from_state.label if self.from_state else '?'} → {self.to_state.label}"
            if self.to_state is not None
            else ""
        )
        reason = f" ({self.reason})" if self.reason else ""
        return f"{self.req_id}: {self.kind}{move} by {self.actor.label}{reason}"

    @traces(SWR.SWR_3213, SWR.SWR_3114)
    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form: one JSON object, one line, no requirement text.

        Empty fields are omitted, so a line stays readable by eye and an older
        build's defaults still apply. ``seq`` is deliberately absent — see the
        field's own note.
        """
        payload: dict[str, JsonValue] = {
            "schema_version": AUDIT_SCHEMA_VERSION,
            "req_id": self.req_id,
            "kind": str(self.kind),
            "at": self.at.isoformat(),
            "actor": {"kind": str(self.actor.kind), "name": self.actor.name},
        }
        for key, value in (
            ("from_state", str(self.from_state) if self.from_state else None),
            ("to_state", str(self.to_state) if self.to_state else None),
            ("cause", str(self.cause) if self.cause else None),
            ("reason", self.reason),
            ("requirement_hash", self.requirement_hash),
            ("satisfied_hash", self.satisfied_hash),
            ("run_id", self.run_id),
            ("commit", self.commit),
            ("detail", self.detail),
        ):
            if value:
                payload[key] = value
        for key, items in (
            ("changed_files", self.changed_files),
            ("tests", self.tests),
            ("superseded_ids", self.superseded_ids),
            ("evidence", self.evidence),
        ):
            if items:
                payload[key] = list(items)
        if self.verified:
            payload["verified"] = True
        assert_no_requirement_content(payload, where=f"audit record {self.req_id}")
        return payload


def _text(value: JsonValue) -> str:
    return value if isinstance(value, str) else ""


def _optional(value: JsonValue) -> str | None:
    return value if isinstance(value, str) and value else None


def _strings(value: JsonValue) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))


def _actor_from(value: JsonValue) -> DeliveryActor:
    if not isinstance(value, dict):
        raise ValueError("an audit record names its actor")
    raw = _text(value.get("kind"))
    try:
        kind = ActorKind(raw)
    except ValueError as exc:
        raise ValueError(f"unknown actor kind {raw!r}") from exc
    return DeliveryActor(kind=kind, name=_text(value.get("name")))


def _event_from(payload: Mapping[str, JsonValue]) -> AuditEvent:
    """One persisted line as an event, or a :class:`ValueError` naming the fault."""
    raw_kind = _text(payload.get("kind"))
    try:
        kind = AuditEventKind(raw_kind)
    except ValueError as exc:
        raise ValueError(f"unknown audit event kind {raw_kind!r}") from exc
    raw_cause = _text(payload.get("cause"))
    try:
        cause = TransitionCause(raw_cause) if raw_cause else None
    except ValueError as exc:
        raise ValueError(f"unknown transition cause {raw_cause!r}") from exc
    moment = dt.datetime.fromisoformat(_text(payload.get("at")))
    return AuditEvent(
        req_id=_text(payload.get("req_id")),
        kind=kind,
        at=moment if moment.tzinfo is not None else moment.replace(tzinfo=dt.UTC),
        actor=_actor_from(payload.get("actor")),
        from_state=parse_delivery_state(payload.get("from_state")),
        to_state=parse_delivery_state(payload.get("to_state")),
        cause=cause,
        reason=_text(payload.get("reason")),
        requirement_hash=_text(payload.get("requirement_hash")),
        satisfied_hash=_optional(payload.get("satisfied_hash")),
        run_id=_optional(payload.get("run_id")),
        commit=_optional(payload.get("commit")),
        changed_files=_strings(payload.get("changed_files")),
        tests=_strings(payload.get("tests")),
        verified=payload.get("verified") is True,
        superseded_ids=_strings(payload.get("superseded_ids")),
        evidence=_strings(payload.get("evidence")),
        detail=_text(payload.get("detail")),
    )


@traces(SWR.SWR_3213)
class AuditTrail(BaseModel):
    """Every recorded event of one requirement, oldest first.

    Append-only by construction: :meth:`appended` returns a new trail and no
    method removes, reorders or edits an event. The queries are the point — a
    trail nobody can interrogate is a log file, and SWR-3213 asks for answers.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    events: tuple[AuditEvent, ...] = ()

    @classmethod
    def of(cls, req_id: str, events: Iterable[AuditEvent]) -> Self:
        """A trail over *events*, numbered by their position in it."""
        return cls(
            req_id=req_id,
            events=tuple(
                event.model_copy(update={"seq": index})
                for index, event in enumerate(events, start=1)
            ),
        )

    def appended(self, event: AuditEvent) -> AuditTrail:
        """This trail with *event* as its newest entry."""
        return AuditTrail.of(self.req_id, (*self.events, event))

    @property
    def empty(self) -> bool:
        """Whether nothing was ever recorded about this requirement."""
        return not self.events

    def of_kind(self, *kinds: AuditEventKind) -> tuple[AuditEvent, ...]:
        """Every event of the given kinds, oldest first."""
        wanted = frozenset(kinds)
        return tuple(event for event in self.events if event.kind in wanted)

    # -- the nine questions of SWR-3213 -------------------------------------

    def specification_changes(self) -> tuple[AuditEvent, ...]:
        """Every recorded edit of the specification, oldest first."""
        return self.of_kind(AuditEventKind.SPECIFICATION_CHANGED)

    def last_specification_change(self) -> AuditEvent | None:
        """Who changed the specification last, and when. ``None`` when nobody did."""
        changes = self.specification_changes()
        return changes[-1] if changes else None

    def implemented_versions(self) -> tuple[str, ...]:
        """Every requirement version a run recorded as delivered, in order.

        Duplicates are kept: a version delivered, regressed and delivered again
        happened twice, and flattening that would hide a regression.
        """
        return tuple(
            event.satisfied_hash for event in self.events if event.satisfied_hash is not None
        )

    def implementing_run(self, satisfied_hash: str) -> str | None:
        """The run that delivered *satisfied_hash*, or ``None``.

        The **newest** matching delivery answers, so a version delivered twice
        reports the delivery that still stands.
        """
        wanted = satisfied_hash.strip()
        return next(
            (
                event.run_id
                for event in reversed(self.events)
                if event.satisfied_hash == wanted and event.run_id
            ),
            None,
        )

    def files_changed_by(self, run_id: str) -> tuple[str, ...]:
        """Every file the given run reported changing, de-duplicated and sorted."""
        changed: set[str] = set()
        for event in self.events:
            if event.run_id == run_id:
                changed.update(event.changed_files)
        return tuple(sorted(changed))

    def verifying_tests(self) -> tuple[str, ...]:
        """Every test recorded as covering this requirement, sorted."""
        tests: set[str] = set()
        for event in self.events:
            tests.update(event.tests)
        return tuple(sorted(tests))

    def last_verified_at(self) -> dt.datetime | None:
        """When verification last *succeeded*, or ``None``.

        A failed verification is recorded and deliberately does not answer this:
        "last verified" that counts failures is the field that lets a red
        requirement look recently checked.
        """
        return next(
            (
                event.at
                for event in reversed(self.events)
                if event.kind is AuditEventKind.VERIFICATION and event.verified
            ),
            None,
        )

    def commit_for(self, satisfied_hash: str) -> str | None:
        """The commit recorded against *satisfied_hash*, or ``None``."""
        wanted = satisfied_hash.strip()
        return next(
            (
                event.commit
                for event in reversed(self.events)
                if event.satisfied_hash == wanted and event.commit
            ),
            None,
        )

    def superseded(self) -> tuple[str, ...]:
        """Every requirement this one replaced, sorted by id."""
        ids: set[str] = set()
        for event in self.events:
            ids.update(event.superseded_ids)
        return tuple(sorted(ids, key=requirement_sort_key))

    # -- convenience over the same events ------------------------------------

    def runs(self) -> tuple[str, ...]:
        """Every run that appears in the trail, in first-appearance order."""
        seen: list[str] = []
        for event in self.events:
            if event.run_id and event.run_id not in seen:
                seen.append(event.run_id)
        return tuple(seen)

    def overrides(self) -> tuple[AuditEvent, ...]:
        """Every forced completion, with its actor and reason (SWR-3215)."""
        return self.of_kind(AuditEventKind.COMPLETION_OVERRIDE)

    def transitions(self) -> tuple[AuditEvent, ...]:
        """Every delivery state change, oldest first."""
        return self.of_kind(AuditEventKind.DELIVERY_TRANSITION)


class AuditNoticeKind(StrEnum):
    """Why a recorded line did not load as written."""

    #: The line is not JSON, or not an object.
    UNREADABLE = "unreadable"
    #: The line's kind, actor or timestamp is not one this build knows.
    UNKNOWN_FIELD = "unknown-field"
    #: Written by a newer schema version than this build reads.
    FUTURE_SCHEMA = "future-schema"
    #: The line names a different requirement than the trail it was found in.
    ID_MISMATCH = "id-mismatch"


@traces(SWR.SWR_3213)
class AuditNotice(BaseModel):
    """One line that could not be read, reported instead of raised.

    A corrupted line costs its own event and nothing else: refusing the whole
    trail would turn one bad byte into the loss of a requirement's entire
    history, which is the opposite of what an audit trail is for.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: AuditNoticeKind
    req_id: str
    #: 1-based line number in the trail file, so the fault is findable.
    line: int
    path: str = ""
    detail: str = ""

    @property
    def message(self) -> str:
        """One line a diagnostic can print."""
        where = f"{self.path}:{self.line}" if self.path else f"line {self.line}"
        detail = f": {self.detail}" if self.detail else ""
        return f"{self.req_id} ({where}) — {self.kind}{detail}"


@traces(SWR.SWR_3213)
class AuditRead(BaseModel):
    """One trail as it came off disk, together with what could not be read."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    trail: AuditTrail
    notices: tuple[AuditNotice, ...] = ()

    @property
    def degraded(self) -> bool:
        """Whether the trail returned is less than what the file holds."""
        return bool(self.notices)


@traces(SWR.SWR_3213)
def audit_filename(req_id: str) -> str:
    """The file a requirement's trail lives in — ``SWR-3213.jsonl``.

    The stem convention is the delivery store's (SWR-3205), reused rather than
    restated so an id that needs slugging is slugged the same way in both places
    and the two files for one requirement stay side by side.
    """
    return record_filename(req_id).removesuffix(".json") + ".jsonl"


@traces(SWR.SWR_3213, SWR.SWR_3114)
class AuditStore:
    """The requirement audit trails on disk, one append-only file per requirement.

    **One write operation.** :meth:`append` opens the file in append mode and
    writes one line. There is deliberately no update, no delete and no
    compaction: a record already written is byte-identical after every later
    write, and that is the property SWR-3213 rests on. A trail is never removed
    either, so a retired requirement (SWR-3113) keeps its history.

    Reading never fails: a corrupt line becomes an :class:`AuditNotice` and the
    remaining events still load.
    """

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/audit/`` — where trails live."""
        return requirements_state_dir(self._workspace) / AUDIT_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s trail is appended to."""
        return self.directory / audit_filename(req_id)

    def append(self, event: AuditEvent) -> AuditEvent:
        """Record *event*. The only write this store performs.

        One ``open(..., "a")`` and one line: the operating system's append is
        what keeps two processes' records from overwriting each other, and the
        newline terminator is what keeps a torn write from swallowing the
        record before it.
        """
        path = self.path_for(event.req_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(event.to_payload(), sort_keys=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(line + "\n")
        return event

    def extend(self, events: Iterable[AuditEvent]) -> tuple[AuditEvent, ...]:
        """Record several events, oldest first."""
        return tuple(self.append(event) for event in events)

    def load(self, req_id: str) -> AuditRead:
        """Read one trail, degrading unreadable lines rather than raising."""
        path = self.path_for(req_id)
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return AuditRead(trail=AuditTrail(req_id=req_id))
        except OSError as exc:
            _log.warning("Unreadable audit trail %s: %s", path, exc)
            return AuditRead(
                trail=AuditTrail(req_id=req_id),
                notices=(
                    AuditNotice(
                        kind=AuditNoticeKind.UNREADABLE,
                        req_id=req_id,
                        line=0,
                        path=str(path),
                        detail=str(exc),
                    ),
                ),
            )
        events: list[AuditEvent] = []
        notices: list[AuditNotice] = []
        for number, raw in enumerate(text.splitlines(), start=1):
            if not raw.strip():
                continue
            event, notice = _read_line(raw, req_id=req_id, path=path, line=number)
            if event is not None:
                events.append(event)
            if notice is not None:
                notices.append(notice)
        return AuditRead(trail=AuditTrail.of(req_id, events), notices=tuple(notices))

    def read(self, req_id: str) -> AuditTrail:
        """One trail. The answer without the diagnostics."""
        return self.load(req_id).trail

    def req_ids(self) -> tuple[str, ...]:
        """Every requirement with a trail, in natural id order.

        Read from the records themselves rather than from the file names: a
        slugged file name cannot be turned back into the id it came from, and
        guessing one would attribute history to the wrong requirement.
        """
        try:
            files = sorted(path for path in self.directory.glob("*.jsonl") if path.is_file())
        except OSError:
            return ()
        found: set[str] = set()
        for path in files:
            try:
                first = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for raw in first:
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
) -> tuple[AuditEvent | None, AuditNotice | None]:
    """One persisted line as an event, or the notice explaining why not."""

    def notice(kind: AuditNoticeKind, detail: str) -> tuple[None, AuditNotice]:
        return None, AuditNotice(
            kind=kind,
            req_id=req_id,
            line=line,
            path=str(path),
            detail=detail,
        )

    try:
        payload = json.loads(raw)
    except ValueError as exc:
        return notice(AuditNoticeKind.UNREADABLE, str(exc))
    if not isinstance(payload, dict):
        return notice(AuditNoticeKind.UNREADABLE, "the record is not a JSON object")
    version = payload.get("schema_version")
    if isinstance(version, int) and version > AUDIT_SCHEMA_VERSION:
        return notice(
            AuditNoticeKind.FUTURE_SCHEMA,
            f"written by schema version {version}, this build reads {AUDIT_SCHEMA_VERSION}",
        )
    stored_id = payload.get("req_id")
    if isinstance(stored_id, str) and stored_id.strip() and stored_id != req_id:
        return notice(AuditNoticeKind.ID_MISMATCH, f"the line holds {stored_id!r}")
    try:
        return _event_from(payload), None
    except ValueError as exc:
        return notice(AuditNoticeKind.UNKNOWN_FIELD, str(exc))


@traces(SWR.SWR_3213, SWR.SWR_3215)
def override_event(report: CompletionReport, *, run_id: str | None = None) -> AuditEvent | None:
    """The audit record a completion report implies, or ``None`` when it implies none.

    Only an *overridden* report leaves a record here: a requirement that met its
    conditions is already accounted for by the transition's own entry, and
    recording the ordinary case twice would make overrides harder to find rather
    than easier.
    """
    if report.override is None or not report.overridden:
        return None
    return AuditEvent.of_override(
        report.override,
        req_id=report.req_id,
        forgiven=tuple(result.message for result in report.overridden),
        run_id=run_id,
    )


@traces(SWR.SWR_3213, SWR.SWR_3215)
def record_overrides(store: AuditStore) -> Callable[[CompletionReport], None]:
    """A sink for :func:`~rotaris_core.requirements.delivery.completion.completion_gate`.

    Wiring the two together is what makes "a forced override is recorded in the
    audit trail" structural: the gate hands every report to this, and an
    override becomes an entry without the acting code remembering to write one.
    """

    def sink(report: CompletionReport) -> None:
        event = override_event(report)
        if event is not None:
            store.append(event)

    return sink
