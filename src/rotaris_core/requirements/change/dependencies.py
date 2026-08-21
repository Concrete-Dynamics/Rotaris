"""Dependencies gate execution (SWR-3510).

A requirement that depends on another cannot sensibly be implemented first: the
agent would invent the missing foundation, and when the real one lands the two
implementations disagree. The relation exists in the model (SWR-3109); this is
the rule that makes the scheduler honour it.

**Satisfied means delivered, not merely closed.** SWR-3510 spells it out: a
dependency is met when it is ``Done`` *and* ``current_hash == satisfied_hash``
(SWR-3204). A dependency that was delivered and whose specification then moved is
``Done`` on the board and **not** a foundation to build on, so it holds its
dependants exactly like an unfinished one — with its own reason
(:attr:`DependencyBlockKind.STALE`), because "wait, it is being rebuilt" and
"wait, it has not started" are different things to a user.

**Unknown never reads as met.** A dependency nothing is known about — an id
outside the evaluated set, a dangling relation (SWR-3109) — blocks. Guessing the
other way would start dependent work on an assumption, which is the one direction
of this decision that cannot be undone by waiting.

**The blocker names the id.** ``Blocked by SWR-501`` is the product requirement,
not ``Blocked``: a board that says only "blocked" moves the work of finding out
onto the user, every time they look.

**A cycle blocks everyone in it.** Cycles are found with Tarjan's algorithm — one
linear pass, no recursion, deterministic output — and every member gets a blocker
naming the whole cycle. Reporting it on one arbitrary member would send a user to
break the loop at whichever node happened to be visited first.

Pure: values in, values out. No clock, no filesystem, no store, no model call.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.model import RelationKind, requirement_sort_key

if TYPE_CHECKING:
    from collections.abc import Collection, Iterable, Mapping, Sequence

    from rotaris_core.requirements.delivery.satisfied import SatisfiedLog
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.relations import RelationGraph

__all__ = [
    "DependencyBlockKind",
    "DependencyBlocker",
    "DependencyCycle",
    "DependencyRelease",
    "DependencyReport",
    "DependencyVerdict",
    "ReleasePlan",
    "RequirementReadiness",
    "dependency_edges",
    "evaluate_dependencies",
    "find_cycles",
    "gate",
    "plan_release",
    "readiness_of",
    "release_after",
]


@traces(SWR.SWR_3510)
class DependencyBlockKind(StrEnum):
    """Why a dependency does not release its dependant.

    Four reasons rather than one boolean, because they need four different
    actions from the user: wait, wait for a rebuild, fix a broken reference, or
    break a loop.
    """

    #: The dependency exists and is not ``Done``.
    UNSATISFIED = "unsatisfied"
    #: The dependency is ``Done``, but the version it delivered is no longer the
    #: current specification (SWR-3204, SWR-3502).
    STALE = "stale"
    #: Nothing is known about the dependency — an id outside the evaluated set,
    #: or a relation whose target does not resolve (SWR-3109).
    UNKNOWN = "unknown"
    #: The dependency graph closes on itself; nothing in the loop can ever start.
    CYCLE = "cycle"

    @property
    def label(self) -> str:
        """``Unsatisfied`` — what a card prints."""
        return self.value.capitalize()


@traces(SWR.SWR_3510)
class RequirementReadiness(BaseModel):
    """Whether one requirement is a foundation others may build on.

    Two facts, and both are needed: the delivery state answers "was it built",
    the hash pair answers "is what was built still what the specification says"
    (SWR-3204). ``Done`` alone is not enough, and this is the value that keeps the
    two from being collapsed at the call site.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    state: DeliveryState = DeliveryState.BACKLOG
    #: The specification's current version (SWR-3107).
    current_hash: str = ""
    #: The version actually delivered, or ``None`` when nothing ever was.
    satisfied_hash: str | None = None

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("readiness is about a named requirement")
        return cleaned

    @property
    def delivered(self) -> bool:
        """Whether any version of this requirement was ever delivered."""
        return self.satisfied_hash is not None

    @property
    def satisfied(self) -> bool:
        """SWR-3510's definition: ``Done`` and the delivered version is current.

        An empty ``current_hash`` never satisfies. A requirement whose
        specification hash is unknown cannot be shown to have been delivered, and
        the safe reading of "cannot be shown" is "not yet".
        """
        return (
            self.state is DeliveryState.DONE
            and bool(self.current_hash)
            and self.satisfied_hash == self.current_hash
        )

    @property
    def block_kind(self) -> DependencyBlockKind | None:
        """Why this requirement is not a foundation, or ``None`` when it is."""
        if self.satisfied:
            return None
        if self.state is DeliveryState.DONE:
            return DependencyBlockKind.STALE
        return DependencyBlockKind.UNSATISFIED

    @property
    def detail(self) -> str:
        """One clause explaining :attr:`block_kind`."""
        if self.satisfied:
            return f"{self.req_id} is Done and delivered {self.current_hash}"
        if self.state is DeliveryState.DONE:
            delivered = self.satisfied_hash or "nothing"
            return (
                f"{self.req_id} is Done but delivered {delivered}; the specification"
                f" is now {self.current_hash or 'unknown'} (SWR-3204)"
            )
        return f"{self.req_id} is {self.state.label}, not Done"


@traces(SWR.SWR_3510, SWR.SWR_3204)
def readiness_of(
    requirement: CanonicalRequirement,
    *,
    state: DeliveryState,
    satisfied: SatisfiedLog | None = None,
) -> RequirementReadiness:
    """Readiness for a requirement read from its source and Rotaris' delivery log.

    The two halves come from the two places SWR-3202 keeps apart — the
    specification hash from the source, the delivered hash from Rotaris' own
    store — and are joined here rather than persisted together.
    """
    return RequirementReadiness(
        req_id=requirement.req_id,
        state=state,
        current_hash=requirement.current_hash,
        satisfied_hash=satisfied.satisfied_hash if satisfied is not None else None,
    )


@traces(SWR.SWR_3510)
class DependencyCycle(BaseModel):
    """A closed loop of ``depends-on`` edges, with every member named.

    ``members`` is the whole strongly connected component, ordered by a walk that
    starts at the lowest id, so the same graph always yields the same cycle and
    two reports can be compared.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    members: tuple[str, ...]

    @model_validator(mode="after")
    def _closed(self) -> Self:
        if not self.members:
            raise ValueError("a dependency cycle has at least one member")
        if len(set(self.members)) != len(self.members):
            raise ValueError(f"a cycle names each member once; got {list(self.members)}")
        return self

    def contains(self, req_id: str) -> bool:
        """Whether *req_id* is caught in this cycle."""
        return req_id.strip() in self.members

    @property
    def message(self) -> str:
        """``SWR-1 → SWR-2 → SWR-1`` — the loop as a user has to break it."""
        return " → ".join((*self.members, self.members[0]))


@traces(SWR.SWR_3510)
class DependencyBlocker(BaseModel):
    """One reason a requirement may not be scheduled, naming what it waits for."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The dependency that holds it. For a cycle, the next member of the loop.
    blocking_id: str
    kind: DependencyBlockKind
    detail: str
    #: Every member of the loop, for :attr:`DependencyBlockKind.CYCLE`.
    cycle: tuple[str, ...] = ()

    @field_validator("detail")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a dependency blocker states why it blocks (SWR-3510)")
        return cleaned

    @model_validator(mode="after")
    def _cycle_is_named(self) -> Self:
        if (self.kind is DependencyBlockKind.CYCLE) != bool(self.cycle):
            raise ValueError(
                "a cycle blocker names the whole cycle, and nothing else carries one (SWR-3510)",
            )
        return self

    @property
    def board_text(self) -> str:
        """``Blocked by SWR-501`` — what SWR-3510 requires a card to say."""
        return f"Blocked by {self.blocking_id}"

    @property
    def message(self) -> str:
        """The board text plus the reason behind it."""
        return f"{self.board_text}: {self.detail}"


@traces(SWR.SWR_3510)
class DependencyVerdict(BaseModel):
    """Whether one requirement may be scheduled, and what holds it if not."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    blockers: tuple[DependencyBlocker, ...] = ()
    #: The requirement's *own* delivery state. Carried so a report answers both
    #: halves of "may this start" — what holds it, and what state it is in —
    #: without a second read against the store (SWR-3623). A verdict built
    #: without one reads ``Backlog``, which is the state that releases.
    state: DeliveryState = DeliveryState.BACKLOG

    @model_validator(mode="after")
    def _about_one_requirement(self) -> Self:
        wrong = sorted({b.req_id for b in self.blockers if b.req_id != self.req_id})
        if wrong:
            raise ValueError(f"{self.req_id}'s verdict carries blockers of {wrong}")
        return self

    @property
    def schedulable(self) -> bool:
        """Whether the dependency gate lets this requirement start."""
        return not self.blockers

    @property
    def blocked(self) -> bool:
        """The complement of :attr:`schedulable`, for readable call sites."""
        return bool(self.blockers)

    @property
    def blocked_by(self) -> tuple[str, ...]:
        """The ids this requirement waits for, in blocker order."""
        return tuple(blocker.blocking_id for blocker in self.blockers)

    @property
    def in_cycle(self) -> bool:
        """Whether a dependency cycle is among the reasons."""
        return any(blocker.kind is DependencyBlockKind.CYCLE for blocker in self.blockers)

    @property
    def board_text(self) -> str:
        """``Blocked by SWR-501, SWR-502`` — or ``""`` when nothing blocks."""
        if not self.blockers:
            return ""
        return f"Blocked by {', '.join(self.blocked_by)}"

    @property
    def message(self) -> str:
        """One line for the detail view."""
        if self.schedulable:
            return f"{self.req_id}: every dependency is Done and current"
        return f"{self.req_id}: " + "; ".join(blocker.message for blocker in self.blockers)


@traces(SWR.SWR_3510)
class DependencyReport(BaseModel):
    """The dependency gate's answer for a whole requirement set."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    verdicts: tuple[DependencyVerdict, ...] = ()
    cycles: tuple[DependencyCycle, ...] = ()

    @model_validator(mode="after")
    def _one_verdict_each(self) -> Self:
        seen: set[str] = set()
        for verdict in self.verdicts:
            if verdict.req_id in seen:
                raise ValueError(f"{verdict.req_id} has two dependency verdicts")
            seen.add(verdict.req_id)
        object.__setattr__(
            self,
            "verdicts",
            tuple(sorted(self.verdicts, key=lambda v: requirement_sort_key(v.req_id))),
        )
        return self

    def by_id(self) -> dict[str, DependencyVerdict]:
        """The report indexed by requirement id."""
        return {verdict.req_id: verdict for verdict in self.verdicts}

    def verdict_for(self, req_id: str) -> DependencyVerdict:
        """The verdict for *req_id*.

        A requirement the report never saw has no dependencies to be held by, so
        the answer is an unblocked verdict rather than ``None``: the gate's job is
        to *block*, and a gate that answers "unknown" would have to be
        interpreted at every call site.
        """
        cleaned = req_id.strip()
        return self.by_id().get(cleaned, DependencyVerdict(req_id=cleaned))

    @property
    def schedulable_ids(self) -> tuple[str, ...]:
        """Requirements the gate lets through, in natural id order."""
        return tuple(v.req_id for v in self.verdicts if v.schedulable)

    @property
    def blocked_ids(self) -> tuple[str, ...]:
        """Requirements the gate holds, in natural id order."""
        return tuple(v.req_id for v in self.verdicts if v.blocked)

    @property
    def blockers(self) -> tuple[DependencyBlocker, ...]:
        """Every blocker in the report."""
        return tuple(blocker for verdict in self.verdicts for blocker in verdict.blockers)

    def cycle_for(self, req_id: str) -> DependencyCycle | None:
        """The cycle *req_id* is caught in, or ``None``."""
        return next((cycle for cycle in self.cycles if cycle.contains(req_id)), None)


@traces(SWR.SWR_3510)
def dependency_edges(graph: RelationGraph) -> dict[str, tuple[str, ...]]:
    """The ``depends-on`` edges of a relation graph, by requirement. Pure.

    Authored edges only — the reverse ``blocks`` direction is computed (SWR-3110)
    and reading it here would answer a different question.
    """
    edges: dict[str, list[str]] = {}
    for edge in graph.edges:
        if edge.kind is RelationKind.DEPENDS_ON:
            edges.setdefault(edge.source, []).append(edge.target)
    return {
        req_id: tuple(sorted(set(targets), key=requirement_sort_key))
        for req_id, targets in sorted(edges.items(), key=lambda item: requirement_sort_key(item[0]))
    }


def _ordered_cycle(members: set[str], dependencies: Mapping[str, Sequence[str]]) -> tuple[str, ...]:
    """A deterministic walk through one strongly connected component.

    Starts at the lowest id and follows the lowest unvisited edge that stays
    inside the component, so a simple loop comes out in its real direction.
    Anything the walk cannot reach is appended in id order, so the tuple is
    always the *whole* component — every member of a cycle is blocked, and a walk
    that lost one would leave a requirement silently schedulable.
    """
    walk: list[str] = []
    remaining = set(members)
    current: str | None = min(remaining, key=requirement_sort_key)
    while current is not None:
        walk.append(current)
        remaining.discard(current)
        successors = sorted(
            (target for target in dependencies.get(current, ()) if target in remaining),
            key=requirement_sort_key,
        )
        current = successors[0] if successors else None
    walk.extend(sorted(remaining, key=requirement_sort_key))
    return tuple(walk)


@traces(SWR.SWR_3510)
def find_cycles(dependencies: Mapping[str, Sequence[str]]) -> tuple[DependencyCycle, ...]:
    """Every dependency cycle, found with an iterative Tarjan pass. Pure.

    Iterative rather than recursive on purpose: a requirement store is
    user-supplied data, and a deep dependency chain must not be able to end a
    board refresh with a ``RecursionError``.

    A requirement depending on itself is a cycle of one — a real thing a source
    can express, and one that would otherwise block forever with no explanation.
    """
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    counter = 0
    components: list[set[str]] = []
    nodes = sorted(
        {*dependencies, *(target for targets in dependencies.values() for target in targets)},
        key=requirement_sort_key,
    )

    for root in nodes:
        if root in index:
            continue
        work: list[tuple[str, int]] = [(root, 0)]
        while work:
            node, position = work[-1]
            if position == 0:
                index[node] = low[node] = counter
                counter += 1
                stack.append(node)
                on_stack.add(node)
            successors = tuple(dependencies.get(node, ()))
            if position < len(successors):
                work[-1] = (node, position + 1)
                target = successors[position]
                if target not in index:
                    work.append((target, 0))
                elif target in on_stack:
                    low[node] = min(low[node], index[target])
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                component: set[str] = set()
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.add(member)
                    if member == node:
                        break
                self_loop = node in dependencies.get(node, ())
                if len(component) > 1 or self_loop:
                    components.append(component)

    return tuple(
        sorted(
            (
                DependencyCycle(members=_ordered_cycle(component, dependencies))
                for component in components
            ),
            key=lambda cycle: requirement_sort_key(cycle.members[0]),
        ),
    )


@traces(SWR.SWR_3510)
def evaluate_dependencies(
    dependencies: Mapping[str, Sequence[str]],
    readiness: Mapping[str, RequirementReadiness],
) -> DependencyReport:
    """Decide, for every requirement, whether its dependencies release it. Pure.

    *dependencies* is the ``depends-on`` graph (see :func:`dependency_edges`);
    *readiness* is what is known about each requirement's delivery. A dependency
    absent from *readiness* is **unknown**, which blocks — the whole gate exists
    to stop work starting on a foundation nobody can point at.

    Cycles are evaluated first and replace the ordinary check for the edges
    *inside* the loop, so a member reads ``a dependency cycle`` instead of the
    downstream symptom "SWR-2 is Backlog", which is true but useless.
    """
    cycles = find_cycles(dependencies)
    cycle_of: dict[str, DependencyCycle] = {
        member: cycle for cycle in cycles for member in cycle.members
    }

    req_ids = sorted({*dependencies, *readiness}, key=requirement_sort_key)
    verdicts: list[DependencyVerdict] = []
    for req_id in req_ids:
        blockers: list[DependencyBlocker] = []
        cycle = cycle_of.get(req_id)
        targets = tuple(dependencies.get(req_id, ()))
        if cycle is not None:
            inside = tuple(target for target in targets if cycle.contains(target))
            blockers.append(
                DependencyBlocker(
                    req_id=req_id,
                    blocking_id=inside[0] if inside else req_id,
                    kind=DependencyBlockKind.CYCLE,
                    detail=(
                        f"{req_id} is part of a dependency cycle ({cycle.message});"
                        " nothing in the cycle can be scheduled until it is broken"
                    ),
                    cycle=cycle.members,
                ),
            )
        for target in targets:
            if cycle is not None and cycle.contains(target):
                continue
            known = readiness.get(target)
            if known is None:
                blockers.append(
                    DependencyBlocker(
                        req_id=req_id,
                        blocking_id=target,
                        kind=DependencyBlockKind.UNKNOWN,
                        detail=(
                            f"nothing is known about {target}; a dependency that cannot"
                            " be shown to be Done is treated as unmet (SWR-3510)"
                        ),
                    ),
                )
                continue
            kind = known.block_kind
            if kind is not None:
                blockers.append(
                    DependencyBlocker(
                        req_id=req_id,
                        blocking_id=target,
                        kind=kind,
                        detail=known.detail,
                    ),
                )
        known_self = readiness.get(req_id)
        verdicts.append(
            DependencyVerdict(
                req_id=req_id,
                blockers=tuple(blockers),
                state=known_self.state if known_self is not None else DeliveryState.BACKLOG,
            ),
        )

    return DependencyReport(verdicts=tuple(verdicts), cycles=cycles)


@traces(SWR.SWR_3510)
class DependencyRelease(BaseModel):
    """What completing a dependency freed, and whether it starts by itself.

    SWR-3510's third acceptance criterion is "completing a dependency releases
    its dependents *without user action*". The release is unconditional; the
    *start* is what a workspace configures, and the two are separate fields here
    so a board can show "3 requirements are now ready" even where automatic
    starting is off.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Dependencies that stopped blocking anything between the two evaluations.
    completed: tuple[str, ...] = ()
    #: Dependants that are schedulable now and were not before.
    released: tuple[str, ...] = ()
    automatic: bool = False

    @property
    def starts_now(self) -> tuple[str, ...]:
        """The released ids a configured-automatic workspace starts immediately."""
        return self.released if self.automatic else ()

    @property
    def message(self) -> str:
        """One line for the run report."""
        if not self.released:
            return "no requirement was released"
        how = "started automatically" if self.automatic else "waiting to be released"
        return f"{', '.join(self.released)} became schedulable ({how})"


@traces(SWR.SWR_3510)
def release_after(
    previous: DependencyReport,
    current: DependencyReport,
    *,
    automatic: bool = False,
) -> DependencyRelease:
    """What the move from *previous* to *current* freed. Pure.

    Computed from the two reports rather than from an event, which is what makes
    the release happen "without user action": any evaluation that observes a
    dependency having completed produces the same answer, whether it was
    triggered by the completion, by a refresh or by the next poll.
    """
    released = tuple(
        req_id for req_id in current.schedulable_ids if previous.verdict_for(req_id).blocked
    )
    freed = {
        blocker.blocking_id
        for req_id in released
        for blocker in previous.verdict_for(req_id).blockers
    }
    still_blocking = {blocker.blocking_id for blocker in current.blockers}
    return DependencyRelease(
        completed=tuple(sorted(freed - still_blocking, key=requirement_sort_key)),
        released=released,
        automatic=automatic,
    )


@traces(SWR.SWR_3510)
def gate(
    requirements: Iterable[CanonicalRequirement],
    readiness: Mapping[str, RequirementReadiness],
) -> DependencyReport:
    """The gate over a requirement set read from its sources. Pure.

    The convenience form of :func:`evaluate_dependencies`: it reads the
    ``depends-on`` edges off the requirements themselves, so a caller holding a
    read does not have to build a relation graph first.
    """
    dependencies = {
        requirement.req_id: requirement.related_ids(RelationKind.DEPENDS_ON)
        for requirement in requirements
    }
    return evaluate_dependencies(dependencies, readiness)


# ── the order the chain has to land in (SWR-3623) ──────────────────────────


#: Why each state a *root* blocker might be in cannot be released, in the
#: engine's own vocabulary. Consulted only after
#: :func:`~rotaris_core.requirements.delivery.transitions.is_legal` has already
#: said no, so this is the sentence for a refusal and never the decision.
_ROOT_REFUSALS: dict[DeliveryState, str] = {
    DeliveryState.READY: "{req_id} is already Ready; its run is waiting on the queue.",
    DeliveryState.RUNNING: "{req_id} is already Running; the work on it has started.",
    DeliveryState.REVIEW: "{req_id} is already in Review; its result is waiting to be accepted.",
    DeliveryState.BLOCKED: (
        "{req_id} is Blocked. A blocked requirement returns to the state it was blocked in"
        " and is not released from here (SWR-3201)."
    ),
    DeliveryState.DONE: (
        "{req_id} is Done, but the specification moved since it was delivered. Rotaris moves it"
        " to Needs Update on the next evaluation, and it is released from there (SWR-3502)."
    ),
}


@traces(SWR.SWR_3623)
class ReleasePlan(BaseModel):
    """What has to be delivered before one requirement can be, and in what order.

    The value behind "handle the blockers first": a requirement nobody may
    release yet is not a dead end, it is the *bottom* of a chain, and the useful
    answer is which requirement to work on instead. This walks the unsatisfied
    ``depends-on`` ancestors of one requirement and puts them in the order they
    have to land — roots first, so :attr:`root` is a requirement with nothing of
    its own left to wait for.

    Deterministic: the walk breaks every tie with
    :func:`~rotaris_core.requirements.model.requirement_sort_key`, so the same
    board always proposes the same root and a user is never sent to a different
    requirement by two reads of one project.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: Every unsatisfied ancestor, roots first. Excludes :attr:`req_id` itself.
    order: tuple[str, ...] = ()
    #: What holds :attr:`req_id` *directly*, carried verbatim from its verdict so
    #: a surface prints the gate's own sentence rather than a paraphrase.
    blockers: tuple[DependencyBlocker, ...] = ()
    #: A loop somewhere in the chain. Carried even when :attr:`root` is outside
    #: it: a user releasing the root still needs to know the chain does not end.
    cycle: DependencyCycle | None = None
    #: Ancestors the requirement set does not contain — a dangling ``depends-on``
    #: (SWR-3109). Named rather than dropped; nothing can release them.
    unknown: tuple[str, ...] = ()
    #: Why :attr:`root` may not be released, or ``""`` when it may.
    root_reason: str = ""
    #: What state :attr:`root` is in, so a caller moves it from the right column.
    root_state: DeliveryState | None = None

    @property
    def blocked(self) -> bool:
        """Whether anything holds this requirement at all."""
        return bool(self.blockers)

    @property
    def root(self) -> str:
        """The requirement to start with — ``""`` when nothing holds this one."""
        return self.order[0] if self.order else ""

    @property
    def resolvable(self) -> bool:
        """Whether :attr:`root` is a requirement this board may actually release."""
        return bool(self.order) and not self.root_reason

    @property
    def chain(self) -> tuple[str, ...]:
        """The order with this requirement last — ``SWR-1 → SWR-2 → SWR-3``.

        Read as *waits for*, left to right: the first entry is the one with
        nothing left to wait for, the last is the requirement that was asked
        about.
        """
        return (*self.order, self.req_id)

    @property
    def message(self) -> str:
        """One line for a log or a refusal."""
        if not self.blocked:
            return f"{self.req_id}: every dependency is Done and current"
        waiting = ", ".join(blocker.blocking_id for blocker in self.blockers)
        if self.resolvable:
            return f"{self.req_id} waits for {waiting}; start with {self.root}"
        because = self.root_reason or "there is no root to start with"
        return f"{self.req_id} waits for {waiting}; {because}"


@traces(SWR.SWR_3623, SWR.SWR_3510)
def plan_release(req_id: str, report: DependencyReport) -> ReleasePlan:
    """The chain above *req_id*, in the order it has to land. Pure.

    Reads the gate's own answer rather than the relation graph: every edge here
    is one :func:`evaluate_dependencies` already judged *unsatisfied*, so an
    ancestor that is Done and current is simply absent and the chain a user is
    shown is the work that is actually left.

    Iterative, with a visited set, for the reason :func:`find_cycles` is: a
    dependency graph is user-supplied data, and neither a deep chain nor a loop
    may end a board pass with a ``RecursionError`` or a hang. The order is
    produced by Kahn's algorithm over the reached subgraph, taking the lowest id
    among the candidates at each step; anything a cycle leaves unemitted is
    appended in id order, so the plan is always the *whole* chain.
    """
    wanted = req_id.strip()
    blockers = report.verdict_for(wanted).blockers
    if not blockers:
        return ReleasePlan(req_id=wanted)

    reached: set[str] = set()
    unknown: set[str] = set()
    pending = [wanted]
    while pending:
        current = pending.pop()
        for blocker in report.verdict_for(current).blockers:
            target = blocker.blocking_id
            if blocker.kind is DependencyBlockKind.UNKNOWN:
                unknown.add(target)
            if target == wanted or target in reached:
                continue
            reached.add(target)
            pending.append(target)

    dependencies = {
        member: tuple(
            target
            for target in report.verdict_for(member).blocked_by
            if target in reached and target != member
        )
        for member in reached
    }
    order = _kahn(reached, dependencies)
    cycle = next(
        (found for member in order if (found := report.cycle_for(member)) is not None),
        None,
    )

    root = order[0] if order else ""
    root_state = report.verdict_for(root).state if root and root not in unknown else None
    reason = _root_refusal(root, root_state, cycle=cycle, unknown=unknown)

    return ReleasePlan(
        req_id=wanted,
        order=order,
        blockers=blockers,
        cycle=cycle,
        unknown=tuple(sorted(unknown, key=requirement_sort_key)),
        root_reason=reason,
        root_state=root_state,
    )


def _root_refusal(
    root: str,
    root_state: DeliveryState | None,
    *,
    cycle: DependencyCycle | None,
    unknown: Collection[str],
) -> str:
    """Why *root* may not be released, or ``""``.

    The matrix decides and this only words the answer: a state
    :func:`~rotaris_core.requirements.delivery.transitions.is_legal` accepts is
    never refused here, so the sentence and the behaviour cannot drift apart.
    """
    from rotaris_core.requirements.delivery.state import ActorKind
    from rotaris_core.requirements.delivery.transitions import is_legal

    if not root:
        return ""
    if root in unknown:
        return (
            f"Nothing is known about {root}: this project's requirements do not contain it,"
            " so Rotaris has nothing to release (SWR-3109)."
        )
    if cycle is not None and cycle.contains(root):
        return (
            f"{cycle.message}. Nothing in the loop can be released until it is broken"
            " in the source (SWR-3510)."
        )
    if root_state is None or is_legal(root_state, DeliveryState.READY, ActorKind.USER):
        return ""
    template = _ROOT_REFUSALS.get(
        root_state,
        f"{{req_id}} is {root_state.label}, and this board does not release it from there.",
    )
    return template.format(req_id=root)


def _kahn(members: set[str], dependencies: Mapping[str, Sequence[str]]) -> tuple[str, ...]:
    """*members* ordered so nothing precedes what it waits for. Deterministic.

    The lowest id among the ready candidates goes first, which is what makes two
    reads of one project propose the same root. A cycle leaves candidates empty
    with members remaining; those are appended in id order rather than dropped,
    because a plan that lost a member would tell a user the chain is shorter
    than it is.
    """
    emitted: list[str] = []
    done: set[str] = set()
    remaining = set(members)
    while remaining:
        candidates = sorted(
            (
                member
                for member in remaining
                if all(target in done for target in dependencies.get(member, ()))
            ),
            key=requirement_sort_key,
        )
        if not candidates:
            emitted.extend(sorted(remaining, key=requirement_sort_key))
            break
        chosen = candidates[0]
        emitted.append(chosen)
        done.add(chosen)
        remaining.discard(chosen)
    return tuple(emitted)
