"""The context one execution unit's agent is handed (SWR-3407).

An agent told to "implement SWR-4102" and nothing else re-discovers the existing
implementation, misses the covering tests, ignores the relations that constrain
it and invents acceptance conditions nobody will judge it against. All four
facts are already computed — by the board projection (SWR-3216), by the run
snapshot (SWR-3402) and by the completion contract (SWR-3408) — so the context is
an *assembly*, never a fresh look at the repository:

```text
BoardEntry (SWR-3216) ─┐
RunSnapshot (SWR-3402) ─┼─▶ build_agent_context() ─▶ AgentContext ─▶ .render() ─▶ prompt
ExecutionUnit           │                                 │
RunWorkspace            ┘                                 └── .absent: every element that is not there,
                                                              with the sentence saying why
```

Four properties are load-bearing, and each is checked:

- **Nothing is silently omitted.** :data:`CONTEXT_ELEMENTS` is the closed list
  SWR-3407 enumerates, and :class:`AgentContext` refuses to exist unless every
  one of them is either present or named in :attr:`AgentContext.absent` with a
  stated reason. "No covering tests" and "covering tests were not looked up" are
  different facts, and an agent that cannot tell them apart writes the wrong
  test.
- **Assembled, not scanned.** The only inputs are a projection entry, a snapshot,
  a unit and a workspace. This module imports nothing that reads a file, walks a
  repository or runs a process, so "assembled from the projection and the
  snapshot" is a property of the import graph rather than a convention.
- **Deterministic.** Two assemblies over the same inputs render byte-identical
  text; :attr:`AgentContext.digest` is over that text, so a test asserts equality
  in one comparison and a caller can cache on it.
- **The conditions are the ones that will judge it.**
  :func:`acceptance_conditions` is derived from
  :data:`~rotaris_core.requirements.execution.contract.COMPLETION_CONDITIONS`
  itself, so the list handed to the agent cannot drift from the list SWR-3408
  evaluates — adding an obligation there changes what the agent is told, in the
  same edit.

The changed-requirement and superseding cases are the same context plus one
element each (:class:`ChangedSpecification`, :class:`SupersedingContext`), rather
than two other context types: an agent implementing a changed requirement needs
everything a first implementation needs *and* the diff.
"""

from __future__ import annotations

import hashlib
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import (
    RelationsView,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.execution.contract import COMPLETION_CONDITIONS
from rotaris_core.requirements.execution.run_seam import (
    RunWorkspace,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.execution.snapshot import (
    RunSnapshot,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.requirement_evidence import (
    CoveringTest,  # noqa: TC001 - Pydantic resolves this at runtime.
    RequirementSite,  # noqa: TC001 - Pydantic resolves this at runtime.
)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.requirements.delivery.projection import BoardEntry
    from rotaris_core.requirements.execution.snapshot import SpecificationDrift
    from rotaris_core.requirements.execution.units import ExecutionUnit

__all__ = [
    "CONTEXT_ELEMENTS",
    "AbsentElement",
    "AcceptanceCondition",
    "AgentContext",
    "ChangedSpecification",
    "ContextElement",
    "ContextError",
    "SupersededRequirement",
    "SupersedingContext",
    "acceptance_conditions",
    "build_agent_context",
    "site_address",
]


class ContextError(RuntimeError):
    """A unit's agent context could not be assembled coherently."""


@traces(SWR.SWR_3407)
class ContextElement(StrEnum):
    """The elements SWR-3407 says a unit's context carries.

    A closed set, in the order the requirement lists them, because the acceptance
    criterion is about *completeness*: a context is checked against this list, and
    an element nobody thought about is an absence with no reason, which
    :class:`AgentContext` refuses.
    """

    SNAPSHOT = "requirement-snapshot"
    RELATIONS = "relations"
    IMPLEMENTATION_TRACES = "implementation-traces"
    COVERING_TESTS = "covering-tests"
    REQTOCODE_FINDINGS = "reqtocode-findings"
    ARCHITECTURE = "architecture-context"
    UNIT_SCOPE = "unit-scope"
    BASE_REVISION = "base-revision"
    WORKTREE = "worktree"
    ACCEPTANCE_CONDITIONS = "acceptance-conditions"
    #: Only for a requirement that changed after it was delivered (SWR-3501).
    SPECIFICATION_CHANGE = "specification-change"
    #: Only for a requirement that supersedes others (SWR-3507).
    SUPERSEDING = "superseding"

    @property
    def label(self) -> str:
        """``Covering Tests`` — the heading the rendered context uses."""
        return " ".join(part.capitalize() for part in self.value.split("-"))


#: Every element a context is checked against. Conditional ones are in the list
#: too: "this requirement supersedes nothing" is an answer the agent needs, and
#: leaving the element out entirely is the silence SWR-3407 forbids.
CONTEXT_ELEMENTS: tuple[ContextElement, ...] = tuple(ContextElement)


@traces(SWR.SWR_3407)
def site_address(path: str, line: int) -> str:
    """``src/module.py:41`` — how a trace or a test is named to an agent."""
    return f"{path}:{line}" if line > 0 else path


@traces(SWR.SWR_3407)
class AbsentElement(BaseModel):
    """One context element that is not there, and the sentence saying why."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    element: ContextElement
    reason: str

    @field_validator("reason")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ContextError(
                "an absent context element states why it is absent; silence is what"
                " SWR-3407 forbids",
            )
        return cleaned

    @property
    def message(self) -> str:
        """``covering-tests: none are declared for this requirement``."""
        return f"{self.element}: {self.reason}"


@traces(SWR.SWR_3407, SWR.SWR_3408)
class AcceptanceCondition(BaseModel):
    """One condition the finished unit will actually be judged against."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    detail: str = ""

    @property
    def message(self) -> str:
        """``tests-executed: the covering tests were not executed in this run``."""
        return f"{self.name}: {self.detail}" if self.detail else self.name


@traces(SWR.SWR_3407, SWR.SWR_3408)
def acceptance_conditions() -> tuple[AcceptanceCondition, ...]:
    """The conditions SWR-3408 will evaluate, in the order it evaluates them.

    Derived from :data:`~rotaris_core.requirements.execution.contract.COMPLETION_CONDITIONS`
    rather than restated, which is what makes SWR-3407's fourth acceptance
    criterion structural: an obligation added to the contract reaches the agent's
    prompt in the same edit, and a prompt promising conditions nobody checks
    cannot be written.
    """
    return tuple(
        AcceptanceCondition(name=condition.name, detail=condition.detail)
        for condition in COMPLETION_CONDITIONS
    )


@traces(SWR.SWR_3407, SWR.SWR_3403)
class ChangedSpecification(BaseModel):
    """What moved, for a requirement that changed after it was delivered.

    Both texts *and* the diff: an agent asked to update an implementation needs
    to know what the old one satisfied, and reconstructing that from the diff is
    exactly the kind of work the context exists to save.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The version that was implemented (SWR-3204's satisfied version).
    old_version: str = ""
    #: The version this run is aimed at.
    new_version: str = ""
    #: Unified diff between them. Empty when the old text is no longer available
    #: — Rotaris never stores requirement prose (SWR-3114).
    diff: str = ""
    old_hash: str = ""
    new_hash: str = ""
    #: The implementation sites the change puts in question.
    affected_traces: tuple[str, ...] = ()
    #: The covering tests the change puts in question.
    affected_tests: tuple[str, ...] = ()

    @classmethod
    @traces(SWR.SWR_3407, SWR.SWR_3403)
    def of(
        cls,
        drift: SpecificationDrift,
        *,
        old_version: str = "",
        new_version: str = "",
        affected_traces: Sequence[str] = (),
        affected_tests: Sequence[str] = (),
    ) -> Self:
        """The changed-specification element built from a detected drift."""
        return cls(
            old_version=old_version,
            new_version=new_version,
            diff=drift.diff,
            old_hash=drift.snapshot_hash,
            new_hash=drift.current_hash,
            affected_traces=tuple(affected_traces),
            affected_tests=tuple(affected_tests),
        )

    @property
    def summary(self) -> str:
        """One line: the two versions, and how much they put in question."""
        return (
            f"{self.old_hash or '?'} → {self.new_hash or '?'};"
            f" {len(self.affected_traces)} trace(s) and"
            f" {len(self.affected_tests)} test(s) affected"
        )


@traces(SWR.SWR_3407, SWR.SWR_3507)
class SupersededRequirement(BaseModel):
    """One requirement this one replaces, and where its implementation lives."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    title: str = ""
    #: Existing implementation sites, as ``path:line`` addresses.
    traces: tuple[str, ...] = ()
    #: Existing covering tests, as ``path:line`` addresses.
    tests: tuple[str, ...] = ()


@traces(SWR.SWR_3407, SWR.SWR_3507)
class SupersedingContext(BaseModel):
    """What a superseding requirement's agent inherits, and what it owes.

    The obligations are carried explicitly rather than implied by the relation:
    SWR-3507 is about a migration somebody has to perform, and an agent that only
    sees "supersedes SWR-1200" will implement the new behaviour and leave the old
    one running beside it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    superseded: tuple[SupersededRequirement, ...] = ()
    migration_obligations: tuple[str, ...] = ()

    @property
    def req_ids(self) -> tuple[str, ...]:
        """The ids this requirement replaces, in the order they were given."""
        return tuple(entry.req_id for entry in self.superseded)


@traces(SWR.SWR_3407)
class AgentContext(BaseModel):
    """Everything one unit's agent is given — and every gap, named.

    Immutable and serialisable, so it can cross a thread or a process on its way
    to a run host, and so a test can compare two assemblies with ``==``.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    #: The specification version this run is judged against, for its whole life
    #: (SWR-3402). The agent never re-reads the requirement.
    snapshot: RunSnapshot
    relations: RelationsView | None = None
    implementations: tuple[RequirementSite, ...] = ()
    covering_tests: tuple[CoveringTest, ...] = ()
    #: One line per obligation the evidence projection reports (SWR-3207).
    findings: tuple[str, ...] = ()
    #: The architecture documents and boundaries that constrain this work.
    architecture: tuple[str, ...] = ()
    #: What this unit is responsible for, from the decomposition (SWR-3404).
    scope: str = ""
    workspace: RunWorkspace | None = None
    acceptance: tuple[AcceptanceCondition, ...] = ()
    change: ChangedSpecification | None = None
    superseding: SupersedingContext | None = None
    #: Every element that is not present, with the reason it is not (SWR-3407).
    absent: tuple[AbsentElement, ...] = ()

    @model_validator(mode="after")
    def _every_element_accounted_for(self) -> Self:
        stated = {entry.element for entry in self.absent}
        if len(stated) != len(self.absent):
            raise ContextError(f"{self.req_id}: a context element is declared absent twice")
        present = {element for element in CONTEXT_ELEMENTS if self._holds(element)}
        both = sorted(str(element) for element in present & stated)
        if both:
            raise ContextError(
                f"{self.req_id}: {both} are declared absent while carrying content",
            )
        missing = sorted(
            str(element) for element in CONTEXT_ELEMENTS if element not in present | stated
        )
        if missing:
            raise ContextError(
                f"{self.req_id}: context elements {missing} are neither present nor stated"
                " as absent; none may be silently omitted (SWR-3407)",
            )
        return self

    def _holds(self, element: ContextElement) -> bool:
        match element:
            case ContextElement.SNAPSHOT:
                return True
            case ContextElement.RELATIONS:
                return self.relations is not None
            case ContextElement.IMPLEMENTATION_TRACES:
                return bool(self.implementations)
            case ContextElement.COVERING_TESTS:
                return bool(self.covering_tests)
            case ContextElement.REQTOCODE_FINDINGS:
                return bool(self.findings)
            case ContextElement.ARCHITECTURE:
                return bool(self.architecture)
            case ContextElement.UNIT_SCOPE:
                return bool(self.scope.strip())
            case ContextElement.BASE_REVISION:
                return bool(self.snapshot.base_commit.strip())
            case ContextElement.WORKTREE:
                return self.workspace is not None
            case ContextElement.ACCEPTANCE_CONDITIONS:
                return bool(self.acceptance)
            case ContextElement.SPECIFICATION_CHANGE:
                return self.change is not None
            case ContextElement.SUPERSEDING:
                return self.superseding is not None

    # -- reading -------------------------------------------------------------

    def present(self, element: ContextElement) -> bool:
        """Whether *element* carries content in this context."""
        return self._holds(element)

    def reason_for(self, element: ContextElement) -> str:
        """Why *element* is absent, or ``""`` when it is present."""
        return next(
            (entry.reason for entry in self.absent if entry.element is element),
            "",
        )

    @property
    def absences(self) -> tuple[str, ...]:
        """Every gap as one line, in element order — what a reviewer skims."""
        by_element = {entry.element: entry for entry in self.absent}
        return tuple(
            by_element[element].message for element in CONTEXT_ELEMENTS if element in by_element
        )

    @property
    def trace_addresses(self) -> tuple[str, ...]:
        """Existing implementation sites, as an agent can open them."""
        return tuple(site_address(site.path, site.line) for site in self.implementations)

    @property
    def test_addresses(self) -> tuple[str, ...]:
        """Existing covering tests, as an agent can open them."""
        return tuple(site_address(test.path, test.line) for test in self.covering_tests)

    @property
    def acceptance_names(self) -> tuple[str, ...]:
        """The names of the conditions this unit will be judged against."""
        return tuple(condition.name for condition in self.acceptance)

    @traces(SWR.SWR_3407)
    def render(self) -> str:
        """The context as the text a run host hands to its agent.

        Deterministic for a given context: every section is emitted in
        :data:`CONTEXT_ELEMENTS` order, absent ones say so in the same place a
        present one would have been, and nothing is sorted by anything the caller
        did not already order.
        """
        lines: list[str] = [
            f"# {self.req_id} — {self.snapshot.title or self.req_id}",
            "",
            f"Unit: {self.unit_id}",
            f"Run: {self.snapshot.run_id}",
            f"Requirement version: {self.snapshot.requirement_hash}",
            "",
        ]
        for element in CONTEXT_ELEMENTS:
            lines.append(f"## {element.label}")
            reason = self.reason_for(element)
            lines.extend(self._section(element) if not reason else [f"(absent) {reason}"])
            lines.append("")
        return "\n".join(lines).rstrip() + "\n"

    def _section(self, element: ContextElement) -> list[str]:
        match element:
            case ContextElement.SNAPSHOT:
                return [
                    self.snapshot.specification or "(no text captured)",
                    "",
                    f"source: {self.snapshot.source_path or 'unknown'}"
                    f" @ {self.snapshot.source_revision or 'unknown'}",
                ]
            case ContextElement.RELATIONS:
                relations = self.relations
                if relations is None:  # pragma: no cover - guarded by the validator
                    return []
                return [f"- {kind}: {target}" for kind, target in relations.edges] or [
                    "- (no authored relation)",
                ]
            case ContextElement.IMPLEMENTATION_TRACES:
                return [f"- {address}" for address in self.trace_addresses]
            case ContextElement.COVERING_TESTS:
                return [
                    f"- {site_address(test.path, test.line)}"
                    f" ({'ran' if test.executed else 'did not run'} in the last suite)"
                    for test in self.covering_tests
                ]
            case ContextElement.REQTOCODE_FINDINGS:
                return [f"- {finding}" for finding in self.findings]
            case ContextElement.ARCHITECTURE:
                return [f"- {entry}" for entry in self.architecture]
            case ContextElement.UNIT_SCOPE:
                return [self.scope]
            case ContextElement.BASE_REVISION:
                return [self.snapshot.base_commit]
            case ContextElement.WORKTREE:
                workspace = self.workspace
                if workspace is None:  # pragma: no cover - guarded by the validator
                    return []
                return [f"path: {workspace.path}", f"branch: {workspace.branch}"]
            case ContextElement.ACCEPTANCE_CONDITIONS:
                return [f"- {condition.message}" for condition in self.acceptance]
            case ContextElement.SPECIFICATION_CHANGE:
                change = self.change
                if change is None:  # pragma: no cover - guarded by the validator
                    return []
                return [
                    change.summary,
                    "",
                    "### Previous version",
                    change.old_version or "(not available)",
                    "",
                    "### Current version",
                    change.new_version or "(not available)",
                    "",
                    "### Diff",
                    change.diff or "(not available)",
                    "",
                    "### Affected",
                    *(f"- trace {address}" for address in change.affected_traces),
                    *(f"- test {address}" for address in change.affected_tests),
                ]
            case ContextElement.SUPERSEDING:
                superseding = self.superseding
                if superseding is None:  # pragma: no cover - guarded by the validator
                    return []
                lines: list[str] = []
                for entry in superseding.superseded:
                    lines.append(f"- {entry.req_id} {entry.title}".rstrip())
                    lines.extend(f"  - trace {address}" for address in entry.traces)
                    lines.extend(f"  - test {address}" for address in entry.tests)
                lines.extend(
                    f"- obligation: {obligation}"
                    for obligation in superseding.migration_obligations
                )
                return lines

    @property
    def digest(self) -> str:
        """A stable digest of the rendered context — equal inputs, equal digest."""
        return hashlib.blake2b(self.render().encode("utf-8"), digest_size=8).hexdigest()


def _absent(element: ContextElement, reason: str) -> AbsentElement:
    return AbsentElement(element=element, reason=reason)


@traces(SWR.SWR_3407)
def build_agent_context(
    *,
    entry: BoardEntry,
    snapshot: RunSnapshot,
    unit: ExecutionUnit,
    workspace: RunWorkspace | None = None,
    architecture: Sequence[str] = (),
    change: ChangedSpecification | None = None,
    superseding: SupersedingContext | None = None,
    superseded_evidence: Mapping[str, tuple[tuple[str, ...], tuple[str, ...]]] | None = None,
) -> AgentContext:
    """Assemble the context for one unit run, naming every gap it has.

    *entry* is the board projection's answer for this requirement (SWR-3216) and
    *snapshot* is the version the run works against (SWR-3402); together they are
    the only sources. Nothing here re-reads the requirement, re-runs a sweep or
    touches a repository — an agent context built twice from the same projection
    is the same value, which is what SWR-3407's determinism criterion asks for.

    A *superseding* context is built for the caller when the projection says this
    requirement supersedes others and none was supplied, using
    *superseded_evidence* (``req_id → (traces, tests)``) for what already exists.
    """
    if entry.req_id != snapshot.req_id:
        raise ContextError(
            f"context for {entry.req_id!r} assembled around {snapshot.req_id!r}'s snapshot",
        )
    if unit.req_id != entry.req_id:
        raise ContextError(f"unit {unit.unit_id} belongs to {unit.req_id}, not to {entry.req_id}")

    findings = tuple(obligation.detail for obligation in entry.evidence.obligations)
    resolved_superseding = superseding or _superseding_for(entry, superseded_evidence)
    scope = unit.scope or unit.title

    absent: list[AbsentElement] = []
    if not entry.relations.edges:
        absent.append(
            _absent(
                ContextElement.RELATIONS,
                "this requirement authors no relation and nothing points at it",
            ),
        )
    if not entry.implementations:
        absent.append(
            _absent(
                ContextElement.IMPLEMENTATION_TRACES,
                "no implementation trace exists yet; this unit creates the first one",
            ),
        )
    if not entry.covering_tests:
        absent.append(
            _absent(
                ContextElement.COVERING_TESTS,
                "no test declares it covers this requirement yet",
            ),
        )
    if not findings:
        absent.append(
            _absent(
                ContextElement.REQTOCODE_FINDINGS,
                "the evidence projection reported no obligation for this requirement",
            ),
        )
    if not architecture:
        absent.append(
            _absent(
                ContextElement.ARCHITECTURE,
                "no architecture context was supplied for this unit",
            ),
        )
    if not scope.strip():
        absent.append(
            _absent(
                ContextElement.UNIT_SCOPE,
                "the decomposition stated no scope: this unit carries the whole requirement",
            ),
        )
    if workspace is None:
        absent.append(
            _absent(
                ContextElement.WORKTREE,
                "no worktree has been provisioned for this run yet",
            ),
        )
    if change is None:
        absent.append(
            _absent(
                ContextElement.SPECIFICATION_CHANGE,
                "this requirement did not change since it was last delivered",
            ),
        )
    if resolved_superseding is None:
        absent.append(
            _absent(
                ContextElement.SUPERSEDING,
                "this requirement supersedes nothing",
            ),
        )

    return AgentContext(
        req_id=entry.req_id,
        unit_id=unit.unit_id,
        snapshot=snapshot,
        relations=entry.relations if entry.relations.edges else None,
        implementations=entry.implementations,
        covering_tests=entry.covering_tests,
        findings=findings,
        architecture=tuple(architecture),
        scope=scope,
        workspace=workspace,
        acceptance=acceptance_conditions(),
        change=change,
        superseding=resolved_superseding,
        absent=tuple(absent),
    )


def _superseding_for(
    entry: BoardEntry,
    evidence: Mapping[str, tuple[tuple[str, ...], tuple[str, ...]]] | None,
) -> SupersedingContext | None:
    """The superseding element the projection implies, or ``None``.

    Built from the projection's own ``supersedes`` edges (SWR-3110) rather than
    from a second lookup, so an agent is told about exactly the requirements the
    board says this one replaces.
    """
    replaced = entry.relations.supersedes
    if not replaced:
        return None
    known = evidence or {}
    return SupersedingContext(
        superseded=tuple(
            SupersededRequirement(
                req_id=req_id,
                traces=known.get(req_id, ((), ()))[0],
                tests=known.get(req_id, ((), ()))[1],
            )
            for req_id in replaced
        ),
        migration_obligations=tuple(
            f"remove or migrate {req_id}'s implementation and its covering tests"
            " before this requirement is reported complete (SWR-3507)"
            for req_id in replaced
        ),
    )
