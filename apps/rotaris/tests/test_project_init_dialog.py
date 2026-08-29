"""Productive use: a user opens a workspace that has never been set up.

Expected outcome: the modal lists what would run, Initialize runs it off the GUI
thread and reports every step, closing the modal defers instead of consenting,
and a failure keeps the modal open with a retry that has something left to run.

The host class below is deliberately the whole wiring the main window will do
(unit U9): the modal emits intent, the host records it and drives
:class:`ProjectInitService`. Tests drive controls by accessible name so an
unwired button fails here instead of shipping.
"""

from __future__ import annotations

import json
import sys
import textwrap
import threading
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import pytest
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QPlainTextEdit, QPushButton, QWidget
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.init.registry import InitStepResult, InitTaskResult
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, find_by_accessible_name, settle, wait_until

from rotaris.models.store import WorkspaceStore
from rotaris.services.project_init_service import ProjectInitService
from rotaris.widgets.project_init_dialog import ProjectInitDialog

# These tests are *about* project initialization, so they opt back in to the
# real registry run the suite otherwise neutralises (see `conftest.py`'s
# `no_unasked_project_initialization`). Each points the workspace at a fake
# `serena` of its own, so the run stays hermetic.
pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("real_project_initialization")]

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

SERENA = "serena-setup"


@dataclass(frozen=True)
class _Task:
    """Minimal task descriptor — the modal only needs id, label, description."""

    id: str
    label: str
    description: str = "What this task does."
    prerequisite_met: Callable[[Any, Any], bool] = field(default=lambda _c, _r: True)
    run: Any = None
    requires_consent: bool = False


def _serena_task(runner: Any = None) -> _Task:
    return _Task(
        id=SERENA,
        label="Serena project setup",
        description="Activate this project in Serena and write onboarding memories.",
        run=runner,
    )


class _Host(QWidget):
    """The wiring unit U9 owns: open the modal, record the intent, drive the run."""

    def __init__(
        self,
        tasks: Sequence[Any],
        *,
        deliverable: bool = True,
        run_context: tuple[Any, Path] | None = None,
    ) -> None:
        super().__init__()
        self.intents: list[str] = []
        self.results: list[InitTaskResult] = []
        self.service: ProjectInitService | None = None
        self._tasks = list(tasks)
        self._deliverable = deliverable
        self._run_context = run_context

        self.dialog = ProjectInitDialog(self)
        self.dialog.set_tasks(self._tasks)
        self.dialog.resolved.connect(self._on_resolved)

    def _on_resolved(self, intent: str) -> None:
        self.intents.append(intent)
        if not self._deliverable:
            self.dialog.show_error("Setup could not be started: the workspace is not reachable.")
            return
        if intent == "skip":
            self.dialog.complete_decision()
            return

        self.dialog.set_in_progress()
        if self._run_context is None:
            return
        config, workspace = self._run_context
        service = ProjectInitService(config, workspace, tasks=self._tasks, parent=self)
        service.task_started.connect(self.dialog.report_task_started)
        service.step_reported.connect(self.dialog.report_step)
        service.task_finished.connect(self._on_task_finished)
        service.run_finished.connect(self._on_run_finished)
        service.run_failed.connect(self.dialog.show_error)
        self.service = service
        service.start()

    def _on_task_finished(self, task_id: str, result: InitTaskResult) -> None:
        self.dialog.report_task_finished(task_id, result.status, result.error or "")

    def _on_run_finished(self, results: list[InitTaskResult]) -> None:
        self.results = list(results)
        failures = [result for result in self.results if result.status == "failure"]
        if failures:
            self.dialog.show_error(failures[0].error or "Initialization did not finish.")
        else:
            self.dialog.show_done()

    def shutdown(self) -> None:
        if self.service is not None:
            self.service.shutdown()


def _dialogs(host: QWidget) -> list[ProjectInitDialog]:
    return [child for child in host.children() if isinstance(child, ProjectInitDialog)]


@pytest.fixture
def open_prompt(qtbot):
    """Open the modal the way the host will, and tear its worker down after."""
    hosts: list[_Host] = []

    def _open(
        tasks: Sequence[Any] = (),
        *,
        deliverable: bool = True,
        run_context: tuple[Any, Path] | None = None,
    ) -> _Host:
        host = _Host(
            tasks or (_serena_task(),),
            deliverable=deliverable,
            run_context=run_context,
        )
        qtbot.addWidget(host)
        hosts.append(host)
        host.dialog.show()
        qtbot.waitExposed(host.dialog)
        return host

    yield _open

    for host in hosts:
        host.shutdown()


def _progress_text(dialog: ProjectInitDialog) -> str:
    return find_by_accessible_name(dialog, "Initialization progress", QPlainTextEdit).toPlainText()


def _task_status(dialog: ProjectInitDialog, label: str) -> str:
    """The state word a screen reader announces for one listed task."""
    return find_by_accessible_name(dialog, f"{label} status", QLabel).text()


# ── the prompt and its exits ────────────────────────────────────────────


@verifies(SWR.SWR_2802)
def test_initialize_asks_the_host_to_run_the_listed_tasks(qtbot, open_prompt) -> None:
    host = open_prompt()
    dialog = _dialogs(host)[0]
    assert dialog.task_ids == (SERENA,)

    click_by_name(qtbot, dialog, "Initialize project", QPushButton)

    assert host.intents == ["initialize"]
    assert dialog.state == "running"
    assert dialog.isVisible(), "the modal reports the run it started"


@verifies(SWR.SWR_2802)
def test_closing_the_modal_defers_instead_of_initializing(qtbot, open_prompt) -> None:
    host = open_prompt()
    dialog = _dialogs(host)[0]

    dialog.close()
    settle(qtbot)

    assert host.intents == ["skip"], "a dismissed prompt must never read as consent"
    assert not dialog.isVisible()


@verifies(SWR.SWR_2802)
def test_escape_defers_instead_of_leaving_the_prompt_unresolved(qtbot, open_prompt) -> None:
    host = open_prompt()
    dialog = _dialogs(host)[0]

    qtbot.keyClick(dialog, Qt.Key.Key_Escape)
    settle(qtbot)

    assert host.intents == ["skip"]
    assert not dialog.isVisible()


@verifies(SWR.SWR_2802)
def test_skip_closes_only_after_the_host_recorded_it(qtbot, open_prompt) -> None:
    host = open_prompt(deliverable=False)
    dialog = _dialogs(host)[0]

    click_by_name(qtbot, dialog, "Skip for now", QPushButton)

    assert host.intents == ["skip"]
    assert dialog.isVisible(), "an unrecorded skip must not disappear off the screen"
    assert dialog.state == "error"


# ── running, failing, retrying ──────────────────────────────────────────


@verifies(SWR.SWR_2802)
def test_undeliverable_run_keeps_the_modal_open_with_a_retry(qtbot, open_prompt) -> None:
    host = open_prompt(deliverable=False)
    dialog = _dialogs(host)[0]

    click_by_name(qtbot, dialog, "Initialize project", QPushButton)

    assert dialog.isVisible()
    assert dialog.state == "error"
    status = find_by_accessible_name(
        dialog, "Setup could not be started: the workspace is not reachable."
    )
    assert status.isVisible()
    # Skip stays open as the other way out: nothing was recorded either way.
    assert find_by_accessible_name(dialog, "Skip for now", QPushButton).isEnabled()

    click_by_name(qtbot, dialog, "Retry initialization", QPushButton)

    assert host.intents == ["initialize", "initialize"]


@verifies(SWR.SWR_2802, SWR.SWR_2803)
def test_per_step_progress_renders_as_steps_complete(qtbot, open_prompt) -> None:
    host = open_prompt()
    dialog = _dialogs(host)[0]
    click_by_name(qtbot, dialog, "Initialize project", QPushButton)

    dialog.report_task_started(SERENA, "Serena project setup")
    assert "Serena project setup" in _progress_text(dialog)
    assert _task_status(dialog, "Serena project setup") == "Running"

    dialog.report_step(SERENA, "activate_project", "success", "Serena project activated")
    assert "activate_project" in _progress_text(dialog)
    assert "Serena project activated" in _progress_text(dialog)
    assert "onboarding" not in _progress_text(dialog), "a step reports only once it finished"

    dialog.report_step(SERENA, "onboarding", "skipped", "no code found, onboarding skipped")
    dialog.report_task_finished(SERENA, "success")
    dialog.show_done()

    report = _progress_text(dialog)
    assert "no code found, onboarding skipped" in report
    assert _task_status(dialog, "Serena project setup") == "Done", (
        "state must be readable without colour"
    )
    assert dialog.state == "done"

    click_by_name(qtbot, dialog, "Close", QPushButton)
    assert host.intents == ["initialize"], "a finished run must not also record a skip"
    assert not dialog.isVisible()


@verifies(SWR.SWR_2800, SWR.SWR_2802)
def test_a_second_initialization_task_needs_no_ui_change(qtbot, open_prompt) -> None:
    """SWR-2800: new tasks join the prompt without changing the prompt contract."""
    extra = _Task(id="paths", label="Workspace paths", description="Record the source roots.")
    host = open_prompt((_serena_task(), extra))
    dialog = _dialogs(host)[0]

    assert dialog.task_ids == (SERENA, "paths")
    assert find_by_accessible_name(dialog, "Serena project setup task").isVisible()
    assert find_by_accessible_name(dialog, "Workspace paths task").isVisible()

    click_by_name(qtbot, dialog, "Initialize project", QPushButton)
    dialog.report_task_started("paths", "Workspace paths")

    assert _task_status(dialog, "Workspace paths") == "Running"
    assert _task_status(dialog, "Serena project setup") == "Pending"


@verifies(SWR.SWR_2802)
def test_every_modal_control_is_named_and_readable(qtbot, open_prompt) -> None:
    host = open_prompt()
    dialog = _dialogs(host)[0]

    assert unnamed_controls(dialog) == []
    assert text_contrast_violations(dialog) == []

    dialog.set_in_progress()
    dialog.report_step(SERENA, "activate_project", "success", "activated")
    settle(qtbot)
    assert text_contrast_violations(dialog) == []

    dialog.show_error("Serena did not respond.")
    settle(qtbot)
    assert unnamed_controls(dialog) == []
    assert text_contrast_violations(dialog) == []


# ── the worker thread ───────────────────────────────────────────────────


def _workspace(tmp_path: Path) -> Path:
    (tmp_path / ".rotaris").mkdir(parents=True, exist_ok=True)
    return tmp_path


@verifies(SWR.SWR_2802)
def test_service_runs_the_tasks_off_the_gui_thread(qtbot, tmp_path) -> None:
    from rotaris_core.config.project_init_state import read_initialization_state

    ran_on: list[int] = []

    def runner(config: Any, workspace_root: Path, **kwargs: Any) -> InitTaskResult:
        del config, workspace_root, kwargs
        ran_on.append(threading.get_ident())
        return InitTaskResult(
            task_id=SERENA,
            status="success",
            steps=(InitStepResult("activate_project", "success", "Serena project activated"),),
            classification="code",
        )

    workspace = _workspace(tmp_path)
    service = ProjectInitService(RotarisConfig(), workspace, tasks=[_serena_task(runner)])
    started: list[tuple[str, str]] = []
    steps: list[tuple[str, str, str, str]] = []
    service.task_started.connect(lambda *args: started.append(args))
    service.step_reported.connect(lambda *args: steps.append(args))

    with qtbot.waitSignal(service.run_finished, timeout=10_000) as blocker:
        service.start()
    service.wait()

    results = blocker.args[0]
    assert [result.task_id for result in results] == [SERENA]
    assert results[0].succeeded
    assert ran_on and ran_on[0] != threading.get_ident(), "the run must not block the event loop"
    assert started == [(SERENA, "Serena project setup")]
    assert steps == [(SERENA, "activate_project", "success", "Serena project activated")]
    recorded = read_initialization_state(workspace)
    assert recorded.completed == [SERENA]
    assert recorded.classification == "code"


@verifies(SWR.SWR_2802, SWR.SWR_2803)
def test_failing_task_stays_pending_so_the_retry_has_work(qtbot, tmp_path) -> None:
    from rotaris_core.config.project_init_state import read_initialization_state

    def runner(config: Any, workspace_root: Path, **kwargs: Any) -> InitTaskResult:
        del config, workspace_root, kwargs
        raise RuntimeError("serena activate_project failed: connection refused")

    workspace = _workspace(tmp_path)
    service = ProjectInitService(RotarisConfig(), workspace, tasks=[_serena_task(runner)])

    with qtbot.waitSignal(service.run_finished, timeout=10_000) as blocker:
        service.start()
    service.wait()

    result = blocker.args[0][0]
    assert result.status == "failure"
    assert "connection refused" in (result.error or "")
    recorded = read_initialization_state(workspace)
    assert recorded.completed == [] and recorded.skipped == []
    assert recorded.never_initialized is True


@verifies(SWR.SWR_2802)
def test_shutdown_ends_the_worker_without_prompting(qtbot, tmp_path) -> None:
    def slow(config: Any, workspace_root: Path, **kwargs: Any) -> InitTaskResult:
        del config, workspace_root, kwargs
        time.sleep(0.2)
        return InitTaskResult(task_id=SERENA, status="success")

    workspace = _workspace(tmp_path)
    service = ProjectInitService(
        RotarisConfig(),
        workspace,
        tasks=[_serena_task(slow), _Task(id="second", label="Second task", run=slow)],
    )
    service.start()
    wait_until(service.isRunning, timeout=5)

    assert service.shutdown(timeout_ms=10_000) is True
    assert not service.isRunning()


# ── end to end, against a real MCP server ───────────────────────────────

_SERENA_STUB = """
import json
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

LOG = Path(sys.argv[1])
mcp = FastMCP("serena-stub")


def _record(tool: str, payload: dict) -> None:
    entries = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else []
    entries.append({"tool": tool, **payload})
    LOG.write_text(json.dumps(entries), encoding="utf-8")


@mcp.tool(description="Activate a project so its symbols are searchable")
def activate_project(project: str) -> str:
    _record("activate_project", {"project": project})
    return "activated " + project


@mcp.tool(description="Analyze the project and write onboarding memories")
def onboarding() -> str:
    _record("onboarding", {})
    return "onboarding complete"


if __name__ == "__main__":
    mcp.run()
"""


def _mcp_serena_runner():
    """A task runner that really talks to the stub Serena server over stdio."""

    def runner(config: Any, workspace_root: Path, **kwargs: Any) -> InitTaskResult:
        del kwargs
        import asyncio

        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        server = config.mcp_servers["serena"]
        done: list[str] = []

        async def drive() -> None:
            params = StdioServerParameters(
                command=server.command or "",
                args=list(server.args),
                cwd=str(workspace_root),
            )
            async with (
                stdio_client(params) as (read_stream, write_stream),
                ClientSession(read_stream, write_stream) as session,
            ):
                await session.initialize()
                await session.call_tool("activate_project", {"project": str(workspace_root)})
                done.append("activate_project")
                await session.call_tool("onboarding", {})
                done.append("onboarding")

        try:
            asyncio.run(drive())
        except ExceptionGroup:
            # stdio_client cleanup can raise once the pipes are already closed;
            # the tool calls above had answered by then.
            if len(done) != 2:
                raise

        return InitTaskResult(
            task_id=SERENA,
            status="success",
            steps=(
                InitStepResult("activate_project", "success", "Serena project activated"),
                InitStepResult("onboarding", "success", "Onboarding memories written"),
            ),
            classification="code",
        )

    return runner


@verifies(SWR.SWR_2801, SWR.SWR_2802, SWR.SWR_2821)
def test_initialization_from_the_modal_reaches_a_real_server(qtbot, tmp_path, monkeypatch) -> None:
    """Productive use: a user runs setup from the modal — the SWR-2805 manual path, and
    the path any future task that needs their consent will take.

    Expected outcome: Initialize runs the task off the GUI thread against a real external
    process, every step reaches the report, and the workspace config records the outcome.
    The workspace itself is projected without a prompt, because what it owes is
    deterministic (SWR-2820); the modal here is the one the user opened.
    """
    from rotaris.services.config_service import ConfigService

    workspace = _workspace(tmp_path / "workspace")
    stub = tmp_path / "serena_stub.py"
    stub.write_text(textwrap.dedent(_SERENA_STUB).strip(), encoding="utf-8")
    stub_log = tmp_path / "serena_calls.json"
    (workspace / ".mcp.json").write_text(
        json.dumps(
            {
                "mcpServers": {
                    "serena": {"command": sys.executable, "args": [str(stub), str(stub_log)]}
                }
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(ConfigService, "_providers", lambda self: [])
    monkeypatch.setattr(ConfigService, "_subscription_limits", lambda self: [])
    config_service = ConfigService(workspace, WorkspaceStore())
    config_service.load()

    state = config_service.store.initialization
    assert state.pending == (SERENA,)
    assert state.should_prompt is False, "deterministic setup is not the user's to authorize"

    task = _serena_task(_mcp_serena_runner())
    host = _Host([task], run_context=(config_service.config, workspace))
    qtbot.addWidget(host)
    host.dialog.show()
    qtbot.waitExposed(host.dialog)

    try:
        assert find_by_accessible_name(host.dialog, "Serena project setup task").isVisible()
        click_by_name(qtbot, host.dialog, "Initialize project", QPushButton)
        wait_until(lambda: host.dialog.state == "done", timeout=60)
    finally:
        host.shutdown()

    calls = json.loads(stub_log.read_text(encoding="utf-8"))
    assert [entry["tool"] for entry in calls] == ["activate_project", "onboarding"]
    assert calls[0]["project"] == str(workspace)

    report = _progress_text(host.dialog)
    assert "Serena project activated" in report
    assert "Onboarding memories written" in report
    assert [result.status for result in host.results] == ["success"]

    config_service.load()
    resolved = config_service.store.initialization
    assert resolved.completed == (SERENA,)
    assert resolved.pending == ()
    assert resolved.should_prompt is False
    assert resolved.classification == "code"
