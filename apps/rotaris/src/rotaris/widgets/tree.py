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
from rotaris.widgets.reflow import PANEL_REFLOW_MS, HiddenPanelReflow

if TYPE_CHECKING:
    from PySide6.QtGui import QMouseEvent

    from rotaris.models.state import AgentNode
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2003, SWR.SWR_2122)
class AgentTreeList(Themed, QWidget):
    """Renders WorkspaceStore.agent_tree() as clickable mono-prefixed rows.

    Reconciled rather than rebuilt (SWR-2454). Three of these exist at once —
    the workspace sidebar, the dashboard and the mission view all hold one, and
    all three live from startup — while a run changes an agent's elapsed time,
    context use and tool count continuously. Building a row costs roughly 3 ms
    and updating one costs roughly 0.02 ms, so a refresh that tore the list down
    and built it again spent the Qt thread's whole budget redrawing rows whose
    text had not changed, twice over for panels nobody was looking at.
    """

    agent_selected = Signal(str)

    def __init__(
        self, store: WorkspaceStore, *, show_meta: bool = True, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self._store = store
        self._show_meta = show_meta
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(0, 0, 0, 0)
        #: Live rows by agent id, so a refresh can update what it already has.
        self._rows: dict[str, _AgentRow] = {}
        self._reflow = HiddenPanelReflow(self, PANEL_REFLOW_MS, self.refresh)
        store.agents_changed.connect(self._reflow.request)
        store.selection_changed.connect(lambda _agent_id: self._reflow.request())
        # Also builds the rows for the first time, through `apply_theme`.
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild every row against *theme*.

        A row carries its type scale and its text colours in an inline
        stylesheet — the alternative would be an objectName per size — so the
        only way it follows a theme is to be built again. Discarding the rows
        first is what makes the refresh below build rather than update them; a
        theme change is rare enough to pay for.
        """
        self._layout.setSpacing(theme.space[0.25])
        self._discard_rows()
        self.refresh()

    def refresh(self) -> None:
        """Bring the list in line with the store, touching only what moved."""
        seen: set[str] = set()
        for position, (agent, prefix, _depth) in enumerate(self._store.agent_tree()):
            seen.add(agent.id)
            row = self._rows.get(agent.id)
            if row is None:
                row = _AgentRow(agent.id, show_meta=self._show_meta)
                row.clicked.connect(self._on_row_clicked)
                self._rows[agent.id] = row
            row.apply(agent, prefix, selected=agent.id == self._store.selected_agent_id)
            item = self._layout.itemAt(position)
            if item is None or item.widget() is not row:
                # Removed first: re-inserting a widget the layout already holds
                # would otherwise leave it listed at both positions.
                self._layout.removeWidget(row)
                self._layout.insertWidget(position, row)
        for agent_id in [known for known in self._rows if known not in seen]:
            self._dispose(self._rows.pop(agent_id))

    def _discard_rows(self) -> None:
        for row in self._rows.values():
            self._dispose(row)
        self._rows.clear()

    def _dispose(self, row: _AgentRow) -> None:
        """Take a row off screen *now*, and out of memory when the loop gets to it.

        Hidden and unparented before the deletion is posted: a widget taken out
        of a layout keeps its geometry and keeps painting until the event loop
        destroys it, so a loop behind on work leaves it on screen underneath
        whatever replaced it (SWR-2454).
        """
        self._layout.removeWidget(row)
        row.hide()
        row.setParent(None)
        row.deleteLater()

    def _on_row_clicked(self, agent_id: str) -> None:
        self._store.select_agent(agent_id)
        self.agent_selected.emit(agent_id)


class _AgentRow(QWidget):
    """One agent's row, built once and updated in place afterwards."""

    clicked = Signal(str)

    def __init__(
        self, agent_id: str, *, show_meta: bool = True, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self._agent_id = agent_id
        self._show_meta = show_meta
        self.setObjectName("agentTreeRow")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        t = tokens()
        layout = QHBoxLayout(self)
        layout.setContentsMargins(t.space.xs, t.space[0.25], t.space.xs, t.space[0.25])
        layout.setSpacing(t.space.sm)

        self._branch = QLabel()
        # The tree's box-drawing prefix only lines up column by column in the
        # mono face, which the stylesheet gives any label carrying this property.
        self._branch.setProperty("mono", "true")
        self._branch.setStyleSheet(f"font-size:{t.type.scale.xs}px;color:{t.color.text_tertiary};")
        self._branch.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        layout.addWidget(self._branch)

        self._dot = StatusDot(size=t.size.status_dot)
        self._dot.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        layout.addWidget(self._dot)

        text = QWidget()
        text_layout = QVBoxLayout(text)
        text_layout.setContentsMargins(0, 0, 0, 0)
        text_layout.setSpacing(0)
        self._kind = QLabel()
        self._kind.setAccessibleName("Agent type")
        self._kind.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        text_layout.addWidget(self._kind)
        self._task = QLabel()
        self._task.setStyleSheet(f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};")
        self._task.setAccessibleName("Agent task")
        self._task.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        text_layout.addWidget(self._task)
        layout.addWidget(text)

        self._meta: QLabel | None = None
        if show_meta:
            self._meta = QLabel()
            self._meta.setStyleSheet(
                f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};"
            )
            self._meta.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
            layout.addWidget(self._meta)
        layout.addStretch(1)

        #: Last values written, so an update that changes nothing costs a
        #: comparison. The two that carry a colour are held separately because
        #: re-applying a stylesheet forces Qt to resolve the widget against the
        #: whole application cascade again, which is the expensive part.
        self._live: bool | None = None
        self._selected: bool | None = None

    def apply(self, agent: AgentNode, prefix: str, *, selected: bool) -> None:
        """Write *agent* onto this row, skipping whatever already reads right."""
        if self._branch.text() != prefix:
            self._branch.setText(prefix)
        self._dot.set_state(theme.state_color(agent.state.value), pulse=agent.is_live)
        kind = theme.persona_display(agent.persona)
        if self._kind.text() != kind:
            self._kind.setText(kind)
        if agent.is_live != self._live:
            self._live = agent.is_live
            t = tokens()
            colour = t.color.text if agent.is_live else t.color.text_secondary
            self._kind.setStyleSheet(f"font-size:{t.type.scale.sm}px;color:{colour};")
        if self._task.text() != agent.name:
            self._task.setText(agent.name)
        # The sidebar is a fixed 236px, so a long task name elides on the row;
        # the tooltip keeps the full delegation payload reachable.
        tooltip = agent.delegation_task or agent.activity or agent.name
        if self.toolTip() != tooltip:
            self.setToolTip(tooltip)
        if self._meta is not None:
            meta = agent.elapsed or agent.state.value
            if self._meta.text() != meta:
                self._meta.setText(meta)
        if selected != self._selected:
            self._selected = selected
            # The selected row's fill, border and radius are the stylesheet's
            # (`QWidget#agentTreeRow[selected="true"]`); this only states the
            # fact it selects on, and repolishing is what re-reads it.
            self.setProperty("selected", selected)
            self.style().unpolish(self)
            self.style().polish(self)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self._agent_id)
        super().mousePressEvent(event)
