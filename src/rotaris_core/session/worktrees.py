"""Git worktree lifecycle and safe integration support for isolated sessions."""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.liveness import pid_is_alive
from rotaris_core.session.recovery import ACTIVE_EXECUTION_STATUSES
from rotaris_core.session.state import SessionWorktree

if TYPE_CHECKING:
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState


class GitWorktreeError(RuntimeError):
    """A Git precondition failed without changing the base workspace."""


#: How git — and, underneath it, Windows — says a path exceeded ``MAX_PATH``.
#: Matched narrowly on purpose: this is the one git failure Rotaris re-words, and
#: a loose pattern would put Rotaris' sentence in front of an unrelated error.
_PATH_LIMIT_MARKERS: tuple[str, ...] = (
    "filename too long",
    "file name too long",
    "filename or extension is too long",
)


@traces(SWR.SWR_3418)
def _is_path_too_long(message: str) -> bool:
    """True when git refused because a path did not fit the platform's limit."""
    lowered = message.casefold()
    return any(marker in lowered for marker in _PATH_LIMIT_MARKERS)


@traces(SWR.SWR_3418)
def _path_limit_message(detail: str, *, workspace: Path) -> str:
    """The path-length refusal *detail*, said in Rotaris' words (SWR-3418).

    Only the headline is replaced. Git's own text follows as detail, because the
    person who ends up reading a bug report still needs the exact refusal — what
    they do *not* need first is a sentence about git's internals when the thing
    that went wrong is where their workspace lives.

    Rotaris states the remedy and never applies it: ``core.longpaths`` is a
    setting in the user's own git configuration, and a tool that quietly rewrote
    it would be changing an environment it was only asked to work in.
    """
    return (
        "This worktree could not be created: a file in it needs a path longer than"
        " Windows allows (260 characters). Two things fix it — enable long paths in"
        " Git with `git config --global core.longpaths true`, or move the workspace"
        f" somewhere shorter than {workspace}. Rotaris does not change your Git"
        f" configuration for you.\nGit reported: {detail}"
    )


def _is_branch_collision(message: str) -> bool:
    """True when Git refused because that *branch* is taken by a ref or worktree.

    Deliberately narrow: a taken worktree *path*, a dirty repository, or any
    other Git failure must not be retried under a different branch name.
    """
    lowered = message.casefold()
    return (
        ("a branch named" in lowered and "already exists" in lowered)
        or "already checked out" in lowered
        or "already used by worktree" in lowered
    )


@dataclass(frozen=True, slots=True)
class WorktreeLaunchRequest:
    """Requested isolation mode for a new user session."""

    branch: str | None = None
    path: Path | None = None
    create: bool = True
    session_id: str | None = None


@dataclass(frozen=True, slots=True)
class IntegrationPlan:
    """Reserved source sessions and a temporary integration worktree."""

    integration_session_id: str
    base_branch: str
    base_revision: str
    integration_branch: str
    integration_path: Path
    source_session_ids: tuple[str, ...]
    source_branches: tuple[str, ...]


@traces(
    SWR.SWR_2401,
    SWR.SWR_2407,
    SWR.SWR_2408,
    SWR.SWR_2409,
    SWR.SWR_2410,
    SWR.SWR_2411,
    SWR.SWR_2412,
    SWR.SWR_2413,
)
class GitWorktreeService:
    """Own Git worktrees while keeping session metadata in the base workspace."""

    _LOCK_FILENAME = "integration.lock"

    def __init__(self, base_workspace: Path, *, storage_subpath: str = "worktrees") -> None:
        self.base_workspace = base_workspace.expanduser().resolve()
        self.storage_subpath = storage_subpath

    def create_for_session(
        self,
        session_id: str,
        branch: str | None = None,
        *,
        base_revision: str | None = None,
        base_branch: str | None = None,
    ) -> SessionWorktree:
        """Create one isolated worktree under ``.rotaris`` for a new session.

        *base_revision* and *base_branch* let a caller state where the tree is cut
        from instead of letting it be read off the checkout. Requirement work uses
        that to fork from its declared target branch (SWR-3419); a session run
        passes neither and keeps the behaviour it always had — the checkout's
        current branch and ``HEAD``.
        """
        self._assert_base_repository()
        resolved_branch = (
            base_branch if base_branch is not None else self._current_branch(self.base_workspace)
        )
        resolved_revision = (
            base_revision
            if base_revision
            else self._git(self.base_workspace, "rev-parse", "HEAD").strip()
        )
        requested_branch = f"rotaris/session/{session_id}" if branch is None else branch
        clean_branch = self.sanitize_branch(requested_branch)
        if branch is not None and clean_branch != branch:
            raise GitWorktreeError(f"Invalid Git branch name: {branch!r}")
        path = self._storage_root() / session_id
        if path.exists():
            raise GitWorktreeError(f"Worktree path already exists: {path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        self._git(
            self.base_workspace,
            "worktree",
            "add",
            "-b",
            clean_branch,
            str(path),
            resolved_revision,
        )
        return SessionWorktree(
            path=str(path),
            branch=clean_branch,
            base_branch=resolved_branch,
            base_revision=resolved_revision,
            created_by_session=True,
        )

    #: Deterministic suffixes tried after a branch/worktree collision.
    _MAX_BRANCH_COLLISION_ATTEMPTS = 50

    @traces(SWR.SWR_2415, SWR.SWR_2434)
    def create_for_session_unique(
        self,
        session_id: str,
        branch: str | None = None,
        *,
        base_revision: str | None = None,
        base_branch: str | None = None,
    ) -> SessionWorktree:
        """Create an isolated worktree, resolving branch collisions deterministically.

        The requested (or generated) branch is tried first; an already-used
        branch or worktree yields ``-2``, ``-3``, … until one is free. Every
        other Git or filesystem failure propagates unchanged — only collisions
        are retried.
        """
        requested = f"rotaris/session/{session_id}" if branch is None else branch
        clean_branch = self.sanitize_branch(requested)
        if branch is not None and clean_branch != branch:
            raise GitWorktreeError(f"Invalid Git branch name: {branch!r}")
        for attempt in range(1, self._MAX_BRANCH_COLLISION_ATTEMPTS + 1):
            candidate = clean_branch if attempt == 1 else f"{clean_branch}-{attempt}"
            if self._branch_exists(candidate):
                continue
            try:
                return self.create_for_session(
                    session_id,
                    candidate,
                    base_revision=base_revision,
                    base_branch=base_branch,
                )
            except GitWorktreeError as exc:
                if not _is_branch_collision(str(exc)):
                    raise
        raise GitWorktreeError(
            f"Could not find a free branch name for {clean_branch!r} after "
            f"{self._MAX_BRANCH_COLLISION_ATTEMPTS} attempts."
        )

    def _branch_exists(self, branch: str) -> bool:
        result = self._git_result(
            self.base_workspace,
            "show-ref",
            "--verify",
            "--quiet",
            f"refs/heads/{branch}",
        )
        return result.returncode == 0

    def attach_existing(self, path: Path) -> SessionWorktree:
        """Validate and bind a session to an existing sibling worktree."""
        self._assert_base_repository()
        resolved = path.expanduser().resolve()
        if not resolved.is_dir():
            raise GitWorktreeError(f"Worktree directory does not exist: {resolved}")
        if self._git_common_dir(resolved) != self._git_common_dir(self.base_workspace):
            raise GitWorktreeError("Attached path is not a worktree of this workspace repository.")
        branch = self._current_branch(resolved)
        return SessionWorktree(
            path=str(resolved),
            branch=branch,
            base_branch=self._current_branch(self.base_workspace),
            base_revision=self._git(self.base_workspace, "rev-parse", "HEAD").strip(),
            created_by_session=False,
        )

    def prepare_integration(
        self,
        manager: SessionManager,
        source_sessions: list[SessionState],
        integration_session_id: str,
    ) -> IntegrationPlan:
        """Reserve sources and prepare an integration branch without touching base."""
        self._assert_base_repository()
        if not source_sessions:
            raise GitWorktreeError("Select at least one completed isolated session.")
        self._require_clean_base()
        self._require_base_not_in_use(manager, integration_session_id)
        self._acquire_integration_lock(integration_session_id)
        reserved: list[str] = []
        try:
            base_branch = self._current_branch(self.base_workspace)
            base_revision = self._git(self.base_workspace, "rev-parse", "HEAD").strip()
            branches: list[str] = []
            seen_paths: set[Path] = set()
            for state in source_sessions:
                binding = state.worktree
                if state.execution_status != "completed" or binding is None:
                    raise GitWorktreeError(
                        f"Session {state.session_id} is not a completed isolated session."
                    )
                source_path = Path(binding.path).resolve()
                if source_path in seen_paths:
                    raise GitWorktreeError("A worktree may be selected only once.")
                if self._git_common_dir(source_path) != self._git_common_dir(self.base_workspace):
                    raise GitWorktreeError(
                        f"Session {state.session_id} no longer belongs to this workspace repository."
                    )
                if not manager.acquire_lock(state.session_id):
                    raise GitWorktreeError(
                        f"Session {state.session_id} is active or already being integrated."
                    )
                reserved.append(state.session_id)
                self._commit_pending_changes(source_path, state.session_id)
                branches.append(binding.branch)
                seen_paths.add(source_path)

            integration_branch = self.sanitize_branch(
                f"rotaris/integration/{integration_session_id}"
            )
            integration_path = self._integration_root() / integration_session_id
            if integration_path.exists():
                raise GitWorktreeError(
                    f"Integration worktree path already exists: {integration_path}"
                )
            integration_path.parent.mkdir(parents=True, exist_ok=True)
            self._git(
                self.base_workspace,
                "worktree",
                "add",
                "-b",
                integration_branch,
                str(integration_path),
                base_revision,
            )
            for state in source_sessions:
                assert state.worktree is not None
                state.worktree.merge_status = "integrating"
                state.worktree.integration_session_id = integration_session_id
                manager.flush_session(state)
            return IntegrationPlan(
                integration_session_id=integration_session_id,
                base_branch=base_branch,
                base_revision=base_revision,
                integration_branch=integration_branch,
                integration_path=integration_path,
                source_session_ids=tuple(reserved),
                source_branches=tuple(branches),
            )
        except Exception:
            for session_id in reserved:
                manager.release_lock(session_id)
            self._release_integration_lock()
            raise

    def finalize_integration(self, manager: SessionManager, plan: IntegrationPlan) -> None:
        """Promote a verified integration branch to base, then retain source worktrees."""
        try:
            self._require_clean_base()
            current_branch = self._current_branch(self.base_workspace)
            current_revision = self._git(self.base_workspace, "rev-parse", "HEAD").strip()
            if current_branch != plan.base_branch or current_revision != plan.base_revision:
                raise GitWorktreeError(
                    "Base branch changed while integration ran. Base was left untouched."
                )
            if self._status_porcelain(plan.integration_path):
                raise GitWorktreeError(
                    "Integration worktree still has uncommitted changes. Base was left untouched."
                )
            for branch in plan.source_branches:
                result = self._git_result(
                    plan.integration_path,
                    "merge-base",
                    "--is-ancestor",
                    branch,
                    plan.integration_branch,
                )
                if result.returncode:
                    raise GitWorktreeError(
                        f"Integration did not include source branch {branch}. Base was left untouched."
                    )
            self._git(self.base_workspace, "merge", "--ff-only", plan.integration_branch)
            for session_id in plan.source_session_ids:
                state = manager.read_session_snapshot(session_id)
                if state.worktree is not None:
                    state.worktree.merge_status = "merged"
                    state.worktree.integration_session_id = plan.integration_session_id
                    manager.flush_session(state)
            # Temporary cleanup is best-effort.  Promotion already succeeded,
            # so a filesystem lock must not report the accepted work as failed.
            with suppress(GitWorktreeError):
                self._remove_successful_integration_worktree(plan)
        except Exception:
            self._mark_integration_failed(manager, plan)
            raise
        finally:
            self._release_reservations(manager, plan)

    def release_failed_integration(self, manager: SessionManager, plan: IntegrationPlan) -> None:
        """Release reservations after the hidden agent fails before promotion."""
        self._mark_integration_failed(manager, plan)
        self._release_reservations(manager, plan)

    def integration_prompt(self, plan: IntegrationPlan) -> str:
        branches = "\n".join(
            f"{index}. `{branch}`" for index, branch in enumerate(plan.source_branches, 1)
        )
        return (
            "Integrate the selected completed session branches into the current integration "
            "worktree. Work only in this worktree; do not change the base worktree or source "
            "worktrees. Merge these branches in this exact order:\n"
            f"{branches}\n\n"
            "For each branch run `git merge --no-ff <branch>`. Resolve every conflict using the "
            "repository's conventions, stage resolutions, and create the merge commit. Run focused "
            "validation when practical. Finish only when `git status --porcelain` is empty and every "
            "listed branch is an ancestor of HEAD. Never reset, force-push, or skip a selected branch."
        )

    @staticmethod
    def sanitize_branch(value: str) -> str:
        candidate = value.strip().replace(" ", "-").replace("\\", "/")
        invalid = set("~^:?*[\\")
        components = candidate.split("/")
        if (
            not candidate
            or candidate == "@"
            or candidate.startswith(("-", "/", "."))
            or candidate.endswith(("/", ".", ".lock"))
            or "//" in candidate
            or ".." in candidate
            or "@{" in candidate
            or any(component.startswith(".") for component in components)
            or any(component.endswith(".lock") for component in components)
            or any(char.isspace() or char in invalid for char in candidate)
        ):
            raise GitWorktreeError(f"Invalid Git branch name: {value!r}")
        return candidate

    def _storage_root(self) -> Path:
        raw = Path(self.storage_subpath)
        if raw.is_absolute() or ".." in raw.parts:
            raise GitWorktreeError("Worktree storage path must stay inside .rotaris.")
        root = (self.base_workspace / ".rotaris" / raw).resolve()
        root.relative_to((self.base_workspace / ".rotaris").resolve())
        return root

    def _integration_root(self) -> Path:
        return self._storage_root() / "integrations"

    def _assert_base_repository(self) -> None:
        top_level = Path(
            self._git(self.base_workspace, "rev-parse", "--show-toplevel").strip()
        ).resolve()
        if top_level != self.base_workspace:
            raise GitWorktreeError("Workspace must be the root of its Git worktree.")

    def _current_branch(self, cwd: Path) -> str:
        branch = self._git(cwd, "symbolic-ref", "--quiet", "--short", "HEAD").strip()
        if not branch:
            raise GitWorktreeError("Detached HEAD cannot host an isolated session or integration.")
        return branch

    def _git_common_dir(self, cwd: Path) -> Path:
        raw = self._git(cwd, "rev-parse", "--git-common-dir").strip()
        return (cwd / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()

    def _status_porcelain(self, cwd: Path) -> str:
        # Session snapshots and managed worktrees live under this control
        # directory. They must not make the base appear user-dirty.
        return self._git(
            cwd,
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--",
            ".",
            ":(exclude).rotaris",
        )

    def _require_clean_base(self) -> None:
        if self._status_porcelain(self.base_workspace):
            raise GitWorktreeError(
                "Base worktree has uncommitted changes. Commit or stash them first."
            )

    @staticmethod
    @traces(SWR.SWR_2437, SWR.SWR_2817)
    def _require_base_not_in_use(
        manager: SessionManager,
        integration_session_id: str,
    ) -> None:
        for session in manager.list_sessions(include_internal=True):
            session_id = str(session.get("session_id") or "")
            if session_id == integration_session_id:
                continue
            if str(session.get("execution_status", "")) not in ACTIVE_EXECUTION_STATUSES:
                continue
            if isinstance(session.get("worktree"), dict):
                continue
            # A session whose process died hard still says "running" for ever,
            # and would otherwise block every future integration in this
            # workspace with nothing the user can do about it from here. Skip
            # it; correcting the status is left to the explicit repair path
            # (``rotaris_core.session.recovery``), because a precondition check
            # has no business rewriting state on disk.
            if not manager.is_session_live(session_id):
                continue
            raise GitWorktreeError(
                "A session is still running in the base worktree. Finish it before integrating."
            )

    def _commit_pending_changes(self, worktree: Path, session_id: str) -> None:
        if not self._status_porcelain(worktree):
            return
        self._git(worktree, "add", "-A")
        message = f"Rotaris: accept session {session_id} worktree changes"
        self._git(
            worktree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            message,
        )

    def _mark_integration_failed(self, manager: SessionManager, plan: IntegrationPlan) -> None:
        for session_id in plan.source_session_ids:
            with suppress(FileNotFoundError, ValueError):
                state = manager.read_session_snapshot(session_id)
                if state.worktree is not None:
                    state.worktree.merge_status = "merge_failed"
                    state.worktree.integration_session_id = plan.integration_session_id
                    manager.flush_session(state)

    def _remove_successful_integration_worktree(self, plan: IntegrationPlan) -> None:
        self._git(self.base_workspace, "worktree", "remove", str(plan.integration_path))
        self._git(self.base_workspace, "branch", "-D", plan.integration_branch)

    def _release_reservations(self, manager: SessionManager, plan: IntegrationPlan) -> None:
        for session_id in plan.source_session_ids:
            manager.release_lock(session_id)
        self._release_integration_lock()

    def _integration_lock_path(self) -> Path:
        return self.base_workspace / ".rotaris" / self._LOCK_FILENAME

    def _acquire_integration_lock(self, session_id: str) -> None:
        path = self._integration_lock_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(2):
            try:
                descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError as exc:
                if self._remove_stale_integration_lock(path):
                    continue
                raise GitWorktreeError("Another worktree integration is already running.") from exc
            break
        else:
            raise GitWorktreeError("Could not acquire worktree integration lock.")
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "session_id": session_id,
                    "pid": os.getpid(),
                    "started_at": dt.datetime.now(dt.UTC).isoformat(),
                },
                handle,
            )

    @staticmethod
    def _remove_stale_integration_lock(path: Path) -> bool:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            pid = int(payload["pid"])
        except (FileNotFoundError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            pid = None
        if pid is not None and pid_is_alive(pid):
            return False
        with suppress(FileNotFoundError):
            path.unlink()
        return True

    def _release_integration_lock(self) -> None:
        with suppress(FileNotFoundError):
            self._integration_lock_path().unlink()

    @traces(SWR.SWR_3418)
    def _git(self, cwd: Path, *args: str) -> str:
        """Run git and return its output, or raise with what it refused.

        Git's text is passed through unchanged, with exactly one exception: a
        refusal caused by the platform's path limit is re-headed in Rotaris'
        words (SWR-3418). That failure is about where the workspace lives, and
        git's own wording sends the user to git rather than to the two settings
        that fix it.
        """
        result = self._git_result(cwd, *args)
        if result.returncode:
            detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
            if _is_path_too_long(detail):
                raise GitWorktreeError(
                    _path_limit_message(detail, workspace=self.base_workspace),
                )
            raise GitWorktreeError(detail)
        return result.stdout

    @staticmethod
    def _git_result(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                ["git", *args],
                cwd=cwd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
                check=False,
            )
        except OSError as exc:
            raise GitWorktreeError(f"Could not run Git: {exc}") from exc
