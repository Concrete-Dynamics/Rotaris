"""Separate persona window with one tab per agent instance."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPlainTextEdit,
    QScrollArea,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.markdown import MarkdownLabel
from rotaris.theme import persona_color, state_color
from rotaris.theme.manager import Themed
from rotaris.views.transcript import TranscriptListView, filter_transcript_for_agent
from rotaris.widgets import (
    Card,
    ContextRing,
    StatusDot,
    artifact_link,
    make_button,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.models.state import AgentNode
    from rotaris.models.store import WorkspaceStore
    from rotaris.models.terminal import TerminalScreen
    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2004, SWR.SWR_2099)
class AgentWindow(Themed, QMainWindow):
    """Window grouping all live and completed instances of one persona."""

    steer_requested = Signal(str, str)
    cancel_requested = Signal(str)
    artifact_open_requested = Signal(str)  # artifact id

    def __init__(
        self,
        store: WorkspaceStore,
        persona: str,
        parent: QWidget | None = None,
        terminal_screens: Callable[[str], TerminalScreen | None] | None = None,
    ) -> None:
        super().__init__(parent)
        self._store = store
        self.terminal_screens = terminal_screens
        self.persona = persona
        self.setObjectName("agentWindow")
        self.setWindowTitle(f"Rotaris · {persona}")
        self.resize(820, 620)
        root = QWidget()
        root.setObjectName("appRoot")
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(12)
        header = QHBoxLayout()
        title = QLabel(persona)
        title.setObjectName("pageTitle")
        header.addWidget(title)
        self.summary = QLabel()
        header.addWidget(self.summary)
        header.addStretch(1)
        layout.addLayout(header)
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        layout.addWidget(self.tabs, 1)
        self.persona_artifacts = Card(f"Artifacts by {persona} (all instances)")
        self.persona_artifact_rows = QVBoxLayout()
        self.persona_artifact_rows.setSpacing(2)
        self.persona_artifacts.body.addLayout(self.persona_artifact_rows)
        layout.addWidget(self.persona_artifacts)
        store.agents_changed.connect(self.refresh)
        store.artifacts_changed.connect(self.refresh)
        store.transcript_changed.connect(self._refresh_transcripts)
        # A live run reports its transcript through ``transcript_delta`` alone
        # (SWR-2454). This window rebuilds from the whole list either way — it
        # shows one agent's slice, which a source-row boundary does not
        # describe — so it answers the narrow signal with the wide refresh. It
        # only exists while a pop-out is open, so that cost is a user's choice.
        store.transcript_delta.connect(self._on_transcript_delta)
        self.refresh()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.summary.setStyleSheet(
            f"font-family:{theme.type.mono};"
            f"font-size:{theme.type.scale.x2s}px;"
            f"color:{theme.color.text_secondary};"
        )

    def refresh(self, select_agent_id: str = "") -> None:
        current_id = select_agent_id or self.current_agent_id()
        agents = [a for a in self._store.agent_list() if a.persona == self.persona]
        self.summary.setText(f"{len(agents)} instance" + ("s" if len(agents) != 1 else ""))
        self.tabs.clear()
        target = 0
        for index, agent in enumerate(agents):
            self.tabs.addTab(_AgentTab(self._store, agent, self), agent.name)
            self.tabs.setTabToolTip(index, f"{agent.state.value} · {agent.activity}")
            if agent.id == current_id:
                target = index
        if agents:
            self.tabs.setCurrentIndex(target)
        while self.persona_artifact_rows.count():
            item = self.persona_artifact_rows.takeAt(0)
            widget = item.widget()
            if widget is not None:
                # Hidden and unparented before the deletion is posted: a widget
                # taken out of a layout keeps painting until the event loop
                # destroys it, and a loop behind on work leaves it on screen
                # under its replacement (SWR-2454).
                widget.hide()
                widget.setParent(None)
                widget.deleteLater()
        infos = self._store.artifacts_for_persona(self.persona)
        if not infos:
            self.persona_artifact_rows.addWidget(_muted("No artifacts published yet."))
        for info in infos:
            self.persona_artifact_rows.addWidget(
                artifact_link(info, self.artifact_open_requested.emit)
            )

    def current_agent_id(self) -> str:
        page = self.tabs.currentWidget()
        return page.agent_id if isinstance(page, _AgentTab) else ""

    def _refresh_transcripts(self) -> None:
        for index in range(self.tabs.count()):
            page = self.tabs.widget(index)
            if isinstance(page, _AgentTab):
                page.refresh_transcript()

    @traces(SWR.SWR_2454)
    def _on_transcript_delta(self, _first: int, _rows: object) -> None:
        self._refresh_transcripts()


@traces(SWR.SWR_2093, SWR.SWR_2421, SWR.SWR_2432, SWR.SWR_3010)
class _AgentTab(Themed, QScrollArea):
    def __init__(
        self,
        store: WorkspaceStore,
        agent: AgentNode,
        window: AgentWindow,
    ) -> None:
        super().__init__()
        self._store = store
        self.agent_id = agent.id
        # Kept because the heading paints from them again on a theme change, and
        # the tab is rebuilt from the store rather than refreshed in place.
        self._persona = agent.persona
        self._state = agent.state.value
        self._live = agent.is_live
        self.setWidgetResizable(True)
        body = QWidget()
        self.setWidget(body)
        root = QVBoxLayout(body)
        root.setContentsMargins(6, 14, 6, 6)
        root.setSpacing(12)

        heading = QHBoxLayout()
        self._dot = StatusDot(size=8)
        heading.addWidget(self._dot)
        self._name_label = QLabel(agent.name)
        heading.addWidget(self._name_label)
        self._state_label = QLabel(agent.state.value)
        self._state_label.setObjectName("muted")
        heading.addWidget(self._state_label)
        heading.addStretch(1)
        root.addLayout(heading)

        transcript = Card("Agent transcript", accented=True)
        transcript_body = QWidget()
        transcript_body.setMinimumHeight(260)
        transcript_stack = QVBoxLayout(transcript_body)
        transcript_stack.setContentsMargins(0, 0, 0, 0)
        self.transcript_scroll = TranscriptListView()
        self.transcript_scroll.setAccessibleName(f"{agent.name} transcript")
        self.transcript_scroll.set_auto_collapse_getter(lambda: self._store.ui.auto_collapse_tools)
        self.transcript_scroll.set_group_tools_getter(lambda: self._store.ui.group_tool_calls)
        if window.terminal_screens is not None:
            # The persona window shows the same rows as the workspace, so a
            # terminal row must stream there too rather than falling back to the
            # persisted summary (SWR-2428).
            self.transcript_scroll.set_terminal_screens(window.terminal_screens)
        transcript_stack.addWidget(self.transcript_scroll)
        self.transcript_empty = _muted("No transcript activity for this agent yet.")
        self.transcript_empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        transcript_stack.addWidget(self.transcript_empty)
        transcript.body.addWidget(transcript_body)
        root.addWidget(transcript)
        self.refresh_transcript()

        details = QHBoxLayout()
        context = Card("Context", accented=True)
        ring = ContextRing()
        ring.set_context(agent.ctx_used, agent.ctx_limit, store.runtime.compression_threshold_pct)
        context.body.addWidget(ring, 0, Qt.AlignmentFlag.AlignHCenter)
        context.body.addWidget(_muted(f"{agent.tool_calls} tool calls · {agent.elapsed or '-'}"))
        details.addWidget(context)

        controls = Card("Instance controls")
        controls.body.addWidget(_muted("Model"))
        controls.body.addWidget(_value_label(agent.model or "—"))
        controls.body.addWidget(_muted("Reasoning"))
        controls.body.addWidget(_value_label(agent.reasoning or "—"))
        details.addWidget(controls, 1)
        root.addLayout(details)

        activity = Card("Current activity", accented=True)
        activity_label = MarkdownLabel(agent.activity or "No current activity")
        activity.body.addWidget(activity_label)
        root.addWidget(activity)

        tools = Card("Tools and artifacts")
        tools.body.addWidget(_muted("Available: " + (", ".join(agent.tools) or "none")))
        # The pop-out reads the same resolved set as the inspector panel (SWR-3010);
        # one agent must not describe itself two ways depending on the window.
        for server, mcp_tools in agent.mcp_tools.items():
            if mcp_tools:
                tools.body.addWidget(_muted(f"{server}: " + ", ".join(mcp_tools)))
        tools.body.addWidget(_muted("Active: " + (", ".join(agent.active_tools) or "none")))
        for info in store.artifacts_for_agent(agent.id):
            tools.body.addWidget(artifact_link(info, window.artifact_open_requested.emit))
        root.addWidget(tools)

        steer = Card("Steer agent")
        prompt = QPlainTextEdit()
        prompt.setPlaceholderText("Add context or redirect this agent…")
        prompt.setFixedHeight(70)
        steer.body.addWidget(prompt)
        actions = QHBoxLayout()
        actions.addStretch(1)
        send = make_button("Send steer", "primary")

        def emit_steer() -> None:
            text = prompt.toPlainText().strip()
            if text:
                window.steer_requested.emit(agent.id, text)
                prompt.clear()

        send.clicked.connect(emit_steer)
        actions.addWidget(send)
        cancel = make_button("Cancel", "danger")
        cancel.clicked.connect(lambda: window.cancel_requested.emit(agent.id))
        actions.addWidget(cancel)
        steer.body.addLayout(actions)
        root.addWidget(steer)
        root.addStretch(1)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # The dot holds its colour for its own paintEvent, and the name is
        # painted in the persona's hue — neither is reachable by the stylesheet.
        self._dot.set_state(state_color(self._state), pulse=self._live)
        self._name_label.setStyleSheet(
            f"font-size:{theme.type.scale.md}px;"
            f"font-weight:{theme.type.weight_body};"
            f"color:{persona_color(self._persona)};"
        )

    def refresh_transcript(self) -> None:
        events = filter_transcript_for_agent(self._store.transcript, self.agent_id)
        self.transcript_scroll.setVisible(bool(events))
        self.transcript_empty.setVisible(not events)
        # The view keeps the reader's place itself, anchored on the row rather
        # than on a pixel offset that rows above can invalidate (SWR-2452).
        self.transcript_scroll.set_events(events)


def _muted(text: str) -> QLabel:
    # Named rather than styled: the application stylesheet already owns what
    # "muted" looks like, and a copy of it here would be a second answer to the
    # same question the day the token moves.
    label = QLabel(text)
    label.setWordWrap(True)
    label.setObjectName("muted")
    return label


def _value_label(text: str) -> QLabel:
    label = QLabel(text)
    label.setWordWrap(True)
    label.setObjectName("mono")
    return label
