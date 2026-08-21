"""Both CLI entry points drive the same checkpoint rollback (SWR-2437)."""

from __future__ import annotations

import datetime as dt
import json
import shutil
import subprocess
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_service import CheckpointService
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

_SESSION_ID = "20260808-cli00001"

runner = CliRunner()


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _run_headless(monkeypatch, argv: list[str]) -> tuple[int, list[str]]:
    """Drive ``rotaris-headless`` in-process, capturing every line it prints."""
    from rotaris_core.cli import argparse_app

    lines: list[str] = []

    def _capture(*args: object, **_kwargs: object) -> None:
        lines.append(" ".join(str(item) for item in args))

    monkeypatch.setattr(argparse_app, "print", _capture, raising=False)
    return argparse_app.main(argv), lines


@pytest.fixture(scope="session")
def checkpointed_template(tmp_path_factory) -> Path:
    """One real repository with one real session and three real checkpoints.

    Built once and copied per test: every Git invocation costs a process, and
    rebuilding three checkpoints for every command under test is most of this
    file's runtime.
    """
    return _build_workspace_with_three_checkpoints(tmp_path_factory.mktemp("checkpoint-cli"))


@pytest.fixture
def workspace(checkpointed_template: Path, tmp_path: Path) -> Path:
    """A private copy of the template repository, session and checkpoints."""
    root = tmp_path / "workspace"
    shutil.copytree(checkpointed_template, root)
    return root


def _build_workspace_with_three_checkpoints(tmp_path: Path) -> Path:
    """A real repository whose session recorded three real checkpoints."""
    root = tmp_path / "workspace"
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "alpha.txt").write_text("alpha v1\n", encoding="utf-8")
    (root / "beta.txt").write_text("beta v1\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")

    manager = SessionManager(root)
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id=_SESSION_ID,
        workspace_root=str(root),
        created_at=now,
        updated_at=now,
    )
    manager.flush_session(state)
    service = CheckpointService(
        session_manager=manager,
        state=state,
        tree_root=root,
        config=RotarisConfig(workspace_root=root),
        isolated=True,
    )
    (root / "alpha.txt").write_text("alpha v2\n", encoding="utf-8")
    assert service.capture(iteration=1) is not None
    (root / "gamma.txt").write_text("gamma v1\n", encoding="utf-8")
    assert service.capture(iteration=2) is not None
    (root / "beta.txt").unlink()
    assert service.capture(iteration=3) is not None
    return root


@verifies(SWR.SWR_2437)
def test_both_entry_points_list_a_sessions_checkpoints(workspace: Path, monkeypatch) -> None:
    """Productive use: a headless user reviews which checkpoints a session recorded.
    Expected outcome: rotaris-cli and rotaris-headless print the same three rows with
    sequence, time, iteration and changed-file count."""
    from rotaris_core.cli.app import app

    root = workspace
    argv = ["checkpoints", "list", "--session", _SESSION_ID, "--workspace", str(root)]

    typer_result = runner.invoke(app, argv)
    assert typer_result.exit_code == 0, typer_result.output

    code, headless_out = _run_headless(monkeypatch, argv)
    assert code == 0

    typer_rows = [line for line in typer_result.output.splitlines() if line.strip()]
    assert typer_rows == headless_out
    assert typer_rows[0].split() == ["SEQ", "CREATED", "ITER", "FILES", "KIND"]
    assert [row.split()[0] for row in typer_rows[1:]] == ["1", "2", "3"]
    # Iteration 2 created gamma.txt on top of iteration 1's edit to alpha.txt.
    assert typer_rows[2].split()[2:4] == ["2", "2"]


@verifies(SWR.SWR_2437)
def test_headless_restore_shows_the_diff_and_applies_the_rollback(
    workspace: Path, monkeypatch
) -> None:
    """Productive use: a headless user rolls a session's tree back to iteration 1.
    Expected outcome: the command prints what each file will get, restores the
    content, and names the safety checkpoint that can undo it."""
    root = workspace
    head_before = _git(root, "rev-parse", "HEAD").strip()
    branch_before = _git(root, "symbolic-ref", "HEAD").strip()

    code, printed = _run_headless(
        monkeypatch,
        [
            "checkpoints",
            "restore",
            "--session",
            _SESSION_ID,
            "--sequence",
            "1",
            "--yes",
            "--workspace",
            str(root),
        ],
    )

    assert code == 0
    output = "\n".join(printed)
    # The A/D inversion: gamma.txt only exists because of iteration 2.
    assert "delete" in output
    assert "gamma.txt" in output
    assert "recreate" in output
    assert "beta.txt" in output
    assert "Safety checkpoint 4" in output
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "beta.txt").read_text(encoding="utf-8") == "beta v1\n"
    assert not (root / "gamma.txt").exists()
    assert _git(root, "rev-parse", "HEAD").strip() == head_before
    assert _git(root, "symbolic-ref", "HEAD").strip() == branch_before


@verifies(SWR.SWR_2437)
def test_both_entry_points_exit_non_zero_when_a_restore_is_blocked(
    workspace: Path, monkeypatch
) -> None:
    """Productive use: a script rolls back a tree that has an uncommitted edit in it.
    Expected outcome: both entry points fail loudly enough for the script to notice,
    and the edit is still on disk afterwards."""
    from rotaris_core.cli.app import app

    root = workspace
    (root / "alpha.txt").write_text("hand written by the user\n", encoding="utf-8")
    argv = [
        "checkpoints",
        "restore",
        "--session",
        _SESSION_ID,
        "--sequence",
        "2",
        "--yes",
        "--workspace",
        str(root),
    ]

    typer_result = runner.invoke(app, argv)
    assert typer_result.exit_code == 1, typer_result.output

    code, printed = _run_headless(monkeypatch, argv)

    assert code == 1
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "hand written by the user\n"
    assert any("alpha.txt" in line for line in printed)
    # A refusal is part of the session's story, not just the terminal's.
    issues = json.loads(
        (SessionManager(root).session_dir(_SESSION_ID) / "issues.json").read_text("utf-8")
    )
    refusals = [issue for issue in issues["issues"] if issue["kind"] == "checkpoint_restore"]
    assert len(refusals) == 2
    assert {issue["severity"] for issue in refusals} == {"warning"}

    forced = runner.invoke(app, [*argv, "--force"])
    assert forced.exit_code == 0, forced.output
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"


@verifies(SWR.SWR_2437)
def test_a_restore_without_yes_refuses_rather_than_waiting_on_a_pipe(workspace: Path) -> None:
    """Productive use: a restore is invoked from a script with nothing on stdin.
    Expected outcome: it exits with an error instead of blocking forever on a
    confirmation nobody can answer, and the tree is untouched."""
    from rotaris_core.cli.app import app

    root = workspace

    result = runner.invoke(
        app,
        [
            "checkpoints",
            "restore",
            "--session",
            _SESSION_ID,
            "--sequence",
            "1",
            "--workspace",
            str(root),
        ],
    )

    assert result.exit_code == 2, result.output
    assert "--yes" in result.output
    assert not (root / "beta.txt").exists()


@verifies(SWR.SWR_2437)
def test_restoring_a_checkpoint_the_session_never_recorded_is_reported(workspace: Path) -> None:
    """Productive use: a user mistypes the checkpoint number.
    Expected outcome: the command says so and exits non-zero without touching the
    working tree."""
    from rotaris_core.cli.app import app

    root = workspace

    result = runner.invoke(
        app,
        [
            "checkpoints",
            "restore",
            "--session",
            _SESSION_ID,
            "--sequence",
            "99",
            "--yes",
            "--workspace",
            str(root),
        ],
    )

    assert result.exit_code == 2, result.output
    assert "No checkpoint 99" in result.output
    assert (root / "gamma.txt").read_text(encoding="utf-8") == "gamma v1\n"
