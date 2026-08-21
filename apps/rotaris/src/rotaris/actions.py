"""Central action and shortcut registry for the Rotaris desktop host."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, Qt
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable


@dataclass(frozen=True)
class CommandSpec:
    id: str
    label: str
    shortcut: str
    callback: Callable[[], None]
    #: Words a user might search for that the label does not contain — "shell"
    #: for the terminal, say. Never shown; only matched.
    keywords: str = ""

    def matches(self, query: str) -> bool:
        """True when *query* (already case-folded) hits this command."""
        if not query:
            return True
        return query in f"{self.label} {self.keywords} {self.id}".casefold()


@traces(SWR.SWR_2030)
class CommandRegistry(QObject):
    """One source of truth for visible actions and keyboard accelerators."""

    def __init__(self, host: QWidget) -> None:
        super().__init__(host)
        self._host = host
        self._commands: dict[str, CommandSpec] = {}
        self._shortcuts: list[QShortcut] = []

    def register(
        self,
        action_id: str,
        label: str,
        shortcut: str,
        callback: Callable[[], None],
        keywords: str = "",
    ) -> None:
        command = CommandSpec(action_id, label, shortcut, callback, keywords)
        self._commands[action_id] = command
        if shortcut:
            key = QShortcut(QKeySequence(shortcut), self._host)
            key.setContext(Qt.ShortcutContext.WindowShortcut)
            key.activated.connect(callback)
            self._shortcuts.append(key)

    def commands(self) -> list[CommandSpec]:
        return list(self._commands.values())

    def trigger(self, action_id: str) -> None:
        command = self._commands.get(action_id)
        if command is not None:
            command.callback()


class CommandPaletteDialog(QDialog):
    """Searchable mouse-and-keyboard action launcher."""

    def __init__(self, registry: CommandRegistry, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._registry = registry
        self.setWindowTitle("Rotaris commands")
        self.setModal(True)
        self.resize(520, 420)
        self.setAccessibleName("Rotaris command palette")
        layout = QVBoxLayout(self)
        title = QLabel("Commands")
        title.setStyleSheet("font-size:17px;font-weight:600;")
        layout.addWidget(title)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Type an action…")
        self.search.setAccessibleName("Filter commands")
        self.search.textChanged.connect(self._refresh)
        self.search.returnPressed.connect(self._activate_current)
        layout.addWidget(self.search)
        self.list = QListWidget()
        self.list.setAccessibleName("Available commands")
        self.list.itemActivated.connect(self._activate)
        self.list.itemDoubleClicked.connect(self._activate)
        layout.addWidget(self.list, 1)
        self._refresh()
        self.search.setFocus()

    def _refresh(self) -> None:
        query = self.search.text().casefold().strip()
        self.list.clear()
        for command in self._registry.commands():
            if not command.matches(query):
                continue
            suffix = f"    {command.shortcut}" if command.shortcut else ""
            item = QListWidgetItem(f"{command.label}{suffix}")
            item.setData(Qt.ItemDataRole.UserRole, command.id)
            self.list.addItem(item)
        if self.list.count():
            self.list.setCurrentRow(0)

    def _activate(self, item: QListWidgetItem) -> None:
        action_id = str(item.data(Qt.ItemDataRole.UserRole))
        self.accept()
        self._registry.trigger(action_id)

    def _activate_current(self) -> None:
        item = self.list.currentItem()
        if item is not None:
            self._activate(item)
