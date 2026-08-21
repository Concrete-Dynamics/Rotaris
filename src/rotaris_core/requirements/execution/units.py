"""Execution units — the work artefacts a requirement is delivered through (SWR-3401).

A requirement says what the system must do. How much of it fits into one agent
run says nothing about the specification, and letting the second shape the first
is how requirement stores rot: teams start splitting requirements to suit a
context window, and the store stops describing the product.

So the split lives here instead, on Rotaris' side of the line:

```text
requirement (the project's, read from its source)   ──┐
                                                      ├─ never written by this module
execution unit (Rotaris', created and discarded)    ──┘
```

Four properties are load-bearing and each is asserted rather than promised:

- **One path for one unit and for five.** :func:`plan_units` takes a sequence of
  :class:`UnitSpec` and returns a :class:`RequirementUnits` whatever its length.
  There is no "simple requirement" short-cut that a five-unit requirement would
  have to work around later.
- **Nothing here writes to a source.** This module imports the requirement
  *model* and nothing that can write — no source adapter, no write-back, no
  store. A unit operation takes a value and returns a value; the requirement it
  belongs to is identified by id only, and its hash is never recomputed, never
  re-read and never touched.
- **Ids are derived, not drawn.** :func:`mint_unit_id` hashes the requirement id
  and the unit's key, so re-planning the same decomposition after a restart
  yields byte-identical ids. Uniqueness *within one delivery cycle* is enforced
  by :class:`RequirementUnits` rather than hoped for from the digest.
- **Discarding keeps the runs.** :meth:`RequirementUnits.discard` moves a unit
  into :attr:`RequirementUnits.discarded`; its run ids stay reachable through
  :attr:`RequirementUnits.run_ids`, which is what SWR-3414's history reads.
- **One identity per delivery cycle** (SWR-3417). A requirement can be delivered
  more than once, and the second delivery re-plans the same keys — so it mints
  the same ids, deliberately: an id names a *slice of work*, and this is that
  slice being done again. What tells the two apart is
  :attr:`ExecutionUnit.cycle`, never the id. :meth:`RequirementUnits.opened`
  starts the next cycle and retires the previous one's units instead of
  replacing them, so ``run_ids`` still answers for both.

The id stays out of it on purpose. A unit id is a key in five places — lookup
here, the join with SWR-3414's history, the flow's resume state, the git branch
namespace (SWR-3405) and the scheduler (SWR-3412) — and the desktop mints one
independently when a user starts a unit by hand. A discriminator inside the id
would have to reach every one of them at once; a field on the unit reaches them
one at a time, and :func:`mint_unit_id` stays byte-identical.

The *vocabulary* is shared with the board rather than restated: :class:`UnitState`
and :class:`ExecutionUnitView` come from
:mod:`rotaris_core.requirements.delivery.projection` (SWR-3216), so a unit and
the card that shows it cannot drift apart.
"""

from __future__ import annotations

import hashlib
import re
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import ExecutionUnitView, UnitState

if TYPE_CHECKING:
    from collections.abc import Collection, Mapping, Sequence

    from rotaris_core.requirements.delivery.projection import RunView
    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "ExecutionUnit",
    "RequirementUnits",
    "UnitError",
    "UnitSpec",
    "mint_unit_id",
    "plan_units",
    "slug_token",
    "units_for",
]

#: Everything a derived id may contain. Deliberately the intersection of what a
#: Git branch component, a file name and a JSON key all accept, because a unit id
#: ends up in all three (SWR-3405 branches, SWR-3414 history files).
_UNSAFE = re.compile(r"[^a-z0-9]+")

#: How much of a human-readable key survives into the id before the digest takes
#: over. Long enough to recognise, short enough to keep a branch name usable.
_SLUG_LIMIT = 24

#: Digest width, in hex characters. Four bytes is 2**32 values over the *titles
#: of one requirement's units* — the collision suffix below handles the rest.
_DIGEST_CHARS = 8


class UnitError(RuntimeError):
    """A unit operation would have produced an incoherent set of units.

    Deliberately **not** a :class:`ValueError`: half of these are raised inside
    Pydantic validators, and a ``ValueError`` there is swallowed into a
    ``ValidationError`` whose message buries the sentence a caller has to read.
    One exception type for every incoherence, whichever door it came through.
    """


@traces(SWR.SWR_3401)
def slug_token(value: str, *, limit: int = _SLUG_LIMIT) -> str:
    """*value* as a lower-case, hyphen-separated token safe for ids and branches.

    Shared with :mod:`rotaris_core.requirements.execution.run_seam` so a unit's id
    and the branch its run works on are slugged by one rule rather than two that
    can disagree about a colon.
    """
    token = _UNSAFE.sub("-", value.strip().casefold()).strip("-")
    if limit > 0:
        token = token[:limit].strip("-")
    return token


@traces(SWR.SWR_3401)
def mint_unit_id(req_id: str, key: str, *, taken: Collection[str] = ()) -> str:
    """A stable id for the unit *key* of *req_id*, avoiding every id in *taken*.

    Derived, never drawn: the same requirement and the same key produce the same
    id in this process, in the next one and after a restart, which is what makes
    a persisted unit re-identifiable without a separate id registry. The digest
    is over the *pair*, so two requirements that both have a "tests" unit do not
    share an id.

    A collision inside one requirement — two units keyed alike — is resolved by a
    deterministic ``-2``, ``-3`` suffix rather than by randomness, so replanning
    in the same order reproduces the same answer.
    """
    cleaned_req = req_id.strip()
    cleaned_key = key.strip()
    if not cleaned_req:
        raise UnitError("a unit belongs to a requirement; the requirement id is empty")
    if not cleaned_key:
        raise UnitError(f"{cleaned_req}: a unit needs a key to derive its id from")
    digest = hashlib.blake2b(
        f"{cleaned_req}\x00{cleaned_key}".encode(),
        digest_size=_DIGEST_CHARS // 2,
    ).hexdigest()
    stem = "-".join(part for part in (slug_token(cleaned_req), slug_token(cleaned_key)) if part)
    base = f"{stem}-{digest}" if stem else digest
    if base not in taken:
        return base
    for attempt in range(2, len(taken) + 3):
        candidate = f"{base}-{attempt}"
        if candidate not in taken:
            return candidate
    raise UnitError(f"{cleaned_req}: could not derive a free unit id for {cleaned_key!r}")


@traces(SWR.SWR_3401)
class UnitSpec(BaseModel):
    """What a decomposition asks for: one unit, before it has an id.

    The *key* is the handle siblings refer to each other by (``"tests"``,
    ``"impl"``), and it is what the id is derived from — so a decomposition is a
    value a caller can write down, compare and replay, rather than a sequence of
    calls whose ids depend on when they happened.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Referenced by sibling specs and hashed into the id. Defaults to the title.
    key: str = ""
    title: str = ""
    scope: str = ""
    #: Keys of sibling specs this one waits for (SWR-3406).
    depends_on: tuple[str, ...] = ()
    agent: str = ""
    retry_limit: int | None = None

    @model_validator(mode="after")
    def _has_a_handle(self) -> Self:
        if not self.handle:
            raise UnitError("a unit spec needs a key or a title to be referred to by")
        if self.handle in self.depends_on:
            raise UnitError(f"{self.handle}: a unit cannot wait for itself")
        return self

    @property
    def handle(self) -> str:
        """The key siblings use — the explicit one, or the title standing in."""
        return (self.key or self.title).strip()


@traces(SWR.SWR_3401)
class ExecutionUnit(BaseModel):
    """One unit of work belonging to exactly one requirement.

    Immutable. Everything that changes a unit returns a new one, and everything
    that changes a *set* of units goes through :class:`RequirementUnits`, which
    is where uniqueness and the dependency graph are checked.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    unit_id: str
    #: The requirement this unit serves. Identity only — no text, no hash: the
    #: requirement is read from its source, never carried around (SWR-3114).
    req_id: str
    #: Which delivery cycle of the requirement this unit belongs to, counted from
    #: zero (SWR-3417). Two units of one requirement may share a ``unit_id`` if
    #: and only if they belong to different cycles: the id says *which slice of
    #: work*, the cycle says *which delivery of it*.
    cycle: int = 0
    title: str = ""
    scope: str = ""
    #: Sibling unit ids this one waits for (SWR-3406).
    depends_on: tuple[str, ...] = ()
    state: UnitState = UnitState.PENDING
    #: The runs that executed this unit, oldest first (SWR-3414). Ids only: the
    #: run records live in the execution history, not inside the unit.
    run_ids: tuple[str, ...] = ()
    retries: int = 0
    retry_limit: int | None = None
    failure_reason: str = ""
    agent: str = ""

    @field_validator("unit_id", "req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise UnitError("a unit names both itself and the requirement it belongs to")
        return cleaned

    @field_validator("cycle")
    @classmethod
    def _counted_from_zero(cls, value: int) -> int:
        if value < 0:
            raise UnitError(f"a delivery cycle is counted from zero; got {value} (SWR-3417)")
        return value

    @model_validator(mode="after")
    def _no_self_dependency(self) -> Self:
        if self.unit_id in self.depends_on:
            raise UnitError(f"{self.unit_id}: a unit cannot wait for itself")
        if len(set(self.depends_on)) != len(self.depends_on):
            raise UnitError(f"{self.unit_id}: a dependency is named twice")
        return self

    @property
    def ran(self) -> bool:
        """Whether any run ever executed this unit."""
        return bool(self.run_ids)

    @property
    def last_run_id(self) -> str | None:
        """The newest run of this unit, or ``None`` when it never ran."""
        return self.run_ids[-1] if self.run_ids else None

    @property
    def retries_exhausted(self) -> bool:
        """Whether the retry bound has been reached (SWR-3415)."""
        return self.retry_limit is not None and self.retries >= self.retry_limit

    def evolve(self, **changes: object) -> ExecutionUnit:
        """A re-validated copy with *changes* applied."""
        data: dict[str, object] = self.model_dump()
        data.update(changes)
        return ExecutionUnit.model_validate(data)

    def with_run(self, run_id: str) -> ExecutionUnit:
        """This unit with *run_id* recorded as its newest run."""
        cleaned = run_id.strip()
        if not cleaned:
            raise UnitError(f"{self.unit_id}: a recorded run needs an id")
        if cleaned in self.run_ids:
            return self
        return self.evolve(run_ids=(*self.run_ids, cleaned))

    @traces(SWR.SWR_3401)
    def to_view(self, runs: Sequence[RunView] = ()) -> ExecutionUnitView:
        """This unit as the board reads it (SWR-3216).

        *runs* are the run records for :attr:`run_ids`, resolved by the caller —
        the unit stores ids, the history stores records, and neither is rebuilt
        from the other here.
        """
        return ExecutionUnitView(
            unit_id=self.unit_id,
            cycle=self.cycle,
            title=self.title,
            scope=self.scope,
            depends_on=self.depends_on,
            state=self.state,
            runs=tuple(runs),
            retries=self.retries,
            retry_limit=self.retry_limit,
            failure_reason=self.failure_reason,
            agent=self.agent,
        )


@traces(SWR.SWR_3401)
class RequirementUnits(BaseModel):
    """Every unit of one requirement, live and discarded, as one coherent value.

    The invariants are checked on construction, so an incoherent set cannot be
    built and then noticed later: ``(cycle, unit_id)`` is unique across live
    *and* retired units, every live unit belongs to the current cycle, every
    dependency names a live sibling, and the dependency graph has no loop. Every
    mutation returns a new value and is re-validated by the same rules, which is
    why ``split`` and ``discard`` cannot leave a dangling edge.

    Uniqueness is on the *pair*, not on the id, because a requirement can be
    delivered more than once and the second delivery re-plans the same keys
    (SWR-3417). Within one cycle an id is still handed out exactly once — a
    discarded unit keeps its id for ever, so the next plan of that cycle can
    never re-attach its runs to different work.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The delivery cycle the live units belong to, counted from zero (SWR-3417).
    cycle: int = 0
    units: tuple[ExecutionUnit, ...] = ()
    #: Units that were split up, given up on, or belong to a delivery cycle that
    #: is over. Kept — never deleted — because their runs are part of the
    #: requirement's execution history (SWR-3401, SWR-3414, SWR-3417), and a
    #: history with a hole in it answers nothing.
    discarded: tuple[ExecutionUnit, ...] = ()

    @classmethod
    def blank(cls, req_id: str) -> Self:
        """A requirement that has no units yet — the honest starting value."""
        return cls(req_id=req_id)

    @field_validator("cycle")
    @classmethod
    def _counted_from_zero(cls, value: int) -> int:
        if value < 0:
            raise UnitError(f"a delivery cycle is counted from zero; got {value} (SWR-3417)")
        return value

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        every = (*self.units, *self.discarded)
        seen: set[tuple[int, str]] = set()
        for unit in every:
            if unit.req_id != self.req_id:
                raise UnitError(
                    f"{unit.unit_id} belongs to {unit.req_id}, not to {self.req_id};"
                    " a unit belongs to exactly one requirement (SWR-3401)",
                )
            if (unit.cycle, unit.unit_id) in seen:
                raise UnitError(
                    f"{self.req_id}: unit id {unit.unit_id!r} is used twice in"
                    f" delivery cycle {unit.cycle + 1} (SWR-3417)",
                )
            seen.add((unit.cycle, unit.unit_id))
            if unit.cycle > self.cycle:
                raise UnitError(
                    f"{self.req_id}: unit {unit.unit_id!r} claims delivery cycle"
                    f" {unit.cycle + 1}, which this requirement has not reached"
                    f" (it is on cycle {self.cycle + 1}) (SWR-3417)",
                )
        for unit in self.units:
            if unit.cycle != self.cycle:
                raise UnitError(
                    f"{self.req_id}: live unit {unit.unit_id!r} belongs to delivery cycle"
                    f" {unit.cycle + 1}, but the requirement is delivering cycle"
                    f" {self.cycle + 1}; an earlier cycle's units are retired, never"
                    " left live (SWR-3417)",
                )
        live = {unit.unit_id for unit in self.units}
        for unit in self.units:
            unknown = [dep for dep in unit.depends_on if dep not in live]
            if unknown:
                raise UnitError(
                    f"{unit.unit_id}: waits for {unknown} which is not a live sibling unit",
                )
        self._assert_acyclic()
        return self

    def _assert_acyclic(self) -> None:
        edges = {unit.unit_id: set(unit.depends_on) for unit in self.units}
        resolved: set[str] = set()
        pending = dict(edges)
        while pending:
            free = sorted(unit_id for unit_id, deps in pending.items() if deps.issubset(resolved))
            if not free:
                raise UnitError(
                    f"{self.req_id}: units {sorted(pending)} depend on each other in a cycle",
                )
            resolved.update(free)
            for unit_id in free:
                del pending[unit_id]

    # -- reading ------------------------------------------------------------

    @property
    def ids(self) -> tuple[str, ...]:
        """Live unit ids, in declaration order."""
        return tuple(unit.unit_id for unit in self.units)

    @property
    def count(self) -> int:
        """How many live units this requirement has — the number a card prints."""
        return len(self.units)

    @property
    def run_ids(self) -> tuple[str, ...]:
        """Every run this requirement's units produced, discarded units included.

        The property SWR-3401's fourth acceptance criterion is about: discarding
        a unit removes it from the plan and removes nothing from the history.
        Ordered by unit — live units in declaration order, then discarded ones —
        so the value is stable across reads; the *chronological* order of runs is
        the execution history's answer (SWR-3414), not this one's.
        """
        return self._runs_of(*self.units, *self.discarded)

    @property
    def cycles(self) -> tuple[int, ...]:
        """Every delivery cycle this requirement has units for, oldest first.

        ``(0, 1)`` reads as "delivered once, being delivered again" (SWR-3417).
        """
        return tuple(sorted({unit.cycle for unit in (*self.units, *self.discarded)}))

    def for_cycle(self, cycle: int) -> tuple[ExecutionUnit, ...]:
        """Every unit of *cycle*, live and retired, in the order they were planned."""
        return tuple(unit for unit in (*self.units, *self.discarded) if unit.cycle == cycle)

    def run_ids_of(self, cycle: int) -> tuple[str, ...]:
        """Every run *cycle*'s units produced — the per-cycle half of :attr:`run_ids`.

        The reading SWR-3417 is about: "what did the first delivery do, and what
        did the second one do" is a question a whole-requirement list cannot
        answer, and it is the question a reader looking at a re-delivery asks.
        """
        return self._runs_of(*self.for_cycle(cycle))

    @staticmethod
    def _runs_of(*units: ExecutionUnit) -> tuple[str, ...]:
        seen: list[str] = []
        for unit in units:
            for run_id in unit.run_ids:
                if run_id not in seen:
                    seen.append(run_id)
        return tuple(seen)

    @property
    def outstanding(self) -> tuple[str, ...]:
        """Live units that still owe work, in declaration order."""
        return tuple(unit.unit_id for unit in self.units if unit.state.outstanding)

    @property
    def complete(self) -> bool:
        """Whether every live unit has finished. Vacuously false with no units.

        A requirement with no units has delivered nothing, and reporting it
        complete would let an empty plan reach ``Done``.
        """
        return bool(self.units) and not self.outstanding

    def get(self, unit_id: str) -> ExecutionUnit | None:
        """The live unit with this id, or ``None``."""
        return next((unit for unit in self.units if unit.unit_id == unit_id), None)

    def require(self, unit_id: str) -> ExecutionUnit:
        """The live unit with this id, or a stated error."""
        unit = self.get(unit_id)
        if unit is None:
            raise UnitError(f"{self.req_id}: no live unit {unit_id!r} (have {list(self.ids)})")
        return unit

    def ready(self) -> tuple[ExecutionUnit, ...]:
        """Units whose dependencies have finished and which have not started.

        Ordering is declaration order; *which* of them actually runs, and how
        many at once, is the scheduler's decision (SWR-3412), not this value's.
        """
        finished = {unit.unit_id for unit in self.units if unit.state is UnitState.FINISHED}
        return tuple(
            unit
            for unit in self.units
            if unit.state in {UnitState.PENDING, UnitState.QUEUED, UnitState.HELD}
            and set(unit.depends_on).issubset(finished)
        )

    def dependents_of(self, unit_id: str) -> tuple[str, ...]:
        """Live units waiting for *unit_id*."""
        return tuple(unit.unit_id for unit in self.units if unit_id in unit.depends_on)

    # -- writing (values in, values out; no source, no store) ----------------

    def replaced(self, unit: ExecutionUnit) -> RequirementUnits:
        """This set with *unit* standing in for the live unit of the same id.

        Re-validated, not patched in: swapping a unit can break the dependency
        graph as easily as adding one, and the invariants are checked in exactly
        one place.
        """
        self.require(unit.unit_id)
        return RequirementUnits(
            req_id=self.req_id,
            cycle=self.cycle,
            units=tuple(
                unit if existing.unit_id == unit.unit_id else existing for existing in self.units
            ),
            discarded=self.discarded,
        )

    def with_run(self, unit_id: str, run_id: str) -> RequirementUnits:
        """This set with *run_id* recorded against *unit_id*."""
        return self.replaced(self.require(unit_id).with_run(run_id))

    def with_state(
        self,
        unit_id: str,
        state: UnitState,
        *,
        failure_reason: str = "",
    ) -> RequirementUnits:
        """This set with *unit_id* in *state*.

        A unit's state is the scheduler's and the runner's business (SWR-3412,
        SWR-3415); it is **not** a delivery state and moving it changes nothing
        about the requirement — the delivery state moves only through
        :func:`~rotaris_core.requirements.delivery.transitions.apply_transition`.
        """
        return self.replaced(
            self.require(unit_id).evolve(state=state, failure_reason=failure_reason),
        )

    @property
    def _spoken_for(self) -> set[str]:
        """Every id **this cycle** has used — live or retired.

        A discarded unit's id is never handed out again *within its cycle*: its
        runs still point at it, and re-issuing it would silently re-attach that
        history to different work (the same reasoning as SWR-3113's tombstones).
        Across cycles the id deliberately recurs — that is the same slice of work
        being delivered again, and :attr:`ExecutionUnit.cycle` is what separates
        them (SWR-3417). Scoping the reservation to the cycle is also what keeps
        a re-delivery minting the *same* ids as the first one, which the desktop
        relies on when a user starts a unit by hand.
        """
        return self._retired_ids | {unit.unit_id for unit in self.units}

    @property
    def _retired_ids(self) -> set[str]:
        """Ids this cycle has retired — reserved even when nothing live holds them."""
        return {unit.unit_id for unit in self.discarded if unit.cycle == self.cycle}

    @traces(SWR.SWR_3401)
    def added(self, specs: Sequence[UnitSpec]) -> RequirementUnits:
        """This set with *specs* planned onto it, ids derived and edges resolved."""
        return RequirementUnits(
            req_id=self.req_id,
            cycle=self.cycle,
            units=(
                *self.units,
                *_derive(
                    self.req_id,
                    specs,
                    taken=self._spoken_for,
                    existing=self.ids,
                    cycle=self.cycle,
                ),
            ),
            discarded=self.discarded,
        )

    @traces(SWR.SWR_3417)
    def continued(self, specs: Sequence[UnitSpec]) -> RequirementUnits:
        """This same delivery cycle, re-planned from *specs*.

        What a resuming flow wants: ids are derived (SWR-3401), so the plan comes
        back with the ids the previous process used, and the runs already
        recorded against them are carried onto the re-planned units rather than
        dropped. Everything retired — this cycle's discards and every earlier
        cycle — is kept untouched, so :attr:`run_ids` still answers for all of it.

        Only the runs are carried. State, retries and the failure reason are the
        flow's to re-establish from its own recorded progress (SWR-3413); copying
        them here would be this value guessing at a decision it does not own.
        """
        planned: list[ExecutionUnit] = []
        for unit in _derive(self.req_id, specs, taken=self._retired_ids, cycle=self.cycle):
            previous = self.get(unit.unit_id)
            planned.append(
                unit.evolve(run_ids=previous.run_ids) if previous is not None else unit,
            )
        return RequirementUnits(
            req_id=self.req_id,
            cycle=self.cycle,
            units=tuple(planned),
            discarded=self.discarded,
        )

    @traces(SWR.SWR_3417)
    def opened(self, specs: Sequence[UnitSpec]) -> RequirementUnits:
        """The **next** delivery cycle of this requirement, planned from *specs*.

        Every unit of every cycle before it is retired — kept, never replaced —
        which is the whole point: a requirement delivered twice has two sets of
        runs, and a store that let the second plan overwrite the first would
        erase the first delivery's history the moment the second one saved
        (SWR-3401's fourth acceptance criterion, SWR-3414, SWR-3417).

        The new cycle mints the *same* ids the previous one did, deliberately: an
        id names a slice of work, and this is that slice being delivered again.
        Their retired state is left exactly as it was — a finished unit of the
        first cycle finished, and rewriting it as abandoned would be a lie about
        what happened.
        """
        following = self.cycle + 1
        return RequirementUnits(
            req_id=self.req_id,
            cycle=following,
            units=_derive(self.req_id, specs, cycle=following),
            discarded=(*self.discarded, *self.units),
        )

    @traces(SWR.SWR_3401)
    def discard(self, unit_id: str, *, reason: str = "") -> RequirementUnits:
        """Give up on *unit_id*, keeping it — and its runs — in the history.

        Every sibling that waited for it stops waiting: a unit nobody will run
        can never finish, and leaving the edge in place would hold its dependents
        for ever. The discarded unit keeps its run ids, so
        :attr:`run_ids` still reports them (SWR-3401).
        """
        unit = self.require(unit_id)
        retired = unit.evolve(
            state=UnitState.ABANDONED,
            failure_reason=reason.strip() or unit.failure_reason,
        )
        return RequirementUnits(
            req_id=self.req_id,
            cycle=self.cycle,
            units=tuple(
                other.evolve(depends_on=tuple(d for d in other.depends_on if d != unit_id))
                for other in self.units
                if other.unit_id != unit_id
            ),
            discarded=(*self.discarded, retired),
        )

    @traces(SWR.SWR_3401)
    def split(self, unit_id: str, specs: Sequence[UnitSpec]) -> RequirementUnits:
        """Replace *unit_id* with the units *specs* describe, in its place.

        The new units inherit what the old one waited for; everything that waited
        for the old one now waits for all of them, because "part of the work is
        done" is not a state a dependency can be in. The replaced unit is
        retired rather than deleted, so its runs stay in the history.
        """
        if not specs:
            raise UnitError(f"{unit_id}: splitting produces units; none were given")
        original = self.require(unit_id)
        pieces = _derive(
            self.req_id,
            specs,
            taken=self._spoken_for,
            existing=tuple(other for other in self.ids if other != unit_id),
            inherited=original.depends_on,
            cycle=self.cycle,
        )
        new_ids = tuple(piece.unit_id for piece in pieces)
        rebuilt: list[ExecutionUnit] = []
        for existing in self.units:
            if existing.unit_id == unit_id:
                rebuilt.extend(pieces)
                continue
            if unit_id in existing.depends_on:
                rebuilt.append(
                    existing.evolve(
                        depends_on=tuple(dep for dep in existing.depends_on if dep != unit_id)
                        + new_ids,
                    ),
                )
                continue
            rebuilt.append(existing)
        retired = original.evolve(state=UnitState.ABANDONED)
        return RequirementUnits(
            req_id=self.req_id,
            cycle=self.cycle,
            units=tuple(rebuilt),
            discarded=(*self.discarded, retired),
        )

    @traces(SWR.SWR_3401)
    def to_views(
        self, runs: Mapping[str, Sequence[RunView]] | None = None
    ) -> tuple[
        ExecutionUnitView,
        ...,
    ]:
        """Live units as the board reads them, discarded ones left out (SWR-3216)."""
        resolved = runs or {}
        return tuple(unit.to_view(resolved.get(unit.unit_id, ())) for unit in self.units)


def _derive(
    req_id: str,
    specs: Sequence[UnitSpec],
    *,
    taken: Collection[str] = (),
    existing: Collection[str] = (),
    inherited: tuple[str, ...] = (),
    cycle: int = 0,
) -> tuple[ExecutionUnit, ...]:
    """Derive ids for *specs* and resolve their edges. Nothing is assembled here.

    Returns loose units rather than a :class:`RequirementUnits` on purpose: a
    split's new pieces are only coherent *once they are in the place the old unit
    had*, so the single validation happens at assembly, in the caller, and never
    over a half-built intermediate.

    *taken* are ids that must not be minted again **in this cycle**; *existing*
    are the live ids a spec may point at by id; *inherited* is prefixed to every
    new unit's dependencies; *cycle* is the delivery cycle the units belong to
    (SWR-3417) and is carried onto them rather than into their ids.
    """
    reserved = set(taken)
    known = set(existing)
    by_handle: dict[str, str] = {}
    minted: list[tuple[UnitSpec, str]] = []
    for spec in specs:
        handle = spec.handle
        if handle in by_handle:
            raise UnitError(f"{req_id}: two units are keyed {handle!r} in one decomposition")
        unit_id = mint_unit_id(req_id, handle, taken=reserved)
        reserved.add(unit_id)
        by_handle[handle] = unit_id
        minted.append((spec, unit_id))

    planned: list[ExecutionUnit] = []
    for spec, unit_id in minted:
        edges: list[str] = list(inherited)
        for dependency in spec.depends_on:
            # A spec names a sibling by handle, or an already existing unit by id.
            resolved = by_handle.get(dependency) or (dependency if dependency in known else None)
            if resolved is None:
                raise UnitError(
                    f"{req_id}: unit {spec.handle!r} waits for {dependency!r},"
                    " which is neither a sibling in this decomposition nor an existing unit",
                )
            if resolved not in edges:
                edges.append(resolved)
        planned.append(
            ExecutionUnit(
                unit_id=unit_id,
                req_id=req_id,
                cycle=cycle,
                title=spec.title or spec.handle,
                scope=spec.scope,
                depends_on=tuple(edges),
                agent=spec.agent,
                retry_limit=spec.retry_limit,
            ),
        )
    return tuple(planned)


@traces(SWR.SWR_3401)
def plan_units(req_id: str, specs: Sequence[UnitSpec], *, cycle: int = 0) -> RequirementUnits:
    """The units *specs* describe for *req_id*, in delivery *cycle*.

    One path for one unit and for five: the length of *specs* changes the result
    and nothing else. Deterministic — the same requirement and the same specs
    produce the same ids, which is what makes a plan re-identifiable after a
    restart (SWR-3401), and *cycle* does not disturb that: it is carried on the
    units, never mixed into their ids (SWR-3417).

    Plans a cycle from nothing. A requirement that already has units re-plans
    through :meth:`RequirementUnits.continued` or :meth:`RequirementUnits.opened`,
    which keep what is already recorded.
    """
    return RequirementUnits(req_id=req_id, cycle=cycle, units=_derive(req_id, specs, cycle=cycle))


@traces(SWR.SWR_3401)
def units_for(
    requirement: CanonicalRequirement,
    specs: Sequence[UnitSpec],
    *,
    cycle: int = 0,
) -> RequirementUnits:
    """The units for *requirement*, reading only its id.

    Takes the requirement rather than its id so the call site reads as what it
    is — and reads *nothing but* :attr:`~CanonicalRequirement.req_id` from it, so
    planning cannot depend on, and cannot disturb, the requirement's text, hash
    or lifecycle.
    """
    return plan_units(requirement.req_id, specs, cycle=cycle)
