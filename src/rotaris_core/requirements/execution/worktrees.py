"""Worktree isolation for one execution unit (SWR-3405).

Two agents editing one working tree overwrite each other, and a requirement run
that dirties the user's checkout is unusable in practice. Rotaris already solved
that for sessions — :class:`~rotaris_core.session.worktrees.GitWorktreeService`
owns creation, branch sanitising and deterministic collision resolution — so this
module **composes** it rather than growing a second git worktree implementation:

```text
UnitWorktrees.provision()
    │
    ├─ BranchStrategy      ── the name  (configurable, SWR-3117)
    ├─ IsolationProvider   ── the tree  (GitIsolation ▸ GitWorktreeService)
    ├─ WorktreeInspector   ── the proof (what git actually reports)
    └─ WorktreeLedger      ── the record: one unit, one branch, one tree
```

Four properties are load-bearing, and each is checked rather than promised:

- **The namespace cannot collide.** Requirement branches live under
  ``rotaris/req/`` and requirement trees under
  ``<workspace>/.rotaris/requirements/worktrees/``. A strategy that would emit a
  ``rotaris/session/…`` or ``rotaris/integration/…`` branch is refused at
  construction, and so is a storage path that would land in the session's own
  ``.rotaris/worktrees/``. Neither Rotaris' sessions nor a harness' own tree
  (``.claude/worktrees/``) can ever be taken by a requirement run.
- **The record is what git reports.** :meth:`UnitWorktrees.provision` asks the
  new tree for its own top level and its own branch and refuses the workspace
  when either disagrees with what was recorded. A recorded path nobody verified
  is a rumour, and SWR-3405's fourth acceptance criterion is exactly that it must
  not be one.
- **The base checkout is never the answer.** A provisioned workspace whose top
  level resolves to the base checkout is refused, so "the unit ran in the user's
  tree" fails loudly instead of silently dirtying it.
- **Two units, two trees.** :class:`WorktreeLedger` rejects a second workspace on
  a branch or a path another unit already holds, so the invariant holds as a
  value and not only as a lucky sequence of calls.

Everything that touches git arrives through :class:`GitPort`, so the naming, the
ledger and the collision rules are testable without a repository, and the two
real collaborators (:class:`Git`, :class:`GitWorktreeInspector`) are the only
parts that spawn a process.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    REQUIREMENT_WORKTREE_SUBPATH,
    GitIsolation,
    IsolationError,
    IsolationRequest,
    RunWorkspace,
)
from rotaris_core.requirements.execution.units import slug_token

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.requirements.execution.run_seam import IsolationProvider
    from rotaris_core.requirements.execution.units import ExecutionUnit

__all__ = [
    "DEFAULT_BRANCH_TEMPLATE",
    "RESERVED_BRANCH_PREFIXES",
    "BaseFingerprint",
    "BranchStrategy",
    "Git",
    "GitCommand",
    "GitPort",
    "GitWorktreeInspector",
    "UnitWorkspace",
    "UnitWorktrees",
    "WorktreeError",
    "WorktreeInspector",
    "WorktreeLedger",
    "git_timeout_seconds",
]

#: The default branch naming strategy (SWR-3405, configurable per SWR-3117).
#: Reproduces :func:`~rotaris_core.requirements.execution.run_seam.unit_branch`
#: exactly — asserted in the test suite, so the seam's namespace and this
#: module's cannot drift into two spellings of one thing.
DEFAULT_BRANCH_TEMPLATE = f"{REQUIREMENT_BRANCH_PREFIX}/{{req}}/{{unit}}"

#: Branch namespaces a requirement run may never emit into. ``rotaris/session/``
#: belongs to isolated sessions (SWR-2401) and ``rotaris/integration/`` to their
#: integration worktrees; taking either would put a requirement unit's work where
#: a session's recovery and locking logic expects to find its own.
RESERVED_BRANCH_PREFIXES: tuple[str, ...] = ("rotaris/session/", "rotaris/integration/")

#: Where sessions keep their trees, relative to ``.rotaris/``. A requirement
#: storage path equal to — or below — this is refused.
_SESSION_WORKTREE_SUBPATH = "worktrees"

#: Wall-clock bound on one plumbing git call. Every command this module runs is a
#: read or a merge over a small tree; a call that has not answered by now is a
#: hung process, not a slow one.
_GIT_TIMEOUT_S = 30.0


class WorktreeError(RuntimeError):
    """A unit could not be given — or could not be proven to have — its own tree."""


def git_timeout_seconds() -> float:
    """The bound one plumbing git call is given. Exposed so a caller can state it."""
    return _GIT_TIMEOUT_S


@dataclass(frozen=True, slots=True)
class GitCommand:
    """One git invocation and what it answered.

    A value rather than an exception, because half the callers here *expect*
    failure: a merge that conflicts and a ``rev-parse`` of a branch that does not
    exist are answers, not crashes (SWR-3409).
    """

    args: tuple[str, ...]
    returncode: int
    stdout: str = ""
    stderr: str = ""

    @property
    def ok(self) -> bool:
        """Whether git reported success."""
        return self.returncode == 0

    @property
    def text(self) -> str:
        """Standard output, stripped — what a caller reads a value from."""
        return self.stdout.strip()

    @property
    def lines(self) -> tuple[str, ...]:
        """Non-empty output lines, stripped."""
        return tuple(line.strip() for line in self.stdout.splitlines() if line.strip())

    @property
    def message(self) -> str:
        """The best available explanation of what happened."""
        return self.stderr.strip() or self.stdout.strip() or f"git {' '.join(self.args)} failed"


class GitPort(Protocol):
    """The only way this package reaches git.

    One method, so the whole of requirement execution can be exercised against a
    scripted port in a unit test and against :class:`Git` in an integration one.
    """

    def run(self, cwd: Path, *args: str) -> GitCommand:
        """Run ``git *args`` in *cwd* and report what it answered."""
        ...


@traces(SWR.SWR_3405)
class Git:
    """:class:`GitPort` over a real ``git`` process."""

    def __init__(self, *, timeout: float = _GIT_TIMEOUT_S) -> None:
        self._timeout = timeout

    def run(self, cwd: Path, *args: str) -> GitCommand:
        """Run ``git *args`` in *cwd*, never raising for a non-zero exit."""
        try:
            completed = subprocess.run(
                ["git", *args],
                cwd=cwd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self._timeout,
                check=False,
            )
        except OSError as exc:
            raise WorktreeError(f"could not run git in {cwd}: {exc}") from exc
        except subprocess.TimeoutExpired as exc:
            raise WorktreeError(f"git {' '.join(args)} in {cwd} did not finish in time") from exc
        return GitCommand(
            args=args,
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )


@traces(SWR.SWR_3405, SWR.SWR_3117)
class BranchStrategy(BaseModel):
    """How a unit run's branch is named — configurable, and bounded (SWR-3117).

    A template rather than a callable so a workspace can state it in
    configuration and Rotaris can still refuse an unsafe one *before* a run
    starts: a strategy that would emit into the session namespace, or that
    forgets the unit and would give every unit of a requirement the same branch,
    is a configuration error and is reported as one here.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: ``{req}``, ``{unit}`` and optionally ``{attempt}``. Both ``{req}`` and
    #: ``{unit}`` are mandatory: without ``{unit}`` two units of one requirement
    #: would collide on every run, which is the failure SWR-3405 exists to stop.
    template: str = DEFAULT_BRANCH_TEMPLATE

    @field_validator("template")
    @classmethod
    def _usable(cls, value: str) -> str:
        cleaned = value.strip()
        if "{unit}" not in cleaned or "{req}" not in cleaned:
            raise WorktreeError(
                f"branch strategy {value!r} must name both {{req}} and {{unit}};"
                " without them two units of one requirement share a branch (SWR-3405)",
            )
        return cleaned

    @model_validator(mode="after")
    def _outside_the_reserved_namespaces(self) -> Self:
        probe = self.branch_for("SWR-1", "unit-1")
        for reserved in RESERVED_BRANCH_PREFIXES:
            if probe.startswith(reserved):
                raise WorktreeError(
                    f"branch strategy {self.template!r} emits into {reserved!r},"
                    " which belongs to isolated sessions (SWR-2401), not to"
                    " requirement units (SWR-3405)",
                )
        return self

    @traces(SWR.SWR_3405)
    def branch_for(
        self,
        req_id: str,
        unit_id: str,
        *,
        attempt: int = 1,
        cycle: int = 0,
    ) -> str:
        """The branch the *attempt*-th run of *unit_id* works on, in delivery *cycle*.

        Every component is slugged by the same rule unit ids are
        (:func:`~rotaris_core.requirements.execution.units.slug_token`), so an id
        like ``PROJ/7`` cannot smuggle a path separator into a branch name. A
        template that does not mention ``{attempt}`` gets the ``-a<n>`` suffix
        appended from the second attempt on, so a retry (SWR-3415) never reuses
        the branch whose failure is still being inspected — and a ``-c<n>``
        component from the second delivery cycle on, for the same reason at the
        larger scale: a re-delivered requirement re-plans the same unit ids
        (SWR-3417), and without it the second delivery would land on the first
        one's branch.
        """
        requirement = slug_token(req_id, limit=0)
        unit = slug_token(unit_id, limit=0)
        if not requirement or not unit:
            raise WorktreeError(
                f"cannot derive a branch for requirement {req_id!r} / unit {unit_id!r}",
            )
        rendered = self.template.format(req=requirement, unit=unit, attempt=attempt)
        if cycle > 0:
            rendered = f"{rendered}-c{cycle + 1}"
        if "{attempt}" not in self.template and attempt > 1:
            rendered = f"{rendered}-a{attempt}"
        return _legal_branch(rendered)


def _legal_branch(candidate: str) -> str:
    """*candidate*, proven acceptable to git — by git's own rule, not a copy of it."""
    from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService

    try:
        return GitWorktreeService.sanitize_branch(candidate)
    except GitWorktreeError as exc:
        raise WorktreeError(str(exc)) from exc


@traces(SWR.SWR_3405)
class UnitWorkspace(BaseModel):
    """The tree and branch one unit run owns, as git confirmed them.

    Recorded on the run (SWR-3405) and read by the board through
    :attr:`~rotaris_core.requirements.delivery.projection.RunView.worktree_path`,
    so a user can open the tree a unit's work lives in — including after the run
    failed, which is when it matters most (SWR-3415).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    run_id: str
    path: str
    branch: str
    base_branch: str = ""
    base_revision: str = ""
    attempt: int = 1
    #: False when the run attached to a tree that already existed.
    created: bool = True

    @field_validator("req_id", "unit_id", "run_id", "path", "branch")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise WorktreeError(
                "a unit workspace names the requirement, the unit, the run,"
                " the tree and the branch (SWR-3405)",
            )
        return cleaned

    @property
    def directory(self) -> Path:
        """The workspace as a path."""
        return Path(self.path)

    @property
    def address(self) -> str:
        """``<branch> @ <path>`` — one line for a card or a log."""
        return f"{self.branch} @ {self.path}"


@traces(SWR.SWR_3405)
class WorktreeLedger(BaseModel):
    """Every workspace handed out for one requirement, as one coherent value.

    The invariant SWR-3405's second acceptance criterion states — two units, two
    branches, two trees — is checked here on construction rather than hoped for
    from the order of calls: a ledger that would hold two units on one branch, or
    two units in one directory, cannot be built.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    workspaces: tuple[UnitWorkspace, ...] = ()

    @model_validator(mode="after")
    def _one_tree_per_unit(self) -> Self:
        by_branch: dict[str, str] = {}
        by_path: dict[str, str] = {}
        by_unit: dict[tuple[str, int], str] = {}
        for workspace in self.workspaces:
            if workspace.req_id != self.req_id:
                raise WorktreeError(
                    f"{workspace.unit_id} belongs to {workspace.req_id}, not to {self.req_id}",
                )
            key = (workspace.unit_id, workspace.attempt)
            if key in by_unit:
                raise WorktreeError(
                    f"{self.req_id}: unit {workspace.unit_id} already has a workspace"
                    f" for attempt {workspace.attempt}",
                )
            by_unit[key] = workspace.run_id
            owner = by_branch.get(workspace.branch)
            if owner is not None and owner != workspace.unit_id:
                raise WorktreeError(
                    f"{self.req_id}: units {owner} and {workspace.unit_id} would share"
                    f" branch {workspace.branch!r}; two units get two branches (SWR-3405)",
                )
            by_branch[workspace.branch] = workspace.unit_id
            resolved = _key_for(workspace.path)
            holder = by_path.get(resolved)
            if holder is not None and holder != workspace.unit_id:
                raise WorktreeError(
                    f"{self.req_id}: units {holder} and {workspace.unit_id} would share"
                    f" worktree {workspace.path!r}; two units get two trees (SWR-3405)",
                )
            by_path[resolved] = workspace.unit_id
        return self

    @property
    def branches(self) -> tuple[str, ...]:
        """Every branch this requirement's units hold, in the order handed out."""
        return tuple(workspace.branch for workspace in self.workspaces)

    @property
    def paths(self) -> tuple[str, ...]:
        """Every tree this requirement's units hold, in the order handed out."""
        return tuple(workspace.path for workspace in self.workspaces)

    @property
    def unit_ids(self) -> tuple[str, ...]:
        """The units that hold a workspace, oldest first, without repeats."""
        seen: list[str] = []
        for workspace in self.workspaces:
            if workspace.unit_id not in seen:
                seen.append(workspace.unit_id)
        return tuple(seen)

    def for_unit(self, unit_id: str) -> UnitWorkspace | None:
        """The newest workspace of *unit_id*, or ``None`` when it has none."""
        found = [workspace for workspace in self.workspaces if workspace.unit_id == unit_id]
        return found[-1] if found else None

    def added(self, workspace: UnitWorkspace) -> WorktreeLedger:
        """This ledger with *workspace* recorded, re-validated by the same rules."""
        return WorktreeLedger(req_id=self.req_id, workspaces=(*self.workspaces, workspace))


def _key_for(path: str) -> str:
    """A comparison key for a worktree path — case-folded on the platforms that are."""
    try:
        resolved = Path(path).resolve()
    except OSError:  # pragma: no cover - only a broken path reaches this
        resolved = Path(path)
    return str(resolved).replace("\\", "/").casefold()


@dataclass(frozen=True, slots=True)
class BaseFingerprint:
    """Where the base checkout stood — branch and commit — at one moment.

    The evidence behind "no unit run writes into the base checkout" (SWR-3405)
    and behind "the base is not modified until integration verified" (SWR-3409):
    taken before, compared after, and a difference is a stated failure rather
    than something a reviewer has to notice.
    """

    branch: str
    revision: str

    @property
    def address(self) -> str:
        """``main@c0ffee12`` — one line for a message."""
        return f"{self.branch}@{self.revision[:12]}"

    def differs_from(self, other: BaseFingerprint) -> bool:
        """Whether the base moved between the two readings."""
        return self.branch != other.branch or self.revision != other.revision


class WorktreeInspector(Protocol):
    """What git says about a tree, asked *of that tree* (SWR-3405)."""

    def top_level(self, path: Path) -> Path:
        """The root of the worktree containing *path*."""
        ...

    def branch(self, path: Path) -> str:
        """The branch checked out in *path*."""
        ...

    def head(self, path: Path) -> str:
        """The commit *path* points at."""
        ...


@traces(SWR.SWR_3405)
class GitWorktreeInspector:
    """:class:`WorktreeInspector` over a :class:`GitPort`."""

    def __init__(self, git: GitPort | None = None) -> None:
        self._git = git if git is not None else Git()

    def top_level(self, path: Path) -> Path:
        """The root of the worktree containing *path*, as git resolves it."""
        return Path(self._ask(path, "rev-parse", "--show-toplevel")).resolve()

    def branch(self, path: Path) -> str:
        """The branch checked out in *path*. Empty on a detached HEAD."""
        result = self._git.run(path, "branch", "--show-current")
        if not result.ok:
            raise WorktreeError(f"{path}: git could not name the checked-out branch")
        return result.text

    def head(self, path: Path) -> str:
        """The commit *path* points at."""
        return self._ask(path, "rev-parse", "HEAD")

    def _ask(self, path: Path, *args: str) -> str:
        result = self._git.run(path, *args)
        if not result.ok:
            raise WorktreeError(f"{path}: git {' '.join(args)} failed — {result.message}")
        return result.text


@traces(SWR.SWR_3405)
class UnitWorktrees:
    """Hand every execution unit run a worktree of its own, and prove it got one.

    Composition throughout: the tree comes from
    :class:`~rotaris_core.requirements.execution.run_seam.GitIsolation`, which
    wraps the session layer's
    :class:`~rotaris_core.session.worktrees.GitWorktreeService` — so branch
    sanitising, the "must be a repository root" precondition and the
    deterministic ``-2``/``-3`` collision resolution (SWR-2415) are inherited and
    not re-derived. What this class adds is the part SWR-3405 is actually about:
    the namespace, the confirmation against git, and the ledger.
    """

    def __init__(
        self,
        base_workspace: Path,
        *,
        strategy: BranchStrategy | None = None,
        isolation: IsolationProvider | None = None,
        inspector: WorktreeInspector | None = None,
        storage_subpath: str = REQUIREMENT_WORKTREE_SUBPATH,
    ) -> None:
        self._base_workspace = base_workspace.expanduser()
        self._strategy = strategy if strategy is not None else BranchStrategy()
        self._storage_subpath = _requirement_storage(storage_subpath)
        self._isolation = (
            isolation
            if isolation is not None
            else GitIsolation(self._base_workspace, storage_subpath=self._storage_subpath)
        )
        self._inspector = inspector if inspector is not None else GitWorktreeInspector()
        self._ledgers: dict[str, WorktreeLedger] = {}

    @property
    def base_workspace(self) -> Path:
        """The checkout requirement worktrees are cut from — and never written to."""
        return self._base_workspace

    @property
    def strategy(self) -> BranchStrategy:
        """How this service names branches (SWR-3117)."""
        return self._strategy

    @property
    def storage_subpath(self) -> str:
        """Where requirement trees live, relative to ``<workspace>/.rotaris/``."""
        return self._storage_subpath

    def ledger_for(self, req_id: str) -> WorktreeLedger:
        """Every workspace handed out for *req_id* so far."""
        return self._ledgers.get(req_id, WorktreeLedger(req_id=req_id))

    @traces(SWR.SWR_3405)
    def isolation_request(
        self,
        req_id: str,
        unit_id: str,
        *,
        run_id: str,
        attempt: int = 1,
    ) -> IsolationRequest:
        """What this unit run asks the isolation provider for.

        Filed under the **run** id, not the unit id, so two attempts of one unit
        get two directories and the failed one stays inspectable (SWR-3415).
        """
        return IsolationRequest(
            branch=self._strategy.branch_for(req_id, unit_id, attempt=attempt),
            session_id=run_id,
            create=True,
        )

    @traces(SWR.SWR_3405, SWR.SWR_3406)
    def provision(
        self,
        req_id: str,
        unit_id: str,
        *,
        run_id: str,
        attempt: int = 1,
    ) -> UnitWorkspace:
        """Give this unit run its own tree and branch, and confirm both.

        The confirmation is the point. A worktree service can report a path it
        never created, a branch that was renamed under it, or — the failure that
        matters — the base checkout itself. Each of those is refused here with
        the two values that disagreed, so SWR-3405's "no unit run writes to the
        base checkout" is a checked fact rather than a convention.
        """
        request = self.isolation_request(req_id, unit_id, run_id=run_id, attempt=attempt)
        try:
            provided = self._isolation.provide(request)
        except IsolationError as exc:
            raise WorktreeError(f"{req_id}/{unit_id}: {exc}") from exc
        workspace = self._record(
            req_id,
            unit_id,
            run_id=run_id,
            attempt=attempt,
            provided=provided,
        )
        self._ledgers[req_id] = self.ledger_for(req_id).added(workspace)
        return workspace

    @traces(SWR.SWR_3405, SWR.SWR_3406)
    def provision_all(
        self,
        req_id: str,
        units: Sequence[ExecutionUnit],
        *,
        run_ids: Sequence[str],
    ) -> WorktreeLedger:
        """One tree and one branch per unit — the multi-unit case, in one call.

        Fails on the first unit that cannot be isolated rather than leaving a
        half-provisioned requirement to be discovered later; the trees already
        created are kept and stay in the ledger, because a tree that exists is
        evidence and deleting it would destroy the only record of what happened.
        """
        if len(run_ids) != len(units):
            raise WorktreeError(
                f"{req_id}: {len(units)} unit(s) need {len(units)} run id(s), got {len(run_ids)}",
            )
        for unit, run_id in zip(units, run_ids, strict=True):
            self.provision(req_id, unit.unit_id, run_id=run_id)
        return self.ledger_for(req_id)

    @traces(SWR.SWR_3405)
    def fingerprint_base(self) -> BaseFingerprint:
        """Where the base checkout stands right now (SWR-3405, SWR-3409)."""
        return BaseFingerprint(
            branch=self._inspector.branch(self._base_workspace),
            revision=self._inspector.head(self._base_workspace),
        )

    @traces(SWR.SWR_3405)
    def assert_base_untouched(self, before: BaseFingerprint) -> BaseFingerprint:
        """Refuse to continue if the base checkout moved since *before*.

        Called around anything that runs git in a worktree of this repository:
        the whole promise of SWR-3405 is that the user's checkout is where the
        work is *not*, and a promise nobody checks is a comment.
        """
        now = self.fingerprint_base()
        if now.differs_from(before):
            raise WorktreeError(
                f"the base checkout moved from {before.address} to {now.address}"
                " while a requirement unit was running; unit work belongs in the"
                " unit's own worktree (SWR-3405)",
            )
        return now

    def _record(
        self,
        req_id: str,
        unit_id: str,
        *,
        run_id: str,
        attempt: int,
        provided: RunWorkspace,
    ) -> UnitWorkspace:
        tree = Path(provided.path)
        try:
            top_level = self._inspector.top_level(tree)
            branch = self._inspector.branch(tree)
        except WorktreeError as exc:
            raise WorktreeError(f"{req_id}/{unit_id}: {exc}") from exc
        base = self._resolved_base()
        if top_level == base:
            raise WorktreeError(
                f"{req_id}/{unit_id}: the provided workspace is the base checkout"
                f" ({base}); a unit run never writes there (SWR-3405)",
            )
        if _key_for(str(top_level)) != _key_for(provided.path):
            raise WorktreeError(
                f"{req_id}/{unit_id}: recorded worktree {provided.path!r} but git"
                f" reports {str(top_level)!r} (SWR-3405)",
            )
        if branch != provided.branch:
            raise WorktreeError(
                f"{req_id}/{unit_id}: recorded branch {provided.branch!r} but git"
                f" reports {branch!r} (SWR-3405)",
            )
        return UnitWorkspace(
            req_id=req_id,
            unit_id=unit_id,
            run_id=run_id,
            path=str(top_level),
            branch=branch,
            base_branch=provided.base_branch,
            base_revision=provided.base_revision,
            attempt=attempt,
            created=provided.created,
        )

    def _resolved_base(self) -> Path:
        try:
            return self._base_workspace.resolve()
        except OSError:  # pragma: no cover - only an unreadable base reaches this
            return self._base_workspace


def _requirement_storage(subpath: str) -> str:
    """*subpath*, proven to be a requirement storage path and not a session one."""
    cleaned = subpath.strip().replace("\\", "/").strip("/")
    if not cleaned:
        raise WorktreeError("requirement worktrees need a storage path under .rotaris/")
    if Path(cleaned).is_absolute() or ".." in Path(cleaned).parts:
        raise WorktreeError(f"requirement worktree storage {subpath!r} must stay inside .rotaris")
    head = cleaned.split("/", 1)[0]
    if head == _SESSION_WORKTREE_SUBPATH:
        raise WorktreeError(
            f"requirement worktree storage {subpath!r} would land in"
            f" .rotaris/{_SESSION_WORKTREE_SUBPATH}/, which belongs to isolated"
            " sessions (SWR-2401); requirement runs keep their own namespace (SWR-3405)",
        )
    return cleaned
