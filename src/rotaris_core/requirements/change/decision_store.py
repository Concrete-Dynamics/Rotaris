"""An open decision is an artefact, and it survives a restart (SWR-3516).

:class:`~rotaris_core.requirements.change.decisions.HumanDecisions` raises a
decision by moving a requirement to ``Blocked`` and appending an audit event. The
audit trail is *history* — it records that somebody was asked — and history is
not an answer path: a board reopened tomorrow finds a blocked requirement and
nothing to choose from, which is exactly the state SWR-3607 exists to abolish.

So the question itself is stored, one file per requirement:

```text
.rotaris/requirements/decisions/<SWR-id>.json
    open     the PendingDecision waiting for somebody  SWR-3512
    log      every answer already given, oldest first  SWR-3512, SWR-3213
```

Both, because they are one thread. The log alone cannot say what is still open;
the open question alone cannot say what was decided last time the same trigger
fired, which is the first thing a reviewer asks.

The store follows :class:`~rotaris_core.requirements.delivery.verification.VerificationStore`
exactly: whole-file atomic write, one file per requirement, a schema version, and
**reading never raises**. A decision file this build cannot read costs that
requirement's answer path and nothing else — a board that refused to render
because one artefact was corrupt would be worse than one that says "no open
decision".
"""

from __future__ import annotations

import json
import os
from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, JsonValue, ValidationError

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.decisions import DecisionLog, PendingDecision
from rotaris_core.requirements.delivery.store import record_filename
from rotaris_core.requirements.tombstones import requirements_state_dir
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

    from rotaris_core.requirements.change.decisions import DecisionRecord
    from rotaris_core.requirements.writeback import Replacer

__all__ = [
    "DECISION_SCHEMA_VERSION",
    "DECISION_SUBDIRNAME",
    "DecisionNotice",
    "DecisionNoticeKind",
    "DecisionRead",
    "PendingDecisionStore",
    "RequirementDecisions",
]

#: Stamped on every artefact this build writes. A file from a newer version is
#: reported and kept, never reinterpreted (SWR-3205's rule, one store over).
DECISION_SCHEMA_VERSION = 1

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding the artefacts.
DECISION_SUBDIRNAME = "decisions"


@traces(SWR.SWR_3516, SWR.SWR_3512)
class RequirementDecisions(BaseModel):
    """One requirement's open question and every answer it has already had.

    ``open`` is ``None`` for a requirement nobody is waiting on, which is the
    common case and costs no file. A requirement with an open decision *and* a
    log is a requirement asked twice — the second question is open and the first
    answer is history, and both are things a reviewer needs.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    open: PendingDecision | None = None
    log: DecisionLog | None = None
    schema_version: int = DECISION_SCHEMA_VERSION

    @property
    def waiting(self) -> bool:
        """Whether somebody is being asked something right now."""
        return self.open is not None

    @property
    def answers(self) -> tuple[DecisionRecord, ...]:
        """Every answer already given, oldest first."""
        return self.log.records if self.log is not None else ()

    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form. Absent halves are omitted, never written as null."""
        payload: dict[str, JsonValue] = {
            "req_id": self.req_id,
            "schema_version": self.schema_version,
        }
        if self.open is not None:
            payload["open"] = self.open.model_dump(mode="json")
        if self.log is not None and self.log.records:
            payload["log"] = self.log.model_dump(mode="json")
        return payload

    @classmethod
    def from_payload(cls, payload: Mapping[str, JsonValue], *, req_id: str) -> RequirementDecisions:
        """Read a persisted artefact, or raise :class:`_PayloadError`.

        An artefact with neither an open question nor a log is **unreadable**
        rather than empty: something was written here, and reading it as "nothing
        was ever asked" would silently drop a question somebody is waiting on.
        The same reasoning SWR-3220 applies to a verification missing its sites.
        """
        stored_open = payload.get("open")
        stored_log = payload.get("log")
        if stored_open is None and stored_log is None:
            raise _PayloadError(
                "a decision artefact holds an open question, a log, or both;"
                " this one holds neither (SWR-3516)",
            )
        try:
            return cls(
                req_id=req_id,
                open=(
                    PendingDecision.model_validate(stored_open) if stored_open is not None else None
                ),
                log=DecisionLog.model_validate(stored_log) if stored_log is not None else None,
                schema_version=_version_of(payload),
            )
        except (ValidationError, ValueError) as exc:
            raise _PayloadError(str(exc)) from exc


class _PayloadError(ValueError):
    """A stored artefact could not be read as one."""


def _version_of(payload: Mapping[str, JsonValue]) -> int:
    stored = payload.get("schema_version")
    return stored if isinstance(stored, int) and not isinstance(stored, bool) else 0


class DecisionNoticeKind(StrEnum):
    """Why an artefact did not load as written."""

    #: The file could not be read, parsed, or carried an incomplete artefact.
    UNREADABLE = "unreadable"
    #: Written by a newer schema version than this build understands.
    FUTURE_SCHEMA = "future-schema"
    #: The payload names a different requirement than the file it was found in.
    ID_MISMATCH = "id-mismatch"


class DecisionNotice(BaseModel):
    """One degradation, named — never an exception on a read path."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: DecisionNoticeKind
    req_id: str
    path: str
    detail: str = ""


class DecisionRead(BaseModel):
    """One artefact and everything that went wrong reading it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    decisions: RequirementDecisions | None = None
    notices: tuple[DecisionNotice, ...] = ()
    stored_version: int | None = None


@traces(SWR.SWR_3516, SWR.SWR_3205, SWR.SWR_3611)
class PendingDecisionStore:
    """One workspace's open decisions on disk, one file per requirement.

    Reading never raises, for the reason every store in this package does not: a
    corrupt artefact costs one requirement's answer path and nothing else.
    """

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/decisions/``."""
        return requirements_state_dir(self._workspace) / DECISION_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s decisions live in."""
        return self.directory / record_filename(req_id)

    # -- reading ------------------------------------------------------------

    def load(self, req_id: str) -> DecisionRead:
        """Read one artefact, degrading rather than raising."""
        path = self.path_for(req_id)
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return DecisionRead()
        except OSError as exc:
            return _unreadable(req_id, path, str(exc))
        return self._parse(req_id, path, text)

    def read(self, req_id: str) -> RequirementDecisions | None:
        """One artefact, or ``None``. The answer without the diagnostics."""
        return self.load(req_id).decisions

    def open_for(self, req_id: str) -> PendingDecision | None:
        """The question *req_id* is waiting on, or ``None``."""
        found = self.read(req_id)
        return found.open if found is not None else None

    def waiting(self) -> tuple[str, ...]:
        """Every requirement with an open question, in id order.

        A directory listing plus one read per file that exists, and the directory
        only has files for requirements somebody was actually asked about — so
        this is proportional to the questions, not to the board.
        """
        try:
            files = sorted(entry for entry in self.directory.glob("*.json") if entry.is_file())
        except OSError:
            return ()
        found: list[str] = []
        for path in files:
            read = self._parse_path(path)
            if read.decisions is not None and read.decisions.waiting:
                found.append(read.decisions.req_id)
        return tuple(found)

    def _parse_path(self, path: Path) -> DecisionRead:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            return _unreadable(path.stem, path, str(exc))
        return self._parse(path.stem, path, text)

    def _parse(self, req_id: str, path: Path, text: str) -> DecisionRead:
        try:
            payload = json.loads(text)
        except ValueError as exc:
            return _unreadable(req_id, path, str(exc))
        if not isinstance(payload, dict):
            return _unreadable(req_id, path, "the artefact is a JSON object")
        version = _version_of(payload)
        stored_id = payload.get("req_id")
        actual_id = str(stored_id) if isinstance(stored_id, str) and stored_id.strip() else req_id
        if version > DECISION_SCHEMA_VERSION:
            return DecisionRead(
                notices=(
                    _notice(
                        DecisionNoticeKind.FUTURE_SCHEMA,
                        actual_id,
                        path,
                        f"written by schema version {version}; this build reads"
                        f" {DECISION_SCHEMA_VERSION}",
                    ),
                ),
                stored_version=version,
            )
        try:
            decisions = RequirementDecisions.from_payload(payload, req_id=actual_id)
        except _PayloadError as exc:
            return _unreadable(actual_id, path, str(exc))
        return DecisionRead(decisions=decisions, stored_version=version)

    # -- writing ------------------------------------------------------------

    @traces(SWR.SWR_3516, SWR.SWR_3512)
    def raise_question(self, pending: PendingDecision) -> RequirementDecisions:
        """Record *pending* as the question this requirement waits on.

        The log is preserved: a requirement asked a second question keeps the
        record of the first answer, which is what makes "we decided the opposite
        in March" readable (SWR-3213).
        """
        held = self.read(pending.req_id)
        return self._write(
            RequirementDecisions(
                req_id=pending.req_id,
                open=pending,
                log=held.log if held is not None else None,
            ),
        )

    @traces(SWR.SWR_3516, SWR.SWR_3512)
    def record_answer(self, record: DecisionRecord) -> RequirementDecisions:
        """Close the open question and append *record* to the log.

        The question is cleared unconditionally. A stored question that outlived
        its answer would show a board an option list for something already
        decided, and choosing again would append a second answer to one question.
        """
        held = self.read(record.req_id)
        log = (
            held.log
            if held is not None and held.log is not None
            else DecisionLog(
                req_id=record.req_id,
            )
        )
        return self._write(
            RequirementDecisions(req_id=record.req_id, open=None, log=log.appended(record)),
        )

    def _write(self, decisions: RequirementDecisions) -> RequirementDecisions:
        path = self.path_for(decisions.req_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(decisions.to_payload(), indent=2, sort_keys=True) + "\n"
        atomic_write_text(path, payload, replace=self._replace)
        return decisions


def _notice(kind: DecisionNoticeKind, req_id: str, path: Path, detail: str) -> DecisionNotice:
    return DecisionNotice(kind=kind, req_id=req_id, path=str(path), detail=detail)


def _unreadable(req_id: str, path: Path, detail: str) -> DecisionRead:
    return DecisionRead(notices=(_notice(DecisionNoticeKind.UNREADABLE, req_id, path, detail),))
