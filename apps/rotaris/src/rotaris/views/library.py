"""Prompt stash, session artifacts, and improvement proposals."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPlainTextEdit,
    QPushButton,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.manager import Themed
from rotaris.widgets import Card, PanelSplitter, make_button

if TYPE_CHECKING:
    from rotaris.models.state import ImprovementProposal
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme

#: How narrow either prompt column may get before its list stops showing a
#: useful amount of a prompt.
_PROMPT_COLUMN_MIN_WIDTH = 240

_PROPOSAL_STATUS_LABEL = {
    "pending_review": "pending",
    "approved": "approved",
    "rejected": "rejected",
    "deferred": "deferred",
}
_PROPOSAL_ACTIONS = (("Approve", "approved"), ("Reject", "rejected"), ("Defer", "deferred"))


@traces(SWR.SWR_2019, SWR.SWR_2123)
class LibraryView(QWidget):
    prompt_selected = Signal(str)
    artifact_open_requested = Signal(str)  # artifact id
    proposal_action_requested = Signal(str, str, str)  # artifact_id, proposal_id, status
    proposal_edit_requested = Signal(
        str, str, str, str
    )  # artifact_id, proposal_id, summary, action
    proposal_delete_requested = Signal(str, str)  # artifact_id, proposal_id

    _TAB_IDS = ("prompts", "artifacts", "proposals")

    def __init__(
        self,
        store: WorkspaceStore,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._store = store
        root = QVBoxLayout(self)
        root.setContentsMargins(26, 22, 26, 22)
        root.setSpacing(14)
        title = QLabel("Library")
        title.setObjectName("pageTitle")
        root.addWidget(title)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search prompts, artifacts, and proposals…")
        self.search.setAccessibleName("Search Library")
        self.search.textChanged.connect(self.refresh)
        root.addWidget(self.search)

        self.tabs = QTabWidget()
        self.tabs.addTab(self._build_prompts(), "Prompts")
        self.tabs.addTab(self._build_artifacts(), "Artifacts")
        self.tabs.addTab(self._build_proposals(), "Improvement proposals")
        root.addWidget(self.tabs, 1)
        store.library_changed.connect(self.refresh)
        store.artifacts_changed.connect(self._refresh_artifacts)
        store.improvement_proposals_changed.connect(self._refresh_proposals)
        self.refresh()

    def set_active_tab(self, tab_id: str) -> None:
        if tab_id in self._TAB_IDS:
            self.tabs.setCurrentIndex(self._TAB_IDS.index(tab_id))

    def _build_prompts(self) -> QWidget:
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(0, 12, 0, 0)
        # SWR-3011: prompts are long, and which of the two lists deserves the
        # room depends on whether the user is stashing or recalling.
        self.prompt_columns = PanelSplitter(
            "library.prompts",
            Qt.Orientation.Horizontal,
            defaults=(0, 0),
        )
        stash = Card("Prompt stash", accented=True)
        self.stash_list = QListWidget()
        self.stash_list.setAccessibleName("Stashed prompts")
        self.stash_list.itemDoubleClicked.connect(
            lambda item: self.prompt_selected.emit(item.text())
        )
        stash.body.addWidget(self.stash_list)
        self.stash_empty = QLabel("No stashed prompts.")
        self.stash_empty.setObjectName("muted")
        stash.body.addWidget(self.stash_empty)
        use_stash = make_button("Use selected", "primary")
        use_stash.clicked.connect(self._use_stash)
        stash.body.addWidget(use_stash)
        stash.setMinimumWidth(_PROMPT_COLUMN_MIN_WIDTH)
        self.prompt_columns.addWidget(stash)
        history = Card("Prompt history")
        self.history_list = QListWidget()
        self.history_list.setAccessibleName("Prompt history")
        self.history_list.itemDoubleClicked.connect(
            lambda item: self.prompt_selected.emit(item.text())
        )
        history.body.addWidget(self.history_list)
        self.history_empty = QLabel("Prompt history is empty.")
        self.history_empty.setObjectName("muted")
        history.body.addWidget(self.history_empty)
        use_history = make_button("Use selected", "secondary")
        use_history.clicked.connect(self._use_history)
        history.body.addWidget(use_history)
        history.setMinimumWidth(_PROMPT_COLUMN_MIN_WIDTH)
        self.prompt_columns.addWidget(history)
        self.prompt_columns.name_handles(["Resize the prompt stash and history columns"])
        layout.addWidget(self.prompt_columns, 1)
        return page

    def _build_artifacts(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 12, 0, 0)
        card = Card("Session artifacts", accented=True)
        note = QLabel("Everything agents published or reported in the loaded session.")
        note.setObjectName("muted")
        card.body.addWidget(note)
        self.artifact_table = QTreeWidget()
        self.artifact_table.setHeaderLabels(
            ["Title", "Producer", "Persona", "Kind", "Status", "Created"]
        )
        self.artifact_table.setRootIsDecorated(False)
        self.artifact_table.setAccessibleName("Session artifacts")
        self.artifact_table.itemDoubleClicked.connect(
            lambda item, _column: self.artifact_open_requested.emit(
                str(item.data(0, Qt.ItemDataRole.UserRole))
            )
        )
        card.body.addWidget(self.artifact_table)
        self.artifacts_empty = QLabel("No artifacts have been published in this session.")
        self.artifacts_empty.setObjectName("muted")
        card.body.addWidget(self.artifacts_empty)
        open_button = make_button("Inspect / edit selected", "primary")
        open_button.clicked.connect(self._open_selected_artifact)
        card.body.addWidget(open_button)
        layout.addWidget(card, 1)
        return page

    def _build_proposals(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 12, 0, 0)
        card = Card("Improvement proposals", accented=True)
        note = QLabel("Evidence-backed suggestions from the improvement collector after each run.")
        note.setObjectName("muted")
        card.body.addWidget(note)
        self.proposal_table = QTreeWidget()
        self.proposal_table.setHeaderLabels(["Summary", "Category", "Risk", "Status", "Created"])
        self.proposal_table.setRootIsDecorated(False)
        self.proposal_table.setAccessibleName("Improvement proposals")
        self.proposal_table.itemSelectionChanged.connect(self._refresh_proposal_detail)
        self.proposal_table.itemDoubleClicked.connect(
            lambda _item, _column: self._edit_selected_proposal()
        )
        card.body.addWidget(self.proposal_table)
        self.proposals_empty = QLabel(
            "No proposals yet. They appear here after a run's improvement collector finds signals."
        )
        self.proposals_empty.setObjectName("muted")
        card.body.addWidget(self.proposals_empty)
        self.proposal_detail = QLabel("Select a proposal to see its recommended action.")
        self.proposal_detail.setWordWrap(True)
        self.proposal_detail.setObjectName("muted")
        card.body.addWidget(self.proposal_detail)

        actions = QHBoxLayout()
        self.proposal_action_buttons: dict[str, QPushButton] = {}
        for label, status in _PROPOSAL_ACTIONS:
            button = make_button(label, "secondary")
            button.clicked.connect(
                lambda _checked=False, s=status: self._request_proposal_status(s)
            )
            actions.addWidget(button)
            self.proposal_action_buttons[status] = button
        actions.addStretch(1)
        self.proposal_edit_button = make_button("Edit", "secondary")
        self.proposal_edit_button.clicked.connect(self._edit_selected_proposal)
        actions.addWidget(self.proposal_edit_button)
        self.proposal_delete_button = make_button("Delete", "secondary")
        self.proposal_delete_button.clicked.connect(self._delete_selected_proposal)
        actions.addWidget(self.proposal_delete_button)
        card.body.addLayout(actions)

        layout.addWidget(card, 1)
        return page

    def _refresh_artifacts(self) -> None:
        self.artifact_table.clear()
        query = self.search.text().casefold().strip()
        for info in self._store.artifacts:
            haystack = " ".join(
                (info.title, info.producer, info.persona, info.kind, info.status)
            ).casefold()
            if query and query not in haystack:
                continue
            item = QTreeWidgetItem(
                [
                    info.title,
                    info.producer,
                    info.persona,
                    info.kind,
                    info.status + (" · edited" if info.edited else ""),
                    info.created_label,
                ]
            )
            item.setData(0, Qt.ItemDataRole.UserRole, info.id)
            self.artifact_table.addTopLevelItem(item)
        self.artifacts_empty.setVisible(self.artifact_table.topLevelItemCount() == 0)
        for column in range(self.artifact_table.columnCount()):
            self.artifact_table.resizeColumnToContents(column)

    def _open_selected_artifact(self) -> None:
        item = self.artifact_table.currentItem()
        if item is not None:
            self.artifact_open_requested.emit(str(item.data(0, Qt.ItemDataRole.UserRole)))

    def _refresh_proposals(self) -> None:
        previous_item = self.proposal_table.currentItem()
        previous_id = (
            str(previous_item.data(0, Qt.ItemDataRole.UserRole))
            if previous_item is not None
            else None
        )
        self.proposal_table.clear()
        query = self.search.text().casefold().strip()
        selected_item: QTreeWidgetItem | None = None
        for proposal in self._store.improvement_proposals:
            haystack = " ".join(
                (proposal.summary, proposal.category, proposal.status, proposal.recommended_action)
            ).casefold()
            if query and query not in haystack:
                continue
            item = QTreeWidgetItem(
                [
                    proposal.summary,
                    proposal.category.replace("_", " "),
                    proposal.risk,
                    _PROPOSAL_STATUS_LABEL.get(proposal.status, proposal.status),
                    proposal.created_label,
                ]
            )
            item.setData(0, Qt.ItemDataRole.UserRole, proposal.id)
            self.proposal_table.addTopLevelItem(item)
            if proposal.id == previous_id:
                selected_item = item
        self.proposals_empty.setVisible(self.proposal_table.topLevelItemCount() == 0)
        for column in range(self.proposal_table.columnCount()):
            self.proposal_table.resizeColumnToContents(column)
        if selected_item is None and self.proposal_table.topLevelItemCount() > 0:
            selected_item = self.proposal_table.topLevelItem(0)
        if selected_item is not None:
            self.proposal_table.setCurrentItem(selected_item)
        self._refresh_proposal_detail()

    def _selected_proposal(self) -> ImprovementProposal | None:
        item = self.proposal_table.currentItem()
        if item is None:
            return None
        proposal_id = str(item.data(0, Qt.ItemDataRole.UserRole))
        return next((p for p in self._store.improvement_proposals if p.id == proposal_id), None)

    def _refresh_proposal_detail(self) -> None:
        proposal = self._selected_proposal()
        if proposal is None:
            self.proposal_detail.setText("Select a proposal to see its recommended action.")
        else:
            self.proposal_detail.setText(f"Recommended action: {proposal.recommended_action}")
        self.proposal_edit_button.setEnabled(proposal is not None)
        self.proposal_delete_button.setEnabled(proposal is not None)
        for status, button in self.proposal_action_buttons.items():
            button.setEnabled(proposal is not None and proposal.status != status)

    def _request_proposal_status(self, status: str) -> None:
        proposal = self._selected_proposal()
        if proposal is not None:
            self.proposal_action_requested.emit(proposal.artifact_id, proposal.id, status)

    def _edit_selected_proposal(self) -> None:
        proposal = self._selected_proposal()
        if proposal is None:
            return
        dialog = _EditProposalDialog(proposal.summary, proposal.recommended_action, self)
        if dialog.exec():
            self.proposal_edit_requested.emit(
                proposal.artifact_id, proposal.id, dialog.summary, dialog.recommended_action
            )

    def _delete_selected_proposal(self) -> None:
        proposal = self._selected_proposal()
        if proposal is not None:
            self.proposal_delete_requested.emit(proposal.artifact_id, proposal.id)

    def focus_proposal(self, proposal_id: str) -> None:
        """Select and scroll to the row for ``proposal_id``, if present."""
        for index in range(self.proposal_table.topLevelItemCount()):
            item = self.proposal_table.topLevelItem(index)
            if str(item.data(0, Qt.ItemDataRole.UserRole)) == proposal_id:
                self.proposal_table.setCurrentItem(item)
                self.proposal_table.scrollToItem(item)
                return

    def refresh(self) -> None:
        self._refresh_artifacts()
        self._refresh_proposals()
        query = self.search.text().casefold().strip()
        self.stash_list.clear()
        for index, text in enumerate(self._store.prompt_stash):
            if query and query not in text.casefold():
                continue
            item = QListWidgetItem(text)
            item.setData(Qt.ItemDataRole.UserRole, index)
            self.stash_list.addItem(item)
        self.history_list.clear()
        self.history_list.addItems(
            [text for text in self._store.prompt_history if not query or query in text.casefold()]
        )
        self.stash_empty.setVisible(self.stash_list.count() == 0)
        self.history_empty.setVisible(self.history_list.count() == 0)

    def _use_stash(self) -> None:
        item = self.stash_list.currentItem()
        if item is not None:
            index = int(item.data(Qt.ItemDataRole.UserRole))
            text = self._store.pop_stash(index)
            if text:
                self.prompt_selected.emit(text)

    def _use_history(self) -> None:
        item = self.history_list.currentItem()
        if item:
            self.prompt_selected.emit(item.text())


class _EditProposalDialog(Themed, QDialog):
    def __init__(
        self, summary: str, recommended_action: str, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.summary = summary
        self.recommended_action = recommended_action
        self.setWindowTitle("Edit improvement proposal")
        self.setModal(True)
        self.setMinimumWidth(480)
        layout = QVBoxLayout(self)
        form = QFormLayout()
        self.summary_input = QLineEdit(summary)
        self.summary_input.setAccessibleName("Proposal summary")
        form.addRow("Summary", self.summary_input)
        self.action_input = QPlainTextEdit(recommended_action)
        self.action_input.setAccessibleName("Proposal recommended action")
        self.action_input.setFixedHeight(90)
        form.addRow("Recommended action", self.action_input)
        layout.addLayout(form)
        self.validation = QLabel()
        self.validation.setWordWrap(True)
        layout.addWidget(self.validation)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        self.save_button = QPushButton("Save changes")
        self.save_button.setProperty("variant", "primary")
        self.save_button.clicked.connect(self._accept_validated)
        buttons.addButton(self.save_button, QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        self.summary_input.textChanged.connect(self._validate)
        self.action_input.textChanged.connect(self._validate)
        self._validate()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # The text form of the failure colour: this is a sentence the user has
        # to read, not a marker beside one, so it owes the body floor.
        self.validation.setStyleSheet(f"color:{theme.color.fail_text};")

    def _validate(self) -> None:
        error = ""
        if not self.summary_input.text().strip():
            error = "Summary cannot be empty."
        elif not self.action_input.toPlainText().strip():
            error = "Recommended action cannot be empty."
        self.validation.setText(error)
        self.save_button.setEnabled(not error)

    def _accept_validated(self) -> None:
        self.summary = self.summary_input.text().strip()
        self.recommended_action = self.action_input.toPlainText().strip()
        self.accept()
