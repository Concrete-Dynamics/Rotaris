"""Status bar widget — shows workspace path + git branch below right pane.

Implements SWR-1065 through SWR-1070 (status-bar requirements) from
docs/requirements/1000-tui-core/.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Any

from textual.containers import Horizontal
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult
    from textual.timer import Timer


_POLL_INTERVAL_SECONDS = 10.0
_GIT_TIMEOUT_SECONDS = 1.0
_TRUNCATE_ELLIPSIS = "…"


def _collapse_home(path: Path) -> str:
    resolved = path.resolve()
    home_env = os.environ.get("HOME")
    home = Path(home_env).resolve() if home_env else Path.home().resolve()
    try:
        rel = resolved.relative_to(home)
    except ValueError:
        return str(resolved)
    if str(rel) in ("", "."):
        return "~"
    return f"~{os.sep}{rel}"


def _middle_truncate(text: str, max_width: int) -> str:
    if max_width <= 0 or len(text) <= max_width:
        return text
    if max_width <= 1:
        return _TRUNCATE_ELLIPSIS
    keep = max_width - 1
    left = keep // 2
    right = keep - left
    return f"{text[:left]}{_TRUNCATE_ELLIPSIS}{text[-right:] if right else ''}"


def _detect_git_branch_sync(workspace: Path) -> str | None:
    """Return branch name, ``[detached]``, or ``None`` if not a repo.

    Blocking subprocess — call via ``asyncio.to_thread``. Mapping:
    non-zero exit with "not a git repository" stderr → None (REQ-004);
    other non-zero exit → ``[detached]``; ``HEAD`` stdout → ``[detached]``.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        stderr = (result.stderr or "").lower()
        if "not a git repository" in stderr or "fatal" in stderr:
            return None
        return "[detached]"
    branch = (result.stdout or "").strip()
    if not branch:
        return None
    if branch == "HEAD":
        return "[detached]"
    return branch


@traces(SWR.SWR_1065, SWR.SWR_1066, SWR.SWR_1067, SWR.SWR_1068, SWR.SWR_1069, SWR.SWR_1070)
class StatusBar(Horizontal):
    DEFAULT_CSS = ""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._workspace: Path = Path.cwd()
        self._branch: str | None = None
        self._poll_timer: Timer | None = None

    def compose(self) -> ComposeResult:
        yield Static(id="status-bar-path", markup=False)
        yield Static(id="status-bar-sep", markup=False)
        yield Static(id="status-bar-branch", markup=False)

    def on_mount(self) -> None:
        self._sync_from_app()
        self._update_render()
        self.run_worker(self._refresh_branch(), exclusive=True)
        self._poll_timer = self.set_interval(
            _POLL_INTERVAL_SECONDS,
            self._on_poll_tick,
            pause=False,
        )

    def set_workspace(self, workspace: Path | str) -> None:
        """Public hook called on session/workspace switch (REQ-005)."""
        self._workspace = Path(workspace)
        self._update_render()
        self.run_worker(self._refresh_branch(), exclusive=True)

    def _sync_from_app(self) -> None:
        app = self.app
        session = getattr(app, "current_session", None)
        if session is not None:
            ws = getattr(session, "workspace_root", None)
            if ws:
                self._workspace = Path(ws)
                return
        config = getattr(app, "config", None)
        if config is not None:
            ws = getattr(config, "workspace_root", None)
            if ws:
                self._workspace = Path(ws)

    def _on_poll_tick(self) -> None:
        self._sync_from_app()
        self.run_worker(self._refresh_branch(), exclusive=True)

    async def _refresh_branch(self) -> None:
        workspace = self._workspace
        branch = await asyncio.to_thread(_detect_git_branch_sync, workspace)
        if workspace == self._workspace:
            self._branch = branch
            self._update_render()

    def _update_render(self) -> None:
        path_text = _collapse_home(self._workspace)
        try:
            width = max(self.size.width, 0)
        except Exception:
            width = 0
        if width <= 0:
            width = 80
        branch = self._branch
        if branch:
            sep = " · "
            overhead = len(sep) + len(branch)
            path_budget = max(width - overhead, 4)
            path_render = _middle_truncate(path_text, path_budget)
            sep_render = sep
            branch_render = branch
        else:
            path_render = _middle_truncate(path_text, max(width, 4))
            sep_render = ""
            branch_render = ""
        try:
            self.query_one("#status-bar-path", Static).update(path_render)
            self.query_one("#status-bar-sep", Static).update(sep_render)
            self.query_one("#status-bar-branch", Static).update(branch_render)
        except Exception:
            return

    def on_resize(self) -> None:
        self._update_render()
