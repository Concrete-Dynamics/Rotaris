"""Aggregate a milestone's members into the numbers a status table shows.

Coverage comes from :mod:`rotaris_core.reqtocode.coverage` — the store's own
public, side-effect-free query — so "traced" and "covered" here mean exactly
what they mean to ``reqtocode check``, rather than being a second scan that can
disagree with it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from milestone_lib.membership import epic_index_for, expand_epic, resolve_members
from rotaris_core.reqtocode.coverage import coverage_map
from rotaris_core.reqtocode.declarations import ReqStatus

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

    from milestone_lib.manifest import Milestone
    from rotaris_core.reqtocode.declarations import ReqMeta


@dataclass(frozen=True)
class MemberProgress:
    """One member requirement, as the board sees it."""

    number: int
    req_id: str
    title: str
    status: ReqStatus
    req_type: str
    source_path: str
    traced: bool
    covered: bool
    trace_required: bool
    test_required: bool

    @property
    def is_done(self) -> bool:
        """Approved is the only state that counts as delivered.

        Trace and test obligations are not re-checked here: ``reqtocode check``
        owns them, and the gate runs it. Duplicating the rule would let the two
        disagree.
        """
        return self.status is ReqStatus.APPROVED


@dataclass(frozen=True)
class GroupProgress:
    """Members sharing one epic index, for a grouped status table."""

    heading: str
    members: tuple[MemberProgress, ...]


@dataclass(frozen=True)
class MilestoneProgress:
    """Everything a milestone's members add up to."""

    milestone: Milestone
    members: tuple[MemberProgress, ...]
    groups: tuple[GroupProgress, ...]

    @property
    def total(self) -> int:
        return len(self.members)

    @property
    def done(self) -> int:
        return sum(1 for member in self.members if member.is_done)

    @property
    def traced(self) -> int:
        return sum(1 for member in self.members if member.traced)

    @property
    def covered(self) -> int:
        return sum(1 for member in self.members if member.covered)

    @property
    def outstanding(self) -> tuple[MemberProgress, ...]:
        """Members not yet approved, in id order — the milestone's remaining work."""
        return tuple(member for member in self.members if not member.is_done)

    @property
    def percent(self) -> int:
        """Completion as a whole number. An empty milestone is 0, never 100."""
        if not self.members:
            return 0
        return round(100 * self.done / self.total)


def _heading(index_path: str, requirements: Mapping[int, ReqMeta]) -> str:
    """``SWR-2900 — Event Store …`` for an epic index, else the bare path."""
    for meta in requirements.values():
        if meta.source_path == index_path and epic_index_for(meta.source_path) == index_path:
            return f"{meta.req_id} — {meta.title}"
    return index_path


def progress_for(
    milestone: Milestone,
    repo_root: Path,
    requirements: Mapping[int, ReqMeta],
    coverage: Mapping[int, object] | None = None,
) -> MilestoneProgress:
    """Aggregate one milestone. Pass *coverage* to reuse one sweep across many."""
    sites = coverage if coverage is not None else coverage_map(repo_root)
    members: list[MemberProgress] = []
    for number in sorted(resolve_members(milestone, requirements)):
        meta = requirements[number]
        entry = sites.get(number)
        members.append(
            MemberProgress(
                number=number,
                req_id=meta.req_id,
                title=meta.title,
                status=meta.status,
                req_type=meta.req_type,
                source_path=meta.source_path,
                traced=bool(getattr(entry, "is_traced", False)),
                covered=bool(getattr(entry, "is_test_covered", False)),
                trace_required=meta.trace_required,
                test_required=meta.test_required,
            )
        )

    grouped: dict[str, list[MemberProgress]] = {}
    for member in members:
        grouped.setdefault(epic_index_for(member.source_path), []).append(member)
    groups = tuple(
        GroupProgress(heading=_heading(index, requirements), members=tuple(entries))
        for index, entries in sorted(grouped.items())
    )
    return MilestoneProgress(milestone=milestone, members=tuple(members), groups=groups)


def epic_members(
    milestone: Milestone, requirements: Mapping[int, ReqMeta]
) -> dict[int, frozenset[int]]:
    """Each declared epic mapped to the members it contributed."""
    return {number: expand_epic(number, requirements) for number in milestone.epics}
