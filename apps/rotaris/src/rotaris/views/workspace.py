"""Workspace screen: sidebar (active runs, agents, todos), transcript + composer,
agent inspector."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, cast, override

from PySide6.QtCore import QObject, Qt, QTimer, Signal, Slot
from PySide6.QtGui import QTextCursor
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLayout,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPlainTextEdit,
    QScrollArea,
    QSizePolicy,
    QStackedLayout,
    QTabWidget,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.models.slash_commands import (
    EXECUTED,
    SlashCommandRegistry,
    parse_slash_input,
    slash_filter_text,
)
from rotaris.models.state import RunUiState, init_task_label, permission_mode_names
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.theme.phosphor import set_button_icon
from rotaris.views.transcript import (
    TranscriptListView,
    delegation_context_event,
    filter_transcript_for_agent,
    latest_transcript_author,
    search_haystack,
)
from rotaris.widgets import (
    AgentTreeList,
    ContextRing,
    EmptyState,
    PanelSplitter,
    SectionHeader,
    SectionLabel,
    SegmentedControl,
    SlashCommandPopup,
    SlashHighlighter,
    StatusDot,
    Tag,
    artifact_link,
    make_availability_help,
    make_button,
    populate_model_combo,
    select_model,
    set_action_availability,
)

#: Width of the workspace sidebar panel before the user resizes it (SWR-3011).
_SIDEBAR_WIDTH = 236

#: How narrow the user may drag the sidebar before its rows stop being readable,
#: and how wide it is worth letting them go. The minimums across the three panes
#: must keep the docked layout under the supported 1000px window width.
_SIDEBAR_MIN_WIDTH = 180
_SIDEBAR_MAX_WIDTH = 520

#: Width of the inspector panel before the user resizes it, and its bounds.
_INSPECTOR_WIDTH = 288
_INSPECTOR_MIN_WIDTH = 220
_INSPECTOR_MAX_WIDTH = 560

#: The transcript column never gives up more room than this, whatever the user
#: does to the panels beside it.
_CENTER_MIN_WIDTH = 420

#: Height of the queue-and-composer block before the user resizes it, and the
#: floor below which the composer and its chips would start to clip.
_COMPOSER_BLOCK_HEIGHT = 150
_COMPOSER_BLOCK_MIN_HEIGHT = 110
_TRANSCRIPT_MIN_HEIGHT = 180

#: What a model chip reads before a catalog has loaded — a run always has some
#: model, so an empty chip would be the wrong answer.
_PLACEHOLDER_MODEL = "copilot/gpt-5"

#: How often the sidebar and the inspector may rebuild (SWR-2454). Both tear
#: down and rebuild every child they hold, so what drives them has to be a
#: settled answer rather than each step towards one — a splitter drag, and,
#: since the run reports its agent tree as it changes rather than every 750 ms,
#: a streaming run too.
_PANEL_REFLOW_MS = 120


@traces(SWR.SWR_2454)
class _Coalescer(QObject):
    """Run *target* at most once per interval, and always once more at the end.

    Leading edge on purpose. A single change — an agent going idle, a todo
    ticked, the user dragging the splitter one pixel — should be on screen at
    once; it is only a *stream* of them that has to be held back. A plain
    trailing timer would make every interaction feel an interval late to buy
    something only a streaming run needs.
    """

    def __init__(self, parent: QObject, interval_ms: int, target: Callable[[], None]) -> None:
        super().__init__(parent)
        self._target = target
        self._interval_ms = interval_ms
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._on_timeout)
        self._last_run = 0.0
        self._pending = False

    @Slot()
    def request(self) -> None:
        """Ask for a run. Immediate if the rate allows, else on the trailing tick."""
        if self._timer.isActive():
            self._pending = True
            return
        waited_ms = (time.monotonic() - self._last_run) * 1000.0
        if waited_ms >= self._interval_ms:
            self._run()
            return
        self._pending = True
        self._timer.start(int(self._interval_ms - waited_ms))

    def flush(self) -> None:
        """Run now if anything is waiting — for a caller that needs it current."""
        self._timer.stop()
        if self._pending:
            self._run()

    @Slot()
    def _on_timeout(self) -> None:
        if self._pending:
            self._run()

    def _run(self) -> None:
        self._pending = False
        self._last_run = time.monotonic()
        self._target()


@traces(SWR.SWR_2609)
def _clock(seconds: float) -> str:
    """``2:41`` — a stopwatch reading, for an elapsed/deadline pair.

    Deliberately not the transcript's ``14m 40s`` idiom: this value sits beside
    the budget it is counting towards, and two stopwatch readings compare at a
    glance where two prose durations do not.
    """
    minutes, secs = divmod(max(0, int(seconds)), 60)
    return f"{minutes}:{secs:02d}"


if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from PySide6.QtGui import QFocusEvent, QKeyEvent, QResizeEvent

    from rotaris.models.state import (
        AgentNode,
        QueuedPromptItem,
        SessionInfo,
        TodoItem,
        TranscriptEvent,
    )
    from rotaris.models.store import WorkspaceStore
    from rotaris.services.run_bridge import RunBridge
    from rotaris.theme.spec import Theme


@traces(
    SWR.SWR_2003,
    SWR.SWR_2026,
    SWR.SWR_2027,
    SWR.SWR_2028,
    SWR.SWR_2035,
    SWR.SWR_2036,
    SWR.SWR_2037,
    SWR.SWR_2038,
    SWR.SWR_2039,
    SWR.SWR_2084,
    SWR.SWR_2086,
    SWR.SWR_2087,
    SWR.SWR_2088,
)
@traces(SWR.SWR_2439, SWR.SWR_2440, SWR.SWR_2441)
class PromptComposer(QPlainTextEdit):
    """Multiline prompt editor with shell-style history recall.

    Enter submits; Shift+Enter inserts a newline. When a slash command is being
    typed, a suggestion popup opens and takes over the navigation keys
    (SWR-2439, SWR-2441).
    """

    submit_requested = Signal()
    #: A command was completed from the popup; carries the command name.
    command_accepted = Signal(str)
    #: The draft settled: the text has stopped changing, or focus left, or the
    #: prompt was submitted. Draft *persistence* rides this rather than
    #: `textChanged`, so a keystroke never reaches the store — and through it
    #: the transcript, which used to re-project on every character.
    draft_changed = Signal(str)

    #: How long typing has to pause before the draft is published.
    DRAFT_DEBOUNCE_MS = 200

    def __init__(
        self,
        store: WorkspaceStore,
        parent: QWidget | None = None,
        *,
        registry: SlashCommandRegistry | None = None,
    ) -> None:
        super().__init__(parent)
        self._store = store
        self._history_index = -1
        self._draft_before_history = ""
        self._registry = registry
        self._popup: SlashCommandPopup | None = None
        self._highlighter: SlashHighlighter | None = None
        self._published_draft = self.toPlainText()
        self._draft_timer = QTimer(self)
        self._draft_timer.setSingleShot(True)
        self._draft_timer.setInterval(self.DRAFT_DEBOUNCE_MS)
        self._draft_timer.timeout.connect(self.flush_draft)
        self.textChanged.connect(self._draft_timer.start)
        if registry is not None:
            self._highlighter = SlashHighlighter(self.document(), registry)
            self.textChanged.connect(self._sync_suggestions)

    def flush_draft(self) -> None:
        """Publish the current text now, if it differs from what was published."""
        self._draft_timer.stop()
        text = self.toPlainText()
        if text == self._published_draft:
            return
        self._published_draft = text
        self.draft_changed.emit(text)

    def attach_popup(self, popup: SlashCommandPopup) -> None:
        """Adopt the popup the workspace owns, so it can float over siblings."""
        self._popup = popup
        popup.command_activated.connect(self.accept_command)

    # ── slash suggestions ─────────────────────────────────────────────────

    @traces(SWR.SWR_2439)
    def _sync_suggestions(self) -> None:
        """Open, filter, or close the popup for the text currently typed."""
        popup = self._popup
        if popup is None or self._registry is None:
            return
        needle = slash_filter_text(self.toPlainText())
        if needle is None:
            popup.hide()
            return
        popup.show_for(self._registry.match(needle))
        if popup.is_open():
            popup.reposition(self)

    @traces(SWR.SWR_2441)
    def accept_command(self, name: str) -> None:
        """Complete the composer to `/name ` and leave the caret for arguments."""
        if self._popup is not None:
            self._popup.hide()
        self.setPlainText(f"/{name} ")
        self.moveCursor(QTextCursor.MoveOperation.End)
        self.command_accepted.emit(name)

    @traces(SWR.SWR_2441)
    def _handle_popup_key(self, event: QKeyEvent) -> bool:
        """Route a key to the open popup. True when the popup consumed it."""
        popup = self._popup
        if popup is None or not popup.is_open():
            return False
        key = event.key()
        if key == Qt.Key.Key_Escape:
            popup.hide()
            return True
        if event.modifiers() not in (
            Qt.KeyboardModifier.NoModifier,
            Qt.KeyboardModifier.KeypadModifier,
        ):
            return False
        if key == Qt.Key.Key_Up:
            popup.move_selection(-1)
            return True
        if key == Qt.Key.Key_Down:
            popup.move_selection(1)
            return True
        if key in (Qt.Key.Key_Tab, Qt.Key.Key_Return, Qt.Key.Key_Enter):
            command = popup.current()
            if command is None:
                popup.hide()
                return True
            if key != Qt.Key.Key_Tab and self.toPlainText().strip() == f"/{command.name}":
                # Already typed in full: completing it would be a no-op keystroke,
                # so Enter runs it. Tab always completes.
                popup.hide()
                return False
            self.accept_command(command.name)
            return True
        return False

    @override
    def keyPressEvent(self, event: QKeyEvent) -> None:
        # The popup owns the navigation keys while it is open, otherwise
        # choosing a command would recall a prompt from history instead.
        if self._handle_popup_key(event):
            self._history_index = -1
            return
        if event.modifiers() == Qt.KeyboardModifier.NoModifier:
            if event.key() == Qt.Key.Key_Up and self._recall_previous():
                return
            if event.key() == Qt.Key.Key_Down and self._recall_next():
                return
        if event.modifiers() == Qt.KeyboardModifier.ShiftModifier and event.key() in (
            Qt.Key.Key_Return,
            Qt.Key.Key_Enter,
        ):
            self._history_index = -1
            super().keyPressEvent(event)
            return
        if event.modifiers() == Qt.KeyboardModifier.NoModifier and event.key() in (
            Qt.Key.Key_Return,
            Qt.Key.Key_Enter,
        ):
            self._history_index = -1
            self.submit_requested.emit()
            return
        self._history_index = -1
        super().keyPressEvent(event)

    @override
    def focusOutEvent(self, event: QFocusEvent) -> None:
        if self._popup is not None:
            self._popup.hide()
        self.flush_draft()
        super().focusOutEvent(event)

    def _recall_previous(self) -> bool:
        if not self._store.prompt_history:
            return False
        if self._history_index < 0:
            self._draft_before_history = self.toPlainText()
        self._history_index = min(
            self._history_index + 1,
            len(self._store.prompt_history) - 1,
        )
        self.setPlainText(self._store.prompt_history[self._history_index])
        self.moveCursor(QTextCursor.MoveOperation.End)
        return True

    def _recall_next(self) -> bool:
        if self._history_index < 0:
            return False
        self._history_index -= 1
        text = (
            self._draft_before_history
            if self._history_index < 0
            else self._store.prompt_history[self._history_index]
        )
        self.setPlainText(text)
        self.moveCursor(QTextCursor.MoveOperation.End)
        return True


class PromptStashDialog(QDialog):
    """Choose whether a stashed prompt is copied or removed and copied."""

    def __init__(self, prompts: list[str], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Prompt stash")
        self.setMinimumSize(560, 360)
        self.selected_index = -1
        self.remove_selected = False
        layout = QVBoxLayout(self)
        intro = QLabel(
            "Apply copies the selected prompt into the composer and keeps it in the stash. "
            "Pop copies it and removes it from the stash."
        )
        intro.setWordWrap(True)
        intro.setObjectName("muted")
        layout.addWidget(intro)
        self.prompt_list = QListWidget()
        self.prompt_list.setAccessibleName("Stashed prompts")
        for prompt in prompts:
            self.prompt_list.addItem(prompt)
        if prompts:
            self.prompt_list.setCurrentRow(0)
        else:
            self.prompt_list.addItem("No stashed prompts. Use Stash beside the composer first.")
            self.prompt_list.setEnabled(False)
        layout.addWidget(self.prompt_list, 1)
        actions = QHBoxLayout()
        actions.addStretch(1)
        close_button = make_button("Close", "secondary")
        close_button.clicked.connect(self.reject)
        actions.addWidget(close_button)
        self.apply_button = make_button("Apply", "secondary")
        self.apply_button.setEnabled(bool(prompts))
        self.apply_button.clicked.connect(lambda: self._choose(remove=False))
        actions.addWidget(self.apply_button)
        self.pop_button = make_button("Pop", "primary")
        self.pop_button.setEnabled(bool(prompts))
        self.pop_button.clicked.connect(lambda: self._choose(remove=True))
        actions.addWidget(self.pop_button)
        layout.addLayout(actions)

    def _choose(self, *, remove: bool) -> None:
        row = self.prompt_list.currentRow()
        if row < 0 or not self.prompt_list.isEnabled():
            return
        self.selected_index = row
        self.remove_selected = remove
        self.accept()


class _QueuedPromptRow(QFrame):
    edited = Signal(str, str)
    removed = Signal(str)

    def __init__(self, prompt: QueuedPromptItem) -> None:
        super().__init__()
        self._prompt = prompt
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 3, 4, 3)
        layout.setSpacing(6)
        self.editor = QLineEdit(prompt.text)
        self.editor.setReadOnly(True)
        self.editor.setAccessibleName("Queued message")
        self.editor.returnPressed.connect(self._save)
        layout.addWidget(self.editor, 1)
        self.edit_button = make_button("Edit", "ghost")
        self.edit_button.setAccessibleName("Edit queued message")
        self.edit_button.clicked.connect(self._toggle_edit)
        layout.addWidget(self.edit_button)
        self.delete_button = make_button("Delete", "ghost")
        self.delete_button.setAccessibleName("Delete queued message")
        self.delete_button.clicked.connect(lambda: self.removed.emit(prompt.id))
        layout.addWidget(self.delete_button)

    def _toggle_edit(self) -> None:
        if self.editor.isReadOnly():
            self.editor.setReadOnly(False)
            self.editor.setFocus()
            self.editor.selectAll()
            self.edit_button.setText("Save")
            return
        self._save()

    def _save(self) -> None:
        text = self.editor.text().strip()
        if not text:
            self.editor.setText(self._prompt.text)
            return
        self.editor.setReadOnly(True)
        self.edit_button.setText("Edit")
        if text != self._prompt.text:
            self.edited.emit(self._prompt.id, text)


class _TodoRow(Themed, QFrame):
    renamed = Signal(str, str)
    removed = Signal(str)

    def __init__(self, todo: TodoItem) -> None:
        super().__init__()
        self._todo = todo
        self.setObjectName("todoRow")
        layout = QHBoxLayout(self)
        layout.setContentsMargins(3, 1, 1, 1)
        layout.setSpacing(4)
        self._status = QLabel({"done": "✓", "active": "◌"}.get(todo.status, "○"))
        self._status.setAccessibleName(f"Status: {todo.status}")
        layout.addWidget(self._status)
        self.editor = QLineEdit(todo.text)
        self.editor.setFrame(False)
        self.editor.setAccessibleName(f"Todo: {todo.text}. Click to rename")
        self.editor.setToolTip("Click text to rename")
        font = self.editor.font()
        font.setStrikeOut(todo.status == "done")
        self.editor.setFont(font)
        self.editor.editingFinished.connect(self._commit)
        layout.addWidget(self.editor, 1)
        self.remove_button = QToolButton()
        self.remove_button.setText("×")
        self.remove_button.setFixedSize(20, 20)
        self.remove_button.setAccessibleName(f"Remove todo {todo.text}")
        self.remove_button.setToolTip("Remove task")
        self.remove_button.clicked.connect(lambda: self.removed.emit(todo.id))
        layout.addWidget(self.remove_button)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        color, scale = theme.color, theme.type.scale
        self.setStyleSheet(
            f"QFrame#todoRow{{border-radius:{theme.radius.sm}px;}}"
            f"QFrame#todoRow:hover{{background:{color.surface};}}"
            "QFrame#todoRow QToolButton{color:transparent;border:none;}"
            f"QFrame#todoRow:hover QToolButton,QFrame#todoRow QToolButton:focus{{"
            f"color:{color.fail_text};background:transparent;}}"
        )
        # The glyph is a character in a label, not a painted dot, so a screen
        # reader and the contrast sweep both treat it as text — which is why it
        # takes the text step of each axis rather than the saturated one.
        glyph_color = {
            "done": color.run_text,
            "active": color.wait_text,
        }.get(self._todo.status, color.text_tertiary)
        self._status.setStyleSheet(f"color:{glyph_color};font-size:{scale.sm}px;")
        body = color.text_tertiary if self._todo.status == "done" else color.text_secondary
        self.editor.setStyleSheet(
            f"QLineEdit{{font-size:{scale.xs}px;color:{body};background:transparent;"
            f"border:{theme.size.hairline}px solid transparent;"
            f"border-radius:{theme.radius.sm}px;padding:2px;}}"
            f"QLineEdit:focus{{border-color:{color.accent[700]};background:{color.bg};}}"
        )

    def _commit(self) -> None:
        text = self.editor.text().strip()
        if not text:
            self.editor.setText(self._todo.text)
            return
        if text != self._todo.text:
            self.renamed.emit(self._todo.id, text)


class _TodoAddRow(Themed, QWidget):
    added = Signal(str, str)

    def __init__(self, phase_id: str) -> None:
        super().__init__()
        self._phase_id = phase_id
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 0, 1, 2)
        layout.setSpacing(2)
        self.add_button = QToolButton()
        self.add_button.setText("+ Add task")
        self.add_button.setAccessibleName("Add task to this phase")
        self.add_button.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)
        self.add_button.clicked.connect(self._begin)
        layout.addWidget(self.add_button, 0, Qt.AlignmentFlag.AlignLeft)
        self.editor = QLineEdit()
        self.editor.setPlaceholderText("Task name")
        self.editor.setAccessibleName("New task name")
        self.editor.returnPressed.connect(self._commit)
        self.editor.editingFinished.connect(self._commit)
        self.editor.hide()
        layout.addWidget(self.editor)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        color, scale = theme.color, theme.type.scale
        self.add_button.setStyleSheet(
            f"QToolButton{{color:{color.text_tertiary};border:none;"
            f"font-size:{scale.x2s}px;}}"
            f"QToolButton:hover,QToolButton:focus{{color:{color.accent[300]};}}"
        )
        self.editor.setStyleSheet(
            f"QLineEdit{{font-size:{scale.xs}px;"
            f"border:{theme.size.hairline}px solid {color.accent[700]};"
            f"border-radius:{theme.radius.sm}px;background:{color.bg};padding:3px;}}"
        )

    def _begin(self) -> None:
        self.add_button.hide()
        self.editor.show()
        self.editor.setFocus()

    def _commit(self) -> None:
        text = self.editor.text().strip()
        self.editor.clear()
        self.editor.hide()
        self.add_button.show()
        if text:
            self.added.emit(self._phase_id, text)


@traces(SWR.SWR_2122, SWR.SWR_2414, SWR.SWR_2415, SWR.SWR_2509)
class WorkspaceView(Themed, QWidget):
    prompt_submitted = Signal(str)
    prompt_queued = Signal(str)
    queued_prompt_edit_requested = Signal(str, str)
    queued_prompt_delete_requested = Signal(str)
    steer_requested = Signal(str)  # agent id
    cancel_requested = Signal(str)  # agent id
    run_cancel_requested = Signal()
    run_pause_requested = Signal()
    artifact_open_requested = Signal(str)  # artifact id
    agent_popout_requested = Signal(str)  # agent id
    compression_requested = Signal()
    clear_transcript_requested = Signal()
    #: Open the interactive terminal window; empty payload means "whichever
    #: stream is current" (SWR-2428).
    terminal_popout_requested = Signal(str)
    todo_renamed = Signal(str, str)  # task id, text
    todo_removed = Signal(str)  # task id
    todo_added = Signal(str, str)  # phase id, text
    #: The user asked to run this workspace's pending setup tasks (SWR-2805).
    #: Stating the intent is all this view does; the window owns the modal.
    initialize_project_requested = Signal()
    #: A submitted slash command could not run (SWR-2438). The window decides
    #: how to surface it; the view only reports why, and keeps the user's text.
    slash_error = Signal(str)
    #: The user picked another run from the sidebar switcher (SWR-2415). The
    #: window owns focus switching; the view only names the session to show.
    session_focus_requested = Signal(str)  # session id
    #: The composer's permission-mode chip changed (SWR-2509). The view has
    #: already stored the choice and told any live run; the window persists it.
    permission_mode_selected = Signal(str)

    def __init__(
        self,
        store: WorkspaceStore,
        parent: QWidget | None = None,
        *,
        diagnostics: Any | None = None,
        run_bridge: RunBridge | None = None,
    ) -> None:
        super().__init__(parent)
        if diagnostics is None:
            from rotaris.diagnostics import NoopDiagnostics

            diagnostics = NoopDiagnostics()
        self._diagnostics = diagnostics
        self._store = store
        self._run_bridge = run_bridge
        #: Micro-labels — the 10px captions above inspector controls and under
        #: its meters. Collected because each carries its own stylesheet, and a
        #: theme switch has to reach every one of them.
        self._micro_labels: list[QLabel] = []
        #: Populated by the window (SWR-2442); empty until then, which simply
        #: means no suggestions rather than a broken composer.
        self.slash_registry = SlashCommandRegistry()
        root = QHBoxLayout(self)
        self._root_layout = root
        # Let the workspace cross its compact breakpoint even while the docked
        # panels report minimum-size hints wider than that breakpoint.
        root.setSizeConstraint(QLayout.SizeConstraint.SetNoConstraint)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self.sidebar_panel = self._build_sidebar()
        self.center_panel = self._build_center()
        self.inspector_panel = self._build_inspector()
        # SWR-3011: the three columns are the user's to size, not the layout's.
        # The splitter, not the layout, holds them, so the compact breakpoint
        # below still has a container to lift them out of and back into.
        self.panes = PanelSplitter(
            "workspace.panes",
            Qt.Orientation.Horizontal,
            defaults=(_SIDEBAR_WIDTH, 0, _INSPECTOR_WIDTH),
        )
        # Explicit, so the toolbar's own minimum-size hint cannot dictate the
        # split: the transcript column clips its toolbar at narrow widths, as it
        # already did when the panels beside it were fixed.
        self.center_panel.setMinimumWidth(_CENTER_MIN_WIDTH)
        self.panes.addWidget(self.sidebar_panel)
        self.panes.addWidget(self.center_panel)
        self.panes.addWidget(self.inspector_panel)
        self.panes.setStretchFactor(1, 1)
        self.panes.name_handles(
            ["Resize the workspace context panel", "Resize the inspector panel"]
        )
        root.addWidget(self.panes, 1)
        # Sidebar rows elide against the panel's width, so a drag changes what
        # they can say. Rebuilding them once the drag settles, rather than per
        # pixel, keeps a resize off the row-construction path.
        self._sidebar_reflow = _Coalescer(self, _PANEL_REFLOW_MS, self._refresh_sidebar)
        #: The inspector's own, on the same interval and for the same reason:
        #: it too tears down and rebuilds every child it holds (SWR-2454).
        self._inspector_reflow = _Coalescer(self, _PANEL_REFLOW_MS, self._refresh_inspector)
        self.panes.splitterMoved.connect(lambda _pos, _index: self._sidebar_reflow.request())
        self._panels_docked = True
        self._compact_layout = False
        #: Agent the inspector is following, so a transcript tick that does not
        #: move it costs a comparison rather than a rebuild (SWR-2910).
        self._followed_agent_id = ""

        store.transcript_changed.connect(self._refresh_transcript)
        store.transcript_delta.connect(self._apply_transcript_delta)
        # A new row can move the followed agent (SWR-2910); the guard keeps the
        # inspector off the hot path of a streaming run, where most rows come
        # from the agent the panel is already showing.
        store.transcript_changed.connect(self._refresh_inspector_follow)
        store.transcript_delta.connect(self._on_transcript_delta_follow)
        # Through the reflow timer, not straight to the rebuild (SWR-2454). Both
        # panels tear down and rebuild every child they hold, and the run now
        # reports its agent tree and todos as they change rather than every
        # 750 ms — so a streaming run would otherwise rebuild both panels far
        # faster than they can be laid out. 120 ms is imperceptible for a status
        # chip and is already this view's coalescing interval.
        store.todos_changed.connect(self._sidebar_reflow.request)
        store.agents_changed.connect(self._sidebar_reflow.request)
        store.agents_changed.connect(self._inspector_reflow.request)
        store.run_summary_changed.connect(self._refresh_run_state)
        store.selection_changed.connect(self._on_agent_selection_changed)
        store.artifacts_changed.connect(self._refresh_inspector)
        store.sessions_changed.connect(self._refresh_sidebar)
        store.library_changed.connect(self._refresh_stash_button)
        store.queued_prompts_changed.connect(self._refresh_queued_prompts)
        store.run_state_changed.connect(lambda _state: self._refresh_run_state())
        store.improvement_collection_changed.connect(lambda _active: self._refresh_run_state())
        store.verifier_changed.connect(lambda _verifier: self._refresh_verifier_activity())
        store.initialization_changed.connect(lambda _state: self._refresh_project_init())
        # The Settings tab edits the same runtime.permission_mode the chip shows.
        store.settings_changed.connect(self._sync_permission_combo)
        self._refresh_project_init()
        self._refresh_transcript()
        self._refresh_queued_prompts()
        self._refresh_stash_button()
        self._refresh_run_state()
        self._refresh_verifier_activity()
        QTimer.singleShot(0, self._apply_responsive_layout)
        # Draws the sidebar and the inspector for the first time as well as
        # subscribing them: both are built out of tokens, so `apply_theme` is
        # the one place that has to know how, and calling it here rather than
        # beside the refreshes above stops the first paint happening twice.
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild every presentation value this view holds itself.

        Three kinds live here. The two panels and the composer carry their own
        stylesheets, because a panel's edge and the composer's box are not
        anything the application stylesheet has a selector for. The inspector's
        micro-labels carry theirs for the same reason. And the sidebar and
        inspector *rows* are plain widgets a builder function styles inline, so
        the only way they follow a switch is to be built again.
        """
        color, scale = theme.color, theme.type.scale
        self.sidebar_panel.setStyleSheet(
            f"QWidget#panel{{background:{color.panel};"
            f"border-right:{theme.size.hairline}px solid {color.border};}}"
        )
        self.inspector_panel.setStyleSheet(
            f"QWidget#panel{{background:{color.panel};"
            f"border-left:{theme.size.hairline}px solid {color.border};}}"
        )
        self._composer_strip.setStyleSheet(
            f"QFrame#chrome{{background:{color.chrome};"
            f"border-top:{theme.size.hairline}px solid {color.border};}}"
        )
        self._composer_box.setStyleSheet(
            f"QFrame{{border:{theme.size.hairline}px solid {color.border_strong};"
            f"border-radius:{theme.radius.md}px;background:{color.bg};}}"
        )
        # Mono, because "3 running" and "7 live" tick on their own while a run
        # goes and a proportional face shuffles the header sideways every time
        # one of them gains a digit.
        counter = f"font-family:{theme.type.mono};font-size:{scale.x2s}px;color:{color.run_text};"
        self.session_count_label.setStyleSheet(counter)
        self.live_label.setStyleSheet(counter)
        self.inspector_name.setStyleSheet(
            f"font-size:{scale.base}px;font-weight:{theme.type.weight_body};"
        )
        self.inspector_meta.setStyleSheet(f"font-size:{scale.xs}px;color:{color.text_tertiary};")
        caption = f"font-size:{scale.x2s}px;color:{color.text_tertiary};"
        for label in self._micro_labels:
            label.setStyleSheet(caption)
        self._refresh_sidebar()
        self._refresh_inspector()

    # ── sidebar ───────────────────────────────────────────────────────────

    def _build_sidebar(self) -> QWidget:
        panel = QWidget()
        panel.setObjectName("panel")
        panel.setAutoFillBackground(True)
        panel.setMinimumWidth(_SIDEBAR_MIN_WIDTH)
        panel.setMaximumWidth(_SIDEBAR_MAX_WIDTH)
        panel.resize(_SIDEBAR_WIDTH, panel.height())
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(9)

        drawer_header = QHBoxLayout()
        drawer_header.addWidget(SectionLabel("Workspace context"))
        drawer_header.addStretch(1)
        self.sidebar_close = QToolButton()
        self.sidebar_close.setText("×")
        self.sidebar_close.setAccessibleName("Close agents and todos drawer")
        self.sidebar_close.setToolTip("Close drawer (Escape)")
        self.sidebar_close.clicked.connect(self._toggle_sidebar)
        drawer_header.addWidget(self.sidebar_close)
        layout.addLayout(drawer_header)

        self.project_section_label = SectionLabel("Project")
        layout.addWidget(self.project_section_label)
        self.initialize_project_button = make_button("Initialize Project…", "secondary")
        self.initialize_project_button.clicked.connect(self.initialize_project_requested.emit)
        layout.addWidget(self.initialize_project_button)
        self.project_init_hint = QLabel()
        self.project_init_hint.setObjectName("muted")
        self.project_init_hint.setWordWrap(True)
        self.project_init_hint.setAccessibleName("Project setup status")
        layout.addWidget(self.project_init_hint)

        # The UI kit's counted-section pattern (SWR-3709): the kicker and its
        # datum are one composition, so the three counts in this sidebar agree
        # on face, size and tone instead of each improvising.
        self.sessions_header = SectionHeader("Active runs")
        self.session_count_label = self.sessions_header.datum
        self.session_count_label.setAccessibleName("Running sessions")
        layout.addWidget(self.sessions_header)
        self.session_rows = QVBoxLayout()
        self.session_rows.setSpacing(4)
        layout.addLayout(self.session_rows)

        self.agents_header = SectionHeader("Task agents")
        self.live_label = self.agents_header.datum
        self.live_label.setAccessibleName("Live task agents")
        layout.addWidget(self.agents_header)
        self.agent_tree = AgentTreeList(self._store, show_meta=False)
        self.agent_tree.agent_selected.connect(self.inspect_agent)
        layout.addWidget(self.agent_tree)
        self.agents_empty = QLabel("No task agents yet. Start a run to populate this list.")
        self.agents_empty.setObjectName("muted")
        self.agents_empty.setWordWrap(True)
        layout.addWidget(self.agents_empty)

        self.todos_header = SectionHeader("Todos")
        self.todos_label = self.todos_header.label
        layout.addWidget(self.todos_header)
        todo_scroll = QScrollArea()
        todo_scroll.setObjectName("todoScroll")
        todo_scroll.setWidgetResizable(True)
        todo_scroll.setFrameShape(QFrame.Shape.NoFrame)
        todo_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        todo_scroll.setMinimumHeight(90)
        todo_scroll.setStyleSheet("QScrollArea#todoScroll{background:transparent;border:none;}")
        todo_container = QWidget()
        self.todo_rows = QVBoxLayout()
        self.todo_rows.setContentsMargins(0, 0, 0, 0)
        self.todo_rows.setSpacing(2)
        todo_container.setLayout(self.todo_rows)
        todo_scroll.setWidget(todo_container)
        layout.addWidget(todo_scroll, 1)
        return panel

    def _refresh_sidebar(self) -> None:
        with self._diagnostics.span("workspace.sidebar_refresh"):
            self._refresh_sidebar_content()

    def _refresh_sidebar_content(self) -> None:
        s = self._store
        _clear(self.session_rows)
        switchable = [session for session in s.sessions if _is_switchable(session)]
        running = sum(1 for session in switchable if RunUiState.from_backend(session.status).busy)
        self.sessions_header.set_datum(
            f"{running} running" if switchable else "",
            tone="live" if running else "neutral",
        )
        # Measured, not assumed: the sidebar is the user's to widen (SWR-3011),
        # and a row elided against the old fixed width would leave the space
        # they just made empty.
        text_width = _session_row_text_width(self.sidebar_panel.width())
        for session in switchable:
            self.session_rows.addWidget(
                _session_row(session, self.session_focus_requested.emit, text_width)
            )
        if not switchable:
            self.session_rows.addWidget(
                EmptyState(
                    "No active runs",
                    "Start a run to switch between sessions here.",
                    compact=True,
                )
            )
        live = sum(1 for a in s.agents.values() if a.is_live)
        self.agents_header.set_datum(f"{live} live", tone="live" if live else "neutral")
        self.agents_empty.setVisible(not s.agents)
        done = sum(1 for todo in s.todos if todo.status == "done")
        # The count sits beside the kicker as a datum, never inside its
        # uppercased text (SWR-3709).
        self.todos_header.set_datum(f"{done}/{len(s.todos)}" if s.todos else "")
        _clear(self.todo_rows)
        phases: dict[str, list[TodoItem]] = {}
        for todo in s.todos:
            phases.setdefault(todo.phase_id, []).append(todo)
        t = tokens()
        for phase_id, todos in phases.items():
            phase = QLabel(todos[0].phase_name or phase_id)
            phase.setObjectName("muted")
            phase.setStyleSheet(
                f"font-family:{t.type.mono};font-size:{t.type.scale.x2s}px;"
                f"font-weight:{t.type.weight_display};color:{t.color.text_tertiary};"
                f"padding:{t.space.xs}px 3px 1px 3px;"
            )
            phase.setAccessibleName(f"Todo phase {phase.text()}")
            self.todo_rows.addWidget(phase)
            for todo in todos:
                row = _TodoRow(todo)
                row.renamed.connect(self._rename_todo)
                row.removed.connect(self._remove_todo)
                self.todo_rows.addWidget(row)
            add_row = _TodoAddRow(phase_id)
            add_row.added.connect(self._add_todo)
            self.todo_rows.addWidget(add_row)
        if not s.todos:
            self.todo_rows.addWidget(
                EmptyState(
                    "No task plan",
                    "Agent-created tasks will appear during a run.",
                    compact=True,
                )
            )
        self.todo_rows.addStretch(1)

    def _rename_todo(self, task_id: str, text: str) -> None:
        original = next((todo.text for todo in self._store.todos if todo.id == task_id), "")
        cleaned = text.strip()
        if not cleaned or cleaned == original:
            return
        self._store.rename_todo(task_id, cleaned)
        self.todo_renamed.emit(task_id, cleaned)

    def _remove_todo(self, task_id: str) -> None:
        if not any(todo.id == task_id for todo in self._store.todos):
            return
        self._store.remove_todo(task_id)
        self.todo_removed.emit(task_id)

    def _add_todo(self, phase_id: str, text: str) -> None:
        cleaned = text.strip()
        if not cleaned:
            return
        self._store.add_todo(phase_id, cleaned)
        self.todo_added.emit(phase_id, cleaned)

    # ── center: transcript + composer ─────────────────────────────────────

    def _build_center(self) -> QWidget:
        center = QWidget()
        layout = QVBoxLayout(center)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.context_toolbar = QFrame()
        self.context_toolbar.setObjectName("chrome")
        toolbar_layout = QHBoxLayout(self.context_toolbar)
        toolbar_layout.setContentsMargins(12, 6, 12, 6)
        toolbar_layout.setSpacing(8)
        self.sidebar_toggle = make_button("Agents & todos", "secondary")
        self.sidebar_toggle.setAccessibleName("Toggle agents and todos drawer")
        self.sidebar_toggle.clicked.connect(self._toggle_sidebar)
        toolbar_layout.addWidget(self.sidebar_toggle)
        toolbar_layout.addStretch(1)
        self.transcript_scope_button = make_button("All activity", "ghost")
        self.transcript_scope_button.setAccessibleName("Transcript scope")
        self.transcript_scope_button.clicked.connect(lambda: self._store.select_agent(""))
        toolbar_layout.addWidget(self.transcript_scope_button)
        self.search_toggle = make_button("Search transcript", "ghost")
        set_button_icon(self.search_toggle, "magnifying-glass")
        self.search_toggle.setAccessibleName("Search transcript")
        self.search_toggle.clicked.connect(self.open_search)
        toolbar_layout.addWidget(self.search_toggle)
        self.stash_manage_button = make_button("Apply stash", "ghost")
        set_button_icon(self.stash_manage_button, "archive-tray")
        self.stash_manage_button.setAccessibleName("Manage prompt stash")
        self.stash_manage_button.setToolTip("Apply or pop a stashed prompt")
        self.stash_manage_button.clicked.connect(self._open_prompt_stash)
        toolbar_layout.addWidget(self.stash_manage_button)
        self.terminals_button = make_button("Terminal", "ghost")
        set_button_icon(self.terminals_button, "terminal-window")
        self.terminals_button.setAccessibleName("Open terminal")
        self.terminals_button.clicked.connect(lambda: self.terminal_popout_requested.emit(""))
        toolbar_layout.addWidget(self.terminals_button)
        self.clear_button = make_button("Clear transcript", "ghost")
        self.clear_button.setAccessibleDescription(
            "Permanently remove transcript messages from the loaded session"
        )
        self.clear_button.clicked.connect(self.clear_transcript_requested.emit)
        toolbar_layout.addWidget(self.clear_button)
        self.new_output_button = make_button("New output", "primary")
        self.new_output_button.setAccessibleName("Jump to new transcript output")
        self.new_output_button.clicked.connect(self._scroll_to_tail)
        self.new_output_button.hide()
        toolbar_layout.addWidget(self.new_output_button)
        self.inspector_toggle = make_button("Inspector", "secondary")
        self.inspector_toggle.setAccessibleName("Toggle agent inspector drawer")
        self.inspector_toggle.clicked.connect(self._toggle_inspector)
        toolbar_layout.addWidget(self.inspector_toggle)
        layout.addWidget(self.context_toolbar)

        self.run_header = QFrame()
        self.run_header.setObjectName("chrome")
        run_layout = QHBoxLayout(self.run_header)
        run_layout.setContentsMargins(12, 6, 12, 6)
        run_layout.setSpacing(8)
        run_layout.addWidget(SectionLabel("Run"))
        self.run_state_label = QLabel()
        self.run_state_label.setObjectName("muted")
        self.run_state_label.setAccessibleName("Run status")
        run_layout.addWidget(self.run_state_label)
        # SWR-2507: sits beside the run status because that is where a user
        # already looks to learn what this run is doing; it is populated from
        # the recorded verdict, never from the requested mode.
        self.sandbox_badge = QLabel()
        self.sandbox_badge.setObjectName("muted")
        self.sandbox_badge.setAccessibleName("Sandbox status")
        self.sandbox_badge.hide()
        run_layout.addWidget(self.sandbox_badge)
        self.improvement_activity = QWidget()
        improvement_layout = QHBoxLayout(self.improvement_activity)
        improvement_layout.setContentsMargins(0, 0, 0, 0)
        improvement_layout.setSpacing(5)
        self.improvement_dot = StatusDot(size=6)
        improvement_layout.addWidget(self.improvement_dot)
        self.improvement_label = QLabel("Reviewing run for improvements…")
        self.improvement_label.setObjectName("muted")
        self.improvement_label.setAccessibleName("Improvement analysis status")
        self.improvement_label.setAccessibleDescription(
            "Improvement analysis is reviewing this completed run in the background. "
            "Starting or continuing work remains available.",
        )
        improvement_layout.addWidget(self.improvement_label)
        self.improvement_activity.hide()
        run_layout.addWidget(self.improvement_activity)
        # SWR-2609: the agent is finished and the workspace's own checks are
        # what the run is waiting on. It sits in the run header, next to the run
        # status, because that is the one place a user already looks to find out
        # what a run is doing — and because before this, a suite that took
        # minutes was indistinguishable from a run that had died.
        self.verifier_activity = QWidget()
        verifier_layout = QHBoxLayout(self.verifier_activity)
        verifier_layout.setContentsMargins(0, 0, 0, 0)
        verifier_layout.setSpacing(5)
        self.verifier_dot = StatusDot(size=6)
        verifier_layout.addWidget(self.verifier_dot)
        self.verifier_label = QLabel()
        self.verifier_label.setObjectName("muted")
        self.verifier_label.setAccessibleName("Verification status")
        self.verifier_label.setAccessibleDescription(
            "The agent has finished; this run is now executing the workspace's own "
            "checks before the work counts as complete. Skip stops the running check.",
        )
        verifier_layout.addWidget(self.verifier_label)
        self.verifier_skip_button = make_button("Skip", "ghost")
        self.verifier_skip_button.setAccessibleName("Skip the running check")
        self.verifier_skip_button.setAccessibleDescription(
            "Stop the check that is currently running. It is recorded as skipped "
            "rather than failed, and the remaining checks still run.",
        )
        self.verifier_skip_button.clicked.connect(self._on_skip_verifier_check)
        verifier_layout.addWidget(self.verifier_skip_button)
        self.verifier_activity.hide()
        run_layout.addWidget(self.verifier_activity)
        # Ticks the elapsed clock while a check runs; the snapshot only carries
        # the start time, so the count-up costs no writes and no polling.
        self._verifier_tick = QTimer(self)
        self._verifier_tick.setInterval(1000)
        self._verifier_tick.timeout.connect(self._refresh_verifier_label)
        run_layout.addStretch(1)
        self.run_model_combo = _chip_combo([], mono=True)
        populate_model_combo(
            self.run_model_combo, self._store.model_options, placeholder=_PLACEHOLDER_MODEL
        )
        self.run_model_combo.setAccessibleName("Active run model")
        self.run_model_combo.currentTextChanged.connect(self._on_run_model_changed)
        run_layout.addWidget(self.run_model_combo)
        self.run_reasoning_combo = _chip_combo(
            ["reasoning: low", "reasoning: medium", "reasoning: high"]
        )
        self.run_reasoning_combo.setAccessibleName("Active run reasoning strength")
        self.run_reasoning_combo.currentTextChanged.connect(self._on_run_reasoning_changed)
        run_layout.addWidget(self.run_reasoning_combo)
        self.compress_button = make_button("Compress context", "ghost")
        self.compress_button.setAccessibleDescription(
            "Manually compress context for all active agents"
        )
        self.compress_button.clicked.connect(self.compression_requested.emit)
        run_layout.addWidget(self.compress_button)
        self.run_pause_button = make_button("Pause", "secondary")
        set_button_icon(self.run_pause_button, "pause")
        self.run_pause_button.setAccessibleName("Pause run")
        self.run_pause_button.clicked.connect(self.run_pause_requested.emit)
        run_layout.addWidget(self.run_pause_button)
        self.run_availability_help = make_availability_help("run controls")
        run_layout.addWidget(self.run_availability_help)
        self.run_cancel_button = make_button("Cancel run", "danger")
        set_button_icon(self.run_cancel_button, "x-circle")
        self.run_cancel_button.setAccessibleName("Cancel run")
        self.run_cancel_button.clicked.connect(self.run_cancel_requested.emit)
        run_layout.addWidget(self.run_cancel_button)
        layout.addWidget(self.run_header)

        self.search_panel = QFrame()
        self.search_panel.setObjectName("chrome")
        search_layout = QHBoxLayout(self.search_panel)
        search_layout.setContentsMargins(14, 6, 14, 8)
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search transcript…")
        self.search_input.setAccessibleName("Transcript search")
        self.search_input.textChanged.connect(self._update_search_matches)
        self.search_input.returnPressed.connect(self._next_search_match)
        search_layout.addWidget(self.search_input, 1)
        self.search_count = QLabel("0 results")
        self.search_count.setObjectName("muted")
        search_layout.addWidget(self.search_count)
        previous = make_button("Previous", "secondary")
        previous.clicked.connect(self._previous_search_match)
        search_layout.addWidget(previous)
        next_button = make_button("Next", "secondary")
        next_button.clicked.connect(self._next_search_match)
        search_layout.addWidget(next_button)
        close_search = make_button("Close", "ghost")
        close_search.clicked.connect(self.close_search)
        search_layout.addWidget(close_search)
        self.search_panel.hide()
        layout.addWidget(self.search_panel)
        self._search_matches: list[int] = []
        self._search_position = -1

        transcript_container = QWidget()
        self.transcript_stack = QStackedLayout(transcript_container)
        self.transcript_scroll = TranscriptListView()
        self.transcript_scroll.set_auto_collapse_getter(lambda: self._store.ui.auto_collapse_tools)
        self.transcript_scroll.set_group_tools_getter(lambda: self._store.ui.group_tool_calls)
        self.transcript_scroll.terminal_popout_requested.connect(
            self.terminal_popout_requested.emit
        )
        self.transcript_scroll.set_store_and_bridge(self._store, self._run_bridge)
        self._applied_display_settings = self._display_settings()
        self._store.ui_changed.connect(self._on_auto_collapse_changed)
        self.transcript_stack.addWidget(self.transcript_scroll)
        self.transcript_empty = EmptyState(
            "No transcript yet",
            "Describe the outcome you want. Rotaris will show agent activity and results here.",
            compact=True,
        )
        self.transcript_stack.addWidget(self.transcript_empty)
        # SWR-3011: the transcript and the prompt area share the column, and how
        # it is divided is the user's call — a composer fixed at one line is the
        # wrong shape for anyone who writes a paragraph before starting a run.
        transcript_container.setMinimumHeight(_TRANSCRIPT_MIN_HEIGHT)
        self.center_split = PanelSplitter(
            "workspace.center",
            Qt.Orientation.Vertical,
            defaults=(0, _COMPOSER_BLOCK_HEIGHT),
        )
        self.center_split.addWidget(transcript_container)
        self.center_split.setStretchFactor(0, 1)
        prompt_block = QWidget()
        prompt_block.setMinimumHeight(_COMPOSER_BLOCK_MIN_HEIGHT)
        prompt_layout = QVBoxLayout(prompt_block)
        prompt_layout.setContentsMargins(0, 0, 0, 0)
        prompt_layout.setSpacing(0)
        self.center_split.addWidget(prompt_block)
        self.center_split.name_handles(["Resize the transcript and prompt areas"])
        layout.addWidget(self.center_split, 1)

        self.queue_panel = QFrame()
        self.queue_panel.setObjectName("chrome")
        queue_panel_layout = QVBoxLayout(self.queue_panel)
        queue_panel_layout.setContentsMargins(26, 7, 26, 7)
        queue_panel_layout.setSpacing(5)
        queue_header = QHBoxLayout()
        self.queue_label = QLabel()
        self.queue_label.setAccessibleName("Queued messages")
        queue_header.addWidget(self.queue_label)
        queue_header.addStretch(1)
        queue_hint = QLabel("Sent after current iteration")
        queue_hint.setObjectName("muted")
        queue_header.addWidget(queue_hint)
        queue_panel_layout.addLayout(queue_header)
        self.queue_scroll = QScrollArea()
        self.queue_scroll.setWidgetResizable(True)
        self.queue_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.queue_scroll.setMaximumHeight(150)
        queue_holder = QWidget()
        self.queue_rows = QVBoxLayout(queue_holder)
        self.queue_rows.setContentsMargins(0, 0, 0, 0)
        self.queue_rows.setSpacing(3)
        self.queue_scroll.setWidget(queue_holder)
        queue_panel_layout.addWidget(self.queue_scroll)
        prompt_layout.addWidget(self.queue_panel)

        composer_strip = QFrame()
        composer_strip.setObjectName("chrome")
        composer_strip.setAutoFillBackground(True)
        self._composer_strip = composer_strip
        strip_layout = QVBoxLayout(composer_strip)
        strip_layout.setContentsMargins(26, 12, 26, 16)

        box = QFrame()
        self._composer_box = box
        box_layout = QVBoxLayout(box)
        box_layout.setContentsMargins(14, 11, 14, 11)
        box_layout.setSpacing(12)

        self.composer = PromptComposer(self._store, registry=self.slash_registry)
        self.slash_popup = SlashCommandPopup(center)
        self.composer.attach_popup(self.slash_popup)
        self.composer.setPlaceholderText(
            "Message orchestrator — type / for commands, ↑ for history…"
        )
        # A floor, not a ceiling (SWR-3011): the composer keeps its one-line
        # resting height and grows into whatever the user gives its pane.
        self.composer.setMinimumHeight(48)
        self.composer.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Expanding)
        self.composer.setAccessibleName("Run prompt")
        self.composer.setAccessibleDescription(
            "Describe a task for the selected entry persona. Enter to send, Shift+Enter for newline."
        )
        self.composer.setStyleSheet("QPlainTextEdit{border:none;background:transparent;}")
        if self._store.ui.composer_draft:
            self.composer.setPlainText(self._store.ui.composer_draft)
        self.composer.draft_changed.connect(self._store.set_composer_draft)
        self.composer.submit_requested.connect(self._submit)
        box_layout.addWidget(self.composer)

        chips = QHBoxLayout()
        chips.setSpacing(8)
        self.composer_mode_label = QLabel()
        self.composer_mode_label.setObjectName("muted")
        self.composer_mode_label.setAccessibleName("Composer mode")
        chips.addWidget(self.composer_mode_label)
        self.persona_combo = _chip_combo([p.name for p in self._store.personas] or ["orchestrator"])
        self.persona_combo.setAccessibleName("Persona for the next prompt")
        if self._store.session_persona_override:
            self.persona_combo.setCurrentText(self._store.session_persona_override)
        self.persona_combo.currentTextChanged.connect(self._store.set_session_persona)
        chips.addWidget(self.persona_combo)
        self.model_combo = _chip_combo([], mono=True)
        populate_model_combo(
            self.model_combo,
            self._store.model_options,
            current=self._store.active_model,
            placeholder=_PLACEHOLDER_MODEL,
        )
        self.model_combo.setAccessibleName("Model for the next prompt")
        self.model_combo.currentTextChanged.connect(self._store.set_active_model)
        chips.addWidget(self.model_combo)
        self.reasoning_combo = _chip_combo(
            ["reasoning: low", "reasoning: medium", "reasoning: high"]
        )
        self.reasoning_combo.setAccessibleName("Reasoning strength for the next prompt")
        self.reasoning_combo.setCurrentIndex(2)
        self.reasoning_combo.currentTextChanged.connect(
            lambda text: self._store.set_session_reasoning(text.split(":")[-1].strip())
        )
        chips.addWidget(self.reasoning_combo)
        self.permission_combo = _chip_combo([f"mode: {name}" for name in permission_mode_names()])
        self.permission_combo.setAccessibleName("Permission mode")
        self.permission_combo.setAccessibleDescription(
            "How much agents may do without asking: restricted, ask, or autonomous. "
            "Applies to the next run and, during a run, from its next tool call."
        )
        self._sync_permission_combo()
        self.permission_combo.currentTextChanged.connect(self._on_permission_mode_changed)
        chips.addWidget(self.permission_combo)
        chips.addStretch(1)
        self.stash_button = make_button("Stash", "ghost")
        self.stash_button.setToolTip("Stash prompt for later")
        self.stash_button.clicked.connect(self._stash_prompt)
        chips.addWidget(self.stash_button)
        self.send_button = make_button("Send", "primary")
        set_button_icon(self.send_button, "paper-plane-right")
        self.send_button.setAccessibleName("Start run")
        self.send_button.clicked.connect(self._submit)
        chips.addWidget(self.send_button)
        box_layout.addLayout(chips)

        strip_layout.addWidget(box)
        prompt_layout.addWidget(composer_strip, 1)
        return center

    @traces(SWR.SWR_2438)
    def _submit(self) -> None:
        text = self.composer.toPlainText().strip()
        if not text:
            self.composer.setFocus()
            return
        if parse_slash_input(text) is not None:
            self.slash_popup.hide()
            # Clear before dispatching: a command that submits the composer
            # would otherwise re-read its own invocation and recurse.
            self.composer.clear()
            result = self.slash_registry.execute(text)
            if result.status != EXECUTED:
                # Give the text back so the user can correct it (SWR-2438).
                self.composer.setPlainText(text)
                self.composer.moveCursor(QTextCursor.MoveOperation.End)
                self.slash_error.emit(result.message)
            self.composer.flush_draft()
            return
        self.composer.clear()
        self.composer.flush_draft()
        if self._has_local_run():
            self.prompt_queued.emit(text)
        else:
            self.prompt_submitted.emit(text)

    def _has_local_run(self) -> bool:
        run_bridge = getattr(self.window(), "run_bridge", None)
        return bool(run_bridge is not None and getattr(run_bridge, "running", False))

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def _on_permission_mode_changed(self, text: str) -> None:
        """Apply the chip's selection: confirm, store, run, persist.

        A live run is changed first and separately from the persisted setting:
        the run reads its own pinned config, so the workspace file alone would
        not reach it (SWR-2503's mid-session clause).
        """
        mode = text.split(":")[-1].strip()
        if not mode or mode == self._store.runtime.permission_mode:
            return
        if mode == "autonomous" and not self._confirm_autonomous_mode():
            self._sync_permission_combo()
            return
        self._store.set_runtime_toggle("permission_mode", mode)
        run_bridge = getattr(self.window(), "run_bridge", None)
        if run_bridge is not None and getattr(run_bridge, "running", False):
            run_bridge.set_permission_mode(mode)
        self.permission_mode_selected.emit(mode)

    def _confirm_autonomous_mode(self) -> bool:
        """Ask before widening what agents may do without a prompt."""
        answer = QMessageBox.warning(
            self,
            "Switch to autonomous mode?",
            "Agents will run mutating tools inside the workspace without asking "
            "you first. Calls touching paths outside the workspace still need "
            "your approval.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Cancel,
        )
        return answer == QMessageBox.StandardButton.Yes

    def _sync_permission_combo(self) -> None:
        """Show the stored mode without re-triggering the change handler."""
        self.permission_combo.blockSignals(True)
        self.permission_combo.setCurrentText(f"mode: {self._store.runtime.permission_mode}")
        self.permission_combo.blockSignals(False)

    def _stash_prompt(self) -> None:
        text = self.composer.toPlainText().strip()
        if text:
            self._store.stash_prompt(text)
            self.composer.clear()

    @traces(SWR.SWR_2428)
    def set_terminal_count(self, live: int, total: int) -> None:
        """Label the toolbar with how many terminals are actually running.

        The count a user reads as "how many terminals are going" is the live
        one; the total only ever climbs, because a stream stays known after its
        command ends.
        """
        self._terminal_live = live
        self._terminal_total = total
        self._refresh_terminals_button()

    @traces(SWR.SWR_2428)
    def _refresh_terminals_button(self) -> None:
        live = getattr(self, "_terminal_live", 0)
        total = getattr(self, "_terminal_total", 0)
        label = f"Terminal ({live})" if live else "Terminal"
        self.terminals_button.setText(label)
        # Deliberately never disabled: a control that disappears when nothing
        # has run yet hides the feature from the user who is looking for it,
        # and the window's own empty state explains that case properly.
        self.terminals_button.setAccessibleName(
            f"Open terminal ({live} running)" if live else "Open terminal"
        )
        if total:
            running = f"{live} running" if live else "none running"
            self.terminals_button.setToolTip(
                f"Open the interactive terminal window · {total} known, {running}"
            )
            self.terminals_button.setAccessibleDescription(
                f"Open the interactive terminal window. {total} terminals in this session, "
                f"{running}."
            )
        else:
            self.terminals_button.setToolTip(
                "Open the interactive terminal window. "
                "A terminal appears here as soon as an agent runs a command."
            )
            self.terminals_button.setAccessibleDescription(
                "Open the interactive terminal window. No command has run in this session yet."
            )

    def _refresh_stash_button(self) -> None:
        self.stash_manage_button.setText(f"Apply stash ({len(self._store.prompt_stash)})")

    def _open_prompt_stash(self) -> None:
        dialog = PromptStashDialog(self._store.prompt_stash, self)
        if dialog.exec() and dialog.selected_index >= 0:
            self._use_stashed_prompt(dialog.selected_index, remove=dialog.remove_selected)

    def _use_stashed_prompt(self, index: int, *, remove: bool) -> None:
        if not 0 <= index < len(self._store.prompt_stash):
            return
        text = self._store.pop_stash(index) if remove else self._store.prompt_stash[index]
        current = self.composer.toPlainText().strip()
        self.set_composer_text(f"{current}\n\n{text}" if current else text)

    def _refresh_queued_prompts(self) -> None:
        _clear(self.queue_rows)
        prompts = self._store.queued_prompts
        self.queue_label.setText(f"Queued messages ({len(prompts)})")
        for prompt in prompts:
            row = _QueuedPromptRow(prompt)
            row.edited.connect(self.queued_prompt_edit_requested.emit)
            row.removed.connect(self.queued_prompt_delete_requested.emit)
            self.queue_rows.addWidget(row)
        self.queue_panel.setVisible(bool(prompts))

    def set_composer_text(self, text: str) -> None:
        self.composer.setPlainText(text)
        self.composer.setFocus()

    @traces(SWR.SWR_2507)
    def set_sandbox_status(self, active: bool, backend: str) -> None:
        """Show which OS-level sandbox this run *actually* got, or nothing.

        *active* is the recorded verdict — configured **and** available on this
        host — not the mode the session asked for. A badge claiming a sandbox
        for a run that did not get one would be worse than no badge at all, so
        an inactive or unnamed backend hides the badge entirely rather than
        rendering a hedged label.
        """
        if not active or not backend:
            self.sandbox_badge.clear()
            self.sandbox_badge.setAccessibleDescription("")
            self.sandbox_badge.hide()
            return
        self.sandbox_badge.setText(f"Sandboxed · {backend}")
        self.sandbox_badge.setAccessibleDescription(
            f"Terminal commands in this run are wrapped by the {backend} OS-level sandbox."
        )
        self.sandbox_badge.show()

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def _refresh_project_init(self) -> None:
        """Render the sidebar setup action, then re-evaluate the run gate.

        Four states, each naming its tasks and its reason: something to run,
        a run in progress, everything resolved, and nothing applicable. The
        wording stays task-agnostic (SWR-2800) — the labels come from the task
        registry, so a task added later needs no change here.
        """
        state = self._store.initialization
        runnable = state.pending or state.skipped
        if not state.running and not runnable:
            # Resolved (completed or nothing applicable) — nothing left to
            # do, so the section would only ever show a disabled button.
            # Collapse it rather than leave dead space in the sidebar.
            self.project_section_label.setVisible(False)
            self.initialize_project_button.setVisible(False)
            self.project_init_hint.setVisible(False)
            self._refresh_run_state()
            return

        self.project_section_label.setVisible(True)
        self.initialize_project_button.setVisible(True)
        self.project_init_hint.setVisible(True)
        if state.running:
            label = "Initializing…"
            enabled = False
            reason = "Setup is already running for this workspace."
            hint = "Running the pending setup tasks."
        else:
            label = "Initialize Project…"
            enabled = True
            reason = ""
            hint = f"Not run yet: {', '.join(_init_labels(runnable))}."
        if state.last_error:
            # A failed task records nothing, so it is still runnable — say so
            # here rather than letting the sidebar read as a clean "pending".
            hint = f"{hint} Last run failed: {state.last_error}"

        self.initialize_project_button.setText(label)
        self.initialize_project_button.setAccessibleName(label)
        set_action_availability(
            self.initialize_project_button,
            enabled=enabled,
            reason=reason,
        )
        self.project_init_hint.setText(hint)
        self.project_init_hint.setAccessibleDescription(hint)
        self._refresh_run_state()

    def _refresh_run_state(self) -> None:
        state = self._store.run_state
        local_run_active = self._has_local_run()
        run_needs_recovery = state.busy and not local_run_active and bool(self._store.session_name)
        labels = {
            "idle": "Ready",
            "starting": "Starting run…",
            "running": "Run active",
            "pausing": "Pausing after current step…",
            "paused": "Paused",
            "completed": "Completed",
            "failed": "Run failed",
            "cancelling": "Cancelling…",
            "cancelled": "Cancelled",
        }
        self.run_state_label.setText(
            "Run needs recovery" if run_needs_recovery else labels[state.value]
        )
        collecting = self._store.improvement_collection_active
        self.improvement_activity.setVisible(collecting)
        if collecting:
            self.improvement_dot.set_state(tokens().color.info_state, pulse=True)
        if self._store.active_model:
            select_model(self.run_model_combo, self._store.active_model)
        self.run_reasoning_combo.blockSignals(True)
        self.run_reasoning_combo.setCurrentText(
            f"reasoning: {self._store.session_reasoning_override or self._store.run_summary.reasoning}"
        )
        self.run_reasoning_combo.blockSignals(False)
        locked = state.busy and local_run_active
        run_controls_active = state.value == "running" and local_run_active
        if run_controls_active:
            run_unavailable_reason = ""
        elif run_needs_recovery:
            run_unavailable_reason = "Recover this session before using run controls."
        elif state.value == "paused":
            run_unavailable_reason = "Continue the paused run before using run controls."
        elif state.busy:
            run_unavailable_reason = (
                f"Run controls are unavailable while {labels[state.value].lower()}"
            )
        else:
            run_unavailable_reason = "Start or continue a run to enable run controls."
        set_action_availability(
            self.compress_button,
            enabled=run_controls_active,
            reason=run_unavailable_reason,
        )
        set_action_availability(
            self.run_model_combo,
            enabled=run_controls_active,
            reason=run_unavailable_reason,
        )
        set_action_availability(
            self.run_reasoning_combo,
            enabled=run_controls_active,
            reason=run_unavailable_reason,
        )
        set_action_availability(
            self.run_pause_button,
            enabled=run_controls_active,
            reason=run_unavailable_reason,
            help_button=self.run_availability_help,
        )
        set_action_availability(
            self.run_cancel_button,
            enabled=state.busy and local_run_active,
            reason=run_unavailable_reason,
        )
        # SWR-2802: an unanswered setup prompt gates agent execution and nothing
        # else — every other view stays usable, which is why this is a composer
        # gate rather than a window-wide block.
        setup_gate_reason = (
            "Answer the project setup prompt first. Initialize or skip it in the "
            "setup window; nothing else in Rotaris is blocked."
            if self._store.initialization.should_prompt
            else ""
        )
        can_send = (state.value != "cancelling" or run_needs_recovery) and not setup_gate_reason
        set_action_availability(
            self.send_button,
            enabled=can_send,
            reason=setup_gate_reason
            or ("Wait for the current run to finish cancelling." if not can_send else ""),
        )
        self.composer.setReadOnly(False)
        self.persona_combo.setEnabled(not locked)
        self.model_combo.setEnabled(not locked)
        self.reasoning_combo.setEnabled(not locked)
        # Deliberately not in the locked group above: SWR-2503's mid-session
        # clause is the point of this chip — a run you are watching go wrong is
        # exactly when you want to tighten the mode.
        self.permission_combo.setEnabled(True)
        self.stash_button.setEnabled(True)
        if locked:
            mode, button = "Run in progress", "Queue"
        elif self._store.session_name:
            mode, button = "Continue session", "Continue run"
        else:
            mode, button = "New run", "Start run"
        self.composer_mode_label.setText(mode)
        self.send_button.setText(button)
        self.send_button.setAccessibleName(button)
        self.composer.setPlaceholderText(
            "Run active — write a follow-up for the next iteration…"
            if locked
            else "Describe how to continue this session…"
            if run_needs_recovery
            else "Describe the outcome you want…"
        )

    @traces(SWR.SWR_2609)
    def _refresh_verifier_activity(self) -> None:
        """Show or hide the verification indicator, and drive its clock."""
        verifier = self._store.verifier
        color = tokens().color
        self.verifier_activity.setVisible(verifier.active or bool(verifier.gate_warning))
        if not verifier.active:
            self._verifier_tick.stop()
            if verifier.gate_warning:
                # SWR-2615: a workspace with no gate has nothing in flight to
                # report, and that silence is exactly what used to read as
                # "verified". Warn for as long as it lasts.
                self.verifier_dot.set_state(color.wait, pulse=False)
                self.verifier_skip_button.setEnabled(False)
                self.verifier_skip_button.hide()
                self.verifier_label.setText("No quality gate — nothing verified this run")
                self.verifier_label.setToolTip(verifier.gate_warning)
            return
        self.verifier_skip_button.show()
        self.verifier_label.setToolTip("")
        self.verifier_dot.set_state(color.info_state, pulse=True)
        # Between checks there is nothing to skip; the suite is deciding what
        # runs next, and a live button would resolve to a no-op.
        self.verifier_skip_button.setEnabled(bool(verifier.check))
        self._refresh_verifier_label()
        if not self._verifier_tick.isActive():
            self._verifier_tick.start()

    @traces(SWR.SWR_2609)
    def _refresh_verifier_label(self) -> None:
        """Rewrite the elapsed portion of the indicator, once per second."""
        verifier = self._store.verifier
        if not verifier.active:
            self._verifier_tick.stop()
            return
        if not verifier.check:
            self.verifier_label.setText("Verifying — starting checks…")
            return
        elapsed = max(0.0, time.time() - verifier.started_at) if verifier.started_at else 0.0
        text = f"Verifying — {verifier.position_label} · {_clock(elapsed)}"
        if verifier.deadline_s > 0:
            text += f" / {_clock(verifier.deadline_s)}"
        self.verifier_label.setText(text)

    @traces(SWR.SWR_2610)
    def _on_skip_verifier_check(self) -> None:
        """Stop the running check at the user's request, and say so."""
        if self._run_bridge is None:
            return
        if not self._run_bridge.skip_verifier_check():
            return
        # The row settles from the runner's own result; this only acknowledges
        # the press, which would otherwise look ignored for a second or two.
        self.verifier_skip_button.setEnabled(False)
        self.verifier_label.setText("Verifying — stopping the current check…")

    def open_search(self) -> None:
        self.search_panel.show()
        self.search_input.setFocus()
        self.search_input.selectAll()

    def close_search(self) -> None:
        self.search_panel.hide()
        self.composer.setFocus()

    @traces(SWR.SWR_2432)
    def _update_search_matches(self, query: str) -> None:
        # Matched against the *displayed* rows, so a match index is a row index
        # even when grouping folds several calls into one row.
        needle = query.casefold().strip()
        self._search_matches = [
            index
            for index, event in enumerate(self.transcript_scroll.transcript_model.events)
            if needle and needle in search_haystack(event).casefold()
        ]
        self._search_position = 0 if self._search_matches else -1
        self._show_search_match()

    def _next_search_match(self) -> None:
        if not self._search_matches:
            return
        self._search_position = (self._search_position + 1) % len(self._search_matches)
        self._show_search_match()

    def _previous_search_match(self) -> None:
        if not self._search_matches:
            return
        self._search_position = (self._search_position - 1) % len(self._search_matches)
        self._show_search_match()

    def _show_search_match(self) -> None:
        total = len(self._search_matches)
        self.search_count.setText(
            f"{self._search_position + 1} of {total}" if total else "0 results"
        )
        delegate = self.transcript_scroll.transcript_delegate
        if not total:
            delegate.set_search_match(-1)
            return
        row = self._search_matches[self._search_position]
        delegate.set_search_match(row)
        self.transcript_scroll.set_following_tail(False)
        self.transcript_scroll.setCurrentIndex(self.transcript_scroll.model().index(row, 0))
        self.transcript_scroll.scrollTo(
            self.transcript_scroll.model().index(row, 0),
            self.transcript_scroll.ScrollHint.PositionAtCenter,
        )

    def _refresh_transcript(self) -> None:
        with self._diagnostics.span("workspace.transcript_refresh"):
            self._refresh_transcript_content()

    @traces(SWR.SWR_2454)
    def _apply_transcript_delta(self, first: int, rows: object) -> None:
        """Apply a live run's transcript change without rebuilding the transcript.

        An agent filter (SWR-2099) makes a source-row boundary meaningless, so
        it is refused rather than approximated and the whole-list refresh runs
        instead. Tool grouping is handled incrementally (SWR-2432).

        A refusal *must* fall through to that refresh. It used to do so only
        when the boundary sat past the end of the model, which meant a delta
        that mutated a row already on screen — which is what a streaming row is
        — was dropped outright, and the transcript went stale until some later
        change happened to land past the end.
        """
        with self._diagnostics.span("workspace.transcript_delta"):
            if self._store.selected_agent_id:
                self._refresh_transcript_content()
                return
            events = cast("list[TranscriptEvent]", rows)
            old_count = self.transcript_scroll.transcript_model.rowCount()
            follow_tail = self.transcript_scroll.following_tail
            if not self.transcript_scroll.apply_events_delta(first, events):
                self._refresh_transcript_content()
                return
            self._after_transcript_rows_changed(old_count, follow_tail=follow_tail)

    def _on_transcript_delta_follow(self, _first: int, _rows: object) -> None:
        """The inspector's follow check, on the delta signal as well (SWR-2910)."""
        self._refresh_inspector_follow()

    def _display_settings(self) -> tuple[bool, bool]:
        """The only two UI settings the transcript's projection depends on."""
        return (self._store.ui.auto_collapse_tools, self._store.ui.group_tool_calls)

    @traces(SWR.SWR_2432)
    def _on_auto_collapse_changed(self) -> None:
        """Re-project and re-layout the transcript when a display toggle changes.

        Auto-collapse only changes row heights, but grouping changes which rows
        exist — so the projection is redone before the layout pass.

        `ui_changed` is the store's catch-all for interaction state — drawers,
        the active view, run status. Re-projecting a whole transcript for those
        is what made the chat flicker on unrelated UI activity, so this reads
        the two settings it actually depends on and returns when neither moved.
        """
        settings = self._display_settings()
        previous = self._applied_display_settings
        if settings == previous:
            return
        self._applied_display_settings = settings
        self.transcript_scroll.transcript_delegate._recent_tool_cache = None
        # Auto-collapse leaves the rows alone and changes their heights, so it
        # is the one toggle that has to re-measure even when nothing moved.
        self.transcript_scroll.refresh_grouping(force_layout=settings[0] != previous[0])

    def _refresh_transcript_content(self) -> None:
        events = self._visible_transcript()
        self.transcript_stack.setCurrentWidget(
            self.transcript_scroll if events else self.transcript_empty
        )
        self.clear_button.setEnabled(bool(self._store.transcript))
        self._refresh_terminals_button()
        model = self.transcript_scroll.transcript_model
        old_count = model.rowCount()
        follow_tail = self.transcript_scroll.following_tail
        # No scroll position is saved here on purpose. The view anchors on the
        # row the reader is looking at as each change lands, which survives rows
        # above it changing height; a pixel value read before the refresh does
        # not (SWR-2452).
        if not self.transcript_scroll.set_events(events):
            return

        self._after_transcript_rows_changed(old_count, follow_tail=follow_tail)

    def _after_transcript_rows_changed(self, old_count: int, *, follow_tail: bool) -> None:
        """What both transcript paths owe the surrounding chrome once rows move."""
        self.transcript_stack.setCurrentWidget(
            self.transcript_scroll
            if self.transcript_scroll.transcript_model.rowCount()
            else self.transcript_empty
        )
        self.clear_button.setEnabled(bool(self._store.transcript))
        self._refresh_terminals_button()
        # Counted in displayed rows, not source events: with grouping on, ten
        # new calls that join one group are one new row, and the badge must
        # match what scrolling down would actually reveal.
        new_count = self.transcript_scroll.transcript_model.rowCount()
        if follow_tail:
            self.new_output_button.hide()
        elif new_count > old_count:
            added = new_count - old_count
            self.new_output_button.setText(f"{added} new update" + ("s" if added != 1 else ""))
            self.new_output_button.show()
        if self.search_panel.isVisible() and self.search_input.text():
            self._update_search_matches(self.search_input.text())

    @traces(SWR.SWR_2099, SWR.SWR_2433)
    def _visible_transcript(self) -> list[TranscriptEvent]:
        events = filter_transcript_for_agent(
            self._store.transcript,
            self._store.selected_agent_id,
        )
        agent = self._store.selected_agent
        if agent is not None and agent.parent_id is not None:
            events.insert(0, delegation_context_event(agent))
        return events

    def _on_agent_selection_changed(self, _agent_id: str) -> None:
        self._refresh_inspector()
        self._refresh_transcript()
        agent = self._store.selected_agent
        if agent is None:
            self.transcript_scope_button.setText("All activity")
            self.transcript_scope_button.setToolTip("Showing every event in this run")
        else:
            self.transcript_scope_button.setText("This task")
            self.transcript_scope_button.setToolTip(f"Showing shared context and {agent.name}")

    def _scroll_to_tail(self) -> None:
        self.transcript_scroll.set_following_tail(True)
        self.new_output_button.hide()

    @override
    def resizeEvent(self, event: QResizeEvent) -> None:
        super().resizeEvent(event)
        self._apply_responsive_layout()
        if self.slash_popup.is_open():
            self.slash_popup.reposition(self.composer)

    def _apply_responsive_layout(self) -> None:
        compact = self.width() < 1180
        self._compact_layout = compact
        self.sidebar_toggle.setVisible(compact)
        self.inspector_toggle.setVisible(compact)
        self.sidebar_close.setVisible(compact)
        self.inspector_close.setVisible(compact)
        if compact:
            if self._panels_docked:
                # Taking a pane out of a splitter throws its size distribution
                # away, so the user's widths are written down first and read
                # back on the way in (SWR-3011).
                self.panes.remember()
                self.sidebar_panel.setParent(self)
                self.inspector_panel.setParent(self)
                self._panels_docked = False
            self.sidebar_panel.setGeometry(0, 0, self.sidebar_panel.width(), self.height())
            self.inspector_panel.setGeometry(
                self.width() - self.inspector_panel.width(),
                0,
                self.inspector_panel.width(),
                self.height(),
            )
            self.sidebar_panel.setVisible(self._store.ui.sidebar_open)
            self.inspector_panel.setVisible(self._store.ui.inspector_open)
            if self.sidebar_panel.isVisible():
                self.sidebar_panel.raise_()
            if self.inspector_panel.isVisible():
                self.inspector_panel.raise_()
        else:
            if not self._panels_docked:
                self.sidebar_panel.hide()
                self.inspector_panel.hide()
                self.panes.insertWidget(0, self.sidebar_panel)
                self.panes.addWidget(self.inspector_panel)
                self.panes.setStretchFactor(1, 1)
                self.panes.name_handles(
                    ["Resize the workspace context panel", "Resize the inspector panel"]
                )
                self._panels_docked = True
                self.sidebar_panel.show()
                self.inspector_panel.show()
                # After the panes are visible, never before: a splitter gives a
                # hidden child no width, and sizing one is sizing nothing.
                self.panes.restore()
            self.sidebar_panel.show()
            self.inspector_panel.show()
        self.sidebar_toggle.setText(
            "Hide agents & todos"
            if self.sidebar_panel.isVisible() and compact
            else "Agents & todos"
        )
        self.inspector_toggle.setText(
            "Hide inspector" if self.inspector_panel.isVisible() and compact else "Inspector"
        )

    def _toggle_sidebar(self) -> None:
        if not self._compact_layout:
            return
        show = not self.sidebar_panel.isVisible()
        self._store.set_drawer_state(sidebar=show, inspector=False if show else None)
        self._apply_responsive_layout()

    def _toggle_inspector(self) -> None:
        if not self._compact_layout:
            return
        show = not self.inspector_panel.isVisible()
        self._store.set_drawer_state(inspector=show, sidebar=False if show else None)
        self._apply_responsive_layout()

    # ── inspector ─────────────────────────────────────────────────────────

    def _build_inspector(self) -> QWidget:
        panel = QWidget()
        panel.setObjectName("panel")
        panel.setAutoFillBackground(True)
        panel.setMinimumWidth(_INSPECTOR_MIN_WIDTH)
        panel.setMaximumWidth(_INSPECTOR_MAX_WIDTH)
        panel.resize(_INSPECTOR_WIDTH, panel.height())
        scroll = QScrollArea(panel)
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        holder = QWidget()
        holder.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        layout = QVBoxLayout(holder)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(9)

        inspector_header = QHBoxLayout()
        inspector_header.addWidget(SectionLabel("Inspector"))
        inspector_header.addStretch(1)
        self.inspector_close = QToolButton()
        self.inspector_close.setText("×")
        self.inspector_close.setAccessibleName("Close inspector drawer")
        self.inspector_close.setToolTip("Close drawer (Escape)")
        self.inspector_close.clicked.connect(self._toggle_inspector)
        inspector_header.addWidget(self.inspector_close)
        layout.addLayout(inspector_header)
        name_row = QHBoxLayout()
        self.inspector_dot = StatusDot(size=8)
        name_row.addWidget(self.inspector_dot)
        self.inspector_name = QLabel("—")
        # Ignored width so a long agent name is clipped by the fixed-width panel
        # instead of pushing the follow tag off its edge (SWR-2910).
        self.inspector_name.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        name_row.addWidget(self.inspector_name, 1)
        # A word, not just a placement: the panel says out loud that it is
        # tracking the newest agent rather than one the user picked.
        self.inspector_follow_tag = Tag("live", "accent")
        self.inspector_follow_tag.setAccessibleName("Inspector is following the newest agent")
        self.inspector_follow_tag.setToolTip(
            "No agent is selected, so this panel follows whichever agent wrote "
            "the newest transcript row. Select an agent to pin it here."
        )
        self.inspector_follow_tag.hide()
        name_row.addWidget(self.inspector_follow_tag)
        layout.addLayout(name_row)
        self.inspector_meta = QLabel("")
        layout.addWidget(self.inspector_meta)
        self.inspector_tabs = QTabWidget()
        self.inspector_tabs.setDocumentMode(True)
        self.inspector_tabs.setAccessibleName("Agent persona inspector tabs")
        self.inspector_tabs.currentChanged.connect(self._on_inspector_tab_changed)
        layout.addWidget(self.inspector_tabs)
        self._inspector_personas: list[str] = []

        self.inspector_empty = QLabel(
            "Select an agent to inspect its model, context, tools, artifacts, and controls."
        )
        self.inspector_empty.setObjectName("muted")
        self.inspector_empty.setWordWrap(True)
        layout.addWidget(self.inspector_empty)

        ring_row = QHBoxLayout()
        ring_row.addStretch(1)
        self.context_ring = ContextRing()
        ring_row.addWidget(self.context_ring)
        ring_row.addStretch(1)
        layout.addLayout(ring_row)
        threshold_note = QLabel(
            f"context window · compresses at {self._store.runtime.compression_threshold_pct}%"
        )
        threshold_note.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._micro_labels.append(threshold_note)
        layout.addWidget(threshold_note)
        self.context_scope_note = QLabel("Per-agent context window, not the session total.")
        self.context_scope_note.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.context_scope_note.setWordWrap(True)
        self._micro_labels.append(self.context_scope_note)
        layout.addWidget(self.context_scope_note)

        layout.addWidget(self._field_label("Model"))
        self.inspector_model = QComboBox()
        self.inspector_model.setAccessibleName("Model for the selected agent")
        self.inspector_model.setMinimumWidth(0)
        self.inspector_model.setProperty("mono", "true")
        populate_model_combo(
            self.inspector_model, self._store.model_options, placeholder=_PLACEHOLDER_MODEL
        )
        layout.addWidget(self.inspector_model)

        layout.addWidget(self._field_label("Reasoning strength"))
        self.inspector_reasoning = SegmentedControl(["low", "medium", "high"])
        layout.addWidget(self.inspector_reasoning)
        self.scope_note = QLabel("takes effect from the next iteration")
        self.scope_note.setWordWrap(True)
        self._micro_labels.append(self.scope_note)
        layout.addWidget(self.scope_note)

        self.popout_button = make_button("Pop out", "ghost")
        set_button_icon(self.popout_button, "arrows-out-simple")
        self.popout_button.setAccessibleName("Open selected agent in separate window")
        self.popout_button.clicked.connect(self._popout_selected)
        layout.addWidget(self.popout_button)

        layout.addWidget(self._field_label("Tools"))
        self.tools_layout = QVBoxLayout()
        self.tools_layout.setSpacing(4)
        layout.addLayout(self.tools_layout)

        layout.addWidget(self._field_label("Artifacts"))
        self.artifacts_layout = QVBoxLayout()
        self.artifacts_layout.setSpacing(2)
        layout.addLayout(self.artifacts_layout)

        buttons = QHBoxLayout()
        self.steer_button = make_button("Steer", "secondary")
        set_button_icon(self.steer_button, "chat-teardrop-text")
        self.steer_button.clicked.connect(
            lambda: self.steer_requested.emit(self._inspected_agent_id())
        )
        buttons.addWidget(self.steer_button)
        self.cancel_button = make_button("Cancel", "danger")
        set_button_icon(self.cancel_button, "x-circle")
        self.cancel_button.clicked.connect(self._cancel_selected)
        buttons.addWidget(self.cancel_button)
        layout.addLayout(buttons)
        self.cascade_note = QLabel("")
        self.cascade_note.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._micro_labels.append(self.cascade_note)
        layout.addWidget(self.cascade_note)
        layout.addStretch(1)

        scroll.setWidget(holder)
        wrapper = QVBoxLayout(panel)
        wrapper.setContentsMargins(0, 0, 0, 0)
        wrapper.addWidget(scroll)
        return panel

    def _field_label(self, text: str) -> QLabel:
        """A caption above an inspector control.

        Registered rather than styled here: its size and colour are tokens, so
        the label has to be reachable again when the theme changes.
        """
        label = QLabel(text)
        self._micro_labels.append(label)
        return label

    def _refresh_inspector(self) -> None:
        with self._diagnostics.span("workspace.inspector_refresh"):
            self._refresh_inspector_content()

    @traces(SWR.SWR_2910)
    def _inspected_agent_id(self) -> str:
        """Agent the inspector describes: the user's pick, else the live one.

        Selecting an agent also scopes the transcript, so the unscoped "All
        activity" view is exactly the state with no selection — and the panel
        that names the model, its context and its tools must not be blank there.
        """
        if self._store.selected_agent_id:
            return self._store.selected_agent_id
        return latest_transcript_author(self._store.transcript, self._store.agents)

    @traces(SWR.SWR_2910)
    def _refresh_inspector_follow(self) -> None:
        """Rebuild the inspector only when a new row moved the followed agent."""
        followed = "" if self._store.selected_agent_id else self._inspected_agent_id()
        if followed == self._followed_agent_id:
            return
        self._refresh_inspector()

    @traces(SWR.SWR_2089)
    def inspect_agent(self, agent_id: str) -> None:
        """Select an agent, focus its persona tab, and reveal compact inspector."""
        agent = self._store.agents.get(agent_id)
        if agent is None:
            return
        self._store.select_agent(agent_id)
        if self._compact_layout:
            self._store.set_drawer_state(sidebar=False, inspector=True)
            self._apply_responsive_layout()
        self._select_inspector_persona(agent.persona)

    def _refresh_inspector_tabs(self) -> None:
        personas = list(
            dict.fromkeys(
                [persona.name for persona in self._store.personas]
                + [agent.persona for agent in self._store.agent_list()]
            )
        )
        if personas == self._inspector_personas:
            return
        inspected = self._store.agents.get(self._inspected_agent_id())
        selected_persona = inspected.persona if inspected is not None else ""
        self.inspector_tabs.blockSignals(True)
        self.inspector_tabs.clear()
        self._inspector_personas = personas
        for persona in personas:
            page = QWidget()
            page.setAccessibleName(f"{persona} agent inspector")
            page_layout = QVBoxLayout(page)
            page_layout.setContentsMargins(8, 6, 8, 6)
            count = sum(1 for agent in self._store.agent_list() if agent.persona == persona)
            summary = QLabel(f"{count} instance" + ("s" if count != 1 else ""))
            summary.setObjectName("muted")
            page_layout.addWidget(summary)
            self.inspector_tabs.addTab(page, persona)
        self.inspector_tabs.blockSignals(False)
        self.inspector_tabs.setVisible(bool(personas))
        self._select_inspector_persona(selected_persona)

    def _select_inspector_persona(self, persona: str) -> None:
        if persona in self._inspector_personas:
            self.inspector_tabs.blockSignals(True)
            self.inspector_tabs.setCurrentIndex(self._inspector_personas.index(persona))
            self.inspector_tabs.blockSignals(False)

    def _on_inspector_tab_changed(self, index: int) -> None:
        if not 0 <= index < len(self._inspector_personas):
            return
        persona = self._inspector_personas[index]
        current = self._store.selected_agent
        if current is not None and current.persona == persona:
            return
        agent = next(
            (candidate for candidate in self._store.agent_list() if candidate.persona == persona),
            None,
        )
        if agent is not None:
            self._store.select_agent(agent.id)

    @traces(SWR.SWR_2910)
    def _refresh_inspector_content(self) -> None:
        self._refresh_inspector_tabs()
        agent_id = self._inspected_agent_id()
        following = bool(agent_id) and not self._store.selected_agent_id
        self._followed_agent_id = agent_id if following else ""
        agent = self._store.agents.get(agent_id)
        if agent is None:
            self.inspector_name.setText("—")
            self.inspector_name.setAccessibleDescription("")
            self.inspector_follow_tag.hide()
            self.inspector_meta.setText("no agent selected")
            # `idle` rather than a ramp step: the dot is a shape, and the only
            # neutral guaranteed to clear 3:1 on the panel it sits on.
            self.inspector_dot.set_state(tokens().color.idle)
            self.context_ring.set_context(0, 1, self._store.runtime.compression_threshold_pct)
            self.inspector_model.setEnabled(False)
            self.inspector_reasoning.setEnabled(False)
            self.scope_note.setText("takes effect from the next iteration")
            _clear(self.tools_layout)
            _clear(self.artifacts_layout)
            self.steer_button.setEnabled(False)
            self.cancel_button.setEnabled(False)
            self.popout_button.setEnabled(False)
            self.cascade_note.clear()
            self.inspector_empty.show()
            return
        self.inspector_follow_tag.setVisible(following)
        self.inspector_name.setAccessibleDescription(
            f"Following {agent.name}, the agent that wrote the newest transcript row. "
            "Select an agent to pin this panel to it."
            if following
            else ""
        )
        self.inspector_empty.hide()
        self.inspector_model.setEnabled(False)
        self.inspector_reasoning.setEnabled(False)
        self.scope_note.setText(
            "Model and reasoning are set per persona. Edit in Settings → Personas."
        )
        self.steer_button.setEnabled(agent.state.value in ("running", "waiting"))
        self.cancel_button.setEnabled(agent.state.value in ("running", "waiting", "queued"))
        self.popout_button.setEnabled(True)
        self._select_inspector_persona(agent.persona)
        self.inspector_dot.set_state(theme.state_color(agent.state.value), pulse=agent.is_live)
        self.inspector_name.setText(agent.name)
        self.inspector_meta.setText(
            f"{agent.state.value} · {agent.elapsed or '—'} · {agent.tool_calls} tool calls"
        )
        self.context_ring.set_context(
            agent.ctx_used,
            agent.ctx_limit,
            self._store.runtime.compression_threshold_pct,
        )
        if agent.model and not select_model(self.inspector_model, agent.model):
            # An agent can be running a model the catalog no longer offers; the
            # inspector still has to name it.
            populate_model_combo(
                self.inspector_model,
                self._store.model_options,
                current=agent.model,
                placeholder=_PLACEHOLDER_MODEL,
            )
        self.inspector_reasoning.set_value(agent.reasoning)

        _clear(self.tools_layout)
        for tool in agent.tools:
            self.tools_layout.addWidget(_tool_chip(tool, agent))
        # MCP tools are the other half of what this agent can call, and the panel
        # showed none of them (SWR-3010). Grouped per server, because "serena" and
        # "git" answer different questions and a flat list hides which is which.
        t = tokens()
        for server, mcp_tools in agent.mcp_tools.items():
            if not mcp_tools:
                continue
            heading = QLabel(server)
            # No `text-transform` or `letter-spacing`: QSS accepts both and
            # implements neither, so the kicker treatment this heading was
            # written for never reached the screen and is not restated here.
            heading.setStyleSheet(
                f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};"
                f"padding-top:{t.space.xs}px;"
            )
            heading.setAccessibleName(f"MCP server {server}")
            self.tools_layout.addWidget(heading)
            for tool in mcp_tools:
                self.tools_layout.addWidget(_tool_chip(tool, agent, server=server))

        _clear(self.artifacts_layout)
        for info in self._store.artifacts_for_agent(agent.id):
            self.artifacts_layout.addWidget(artifact_link(info, self.artifact_open_requested.emit))

        descendants = [
            d
            for d in self._store.descendants(agent.id)
            if d.state.value in ("running", "waiting", "queued")
        ]
        self.cascade_note.setText(
            f"cancel cascades to {len(descendants)} descendants" if descendants else ""
        )

    def _cancel_selected(self) -> None:
        agent_id = self._inspected_agent_id()
        if agent_id:
            self.cancel_requested.emit(agent_id)

    def _on_run_model_changed(self, model: str) -> None:
        run_bridge = getattr(self.window(), "run_bridge", None)
        if run_bridge is not None and getattr(run_bridge, "running", False):
            run_bridge.switch_entry_model(model)

    def _on_run_reasoning_changed(self, text: str) -> None:
        run_bridge = getattr(self.window(), "run_bridge", None)
        if run_bridge is not None and getattr(run_bridge, "running", False):
            run_bridge.switch_entry_reasoning(text.split(":")[-1].strip())

    @traces(SWR.SWR_2091)
    def _popout_selected(self) -> None:
        agent_id = self._inspected_agent_id()
        if agent_id:
            self.agent_popout_requested.emit(agent_id)


# ── row builders ──────────────────────────────────────────────────────────


@traces(SWR.SWR_2454)
def _clear(layout: QLayout) -> None:
    """Empty a layout, leaving nothing of it on screen.

    ``takeAt`` removes a widget from the *layout* only, and ``deleteLater``
    merely posts the deletion. In between, the widget is still parented, still
    visible and still holding its old geometry — so it goes on painting until
    the event loop gets round to destroying it. One event-loop pass, normally,
    and invisible.

    Under a busy loop it is not invisible: the rebuilds outrun the deletions and
    the orphans pile up at the same coordinates, all painting, which is what
    drew the sidebar's run label through the todo text and stacked the
    inspector's ring labels on top of each other. Hiding and unparenting first
    makes that impossible however far behind the loop falls.
    """
    while layout.count():
        item = layout.takeAt(0)
        widget = item.widget()
        if widget is not None:
            widget.hide()
            widget.setParent(None)
            widget.deleteLater()
        elif item.layout():
            _clear(item.layout())


@traces(SWR.SWR_3010)
def _tool_chip(tool: str, agent: AgentNode, *, server: str = "") -> QLabel:
    """One tool chip, carrying whether the agent is calling it, has, or has not."""
    t = tokens()
    active = _tool_was_called(tool, agent.active_tools)
    called = _tool_was_called(tool, agent.called_tools)
    state_label = "active" if active else "used" if called else "not used"
    chip = QLabel(f"{tool} · {state_label}")
    chip.setWordWrap(True)
    if active:
        border, color = t.color.accent[800], t.color.accent[300]
    elif called:
        border, color = t.color.accent[400], t.color.text
    else:
        border, color = t.color.neutral[700], t.color.text_tertiary
    chip.setStyleSheet(
        f"padding:2px {t.space.sm}px;border:{t.size.hairline}px solid {border};"
        f"border-radius:{t.radius.sm}px;"
        f"font-family:{t.type.mono};font-size:{t.type.scale.x2s}px;color:{color};"
    )
    where = f"{server} tool" if server else "Tool"
    chip.setAccessibleName(f"{where} {tool}, {state_label}")
    return chip


def _tool_was_called(tool: str, recorded: Sequence[str]) -> bool:
    """Whether *tool* appears in a recorded call list, prefix or not.

    An MCP tool is granted under the name its server reports, but a call may be
    recorded under a client-prefixed one; matching only exactly would leave every
    MCP chip reading "not used" forever.
    """
    for name in recorded:
        if name == tool:
            return True
        if name.endswith(tool) and name[: -len(tool)][-1:] in {"_", "-"}:
            return True
    return False


def _init_labels(task_ids: Sequence[str]) -> list[str]:
    """Display labels for initialization task ids, in the given order."""
    return [init_task_label(task) for task in task_ids]


def _chip_combo(items: list[str], mono: bool = False) -> QComboBox:
    combo = QComboBox()
    combo.addItems(items)
    if mono:
        combo.setProperty("mono", "true")
    return combo


@traces(SWR.SWR_2415)
def _is_switchable(session: SessionInfo) -> bool:
    """True for runs worth offering in the sidebar switcher.

    Live runs are the point of the list, and the focused run stays listed after
    it finishes so the session a user is reading never drops out from under them.
    """
    state = RunUiState.from_backend(session.status)
    return session.focused or state.busy or state is RunUiState.PAUSED


#: Text width a sidebar row may draw into at the default panel width: the panel
#: less its own 14px margins and the row's 10px ones. Session ids and branches
#: are wider than that, so every string in a row is elided against this budget.
_SESSION_ROW_TEXT_WIDTH = _SIDEBAR_WIDTH - 2 * 14 - 2 * 10


@traces(SWR.SWR_2415, SWR.SWR_3011)
def _session_row_text_width(panel_width: int) -> int:
    """The elision budget for a sidebar row inside a panel this wide."""
    if panel_width <= 0:
        return _SESSION_ROW_TEXT_WIDTH
    return max(panel_width - 2 * 14 - 2 * 10, 80)


@traces(SWR.SWR_2415, SWR.SWR_2907, SWR.SWR_3612)
def _session_row(
    session: SessionInfo,
    on_focus: Callable[[str], None],
    text_width: int = _SESSION_ROW_TEXT_WIDTH,
) -> QWidget:
    """One run in the sidebar switcher: click its name to focus that run."""
    t = tokens()
    state = RunUiState.from_backend(session.status)
    row = QFrame()
    if session.focused:
        row.setStyleSheet(
            f"QFrame{{background:{t.color.accent_tint_soft};"
            f"border:{t.size.hairline}px solid {t.color.accent[900]};"
            f"border-radius:{t.radius.sm}px;}}"
        )
    layout = QVBoxLayout(row)
    layout.setContentsMargins(10, 8, 10, 8)
    layout.setSpacing(3)
    top = QHBoxLayout()
    top.setSpacing(7)
    dot = StatusDot(size=6)
    if state.busy:
        dot_color = t.color.run
    elif state is RunUiState.FAILED:
        dot_color = t.color.fail
    elif state is RunUiState.PAUSED:
        dot_color = t.color.info_state
    else:
        dot_color = t.color.idle
    dot.set_state(dot_color, pulse=state.busy)
    top.addWidget(dot)
    switch = make_button(session.name, "link")
    switch.setAccessibleName(f"Switch to session {session.name}")
    # The row is labeled by task wording (SWR-2907); the session id stays
    # reachable here so a run can still be matched to its session directory.
    # A requirement-started run also names what it is for (SWR-3612) — the badge
    # carries the requirement, the tooltip and the accessible description the
    # unit, which is too long for a sidebar row and rarely what a user scans for.
    tip = f"Show this run in the workspace. Session {session.id}"
    if session.attribution:
        tip = f"{tip}. Started for requirement {session.attribution}"
    switch.setToolTip(tip)
    switch.clicked.connect(lambda _checked=False, sid=session.id: on_focus(sid))
    # A run title (or, for pre-title sessions, the raw id) can be wider than
    # the sidebar. Elide what is drawn; the accessible name, tooltip and click
    # target keep the full text. A title loses its least meaning at the end, an
    # id in the middle. Every tag is measured rather than assumed, so no badge
    # can push the name past the panel edge at the 1000x680 minimum.
    tag = Tag("focused", "info") if session.focused else None
    # Nothing at all for a run a person started: an empty badge would read as a
    # requirement whose id failed to load (SWR-3612).
    requirement_tag = Tag(session.requirement_id, "accent") if session.requirement_id else None
    # A run blocked on a person is the one state a reader must not scroll past
    # (SWR-3625). A word, like every other badge here, because the colour alone
    # would carry it.
    waiting_tag = Tag("waiting for you", "wait") if session.awaiting_input else None
    tag_width = sum(
        badge.sizeHint().width() + top.spacing()
        for badge in (tag, requirement_tag, waiting_tag)
        if badge is not None
    )
    switch.setText(
        switch.fontMetrics().elidedText(
            session.name,
            Qt.TextElideMode.ElideMiddle
            if session.name == session.id
            else Qt.TextElideMode.ElideRight,
            text_width - 13 - tag_width,
        )
    )
    top.addWidget(switch)
    top.addStretch(1)
    # One description, composed: a focused requirement run has two things to say
    # and setting the second would otherwise silently drop the first.
    described = [
        part
        for part in (
            "Currently focused run" if session.focused else "",
            f"Started for requirement {session.attribution}" if session.attribution else "",
            session.attention,
        )
        if part
    ]
    if described:
        switch.setAccessibleDescription(". ".join(described))
    if waiting_tag is not None:
        waiting_tag.setAccessibleName(session.attention)
        waiting_tag.setToolTip(f"{session.attention}. Open this run to answer it.")
        top.addWidget(waiting_tag)
    if requirement_tag is not None:
        requirement_tag.setAccessibleName(f"Requirement {session.attribution}")
        requirement_tag.setToolTip(f"This run implements requirement {session.attribution}.")
        top.addWidget(requirement_tag)
    if tag is not None:
        # A word, not just the accent frame: state must survive colour blindness.
        top.addWidget(tag)
    layout.addLayout(top)
    # Status in words beside the branch: the dot alone would carry the state.
    summary = f"{session.branch or '—'} · {state.value}"
    detail = QLabel(summary)
    # Set rather than styled, so the metrics below measure the face that is drawn.
    detail.setFont(t.type.mono_font(t.type.scale.x2s))
    # The branch ends in the session id, so its tail is what identifies the run.
    detail.setText(
        detail.fontMetrics().elidedText(summary, Qt.TextElideMode.ElideLeft, text_width - 13)
    )
    detail.setToolTip(summary)
    detail.setStyleSheet(
        f"color:{t.color.text_secondary};border:none;background:transparent;padding-left:13px;"
    )
    detail.setAccessibleName(f"Session {session.name} status")
    detail.setAccessibleDescription(summary)
    layout.addWidget(detail)
    return row
