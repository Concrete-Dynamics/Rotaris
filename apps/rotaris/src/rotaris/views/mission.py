"""Mission control: live delegation graph and agent activity table."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QBrush, QColor
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QSpinBox,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.theme.manager import Themed
from rotaris.theme.phosphor import set_button_icon
from rotaris.widgets import (
    PANEL_REFLOW_MS,
    AgentTreeList,
    Card,
    HiddenPanelReflow,
    PanelSplitter,
    SectionLabel,
    Select,
    make_availability_help,
    make_button,
    set_action_availability,
)

if TYPE_CHECKING:
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme

#: Width of Mission's delegation tree before the user resizes it, and the bounds
#: that keep both it and the activity table usable (SWR-3011).
_TREE_WIDTH = 285
_TREE_MIN_WIDTH = 220
_TREE_MAX_WIDTH = 480
_ACTIVITY_MIN_WIDTH = 420


@traces(SWR.SWR_2003, SWR.SWR_2122)
class MissionView(Themed, QWidget):
    """Operational view for inspecting and controlling delegated agents."""

    open_agent_requested = Signal(str)
    cancel_requested = Signal(str)
    pause_requested = Signal(str)  # agent id — graceful, orchestrator only

    def __init__(self, store: WorkspaceStore, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._store = store
        root = QVBoxLayout(self)
        root.setContentsMargins(26, 22, 26, 22)
        root.setSpacing(14)

        header = QHBoxLayout()
        title = QLabel("Mission control")
        title.setObjectName("pageTitle")
        header.addWidget(title)
        header.addStretch(1)
        header.addWidget(SectionLabel("Strategy"))
        self.strategy = Select()
        self.strategy.setAccessibleName("Delegation strategy")
        self.strategy.addItem("Orchestrator", "orchestrator")
        self.strategy.addItem("Swarm", "swarm")
        self.strategy.addItem("Single agent", "single")
        self.strategy.currentIndexChanged.connect(self._strategy_changed)
        header.addWidget(self.strategy)
        header.addWidget(SectionLabel("Depth"))
        self.depth_spin = QSpinBox()
        self.depth_spin.setRange(1, 12)
        self.depth_spin.valueChanged.connect(self._depth_changed)
        header.addWidget(self.depth_spin)
        header.addWidget(SectionLabel("Fan-out"))
        self.fanout = QSpinBox()
        self.fanout.setRange(1, 64)
        self.fanout.valueChanged.connect(self._fanout_changed)
        header.addWidget(self.fanout)
        root.addLayout(header)

        # SWR-3011: the tree and the activity table share the width on the
        # user's terms — a seven-column table is the thing that most wants more.
        body = PanelSplitter(
            "mission.body",
            Qt.Orientation.Horizontal,
            defaults=(_TREE_WIDTH, 0),
        )
        self.body = body
        graph_card = Card("Delegation tree", accented=True)
        self.count_label = QLabel()
        graph_card.add_header_widget(self.count_label)
        self.agent_tree = AgentTreeList(store)
        self.agent_tree.agent_selected.connect(self._selected)
        graph_card.body.addWidget(self.agent_tree)
        graph_card.body.addStretch(1)
        self.open_button = make_button("Open agent window", "secondary")
        set_button_icon(self.open_button, "arrows-out-simple")
        self.open_button.clicked.connect(self._open_selected)
        graph_card.body.addWidget(self.open_button)
        self.pause_button = make_button("Pause selected", "secondary")
        set_button_icon(self.pause_button, "pause")
        self.pause_button.clicked.connect(self._pause_selected)
        pause_action = QHBoxLayout()
        pause_action.addWidget(self.pause_button)
        self.pause_help = make_availability_help("Pause selected")
        pause_action.addWidget(self.pause_help)
        graph_card.body.addLayout(pause_action)
        self.cancel_button = make_button("Cancel selected", "danger")
        set_button_icon(self.cancel_button, "x-circle")
        self.cancel_button.clicked.connect(self._cancel_selected)
        graph_card.body.addWidget(self.cancel_button)
        graph_card.setMinimumWidth(_TREE_MIN_WIDTH)
        graph_card.setMaximumWidth(_TREE_MAX_WIDTH)
        body.addWidget(graph_card)

        activity_card = Card("Agent activity", accented=True)
        self.table = QTreeWidget()
        self.table.setAccessibleName("Agent activity")
        self.table.setHeaderLabels(
            ["State", "Agent", "Persona", "Model", "Context", "Tools", "Activity"]
        )
        self.table.setRootIsDecorated(False)
        self.table.setAlternatingRowColors(False)
        self.table.setSelectionMode(QTreeWidget.SelectionMode.SingleSelection)
        self.table.itemSelectionChanged.connect(self._table_selected)
        self.table.itemDoubleClicked.connect(
            lambda item, _column: self.open_agent_requested.emit(
                item.data(0, Qt.ItemDataRole.UserRole)
            )
        )
        activity_card.body.addWidget(self.table)
        self.empty_label = QLabel(
            "No agents yet. Start a run from Workspace to populate mission control."
        )
        self.empty_label.setObjectName("muted")
        self.empty_label.setWordWrap(True)
        self.empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        activity_card.body.addWidget(self.empty_label)
        activity_card.setMinimumWidth(_ACTIVITY_MIN_WIDTH)
        body.addWidget(activity_card)
        body.setStretchFactor(1, 1)
        body.name_handles(["Resize the delegation tree and activity table"])
        root.addWidget(body, 1)

        # Through a reflow, not straight to the rebuild (SWR-2454): this view
        # rebuilds its activity table row by row and is alive from startup.
        self._reflow = HiddenPanelReflow(self, PANEL_REFLOW_MS, self.refresh)
        store.agents_changed.connect(self._reflow.request)
        store.selection_changed.connect(lambda _agent_id: self._sync_selection())
        store.settings_changed.connect(self._reflow.request)
        self.refresh()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # Mono at the smallest step: four counters in a card header, and the row
        # must not reflow when "run 9" becomes "run 10".
        self.count_label.setStyleSheet(
            f"font-family:{theme.type.mono};"
            f"font-size:{theme.type.scale.x2s}px;"
            f"color:{theme.color.text_secondary};"
        )
        # A tree item is not a widget, so `repolish` never reaches the brush the
        # state column was painted with. Repaint it from the state word already
        # in the row rather than going back to the store for it.
        for index in range(self.table.topLevelItemCount()):
            item = self.table.topLevelItem(index)
            item.setForeground(0, theme_color(item.text(0)))

    def refresh(self) -> None:
        counts = self._store.state_counts()
        self.count_label.setText(
            f"run {counts['run']}  wait {counts['wait']}  done {counts['done']}  fail {counts['fail']}"
        )
        self.strategy.blockSignals(True)
        index = self.strategy.findData(self._store.delegation.strategy)
        self.strategy.setCurrentIndex(max(0, index))
        self.strategy.blockSignals(False)
        self.depth_spin.blockSignals(True)
        self.depth_spin.setValue(self._store.delegation.depth_cap)
        self.depth_spin.blockSignals(False)
        self.fanout.blockSignals(True)
        self.fanout.setValue(self._store.delegation.fanout_limit)
        self.fanout.blockSignals(False)

        self.table.clear()
        for agent in self._store.agent_list():
            item = QTreeWidgetItem(
                [
                    agent.state.value,
                    agent.name,
                    agent.persona,
                    agent.model,
                    f"{agent.ctx_pct}%",
                    str(agent.tool_calls),
                    agent.activity,
                ]
            )
            item.setData(0, Qt.ItemDataRole.UserRole, agent.id)
            item.setForeground(0, theme_color(agent.state.value))
            self.table.addTopLevelItem(item)
        for column in range(6):
            self.table.resizeColumnToContents(column)
        self.table.setVisible(bool(self._store.agents))
        self.empty_label.setVisible(not self._store.agents)
        self._sync_selection()
        self._refresh_actions()

    def _sync_selection(self) -> None:
        selected_id = self._store.selected_agent_id
        for index in range(self.table.topLevelItemCount()):
            item = self.table.topLevelItem(index)
            item.setSelected(item.data(0, Qt.ItemDataRole.UserRole) == selected_id)
        self._refresh_actions()

    def _refresh_actions(self) -> None:
        agent = self._store.selected_agent
        selectable = agent is not None
        live = agent is not None and agent.state.value in {"running", "waiting", "queued"}
        pausable = (
            agent is not None
            and agent.id == "orchestrator"
            and agent.state.value
            in {
                "running",
                "waiting",
            }
        )
        set_action_availability(
            self.open_button,
            enabled=selectable,
            reason="Select an agent first.",
        )
        set_action_availability(
            self.cancel_button,
            enabled=bool(live),
            reason="Selected agent is not cancellable.",
        )
        set_action_availability(
            self.pause_button,
            enabled=bool(pausable),
            reason="Pause is available from the Workspace Run header.",
            help_button=self.pause_help,
        )

    def _selected(self, agent_id: str) -> None:
        self._store.select_agent(agent_id)

    def _table_selected(self) -> None:
        items = self.table.selectedItems()
        if items:
            self._store.select_agent(items[0].data(0, Qt.ItemDataRole.UserRole))

    def _open_selected(self) -> None:
        if self._store.selected_agent_id:
            self.open_agent_requested.emit(self._store.selected_agent_id)

    def _cancel_selected(self) -> None:
        agent_id = self._store.selected_agent_id
        if agent_id:
            self.cancel_requested.emit(agent_id)

    def _pause_selected(self) -> None:
        agent_id = self._store.selected_agent_id
        if agent_id:
            self.pause_requested.emit(agent_id)

    def _strategy_changed(self) -> None:
        strategy = self.strategy.currentData()
        if strategy:
            self._store.set_strategy(str(strategy))

    def _depth_changed(self, value: int) -> None:
        self._store.delegation.depth_cap = value
        self._store.mark_settings_dirty()

    def _fanout_changed(self, value: int) -> None:
        self._store.delegation.fanout_limit = value
        self._store.mark_settings_dirty()


def theme_color(state: str) -> QBrush:
    return QBrush(QColor(theme.state_color(state)))
