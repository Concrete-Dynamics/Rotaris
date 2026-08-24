"""Read-only-by-default Git adapter for the desktop store."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.subprocess_utils import hidden_process_kwargs

from rotaris.models.state import CommitInfo, NoticeSeverity, UiNotice, WorktreeInfo

if TYPE_CHECKING:
    from rotaris.models.store import WorkspaceStore

#: What a caller is told when git itself cannot be asked — not installed, not on
#: ``PATH``, or it never answered. Distinct from "git said no", which is an
#: answer this adapter turns into an empty value.
GIT_UNAVAILABLE = "Git is not available on this machine, so there is nothing to read or change."

#: The one notice the Git view raises about itself. Fixed rather than sequential,
#: so re-reading a workspace that still has no git replaces the notice instead of
#: stacking a new one behind it on every refresh.
GIT_UNAVAILABLE_NOTICE = "git-unavailable"

#: What Rotaris keeps in a workspace, and the one line
#: :meth:`GitService.prepare_repository` adds to a project's ``.gitignore``.
ROTARIS_IGNORE = ".rotaris/"

#: The message on the commit that offer creates. Ordinary on purpose: it is the
#: user's history, and a first commit announcing which tool made it is noise they
#: cannot remove without rewriting it.
INITIAL_COMMIT_MESSAGE = "Initial commit"

#: The notice action that runs :meth:`GitService.prepare_repository`. Raised on
#: the requirements area's own banner — the one surface that offers it — and
#: dispatched by ``RequirementsController._action``, which is also where the
#: notice carrying it is written. The window knows nothing about it (SWR-3315).
GIT_SETUP_ACTION = "git.setup"


@traces(SWR.SWR_2005, SWR.SWR_2405, SWR.SWR_3727)
class GitService:
    def __init__(self, workspace: Path, store: WorkspaceStore) -> None:
        self.workspace = workspace
        self.store = store

    @traces(SWR.SWR_2005, SWR.SWR_2405, SWR.SWR_3727)
    def refresh(self) -> None:
        """Read this workspace's git state into the store. Never raises.

        Startup calls this through ``GitRefreshBridge`` after the window paints,
        while user-requested Git mutations call it at their existing boundary.
        Every failure here remains a value: no git on the machine, a folder that
        is not a repository, and a repository whose branch has no commits yet are
        ordinary states.

        Git is asked whether it can answer rather than the filesystem being asked
        whether ``.git`` is there. The two are not the same question: a workspace
        can hold a perfectly good ``.git`` on a machine with no git installed,
        and that combination is what used to reach ``subprocess`` and raise
        ``FileNotFoundError`` out of a window constructor.
        """
        if not self._ok("rev-parse", "--git-dir"):
            self.store.branch = ""
            self.store.ahead = self.store.behind = 0
            self.store.worktrees = []
            self.store.commits = []
            self._announce_unavailable()
            self.store.git_changed.emit()
            return
        self.store.branch = self._run("branch", "--show-current").strip()
        self.store.ahead, self.store.behind = self._ahead_behind()
        self.store.worktrees = self._worktrees()
        self._associate_sessions(self.store.worktrees)
        self.store.commits = self._commits()
        additions, deletions, files = self._diff_stats()
        self.store.kpis.files_touched = files
        self.store.kpis.uncommitted = len(
            [line for line in self._run("status", "--porcelain=v1").splitlines() if line]
        )
        base = self._base_branch()
        for tree in self.store.worktrees:
            if tree.is_base:
                tree.additions = additions
                tree.deletions = deletions
                tree.files_touched = files
            else:
                ba, bd, bf = self._branch_diff_stats(tree.branch, base)
                if tree.active:
                    tree.additions = additions + ba
                    tree.deletions = deletions + bd
                    tree.files_touched = files + bf
                else:
                    tree.additions = ba
                    tree.deletions = bd
                    tree.files_touched = bf
        self.store.git_changed.emit()

    def create_worktree(self, path: Path, branch: str, *, base: str = "HEAD") -> None:
        if not branch or branch.startswith("-") or any(ch.isspace() for ch in branch):
            raise ValueError("Branch must be a non-empty Git ref without whitespace.")
        resolved = path.expanduser().resolve()
        if resolved.exists() and any(resolved.iterdir()):
            raise ValueError(f"Worktree path is not empty: {resolved}")
        self._run("worktree", "add", "-b", branch, str(resolved), base, check=True)
        self.refresh()

    @traces(SWR.SWR_2405)
    def delete_worktree(self, path: Path, *, force: bool = False) -> None:
        """Remove a Git worktree."""
        resolved = path.expanduser().resolve()
        args = ["worktree", "remove"]
        if force:
            args.append("--force")
        args.append(str(resolved))
        self._run(*args, check=True)
        self.refresh()

    def can_prepare(self) -> bool:
        """Whether offering :meth:`prepare_repository` would be honest.

        Only the presence of git, because that is the only precondition the offer
        cannot create for itself: it makes the repository and it makes the
        commit, but it cannot install the program that does either. Offering a
        button that answers a machine's missing git with git is the kind of dead
        end this whole change exists to remove.
        """
        return self._installed()

    @traces(SWR.SWR_2005, SWR.SWR_2405)
    def prepare_repository(self) -> str:
        """Make this workspace a repository with a commit in it. Answers what it did.

        The one write on this adapter a user reaches from a notice rather than
        from the Git view, and the only one that creates a commit. It is offered
        because the alternative Rotaris had was to state a precondition and leave
        the user to satisfy it in a terminal — for the two commands that are the
        same on every project on earth.

        Three steps, each skipped when it is already true, so pressing the offer
        twice is not a second commit:

        1. ``git init`` when this is not a repository yet.
        2. ``.rotaris/`` added to ``.gitignore``. Rotaris keeps its sessions, its
           delivery records and its worktrees in there; a first commit that swept
           them in would put this product's bookkeeping into the user's history
           forever, and it is the one ignore rule using Rotaris actually creates.
           An existing ``.gitignore`` is appended to, never rewritten.
        3. ``git add -A`` and one commit. Everything the project already contains,
           which is what "initial commit" means — and why the offer that leads
           here says so before it is pressed rather than after.

        Raises :class:`RuntimeError` with git's own words if any step fails; the
        caller shows it. Nothing here pushes, and nothing here touches a remote.
        """
        if not self._installed():
            raise RuntimeError(GIT_UNAVAILABLE)
        if not self._ok("rev-parse", "--git-dir"):
            self._run("init", check=True)
        self._require_identity()
        added = self._ignore_rotaris_state()
        self._run("add", "-A", check=True)
        if not self._run("status", "--porcelain=v1").strip():
            raise RuntimeError(
                "There is nothing to commit yet — this folder is empty apart from"
                " what Rotaris keeps for itself. Add a file, then try again.",
            )
        self._run("commit", "-m", INITIAL_COMMIT_MESSAGE, check=True)
        self.refresh()
        return f"Committed everything in this folder as “{INITIAL_COMMIT_MESSAGE}”." + (
            f" {ROTARIS_IGNORE!r} was added to .gitignore." if added else ""
        )

    def _require_identity(self) -> None:
        """Refuse before writing anything if git has no author to attribute to.

        Asked *first*, because the alternative is discovering it after
        ``.gitignore`` has been written and everything staged — a half-finished
        setup, and git's own answer for it ("Please tell me who you are") arriving
        as the failure of a button labelled "Set up Git here".

        Rotaris does not invent an identity. A commit is signed with a person's
        name, and a product that quietly attributed one to ``rotaris@localhost``
        would be putting words in their history.
        """
        if self._run("config", "user.email").strip() and self._run("config", "user.name").strip():
            return
        raise RuntimeError(
            "Git does not know who you are yet, so it cannot make a commit. Set that"
            " once, from anywhere:\n\n"
            '    git config --global user.name "Your Name"\n'
            '    git config --global user.email "you@example.com"\n\n'
            "Then take this offer again.",
        )

    def _ignore_rotaris_state(self) -> bool:
        """Ensure ``.gitignore`` ignores Rotaris' own workspace state. Did it change?

        Appended to rather than written over: the file is the user's, it may
        already carry rules this product knows nothing about, and losing one of
        them to add a line of our own would be a poor trade for a convenience.
        """
        path = self.workspace / ".gitignore"
        try:
            existing = path.read_text(encoding="utf-8") if path.exists() else ""
        except OSError as exc:
            raise RuntimeError(f"Could not read {path}: {exc}") from exc
        if any(line.strip() == ROTARIS_IGNORE for line in existing.splitlines()):
            return False
        block = "" if not existing or existing.endswith("\n") else "\n"
        block += f"\n# Rotaris keeps its sessions and delivery records here.\n{ROTARIS_IGNORE}\n"
        try:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(block)
        except OSError as exc:
            raise RuntimeError(f"Could not write {path}: {exc}") from exc
        return True

    @traces(SWR.SWR_2405)
    def _announce_unavailable(self) -> None:
        """Say that git is out, and that Rotaris is not.

        The distinction the notice draws is the whole of it: what is unavailable
        is *history and worktrees*, not the product. A workspace with no git is a
        workspace Rotaris reads, edits and runs in; it simply does each unit of
        work in place rather than in a tree of its own. Saying nothing would be
        worse than saying this — an empty Git view with no explanation reads as a
        product that failed, which is exactly what a user concludes when the
        alternative they last saw was a traceback.

        Not raised for a machine that has git and a folder that is merely not a
        repository: "you have not run ``git init``" is not news, and a notice on
        every plain directory is the alarm this surface already publishes too
        much of.
        """
        if self._installed():
            return
        self.store.publish_notice(
            UiNotice(
                id=GIT_UNAVAILABLE_NOTICE,
                severity=NoticeSeverity.INFO,
                title="Working without Git",
                message=(
                    "Git is not installed or not on PATH, so this workspace has no history"
                    " and no worktrees. Everything else works, and Rotaris makes its changes"
                    " in place instead of in a worktree of its own."
                ),
                persistent=True,
            ),
        )

    def _installed(self) -> bool:
        """Whether git can be run at all, independently of any workspace.

        ``--version`` because it is the one git command that answers from
        anywhere: it needs no repository, no configuration and no network, so a
        ``False`` here means the binary, not the folder.
        """
        try:
            subprocess.run(
                ["git", "--version"],
                capture_output=True,
                timeout=15,
                check=True,
                **hidden_process_kwargs(),
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return True

    def _ahead_behind(self) -> tuple[int, int]:
        try:
            raw = self._run("rev-list", "--left-right", "--count", "HEAD...@{upstream}")
            ahead, behind = raw.strip().split()
            return int(ahead), int(behind)
        except (RuntimeError, ValueError):
            return 0, 0

    def _worktrees(self) -> list[WorktreeInfo]:
        raw = self._run("worktree", "list", "--porcelain", "-z")
        records: list[dict[str, str]] = []
        current: dict[str, str] = {}
        for field in raw.split("\0"):
            if not field:
                if current:
                    records.append(current)
                    current = {}
                continue
            key, _, value = field.partition(" ")
            if key == "worktree" and current:
                records.append(current)
                current = {}
            current[key] = value
        if current:
            records.append(current)
        workspace = self.workspace.resolve()
        out: list[WorktreeInfo] = []
        for record in records:
            path = Path(record.get("worktree", ""))
            branch_ref = record.get("branch", "")
            branch = branch_ref.removeprefix("refs/heads/") or "detached"
            active = path.resolve() == workspace
            out.append(
                WorktreeInfo(
                    branch=branch,
                    path=str(path),
                    ahead=self.store.ahead if active else 0,
                    behind=self.store.behind if active else 0,
                    is_base=branch in {"main", "master"},
                    active=active,
                )
            )
        return out

    def _associate_sessions(self, worktrees: list[WorktreeInfo]) -> None:
        """Join persisted session worktree bindings onto Git's live worktree list."""
        try:
            from rotaris_core.session.manager import SessionManager

            sessions = SessionManager(self.workspace).list_sessions()
        except (OSError, ValueError):
            return
        by_path: dict[Path, dict[str, object]] = {}
        for session in sessions:
            binding = session.get("worktree")
            if not isinstance(binding, dict) or not binding.get("path"):
                continue
            try:
                by_path[Path(str(binding["path"])).resolve()] = session
            except OSError:
                continue
        for worktree in worktrees:
            matched_session = by_path.get(Path(worktree.path).resolve())
            if matched_session is None:
                continue
            worktree.session = str(matched_session.get("session_id", ""))
            worktree.session_status = str(matched_session.get("execution_status", "idle"))
            binding = matched_session.get("worktree")
            if isinstance(binding, dict):
                worktree.merge_status = str(binding.get("merge_status", "ready"))

    def _commits(self) -> list[CommitInfo]:
        raw = self._run(
            "log",
            "-30",
            "--date=relative",
            "--pretty=format:%h%x1f%s%x1f%an%x1f%ar%x1e",
        )
        commits: list[CommitInfo] = []
        for record in raw.split("\x1e"):
            fields = record.strip().split("\x1f")
            if len(fields) != 4:
                continue
            commits.append(
                CommitInfo(
                    fields[0], fields[1], fields[2], fields[3], len(commits) < self.store.ahead
                )
            )
        return commits

    def _diff_stats(self) -> tuple[int, int, int]:
        additions = deletions = files = 0
        raw = self._run("diff", "--numstat", "HEAD")
        for line in raw.splitlines():
            fields = line.split("\t", 2)
            if len(fields) != 3:
                continue
            files += 1
            if fields[0].isdigit():
                additions += int(fields[0])
            if fields[1].isdigit():
                deletions += int(fields[1])
        return additions, deletions, files

    def _base_branch(self) -> str:
        """Return the name of the base branch (main or master)."""
        for tree in self.store.worktrees:
            if tree.is_base:
                return tree.branch
        return "main"

    def _branch_diff_stats(self, branch: str, base: str) -> tuple[int, int, int]:
        """Committed additions/deletions/files on *branch* since diverging from *base*.

        Uses triple-dot (``base...branch``) to count only commits reachable from
        *branch* but not from *base* — i.e. the work done on this branch."""
        additions = deletions = files = 0
        raw = self._run("diff", "--numstat", f"{base}...{branch}")
        for line in raw.splitlines():
            fields = line.split("\t", 2)
            if len(fields) != 3:
                continue
            files += 1
            if fields[0].isdigit():
                additions += int(fields[0])
            if fields[1].isdigit():
                deletions += int(fields[1])
        return additions, deletions, files

    def _ok(self, *args: str) -> bool:
        try:
            self._run(*args, check=True)
        except RuntimeError:
            return False
        return True

    def _run(self, *args: str, check: bool = False) -> str:
        """One git command. ``""`` when git will not answer, unless *check*.

        A read that git refuses is an answer, not an exception. Startup refresh
        runs after first paint on a worker, and the things git refuses are
        ordinary: a repository with no commits has no ``log``, a checkout with no
        upstream has no ``rev-list``, a folder nobody has ``git init``-ed has none
        of it, and a machine without git installed answers nothing at all.

        So *check* means what it says. Off — the default, and what every read on
        the refresh path uses — a refusal degrades to ``""`` and the caller shows
        the empty version of whatever it was drawing. On, for the two commands a
        user *asked* for (creating and removing a worktree), the failure is
        raised with git's own words, because there the silence would be the bug.

        ``OSError`` covers the case that used to escape as a traceback with no
        connection to git at all: no ``git`` on ``PATH`` makes
        :func:`subprocess.run` raise ``FileNotFoundError`` before any exit code
        exists to inspect.
        """
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=self.workspace,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=15,
                check=False,
                **hidden_process_kwargs(),
            )
        except (OSError, subprocess.SubprocessError) as exc:
            if check:
                raise RuntimeError(GIT_UNAVAILABLE) from exc
            return ""
        if result.returncode:
            if check:
                raise RuntimeError(result.stderr.strip() or "git command failed")
            return ""
        return result.stdout
