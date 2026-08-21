from __future__ import annotations

import subprocess

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.store import WorkspaceStore
from rotaris.services.git_service import GitService

pytestmark = pytest.mark.integration


def _git(path, *args: str) -> None:
    result = subprocess.run(
        ["git", *args],
        cwd=path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


@verifies(SWR.SWR_2005)
def test_git_service_loads_branch_worktree_history_and_changes(tmp_path) -> None:
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Rotaris Test")
    _git(tmp_path, "config", "user.email", "rotaris@example.invalid")
    source = tmp_path / "module.py"
    source.write_text("value = 1\n", encoding="utf-8")
    _git(tmp_path, "add", "module.py")
    _git(tmp_path, "commit", "-m", "initial")
    source.write_text("value = 2\n", encoding="utf-8")

    store = WorkspaceStore()
    service = GitService(tmp_path, store)
    service.refresh()

    assert store.branch == "main"
    assert store.worktrees[0].active is True
    assert store.commits[0].message == "initial"
    assert store.kpis.uncommitted == 1
    assert store.kpis.files_touched == 1
    # Active base worktree has uncommitted diff stats
    wt = store.worktrees[0]
    assert wt.is_base is True
    assert wt.additions == 1
    assert wt.deletions == 1
    assert wt.files_touched == 1


@verifies(SWR.SWR_2005)
def test_git_service_shows_committed_changes_on_non_base_worktree(tmp_path) -> None:
    """Non-base worktrees show committed diff against the base branch."""
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Rotaris Test")
    _git(tmp_path, "config", "user.email", "rotaris@example.invalid")
    (tmp_path / "initial.txt").write_text("boot\n", encoding="utf-8")
    _git(tmp_path, "add", "initial.txt")
    _git(tmp_path, "commit", "-m", "base commit")

    # Create a worktree on a new branch with a committed change
    wt_path = tmp_path / "feature"
    _git(tmp_path, "worktree", "add", "-b", "feature-x", str(wt_path), "main")
    (wt_path / "feature.py").write_text("x = 1\n", encoding="utf-8")
    _git(wt_path, "add", "feature.py")
    _git(wt_path, "commit", "-m", "feature work")

    # Also leave an uncommitted change in the worktree
    (wt_path / "feature.py").write_text("x = 2\n", encoding="utf-8")

    store = WorkspaceStore()
    service = GitService(tmp_path, store)
    service.refresh()

    # main worktree — no uncommitted changes, no branch diff (it's the base)
    main_wt = next(wt for wt in store.worktrees if wt.branch == "main")
    assert main_wt.is_base is True
    assert main_wt.additions == 0
    assert main_wt.deletions == 0

    # feature worktree — committed changes since main (not active, so branch-diff only)
    feat_wt = next(wt for wt in store.worktrees if wt.branch == "feature-x")
    assert feat_wt.is_base is False
    assert feat_wt.active is False  # workspace is tmp_path, not wt_path
    assert feat_wt.files_touched == 1  # feature.py was added (1 file)
    assert feat_wt.additions == 1  # one line added in the commit
    assert feat_wt.deletions == 0  # no line removed


@verifies(SWR.SWR_2005, SWR.SWR_2405)
def test_a_repository_with_no_commits_yet_opens_instead_of_crashing(tmp_path) -> None:
    """Productive use: someone runs `git init` in a new project and opens Rotaris on it.
    Expected outcome: the window comes up, showing a branch and no history — the
    first day of a project is not an error."""
    _git(tmp_path, "init", "-b", "main")

    store = WorkspaceStore()
    GitService(tmp_path, store).refresh()

    # `git log` has nothing to answer on an unborn branch and used to end the
    # process from inside the window constructor.
    assert store.commits == []
    assert store.branch == "main"
    # The checkout is real, so it is still listed as a worktree.
    assert [tree.active for tree in store.worktrees] == [True]
    assert store.ui.notice is None, "a project's first day is not worth a notice"


@verifies(SWR.SWR_2005)
def test_a_folder_that_is_not_a_repository_opens_quietly(tmp_path) -> None:
    """Productive use: a user points Rotaris at a plain folder they have not versioned.
    Expected outcome: an empty Git view and nothing else — not having run `git init`
    is not news."""
    store = WorkspaceStore()
    GitService(tmp_path, store).refresh()

    assert store.branch == ""
    assert store.commits == []
    assert store.worktrees == []
    assert store.ui.notice is None


@verifies(SWR.SWR_2005, SWR.SWR_2405)
def test_a_machine_without_git_says_so_and_keeps_working(tmp_path, monkeypatch) -> None:
    """Productive use: Rotaris is opened on a machine that has no Git installed.
    Expected outcome: the product runs, and says what is unavailable — history and
    worktrees — rather than failing to start."""
    _git(tmp_path, "init", "-b", "main")

    real_run = subprocess.run

    def no_git(command, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if command and command[0] == "git":
            raise FileNotFoundError(2, "The system cannot find the file specified", "git")
        return real_run(command, *args, **kwargs)

    monkeypatch.setattr("rotaris.services.git_service.subprocess.run", no_git)

    store = WorkspaceStore()
    # A .git directory exists and git does not: the combination that used to raise
    # FileNotFoundError straight out of create_window.
    GitService(tmp_path, store).refresh()

    assert store.branch == ""
    assert store.commits == []
    assert store.worktrees == []
    notice = store.ui.notice
    assert notice is not None
    assert notice.title == "Working without Git"
    # It names what is lost, and says the product is not.
    assert "worktree" in notice.message
    assert notice.persistent is True


@verifies(SWR.SWR_2405)
def test_an_action_a_user_asked_for_still_reports_its_failure(tmp_path) -> None:
    """A read degrading to empty must not make a *requested* change fail silently."""
    _git(tmp_path, "init", "-b", "main")
    store = WorkspaceStore()
    service = GitService(tmp_path, store)

    # Removing a worktree that is not there is an error the user has to see.
    with pytest.raises(RuntimeError):
        service.delete_worktree(tmp_path / "nowhere")


@verifies(SWR.SWR_2005, SWR.SWR_2405)
def test_rotaris_can_set_up_git_for_a_folder_nobody_versioned(tmp_path) -> None:
    """Productive use: a user opens Rotaris on a plain folder and takes its offer.
    Expected outcome: a repository, a first commit, and Rotaris' own records kept
    out of that commit."""
    (tmp_path / "app.py").write_text("print('hi')\n", encoding="utf-8")
    # Rotaris' own workspace state, which must not enter the user's history.
    (tmp_path / ".rotaris").mkdir()
    (tmp_path / ".rotaris" / "sessions.json").write_text("{}", encoding="utf-8")

    store = WorkspaceStore()
    service = GitService(tmp_path, store)
    said = service.prepare_repository()

    assert (tmp_path / ".git").is_dir()
    assert ".rotaris/" in (tmp_path / ".gitignore").read_text(encoding="utf-8")
    assert "Initial commit" in said
    # The commit exists and holds the project, not Rotaris' bookkeeping.
    assert store.commits[0].message == "Initial commit"
    tracked = subprocess.run(
        ["git", "ls-files"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    assert "app.py" in tracked
    assert ".gitignore" in tracked
    assert not [name for name in tracked if name.startswith(".rotaris/")]


@verifies(SWR.SWR_2005)
def test_setting_up_git_appends_to_an_existing_gitignore(tmp_path) -> None:
    """A user's own ignore rules survive Rotaris adding one of its own."""
    (tmp_path / "app.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / ".gitignore").write_text("*.log\nbuild/\n", encoding="utf-8")

    GitService(tmp_path, WorkspaceStore()).prepare_repository()

    kept = (tmp_path / ".gitignore").read_text(encoding="utf-8")
    assert "*.log" in kept
    assert "build/" in kept
    assert ".rotaris/" in kept


@verifies(SWR.SWR_2005)
def test_setting_up_git_twice_does_not_make_a_second_commit(tmp_path) -> None:
    """The offer is idempotent: every step is skipped when it is already true."""
    (tmp_path / "app.py").write_text("x = 1\n", encoding="utf-8")
    store = WorkspaceStore()
    service = GitService(tmp_path, store)
    service.prepare_repository()

    # Nothing has changed since, so there is nothing left to commit.
    with pytest.raises(RuntimeError):
        service.prepare_repository()
    assert len(store.commits) == 1
    # And the ignore rule was not appended a second time.
    body = (tmp_path / ".gitignore").read_text(encoding="utf-8")
    assert body.count(".rotaris/") == 1


@verifies(SWR.SWR_2005, SWR.SWR_2405)
def test_a_commit_less_repository_is_offered_the_first_commit(tmp_path) -> None:
    """The other half: already `git init`-ed, still nothing committed."""
    _git(tmp_path, "init", "-b", "main")
    (tmp_path / "app.py").write_text("x = 1\n", encoding="utf-8")

    store = WorkspaceStore()
    service = GitService(tmp_path, store)
    assert service.can_prepare() is True
    service.prepare_repository()

    assert store.commits[0].message == "Initial commit"
    assert store.branch == "main"


@verifies(SWR.SWR_2405)
def test_the_offer_is_withheld_when_git_cannot_answer_it(tmp_path, monkeypatch) -> None:
    """A button that answers a missing git with git is the dead end this removes."""
    real_run = subprocess.run

    def no_git(command, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if command and command[0] == "git":
            raise FileNotFoundError(2, "not found", "git")
        return real_run(command, *args, **kwargs)

    monkeypatch.setattr("rotaris.services.git_service.subprocess.run", no_git)
    service = GitService(tmp_path, WorkspaceStore())

    assert service.can_prepare() is False
    with pytest.raises(RuntimeError):
        service.prepare_repository()


@verifies(SWR.SWR_2005)
def test_the_offer_says_what_to_do_when_git_has_no_author(tmp_path, monkeypatch) -> None:
    """Productive use: a machine where git was installed but never configured.
    Expected outcome: the two commands to run, and nothing half-written on disk."""
    (tmp_path / "app.py").write_text("x = 1\n", encoding="utf-8")
    _git(tmp_path, "init", "-b", "main")
    # An identity that resolves to nothing, whatever the machine's global config.
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(tmp_path / "absent.gitconfig"))
    monkeypatch.setenv("GIT_CONFIG_SYSTEM", str(tmp_path / "absent.gitconfig"))

    service = GitService(tmp_path, WorkspaceStore())
    with pytest.raises(RuntimeError) as raised:
        service.prepare_repository()

    assert "git config --global user.name" in str(raised.value)
    # Refused before writing: no ignore rule, nothing staged.
    assert not (tmp_path / ".gitignore").exists()
