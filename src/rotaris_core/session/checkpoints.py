"""Out-of-branch Git checkpoints of a session working tree.

The engine records the working tree as a commit object under
``refs/rotaris/checkpoints/`` without ever touching the user's branch, index,
reflog or stash. Every index-writing command runs against a throwaway index
file supplied through ``GIT_INDEX_FILE``, so ``.git/index`` is never written.

This module is deliberately free of Rotaris configuration, session state and
agent code: everything it needs arrives as an explicit parameter, so it can be
exercised against a bare Git repository.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping

CHECKPOINT_REF_PREFIX = "refs/rotaris/checkpoints"

# Session snapshots, managed worktrees and locks live under this control
# directory. A checkpoint must never capture or restore them.
_EXCLUDE_ROTARIS = ":(exclude).rotaris"

# Never write a reflog entry, never let a plumbing call trigger a repack.
_HYGIENE_ARGS: tuple[str, ...] = ("-c", "gc.auto=0", "-c", "core.logAllRefUpdates=false")

# The user's Git identity is neither required nor consulted for checkpoints.
_IDENTITY_ARGS: tuple[str, ...] = ("-c", "user.name=rotaris", "-c", "user.email=rotaris@local")

# Ref lookups and updates are cheap; walking a large working tree is not.
_QUICK_TIMEOUT = 30.0
_TREE_TIMEOUT = 300.0

_REF_SAFE_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")


class CheckpointError(RuntimeError):
    """A checkpoint Git operation failed without changing the user's branch."""


@dataclass(frozen=True, slots=True)
class CheckpointRef:
    """A recorded checkpoint: its ref, its commit object and its position."""

    ref: str
    commit: str
    session_id: str
    sequence: int


@dataclass(frozen=True, slots=True)
class CheckpointDiffEntry:
    """One path that differs between a checkpoint and the current working tree.

    ``status`` is expressed relative to the checkpoint, exactly like
    ``git diff <commit>``:

    * ``"A"`` — the path exists now but not in the checkpoint; a restore removes it.
    * ``"D"`` — the path is in the checkpoint but missing now; a restore recreates it.
    * ``"M"`` — the contents differ; a restore rewrites it.
    * ``"R"`` — the path was renamed since the checkpoint; a restore renames it back.
    """

    path: str
    status: str


@traces(SWR.SWR_2436)
class CheckpointEngine:
    """Records and restores working-tree snapshots outside the user's branch."""

    def __init__(self, tree_root: Path) -> None:
        self._tree_root = Path(tree_root)
        self._work_dir: Path | None = None

    @property
    def tree_root(self) -> Path:
        """The path the engine was pointed at."""
        return self._tree_root

    @property
    def available(self) -> bool:
        """True when Git is runnable and ``tree_root`` sits inside a working tree."""
        # _resolve_work_dir swallows a missing Git binary and a missing path.
        return self._resolve_work_dir() is not None

    def changed_paths(self) -> tuple[str, ...]:
        """Paths that differ from ``HEAD``, ignoring ``.rotaris`` and ignored files."""
        raw = self._git(
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "-z",
            "--",
            ".",
            _EXCLUDE_ROTARIS,
            timeout=_TREE_TIMEOUT,
        )
        return _parse_status_z(raw)

    def create(
        self,
        *,
        session_id: str,
        sequence: int,
        message: str,
        include_untracked: bool = True,
    ) -> CheckpointRef | None:
        """Record the working tree as a checkpoint commit; ``None`` when it is clean.

        Raises:
            CheckpointError: Git is unavailable or refused a plumbing command.
        """
        ref = self._ref_name(session_id, sequence)
        head = self._head_commit()
        with self._temp_index() as index_path:
            env = self._index_env(index_path)
            self._stage_working_tree(env, head=head, include_untracked=include_untracked)
            tree = self._git("write-tree", env=env, timeout=_TREE_TIMEOUT).strip()

        if head is None:
            # No commit to compare against: an empty tree means an empty workspace.
            if not self._git("ls-tree", "--name-only", tree).strip():
                return None
        elif tree == self._head_tree():
            return None

        parent_args = ("-p", head) if head is not None else ()
        commit = self._git(
            *_IDENTITY_ARGS,
            "commit-tree",
            tree,
            *parent_args,
            "-m",
            message,
        ).strip()
        if not commit:
            raise CheckpointError("Git produced no checkpoint commit object.")
        self._git("update-ref", ref, commit)
        return CheckpointRef(ref=ref, commit=commit, session_id=session_id, sequence=sequence)

    def list_refs(self, session_id: str) -> tuple[CheckpointRef, ...]:
        """Every checkpoint recorded for a session, ascending by sequence number."""
        prefix = f"{self._session_prefix(session_id)}/"
        raw = self._git(
            "for-each-ref",
            "--format=%(refname) %(objectname)",
            self._session_prefix(session_id),
        )
        found: list[CheckpointRef] = []
        for line in raw.splitlines():
            name, _, commit = line.strip().partition(" ")
            if not name.startswith(prefix) or not commit:
                continue
            suffix = name[len(prefix) :]
            if not suffix.isdigit():
                continue
            found.append(
                CheckpointRef(
                    ref=name,
                    commit=commit,
                    session_id=session_id,
                    sequence=int(suffix),
                )
            )
        # Refs sort lexically in Git, so sequence 10 would land between 1 and 2.
        return tuple(sorted(found, key=lambda entry: entry.sequence))

    def resolve(self, session_id: str, sequence: int) -> CheckpointRef | None:
        """The checkpoint recorded for ``sequence``, or ``None`` when it is gone."""
        ref = self._ref_name(session_id, sequence)
        result = self._git_result("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
        commit = result.stdout.strip()
        if result.returncode != 0 or not commit:
            return None
        return CheckpointRef(ref=ref, commit=commit, session_id=session_id, sequence=sequence)

    def files_in(self, ref: CheckpointRef) -> tuple[str, ...]:
        """Paths the checkpoint changed relative to the commit it was taken on."""
        raw = self._git(
            "diff-tree",
            "-r",
            "--root",
            "--no-commit-id",
            "--name-only",
            "-z",
            ref.commit,
            timeout=_TREE_TIMEOUT,
        )
        return tuple(field for field in raw.split("\0") if field)

    def diff_summary(self, ref: CheckpointRef) -> tuple[CheckpointDiffEntry, ...]:
        """What a restore of ``ref`` would change in the current working tree."""
        return self._diff_against_tree(ref.commit, detect_renames=True)

    def restore(self, ref: CheckpointRef) -> tuple[str, ...]:
        """Return the working tree to ``ref`` and report the paths it touched.

        Raises:
            CheckpointError: Git is unavailable or refused a plumbing command.
        """
        touched = tuple(
            entry.path for entry in self._diff_against_tree(ref.commit, detect_renames=False)
        )
        head = self._head_commit()
        with self._temp_index() as index_path:
            env = self._index_env(index_path)
            # Load-bearing: ``read-tree --reset -u`` only deletes working-tree
            # files recorded in the *old* index, so the temp index must first
            # describe the tree as it is right now.
            self._stage_working_tree(env, head=head)
            self._git("read-tree", "--reset", "-u", ref.commit, env=env, timeout=_TREE_TIMEOUT)
        return touched

    def prune(self, session_id: str, *, keep: int) -> int:
        """Delete all but the newest ``keep`` checkpoints; return how many went.

        Raises:
            CheckpointError: Git is unavailable or refused a plumbing command.
        """
        refs = self.list_refs(session_id)
        doomed = refs if keep <= 0 else refs[: max(len(refs) - keep, 0)]
        return self._delete(doomed)

    def delete_all(self, session_id: str) -> int:
        """Delete every checkpoint of a session; return how many went.

        Raises:
            CheckpointError: Git is unavailable or refused a plumbing command.
        """
        return self._delete(self.list_refs(session_id))

    # -- internals ---------------------------------------------------------

    def _stage_working_tree(
        self,
        env: Mapping[str, str],
        *,
        head: str | None,
        include_untracked: bool = True,
    ) -> None:
        """Fill the throwaway index from the current tree, minus Rotaris control data.

        The index is seeded from ``HEAD`` first so it behaves exactly like the
        user's real index: tracked-but-ignored files stay tracked, and ``add -u``
        has the baseline it needs.

        ``git add`` refuses an ``:(exclude)`` pathspec that names a gitignored
        directory, so the control directory is dropped from the index afterwards
        instead. That also covers workspaces where ``.rotaris`` is *not* ignored.
        """
        if head is not None:
            self._git("read-tree", head, env=env, timeout=_TREE_TIMEOUT)
        add_flag = "-A" if include_untracked else "-u"
        self._git("add", add_flag, "--", ".", env=env, timeout=_TREE_TIMEOUT)
        self._git(
            "rm",
            "--cached",
            "--force",
            "--quiet",
            "-r",
            "--ignore-unmatch",
            "--",
            ".rotaris",
            env=env,
            timeout=_TREE_TIMEOUT,
        )

    def _delete(self, refs: tuple[CheckpointRef, ...]) -> int:
        for entry in refs:
            self._git("update-ref", "-d", entry.ref, entry.commit)
        return len(refs)

    def _diff_against_tree(
        self, commit: str, *, detect_renames: bool
    ) -> tuple[CheckpointDiffEntry, ...]:
        rename_args = ("-M",) if detect_renames else ("--no-renames",)
        head = self._head_commit()
        with self._temp_index() as index_path:
            env = self._index_env(index_path)
            self._stage_working_tree(env, head=head)
            # Both sides already exclude .rotaris, so no pathspec is needed here.
            raw = self._git(
                "diff-index",
                "--cached",
                "--name-status",
                "-z",
                *rename_args,
                commit,
                env=env,
                timeout=_TREE_TIMEOUT,
            )
        return _parse_name_status_z(raw)

    def _head_commit(self) -> str | None:
        result = self._git_result("rev-parse", "--verify", "--quiet", "HEAD")
        if result.returncode != 0:
            return None
        return result.stdout.strip() or None

    def _head_tree(self) -> str:
        return self._git("rev-parse", "--verify", "HEAD^{tree}").strip()

    @classmethod
    def _ref_name(cls, session_id: str, sequence: int) -> str:
        if sequence < 0:
            raise CheckpointError(f"Checkpoint sequence must not be negative: {sequence}")
        return f"{cls._session_prefix(session_id)}/{sequence}"

    @staticmethod
    def _session_prefix(session_id: str) -> str:
        unsafe = (
            not session_id
            or not _REF_SAFE_CHARS.issuperset(session_id)
            or session_id.startswith(".")
            or session_id.endswith(".lock")
        )
        if unsafe:
            raise CheckpointError(f"Session id is not usable in a Git ref name: {session_id!r}")
        return f"{CHECKPOINT_REF_PREFIX}/{session_id}"

    @contextmanager
    def _temp_index(self) -> Iterator[Path]:
        """A private index file that Git may create, well outside the repository."""
        directory = tempfile.mkdtemp(prefix="rotaris-checkpoint-")
        try:
            # The file must not exist yet: Git treats a present-but-empty index
            # file as a corrupt index on some versions.
            yield Path(directory) / "index"
        finally:
            shutil.rmtree(directory, ignore_errors=True)

    @staticmethod
    def _index_env(index_path: Path) -> dict[str, str]:
        environment = dict(os.environ)
        # POSIX separators keep Git for Windows from re-interpreting backslashes.
        environment["GIT_INDEX_FILE"] = index_path.as_posix()
        return environment

    def _resolve_work_dir(self) -> Path | None:
        if self._work_dir is not None:
            return self._work_dir
        try:
            result = self._run(
                ["git", "rev-parse", "--show-toplevel"],
                cwd=self._tree_root,
                env=None,
                timeout=_QUICK_TIMEOUT,
            )
        except CheckpointError:
            return None
        top_level = result.stdout.strip()
        if result.returncode != 0 or not top_level:
            return None
        self._work_dir = Path(top_level)
        return self._work_dir

    def _require_work_dir(self) -> Path:
        work_dir = self._resolve_work_dir()
        if work_dir is None:
            raise CheckpointError(f"{self._tree_root} is not inside a usable Git working tree.")
        return work_dir

    def _git(
        self,
        *args: str,
        env: Mapping[str, str] | None = None,
        timeout: float = _QUICK_TIMEOUT,
    ) -> str:
        result = self._git_result(*args, env=env, timeout=timeout)
        if result.returncode:
            detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
            raise CheckpointError(detail)
        return result.stdout

    def _git_result(
        self,
        *args: str,
        env: Mapping[str, str] | None = None,
        timeout: float = _QUICK_TIMEOUT,
    ) -> subprocess.CompletedProcess[str]:
        work_dir = self._require_work_dir()
        if env is not None:
            environment = dict(env)
        else:
            environment = dict(os.environ)
            # An inherited GIT_INDEX_FILE (Rotaris launched from a Git hook)
            # must not silently redirect a command that expects the real index.
            environment.pop("GIT_INDEX_FILE", None)
        # Stop Git from opportunistically refreshing the user's real index.
        environment["GIT_OPTIONAL_LOCKS"] = "0"
        return self._run(
            ["git", *_HYGIENE_ARGS, *args],
            cwd=work_dir,
            env=environment,
            timeout=timeout,
        )

    @staticmethod
    def _run(
        argv: list[str],
        *,
        cwd: Path,
        env: Mapping[str, str] | None,
        timeout: float,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                argv,
                cwd=cwd,
                env=dict(env) if env is not None else None,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise CheckpointError(f"Git timed out after {timeout:.0f}s: {' '.join(argv)}") from exc
        except OSError as exc:
            raise CheckpointError(f"Could not run Git: {exc}") from exc


def _parse_status_z(raw: str) -> tuple[str, ...]:
    """Paths out of ``git status --porcelain=v1 -z`` (renames carry a second field)."""
    fields = raw.split("\0")
    paths: list[str] = []
    index = 0
    while index < len(fields):
        entry = fields[index]
        index += 1
        if len(entry) < 4:
            continue
        code = entry[:2]
        paths.append(entry[3:])
        if "R" in code or "C" in code:
            index += 1
    return tuple(paths)


def _parse_name_status_z(raw: str) -> tuple[CheckpointDiffEntry, ...]:
    """Entries out of ``git diff-index --name-status -z`` (status, then path(s))."""
    fields = [field for field in raw.split("\0") if field]
    entries: list[CheckpointDiffEntry] = []
    index = 0
    while index + 1 < len(fields):
        code = fields[index]
        letter = code[0]
        index += 1
        if letter in {"R", "C"}:
            # ``<code>\0<source>\0<destination>``; the destination is the path
            # a restore would move back.
            if index + 1 >= len(fields):
                break
            entries.append(CheckpointDiffEntry(path=fields[index + 1], status=letter))
            index += 2
            continue
        entries.append(CheckpointDiffEntry(path=fields[index], status=letter))
        index += 1
    return tuple(entries)
