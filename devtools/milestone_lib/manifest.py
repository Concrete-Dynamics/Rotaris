"""Parse and shape-validate the milestone manifests in ``docs/milestones/``.

Stdlib only, on purpose: this runs in CI with nothing but ``PYTHONPATH=src`` and
a Python interpreter, the same way ``reqtocode.yml`` and the release ``guard``
job do. That is also why the frontmatter is parsed by hand rather than with a
YAML library — the manifests use a deliberately small subset.

This module validates *shape* only: filenames, branch names, versions, dates,
and id syntax. Whether an id names a real requirement, and whether two
milestones claim the same one, needs the requirement store and lives in
:mod:`milestone_lib.membership`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

#: Where the manifests live, relative to the repository root. Deliberately a
#: constant here and not a ``RepoLayout`` field: ``RepoLayout`` describes the
#: product's requirement store, and our milestone directory is not part of it.
MILESTONES_DIR = Path("docs") / "milestones"

#: Files in the directory that are documentation, not milestones.
_NOT_MILESTONES = frozenset({"README.md", "TEMPLATE.md"})


class MilestoneStatus(StrEnum):
    """Where a milestone stands. See ``docs/milestones/README.md``."""

    PLANNED = "planned"
    ACTIVE = "active"
    RELEASED = "released"
    ABANDONED = "abandoned"


#: Statuses that own their members. A requirement may belong to at most one
#: milestone in this set; released and abandoned ones release their claim, so a
#: requirement can be picked up again later without editing history.
OPEN_STATUSES = frozenset({MilestoneStatus.PLANNED, MilestoneStatus.ACTIVE})

_FILENAME_RE = re.compile(r"^M(?P<number>\d+)-(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$")
_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_REQ_ID_RE = re.compile(r"^SWR-(\d+)$")
_FIELD_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):(.*)$")
_FIELD_START_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*:")


@dataclass(frozen=True)
class Milestone:
    """One declared milestone."""

    milestone_id: str
    title: str
    status: MilestoneStatus
    branch: str
    target_version: str
    opened: str
    epics: tuple[int, ...]
    requirements: tuple[int, ...]
    excludes: tuple[int, ...]
    source_path: str
    released_version: str = ""
    released_on: str = ""

    @property
    def is_open(self) -> bool:
        """Does this milestone still claim its members?"""
        return self.status in OPEN_STATUSES

    @property
    def tag(self) -> str:
        """The git tag this milestone releases as."""
        return f"v{self.target_version}"


@dataclass(frozen=True)
class MilestoneParseResult:
    """Everything the store yielded, plus everything wrong with it."""

    milestones: tuple[Milestone, ...]
    errors: tuple[str, ...]

    def by_id(self, milestone_id: str) -> Milestone | None:
        """The milestone with this id, or None."""
        for milestone in self.milestones:
            if milestone.milestone_id == milestone_id:
                return milestone
        return None


def _split_frontmatter(text: str) -> dict[str, str] | None:
    """Return the frontmatter fields, or None when the file has none.

    A line that does not open a new ``key:`` continues the previous value, so a
    flow list a formatter has wrapped across several lines still parses as one
    value. Same tolerance the requirement store's own parser applies.
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    fields: dict[str, str] = {}
    logical: str | None = None

    def flush(line: str | None) -> None:
        if line is None:
            return
        match = _FIELD_RE.match(line)
        if not match:
            return
        value = match.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        fields[match.group(1)] = value

    for line in lines[1:]:
        if line.strip() == "---":
            flush(logical)
            return fields
        if _FIELD_START_RE.match(line):
            flush(logical)
            logical = line
        elif logical is not None:
            logical = f"{logical} {line.strip()}"
    return None  # unterminated frontmatter -> treat as no frontmatter


def _id_list(raw: str, rel: str, field: str, errors: list[str]) -> tuple[int, ...]:
    """Parse ``[SWR-1, SWR-2]`` into requirement numbers.

    An empty list and a missing field both mean "none": a milestone that names
    no epics is legal as long as it names requirements, and vice versa.
    """
    stripped = raw.strip()
    if not stripped or stripped == "[]":
        return ()
    if stripped.startswith("[") and stripped.endswith("]"):
        stripped = stripped[1:-1]
    numbers: list[int] = []
    for entry in stripped.split(","):
        token = entry.strip()
        if not token:
            continue
        match = _REQ_ID_RE.match(token)
        if match is None:
            errors.append(f"{rel}: {field} entry {token!r} is not a SWR-<n> id")
            continue
        numbers.append(int(match.group(1)))
    duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
    for number in duplicates:
        errors.append(f"{rel}: {field} names SWR-{number} more than once")
    return tuple(sorted(set(numbers)))


def _parse_one(path: Path, rel: str, errors: list[str]) -> Milestone | None:
    """Parse and shape-validate a single manifest. Returns None if unusable."""
    before = len(errors)
    fields = _split_frontmatter(path.read_text(encoding="utf-8"))
    if fields is None:
        errors.append(f"{rel}: no frontmatter (every milestone file needs one)")
        return None

    name_match = _FILENAME_RE.match(path.stem)
    if name_match is None:
        errors.append(f"{rel}: filename must be M<n>-<slug>.md, lowercase dashed slug")
        return None
    expected_id = f"M{name_match.group('number')}"
    expected_branch = f"milestone/{path.stem.lower()}"

    milestone_id = fields.get("milestone", "").strip()
    if milestone_id != expected_id:
        errors.append(
            f"{rel}: milestone is {milestone_id!r}, expected {expected_id!r} from the filename"
        )

    status_raw = fields.get("status", "").strip()
    try:
        status = MilestoneStatus(status_raw)
    except ValueError:
        expected = ", ".join(sorted(s.value for s in MilestoneStatus))
        errors.append(f"{rel}: unknown status {status_raw!r} (expected one of {expected})")
        return None

    branch = fields.get("branch", "").strip()
    if branch != expected_branch:
        errors.append(
            f"{rel}: branch is {branch!r}, expected {expected_branch!r} from the filename"
        )

    title = fields.get("title", "").strip()
    if not title:
        errors.append(f"{rel}: title is required")

    target_version = fields.get("target-version", "").strip()
    if not _VERSION_RE.match(target_version):
        errors.append(
            f"{rel}: target-version {target_version!r} must be X.Y.Z with no prerelease"
            " suffix — alphas cut during the milestone carry their own"
        )

    opened = fields.get("opened", "").strip()
    if not _DATE_RE.match(opened):
        errors.append(f"{rel}: opened {opened!r} must be YYYY-MM-DD")

    released_version = fields.get("released-version", "").strip()
    released_on = fields.get("released-on", "").strip()
    if status is MilestoneStatus.RELEASED:
        if not _VERSION_RE.match(released_version):
            errors.append(f"{rel}: status is released, so released-version must be X.Y.Z")
        if not _DATE_RE.match(released_on):
            errors.append(f"{rel}: status is released, so released-on must be YYYY-MM-DD")
    elif released_version or released_on:
        errors.append(f"{rel}: released-version/released-on are only for status: released")

    epics = _id_list(fields.get("epics", ""), rel, "epics", errors)
    requirements = _id_list(fields.get("requirements", ""), rel, "requirements", errors)
    excludes = _id_list(fields.get("excludes", ""), rel, "excludes", errors)
    if not epics and not requirements:
        errors.append(f"{rel}: a milestone must name at least one epic or requirement")
    for number in sorted(set(epics) & set(requirements)):
        errors.append(
            f"{rel}: SWR-{number} is named as both an epic and a requirement — name it once"
        )

    if len(errors) > before:
        return None
    return Milestone(
        milestone_id=milestone_id,
        title=title,
        status=status,
        branch=branch,
        target_version=target_version,
        opened=opened,
        epics=epics,
        requirements=requirements,
        excludes=excludes,
        source_path=rel,
        released_version=released_version,
        released_on=released_on,
    )


def parse_milestones(repo_root: Path) -> MilestoneParseResult:
    """Read every manifest under ``docs/milestones/``.

    Deterministic: files are visited in sorted order, so errors come out in the
    same order on every machine.
    """
    directory = repo_root / MILESTONES_DIR
    errors: list[str] = []
    milestones: list[Milestone] = []
    if not directory.is_dir():
        return MilestoneParseResult((), (f"{MILESTONES_DIR.as_posix()}/ does not exist",))

    for path in sorted(directory.glob("*.md")):
        if path.name in _NOT_MILESTONES:
            continue
        rel = f"{MILESTONES_DIR.as_posix()}/{path.name}"
        milestone = _parse_one(path, rel, errors)
        if milestone is not None:
            milestones.append(milestone)

    seen: dict[str, str] = {}
    for milestone in milestones:
        if milestone.milestone_id in seen:
            errors.append(
                f"{milestone.source_path}: milestone id {milestone.milestone_id} is already"
                f" declared by {seen[milestone.milestone_id]}"
            )
        seen[milestone.milestone_id] = milestone.source_path

    return MilestoneParseResult(tuple(milestones), tuple(errors))
