"""The requirement snapshot a run works against (SWR-3402), and what happens when
the specification moves under it (SWR-3403).

A requirement can be edited while an agent is implementing it. If a run reported
against whatever the requirement says at the moment it *finishes*, it would claim
to have delivered text it never saw — and nothing in the evidence would show the
mismatch. So a run captures the specification once, at its start, and works
against that capture for its whole lifetime:

```text
run start ── capture_snapshot() ─▶ RunSnapshot ─┬─▶ agent context (SWR-3407)
                                                ├─▶ satisfied_hash (SWR-3204)
                                                └─▶ detect_drift() at completion
```

Four properties are load-bearing:

- **Captured once, immutable after.** :class:`RunSnapshot` is frozen and there is
  one constructor, :func:`capture_snapshot`. Editing the requirement afterwards
  cannot reach the value the run is holding.
- **No base commit, no run.** A snapshot without a resolvable base commit is
  refused with :class:`SnapshotError` rather than captured half-formed: a run
  whose starting point is unknown cannot have its work compared to anything.
- **Persisted before the agent starts.** :class:`SnapshotStore` writes one file
  per run through the same atomic path the delivery store uses, so a crash
  leaves either the previous bytes or the whole snapshot — never half of one.
- **The persisted half carries no requirement text.** SWR-3114 draws that line
  and this module stays behind it: :attr:`RunSnapshot.title` and
  :attr:`RunSnapshot.description` are held *in memory*, for the agent context and
  for the diff, and :meth:`RunSnapshot.to_payload` drops them — exactly as
  :class:`~rotaris_core.requirements.tombstones.Tombstone` drops ``last_title``.
  The consequence is deliberate: after a crash the reloaded snapshot can still
  prove *that* the specification moved (the hash survives) but not *how* (the
  text does not). The hash is what blocks ``Done``; the diff is what helps a
  human, and it is honestly absent rather than reconstructed from the new text.

**SWR-3403 is the reason all of this exists.** When a run completes and its
snapshot hash differs from the requirement's current hash, the result goes to
``Review`` with the stated reason *specification changed during execution* and
never to ``Done``. That is enforced twice, on purpose:

- the completion transition this module builds targets ``Review`` and nothing
  else (:func:`completion_transition`), and
- the later ``Review → Done`` attempt is refused by :func:`specification_guard`,
  which **wraps** whatever completion gate the workspace supplies. Wrapping
  rather than replacing is the point: a permissive gate cannot vote the drift
  away, so "cannot produce Done, whatever the gate says" is structural.

Both halves only hold if something actually installs them, and an optional
collaborator nobody wires is a requirement that silently does not exist. So the
write path a requirement run uses is not assembled at each call site but
constructed once, here: :class:`ExecutionTransitions` *is*
:class:`~rotaris_core.requirements.delivery.transitions.DeliveryTransitions`
with :func:`specification_guard` already wrapped around the workspace's own gate
and the audit trail already attached, and it is the only writer
:class:`~rotaris_core.requirements.execution.flow.RequirementFlow` accepts. A
composition that hands the flow a bare ``DeliveryTransitions`` is refused at
construction rather than losing SWR-3403 quietly.

```text
ExecutionTransitions.apply(request)
    ├─▶ DeliveryTransitions.apply(…, completion=specification_guard(inner))   SWR-3403
    └─▶ AuditStore.append(AuditEvent.of_transition(…))                        SWR-3213
.record_event(specification_change_event(drift, …))  ← the flow, at Review    SWR-3403
```
"""

from __future__ import annotations

import datetime as dt
import difflib
import json
import os
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind, AuditStore
from rotaris_core.requirements.delivery.projection import ReviewView, RunSnapshotView
from rotaris_core.requirements.delivery.state import DeliveryState, TransitionCause
from rotaris_core.requirements.delivery.store import DeliveryStore, assert_no_requirement_content
from rotaris_core.requirements.delivery.transitions import (
    DeliveryTransitions,
    TransitionRequest,
    UnmetCondition,
)
from rotaris_core.requirements.tombstones import requirements_state_dir
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from pydantic import JsonValue

    from rotaris_core.requirements.delivery.state import DeliveryActor
    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.delivery.transitions import CompletionGate, TransitionOutcome
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.writeback import Replacer

__all__ = [
    "SNAPSHOT_SCHEMA_VERSION",
    "SNAPSHOT_SUBDIRNAME",
    "SPECIFICATION_CHANGED_CONDITION",
    "SPECIFICATION_CHANGED_REASON",
    "AuditWriter",
    "ExecutionTransitions",
    "RunSnapshot",
    "SnapshotError",
    "SnapshotStore",
    "SpecificationDrift",
    "capture_snapshot",
    "completion_transition",
    "detect_drift",
    "review_for",
    "specification_change_event",
    "specification_diff",
    "specification_guard",
]

#: The reason SWR-3403 puts on a review, verbatim. One spelling, used by the
#: transition detail, the review surface and the audit trail, so the three cannot
#: describe the same event differently.
SPECIFICATION_CHANGED_REASON = "specification changed during execution"

#: The completion condition that does not hold while the drift stands (SWR-3215).
SPECIFICATION_CHANGED_CONDITION = "specification-unchanged-during-execution"

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding run snapshots.
SNAPSHOT_SUBDIRNAME = "snapshots"

#: Stamped on every snapshot written. Bumped only when a payload stops being
#: readable by the previous build.
SNAPSHOT_SCHEMA_VERSION = 1

#: "What does this requirement's specification hash say *now*" — asked at the
#: moment of a transition, never captured earlier, because the whole point of
#: SWR-3403 is a value that may have moved since the run started.
type CurrentHashLookup = Callable[[str], str]


class SnapshotError(RuntimeError):
    """A run could not be started because its snapshot could not be taken."""


@traces(SWR.SWR_3402)
class RunSnapshot(BaseModel):
    """The specification version one run works against, captured at its start.

    Structurally a
    :class:`~rotaris_core.requirements.delivery.satisfied.DeliverySnapshot`, so
    :meth:`SatisfiedDelivery.from_snapshot
    <rotaris_core.requirements.delivery.satisfied.SatisfiedDelivery.from_snapshot>`
    consumes it without either module importing the other's model.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    #: The requirement's ``current_hash`` **at run start** (SWR-3107, SWR-3402).
    requirement_hash: str
    #: The commit the run branches from. Mandatory: a run whose starting point is
    #: unknown has nothing to compare its work against (SWR-3402).
    base_commit: str
    captured_at: dt.datetime
    source_revision: str | None = None
    source_path: str | None = None
    unit_id: str | None = None
    session_id: str | None = None
    #: The specification text as it stood at capture. **Memory only** — dropped
    #: by :meth:`to_payload` (SWR-3114). It is what the agent context is built
    #: from and what the SWR-3403 diff is computed against.
    title: str = ""
    description: str = ""

    @field_validator("run_id", "req_id", "requirement_hash", "base_commit")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "a run snapshot names the run, the requirement, the hash it captured"
                " and the commit it starts from (SWR-3402)",
            )
        return cleaned

    @field_validator("captured_at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("a snapshot timestamp is aware, never naive")
        return value

    @property
    def has_text(self) -> bool:
        """Whether this snapshot still carries the text it captured.

        ``False`` for a snapshot reloaded from disk: the text is never persisted
        (SWR-3114), so a diff is unavailable after a restart while the hash
        comparison still holds.
        """
        return bool(self.title or self.description)

    @property
    def specification(self) -> str:
        """The captured text as one block — what a diff and a prompt read."""
        parts = [part for part in (self.title.strip(), self.description.strip()) if part]
        return "\n\n".join(parts)

    @traces(SWR.SWR_3402)
    def to_view(self) -> RunSnapshotView:
        """This snapshot as the board and the review surface read it (SWR-3216)."""
        return RunSnapshotView(
            req_id=self.req_id,
            requirement_hash=self.requirement_hash,
            source_revision=self.source_revision,
            base_commit=self.base_commit,
            unit_id=self.unit_id,
            session_id=self.session_id,
            captured_at=self.captured_at,
        )

    @traces(SWR.SWR_3402, SWR.SWR_3114)
    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form: identity, hash, provenance, time — and no text.

        Passed through :func:`assert_no_requirement_content` on the way out, so a
        field carrying requirement prose added here later fails loudly instead of
        turning Rotaris into a second requirement store (SWR-3114).
        """
        payload: dict[str, JsonValue] = {
            "schema_version": SNAPSHOT_SCHEMA_VERSION,
            "run_id": self.run_id,
            "req_id": self.req_id,
            "requirement_hash": self.requirement_hash,
            "base_commit": self.base_commit,
            "captured_at": self.captured_at.isoformat(),
        }
        for key, value in (
            ("source_revision", self.source_revision),
            ("source_path", self.source_path),
            ("unit_id", self.unit_id),
            ("session_id", self.session_id),
        ):
            if value is not None:
                payload[key] = value
        assert_no_requirement_content(payload, where=f"run snapshot {self.run_id}")
        return payload

    @classmethod
    @traces(SWR.SWR_3402)
    def from_payload(cls, payload: dict[str, JsonValue]) -> Self:
        """A snapshot read back from disk — without the text it never stored."""
        version = payload.get("schema_version")
        if isinstance(version, int) and version > SNAPSHOT_SCHEMA_VERSION:
            raise SnapshotError(
                f"run snapshot {payload.get('run_id')!r} was written by schema version"
                f" {version}; this build reads {SNAPSHOT_SCHEMA_VERSION}",
            )
        return cls(
            run_id=_text(payload.get("run_id")),
            req_id=_text(payload.get("req_id")),
            requirement_hash=_text(payload.get("requirement_hash")),
            base_commit=_text(payload.get("base_commit")),
            captured_at=_moment(payload.get("captured_at")),
            source_revision=_optional(payload.get("source_revision")),
            source_path=_optional(payload.get("source_path")),
            unit_id=_optional(payload.get("unit_id")),
            session_id=_optional(payload.get("session_id")),
        )


def _text(value: JsonValue) -> str:
    return value.strip() if isinstance(value, str) else ""


def _optional(value: JsonValue) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _moment(value: JsonValue) -> dt.datetime:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError("a persisted snapshot names when it was captured")
    try:
        return dt.datetime.fromisoformat(value)
    except ValueError as exc:
        raise SnapshotError(f"unreadable snapshot timestamp {value!r}") from exc


@traces(SWR.SWR_3402)
def capture_snapshot(
    requirement: CanonicalRequirement,
    *,
    run_id: str,
    base_commit: str | None,
    at: dt.datetime,
    unit_id: str | None = None,
    session_id: str | None = None,
) -> RunSnapshot:
    """Capture the version of *requirement* a run will work against.

    The clock is injected (*at*) and the base commit is supplied by the caller
    that resolved it, so this stays a pure function of what it is given: no
    filesystem, no subprocess, no ``now()``.

    Refuses — rather than degrading — on the two facts a run cannot proceed
    without: a requirement whose hash is unknown, and an unresolvable base commit
    (SWR-3402).

    **Both refusals are written for the person who has to act on them**, because
    both of them travel: the flow puts this text straight into the requirement's
    blocked reason and the board prints it under the requirement's id. So the
    sentence names the fact and the remedy, and carries neither the requirement
    id — the surface already labels the row with it — nor an ``SWR-`` id of
    Rotaris' own, which means nothing to somebody working on their project. The
    requirement id stays in this docstring and in ``@traces`` above, where it is
    for a maintainer rather than for a user.
    """
    if not requirement.current_hash.strip():
        raise SnapshotError(
            "this requirement has no recorded content hash, so a run has nothing to judge"
            " its result against — refresh the requirements, then release it again",
        )
    if base_commit is None or not base_commit.strip():
        raise SnapshotError(
            "this workspace has no commit for a run to start from — make an initial commit,"
            " then release the requirement again",
        )
    return RunSnapshot(
        run_id=run_id,
        req_id=requirement.req_id,
        requirement_hash=requirement.current_hash,
        base_commit=base_commit,
        captured_at=at,
        source_revision=requirement.source_revision,
        source_path=requirement.source_path,
        unit_id=unit_id,
        session_id=session_id,
        title=requirement.title,
        description=requirement.description,
    )


@traces(SWR.SWR_3402)
class SnapshotStore:
    """Run snapshots on disk, one file per run.

    Written *before* the agent starts, so a crash mid-run still leaves the
    evidence of which specification version the work was aimed at. One file per
    run for the same reason the delivery store keeps one file per requirement:
    two runs finishing at once touch two files and cannot lose each other.
    """

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/snapshots/``."""
        return requirements_state_dir(self._workspace) / SNAPSHOT_SUBDIRNAME

    def path_for(self, run_id: str) -> Path:
        """The file *run_id*'s snapshot lives in."""
        from rotaris_core.requirements.delivery.store import record_filename

        return self.directory / record_filename(run_id)

    @traces(SWR.SWR_3402)
    def save(self, snapshot: RunSnapshot) -> Path:
        """Persist *snapshot*, atomically. Returns where it landed."""
        path = self.path_for(snapshot.run_id)
        atomic_write_text(
            path,
            json.dumps(snapshot.to_payload(), indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )
        return path

    @traces(SWR.SWR_3402)
    def load(self, run_id: str) -> RunSnapshot | None:
        """The snapshot of *run_id*, or ``None`` when none was ever written."""
        path = self.path_for(run_id)
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SnapshotError(f"{path}: unreadable run snapshot ({exc})") from exc
        if not isinstance(payload, dict):
            raise SnapshotError(
                f"{path}: a run snapshot is an object, not {type(payload).__name__}"
            )
        return RunSnapshot.from_payload(payload)

    def run_ids(self) -> tuple[str, ...]:
        """Every run this store holds a snapshot for, sorted."""
        if not self.directory.is_dir():
            return ()
        found: list[str] = []
        for path in sorted(self.directory.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(payload, dict) and isinstance(payload.get("run_id"), str):
                found.append(str(payload["run_id"]))
        return tuple(sorted(found))


@traces(SWR.SWR_3403)
def specification_diff(snapshot: RunSnapshot, requirement: CanonicalRequirement) -> str:
    """A unified diff from the version the run saw to the version that stands now.

    Empty when the snapshot no longer carries its text — after a restart, the
    persisted snapshot holds the hash and not the prose (SWR-3114). An empty diff
    therefore means "cannot be shown", never "nothing changed"; whether something
    changed is :attr:`SpecificationDrift.changed`, which is decided on hashes.
    """
    if not snapshot.has_text:
        return ""
    before = snapshot.specification.splitlines()
    after = "\n\n".join(
        part for part in (requirement.title.strip(), requirement.description.strip()) if part
    ).splitlines()
    return "\n".join(
        difflib.unified_diff(
            before,
            after,
            fromfile=f"{snapshot.req_id}@{snapshot.requirement_hash}",
            tofile=f"{requirement.req_id}@{requirement.current_hash}",
            lineterm="",
        ),
    )


@traces(SWR.SWR_3403)
class SpecificationDrift(BaseModel):
    """Whether the specification moved while its run was in flight, and how.

    Both hashes travel together, always: a review that shows only the current
    hash cannot tell a user what was actually implemented, and that is the exact
    failure SWR-3403 exists to prevent.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    run_id: str = ""
    #: The version the run worked against (SWR-3402).
    snapshot_hash: str
    #: The version the specification holds now (SWR-3107).
    current_hash: str
    #: Unified diff between the two versions; empty when the snapshot's text is
    #: no longer available. See :func:`specification_diff`.
    diff: str = ""

    @property
    def changed(self) -> bool:
        """Whether the two versions differ — the fact that blocks ``Done``."""
        return self.snapshot_hash != self.current_hash

    @property
    def reason(self) -> str:
        """The stated reason for a review, or empty when nothing drifted."""
        return SPECIFICATION_CHANGED_REASON if self.changed else ""

    @property
    def detail(self) -> str:
        """Both hashes in one line — what the audit trail records (SWR-3403)."""
        return f"snapshot {self.snapshot_hash} → current {self.current_hash}"

    @property
    def message(self) -> str:
        """One line a user can act on."""
        if not self.changed:
            return f"{self.req_id}: specification unchanged during execution"
        return f"{self.req_id}: {SPECIFICATION_CHANGED_REASON} ({self.detail})"

    @property
    def condition(self) -> UnmetCondition:
        """This drift as an unmet completion condition (SWR-3215)."""
        return UnmetCondition(name=SPECIFICATION_CHANGED_CONDITION, detail=self.detail)


@traces(SWR.SWR_3403)
def detect_drift(snapshot: RunSnapshot, requirement: CanonicalRequirement) -> SpecificationDrift:
    """Compare what the run saw with what the requirement says now.

    Pure. The comparison is on hashes — stable against reformatting and sensitive
    to meaning (SWR-3107) — and the diff is carried alongside for the human, not
    used for the decision.
    """
    if snapshot.req_id != requirement.req_id:
        raise ValueError(
            f"snapshot of {snapshot.req_id!r} compared against {requirement.req_id!r}",
        )
    return SpecificationDrift(
        req_id=requirement.req_id,
        run_id=snapshot.run_id,
        snapshot_hash=snapshot.requirement_hash,
        current_hash=requirement.current_hash,
        diff=specification_diff(snapshot, requirement),
    )


@traces(SWR.SWR_3403)
def completion_transition(
    drift: SpecificationDrift,
    *,
    actor: DeliveryActor,
    at: dt.datetime,
    detail: str = "",
) -> TransitionRequest:
    """The delivery move a finished run asks for: ``Running → Review``, always.

    Never ``Done``. A completed run produces a *result to review*, and the
    decision to accept it is a separate transition with its own conditions
    (SWR-3215) — which is what keeps "the run finished" and "the requirement is
    delivered" two different facts.

    When the specification drifted, the cause recorded is
    ``specification-changed`` and the detail names **both** hashes, so the audit
    trail carries the mismatch without anyone having to reconstruct it later
    (SWR-3403).
    """
    changed = drift.changed
    extra = f"; {detail}" if detail else ""
    return TransitionRequest(
        req_id=drift.req_id,
        target=DeliveryState.REVIEW,
        actor=actor,
        cause=(TransitionCause.SPECIFICATION_CHANGED if changed else TransitionCause.RUN_COMPLETED),
        at=at,
        requirement_hash=drift.current_hash,
        run_id=drift.run_id or None,
        detail=(f"{SPECIFICATION_CHANGED_REASON}: {drift.detail}" if changed else drift.detail)
        + extra,
    )


@traces(SWR.SWR_3403)
def review_for(
    drift: SpecificationDrift,
    *,
    reason: str = "",
    branch: str | None = None,
    worktree_path: str | None = None,
    unmet: Sequence[UnmetCondition] = (),
) -> ReviewView:
    """What the board shows for a requirement whose run finished (SWR-3216).

    Carries both hashes and, when the drift stands, the reason SWR-3403 names.
    The diff itself travels on *drift*: :class:`ReviewView` is the shared board
    contract (SWR-3216) and has no field for it.
    """
    return ReviewView(
        req_id=drift.req_id,
        run_id=drift.run_id or None,
        snapshot_hash=drift.snapshot_hash,
        current_hash=drift.current_hash,
        reason=drift.reason or reason,
        branch=branch,
        worktree_path=worktree_path,
        unmet=tuple(unmet),
    )


@traces(SWR.SWR_3403)
def specification_guard(
    inner: CompletionGate | None,
    *,
    current_hash_for: CurrentHashLookup,
) -> CompletionGate:
    """*inner*, plus the one condition no gate may vote away (SWR-3403).

    A ``Done`` transition records the delivering run's snapshot hash
    (SWR-3204). If the requirement has moved since, accepting it would mark the
    *new* text as delivered by a run that never saw it. This wrapper adds
    :data:`SPECIFICATION_CHANGED_CONDITION` to whatever the workspace's own gate
    reports, so the refusal survives a permissive — or absent — inner gate.

    *current_hash_for* answers "what does this requirement say now"; it is asked
    at the moment of the transition, never captured earlier, because the whole
    point is a value that may have changed since the run started.
    """

    def gate(
        record: DeliveryRecord,
        request: TransitionRequest,
    ) -> Sequence[UnmetCondition]:
        unmet = list(inner(record, request)) if inner is not None else []
        delivered = request.delivery
        if delivered is not None:
            current = (current_hash_for(request.req_id) or "").strip()
            if current and current != delivered.satisfied_hash:
                unmet.append(
                    UnmetCondition(
                        name=SPECIFICATION_CHANGED_CONDITION,
                        # No Rotaris requirement id in here: an unmet condition
                        # travels into the refusal a user reads on the board, and
                        # an id from Rotaris' own specification means nothing to
                        # somebody working on their project.
                        detail=(
                            f"snapshot {delivered.satisfied_hash} → current {current};"
                            f" {SPECIFICATION_CHANGED_REASON}"
                        ),
                    ),
                )
        return tuple(unmet)

    return gate


@traces(SWR.SWR_3403, SWR.SWR_3213)
def specification_change_event(
    drift: SpecificationDrift,
    *,
    actor: DeliveryActor,
    at: dt.datetime,
    detail: str = "",
) -> AuditEvent:
    """The audit record of a specification that moved while its run was in flight.

    Both hashes travel in their own fields rather than only inside a sentence:
    :attr:`~rotaris_core.requirements.delivery.audit.AuditEvent.satisfied_hash`
    is the version the run worked against and
    :attr:`~rotaris_core.requirements.delivery.audit.AuditEvent.requirement_hash`
    is the version that stands now, which is what makes
    :meth:`~rotaris_core.requirements.delivery.audit.AuditTrail.specification_changes`
    answerable months later without re-deriving anything (SWR-3403, SWR-3213).

    Pure: it builds the record, it does not write it. The writing is
    :meth:`ExecutionTransitions.record_event`.
    """
    if not drift.changed:
        raise ValueError(
            f"{drift.req_id}: a specification-change event is only recorded for a drift"
            " that actually happened (SWR-3403)",
        )
    return AuditEvent(
        req_id=drift.req_id,
        kind=AuditEventKind.SPECIFICATION_CHANGED,
        at=at,
        actor=actor,
        reason=SPECIFICATION_CHANGED_REASON,
        # What the specification says now (SWR-3107)…
        requirement_hash=drift.current_hash,
        # …and the version the run was actually judged against (SWR-3402).
        satisfied_hash=drift.snapshot_hash,
        run_id=drift.run_id or None,
        evidence=(drift.diff,) if drift.diff else (),
        detail=f"{drift.detail}{f'; {detail}' if detail else ''}",
    )


@runtime_checkable
class AuditWriter(Protocol):
    """Where a recorded event goes (SWR-3213).

    A port rather than the store itself, so this module never has to know where
    a workspace keeps its trail and a test can read back what was recorded
    without a filesystem.
    :class:`~rotaris_core.requirements.delivery.audit.AuditStore` satisfies it.
    """

    def append(self, event: AuditEvent) -> AuditEvent:
        """Record *event*, and hand it back."""
        ...


@traces(SWR.SWR_3403, SWR.SWR_3213)
class ExecutionTransitions:
    """The delivery write path of a requirement run: guarded, and recorded.

    Two things are true of every transition a run causes, and neither may depend
    on a caller remembering them:

    - ``Review → Done`` passes through :func:`specification_guard`, so a
      requirement edited during its run cannot be accepted as delivered
      *whatever the workspace's own gate says* (SWR-3403). The workspace's gate
      is wrapped, never replaced, so its own conditions still apply.
    - every accepted transition appends one record to the requirement's audit
      trail (SWR-3213), because a state change nobody recorded is a state change
      nobody can explain afterwards.

    This is what :class:`~rotaris_core.requirements.execution.flow.RequirementFlow`
    requires as its writer: a bare
    :class:`~rotaris_core.requirements.delivery.transitions.DeliveryTransitions`
    carries neither property, and accepting one would make SWR-3403 a matter of
    whoever assembles the composition root having remembered it.

    *current_for* answers "what does this requirement say now" and is asked at
    the moment of the transition, never captured earlier — the whole point being
    a value that may have moved since the run started. It is the same lookup the
    flow re-reads the requirement with, so one function configures both halves.
    """

    #: Read by :class:`~rotaris_core.requirements.execution.flow.RequirementFlow`
    #: at construction: this writer cannot lose the SWR-3403 refusal.
    enforces_specification_guard: bool = True

    def __init__(
        self,
        store: DeliveryStore,
        *,
        current_for: Callable[[str], CanonicalRequirement | None],
        audit: AuditWriter,
        completion: CompletionGate | None = None,
        derived_for: Callable[[str], bool] | None = None,
    ) -> None:
        self._audit = audit
        self._current_for = current_for
        self._completion = completion
        self._transitions = DeliveryTransitions(
            store,
            completion=specification_guard(completion, current_hash_for=self._current_hash_for),
            derived_for=derived_for,
        )

    @property
    @traces(SWR.SWR_3215, SWR.SWR_3515)
    def enforces_completion_gate(self) -> bool:
        """Whether a ``Review → Done`` through this writer is judged, not granted.

        The sibling of :attr:`enforces_specification_guard`, and a property rather
        than a constant because unlike that one it *can* be absent: a writer built
        without a gate still passes through :func:`specification_guard`, so it
        still refuses a requirement edited mid-run — and grants every other
        ``Done`` by default. Two writers that both say "guarded" while only one
        asks SWR-3215's conditions is exactly the difference a composition root
        has to be able to check (SWR-3515).
        """
        return self._completion is not None

    @classmethod
    def for_workspace(
        cls,
        workspace: Path,
        *,
        current_for: Callable[[str], CanonicalRequirement | None],
        completion: CompletionGate | None = None,
        derived_for: Callable[[str], bool] | None = None,
    ) -> Self:
        """The guarded write path over *workspace*'s own delivery store and trail.

        The one-argument form a composition root uses: both stores live under
        ``<workspace>/.rotaris/requirements/`` and neither is worth constructing
        by hand at the call site.
        """
        return cls(
            DeliveryStore(workspace),
            current_for=current_for,
            audit=AuditStore(workspace),
            completion=completion,
            derived_for=derived_for,
        )

    def _current_hash_for(self, req_id: str) -> str:
        requirement = self._current_for(req_id)
        return requirement.current_hash if requirement is not None else ""

    @traces(SWR.SWR_3403, SWR.SWR_3213)
    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        """Apply *request* through the guarded gate, and record what happened.

        Only an *accepted* transition is recorded: a refusal changed nothing, and
        a trail that logged attempts would stop being the answer to "what
        happened to this requirement".
        """
        outcome = self._transitions.apply(request)
        if outcome.transition is not None:
            self._audit.append(AuditEvent.of_transition(outcome.transition))
        return outcome

    @traces(SWR.SWR_3213)
    def record_event(self, event: AuditEvent) -> AuditEvent:
        """Append one event that is not itself a transition (SWR-3213).

        The specification-change record of SWR-3403 is the case this exists for:
        it accompanies a transition rather than being one, and losing it would
        leave the mismatch reconstructible only from a sentence in a detail
        field.
        """
        return self._audit.append(event)
