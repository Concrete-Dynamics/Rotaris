"""What one verification of one requirement is, and where it is kept (SWR-3220).

`SWR-3208` says what a verification *record* holds — verdict, commit,
requirement hash, run. `SWR-3207` projects the ``verification`` obligation from
it, and that obligation is required for every requirement type. Nothing in the
product ever kept one, so the obligation was permanently ``missing``, the
traceability ring permanently red, and `RequirementHealth.HEALTHY` unreachable.

Keeping the record alone would not have been enough, and that is the whole shape
of this module:

```text
record          the verdict                      SWR-3208    what happened
implementations the sites it was measured over   SWR-3209    what it saw
covering_tests  which ran, under which check     SWR-2606    what it proved
```

The second and third are not decoration. `SWR-3209` decides whether evidence is
still current by comparing today's repository with **what the verification saw**,
and `SWR-3207` can only call the test obligation satisfied when it knows **which
covering tests that run actually executed** — a coverage sweep reports
``executed=False`` by construction. A stored verdict without them is a claim
nobody can date and nobody can check twice, which is worse than no verdict: it
paints the ring green over code that has since moved.

So the three are one artefact. They are written together, read together, and a
payload that lost one of them is *unreadable* rather than degraded — because a
degraded artefact here would be exactly the confident lie the module exists to
prevent.

**Not part of the delivery record.** A verification may exist for a requirement
still sitting in ``Backlog``; that is how a user finds out something is already
finished before deciding to adopt it (SWR-3615). Putting it on the delivery
record would force a delivery record into existence for a requirement nothing
delivered, which SWR-3201 forbids. The delivery store answers *what Rotaris'
delivery did*; this one answers *what was measured*.

**Only the last one is kept.** SWR-3208 asks for *the* last verification, the
audit trail (SWR-3213) already keeps the sequence, and a second history here
would be a third truth about the same events. A whole-file write is therefore the
right primitive and last-writer-wins the right semantics — the same choice
`UnitStore` made, for the same reason.
"""

from __future__ import annotations

import json
import logging
import os
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, JsonValue, ValidationError, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.evidence import VerificationRecord
from rotaris_core.requirements.delivery.staleness import VerifiedEvidence
from rotaris_core.requirements.delivery.store import (
    assert_no_requirement_content,
    record_filename,
)
from rotaris_core.requirements.tombstones import requirements_state_dir
from rotaris_core.requirements.writeback import atomic_write_text
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping
    from pathlib import Path

    from rotaris_core.requirements.writeback import Replacer

_log = logging.getLogger(__name__)

__all__ = [
    "VERIFICATION_SCHEMA_VERSION",
    "VERIFICATION_SUBDIRNAME",
    "RequirementVerification",
    "VerificationIndex",
    "VerificationNotice",
    "VerificationNoticeKind",
    "VerificationOrigin",
    "VerificationRead",
    "VerificationStore",
]

#: Stamped on every artefact this build writes. A file from a newer build is
#: reported and left alone rather than reinterpreted — SWR-3205's rule.
VERIFICATION_SCHEMA_VERSION = 1

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding verifications.
VERIFICATION_SUBDIRNAME = "verifications"

#: The payload keys that carry the two halves a verdict cannot be trusted
#: without. Absent — not empty — means the artefact lost them, and an artefact
#: that lost them cannot answer freshness or test execution (SWR-3209, SWR-2606).
_REQUIRED_KEYS = ("implementations", "covering_tests")


@traces(SWR.SWR_3220)
class VerificationOrigin(StrEnum):
    """Who measured this verification (SWR-3220).

    The same question `DeliveryOrigin` asks about a delivery, asked about the
    measurement instead, and answered with three members from the start so a
    later reporter extends nothing.
    """

    #: A Rotaris run measured it — a delivery landing, or a verification a user
    #: asked for. The default, and what an artefact without the field means.
    ROTARIS = "rotaris"
    #: The adoption pass measured it while taking over existing work (SWR-3217).
    ADOPTED = "adopted"
    #: Something outside Rotaris reported it — a CI run, most naturally. Part of
    #: the vocabulary so a reporter docks onto it; nothing produces it yet.
    EXTERNAL = "external"

    @property
    def label(self) -> str:
        """What a card prints beside the verdict — ``Adopted``, not ``adopted``."""
        return self.value.capitalize()


class VerificationStoreError(RuntimeError):
    """The verification store could not carry out an operation, with the reason stated."""


class _PayloadError(ValueError):
    """A persisted payload could not be read into an artefact (internal)."""


@traces(SWR.SWR_3220, SWR.SWR_3208, SWR.SWR_3209)
class RequirementVerification(BaseModel):
    """One requirement's last verification: the verdict, and what it was measured over.

    Immutable, and every field is a fact about something that already happened.
    :attr:`implementations` and :attr:`covering_tests` are the repository **as
    that run saw it**, never recomputed — comparing today's repository with
    itself proves nothing, which is the whole premise of SWR-3209.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    record: VerificationRecord
    #: Implementation sites at verification time (SWR-3209's baseline).
    implementations: tuple[RequirementSite, ...] = ()
    #: Covering tests at verification time, each carrying what *this* run did
    #: with it: whether it executed, under which check, with which status. This
    #: is the one fact a coverage sweep cannot supply (SWR-2606).
    covering_tests: tuple[CoveringTest, ...] = ()
    origin: VerificationOrigin = VerificationOrigin.ROTARIS
    #: The branch the verification was measured on. Recorded rather than assumed,
    #: so a project that does not work on its default branch can tell (SWR-3419).
    target_branch: str = ""
    schema_version: int = VERIFICATION_SCHEMA_VERSION

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a verification names the requirement it verified (SWR-3220)")
        return cleaned

    @property
    def commit(self) -> str:
        """The commit the verification ran against."""
        return self.record.commit

    @property
    def requirement_hash(self) -> str:
        """The requirement version the verdict was produced for (SWR-3107)."""
        return self.record.requirement_hash

    @property
    def passed(self) -> bool:
        """Whether the suite accepted this requirement."""
        return self.record.passed

    @property
    def executed_tests(self) -> tuple[CoveringTest, ...]:
        """The covering tests this run actually executed."""
        return tuple(test for test in self.covering_tests if test.executed)

    @property
    def baseline(self) -> VerifiedEvidence:
        """The freshness baseline SWR-3209 compares today's repository against.

        Derived rather than stored beside the sites: keeping the same tuple twice
        would let the copies disagree, and the one that disagreed would decide
        whether a requirement looks healthy.
        """
        return VerifiedEvidence(
            commit=self.record.commit,
            requirement_hash=self.record.requirement_hash,
            implementations=self.implementations,
            covering_tests=tuple(
                RequirementSite(path=test.path, line=test.line) for test in self.covering_tests
            ),
        )

    @property
    def summary(self) -> str:
        """One line for a card and the audit trail."""
        where = f" on {self.target_branch}" if self.target_branch else ""
        ran = len(self.executed_tests)
        return (
            f"{self.record.verdict}{where} at {self.record.commit[:12]}"
            f" — {ran}/{len(self.covering_tests)} covering test(s) ran"
            f" ({self.origin.label.lower()})"
        )

    @traces(SWR.SWR_3220, SWR.SWR_3114)
    def to_payload(self) -> dict[str, JsonValue]:
        """This artefact as it is persisted — measurement only, never requirement text."""
        payload: dict[str, JsonValue] = {
            "req_id": self.req_id,
            "schema_version": VERIFICATION_SCHEMA_VERSION,
            "record": {
                "verdict": str(self.record.verdict),
                "commit": self.record.commit,
                "requirement_hash": self.record.requirement_hash,
                "run_id": self.record.run_id,
                "verified_at": (
                    self.record.verified_at.isoformat() if self.record.verified_at else None
                ),
                "session_id": self.record.session_id,
                "checks": list(self.record.checks),
            },
            "implementations": [
                {"path": site.path, "line": site.line} for site in self.implementations
            ],
            "covering_tests": [
                {
                    "path": test.path,
                    "line": test.line,
                    "executed": test.executed,
                    "check_name": test.check_name,
                    "check_status": test.check_status,
                }
                for test in self.covering_tests
            ],
        }
        # Written only when it is not the default, so an artefact from a Rotaris
        # run stays byte-identical to what a build without these fields wrote.
        if self.origin is not VerificationOrigin.ROTARIS:
            payload["origin"] = str(self.origin)
        if self.target_branch:
            payload["target_branch"] = self.target_branch
        return payload

    @classmethod
    @traces(SWR.SWR_3220)
    def from_payload(cls, payload: Mapping[str, JsonValue], *, req_id: str) -> Self:
        """The artefact *payload* describes, or :class:`_PayloadError`.

        An absent ``implementations`` or ``covering_tests`` key is refused rather
        than defaulted to empty. Empty is a real answer — a requirement with no
        traces can be verified and fail — but *absent* means the artefact was
        written by something that did not keep them, and reading it as "the
        verification saw nothing" would make every later freshness comparison
        report drift that never happened.
        """
        for key in _REQUIRED_KEYS:
            if key not in payload:
                raise _PayloadError(
                    f"the artefact carries no {key!r}; a verification is stored with the"
                    " sites it was measured over or not at all (SWR-3220)",
                )
        raw_record = payload.get("record")
        if not isinstance(raw_record, dict):
            raise _PayloadError("the artefact carries no verification record (SWR-3208)")
        try:
            record = VerificationRecord.model_validate(raw_record)
            return cls(
                req_id=str(payload.get("req_id") or req_id),
                record=record,
                implementations=tuple(
                    RequirementSite.model_validate(site)
                    for site in _items(payload.get("implementations"))
                ),
                covering_tests=tuple(
                    CoveringTest.model_validate(test)
                    for test in _items(payload.get("covering_tests"))
                ),
                origin=_origin_from(payload.get("origin")),
                target_branch=str(payload.get("target_branch") or ""),
                schema_version=_version_of(payload),
            )
        except (ValidationError, ValueError) as exc:
            raise _PayloadError(str(exc)) from exc


def _items(value: JsonValue) -> list[Mapping[str, JsonValue]]:
    if not isinstance(value, list):
        raise _PayloadError("a site list is a list")
    return [item for item in value if isinstance(item, dict)]


def _origin_from(value: JsonValue) -> VerificationOrigin:
    """The origin *value* names. Absent means Rotaris; unknown is an error.

    Absent is the pre-field default and reads back as what it was. An unknown
    token is refused rather than coerced: guessing ``rotaris`` would attribute
    someone else's measurement to a Rotaris run, which is the one thing an origin
    field exists to prevent.
    """
    if value is None:
        return VerificationOrigin.ROTARIS
    try:
        return VerificationOrigin(str(value))
    except ValueError as exc:
        raise _PayloadError(f"unknown verification origin {value!r}") from exc


def _version_of(payload: Mapping[str, JsonValue]) -> int:
    stored = payload.get("schema_version")
    return stored if isinstance(stored, int) and not isinstance(stored, bool) else 0


class VerificationNoticeKind(StrEnum):
    """Why an artefact did not load as written."""

    #: The file could not be read, parsed, or carried an incomplete artefact.
    UNREADABLE = "unreadable"
    #: Written by a newer schema version than this build understands.
    FUTURE_SCHEMA = "future-schema"
    #: The payload names a different requirement than the file it was found in.
    ID_MISMATCH = "id-mismatch"


class VerificationNotice(BaseModel):
    """One degradation, named — never an exception on a read path."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: VerificationNoticeKind
    req_id: str
    path: str
    detail: str = ""


class VerificationRead(BaseModel):
    """One artefact and everything that went wrong reading it.

    ``verification`` is ``None`` for a requirement nothing ever verified **and**
    for one whose file could not be read. The notices tell those apart; the
    projection treats both as ``missing``, which is correct in both cases — an
    unreadable measurement is not a measurement.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    verification: RequirementVerification | None = None
    notices: tuple[VerificationNotice, ...] = ()
    stored_version: int | None = None

    @property
    def from_future(self) -> bool:
        """Whether the stored artefact came from a newer build."""
        return self.stored_version is not None and self.stored_version > VERIFICATION_SCHEMA_VERSION


class VerificationIndex(BaseModel):
    """Every verification in one workspace, with every degradation named."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    verifications: dict[str, RequirementVerification] = {}
    notices: tuple[VerificationNotice, ...] = ()

    def get(self, req_id: str) -> RequirementVerification | None:
        """The artefact for *req_id*, or ``None`` when nothing verified it."""
        return self.verifications.get(req_id)


@traces(SWR.SWR_3220, SWR.SWR_3205)
class VerificationStore:
    """One workspace's verifications on disk, one file per requirement.

    Reading never raises. A file this build cannot read costs that requirement's
    verification and nothing else, and the honest answer for a requirement with
    no readable file is the same as for one nobody ever verified: none. A board
    that refused to render because one artefact was corrupt would be worse than
    one that says "not verified".
    """

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/verifications/``."""
        return requirements_state_dir(self._workspace) / VERIFICATION_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s verification lives in."""
        return self.directory / record_filename(req_id)

    # -- reading ------------------------------------------------------------

    def load(self, req_id: str) -> VerificationRead:
        """Read one artefact, degrading rather than raising."""
        path = self.path_for(req_id)
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return VerificationRead()
        except OSError as exc:
            return _unreadable(req_id, path, str(exc))
        return self._parse(req_id, path, text, expected_id=req_id)

    def read(self, req_id: str) -> RequirementVerification | None:
        """One artefact, or ``None``. The answer without the diagnostics."""
        return self.load(req_id).verification

    def load_all(self) -> VerificationIndex:
        """Every artefact in the store, with every degradation named."""
        verifications: dict[str, RequirementVerification] = {}
        notices: list[VerificationNotice] = []
        try:
            files = sorted(entry for entry in self.directory.glob("*.json") if entry.is_file())
        except OSError:
            return VerificationIndex()
        for path in files:
            fallback_id = path.stem
            try:
                text = path.read_text(encoding="utf-8")
            except OSError as exc:
                notices.append(
                    _notice(VerificationNoticeKind.UNREADABLE, fallback_id, path, str(exc)),
                )
                continue
            read = self._parse(fallback_id, path, text, expected_id=None)
            notices.extend(read.notices)
            if read.verification is not None:
                verifications[read.verification.req_id] = read.verification
        return VerificationIndex(verifications=verifications, notices=tuple(notices))

    def _parse(
        self,
        req_id: str,
        path: Path,
        text: str,
        *,
        expected_id: str | None,
    ) -> VerificationRead:
        try:
            payload = json.loads(text)
        except ValueError as exc:
            return _unreadable(req_id, path, str(exc))
        if not isinstance(payload, dict):
            return _unreadable(req_id, path, "the artefact is a JSON object")

        version = _version_of(payload)
        notices: list[VerificationNotice] = []
        stored_id = payload.get("req_id")
        actual_id = str(stored_id) if isinstance(stored_id, str) and stored_id.strip() else req_id
        if expected_id is not None and actual_id != expected_id:
            notices.append(
                _notice(
                    VerificationNoticeKind.ID_MISMATCH,
                    expected_id,
                    path,
                    f"the artefact names {actual_id!r}",
                ),
            )
            return VerificationRead(notices=tuple(notices), stored_version=version)
        if version > VERIFICATION_SCHEMA_VERSION:
            notices.append(
                _notice(
                    VerificationNoticeKind.FUTURE_SCHEMA,
                    actual_id,
                    path,
                    f"written by schema version {version}; this build reads"
                    f" {VERIFICATION_SCHEMA_VERSION}",
                ),
            )
            return VerificationRead(notices=tuple(notices), stored_version=version)
        try:
            verification = RequirementVerification.from_payload(payload, req_id=actual_id)
        except _PayloadError as exc:
            return _unreadable(actual_id, path, str(exc))
        return VerificationRead(
            verification=verification,
            notices=tuple(notices),
            stored_version=version,
        )

    # -- writing ------------------------------------------------------------

    @traces(SWR.SWR_3220, SWR.SWR_3205)
    def save(self, verification: RequirementVerification) -> RequirementVerification:
        """Write *verification*, replacing whatever was there.

        Whole-file and last-writer-wins by design: this store keeps *the last*
        verification (SWR-3208), so a newer measurement replacing an older one is
        the intended outcome rather than a lost update. The write is atomic, so
        an interrupted one leaves the previous artefact intact.
        """
        stamped = verification.model_copy(update={"schema_version": VERIFICATION_SCHEMA_VERSION})
        payload = stamped.to_payload()
        path = self.path_for(stamped.req_id)
        assert_no_requirement_content(payload, where=str(path))
        atomic_write_text(
            path,
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )
        return stamped


def _notice(
    kind: VerificationNoticeKind,
    req_id: str,
    path: Path,
    detail: str,
) -> VerificationNotice:
    return VerificationNotice(kind=kind, req_id=req_id, path=str(path), detail=detail)


def _unreadable(req_id: str, path: Path, detail: str) -> VerificationRead:
    _log.warning("Unreadable verification artefact %s: %s", path, detail)
    return VerificationRead(
        notices=(_notice(VerificationNoticeKind.UNREADABLE, req_id, path, detail),),
    )


@traces(SWR.SWR_3220)
def verifications_by_id(
    store: VerificationStore,
    req_ids: Iterable[str] | None = None,
) -> dict[str, RequirementVerification]:
    """Every stored verification, optionally narrowed to *req_ids*.

    The read the projection makes once per pass. Narrowing happens here rather
    than in the caller so a detail pass over one card does not pay for the
    directory of a thousand.
    """
    index = store.load_all()
    if req_ids is None:
        return dict(index.verifications)
    wanted = set(req_ids)
    return {
        req_id: verification
        for req_id, verification in index.verifications.items()
        if req_id in wanted
    }
