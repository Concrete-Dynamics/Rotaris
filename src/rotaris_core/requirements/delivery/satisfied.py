"""``satisfied_hash`` — which specification version was actually delivered (SWR-3204).

"Done" without a version is a claim that decays silently: the requirement is
edited, the code stays as it was, and the board keeps showing green. Recording
*which* version was satisfied is what turns a later edit into visible work, and
the comparison ``current_hash == satisfied_hash`` is this product's definition of
"the implementation matches the specification" (the trigger for SWR-3502).

**The hash is the run's, not the clock's.** A requirement can be edited while an
agent is implementing it. The run works against the snapshot it started from
(SWR-3402), so the version it delivered is the snapshot's hash — *not* whatever
the requirement says at the moment a human accepts the review. Taking the
acceptance-time hash would make the board claim that the newest text was
implemented by a run that never saw it, and would hide exactly the case this
whole mechanism exists to expose. :meth:`SatisfiedDelivery.from_snapshot` is
therefore the intended constructor, and :class:`DeliverySnapshot` is the shape
SWR-3402's snapshot has to satisfy.

**Deliveries accumulate.** :class:`SatisfiedLog` appends; it never overwrites. A
requirement delivered three times has three entries, so SWR-3214's revision
history can answer "which run delivered which version" instead of only "which
version is current".

**Never delivered is not stale.** :class:`SatisfactionState` keeps the two apart:
a requirement with no entry at all has no ``satisfied_hash``, which is a
different fact from one whose recorded hash no longer matches the specification.
Collapsing them would make a brand-new requirement look like a regression.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator

from rotaris_core.reqtocode import SWR, traces

__all__ = [
    "DeliveryOrigin",
    "DeliverySnapshot",
    "SatisfactionState",
    "SatisfiedDelivery",
    "SatisfiedLog",
]


@traces(SWR.SWR_3219)
class DeliveryOrigin(StrEnum):
    """Where the claim "this version was delivered" came from (SWR-3219).

    One question — *who says so* — with three answers, introduced together so a
    later one extends nothing. The delivered *version* is the same fact in all
    three cases; only its provenance differs, which is why this is a field on the
    delivery and not a second delivery state.
    """

    #: A Rotaris execution run implemented it. The default, and what every record
    #: written before this field existed means.
    ROTARIS = "rotaris"
    #: A Rotaris verification run confirmed an implementation Rotaris did not
    #: write (SWR-3217) — the brownfield case.
    ADOPTED = "adopted"
    #: A requirement source reported it (SWR-3118). Part of the vocabulary so an
    #: issue-tracker adapter docks onto it; nothing produces it yet.
    EXTERNAL = "external"

    @property
    def label(self) -> str:
        """What a card prints beside the run — ``Adopted``, not ``adopted``."""
        return self.value.capitalize()


@runtime_checkable
class DeliverySnapshot(Protocol):
    """What a run captured at its start, as far as satisfaction is concerned.

    The published seam between this slice and SWR-3402: the run snapshot carries
    more (base commit, agent context), but these are the fields a satisfied
    record is built from. Structural rather than nominal, so the execution slice
    owns its own model and this module never imports it.
    """

    @property
    def req_id(self) -> str:
        """The requirement the run was started for."""
        ...

    @property
    def requirement_hash(self) -> str:
        """The requirement's ``current_hash`` **at run start** (SWR-3107, SWR-3402)."""
        ...

    @property
    def source_revision(self) -> str | None:
        """The source's own revision token at run start, when it had one."""
        ...

    @property
    def base_commit(self) -> str | None:
        """The commit the run branched from."""
        ...

    @property
    def unit_id(self) -> str | None:
        """The execution unit (SWR-3401) this snapshot belongs to."""
        ...

    @property
    def session_id(self) -> str | None:
        """The session that carried the run."""
        ...


class SatisfactionState(StrEnum):
    """How a requirement's delivered version relates to its current one."""

    #: No run ever delivered this requirement. Distinct from :attr:`STALE`.
    NEVER_DELIVERED = "never-delivered"
    #: The delivered version *is* the current one.
    SATISFIED = "satisfied"
    #: A version was delivered, and the specification has moved since (SWR-3502).
    STALE = "stale"


@traces(SWR.SWR_3204)
class SatisfiedDelivery(BaseModel):
    """One delivery: which version, by which run, verified at which commit, when.

    Immutable, and every field is a fact about something that already happened.
    ``satisfied_hash`` and ``run_id`` are mandatory — a delivery that cannot name
    the version it delivered or the run that delivered it is not evidence of
    anything, and admitting one would make ``Done`` reachable without a hash,
    which SWR-3204 forbids.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str = ""
    #: The requirement hash the delivering run **started** against (SWR-3402).
    satisfied_hash: str
    #: The run that delivered it — the key into the execution history (SWR-3414).
    run_id: str
    satisfied_at: dt.datetime
    #: The commit whose verification passed (SWR-3410). ``None`` when the delivery
    #: was accepted without a verified commit, which stays visible rather than
    #: being papered over with the base commit.
    verified_commit: str | None = None
    source_revision: str | None = None
    unit_id: str | None = None
    session_id: str | None = None
    #: Who claims this version was delivered (SWR-3219). Defaults to ``rotaris``,
    #: so a record written before the field existed reads back as what it was.
    origin: DeliveryOrigin = DeliveryOrigin.ROTARIS

    @property
    def adopted(self) -> bool:
        """Whether this delivery was adopted rather than run by Rotaris (SWR-3217)."""
        return self.origin is DeliveryOrigin.ADOPTED

    @field_validator("satisfied_hash", "run_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "a satisfied delivery names both the version it delivered and the"
                " run that delivered it (SWR-3204)",
            )
        return cleaned

    @field_validator("satisfied_at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("a delivery timestamp is aware, never naive")
        return value

    @classmethod
    @traces(SWR.SWR_3204)
    def from_snapshot(
        cls,
        snapshot: DeliverySnapshot,
        *,
        run_id: str,
        at: dt.datetime,
        verified_commit: str | None = None,
    ) -> Self:
        """The satisfied record for a run that delivered *snapshot*'s version.

        Reads the hash from the **snapshot**, which is the whole point: a
        requirement edited while the run was in flight must leave a record naming
        the version the run actually saw, so the edit shows up as ``Needs
        Update`` (SWR-3502) instead of being silently absorbed into a green card.
        """
        return cls(
            req_id=snapshot.req_id,
            satisfied_hash=snapshot.requirement_hash,
            run_id=run_id,
            satisfied_at=at,
            verified_commit=verified_commit,
            source_revision=snapshot.source_revision,
            unit_id=snapshot.unit_id,
            session_id=snapshot.session_id,
        )

    @classmethod
    @traces(SWR.SWR_3219, SWR.SWR_3217)
    def adopted_by(
        cls,
        req_id: str,
        *,
        satisfied_hash: str,
        run_id: str,
        at: dt.datetime,
        verified_commit: str | None = None,
        source_revision: str | None = None,
    ) -> Self:
        """The satisfied record for work a verification run *confirmed* (SWR-3217).

        The distinction from :meth:`from_snapshot` is the whole point of the
        origin: there was no implementing run, so there is no snapshot to read a
        hash from and no unit that produced it. What there *is* is a verification
        run that executed the covering tests against a commit and passed, which is
        why ``run_id`` stays mandatory here too — an adoption that cannot name the
        run that checked it is a claim, and SWR-3217 is built to refuse claims.
        """
        return cls(
            req_id=req_id,
            satisfied_hash=satisfied_hash,
            run_id=run_id,
            satisfied_at=at,
            verified_commit=verified_commit,
            source_revision=source_revision,
            origin=DeliveryOrigin.ADOPTED,
        )

    @property
    def summary(self) -> str:
        """One line for the history view (SWR-3214).

        States the origin where it states the run, so "delivered by run 72" and
        "adopted from verification" can never be read as the same event
        (SWR-3219).
        """
        commit = f" at {self.verified_commit}" if self.verified_commit else ""
        how = "adopted from verification run" if self.adopted else "delivered by run"
        return (
            f"{self.satisfied_hash} {how} {self.run_id}{commit} on {self.satisfied_at.isoformat()}"
        )


@traces(SWR.SWR_3204)
class SatisfiedLog(BaseModel):
    """Every version of a requirement that was ever delivered, oldest first.

    Append-only by construction: :meth:`appended` returns a new log and no method
    removes or rewrites an entry, which is what lets SWR-3214 name which run
    delivered which version years later. ``limit`` prunes the *oldest* entries
    when a workspace caps its history (``requirements.store.history_limit``), so
    the current delivery is never the one that falls off.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    entries: tuple[SatisfiedDelivery, ...] = ()

    @property
    def delivered(self) -> bool:
        """Whether any version of this requirement was ever delivered."""
        return bool(self.entries)

    @property
    def current(self) -> SatisfiedDelivery | None:
        """The most recent delivery, or ``None`` for a requirement never delivered."""
        return self.entries[-1] if self.entries else None

    @property
    def satisfied_hash(self) -> str | None:
        """The version last delivered, or ``None`` — never an empty string.

        ``None`` is the "never delivered" answer and it is deliberately not
        spellable as a hash that failed to match (SWR-3204).
        """
        current = self.current
        return current.satisfied_hash if current is not None else None

    @property
    def hashes(self) -> tuple[str, ...]:
        """Every delivered version in delivery order, duplicates kept."""
        return tuple(entry.satisfied_hash for entry in self.entries)

    def appended(self, entry: SatisfiedDelivery, *, limit: int | None = None) -> SatisfiedLog:
        """This log with *entry* recorded as the newest delivery."""
        kept = (*self.entries, entry)
        if limit is not None and limit > 0 and len(kept) > limit:
            kept = kept[len(kept) - limit :]
        return SatisfiedLog(entries=kept)

    def matches(self, current_hash: str) -> bool:
        """Whether the delivered version *is* the specification's current one."""
        return self.satisfied_hash is not None and self.satisfied_hash == current_hash.strip()

    def state_for(self, current_hash: str) -> SatisfactionState:
        """``never-delivered`` / ``satisfied`` / ``stale`` against *current_hash*."""
        if not self.delivered:
            return SatisfactionState.NEVER_DELIVERED
        return (
            SatisfactionState.SATISFIED if self.matches(current_hash) else SatisfactionState.STALE
        )

    def delivering(self, requirement_hash: str) -> SatisfiedDelivery | None:
        """The run that delivered *requirement_hash*, or ``None``.

        The query SWR-3214's revision history is built on: given a version of the
        specification, which run delivered it. The **newest** matching delivery
        wins, so a version delivered, regressed and delivered again reports the
        delivery that still stands.
        """
        wanted = requirement_hash.strip()
        return next(
            (entry for entry in reversed(self.entries) if entry.satisfied_hash == wanted),
            None,
        )
