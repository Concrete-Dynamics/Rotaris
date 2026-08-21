from __future__ import annotations

import contextlib
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import patch

from textual.app import App, ComposeResult
from textual.widgets import Static

if TYPE_CHECKING:
    import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.widgets.status_bar import (
    StatusBar,
    _collapse_home,
    _detect_git_branch_sync,
    _middle_truncate,
)


class _StatusBarApp(App[None]):
    def compose(self) -> ComposeResult:
        yield StatusBar(id="status-bar")


def _bar(app: App[None]) -> StatusBar:
    return app.query_one("#status-bar", StatusBar)


def _statics(app: App[None]) -> tuple[Static, Static, Static]:
    return (
        app.query_one("#status-bar-path", Static),
        app.query_one("#status-bar-sep", Static),
        app.query_one("#status-bar-branch", Static),
    )


@verifies(SWR.SWR_1065)
def test_collapse_home_replaces_home_prefix_with_tilde(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_home = tmp_path / "home" / "user"
    fake_home.mkdir(parents=True)
    sub = fake_home / "projects" / "myapp"
    sub.mkdir(parents=True)
    monkeypatch.setenv("HOME", str(fake_home))
    out = _collapse_home(sub)
    assert out.startswith("~")
    assert "projects" in out
    assert "myapp" in out


@verifies(SWR.SWR_1065)
def test_collapse_home_returns_absolute_when_outside_home(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_home = tmp_path / "home" / "user"
    fake_home.mkdir(parents=True)
    other = tmp_path / "other" / "place"
    other.mkdir(parents=True)
    monkeypatch.setenv("HOME", str(fake_home))
    out = _collapse_home(other)
    assert not out.startswith("~")
    assert "place" in out


@verifies(SWR.SWR_1065)
def test_collapse_home_returns_tilde_for_home_itself(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_home = tmp_path / "homeuser"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    assert _collapse_home(fake_home) == "~"


@verifies(SWR.SWR_1065)
def test_middle_truncate_returns_input_when_within_budget() -> None:
    assert _middle_truncate("hello", 10) == "hello"
    assert _middle_truncate("hello", 5) == "hello"


@verifies(SWR.SWR_1065)
def test_middle_truncate_inserts_ellipsis_in_middle() -> None:
    out = _middle_truncate("abcdefghij", 7)
    assert "…" in out
    assert len(out) == 7
    assert out.startswith("a")
    assert out.endswith("j")


@verifies(SWR.SWR_1065)
def test_middle_truncate_handles_tiny_budget() -> None:
    assert _middle_truncate("abcdef", 1) == "…"
    assert _middle_truncate("abcdef", 0) == "abcdef"


@verifies(SWR.SWR_1066)
def test_detect_git_branch_returns_branch_name(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    fake_result = subprocess.CompletedProcess(
        args=["git"],
        returncode=0,
        stdout="main\n",
        stderr="",
    )
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar.subprocess.run",
        lambda *a, **kw: fake_result,
    )
    assert _detect_git_branch_sync(tmp_path) == "main"


@verifies(SWR.SWR_1066)
def test_detect_git_branch_returns_none_when_not_a_repo(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    fake_result = subprocess.CompletedProcess(
        args=["git"],
        returncode=128,
        stdout="",
        stderr="fatal: not a git repository (or any of the parent directories): .git\n",
    )
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar.subprocess.run",
        lambda *a, **kw: fake_result,
    )
    assert _detect_git_branch_sync(tmp_path) is None


@verifies(SWR.SWR_1066)
def test_detect_git_branch_returns_detached_for_head(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    fake_result = subprocess.CompletedProcess(
        args=["git"],
        returncode=0,
        stdout="HEAD\n",
        stderr="",
    )
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar.subprocess.run",
        lambda *a, **kw: fake_result,
    )
    assert _detect_git_branch_sync(tmp_path) == "[detached]"


@verifies(SWR.SWR_1066)
def test_detect_git_branch_returns_none_on_oserror(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def _raise(*a: object, **kw: object) -> None:
        raise FileNotFoundError("git binary missing")

    monkeypatch.setattr("rotaris_core.tui.widgets.status_bar.subprocess.run", _raise)
    assert _detect_git_branch_sync(tmp_path) is None


@verifies(SWR.SWR_1066)
def test_detect_git_branch_returns_none_on_timeout(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def _raise(*a: object, **kw: object) -> None:
        raise subprocess.TimeoutExpired(cmd="git", timeout=1.0)

    monkeypatch.setattr("rotaris_core.tui.widgets.status_bar.subprocess.run", _raise)
    assert _detect_git_branch_sync(tmp_path) is None


@verifies(SWR.SWR_1065, SWR.SWR_1069)
async def test_status_bar_full_workflow_mounts_and_shows_path_and_branch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path / "doesnotexist"))
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: "feature/awesome",
    )
    app = _StatusBarApp()
    async with app.run_test(size=(120, 24)) as pilot:
        await pilot.pause()
        bar = _bar(app)
        bar.set_workspace(tmp_path)
        await app.workers.wait_for_complete()
        await pilot.pause()
        path_static, sep_static, branch_static = _statics(app)
        assert str(branch_static.render()) == "feature/awesome"
        assert " · " in str(sep_static.render())
        rendered_path = str(path_static.render())
        assert rendered_path  # non-empty
        assert "/" in rendered_path or "\\" in rendered_path or "~" in rendered_path


@verifies(SWR.SWR_1066)
async def test_status_bar_alt_path_hides_branch_when_not_in_repo(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: None,
    )
    app = _StatusBarApp()
    async with app.run_test(size=(120, 24)) as pilot:
        await pilot.pause()
        bar = _bar(app)
        bar.set_workspace(tmp_path)
        await app.workers.wait_for_complete()
        await pilot.pause()
        _path_static, sep_static, branch_static = _statics(app)
        assert str(sep_static.render()) == ""
        assert str(branch_static.render()) == ""


@verifies(SWR.SWR_1067)
async def test_status_bar_alt_path_shows_detached_marker(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: "[detached]",
    )
    app = _StatusBarApp()
    async with app.run_test(size=(120, 24)) as pilot:
        await pilot.pause()
        bar = _bar(app)
        bar.set_workspace(tmp_path)
        await app.workers.wait_for_complete()
        await pilot.pause()
        _path_static, sep_static, branch_static = _statics(app)
        assert str(branch_static.render()) == "[detached]"
        assert " · " in str(sep_static.render())


@verifies(SWR.SWR_1068)
async def test_status_bar_truncates_long_path(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: "main",
    )
    deep = tmp_path
    for i in range(20):
        deep = deep / f"segment-{i:02d}-long-name"
    deep.mkdir(parents=True)
    app = _StatusBarApp()
    async with app.run_test(size=(40, 10)) as pilot:
        await pilot.pause()
        bar = _bar(app)
        bar.set_workspace(deep)
        await app.workers.wait_for_complete()
        await pilot.pause()
        path_static, _sep, _branch = _statics(app)
        rendered = str(path_static.render())
        assert "…" in rendered


@verifies(SWR.SWR_1069)
async def test_status_bar_random_interaction_does_not_crash(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: "main",
    )
    app = _StatusBarApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        for key in ("tab", "escape", "enter", "j", "ctrl+c"):
            with contextlib.suppress(Exception):
                await pilot.press(key)
            await pilot.pause()
        bar = _bar(app)
        assert bar is not None
        for static_id in ("#status-bar-path", "#status-bar-sep", "#status-bar-branch"):
            assert app.query_one(static_id, Static) is not None


@verifies(SWR.SWR_1070)
async def test_status_bar_set_workspace_triggers_refresh(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[Path] = []

    def _fake_detect(ws: Path) -> str:
        calls.append(Path(ws))
        return "branch-" + Path(ws).name

    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        _fake_detect,
    )
    ws_a = tmp_path / "a"
    ws_b = tmp_path / "b"
    ws_a.mkdir()
    ws_b.mkdir()
    app = _StatusBarApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        bar = _bar(app)
        bar.set_workspace(ws_a)
        await app.workers.wait_for_complete()
        await pilot.pause()
        bar.set_workspace(ws_b)
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert ws_a in calls
        assert ws_b in calls


@verifies(SWR.SWR_1065, SWR.SWR_1066, SWR.SWR_1070)
async def test_status_bar_has_a_visible_row_on_the_main_screen(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Productive use: someone opens the TUI and reads which workspace they are in.

    Expected outcome: the status bar occupies a drawable row inside the real main
    screen and its path/branch statics are one row tall. Every other test in this
    file mounts ``StatusBar`` into a bare ``App`` with no stylesheet, so none of
    them would notice ``app.tcss`` sizing the widget down to zero content rows --
    which is exactly what a border inside ``height: 1`` did.
    """
    from rotaris_core.tui.app import RotarisTuiApp

    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: "main",
    )
    app = RotarisTuiApp()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        bar = app.screen.query_one("#status-bar", StatusBar)
        bar.set_workspace(tmp_path)
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert bar.content_region.height >= 1, "status bar has no row to draw its text in"
        path_static = app.screen.query_one("#status-bar-path", Static)
        assert path_static.size.height == 1
        assert str(path_static.render()).strip()
        assert str(app.screen.query_one("#status-bar-branch", Static).render()) == "main"


@verifies(SWR.SWR_1070)
async def test_status_bar_uses_to_thread_for_subprocess(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "rotaris_core.tui.widgets.status_bar._detect_git_branch_sync",
        lambda _ws: "main",
    )
    with patch(
        "rotaris_core.tui.widgets.status_bar.asyncio.to_thread",
        wraps=__import__("asyncio").to_thread,
    ) as spy:
        app = _StatusBarApp()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.pause()
            bar = _bar(app)
            bar.set_workspace(tmp_path)
            await pilot.pause()
            await pilot.pause()
        assert spy.call_count >= 1
