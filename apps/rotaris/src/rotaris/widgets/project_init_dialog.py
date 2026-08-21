"""Project-initialization modal — lists the pending setup tasks and reports the run.

The modal is deliberately task-agnostic (SWR-2800): it renders whatever
descriptors it is handed, so a future initialization task joins the prompt
without a UI change. It also never talks to the backend. Pressing a button
emits an intent on :attr:`ProjectInitDialog.resolved`; the host records the
outcome, drives the run, and feeds progress back in. That split is what lets
one modal serve both the first-run prompt (SWR-2802) and the manual re-trigger
(SWR-2805) without knowing which one opened it.

Every exit path yields an explicit decision. An unresolved prompt gates agent
execution, so the window close box and Escape resolve as ``"skip"`` rather than
leaving the workspace in limbo — the same rule the permission modal follows for
``"deny"``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, override

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import make_button, set_action_availability

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris.theme.spec import Theme

INITIALIZE = "initialize"
"""Intent emitted when the user wants the pending tasks to run."""

SKIP = "skip"
"""Intent emitted when the user defers the pending tasks — including on close."""

#: Prompt → in-progress → done / error. Kept as plain strings so a test can
#: assert the modal's state without importing an enum from the view layer.
STATE_PROMPT = "prompt"
STATE_RUNNING = "running"
STATE_DONE = "done"
STATE_ERROR = "error"

# Status is never conveyed by colour alone: each state carries a word, and the
# glyph is only a redundant cue next to it.
_STEP_GLYPHS = {"success": "✓", "skipped": "–", "failure": "✕"}
_TASK_WORDS = {
    "pending": "Pending",
    "running": "Running",
    "success": "Done",
    "skipped": "Skipped",
    "failure": "Failed",
}


class InitTaskView(Protocol):
    """The read-only shape the modal needs from one initialization task.

    Structural on purpose: ``rotaris_core.init.registry.InitTask`` satisfies it,
    and so does any future descriptor, without the widget layer importing a
    backend type or a task ever needing to know a modal exists.
    """

    @property
    def id(self) -> str: ...

    @property
    def label(self) -> str: ...

    @property
    def description(self) -> str: ...


class _TaskRow(Themed, QFrame):
    """One pending task: what it is, what it does, and where it stands."""

    def __init__(self, task: InitTaskView, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.task_id = task.id
        self.label = task.label or task.id
        self._description = task.description
        # A bordered surface holding a title, a state and a body line is the
        # design system's card; naming it one is what keeps its ground, border
        # and radius in the stylesheet instead of here.
        self.setObjectName("card")

        space = tokens().space
        layout = QVBoxLayout(self)
        layout.setContentsMargins(space.md, space.sm, space.md, space.sm)
        layout.setSpacing(space.xs)

        header = QHBoxLayout()
        header.setSpacing(space[1.25])
        self.title_label = QLabel(self.label)
        self.title_label.setWordWrap(True)
        header.addWidget(self.title_label, 1)
        self.state_label = QLabel()
        self.state_label.setObjectName("muted")
        # Named separately from the row so the state is announced (and asserted)
        # as its own value rather than only as part of the row's description.
        self.state_label.setAccessibleName(f"{self.label} status")
        header.addWidget(self.state_label, 0, Qt.AlignmentFlag.AlignRight)
        layout.addLayout(header)

        self.description_label = QLabel(self._description)
        self.description_label.setObjectName("muted")
        self.description_label.setWordWrap(True)
        layout.addWidget(self.description_label)

        # "… task" rather than the bare label: the row and its own title would
        # otherwise be announced identically, and a lookup by name is ambiguous.
        self.setAccessibleName(f"{self.label} task")
        self.set_status("pending")
        self.install_theme_hook()

    def set_status(self, status: str) -> None:
        """Render one of the task states as a word plus an accessible description."""
        word = _TASK_WORDS.get(status, status)
        self.state_label.setText(word)
        detail = f"{self.label}: {word}."
        self.setAccessibleDescription(f"{detail} {self._description}".strip())

    @override
    def apply_theme(self, theme: Theme) -> None:
        # Weight is the only thing separating the task's name from its own
        # description; colour comes from the stylesheet's default text.
        self.title_label.setStyleSheet(
            f"font-size:{theme.type.scale.sm}px;font-weight:{theme.type.weight_display};"
        )


@traces(SWR.SWR_2802)
class ProjectInitDialog(Themed, QDialog):
    """Modal offering to run the workspace's pending initialization tasks.

    The four states ``apps/rotaris/AGENTS.md`` requires are explicit:

    - **prompt** — :meth:`set_tasks` lists what would run, with Initialize and
      Skip. Skip is a real answer, not a dismissal.
    - **in progress** — :meth:`set_in_progress` locks both answers and
      :meth:`report_task_started` / :meth:`report_step` stream the run.
    - **done** — :meth:`show_done` keeps the per-step report on screen with a
      close action, so a "Serena activated, no code memories created" outcome
      is readable rather than flashing past.
    - **error** — :meth:`show_error` keeps the modal open, states what failed,
      and offers Retry, because a failed task records nothing and stays pending.
    """

    #: Emits ``"initialize"`` or ``"skip"``; the host delivers the decision.
    resolved = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Set up this project")
        self.setMinimumSize(560, 420)
        self.setModal(True)
        self.setAccessibleName("Project initialization")
        self.setAccessibleDescription(
            "Offers to run the one-time setup tasks this workspace has not run yet."
        )

        self._rows: list[_TaskRow] = []
        self._state = STATE_PROMPT
        self._decided = False

        space = tokens().space
        root = QVBoxLayout(self)
        root.setContentsMargins(space.xl, space[2.5], space.xl, space[2.5])
        root.setSpacing(space.md)

        self._headline = QLabel("Set up this project?")
        self._headline.setObjectName("heading")
        self._headline.setWordWrap(True)
        root.addWidget(self._headline)

        self._intro = QLabel()
        self._intro.setObjectName("muted")
        self._intro.setWordWrap(True)
        root.addWidget(self._intro)

        divider = QFrame()
        divider.setFrameShape(QFrame.Shape.HLine)
        divider.setObjectName("projectInitDivider")
        divider.setProperty("role", "divider")
        root.addWidget(divider)

        self._task_container = QWidget()
        self._task_container.setAccessibleName("Pending initialization tasks")
        self._task_layout = QVBoxLayout(self._task_container)
        self._task_layout.setContentsMargins(0, 0, 0, 0)
        self._task_layout.setSpacing(space.sm)
        root.addWidget(self._task_container)

        self._progress = QPlainTextEdit()
        self._progress.setObjectName("projectInitProgress")
        # The report is a run log — the steps only line up under a mono face.
        self._progress.setProperty("mono", "true")
        self._progress.setReadOnly(True)
        self._progress.setVisible(False)
        self._progress.setAccessibleName("Initialization progress")
        self._progress.setAccessibleDescription(
            "One line per completed step, newest last. Selectable so it can be copied."
        )
        root.addWidget(self._progress, stretch=1)

        self._status_label = QLabel()
        self._status_label.setObjectName("projectInitStatus")
        self._status_label.setWordWrap(True)
        self._status_label.setVisible(False)
        self._status_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        root.addWidget(self._status_label)

        buttons = QHBoxLayout()
        buttons.setSpacing(space[1.25])

        self._skip_button = make_button("Skip for now", "secondary")
        self._skip_button.setObjectName("projectInitSkip")
        self._skip_button.setAccessibleName("Skip for now")
        self._skip_button.setAccessibleDescription(
            "Defer these tasks. You can run them later from Settings › Project."
        )
        self._skip_button.clicked.connect(lambda: self._decide(SKIP))
        buttons.addWidget(self._skip_button)

        buttons.addStretch(1)

        # Primary, not secondary: in the error state Retry is the one action the
        # dialog is asking for, and it is what Enter reaches.
        self._retry_button = make_button("Retry initialization", "primary")
        self._retry_button.setObjectName("projectInitRetry")
        self._retry_button.setAccessibleName("Retry initialization")
        self._retry_button.setAccessibleDescription(
            "Run the tasks that failed again. Nothing was recorded, so none of them are skipped."
        )
        self._retry_button.setVisible(False)
        self._retry_button.clicked.connect(lambda: self._decide(INITIALIZE))
        buttons.addWidget(self._retry_button)

        self._close_button = make_button("Close", "secondary")
        self._close_button.setObjectName("projectInitClose")
        self._close_button.setAccessibleName("Close")
        self._close_button.setAccessibleDescription("Dismiss this report. Setup already finished.")
        self._close_button.setVisible(False)
        self._close_button.clicked.connect(self._close_clicked)
        buttons.addWidget(self._close_button)

        self._start_button = make_button("Initialize project", "primary")
        self._start_button.setObjectName("projectInitStart")
        self._start_button.setAccessibleName("Initialize project")
        self._start_button.setAccessibleDescription(
            "Run every listed task now. Each one reports its own result below."
        )
        self._start_button.setDefault(True)
        self._start_button.clicked.connect(lambda: self._decide(INITIALIZE))
        buttons.addWidget(self._start_button)

        # Availability metadata overwrites a control's accessible description
        # while it is disabled; keep the authored one so re-enabling restores
        # what the control actually does instead of leaving it silent.
        for button in (
            self._skip_button,
            self._retry_button,
            self._close_button,
            self._start_button,
        ):
            button.setProperty("defaultDescription", button.accessibleDescription())

        root.addLayout(buttons)
        self.set_tasks(())
        self.install_theme_hook()

    # ── Public API ──────────────────────────────────────────────────────

    @property
    def state(self) -> str:
        """One of ``prompt``, ``running``, ``done``, ``error``."""
        return self._state

    @property
    def task_ids(self) -> tuple[str, ...]:
        """Ids of the tasks currently listed, in the order they will run."""
        return tuple(row.task_id for row in self._rows)

    def set_tasks(self, tasks: Sequence[InitTaskView]) -> None:
        """List *tasks* and return to the prompt state.

        Renders whatever it is given: one task, five, or none. Nothing here
        knows what a task does, which is the whole point of SWR-2800's
        "additional initialization tasks without changing the prompt contract".
        """
        self._clear_rows()
        for task in tasks:
            row = _TaskRow(task, self._task_container)
            self._task_layout.addWidget(row)
            self._rows.append(row)

        count = len(self._rows)
        self._headline.setText("Set up this project?" if count else "Nothing to set up")
        self._intro.setText(
            (
                f"{count} one-time setup task{'s' if count != 1 else ''} "
                "can run in this workspace. They run once; you can skip them and "
                "start any time from Settings › Project."
            )
            if count
            else "This workspace has no setup task left to run."
        )
        self._task_container.setVisible(bool(count))
        self._progress.setPlainText("")
        self._progress.setVisible(False)
        self._status_label.setVisible(False)
        self._enter_state(STATE_PROMPT)

    def set_in_progress(self, message: str = "") -> None:
        """Enter the in-progress state; the host calls this once the run starts."""
        if not self._progress.toPlainText():
            # The report is the only thing on screen during a run that can take
            # minutes; an empty box would read as nothing happening.
            self._progress.setPlainText("Setup started. Each step appears here as it finishes.")
        self._progress.setVisible(True)
        self._set_status(message or "Setting up this project. This can take a few minutes.")
        self._enter_state(STATE_RUNNING)

    def report_task_started(self, task_id: str, label: str = "") -> None:
        """Mark *task_id* as running and head its section of the report."""
        row = self._row(task_id)
        name = label or (row.label if row is not None else task_id)
        if row is not None:
            row.set_status("running")
        self._append_line(f"▶ {name}")
        self._set_status(f"Running {name}…")

    def report_step(self, task_id: str, name: str, status: str, detail: str = "") -> None:
        """Append one finished step of *task_id* to the report.

        `detail` is rendered verbatim — it is the backend's own one-line
        account of what happened, and paraphrasing it here would lose the
        specifics a retry decision needs.
        """
        del task_id  # Steps append in run order; the task heading above names them.
        glyph = _STEP_GLYPHS.get(status, "•")
        line = f"    {glyph} {name} — {status}"
        self._append_line(f"{line}: {detail}" if detail else line)

    def report_task_finished(self, task_id: str, status: str, error: str = "") -> None:
        """Record *task_id*'s outcome in the list and in the report."""
        row = self._row(task_id)
        if row is not None:
            row.set_status(status)
        name = row.label if row is not None else task_id
        word = _TASK_WORDS.get(status, status)
        glyph = _STEP_GLYPHS.get(status, "•")
        self._append_line(f"{glyph} {name} — {word}" + (f": {error}" if error else ""))

    def show_done(self, message: str = "") -> None:
        """Report a finished run and offer to close, keeping the report readable."""
        self._decided = True
        self._headline.setText("Project setup finished")
        self._progress.setVisible(True)
        self._set_status(message or "Setup finished. The results are listed above.")
        self._enter_state(STATE_DONE)

    def show_error(self, message: str) -> None:
        """Report a failed or undeliverable run and keep the modal open to retry.

        The decision is reopened on purpose: a failed task records nothing, so
        the user still owes an answer and closing the modal now defers the
        tasks rather than silently swallowing them.
        """
        self._decided = False
        self._headline.setText("Project setup did not finish")
        self._set_status(message)
        self._enter_state(STATE_ERROR)

    def complete_decision(self) -> None:
        """Close, once the host confirms the decision was recorded."""
        self._decided = True
        self.accept()

    # ── Internal helpers ────────────────────────────────────────────────

    def _decide(self, intent: str) -> None:
        self._decided = True
        if intent == INITIALIZE:
            self._lock_controls("Initialization is starting.")
            self._set_status("Starting setup…")
        else:
            self._lock_controls("Your choice is being recorded.")
        self.resolved.emit(intent)

    def _row(self, task_id: str) -> _TaskRow | None:
        return next((row for row in self._rows if row.task_id == task_id), None)

    def _clear_rows(self) -> None:
        for row in self._rows:
            self._task_layout.removeWidget(row)
            row.hide()
            row.setParent(None)
            row.deleteLater()
        self._rows.clear()

    def _append_line(self, line: str) -> None:
        self._progress.setVisible(True)
        self._progress.appendPlainText(line)

    def _set_status(self, message: str) -> None:
        self._status_label.setText(message)
        self._status_label.setVisible(bool(message))
        self._status_label.setAccessibleName(message)

    def _set_available(self, button: QPushButton, *, enabled: bool, reason: str = "") -> None:
        set_action_availability(button, enabled=enabled, reason=reason)
        if enabled:
            button.setAccessibleDescription(str(button.property("defaultDescription") or ""))

    def _close_clicked(self) -> None:
        # Reachable from the "nothing to set up" prompt too, where closing is
        # still an answer the host has to record.
        if not self._decided:
            self._decide(SKIP)
        self.accept()

    def _lock_controls(self, reason: str) -> None:
        self._set_available(self._start_button, enabled=False, reason=reason)
        self._set_available(self._retry_button, enabled=False, reason=reason)
        self._set_available(self._skip_button, enabled=False, reason=reason)

    def _enter_state(self, state: str) -> None:
        self._state = state
        has_tasks = bool(self._rows)
        no_task_reason = "This workspace has no setup task left to run."

        if state == STATE_PROMPT:
            self._set_available(
                self._start_button,
                enabled=has_tasks,
                reason="" if has_tasks else no_task_reason,
            )
            self._set_available(self._skip_button, enabled=True)
            self._start_button.setVisible(True)
            self._retry_button.setVisible(False)
            self._close_button.setVisible(not has_tasks)
        elif state == STATE_RUNNING:
            self._lock_controls("Setup is running. It reports each step as it finishes.")
            self._start_button.setVisible(True)
            self._retry_button.setVisible(False)
            self._close_button.setVisible(False)
        elif state == STATE_DONE:
            self._lock_controls("Setup already finished for this workspace.")
            self._start_button.setVisible(False)
            self._retry_button.setVisible(False)
            self._close_button.setVisible(True)
            self._close_button.setDefault(True)
            self._close_button.setFocus()
        else:  # STATE_ERROR
            self._set_available(
                self._retry_button,
                enabled=has_tasks,
                reason="" if has_tasks else no_task_reason,
            )
            self._set_available(self._skip_button, enabled=True)
            self._start_button.setVisible(False)
            self._retry_button.setVisible(True)
            self._retry_button.setDefault(True)
            self._retry_button.setFocus()
            self._close_button.setVisible(False)
        self.apply_theme(tokens())

    @override
    def closeEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        # A dismissed prompt still gates agent execution, so closing is a skip.
        if not self._decided:
            self._decide(SKIP)
        super().closeEvent(event)

    @override
    def keyPressEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        if event.key() == Qt.Key.Key_Escape:
            if not self._decided:
                self._decide(SKIP)
            self.reject()
            return
        super().keyPressEvent(event)

    @override
    def apply_theme(self, theme: Theme) -> None:
        """Colour the status line for the state it is currently reporting.

        The state is already spelled out in the message, so the colour is a
        second cue and never the only one — and because it is carrying words,
        each state contributes its text token rather than the saturated one a
        status dot may use.
        """
        by_state = {
            STATE_RUNNING: theme.color.wait_text,
            STATE_DONE: theme.color.run_text,
            STATE_ERROR: theme.color.fail_text,
        }
        color = by_state.get(self._state, theme.color.text_secondary)
        self._status_label.setStyleSheet(f"font-size:{theme.type.scale.sm}px;color:{color};")
