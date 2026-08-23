"""Accessible first-launch and repair coordinator for machine setup."""

from __future__ import annotations

from threading import Event
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, QThread, Signal, Slot
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QProgressBar,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.setup import (
    SetupEvent,
    SetupEventKind,
    SetupOutcome,
    accept_degraded_setup,
    activate_managed_tool_environment,
    run_setup,
    setup_required,
)

from rotaris.widgets import make_button

if TYPE_CHECKING:
    from pathlib import Path


@traces(SWR.SWR_3715)
class SetupWorker(QObject):
    setup_event = Signal(object)
    completed = Signal(str)
    failed = Signal(str)

    def __init__(
        self, *, manual: bool, cancel_event: Event, mcp_servers: dict[str, Any] | None
    ) -> None:
        super().__init__()
        self.manual = manual
        self.cancel_event = cancel_event
        self.mcp_servers = mcp_servers

    @Slot()
    def run(self) -> None:
        try:
            outcome = run_setup(
                emit=self.setup_event.emit,
                cancelled=self.cancel_event.is_set,
                manual=self.manual,
                mcp_servers=self.mcp_servers,
                continue_on_failure=False,
            )
        except Exception as exc:  # defensive host boundary
            self.failed.emit(str(exc))
            return
        self.completed.emit(outcome.value)


@traces(SWR.SWR_3715)
class SetupCoordinatorDialog(QDialog):
    """One setup surface shared by first launch and Settings repair."""

    def __init__(
        self,
        *,
        manual: bool = False,
        parent: QWidget | None = None,
        mcp_servers: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(parent)
        self.manual = manual
        self.mcp_servers = mcp_servers
        self.outcome = SetupOutcome.CANCELLED
        self._cancel_event = Event()
        self._thread: QThread | None = None
        self._worker: SetupWorker | None = None
        self.setWindowTitle("Rotaris machine setup")
        self.setAccessibleName("Rotaris machine setup")
        self.setModal(True)
        self.resize(760, 560)

        layout = QVBoxLayout(self)
        title = QLabel("Repair machine tools" if manual else "Preparing Rotaris")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        explanation = QLabel(
            "Rotaris is checking Git, uv, Node, ripgrep, and the package caches used by MCP servers."
        )
        explanation.setWordWrap(True)
        layout.addWidget(explanation)

        self.status = QLabel("Ready to start")
        self.status.setAccessibleName("Machine setup current action")
        layout.addWidget(self.status)
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setAccessibleName("Machine setup progress")
        layout.addWidget(self.progress)
        self.steps = QListWidget()
        self.steps.setAccessibleName("Machine setup steps")
        layout.addWidget(self.steps, 1)

        self.details_button = make_button("Show details", "secondary")
        self.details_button.setAccessibleName("Show machine setup details")
        self.details_button.clicked.connect(self._toggle_details)
        layout.addWidget(self.details_button)
        self.details = QTextEdit()
        self.details.setReadOnly(True)
        self.details.setAccessibleName("Machine setup details")
        self.details.hide()
        layout.addWidget(self.details, 1)

        actions = QHBoxLayout()
        self.cancel_button = make_button("Cancel", "secondary")
        self.cancel_button.clicked.connect(self._cancel)
        actions.addWidget(self.cancel_button)
        actions.addStretch(1)
        self.retry_button = make_button("Retry", "secondary")
        self.retry_button.clicked.connect(self._start)
        self.retry_button.hide()
        actions.addWidget(self.retry_button)
        self.continue_button = make_button("Continue without tool", "primary")
        self.continue_button.setAccessibleDescription(
            "Open Rotaris with a warning for capabilities that still need this tool"
        )
        self.continue_button.clicked.connect(self._continue_degraded)
        self.continue_button.hide()
        actions.addWidget(self.continue_button)
        self.resume_button = make_button("Resume setup", "primary")
        self.resume_button.clicked.connect(self._start)
        self.resume_button.hide()
        actions.addWidget(self.resume_button)
        self.open_button = make_button("Open Rotaris", "primary")
        self.open_button.clicked.connect(self.accept)
        self.open_button.hide()
        actions.addWidget(self.open_button)
        layout.addLayout(actions)

    def start(self) -> SetupOutcome:
        self._start()
        self.exec()
        return self.outcome

    @Slot()
    def _start(self) -> None:
        if self._thread is not None and self._thread.isRunning():
            return
        self._cancel_event = Event()
        self.retry_button.hide()
        self.continue_button.hide()
        self.resume_button.hide()
        self.open_button.hide()
        self.cancel_button.show()
        self.cancel_button.setEnabled(True)
        self.status.setText("Starting machine setup…")
        self._thread = QThread(self)
        self._worker = SetupWorker(
            manual=self.manual,
            cancel_event=self._cancel_event,
            mcp_servers=self.mcp_servers,
        )
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.setup_event.connect(self._on_event)
        self._worker.completed.connect(self._on_completed)
        self._worker.failed.connect(self._on_failed)
        self._worker.completed.connect(self._thread.quit)
        self._worker.failed.connect(self._thread.quit)
        self._thread.finished.connect(self._worker.deleteLater)
        self._thread.finished.connect(self._on_thread_finished)
        self._thread.finished.connect(self._thread.deleteLater)
        self._thread.start()

    @Slot(object)
    def _on_event(self, raw: object) -> None:
        if not isinstance(raw, SetupEvent):
            return
        if raw.kind == SetupEventKind.PROGRESS:
            self.status.setText(raw.message)
            row = f"▶ {raw.message}"
            self.steps.addItem(row)
        elif raw.kind == SetupEventKind.COMPLETE:
            self.steps.addItem(f"✓ {raw.message} ({raw.elapsed_seconds:.1f}s)")
        elif raw.kind == SetupEventKind.FAILURE:
            self.status.setText(raw.message)
            self.steps.addItem(f"Failed — {raw.message}")
        elif raw.kind == SetupEventKind.CANCELLED:
            self.status.setText(raw.message)
        if raw.total:
            percent = int(raw.completed * 100 / raw.total)
            self.progress.setValue(percent)
            self.progress.setFormat(f"{raw.completed}/{raw.total} — {percent}%")
        detail = raw.detail or (raw.message if raw.kind == SetupEventKind.DETAIL else "")
        if detail:
            self.details.append(detail)

    @Slot(str)
    def _on_completed(self, value: str) -> None:
        self.outcome = SetupOutcome(value)
        self.cancel_button.hide()
        if self.outcome == SetupOutcome.COMPLETE:
            self.progress.setValue(100)
            self.status.setText("Machine setup complete")
        elif self.outcome == SetupOutcome.ALREADY_RUNNING:
            self.status.setText("Machine setup is already running in another Rotaris process")
        elif self.outcome == SetupOutcome.CANCELLED:
            self.status.setText("Setup paused. Completed steps are saved.")
        else:
            self.status.setText("A machine tool still needs attention")

    @Slot(str)
    def _on_failed(self, message: str) -> None:
        self.outcome = SetupOutcome.DEGRADED
        self.status.setText("Machine setup failed")
        self.details.append(message)
        self.cancel_button.hide()

    @Slot()
    def _on_thread_finished(self) -> None:
        """Expose the next action only after the worker thread is fully stopped."""
        self._thread = None
        self._worker = None
        if self.outcome == SetupOutcome.COMPLETE:
            self.accept()
        elif self.outcome == SetupOutcome.ALREADY_RUNNING:
            self.open_button.show()
        elif self.outcome == SetupOutcome.CANCELLED:
            self.resume_button.show()
            self.open_button.show()
        else:
            self.retry_button.show()
            self.continue_button.show()

    @Slot()
    def _cancel(self) -> None:
        self._cancel_event.set()
        self.cancel_button.setEnabled(False)
        self.status.setText("Cancelling after the current step…")

    @Slot()
    def _continue_degraded(self) -> None:
        accept_degraded_setup()
        activate_managed_tool_environment()
        self.outcome = SetupOutcome.DEGRADED
        self.accept()

    @Slot()
    def _toggle_details(self) -> None:
        visible = not self.details.isVisible()
        self.details.setVisible(visible)
        self.details_button.setText("Hide details" if visible else "Show details")

    def reject(self) -> None:
        if self._thread is not None and self._thread.isRunning():
            self._cancel()
            return
        super().reject()


@traces(SWR.SWR_3715)
def run_desktop_setup(
    *,
    workspace: Path | None = None,
    manual: bool = False,
    parent: QWidget | None = None,
) -> SetupOutcome:
    activate_managed_tool_environment()
    if not setup_required(manual=manual):
        return SetupOutcome.COMPLETE
    mcp_servers = None
    if workspace is not None:
        from rotaris_core.config import load_config

        mcp_servers = load_config(workspace.resolve()).mcp_servers
    dialog = SetupCoordinatorDialog(
        manual=manual,
        parent=parent,
        mcp_servers=mcp_servers,
    )
    return dialog.start()


def process_events() -> None:
    """Small test seam for hosts that need queued setup signals drained."""
    QApplication.processEvents()
