"""Productive use: a first-time desktop user completes machine setup and reaches Rotaris.
Expected outcome: progress, recovery, accessibility, and resume lead into a usable MainWindow."""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.setup import SetupEvent, SetupEventKind, SetupOutcome
from shiboken6 import isValid
from ui_query import find_by_accessible_name

if TYPE_CHECKING:
    from pathlib import Path

from rotaris.main import create_window
from rotaris.setup_coordinator import SetupCoordinatorDialog, run_desktop_setup

pytestmark = pytest.mark.e2e


#: How long a `_click_when_ready` chain keeps looking before it gives up.
#: Generous, because the worker it waits on shares a core with seven other
#: pytest workers -- but finite, which is the point.
_CLICK_DEADLINE_S = 30.0


def _click_when_ready(
    dialog: SetupCoordinatorDialog, name: str, deadline: float | None = None
) -> None:
    """Click *name* once the dialog offers it, and stop rather than spin forever.

    Both bounds are load-bearing. The chain re-arms itself, and it closes over
    the dialog: a button that never appears leaves a timer firing every 15 ms
    for the rest of the session -- into *other tests'* event loops, against a
    dialog `qtbot` has since closed and scheduled for deletion. That crashes the
    worker with no Python frame naming the test that armed it, which is how this
    file kept turning up in the parallel run's faulthandler stacks while passing
    on its own.

    So the chain ends: at a deadline, and the moment the dialog's C++ object is
    gone. `dialog` is passed as the timer's context object as well, so Qt drops
    the pending call on destruction instead of delivering it to freed memory.
    """
    if deadline is None:
        deadline = time.monotonic() + _CLICK_DEADLINE_S
    if not isValid(dialog) or time.monotonic() > deadline:
        return

    def again() -> None:
        QTimer.singleShot(15, dialog, lambda: _click_when_ready(dialog, name, deadline))

    try:
        button = find_by_accessible_name(dialog, name, QPushButton)
    except (AssertionError, LookupError):
        again()
        return
    if not button.isVisible() or not button.isEnabled():
        again()
        return
    QTest.mouseClick(button, Qt.MouseButton.LeftButton)


@verifies(SWR.SWR_3715, SWR.SWR_3724)
def test_failure_details_continue_into_usable_main_window(
    qtbot, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: a first-time user understands a failed tool and opens Rotaris anyway.
    Expected outcome: copyable detail and Continue without tool hand off to a usable MainWindow."""
    accepted: list[bool] = []
    expected_servers = {"playwright": {"command": "npx", "args": ["@playwright/mcp@0.0.75"]}}

    def fail(**kwargs):  # type: ignore[no-untyped-def]
        assert kwargs["mcp_servers"] is expected_servers
        kwargs["emit"](SetupEvent(SetupEventKind.PROGRESS, "detect", "Detect machine tools", 0, 2))
        kwargs["emit"](
            SetupEvent(
                SetupEventKind.FAILURE,
                "install:git",
                "Provision Git failed",
                1,
                2,
                detail="command git exited 1: network unreachable",
            )
        )
        return SetupOutcome.DEGRADED

    monkeypatch.setattr("rotaris.setup_coordinator.run_setup", fail)
    monkeypatch.setattr(
        "rotaris.setup_coordinator.accept_degraded_setup", lambda: accepted.append(True)
    )
    monkeypatch.setattr("rotaris.setup_coordinator.activate_managed_tool_environment", lambda: {})
    dialog = SetupCoordinatorDialog(mcp_servers=expected_servers)
    qtbot.addWidget(dialog)
    setup_copy = " ".join(label.text().lower() for label in dialog.findChildren(QLabel))
    assert "uv" not in setup_copy
    assert "serena" not in setup_copy
    QTimer.singleShot(0, lambda: _click_when_ready(dialog, "Continue without tool"))

    assert dialog.start() == SetupOutcome.DEGRADED
    assert accepted == [True]
    assert "network unreachable" in dialog.details.toPlainText()

    window = create_window(tmp_path, demo=True)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    assert window.isVisible()
    assert window.minimumWidth() <= 1000
    assert window.minimumHeight() <= 680

    repairs: list[dict[str, object]] = []

    def repair(**kwargs: object) -> SetupOutcome:
        repairs.append(kwargs)
        return SetupOutcome.COMPLETE

    window.config_service = SimpleNamespace(workspace=tmp_path)
    monkeypatch.setattr("rotaris.setup_coordinator.run_desktop_setup", repair)
    window.show_view("settings")
    window.settings.set_active_tab("project")
    repair_button = find_by_accessible_name(
        window.settings, "Repair machine tools", QPushButton, visible_only=True
    )
    QTest.mouseClick(repair_button, Qt.MouseButton.LeftButton)
    assert repairs == [{"workspace": tmp_path, "manual": True, "parent": window}]


@verifies(SWR.SWR_3715)
def test_workspace_mcp_configuration_reaches_first_run_dialog(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: setup warms the exact MCP packages configured for this workspace.
    Expected outcome: the coordinator receives the resolved workspace MCP configuration."""
    expected_servers = {"custom": {"command": "npx", "args": ["custom-mcp@2.4.1"]}}
    captured: dict[str, object] = {}

    class FakeDialog:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

        def start(self) -> SetupOutcome:
            return SetupOutcome.COMPLETE

    monkeypatch.setattr("rotaris.setup_coordinator.activate_managed_tool_environment", lambda: {})
    monkeypatch.setattr("rotaris.setup_coordinator.setup_required", lambda **_kwargs: True)
    monkeypatch.setattr(
        "rotaris_core.config.load_config",
        lambda workspace: SimpleNamespace(mcp_servers=expected_servers),
    )
    monkeypatch.setattr("rotaris.setup_coordinator.SetupCoordinatorDialog", FakeDialog)

    assert run_desktop_setup(workspace=tmp_path) == SetupOutcome.COMPLETE
    assert captured["mcp_servers"] is expected_servers


@verifies(SWR.SWR_3715)
def test_cancel_then_resume_completes_from_the_same_coordinator(
    qtbot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user pauses a long setup and resumes completed work later.
    Expected outcome: cancellation exposes Resume setup and the resumed worker completes."""
    calls = 0

    def cancellable(**kwargs):  # type: ignore[no-untyped-def]
        nonlocal calls
        calls += 1
        kwargs["emit"](SetupEvent(SetupEventKind.PROGRESS, "install:git", "Provision Git", 0, 2))
        if calls == 1:
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and not kwargs["cancelled"]():
                time.sleep(0.01)
            kwargs["emit"](
                SetupEvent(SetupEventKind.CANCELLED, "install:git", "Setup cancelled", 0, 2)
            )
            return SetupOutcome.CANCELLED
        kwargs["emit"](SetupEvent(SetupEventKind.COMPLETE, "setup", "Machine setup complete", 2, 2))
        return SetupOutcome.COMPLETE

    monkeypatch.setattr("rotaris.setup_coordinator.run_setup", cancellable)
    dialog = SetupCoordinatorDialog()
    qtbot.addWidget(dialog)
    QTimer.singleShot(25, lambda: _click_when_ready(dialog, "Cancel"))
    QTimer.singleShot(80, lambda: _click_when_ready(dialog, "Resume setup"))

    assert dialog.start() == SetupOutcome.COMPLETE
    assert calls == 2


@verifies(SWR.SWR_3715)
def test_second_launch_skips_dialog_and_details_are_keyboard_reachable(
    qtbot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a returning keyboard user opens immediately and can inspect setup detail.
    Expected outcome: matching state skips construction; disclosure has an accessible name and Enter action."""
    monkeypatch.setattr("rotaris.setup_coordinator.activate_managed_tool_environment", lambda: {})
    monkeypatch.setattr("rotaris.setup_coordinator.setup_required", lambda **_kwargs: False)
    assert run_desktop_setup() == SetupOutcome.COMPLETE

    dialog = SetupCoordinatorDialog()
    qtbot.addWidget(dialog)
    dialog.show()
    disclosure = find_by_accessible_name(dialog, "Show machine setup details", QPushButton)
    disclosure.setFocus()
    qtbot.keyClick(disclosure, Qt.Key.Key_Return)
    assert dialog.details.isVisible()
