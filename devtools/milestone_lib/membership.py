"""Resolve a milestone's declared epics and ids into a concrete requirement set.

Reads the requirement store through its own public parser
(:func:`rotaris_core.reqtocode.generator.parse_requirements`). That import is the
only direction the dependency ever runs: a dev tool may read the product's
requirement store, the product must never learn that milestones exist.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.declarations import ReqStatus
from rotaris_core.reqtocode.generator import parse_requirements
from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from milestone_lib.manifest import Milestone
    from rotaris_core.reqtocode.declarations import ReqMeta


def load_requirements(repo_root: Path) -> tuple[dict[int, ReqMeta], tuple[str, ...]]:
    """The requirement store as ``{number: ReqMeta}``, plus its parse errors."""
    result = parse_requirements(repo_root)
    return {meta.number: meta for meta in result.requirements}, tuple(result.errors)


def epic_index_for(source_path: str, requirements_dir: str = "") -> str:
    """The epic index document for the requirement file at *source_path*.

    ``<requirements_dir>/<block>-<slug>.md`` is an epic index and
    ``<requirements_dir>/<block>-<slug>/…`` holds its requirements, so the index
    of a nested file is its top-level directory plus ``.md``, and a file sitting
    directly in the requirements directory is its own index (a multi-id spec
    file declares the epic and its requirements together).

    This mirrors ``rotaris_core.requirements.sources.reqtocode.epic_index_for``.
    It is reimplemented rather than imported because that module pulls in
    pydantic, which would cost this tool its no-install CI path;
    ``devtools/tests/test_membership.py`` pins the two together against the real
    store so they cannot drift.
    """
    root = PurePosixPath(requirements_dir or DEFAULT_LAYOUT.requirements_dir.as_posix())
    relative = PurePosixPath(source_path).relative_to(root)
    if len(relative.parts) == 1:
        return source_path
    return (root / f"{relative.parts[0]}.md").as_posix()


def expand_epic(epic_number: int, requirements: Mapping[int, ReqMeta]) -> frozenset[int]:
    """Every requirement the epic owns, by file location — never by number range.

    The hundreds-blocks are not a scope boundary: 2900 and 3700 are shared
    overflow pools whose ids live in half a dozen unrelated epics. Membership
    follows the store's layout instead.
    """
    epic = requirements.get(epic_number)
    if epic is None:
        return frozenset()
    index = epic_index_for(epic.source_path)
    return frozenset(
        number for number, meta in requirements.items() if epic_index_for(meta.source_path) == index
    )


def resolve_members(milestone: Milestone, requirements: Mapping[int, ReqMeta]) -> frozenset[int]:
    """``expand(epics) ∪ requirements − excludes − deprecated``.

    Deprecated members drop out silently: a requirement retired mid-milestone
    should not hold its release hostage.
    """
    members: set[int] = set(milestone.requirements)
    for epic_number in milestone.epics:
        members |= expand_epic(epic_number, requirements)
    members -= set(milestone.excludes)
    return frozenset(
        number
        for number in members
        if number in requirements and requirements[number].status is not ReqStatus.DEPRECATED
    )


def milestone_for(
    number: int,
    milestones: Iterable[Milestone],
    requirements: Mapping[int, ReqMeta],
) -> Milestone | None:
    """The open milestone claiming this requirement, or None.

    None is the normal answer for most of the store — that is how a bug fix goes
    straight to ``master``.
    """
    for milestone in milestones:
        if milestone.is_open and number in resolve_members(milestone, requirements):
            return milestone
    return None


def check_membership(
    milestones: Iterable[Milestone], requirements: Mapping[int, ReqMeta]
) -> list[str]:
    """Cross-manifest rules that need the requirement store to check."""
    errors: list[str] = []
    owner: dict[int, Milestone] = {}

    for milestone in milestones:
        for field, numbers in (
            ("epics", milestone.epics),
            ("requirements", milestone.requirements),
            ("excludes", milestone.excludes),
        ):
            for number in numbers:
                if number not in requirements:
                    errors.append(
                        f"{milestone.source_path}: {field} names SWR-{number},"
                        " which is not in the requirement store"
                    )

        pulled_in: set[int] = set()
        for epic_number in milestone.epics:
            pulled_in |= expand_epic(epic_number, requirements)
        for number in milestone.excludes:
            if number in requirements and number not in pulled_in:
                errors.append(
                    f"{milestone.source_path}: excludes SWR-{number}, which none of its"
                    " epics pulls in — remove the dead exclude"
                )

        if not milestone.is_open:
            continue
        for number in sorted(resolve_members(milestone, requirements)):
            claimed = owner.get(number)
            if claimed is not None:
                errors.append(
                    f"{milestone.source_path}: SWR-{number} is already claimed by"
                    f" {claimed.milestone_id} ({claimed.source_path}) — a requirement"
                    " belongs to at most one open milestone"
                )
                continue
            owner[number] = milestone

    return errors
