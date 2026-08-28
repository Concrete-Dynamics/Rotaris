"""End-to-end coverage for project initialization in the window the user sees.

The whole SWR-2800 chain is real here: the registry decides what the workspace
owes, the real ``MainWindow`` starts the real worker thread, the real runner
resolves its commands from the workspace's own ``serena`` entry and launches them
as real subprocesses, and the outcome is read back out of ``.rotaris/agents.yaml``.

One thing is faked, and it is the external system: ``serena`` itself is a small
Python script that records the argv it was called with. That keeps the tests
offline and quick while leaving the part Rotaris owns — command construction,
process handling, recorded state, what the window does with all of it — genuinely
under test.

Nothing in these tests reaches for a private method to make something happen:
controls are found by accessible name and clicked, so an unwired signal fails
here rather than shipping.
"""

from __future__ import annotations

import json
import sys
import textwrap
from typing import TYPE_CHECKING, Any

import pytest
import yaml
from PySide6.QtWidgets import QLabel, QPlainTextEdit, QPushButton
from rotaris_core.config.bootstrap import write_minimal_agents_yaml
from rotaris_core.init import registry
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, find_by_accessible_name, settle

from rotaris.models.state import ProviderInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.main_window import MainWindow
from rotaris.widgets.project_init_dialog import ProjectInitDialog

if TYPE_CHECKING:
    from pathlib import Path

# These tests are *about* project initialization, so they opt back in to the
# real registry run the suite otherwise neutralises (see `conftest.py`'s
# `no_unasked_project_initialization`). Each points the workspace at a fake
# `serena` of its own, so the run stays hermetic.
pytestmark = [pytest.mark.e2e, pytest.mark.usefixtures("real_project_initialization")]

SERENA = "serena-setup"
SERENA_LABEL = "Serena project setup"

# Stands in for the `serena` executable. Records the subcommand it was asked for,
# so a test can assert what Rotaris actually ran, and can be told to fail or to
# hang by the marker file the test drops next to its log.
_SERENA_STUB = """
import json
import sys
import time
from pathlib import Path

LOG = Path(sys.argv[1])
SUBCOMMAND = sys.argv[2:]


def _record() -> None:
    entries = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else []
    entries.append(SUBCOMMAND)
    LOG.write_text(json.dumps(entries), encoding="utf-8")


_record()

if (LOG.parent / "fail").exists():
    sys.stderr.write("serena: the language server would not start\\n")
    raise SystemExit(1)

if (LOG.parent / "hang").exists():
    time.sleep(120)  # Outlives the test; the point is that shutdown reaps it.

print("ok")
"""


# ── workspace, window and lookup helpers ────────────────────────────────


def _workspace(tmp_path: Path, *, serena_command: str | None = None) -> tuple[Path, Path]:
    """A real workspace the product's own loader reads, plus the stub's call log.

    `serena_command` overrides the launcher so a test can describe a machine
    where Serena cannot start; the default points ``.mcp.json`` at the stub.

    The entry is written as a real Serena *launch* — ``start-mcp-server`` and its
    server-only flags included — because that is what a user's ``.mcp.json``
    holds. Truncating it back to a CLI prefix is the product's job (SWR-2823),
    and doing it here instead would test the test.
    """
    root = tmp_path / "workspace"
    root.mkdir(parents=True, exist_ok=True)
    write_minimal_agents_yaml(root / ".rotaris" / "agents.yaml")
    # A source file, so the workspace classifies as `code` and is worth indexing.
    (root / "app.py").write_text("def main() -> None: ...\n", encoding="utf-8")

    stub = tmp_path / "serena_stub.py"
    stub.write_text(textwrap.dedent(_SERENA_STUB).strip(), encoding="utf-8")
    log = tmp_path / "serena_calls.json"

    entry: dict[str, Any] = (
        {
            "command": sys.executable,
            "args": [str(stub), str(log), "start-mcp-server", "--transport", "stdio"],
        }
        if serena_command is None
        else {"command": serena_command}
    )
    (root / ".mcp.json").write_text(
        json.dumps({"mcpServers": {"serena": entry}}),
        encoding="utf-8",
    )
    return root, log


def _subcommands(log: Path) -> list[str]:
    """The Serena subcommands the stub was actually invoked with, in order."""
    if not log.exists():
        return []
    return [" ".join(argv[:2]) for argv in json.loads(log.read_text(encoding="utf-8"))]


def _open_window(qtbot, workspace: Path) -> MainWindow:
    """Open the real window on `workspace`, faking only the network probes.

    ``_providers()`` and ``_subscription_limits()`` reach out to every configured
    provider and cost 5–18 s; nothing in this flow depends on them.
    """
    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()

    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    settle(qtbot)
    return window


def _modal(window: MainWindow) -> ProjectInitDialog | None:
    """The setup modal the user can currently see, if any."""
    visible = [
        child
        for child in window.findChildren(ProjectInitDialog)
        if child.isVisible() and not child.isHidden()
    ]
    return visible[0] if visible else None


def _await_modal(qtbot, window: MainWindow) -> ProjectInitDialog:
    qtbot.waitUntil(lambda: _modal(window) is not None, timeout=15_000)
    modal = _modal(window)
    assert modal is not None
    return modal


def _send_button(qtbot, window: MainWindow) -> QPushButton:
    """The composer's dispatch button, reached the way the user reaches it."""
    window.show_view("workspace")
    settle(qtbot)
    return find_by_accessible_name(window.workspace, "Start run", QPushButton, visible_only=True)


def _report(modal: ProjectInitDialog) -> str:
    return find_by_accessible_name(modal, "Initialization progress", QPlainTextEdit).toPlainText()


def _recorded(workspace: Path) -> dict[str, Any]:
    data = yaml.safe_load((workspace / ".rotaris" / "agents.yaml").read_text(encoding="utf-8"))
    section = data.get("initialization") or {}
    return dict(section)


def _settings_project_status(qtbot, window: MainWindow) -> tuple[str, str]:
    window.show_view("settings")
    window.settings.set_active_tab("project")
    settle(qtbot)
    status = find_by_accessible_name(
        window.settings, "Project initialization status", QLabel, visible_only=True
    )
    detail = find_by_accessible_name(
        window.settings, "Project initialization details", QLabel, visible_only=True
    )
    return status.text(), detail.text()


# ── first run: no prompt, no gate, set up anyway ────────────────────────


def _await_setup(qtbot, window: MainWindow, workspace: Path) -> None:
    """Wait for the background setup to finish and its outcome to be published."""
    qtbot.waitUntil(
        lambda: (
            window._project_init_worker is None and window.store.initialization.running is False
        ),
        timeout=60_000,
    )
    settle(qtbot)


@verifies(SWR.SWR_2802, SWR.SWR_2820, SWR.SWR_2821)
def test_opening_a_fresh_workspace_sets_it_up_without_prompting_or_gating(qtbot, tmp_path) -> None:
    """Productive use: a user opens a workspace Rotaris has never set up, and simply
    starts working — while Rotaris indexes it behind them.

    Expected outcome: no modal, no disabled composer, and the setup really ran: the
    stub was invoked with Serena's own setup subcommands and the outcome is recorded."""
    workspace, log = _workspace(tmp_path)

    window = _open_window(qtbot, workspace)

    assert _modal(window) is None, "deterministic setup must not put a question on screen"
    send = _send_button(qtbot, window)
    assert send.isEnabled() is True, "setup the user cannot answer must not gate their runs"

    _await_setup(qtbot, window, workspace)

    assert _subcommands(log) == ["project create", "project index", "memories initialize"]
    recorded = _recorded(workspace)
    assert recorded["completed"] == [SERENA]
    assert recorded["classification"] == "code"
    assert recorded["last_run"]

    status, detail = _settings_project_status(qtbot, window)
    assert status == "Project initialized"
    assert SERENA_LABEL in detail
    window.close()

    # Reopening is the user's real second visit: nothing re-runs.
    log.unlink()
    second = _open_window(qtbot, workspace)
    settle(qtbot)
    assert _modal(second) is None
    assert second.store.initialization.completed == (SERENA,)
    assert _subcommands(log) == [], "completed setup must never be repeated"
    second.close()


@verifies(SWR.SWR_2820, SWR.SWR_2823)
def test_the_setup_commands_come_from_the_workspaces_own_serena_entry(qtbot, tmp_path) -> None:
    """Productive use: a team that repointed `serena` has its project indexed by that
    build, not by the one Rotaris ships.

    Expected outcome: the configured launch is truncated at its launch verb and the
    server-only flags never reach a CLI call (SWR-2823)."""
    workspace, log = _workspace(tmp_path)

    window = _open_window(qtbot, workspace)
    _await_setup(qtbot, window, workspace)

    invocations = json.loads(log.read_text(encoding="utf-8"))
    assert invocations, "the configured stub was never launched"
    for argv in invocations:
        assert "start-mcp-server" not in argv
        assert "--transport" not in argv
        assert argv[-1] == str(workspace)
    window.close()


@verifies(SWR.SWR_2804, SWR.SWR_2820)
def test_a_documentation_only_workspace_is_set_up_without_indexing(qtbot, tmp_path) -> None:
    """Productive use: a user opens a documentation repository and Rotaris does not spend
    minutes indexing symbols that are not there.

    Expected outcome: the project is registered with Serena, nothing is indexed, and the
    workspace is recorded as initialized with its classification."""
    workspace, log = _workspace(tmp_path)
    (workspace / "app.py").unlink()

    window = _open_window(qtbot, workspace)
    _await_setup(qtbot, window, workspace)

    assert _subcommands(log) == ["project create"]
    recorded = _recorded(workspace)
    assert recorded["completed"] == [SERENA]
    assert recorded["classification"] == "non-code"
    window.close()


# ── skip, then the manual re-initialize trigger ─────────────────────────


@verifies(SWR.SWR_2805, SWR.SWR_2821)
def test_a_skipped_workspace_is_not_set_up_behind_the_user(qtbot, tmp_path) -> None:
    """Productive use: a user who opened the setup modal and chose *Skip for now* is not
    overruled by the next open starting the same work anyway.

    Expected outcome: nothing runs, and the Workspace action still offers it — skipping
    defers the work, it does not discard it."""
    workspace, log = _workspace(tmp_path)
    registry.record_skipped(workspace, [SERENA])

    window = _open_window(qtbot, workspace)
    settle(qtbot)

    assert _modal(window) is None, "a workspace that already answered must not be re-prompted"
    assert _subcommands(log) == [], "an explicit skip must not be restarted in the background"
    assert _send_button(qtbot, window).isEnabled() is True
    window.close()


@verifies(SWR.SWR_2821)
def test_an_agentic_task_without_a_provider_says_so_before_starting(qtbot, tmp_path) -> None:
    """Productive use: a user with no provider authenticated starts a setup step that
    runs an agent, and is told what is missing instead of waiting for it to fail.

    Expected outcome: the modal reports the missing provider immediately, points at
    Settings, and nothing is run — before this the run reached the model layer and came
    back minutes later with the provider's own authentication error."""
    started: list[str] = []

    def _never_runs(_config: Any, _workspace: Path, **_kwargs: Any) -> Any:
        started.append("ran")  # pragma: no cover — the point is that it does not
        raise AssertionError("an agentic task must not start without a provider")

    agentic = registry.InitTask(
        id="agentic-setup",
        label="Agentic setup",
        description="A setup step that runs an agent.",
        prerequisite_met=lambda _c, _r: True,
        run=_never_runs,
        requires_consent=True,
    )
    registry.register_task(agentic)
    try:
        workspace, _log = _workspace(tmp_path)
        window = _open_window(qtbot, workspace)
        # The fresh machine this is about: a provider is configured — Rotaris ships
        # defaults — and none of them has credentials yet.
        window.store.providers = [
            ProviderInfo(id="openai", label="OpenAI", connected=False, status="unauthenticated")
        ]
        modal = _await_modal(qtbot, window)
        # The deterministic task registered beside it runs on open; let it finish,
        # so the click below reaches the agentic task rather than being told a run
        # is already in flight.
        _await_setup(qtbot, window, workspace)

        click_by_name(qtbot, modal, "Initialize project", QPushButton)
        qtbot.waitUntil(lambda: modal.state == "error", timeout=15_000)

        assert started == []
        assert "model provider" in window.store.initialization.last_error
        notice = window.store.ui.notice
        assert notice is not None
        assert notice.action_id == "view.settings"
        # The deterministic task beside it is unaffected: it needed no provider.
        assert _recorded(workspace)["completed"] == [SERENA]
        window.close()
    finally:
        registry.unregister_task("agentic-setup")


@verifies(SWR.SWR_2805, SWR.SWR_2820)
def test_the_workspace_action_runs_the_deferred_setup(qtbot, tmp_path) -> None:
    """Productive use: a user who deferred setup runs it later from the Workspace view.
    Expected outcome: the sidebar action opens the modal listing the deferred task, and
    running it from there completes and records it."""
    workspace, log = _workspace(tmp_path)
    registry.record_skipped(workspace, [SERENA])

    window = _open_window(qtbot, workspace)
    window.show_view("workspace")
    settle(qtbot)

    click_by_name(qtbot, window.workspace, "Initialize Project…", QPushButton)
    modal = _await_modal(qtbot, window)
    assert modal.task_ids == (SERENA,), "a deferred task is still unresolved work"

    click_by_name(qtbot, modal, "Initialize project", QPushButton)
    qtbot.waitUntil(lambda: modal.state == "done", timeout=60_000)

    assert _subcommands(log) == ["project create", "project index", "memories initialize"]
    recorded = _recorded(workspace)
    assert recorded["completed"] == [SERENA]
    assert recorded["skipped"] == []
    window.close()


@verifies(SWR.SWR_2805)
def test_settings_action_opens_the_same_modal(qtbot, tmp_path) -> None:
    """Productive use: a user who deferred setup restarts it from Settings ▸ Project.
    Expected outcome: the Settings action opens the very same prompt, listing the
    unresolved task rather than a separate one-off screen."""
    workspace, _log = _workspace(tmp_path)
    registry.record_skipped(workspace, [SERENA])

    window = _open_window(qtbot, workspace)
    settle(qtbot)
    assert _modal(window) is None, "a workspace that already answered must not be re-prompted"

    window.show_view("settings")
    window.settings.set_active_tab("project")
    settle(qtbot)
    click_by_name(qtbot, window.settings, "Initialize Project…", QPushButton)

    modal = _await_modal(qtbot, window)
    assert modal.task_ids == (SERENA,)
    window.close()


# ── failure, retry, and the states in between ───────────────────────────


@verifies(SWR.SWR_2820, SWR.SWR_2821)
def test_a_failed_background_setup_records_nothing_and_offers_a_retry(qtbot, tmp_path) -> None:
    """Productive use: setup fails on a machine where Serena cannot start, and the user
    is told rather than left wondering why symbol search is slow.

    Expected outcome: nothing is recorded so the work is still pending, a notice offers
    the same manual re-run, and — the point of a background task — runs are never gated
    by the failure."""
    workspace, log = _workspace(tmp_path)
    (log.parent / "fail").write_text("", encoding="utf-8")

    window = _open_window(qtbot, workspace)
    _await_setup(qtbot, window, workspace)

    assert _recorded(workspace) == {}, "a failed task must leave the workspace re-runnable"
    assert window.store.initialization.running is False
    assert window.store.initialization.pending == (SERENA,)
    assert _send_button(qtbot, window).isEnabled() is True, (
        "setup the user never authorized must not lock them out when it fails"
    )

    notice = window.store.ui.notice
    assert notice is not None
    assert notice.action_id == "project.initialize"
    window.close()


@verifies(SWR.SWR_2802)
def test_a_workspace_with_no_applicable_task_is_resolved_without_a_prompt(qtbot, tmp_path) -> None:
    """Productive use: a user opens a workspace where no setup task can run.
    Expected outcome: no prompt appears, runs are never gated, and the workspace is
    marked initialized so it is not re-checked on every open."""
    workspace, _log = _workspace(tmp_path, serena_command="definitely-not-installed-xyz")

    window = _open_window(qtbot, workspace)
    settle(qtbot)

    assert _modal(window) is None
    assert _send_button(qtbot, window).isEnabled() is True
    assert window.store.initialization.pending == ()
    assert window.store.initialization.never_initialized is False
    assert _recorded(workspace)["last_run"], "the workspace is marked initialized, not re-asked"
    window.close()


@verifies(SWR.SWR_2802, SWR.SWR_2820)
def test_closing_the_window_stops_the_setup_worker(qtbot, tmp_path) -> None:
    """Productive use: a user quits Rotaris while a large repository is still indexing.
    Expected outcome: the worker thread and the child process it launched are stopped
    before the window goes away, so the quit finishes instead of tearing down the
    process around a live thread and leaving a subprocess walking the tree."""
    workspace, log = _workspace(tmp_path)
    (log.parent / "hang").write_text("", encoding="utf-8")

    window = _open_window(qtbot, workspace)
    qtbot.waitUntil(lambda: window._project_init_worker is not None, timeout=30_000)
    worker = window._project_init_worker
    assert worker is not None
    qtbot.waitUntil(lambda: bool(_subcommands(log)), timeout=30_000)
    assert worker.isRunning()

    window.close()
    settle(qtbot)

    assert not worker.isRunning(), "a live QThread must not outlive the window that owns it"
    assert window._project_init_worker is None
    assert _modal(window) is None


@verifies(SWR.SWR_2802, SWR.SWR_2821)
def test_a_window_closed_before_its_deferred_setup_runs_starts_nothing(qtbot, tmp_path) -> None:
    """Productive use: a user quits during the first paint, before setup has begun.
    Expected outcome: the deferred resolve finds a closing window and starts no worker,
    rather than launching a thread nobody is left to stop.

    The window defers its setup check by one event-loop turn, so a close that
    lands inside that turn arrives *before* the check. `closeEvent` has already
    run its shutdown by then, so a worker started afterwards has no owner: it
    keeps indexing, and the destruction of its parent takes the process down
    with `QThread: Destroyed while thread is still running`. Reproduced in the
    parallel suite as an abort two files after the test that leaked it.
    """
    workspace, log = _workspace(tmp_path)
    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()

    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    window.close()

    # What the deferred `singleShot(0, ...)` would have delivered, delivered by
    # hand: the point is what a closed window does with it, not when Qt gets to
    # it. Calling it directly also keeps the test honest about the guard rather
    # than about event-loop timing.
    window._resolve_project_initialization()
    settle(qtbot)

    assert window._project_init_worker is None, "a closed window started a setup worker"
    assert not _subcommands(log), "a closed window launched a setup subprocess"
