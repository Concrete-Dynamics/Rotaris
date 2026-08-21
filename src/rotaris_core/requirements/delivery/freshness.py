"""What the repository did since a verification — the facts SWR-3209 reads.

:func:`~rotaris_core.requirements.delivery.staleness.evaluate_freshness` is pure
and takes its repository facts as data, *"gathered by a caller with filesystem
and git access"*. This module is that caller. It answers two questions about one
verified commit and nothing else:

```text
changed_since(commit)   which repository-relative paths moved since then
is_ancestor(commit)     whether that commit is still reachable from HEAD
```

**One git call per distinct commit, never one per requirement.** After an
adoption, a thousand requirements share a single verified commit, and asking git
once per card would put a thousand subprocesses on a board read — which is not a
tuning problem but the difference between a board that opens and one that does
not (SWR-3317). Both answers are therefore memoised on the commit, and the cache
lives for one evaluation pass rather than for the process: a source built per
pass cannot serve an answer from before the merge that just happened.

Every failure answers *"unknown"* rather than raising, and unknown is not
``False``. A repository without git, a commit pruned by a gc, a timeout — none of
them is evidence that a verification's commit was rewritten, and reporting one as
such would mark every requirement in the workspace stale for a reason that never
occurred.
"""

from __future__ import annotations

import logging
import subprocess
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

_log = logging.getLogger(__name__)

__all__ = [
    "FreshnessSource",
    "GitFreshness",
    "NoFreshness",
]

#: Long enough for a `diff --name-only` over a large history, short enough that a
#: hung git cannot freeze an evaluation pass.
_GIT_TIMEOUT_S = 20.0


@runtime_checkable
class FreshnessSource(Protocol):
    """The repository facts one verification's freshness is judged against.

    A port, so the evidence reader stays testable without a repository and a
    workspace kept outside git still projects rather than failing.
    """

    def changed_since(self, commit: str) -> frozenset[str]:
        """Repository-relative posix paths that changed between *commit* and HEAD."""
        ...

    def is_ancestor(self, commit: str) -> bool | None:
        """Whether *commit* is still reachable from HEAD. ``None`` when unknown."""
        ...


@traces(SWR.SWR_3209)
class NoFreshness:
    """The answer for a workspace nobody can ask: nothing changed, ancestry unknown.

    Not a stub with a shrug in it. A workspace that is not a git checkout really
    has no commits to have moved between, and its verification really cannot be
    shown to have been rewritten — so "no changed paths" and "unknown ancestry"
    are the true answers rather than placeholders. The evidence stays as fresh as
    the day it was measured, which is the only claim the facts support.
    """

    def changed_since(self, commit: str) -> frozenset[str]:  # noqa: ARG002 - port shape
        """Nothing, because nothing here can tell."""
        return frozenset()

    def is_ancestor(self, commit: str) -> bool | None:  # noqa: ARG002 - port shape
        """``None`` — unknown, which SWR-3209 keeps distinct from ``False``."""
        return None


@traces(SWR.SWR_3209)
class GitFreshness:
    """The two questions, asked of git once per commit and remembered.

    Built per evaluation pass. The memo is the point: it turns "how stale is each
    of a thousand requirements" into one `git diff` per *distinct* verified
    commit, and after an adoption there is exactly one.
    """

    def __init__(self, repo_root: Path, *, git: str = "git") -> None:
        self._repo_root = repo_root
        self._git = git
        self._changed: dict[str, frozenset[str]] = {}
        self._ancestry: dict[str, bool | None] = {}

    @classmethod
    def for_repo(cls, repo_root: Path, *, git: str = "git") -> Self | None:
        """A source for *repo_root*, or ``None`` when it is not a git checkout.

        Checked on the ``.git`` entry, which is a file in a worktree and a
        directory in a clone, so a worktree is not mistaken for an unversioned
        project.
        """
        if not (repo_root / ".git").exists():
            return None
        return cls(repo_root, git=git)

    @property
    def calls(self) -> int:
        """How many commits have been asked about — what a guard test counts."""
        return len(self._changed) + len(self._ancestry)

    def changed_since(self, commit: str) -> frozenset[str]:
        """``git diff --name-only <commit>..HEAD``, memoised on *commit*."""
        cleaned = commit.strip()
        if not cleaned:
            return frozenset()
        cached = self._changed.get(cleaned)
        if cached is not None:
            return cached
        result = self._run("diff", "--name-only", f"{cleaned}..HEAD")
        lines = result.splitlines() if result is not None else []
        paths = frozenset(line.strip().replace("\\", "/") for line in lines if line.strip())
        self._changed[cleaned] = paths
        return paths

    def is_ancestor(self, commit: str) -> bool | None:
        """``git merge-base --is-ancestor <commit> HEAD``, memoised on *commit*.

        Three answers, and the third is why this returns an optional. ``0`` is
        "still reachable" and ``1`` is "not reachable" — the rebased-away case
        SWR-3209 asks for. **Every other exit code is ``None``**: git returns
        ``128`` for a commit it cannot resolve at all, and reading that as "not
        an ancestor" would mark a requirement stale because the repository was
        pruned rather than because anything moved.
        """
        cleaned = commit.strip()
        if not cleaned:
            return None
        if cleaned in self._ancestry:
            return self._ancestry[cleaned]
        answer = self._exit_code("merge-base", "--is-ancestor", cleaned, "HEAD")
        verdict = {0: True, 1: False}.get(answer) if answer is not None else None
        self._ancestry[cleaned] = verdict
        return verdict

    # -- the one place this module talks to git -----------------------------

    def _run(self, *args: str) -> str | None:
        completed = self._invoke(*args)
        if completed is None or completed.returncode != 0:
            return None
        return completed.stdout.decode("utf-8", errors="replace")

    def _exit_code(self, *args: str) -> int | None:
        completed = self._invoke(*args)
        return None if completed is None else completed.returncode

    def _invoke(self, *args: str) -> subprocess.CompletedProcess[bytes] | None:
        try:
            return subprocess.run(  # noqa: S603 - fixed argv, no shell, explicit path
                [self._git, "-C", str(self._repo_root), *args],
                capture_output=True,
                check=False,
                timeout=_GIT_TIMEOUT_S,
            )
        except (OSError, subprocess.SubprocessError) as error:
            _log.warning("Could not ask git %s: %s", " ".join(args), error)
            return None
