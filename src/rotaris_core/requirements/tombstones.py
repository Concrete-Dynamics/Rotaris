"""Tombstones for removed requirements (SWR-3113), and the persistence boundary
that keeps Rotaris from becoming a second requirement repository (SWR-3114).

An id that has ever meant something must never mean something else. When a
requirement disappears from its source, Rotaris still holds delivery state, run
history and evidence keyed on that id; re-issuing it later would silently
re-attach all of that to an unrelated requirement. A tombstone is what stops
that: the id stays *spoken for*, its history stays queryable, and creation
(SWR-3112) refuses to hand it out again.

**A removal is a diff, not an exception.** :meth:`TombstoneLog.observe` compares
the ids one source declared in a previous read against the ids the same source
declares now. That is the only honest input: a source that *failed* to read
declares nothing, and treating its silence as a removal would tombstone a whole
store because a file was briefly locked. The registry therefore only ever calls
this for sources that read successfully (SWR-3115).

**Restoration is a resolution, not a deletion.** A tombstoned id that reappears
resolves back to a live requirement and the tombstone keeps its record — removed
at, restored at — so the gap in the requirement's history is visible instead of
being papered over.

**What Rotaris may persist.** SWR-3114 draws the line: operational data — ids,
hashes, states, timestamps, source attribution — is Rotaris'; requirement
*content* is the project's, is read from the source, and is never written into
``<workspace>/.rotaris/requirements/``. :func:`assert_operational_only` enforces
that at the boundary, and :class:`TombstoneStore` writes its records through it.
The consequence is deliberate and worth stating: a tombstone's ``last_title`` is
held in memory for as long as Rotaris remembers the read it came from, and is
**not** written to disk. The project's own record of a retired id — including its
title — belongs in the store's retired-ids log (SWR-2318), which is what
:class:`RetiredIdRecorder` exists to reach.

**The store-side half is a seam, not an implementation.** SWR-2318 is draft and
unimplemented in this repository, so :class:`NullRetiredIdRecorder` is the
default: it records nothing into the store, keeps what it *would* have written
so the gap is observable rather than silent, and is replaced the day the
retired-ids log exists.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import CanonicalRequirement, requirement_sort_key
from rotaris_core.requirements.writeback import Replacer, atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping
    from pathlib import Path

_log = logging.getLogger(__name__)

__all__ = [
    "OPERATIONAL_RECORD_FIELDS",
    "REQUIREMENTS_STATE_DIRNAME",
    "REQUIREMENT_CONTENT_FIELDS",
    "NullRetiredIdRecorder",
    "RequirementContentError",
    "RetiredIdRecorder",
    "Tombstone",
    "TombstoneLog",
    "TombstoneReason",
    "TombstoneStore",
    "assert_operational_only",
    "requirements_state_dir",
]

#: Directory under ``<workspace>/.rotaris/`` holding Rotaris' own requirement
#: data. Named here because the tombstone log is the first thing to live in it;
#: the delivery store (SWR-3205) is the second and uses the same directory.
REQUIREMENTS_STATE_DIRNAME = "requirements"

#: Field names that carry requirement *content*. Rotaris never persists these:
#: they are the project's, read from the source on every read (SWR-3114).
REQUIREMENT_CONTENT_FIELDS: frozenset[str] = frozenset(
    {
        "title",
        "last_title",
        "description",
        "body",
        "text",
        "prose",
        "summary",
        "rationale",
        "acceptance_criteria",
        "criteria",
        "notes",
        "lifecycle",
        "status",
    },
)

#: Field names an operational record may carry — identity, hashes, provenance
#: and timestamps. Everything Rotaris persists about a requirement is one of
#: these, which is what makes SWR-3114 an assertion rather than an intention.
OPERATIONAL_RECORD_FIELDS: frozenset[str] = frozenset(
    {
        "req_id",
        "source_id",
        "source_path",
        "source_revision",
        "current_hash",
        "last_hash",
        "satisfied_hash",
        "state",
        "reason",
        "removed_at",
        "restored_at",
        "recorded_at",
        "schema_version",
    },
)


class RequirementContentError(RuntimeError):
    """A record about to be persisted carried requirement content (SWR-3114)."""


@traces(SWR.SWR_3114)
def requirements_state_dir(workspace: Path) -> Path:
    """``<workspace>/.rotaris/requirements/`` — where operational data lives.

    The one directory Rotaris writes requirement-related state into, and the one
    a test can sweep to prove no requirement prose was written (SWR-3114).
    """
    return workspace / ".rotaris" / REQUIREMENTS_STATE_DIRNAME


@traces(SWR.SWR_3114)
def assert_operational_only(record: Mapping[str, object], *, where: str) -> None:
    """Raise unless every key of *record* is operational rather than content.

    Checked by name *and* by allow-list: an unknown key is refused too, because
    the failure mode SWR-3114 guards against is a well-meaning field arriving
    later ("just the title, for the tooltip") and quietly making Rotaris the
    place a requirement's text lives.
    """
    offending = sorted(key for key in record if key in REQUIREMENT_CONTENT_FIELDS)
    if offending:
        raise RequirementContentError(
            f"{where}: refusing to persist requirement content {offending};"
            " requirement text is read from the source, never stored (SWR-3114)",
        )
    unknown = sorted(key for key in record if key not in OPERATIONAL_RECORD_FIELDS)
    if unknown:
        raise RequirementContentError(
            f"{where}: {unknown} is not an operational field; add it to"
            " OPERATIONAL_RECORD_FIELDS once it is one (SWR-3114)",
        )


class TombstoneReason(StrEnum):
    """Why an id stopped resolving to a live requirement."""

    #: The source no longer declares the id (a deleted file, a closed issue).
    REMOVED_FROM_SOURCE = "removed-from-source"
    #: Rotaris deleted it through the source's ``delete`` capability.
    DELETED_VIA_ROTARIS = "deleted-via-rotaris"


@runtime_checkable
class RememberedRequirement(Protocol):
    """What a tombstone needs to know about a requirement that is gone.

    Structural rather than a named import, and that is the whole point: the value
    that satisfies it is
    :class:`~rotaris_core.requirements.change.detection.BaselineEntry` — "the
    requirement set the last evaluation of one source saw", identity and
    provenance and nothing else (SWR-3114). Importing it here would close the
    loop ``tombstones → detection → delivery.audit → tombstones``; asking for the
    shape instead costs nothing and keeps one baseline value in the codebase
    rather than two answers to one question (SWR-3119).

    Note what is *not* here: no title, no description. A tombstone carries a
    title only in memory, and a removal noticed in a later process simply has
    none — which :meth:`Tombstone.from_record` has always been honest about.
    """

    @property
    def req_id(self) -> str:
        """The id that stopped resolving."""
        ...

    @property
    def content_hash(self) -> str:
        """Its content hash at the last read that still saw it."""
        ...

    @property
    def source_path(self) -> str | None:
        """Where the source held it, when it said."""
        ...


@traces(SWR.SWR_3113)
class Tombstone(BaseModel):
    """A requirement id that once meant something, and what it meant.

    Immutable: a removal is a fact with a time on it. :meth:`restored` returns a
    new value rather than clearing the record, so "this id was gone between T1
    and T2" stays readable.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    source_id: str
    source_path: str | None = None
    #: The requirement's content hash at the last read that still saw it — the
    #: key its delivery record, runs and evidence are filed under.
    last_hash: str = ""
    #: The title from that same read. In memory only: never persisted (SWR-3114),
    #: and re-supplied by the store's retired-ids log once SWR-2318 exists.
    last_title: str = ""
    removed_at: dt.datetime
    reason: TombstoneReason = TombstoneReason.REMOVED_FROM_SOURCE
    restored_at: dt.datetime | None = None

    @classmethod
    def for_requirement(
        cls,
        requirement: CanonicalRequirement,
        *,
        at: dt.datetime,
        reason: TombstoneReason = TombstoneReason.REMOVED_FROM_SOURCE,
    ) -> Self:
        """The tombstone for a requirement that was present in the previous read."""
        return cls(
            req_id=requirement.req_id,
            source_id=requirement.source_id,
            source_path=requirement.source_path,
            last_hash=requirement.current_hash,
            last_title=requirement.title,
            removed_at=at,
            reason=reason,
        )

    @classmethod
    @traces(SWR.SWR_3113, SWR.SWR_3119)
    def for_remembered(
        cls,
        remembered: RememberedRequirement,
        *,
        source_id: str,
        at: dt.datetime,
        title: str = "",
        reason: TombstoneReason = TombstoneReason.REMOVED_FROM_SOURCE,
    ) -> Self:
        """The tombstone for an id the last read saw and this one did not.

        The counterpart of :meth:`for_requirement` for a baseline that came off
        disk. *source_id* is a parameter rather than a field of *remembered*
        because a baseline is already filed per source — the caller knows whose
        read it was, and asking the entry to repeat it would let the two disagree.

        *title* is the same kind of parameter and for a sharper reason. A title is
        requirement *text*, so a baseline may not carry one (SWR-3114) — but a
        removal noticed inside the process that still holds the requirement can
        say ``SWR-2 'Export' was removed`` instead of ``SWR-2 was removed``. So
        the caller passes what it happens to know, and a removal read back from
        disk simply has none. That keeps one fold rather than one per shape, and
        it is the same in-memory-only status :attr:`last_title` has always
        declared for itself.
        """
        return cls(
            req_id=remembered.req_id,
            source_id=source_id,
            source_path=remembered.source_path,
            last_hash=remembered.content_hash,
            last_title=title,
            removed_at=at,
            reason=reason,
        )

    @property
    def active(self) -> bool:
        """True while the id is still gone from its source."""
        return self.restored_at is None

    def restored(self, at: dt.datetime) -> Tombstone:
        """The same record, marked as resolved because the id came back."""
        return self.model_copy(update={"restored_at": at})

    @property
    def message(self) -> str:
        """One line a user can act on."""
        where = f" ({self.source_path})" if self.source_path else ""
        label = f" {self.last_title!r}" if self.last_title else ""
        when = self.removed_at.isoformat()
        if self.active:
            return f"{self.req_id}{label} was removed from {self.source_id}{where} at {when}"
        return (
            f"{self.req_id}{label} was removed from {self.source_id}{where} at {when}"
            f" and restored at {self.restored_at.isoformat() if self.restored_at else ''}"
        )

    @traces(SWR.SWR_3114)
    def operational_record(self) -> dict[str, str]:
        """The persistable projection: identity, provenance, hash, timestamps.

        Deliberately without :attr:`last_title` — see this module's docstring and
        SWR-3114. Values are strings so the record is trivially serialisable and
        so a reader years later needs no schema to understand it.
        """
        record = {
            "req_id": self.req_id,
            "source_id": self.source_id,
            "last_hash": self.last_hash,
            "removed_at": self.removed_at.isoformat(),
            "reason": str(self.reason),
        }
        if self.source_path is not None:
            record["source_path"] = self.source_path
        if self.restored_at is not None:
            record["restored_at"] = self.restored_at.isoformat()
        assert_operational_only(record, where=f"tombstone {self.req_id}")
        return record

    @classmethod
    def from_record(cls, record: Mapping[str, str]) -> Self:
        """Rebuild a tombstone from its persisted form (title stays empty)."""
        restored = record.get("restored_at")
        return cls(
            req_id=record["req_id"],
            source_id=record.get("source_id", ""),
            source_path=record.get("source_path"),
            last_hash=record.get("last_hash", ""),
            removed_at=dt.datetime.fromisoformat(record["removed_at"]),
            reason=TombstoneReason(record.get("reason", TombstoneReason.REMOVED_FROM_SOURCE)),
            restored_at=dt.datetime.fromisoformat(restored) if restored else None,
        )


class RetiredIdRecorder(Protocol):
    """The store-side half of a tombstone: the project's own retired-ids log.

    SWR-3113 wants the *project* to keep the record too, not only Rotaris — the
    store's retired-ids log of SWR-2318. That requirement is draft and
    unimplemented in this repository, so this is the seam it will plug into and
    nothing here writes into a requirement store.
    """

    def record_retired(self, tombstone: Tombstone) -> None:
        """Note in the source's own store that *tombstone*'s id is retired."""
        ...

    def record_restored(self, tombstone: Tombstone) -> None:
        """Note that a retired id resolved back to a live requirement."""
        ...


@traces(SWR.SWR_3113)
class NullRetiredIdRecorder:
    """The default recorder: writes nothing, and keeps what it did not write.

    Keeping the skipped entries is the point. A silently missing store-side
    record is indistinguishable from a working one until the day an id is reused
    in a repository Rotaris never told; holding them makes the gap assertable in
    a test and reportable in a diagnostic, and turns SWR-2318 from "someone
    should" into a list of exactly what is outstanding.
    """

    def __init__(self) -> None:
        self._skipped: list[Tombstone] = []

    @property
    def skipped(self) -> tuple[Tombstone, ...]:
        """Tombstones whose store-side record was not written (SWR-2318 pending)."""
        return tuple(self._skipped)

    def record_retired(self, tombstone: Tombstone) -> None:
        self._skipped.append(tombstone)
        _log.debug(
            "No retired-ids log for source %s: %s stays a Rotaris-side tombstone (SWR-2318)",
            tombstone.source_id,
            tombstone.req_id,
        )

    def record_restored(self, tombstone: Tombstone) -> None:
        self._skipped = [entry for entry in self._skipped if entry.req_id != tombstone.req_id]


@traces(SWR.SWR_3113)
class TombstoneLog(BaseModel):
    """Every id this workspace has seen disappear, and what became of it.

    Pure and immutable: every mutation returns a new log, so the registry can
    build one during a refresh and publish it together with the index it belongs
    to (SWR-3116) instead of mutating state a consumer might be reading.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    entries: tuple[Tombstone, ...] = ()

    def by_id(self) -> dict[str, Tombstone]:
        """The log indexed by requirement id (the latest record per id)."""
        return {entry.req_id: entry for entry in self.entries}

    def get(self, req_id: str) -> Tombstone | None:
        """The record for *req_id*, live or resolved, or ``None``."""
        return self.by_id().get(req_id)

    @property
    def active(self) -> tuple[Tombstone, ...]:
        """Ids that are still gone, in id order."""
        return tuple(entry for entry in self.entries if entry.active)

    @property
    def retired_ids(self) -> frozenset[str]:
        """Every id this log has ever recorded — restored ones included.

        The input to id allocation (SWR-3112). A restored id is live and would be
        refused anyway; including it keeps the promise ("never reuse an id") true
        even for a workspace whose live set is momentarily unreadable.
        """
        return frozenset(entry.req_id for entry in self.entries)

    def with_entry(self, tombstone: Tombstone) -> TombstoneLog:
        """The log with *tombstone* added or replacing an earlier record."""
        kept = [entry for entry in self.entries if entry.req_id != tombstone.req_id]
        kept.append(tombstone)
        return TombstoneLog(entries=_ordered(kept))

    def with_restored(self, req_id: str, *, at: dt.datetime) -> TombstoneLog:
        """Mark *req_id*'s tombstone resolved; a no-op when there is none."""
        entry = self.get(req_id)
        if entry is None or not entry.active:
            return self
        return self.with_entry(entry.restored(at))

    @traces(SWR.SWR_3113)
    def observe(
        self,
        *,
        source_id: str,
        previous: Mapping[str, RememberedRequirement],
        current: Mapping[str, RememberedRequirement],
        at: dt.datetime,
        titles: Mapping[str, str] | None = None,
        recorder: RetiredIdRecorder | None = None,
    ) -> TombstoneLog:
        """Fold one source's read into the log: removals in, restorations out.

        *previous* and *current* are that **one source's** requirement sets, by
        id, as :class:`RememberedRequirement` — identity and provenance, never
        content. Only ids the source itself used to declare can be tombstoned by
        it, which is why this is called per source rather than over a merged set.

        Both sides take the same shape on purpose. The live read has full
        requirements in hand and the previous one may have come off disk with
        nothing but hashes, and letting those be two different types is how a
        fold ends up with one code path it never exercises (SWR-3119). The caller
        converts once, through the value that already models this — ``BaselineEntry``.

        *titles* is what the caller happens to still hold in memory, keyed by id.
        Absent for a baseline off disk, which is why it is optional rather than
        required: a nicer message where one is available, never a second store of
        requirement text (SWR-3114).
        """
        log = self
        for req_id in sorted(set(previous) - set(current), key=requirement_sort_key):
            existing = log.get(req_id)
            if existing is not None and existing.active:
                continue
            tombstone = Tombstone.for_remembered(
                previous[req_id],
                source_id=source_id,
                at=at,
                title=(titles or {}).get(req_id, ""),
            )
            log = log.with_entry(tombstone)
            if recorder is not None:
                recorder.record_retired(tombstone)
        for req_id in sorted(set(current), key=requirement_sort_key):
            entry = log.get(req_id)
            if entry is None or not entry.active:
                continue
            log = log.with_restored(req_id, at=at)
            restored = log.get(req_id)
            if recorder is not None and restored is not None:
                recorder.record_restored(restored)
        return log


def _ordered(entries: Iterable[Tombstone]) -> tuple[Tombstone, ...]:
    return tuple(sorted(entries, key=lambda entry: requirement_sort_key(entry.req_id)))


@traces(SWR.SWR_3113, SWR.SWR_3114)
class TombstoneStore:
    """The tombstone log on disk, under ``<workspace>/.rotaris/requirements/``.

    Written atomically and through :func:`assert_operational_only`, so the one
    thing slice 1 persists about a requirement cannot become requirement text
    (SWR-3114). An unreadable file yields an empty log with a warning rather than
    failing the load: losing the record of retired ids is bad, refusing to open
    the board because of it is worse.
    """

    FILENAME = "tombstones.json"
    SCHEMA_VERSION = 1

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def path(self) -> Path:
        """The file the log is kept in."""
        return requirements_state_dir(self._workspace) / self.FILENAME

    def load(self) -> TombstoneLog:
        """The persisted log, or an empty one when there is nothing readable."""
        path = self.path
        if not path.is_file():
            return TombstoneLog()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            records = payload["tombstones"]
            entries = [Tombstone.from_record(record) for record in records]
        except (OSError, ValueError, KeyError, TypeError):
            _log.warning("Unreadable tombstone log at %s; starting from empty", path)
            return TombstoneLog()
        return TombstoneLog(entries=_ordered(entries))

    def save(self, log: TombstoneLog) -> None:
        """Persist *log*, refusing any record that carries requirement content."""
        payload = {
            "schema_version": self.SCHEMA_VERSION,
            "tombstones": [entry.operational_record() for entry in log.entries],
        }
        atomic_write_text(
            self.path,
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )
