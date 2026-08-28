from __future__ import annotations

import logging
from pathlib import Path

import pytest

from rotaris_core.agents.agents_md_loader import (
    _find_git_root,
    clear_agents_md_cache,
    load_agents_md_content,
)
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture(autouse=True)
def clear_loader_cache() -> None:
    clear_agents_md_cache()
    yield
    clear_agents_md_cache()


@verifies(SWR.SWR_301, SWR.SWR_449, SWR.SWR_450)
def test_only_workspace_agents_file_is_injected(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    home_dir = tmp_path / "home"
    codex_dir = home_dir / ".codex"
    codex_dir.mkdir(parents=True)
    global_file = codex_dir / "AGENTS.md"
    global_file.write_text("global instructions\n", encoding="utf-8")
    monkeypatch.setattr(Path, "home", lambda: home_dir)

    repo_root = tmp_path / "repo"
    workspace_root = repo_root / "packages" / "api"
    workspace_root.mkdir(parents=True)
    (repo_root / ".git").mkdir()

    root_file = repo_root / "AGENTS.md"
    root_file.write_text("root instructions\n", encoding="utf-8")
    package_override = repo_root / "packages" / "AGENTS.override.md"
    package_override.write_text("package override\n", encoding="utf-8")
    workspace_file = workspace_root / "AGENTS.md"
    workspace_file.write_text("workspace instructions\n", encoding="utf-8")

    merged = load_agents_md_content(workspace_root)

    expected = f"<!-- source: {workspace_file} -->\nworkspace instructions\n"
    assert merged == expected


@verifies(SWR.SWR_301, SWR.SWR_445)
def test_override_replaces_regular_file_same_level(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")

    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    (workspace_root / "AGENTS.md").write_text("root regular\n", encoding="utf-8")
    override_file = workspace_root / "AGENTS.override.md"
    override_file.write_text("root override\n", encoding="utf-8")

    merged = load_agents_md_content(workspace_root)

    assert "root override" in merged
    assert "root regular" not in merged
    assert str(override_file) in merged


@verifies(SWR.SWR_301)
def test_find_git_root_uses_nearest_git_ancestor(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    workspace_root = repo_root / "packages" / "api"
    workspace_root.mkdir(parents=True)
    (repo_root / ".git").mkdir()

    assert _find_git_root(workspace_root) == repo_root


@verifies(SWR.SWR_301)
def test_find_git_root_returns_workspace_when_workspace_is_git_root(tmp_path: Path) -> None:
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()

    assert _find_git_root(workspace_root) == workspace_root


@verifies(SWR.SWR_301)
def test_find_git_root_returns_workspace_when_no_git_root_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: users can load workspace instructions outside a Git repository.
    Expected outcome: host directories above the test workspace cannot become its Git root.
    """
    workspace_root = tmp_path / "repo" / "packages"
    workspace_root.mkdir(parents=True)
    real_is_dir = Path.is_dir
    monkeypatch.setattr(
        Path,
        "is_dir",
        lambda path: False if path.name == ".git" else real_is_dir(path),
    )

    assert _find_git_root(workspace_root) == workspace_root


@verifies(SWR.SWR_301, SWR.SWR_452)
def test_per_file_size_cap_truncates_on_line_boundary(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    agents_file = workspace_root / "AGENTS.md"
    agents_file.write_text("alpha\nbeta\ncharlie\n", encoding="utf-8")

    with caplog.at_level(logging.WARNING):
        merged = load_agents_md_content(workspace_root, per_file_limit=12)

    assert "alpha" in merged
    assert "beta" in merged
    assert "charlie" not in merged
    assert "Truncating AGENTS.md file" in caplog.text


@verifies(SWR.SWR_301, SWR.SWR_453)
def test_total_content_cap_truncates_later_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    repo_root = tmp_path / "repo"
    workspace_root = repo_root / "pkg"
    workspace_root.mkdir(parents=True)
    (repo_root / ".git").mkdir()
    workspace_file = workspace_root / "AGENTS.md"
    workspace_file.write_text("delta\nepsilon\n", encoding="utf-8")

    prefix = f"<!-- source: {workspace_file} -->\n"
    total_limit = len(prefix.encode("utf-8")) + len(b"delta\ne")

    with caplog.at_level(logging.WARNING):
        merged = load_agents_md_content(workspace_root, total_limit=total_limit)

    assert "delta" in merged
    assert "epsilon" not in merged
    assert "remaining total content budget" in caplog.text
    assert len(merged.encode("utf-8")) <= total_limit


@verifies(SWR.SWR_301, SWR.SWR_453)
def test_total_content_cap_drops_file_when_no_budget_remains(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    repo_root = tmp_path / "repo"
    workspace_root = repo_root / "pkg"
    workspace_root.mkdir(parents=True)
    (repo_root / ".git").mkdir()
    workspace_file = workspace_root / "AGENTS.md"
    workspace_file.write_text("workspace line\n", encoding="utf-8")

    total_limit = len(f"<!-- source: {workspace_file} -->\n".encode())

    with caplog.at_level(logging.WARNING):
        merged = load_agents_md_content(workspace_root, total_limit=total_limit)

    assert merged == ""
    assert "Dropping AGENTS.md file" in caplog.text


@verifies(SWR.SWR_301, SWR.SWR_451)
def test_empty_files_are_skipped(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    (workspace_root / "AGENTS.md").write_text("  \n\t\n", encoding="utf-8")

    assert load_agents_md_content(workspace_root) == ""


@verifies(SWR.SWR_301, SWR.SWR_457)
def test_read_errors_are_skipped_with_warning(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    agents_file = workspace_root / "AGENTS.md"
    agents_file.write_text("content\n", encoding="utf-8")

    original_read_text = Path.read_text

    def fake_read_text(self: Path, *args: object, **kwargs: object) -> str:
        if self == agents_file:
            raise OSError("permission denied")
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", fake_read_text)

    with caplog.at_level(logging.WARNING):
        merged = load_agents_md_content(workspace_root)

    assert merged == ""
    assert "Skipping unreadable AGENTS.md file" in caplog.text


@verifies(SWR.SWR_301, SWR.SWR_454)
def test_cache_reuses_discovered_content(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    agents_file = workspace_root / "AGENTS.md"
    agents_file.write_text("first\n", encoding="utf-8")

    merged = load_agents_md_content(workspace_root)
    agents_file.write_text("second\n", encoding="utf-8")

    assert load_agents_md_content(workspace_root) == merged
    assert "first" in merged


@verifies(SWR.SWR_301, SWR.SWR_454)
def test_cache_clear_forces_reload(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    agents_file = workspace_root / "AGENTS.md"
    agents_file.write_text("first\n", encoding="utf-8")
    load_agents_md_content(workspace_root)

    agents_file.write_text("second\n", encoding="utf-8")
    clear_agents_md_cache()

    merged = load_agents_md_content(workspace_root)

    assert "second" in merged
    assert "first" not in merged


@verifies(SWR.SWR_301, SWR.SWR_458)
def test_workspace_does_not_fall_back_to_claude_md(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    (workspace_root / ".git").mkdir()
    claude_file = workspace_root / "CLAUDE.md"
    claude_file.write_text("claude fallback\n", encoding="utf-8")

    merged = load_agents_md_content(workspace_root)

    assert merged == ""
