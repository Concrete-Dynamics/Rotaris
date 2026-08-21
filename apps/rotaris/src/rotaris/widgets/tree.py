"""Compact agent-tree list used on the dashboard and workspace sidebar."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.meters import StatusDot

if TYPE_CHECKING:
    from PySide6.QtGui import QMouseEvent

    from rotaris.models.state import AgentNode
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2003, SWR.SWR_2122)
class AgentTreeList(Themed, QWidget):
    """Renders WorkspaceStore.agent_tree() as clickable mono-prefixed rows."""

    agent_selected = Signal(str)

    def __init__(
        self, store: WorkspaceStore, *, show_meta: bool = True, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self._store = store
        self._show_meta = show_meta
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(0, 0, 0, 0)
        store.agents_changed.connect(self.refresh)
        store.selection_changed.connect(lambda _agent_id: self.refresh())
        # Also builds the rows for the first time, through `apply_theme`.
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild every row against *theme*.

        A row carries its type scale and its text colours in an inline
        stylesheet — the alternative would be an objectName per size — so the
        only way it follows a theme is to be built again.
        """
        self._layout.setSpacing(theme.space[0.25])
        self.refresh()

    def refresh(self) -> None:
        while self._layout.count():
            item = self._layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        for agent, prefix, _depth in self._store.agent_tree():
            self._layout.addWidget(self._make_row(agent, prefix))

    def _make_row(self, agent: AgentNode, prefix: str) -> QWidget:
        t = tokens()
        row = _AgentRow(agent.id)
        row.clicked.connect(self._on_row_clicked)
        layout = QHBoxLayout(row)
        layout.setContentsMargins(t.space.xs, t.space[0.25], t.space.xs, t.space[0.25])
        layout.setSpacing(t.space.sm)

        branch = QLabel(prefix)
        # The tree's box-drawing prefix only lines up column by column in the
        # mono face, which the stylesheet gives any label carrying this property.
        branch.setProperty("mono", "true")
        branch.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{t.color.text_tertiary};")
        branch.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        layout.addWidget(branch)

        dot = StatusDot(size=t.size.status_dot)
        dot.set_state(theme.state_color(agent.state.value), pulse=agent.is_live)
        dot.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        layout.addWidget(dot)

        text = QWidget()
        text_layout = QVBoxLayout(text)
        text_layout.setContentsMargins(0, 0, 0, 0)
        text_layout.setSpacing(0)
        kind = QLabel(theme.persona_display(agent.persona))
        live = agent.is_live
        kind_color = t.color.text if live else t.color.text_secondary
        kind.setStyleSheet(f"font-size:{t.type.scale.sm}px;color:{kind_color};")
        kind.setAccessibleName("Agent type")
        kind.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        text_layout.addWidget(kind)
        task = QLabel(agent.name)
        task.setStyleSheet(f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};")
        task.setAccessibleName("Agent task")
        task.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        text_layout.addWidget(task)
        layout.addWidget(text)
        # The sidebar is a fixed 236px, so a long task name elides on the row;
        # the tooltip keeps the full delegation payload reachable.
        row.setToolTip(agent.delegation_task or agent.activity or agent.name)

        if self._show_meta:
            meta = agent.elapsed or agent.state.value
            meta_label = QLabel(meta)
            meta_label.setStyleSheet(
                f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};"
            )
            meta_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
            layout.addWidget(meta_label)
        layout.addStretch(1)
        # The selected row's fill, border and radius are the stylesheet's
        # (`QWidget#agentTreeRow[selected="true"]`); this only states the fact it
        # selects on.
        row.setProperty("selected", agent.id == self._store.selected_agent_id)
        row.style().unpolish(row)
        row.style().polish(row)
        row.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        return row

    def _on_row_clicked(self, agent_id: str) -> None:
        self._store.select_agent(agent_id)
        self.agent_selected.emit(agent_id)


class _AgentRow(QWidget):
    clicked = Signal(str)

    def __init__(self, agent_id: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._agent_id = agent_id
        self.setObjectName("agentTreeRow")
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self._agent_id)
        super().mousePressEvent(event)
