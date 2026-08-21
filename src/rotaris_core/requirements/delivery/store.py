"""The delivery metadata store (SWR-3205).

Delivery state, satisfied hashes and the records built on them have to survive a
restart, be safe to write while runs are in flight, and never corrupt a workspace
whose Rotaris version changed. The session store solved this once; requirements
get the same guarantees, at the granularity that matters here: **one file per
requirement**, under ``<workspace>/.rotaris/requirements/delivery/``.

Why per requirement and not one index file:

- two runs completing at the same moment touch two different files and cannot
  lose each other's update, which is the common parallel case (SWR-3406);
- a single unreadable record degrades *one* requirement instead of the board;
- an id the sources no longer declare keeps its file, which is what SWR-3113
  needs — nothing here deletes a record, ever.

Four guarantees, each of them tested rather than asserted in prose:

- **Atomic.** Every write goes through :func:`~rotaris_core.requirements.writeback.atomic_write_text`
  — a temporary file beside the target, then one replace. An interrupted write
  leaves the previous record byte-identical and leaves no temporary file behind.
- **Serialised per record.** :meth:`DeliveryStore.update` takes a cross-process
  lock on the record it is about to change, then re-reads inside the lock. Two
  processes appending to the same requirement therefore both land; without the
  re-read, the second would write a value computed from a record it had already
  invalidated.
- **Versioned.** Every payload carries ``schema_version``. A record written by a
  *newer* version is reported and left alone: it is not reinterpreted, and it is
  not overwritten either — :meth:`DeliveryStore.update` refuses with
  :class:`FutureRecordError` rather than destroying data this build cannot read.
- **Additive.** Unknown keys survive a round-trip in :attr:`DeliveryRecord.extras`
  and missing keys fall back to defaults, so adding a field in a later slice
  keeps older records loadable and does not silently drop what a newer build
  wrote.

**Operational data only.** SWR-3114 draws the line and this store stays behind
it: no title, no description, no lifecycle — the requirement's *text* is the
project's and is read from its source on every read.
:func:`assert_no_requirement_content` enforces that on the way to disk, reusing
:data:`~rotaris_core.requirements.tombstones.REQUIREMENT_CONTENT_FIELDS` so there
is one list of what "content" means rather than two that can drift apart.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import json
import logging
import os
import re
import time
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.satisfied import (
    DeliveryOrigin,
    SatisfiedDelivery,
    SatisfiedLog,
)
from rotaris_core.requirements.delivery.state import (
    ActorKind,
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
    read_delivery_state,
)
from rotaris_core.requirements.model import requirement_sort_key
from rotaris_core.requirements.tombstones import (
    REQUIREMENT_CONTENT_FIELDS,
    RequirementContentError,
    requirements_state_dir,
)
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping
    from pathlib import Path
    from types import TracebackType

    from rotaris_core.requirements.writeback import Replacer

_log = logging.getLogger(__name__)

__all__ = [
    "DELIVERY_SCHEMA_VERSION",
    "DELIVERY_SUBDIRNAME",
    "DeliveryIndex",
    "DeliveryLockTimeoutError",
    "DeliveryRead",
    "DeliveryRecord",
    "DeliveryStore",
    "FutureRecordError",
    "RecordNotice",
    "RecordNoticeKind",
    "assert_no_requirement_content",
    "blank_index",
    "record_filename",
]

#: Stamped on every record this build writes. Bumped only when a payload stops
#: being readable by the previous version — an added field is not a bump, which
#: is what :attr:`DeliveryRecord.extras` exists to make true.
DELIVERY_SCHEMA_VERSION = 1

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding the records.
#: A directory of its own so a sweep for requirement text (SWR-3114) and a
#: tombstone read (SWR-3113) never trip over each other's files.
DELIVERY_SUBDIRNAME = "delivery"

#: How long a writer waits for another process' lock before giving up.
_LOCK_TIMEOUT_S = 10.0
#: A lock file older than this belonged to a process that died holding it.
_LOCK_STALE_AFTER_S = 60.0
_LOCK_POLL_S = 0.01

_SAFE_STEM = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
#: Windows refuses these as file stems whatever the extension.
_RESERVED_STEMS = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{index}" for index in range(1, 10)}
    | {f"LPT{index}" for index in range(1, 10)},
)


class DeliveryStoreError(RuntimeError):
    """The delivery store could not carry out an operation, with the reason stated."""


class FutureRecordError(DeliveryStoreError):
    """A record on disk was written by a newer schema version than this build reads.

    Raised on *write*, never on read: reading degrades that one requirement to
    defaults with a notice, and refusing to write is what keeps the newer
    version's data intact instead of quietly replacing it with a downgrade.
    """


class DeliveryLockTimeoutError(DeliveryStoreError):
    """Another writer held a record's lock for longer than the timeout allowed."""


class _PayloadError(ValueError):
    """A persisted payload could not be read into a record (internal)."""


@traces(SWR.SWR_3114, SWR.SWR_3205)
def assert_no_requirement_content(payload: Mapping[str, JsonValue], *, where: str) -> None:
    """Raise unless *payload* is free of requirement text, at any nesting depth.

    Deliberately a *deny*-list of content fields rather than the allow-list
    :func:`~rotaris_core.requirements.tombstones.assert_operational_only` uses:
    the delivery record grows a field per slice (evidence, history, audit), and
    an allow-list shared with the tombstone log would have to be edited by every
    one of them. What must not drift is the definition of "content", and that is
    imported rather than restated.
    """
    offending = sorted(_content_keys(payload))
    if offending:
        raise RequirementContentError(
            f"{where}: refusing to persist requirement content {offending};"
            " requirement text is read from the source, never stored (SWR-3114)",
        )


def _content_keys(value: object) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in REQUIREMENT_CONTENT_FIELDS:
                found.add(str(key))
            found |= _content_keys(nested)
    elif isinstance(value, list | tuple):
        for item in value:
            found |= _content_keys(item)
    return found


@traces(SWR.SWR_3205)
def record_filename(req_id: str) -> str:
    """The file name a requirement's record lives in.

    An id that is already a safe file stem keeps its own name, so the directory
    stays readable by a human (``SWR-3201.json``). Anything else — ``#412``,
    ``PROJ/7``, a Windows device name — is slugged and suffixed with a digest of
    the *original* id, so two ids that slug alike still get two files.

    A case-insensitive filesystem can still map ``SWR-1`` and ``swr-1`` onto one
    file. That is not silently tolerated: every read checks the ``req_id`` inside
    the payload and reports :attr:`RecordNoticeKind.ID_MISMATCH` rather than
    serving one requirement's state for another's.
    """
    cleaned = req_id.strip()
    if (
        _SAFE_STEM.match(cleaned)
        and cleaned.upper() not in _RESERVED_STEMS
        and not cleaned.endswith(".")
    ):
        return f"{cleaned}.json"
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", cleaned).strip("-._") or "id"
    digest = hashlib.blake2b(cleaned.encode("utf-8"), digest_size=6).hexdigest()
    return f"{slug[:48]}-{digest}.json"


class RecordNoticeKind(StrEnum):
    """Why a record did not load as written."""

    #: The file could not be read or parsed at all.
    UNREADABLE = "unreadable"
    #: Written by a newer schema version than this build understands.
    FUTURE_SCHEMA = "future-schema"
    #: A delivery state outside the closed set; degraded to ``Backlog`` (SWR-3201).
    UNKNOWN_STATE = "unknown-state"
    #: The payload names a different requirement than the file it was found in.
    ID_MISMATCH = "id-mismatch"
    #: A field carrying requirement text was found and dropped (SWR-3114).
    CONTENT_DROPPED = "content-dropped"
    #: The stored state could not be loaded as a *change* — most often because it
    #: names no actor, time or cause. The state degrades to ``Backlog``; the rest
    #: of the record (deliveries, unknown fields) is kept.
    UNATTRIBUTED_STATE = "unattributed-state"


@traces(SWR.SWR_3205)
class RecordNotice(BaseModel):
    """One stated degradation. Reported, never raised: a broken record degrades
    its own requirement and nothing else (SWR-3205)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: RecordNoticeKind
    req_id: str
    path: str = ""
    detail: str = ""

    @property
    def message(self) -> str:
        """One line a user or a diagnostic can act on."""
        where = f" ({self.path})" if self.path else ""
        detail = f": {self.detail}" if self.detail else ""
        return f"{self.req_id}{where} — {self.kind}{detail}"


@traces(SWR.SWR_3205)
class DeliveryRecord(BaseModel):
    """Everything Rotaris owns about one requirement's delivery, as persisted.

    Immutable; :meth:`evolve` returns a re-validated copy. The delivery state
    itself is only ever moved by
    :func:`~rotaris_core.requirements.delivery.transitions.apply_transition`
    (SWR-3203) — this type stores the result, it does not judge it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    schema_version: int = DELIVERY_SCHEMA_VERSION
    #: The delivery state and its provenance (SWR-3201). Never the lifecycle:
    #: that is the source's and is read from it (SWR-3202).
    delivery: DeliveryStatus = DeliveryStatus()
    #: Every version ever delivered, oldest first (SWR-3204).
    satisfied: SatisfiedLog = SatisfiedLog()
    #: When this record was last written.
    updated_at: dt.datetime | None = None
    #: Keys a newer build (or a later slice) wrote that this one does not model,
    #: carried through untouched so a round-trip never drops them.
    extras: dict[str, JsonValue] = Field(default_factory=dict)

    @classmethod
    def blank(cls, req_id: str) -> Self:
        """The record of a requirement Rotaris has never written anything about."""
        return cls(req_id=req_id)

    @property
    def state(self) -> DeliveryState:
        """Shorthand for ``record.delivery.state``."""
        return self.delivery.state

    @property
    def satisfied_hash(self) -> str | None:
        """The version last delivered, or ``None`` when never delivered (SWR-3204)."""
        return self.satisfied.satisfied_hash

    @property
    def pristine(self) -> bool:
        """True when this record holds nothing worth a file.

        The store skips writing a pristine record, which is how a freshly opened
        workspace reports ``Backlog`` everywhere without a single write
        (SWR-3201).
        """
        return self.delivery.pristine and not self.satisfied.delivered and not self.extras

    def evolve(self, **changes: object) -> DeliveryRecord:
        """A re-validated copy with *changes* applied."""
        data: dict[str, object] = self.model_dump()
        data.update(changes)
        return DeliveryRecord.model_validate(data)

    @traces(SWR.SWR_3205)
    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form: JSON-ready, sorted on write, content-free.

        Optional fields are omitted rather than written as ``null`` — a smaller
        record is easier to read by hand, and a missing key is exactly what an
        older build's default path already handles.
        """
        delivery: dict[str, JsonValue] = {"state": str(self.delivery.state)}
        if self.delivery.blocked_reason:
            delivery["blocked_reason"] = self.delivery.blocked_reason
        if self.delivery.blocked_from is not None:
            delivery["blocked_from"] = str(self.delivery.blocked_from)
        if self.delivery.changed_at is not None:
            delivery["changed_at"] = self.delivery.changed_at.isoformat()
        if self.delivery.changed_by is not None:
            delivery["changed_by"] = {
                "kind": str(self.delivery.changed_by.kind),
                "name": self.delivery.changed_by.name,
            }
        if self.delivery.cause is not None:
            delivery["cause"] = str(self.delivery.cause)
        if self.delivery.requirement_hash:
            delivery["requirement_hash"] = self.delivery.requirement_hash

        payload: dict[str, JsonValue] = {
            "schema_version": self.schema_version,
            "req_id": self.req_id,
            "delivery": delivery,
        }
        if self.satisfied.delivered:
            payload["satisfied"] = [_satisfied_payload(entry) for entry in self.satisfied.entries]
        if self.updated_at is not None:
            payload["updated_at"] = self.updated_at.isoformat()
        for key, value in sorted(self.extras.items()):
            payload.setdefault(key, value)
        assert_no_requirement_content(payload, where=f"delivery record {self.req_id}")
        return payload


def _satisfied_payload(entry: SatisfiedDelivery) -> dict[str, JsonValue]:
    payload: dict[str, JsonValue] = {
        "satisfied_hash": entry.satisfied_hash,
        "run_id": entry.run_id,
        "satisfied_at": entry.satisfied_at.isoformat(),
    }
    for key, value in (
        ("req_id", entry.req_id),
        ("verified_commit", entry.verified_commit),
        ("source_revision", entry.source_revision),
        ("unit_id", entry.unit_id),
        ("session_id", entry.session_id),
    ):
        if value:
            payload[key] = value
    if entry.origin is not DeliveryOrigin.ROTARIS:
        # Written only when it says something. ``rotaris`` is what an absent key
        # already means (SWR-3219), so omitting it keeps every record this build
        # writes byte-identical to what the previous one wrote.
        payload["origin"] = str(entry.origin)
    return payload


_KNOWN_KEYS = frozenset({"schema_version", "req_id", "delivery", "satisfied", "updated_at"})


def _require_mapping(value: JsonValue, what: str) -> Mapping[str, JsonValue]:
    if not isinstance(value, dict):
        raise _PayloadError(f"{what} must be an object, got {type(value).__name__}")
    return value


def _text(value: JsonValue, what: str) -> str:
    if not isinstance(value, str):
        raise _PayloadError(f"{what} must be a string, got {type(value).__name__}")
    return value


def _moment(value: JsonValue, what: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(_text(value, what))
    except ValueError as exc:
        raise _PayloadError(f"{what} is not an ISO timestamp: {value!r}") from exc
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=dt.UTC)


def _actor(value: JsonValue) -> DeliveryActor:
    block = _require_mapping(value, "changed_by")
    raw_kind = _text(block.get("kind", ""), "changed_by.kind")
    try:
        kind = ActorKind(raw_kind)
    except ValueError as exc:
        raise _PayloadError(f"unknown actor kind {raw_kind!r}") from exc
    return DeliveryActor(kind=kind, name=_text(block.get("name", ""), "changed_by.name"))


def _status_from(
    block: Mapping[str, JsonValue],
    *,
    req_id: str,
    path: str,
) -> tuple[DeliveryStatus, list[RecordNotice]]:
    notices: list[RecordNotice] = []
    state, unknown = read_delivery_state(block.get("state"), req_id=req_id)
    if unknown is not None:
        notices.append(
            RecordNotice(
                kind=RecordNoticeKind.UNKNOWN_STATE,
                req_id=req_id,
                path=path,
                detail=unknown.message,
            ),
        )
    blocked = state is DeliveryState.BLOCKED
    raw_cause = block.get("cause")
    try:
        cause = TransitionCause(_text(raw_cause, "cause")) if raw_cause is not None else None
    except ValueError as exc:
        raise _PayloadError(f"unknown transition cause {raw_cause!r}") from exc
    changed_at = block.get("changed_at")
    changed_by = block.get("changed_by")
    raw_predecessor = block.get("blocked_from")
    blocked_from: DeliveryState | None = None
    if blocked and raw_predecessor is not None:
        blocked_from = read_delivery_state(raw_predecessor, req_id=req_id)[0]
    try:
        status = DeliveryStatus(
            state=state,
            # A degraded state is no longer Blocked, so its blocker must not
            # travel with it: keeping the reason would make the record fail its
            # own coherence check and lose the rest of the requirement's data.
            blocked_reason=(
                _text(block.get("blocked_reason", ""), "blocked_reason") if blocked else ""
            ),
            blocked_from=blocked_from,
            changed_at=_moment(changed_at, "changed_at") if changed_at is not None else None,
            changed_by=_actor(changed_by) if changed_by is not None else None,
            cause=cause,
            requirement_hash=_text(block.get("requirement_hash", ""), "requirement_hash"),
        )
    except ValidationError as exc:
        # A state Rotaris cannot read as a *change* — no actor, no timestamp, a
        # blocker that contradicts the state. Degrading it costs this record its
        # column; refusing the whole record would cost it its delivered version
        # and its history too, which is the more expensive loss (SWR-3205).
        notices.append(
            RecordNotice(
                kind=RecordNoticeKind.UNATTRIBUTED_STATE,
                req_id=req_id,
                path=path,
                detail=f"{state.label} could not be loaded as a change: {_first_error(exc)}",
            ),
        )
        return DeliveryStatus(), notices
    return status, notices


def _first_error(exc: ValidationError) -> str:
    """The first validation message, without pydantic's URL and indentation."""
    errors = exc.errors()
    return str(errors[0].get("msg", exc)) if errors else str(exc)


def _satisfied_from(value: JsonValue) -> SatisfiedLog:
    if not isinstance(value, list):
        raise _PayloadError(f"'satisfied' must be a list, got {type(value).__name__}")
    entries: list[SatisfiedDelivery] = []
    for item in value:
        block = _require_mapping(item, "satisfied entry")
        entries.append(
            SatisfiedDelivery(
                req_id=_text(block.get("req_id", ""), "satisfied.req_id"),
                satisfied_hash=_text(block.get("satisfied_hash", ""), "satisfied.satisfied_hash"),
                run_id=_text(block.get("run_id", ""), "satisfied.run_id"),
                satisfied_at=_moment(block.get("satisfied_at", ""), "satisfied.satisfied_at"),
                verified_commit=_optional(block.get("verified_commit")),
                source_revision=_optional(block.get("source_revision")),
                unit_id=_optional(block.get("unit_id")),
                session_id=_optional(block.get("session_id")),
                origin=_origin_from(block.get("origin")),
            ),
        )
    return SatisfiedLog(entries=tuple(entries))


def _origin_from(value: JsonValue) -> DeliveryOrigin:
    """The delivery's origin, defaulting to ``rotaris`` (SWR-3219).

    An absent key is what every record written before the field existed looks
    like, and those *were* Rotaris deliveries. An unreadable one is refused
    rather than degraded: unlike a delivery state, an origin has no honest
    fallback — guessing ``rotaris`` for a value this build does not recognise
    would attribute someone else's claim to a Rotaris run.
    """
    if value is None:
        return DeliveryOrigin.ROTARIS
    if not isinstance(value, str):
        raise _PayloadError(f"'satisfied.origin' must be a string, got {type(value).__name__}")
    try:
        return DeliveryOrigin(value.strip().casefold())
    except ValueError as exc:
        known = ", ".join(str(origin) for origin in DeliveryOrigin)
        raise _PayloadError(f"unknown satisfied.origin {value!r}; known: {known}") from exc


def _optional(value: JsonValue) -> str | None:
    return None if value is None else _text(value, "field")


@traces(SWR.SWR_3205)
class DeliveryRead(BaseModel):
    """One record as it came off disk, together with what had to be degraded."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    record: DeliveryRecord
    notices: tuple[RecordNotice, ...] = ()
    #: The ``schema_version`` found on disk, when a file existed. ``None`` for a
    #: requirement that has no record yet.
    stored_version: int | None = None

    @property
    def degraded(self) -> bool:
        """Whether the value returned is less than what the file holds."""
        return bool(self.notices)

    @property
    def from_future(self) -> bool:
        """Whether the file was written by a newer schema version than this build."""
        return self.stored_version is not None and self.stored_version > DELIVERY_SCHEMA_VERSION


@traces(SWR.SWR_3205)
class DeliveryIndex(BaseModel):
    """Every record in the store at one moment, and every degradation with it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    records: dict[str, DeliveryRecord] = Field(default_factory=dict)
    notices: tuple[RecordNotice, ...] = ()

    def get(self, req_id: str) -> DeliveryRecord:
        """The record for *req_id*, or a blank one — never a ``KeyError``.

        A requirement Rotaris has never written about is ``Backlog`` (SWR-3201),
        and that answer needs no file.
        """
        return self.records.get(req_id) or DeliveryRecord.blank(req_id)

    @property
    def req_ids(self) -> tuple[str, ...]:
        """Every id with a record, in natural id order."""
        return tuple(sorted(self.records, key=requirement_sort_key))


class _RecordLock:
    """A cross-process lock on one record, held for a read-modify-write.

    ``O_CREAT | O_EXCL`` is the primitive: it is atomic on every filesystem
    Rotaris supports and needs no third-party dependency. A lock file older than
    :data:`_LOCK_STALE_AFTER_S` belonged to a process that died holding it and is
    broken rather than waited on — otherwise one crashed run would freeze the
    board's writes until someone deleted a file by hand.

    Windows answers a *contended* lock two different ways: ``FileExistsError``
    when the holder still has it, and ``PermissionError`` in the window between
    a holder's ``unlink`` and the file actually going away (a delete-pending
    handle, which the OS also produces for a virus scanner's transient open).
    Both mean "someone else has it right now", so both wait — and a
    ``PermissionError`` that is really a read-only directory still surfaces,
    as the cause of the timeout it eventually raises.
    """

    def __init__(self, path: Path, *, timeout_s: float = _LOCK_TIMEOUT_S) -> None:
        self._path = path
        self._timeout_s = timeout_s
        self._held = False

    def __enter__(self) -> Self:
        deadline = time.monotonic() + self._timeout_s
        while True:
            try:
                self._path.parent.mkdir(parents=True, exist_ok=True)
                handle = os.open(str(self._path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except (FileExistsError, PermissionError) as exc:
                if self._break_if_stale():
                    continue
                if time.monotonic() >= deadline:
                    raise DeliveryLockTimeoutError(
                        f"{self._path.name}: another writer held the record lock for"
                        f" more than {self._timeout_s:.0f}s",
                    ) from exc
                time.sleep(_LOCK_POLL_S)
                continue
            with contextlib.suppress(OSError):
                os.write(handle, str(os.getpid()).encode("ascii"))
            os.close(handle)
            self._held = True
            return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._held:
            with contextlib.suppress(OSError):
                self._path.unlink()
            self._held = False

    def _break_if_stale(self) -> bool:
        try:
            age = time.time() - self._path.stat().st_mtime
        except FileNotFoundError:
            # It vanished between the failed create and the stat: retry at once.
            return True
        except OSError:
            # Cannot tell how old it is; wait like any other contender rather
            # than spinning on a file this process may not even be allowed to see.
            return False
        if age < _LOCK_STALE_AFTER_S:
            return False
        _log.warning("Breaking stale delivery lock %s (%.0fs old)", self._path, age)
        with contextlib.suppress(OSError):
            self._path.unlink()
        return True


@traces(SWR.SWR_3205, SWR.SWR_3114)
class DeliveryStore:
    """Rotaris' own requirement data on disk, one file per requirement.

    Reading is lock-free and never fails: a missing file is a blank record, an
    unreadable one is a blank record plus a notice. Writing goes through
    :meth:`update`, which serialises against other processes and re-reads inside
    the lock so no update is computed from a record another writer has already
    replaced.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        replace: Replacer = os.replace,
        lock_timeout_s: float = _LOCK_TIMEOUT_S,
        history_limit: int | None = None,
    ) -> None:
        self._workspace = workspace
        self._replace = replace
        self._lock_timeout_s = lock_timeout_s
        self._history_limit = history_limit

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/delivery/`` — where records live."""
        return requirements_state_dir(self._workspace) / DELIVERY_SUBDIRNAME

    @property
    def history_limit(self) -> int | None:
        """How many satisfied entries a record keeps, or ``None`` for all of them."""
        return self._history_limit

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s record is kept in."""
        return self.directory / record_filename(req_id)

    # -- reading ------------------------------------------------------------

    def load(self, req_id: str) -> DeliveryRead:
        """Read one record, degrading rather than raising."""
        path = self.path_for(req_id)
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return DeliveryRead(record=DeliveryRecord.blank(req_id))
        except OSError as exc:
            return _unreadable(req_id, path, str(exc))
        return self._parse(req_id, path, text, expected_id=req_id)

    def read(self, req_id: str) -> DeliveryRecord:
        """One record, or a blank one. The answer without the diagnostics."""
        return self.load(req_id).record

    def load_all(self) -> DeliveryIndex:
        """Every record in the store, with every degradation named.

        One unreadable file costs its own requirement and nothing else — the
        directory is walked entry by entry and a failure is a notice, not an
        exception (SWR-3205).
        """
        records: dict[str, DeliveryRecord] = {}
        notices: list[RecordNotice] = []
        directory = self.directory
        try:
            files = sorted(entry for entry in directory.glob("*.json") if entry.is_file())
        except OSError:
            return DeliveryIndex()
        for path in files:
            fallback_id = path.stem
            try:
                text = path.read_text(encoding="utf-8")
            except OSError as exc:
                notices.append(_notice(RecordNoticeKind.UNREADABLE, fallback_id, path, str(exc)))
                continue
            read = self._parse(fallback_id, path, text, expected_id=None)
            notices.extend(read.notices)
            record = read.record
            if record.pristine and read.stored_version is None:
                continue
            records[record.req_id] = record
        return DeliveryIndex(records=records, notices=tuple(notices))

    def _parse(
        self,
        req_id: str,
        path: Path,
        text: str,
        *,
        expected_id: str | None,
    ) -> DeliveryRead:
        """Read one payload. *expected_id* is the id the caller asked for, or
        ``None`` when the caller is enumerating and takes whatever it finds."""
        try:
            payload = json.loads(text)
        except ValueError as exc:
            return _unreadable(req_id, path, str(exc))
        if not isinstance(payload, dict):
            return _unreadable(req_id, path, "the record is not a JSON object")
        stored_version = payload.get("schema_version")
        version = stored_version if isinstance(stored_version, int) else DELIVERY_SCHEMA_VERSION
        stored_id = payload.get("req_id")
        actual_id = stored_id if isinstance(stored_id, str) and stored_id.strip() else req_id
        notices: list[RecordNotice] = []
        if expected_id is not None and actual_id != expected_id:
            # Two ids that map onto one file — possible on a case-insensitive
            # filesystem. Serving this record would attribute one requirement's
            # delivery state to another, so it is reported and not served.
            notices.append(
                _notice(
                    RecordNoticeKind.ID_MISMATCH,
                    expected_id,
                    path,
                    f"the file holds {actual_id!r}",
                ),
            )
            return DeliveryRead(
                record=DeliveryRecord.blank(expected_id),
                notices=tuple(notices),
                stored_version=version,
            )
        if version > DELIVERY_SCHEMA_VERSION:
            # Reinterpreting a newer payload is how a downgrade corrupts data:
            # the fields it does not know are the ones it would drop on the next
            # write. Degrade the requirement, keep the file (SWR-3205).
            return DeliveryRead(
                record=DeliveryRecord.blank(actual_id),
                notices=(
                    _notice(
                        RecordNoticeKind.FUTURE_SCHEMA,
                        actual_id,
                        path,
                        f"written by schema version {version}, this build reads"
                        f" {DELIVERY_SCHEMA_VERSION}",
                    ),
                ),
                stored_version=version,
            )
        try:
            status, status_notices = _status_from(
                _require_mapping(payload.get("delivery", {}), "delivery"),
                req_id=actual_id,
                path=str(path),
            )
            satisfied = (
                _satisfied_from(payload["satisfied"])
                if payload.get("satisfied")
                else SatisfiedLog()
            )
            updated = payload.get("updated_at")
            record = DeliveryRecord(
                req_id=actual_id,
                schema_version=version,
                delivery=status,
                satisfied=satisfied,
                updated_at=_moment(updated, "updated_at") if updated is not None else None,
                extras=_extras_of(payload, notices, actual_id, path),
            )
        except (_PayloadError, ValueError) as exc:
            return _unreadable(actual_id, path, str(exc))
        notices.extend(status_notices)
        return DeliveryRead(record=record, notices=tuple(notices), stored_version=version)

    # -- writing ------------------------------------------------------------

    def update_record(
        self,
        req_id: str,
        mutate: Callable[[DeliveryRecord], DeliveryRecord],
        *,
        at: dt.datetime | None = None,
    ) -> DeliveryRecord:
        """Read *req_id*'s record, apply *mutate*, write the result — atomically.

        The lock is held across the read *and* the write, and the record handed
        to *mutate* is re-read inside it. That is what makes two concurrent run
        completions both land: without the re-read, the later writer would
        persist a value derived from a record the earlier one had already
        replaced, and the earlier update would disappear.

        *mutate* must be a pure function of the record it is given: it may be
        called with a record newer than the caller last saw.

        Named ``update_record`` rather than ``update`` so the guard test in
        ``tests/unit/requirements/test_delivery_store.py`` can *see* it. That
        test asserts over the source that only ``apply_transition`` moves a
        stored state, and it can only do so for a method name that is not also
        ``dict.update`` — which is why the sibling checks for ``moved_to`` and
        ``seed`` covered the whole of ``src/`` while this one could not. An
        arbitrary mutation is the one remaining shape that could write a ``Done``
        nobody's completion gate agreed to; making it scannable is what turns
        SWR-3203's "one door" from a convention into a checked property.
        """
        path = self.path_for(req_id)
        with _RecordLock(_lock_path(path), timeout_s=self._lock_timeout_s):
            read = self.load(req_id)
            if read.from_future:
                raise FutureRecordError(
                    f"{req_id}: the stored record was written by schema version"
                    f" {read.stored_version}; this build writes {DELIVERY_SCHEMA_VERSION}"
                    " and refuses to overwrite what it cannot read (SWR-3205)",
                )
            updated = mutate(read.record)
            if updated.req_id != req_id:
                raise DeliveryStoreError(
                    f"{req_id}: an update may not change the record's id (got {updated.req_id!r})",
                )
            if updated == read.record:
                return read.record
            stamped = updated.evolve(
                schema_version=DELIVERY_SCHEMA_VERSION,
                updated_at=at or _utc_now(),
            )
            self._write(stamped, path)
            return stamped

    def seed(self, record: DeliveryRecord, *, at: dt.datetime | None = None) -> DeliveryRecord:
        """Write *record* wholesale, taking the same lock :meth:`update` takes.

        A blind overwrite, and named so it cannot be mistaken for one: seeding a
        fixture and repairing a damaged file are what it is for. It is **not** how
        a delivery state changes — everything that *moves* a state goes through
        :func:`~rotaris_core.requirements.delivery.transitions.apply_transition`
        and lands here through :meth:`update`, which is what makes the matrix, the
        actor rules and the completion conditions unavoidable rather than
        customary.

        Nothing under ``src/`` calls this, and a guard test in
        ``tests/unit/requirements/test_delivery_store.py`` keeps it that way.
        """
        return self.update_record(record.req_id, lambda _current: record, at=at)

    def _write(self, record: DeliveryRecord, path: Path) -> None:
        payload = record.to_payload()
        atomic_write_text(
            path,
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )


def _lock_path(record_path: Path) -> Path:
    return record_path.with_name(record_path.name + ".lock")


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _notice(kind: RecordNoticeKind, req_id: str, path: Path, detail: str) -> RecordNotice:
    return RecordNotice(kind=kind, req_id=req_id, path=str(path), detail=detail)


def _unreadable(req_id: str, path: Path, detail: str) -> DeliveryRead:
    _log.warning("Unreadable delivery record %s: %s", path, detail)
    return DeliveryRead(
        record=DeliveryRecord.blank(req_id),
        notices=(_notice(RecordNoticeKind.UNREADABLE, req_id, path, detail),),
    )


def _extras_of(
    payload: Mapping[str, JsonValue],
    notices: list[RecordNotice],
    req_id: str,
    path: Path,
) -> dict[str, JsonValue]:
    """Keys this build does not model, minus anything that carries requirement text.

    Dropping content-shaped keys here rather than refusing to write them later is
    deliberate: a record that cannot be written is a requirement that can no
    longer be worked on, and SWR-3114's point is that the text does not belong in
    this file — not that its presence should brick the record.
    """
    extras: dict[str, JsonValue] = {}
    dropped: list[str] = []
    for key, value in payload.items():
        if key in _KNOWN_KEYS:
            continue
        if _content_keys({key: value}):
            dropped.append(key)
            continue
        extras[key] = value
    if dropped:
        notices.append(
            _notice(
                RecordNoticeKind.CONTENT_DROPPED,
                req_id,
                path,
                f"dropped requirement content {sorted(dropped)} (SWR-3114)",
            ),
        )
    return extras


@traces(SWR.SWR_3205)
def blank_index(req_ids: Iterable[str]) -> DeliveryIndex:
    """A record for every id, all of them blank.

    What a workspace Rotaris has never written to looks like: every requirement
    ``Backlog``, no file anywhere (SWR-3201).
    """
    return DeliveryIndex(records={req_id: DeliveryRecord.blank(req_id) for req_id in req_ids})
