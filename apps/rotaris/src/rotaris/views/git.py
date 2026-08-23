"""Git-first workspace view: worktrees, branch state, and commit history."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QHBoxLayout,
    QLabel,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.manager import Themed
from rotaris.theme.phosphor import set_button_icon
from rotaris.widgets import (
    PANEL_REFLOW_MS,
    Card,
    HiddenPanelReflow,
    PanelSplitter,
    Select,
    Tag,
    make_button,
    set_action_availability,
)

if TYPE_CHECKING:
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme

#: How narrow either Git column may get before its table stops being a table.
_COLUMN_MIN_WIDTH = 280


@traces(SWR.SWR_2005, SWR.SWR_2405, SWR.SWR_2413, SWR.SWR_2437)
class GitView(Themed, QWidget):
    refresh_requested = Signal()
    create_worktree_requested = Signal()
    merge_worktrees_requested = Signal(list)
    delete_worktree_requested = Signal(str)
    #: session id whose checkpoint listing the user wants to see (SWR-2437)
    checkpoints_requested = Signal(str)
    #: session id, checkpoint sequence — the user asked to roll the tree back
    checkpoint_restore_requested = Signal(str, int)

    def __init__(self, store: WorkspaceStore, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._store = store
        root = QVBoxLayout(self)
        root.setContentsMargins(26, 22, 26, 22)
        root.setSpacing(14)

        header = QHBoxLayout()
        title = QLabel("Git workspace")
        title.setObjectName("pageTitle")
        header.addWidget(title)
        self.branch_tag = Tag("", "outline")
        header.addWidget(self.branch_tag)
        self.sync_label = QLabel()
        header.addWidget(self.sync_label)
        header.addStretch(1)
        self.refresh_button = make_button("Refresh", "secondary")
        self.refresh_button.setAccessibleName("Refresh Git workspace")
        self.refresh_button.clicked.connect(self._request_refresh)
        header.addWidget(self.refresh_button)
        self.create_button = make_button("New worktree", "primary")
        set_button_icon(self.create_button, "git-fork")
        self.create_button.setAccessibleName("Create Git worktree")
        self.create_button.clicked.connect(self.create_worktree_requested.emit)
        header.addWidget(self.create_button)
        self.merge_button = make_button("Merge selected", "secondary")
        self.merge_button.setAccessibleName("Merge selected completed worktrees")
        self.merge_button.setToolTip(
            "Select one or more completed isolated sessions to merge them into base."
        )
        self.merge_button.setEnabled(False)
        self.merge_button.clicked.connect(self._merge_selected)
        header.addWidget(self.merge_button)
        root.addLayout(header)

        # SWR-3011: a worktree table and a commit table each want the width, and
        # which one wins depends on what the user is doing.
        columns = PanelSplitter(
            "git.columns",
            Qt.Orientation.Horizontal,
            defaults=(0, 0),
        )
        self.columns = columns
        worktrees = Card("Worktrees", accented=True)
        self.worktree_table = QTreeWidget()
        self.worktree_table.setAccessibleName("Worktrees")
        self.worktree_table.setHeaderLabels(
            ["Branch", "Session", "State", "Ahead", "Files", "Actions"]
        )
        self.worktree_table.setRootIsDecorated(False)
        self.worktree_table.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self.worktree_table.itemSelectionChanged.connect(self._sync_merge_button)
        worktrees.body.addWidget(self.worktree_table)
        self.worktrees_empty = QLabel("No Git worktrees found for this workspace.")
        self.worktrees_empty.setObjectName("muted")
        worktrees.body.addWidget(self.worktrees_empty)
        worktrees.setMinimumWidth(_COLUMN_MIN_WIDTH)
        columns.addWidget(worktrees)
        columns.setStretchFactor(0, 1)

        history = Card("Commit history", accented=True)
        self.commit_table = QTreeWidget()
        self.commit_table.setAccessibleName("Commit history")
        self.commit_table.setHeaderLabels(["Commit", "Message", "Author", "Age"])
        self.commit_table.setRootIsDecorated(False)
        history.body.addWidget(self.commit_table)
        self.commits_empty = QLabel("No commit history is available.")
        self.commits_empty.setObjectName("muted")
        history.body.addWidget(self.commits_empty)
        history.setMinimumWidth(_COLUMN_MIN_WIDTH)
        columns.addWidget(history)
        columns.setStretchFactor(1, 2)
        columns.name_handles(["Resize the worktrees and commit history columns"])
        root.addWidget(columns, 1)

        root.addWidget(self._build_checkpoints_card())

        policy = Card("Agent commit policy")
        self.policy_label = QLabel()
        self.policy_label.setWordWrap(True)
        self.policy_label.setObjectName("muted")
        policy.body.addWidget(self.policy_label)
        root.addWidget(policy)

        # Through reflows, not straight to the rebuilds (SWR-2454). Each of the
        # three clears a table and builds its rows again, and all three are
        # driven by signals a run raises while it edits files and takes
        # checkpoints — on a tab that is usually not the one on screen.
        self._status_reflow = HiddenPanelReflow(self, PANEL_REFLOW_MS, self.refresh)
        self._sessions_reflow = HiddenPanelReflow(
            self, PANEL_REFLOW_MS, self._refresh_checkpoint_sessions
        )
        self._checkpoints_reflow = HiddenPanelReflow(
            self, PANEL_REFLOW_MS, self.refresh_checkpoints
        )
        store.git_changed.connect(self._status_reflow.request)
        store.sessions_changed.connect(self._sessions_reflow.request)
        store.checkpoints_changed.connect(lambda _payload: self._checkpoints_reflow.request())
        self.refresh()
        self._refresh_checkpoint_sessions()
        self.refresh_checkpoints()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # Mono, because "ahead 3 behind 11" is two counters that change on their
        # own and a proportional face makes the header shuffle sideways every
        # time one of them gains a digit.
        self.sync_label.setStyleSheet(
            f"font-family:{theme.type.mono};"
            f"font-size:{theme.type.scale.xs}px;"
            f"color:{theme.color.text_secondary};"
        )

    @traces(SWR.SWR_2437)
    def _build_checkpoints_card(self) -> Card:
        """The per-session undo listing SWR-2437 puts next to worktree state.

        It lives in the Git view because that is where a user already reasons
        about the tree: worktrees, branch state and "put the files back the way
        they were" are one mental model, and a checkpoint is a Git object.
        """
        card = Card("Session checkpoints", accented=True)

        self.checkpoint_session_combo = Select()
        self.checkpoint_session_combo.setAccessibleName("Checkpoint session")
        self.checkpoint_session_combo.setAccessibleDescription(
            "Which session's recorded checkpoints are listed below"
        )
        self.checkpoint_session_combo.setMinimumWidth(220)
        self.checkpoint_session_combo.currentIndexChanged.connect(self._checkpoint_session_selected)
        card.add_header_widget(self.checkpoint_session_combo)

        self.restore_checkpoint_button = make_button("Restore checkpoint", "secondary")
        self.restore_checkpoint_button.setAccessibleName("Restore selected checkpoint")
        self.restore_checkpoint_button.clicked.connect(self._request_restore)
        card.add_header_widget(self.restore_checkpoint_button)

        self.checkpoint_table = QTreeWidget()
        self.checkpoint_table.setAccessibleName("Session checkpoints")
        self.checkpoint_table.setAccessibleDescription(
            "Recorded undo points for the selected session, oldest first"
        )
        self.checkpoint_table.setHeaderLabels(
            ["Checkpoint", "Created", "Iteration", "Files changed", "Kind"]
        )
        self.checkpoint_table.setRootIsDecorated(False)
        self.checkpoint_table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.checkpoint_table.itemSelectionChanged.connect(self._sync_restore_button)
        card.body.addWidget(self.checkpoint_table)

        self.checkpoints_empty = QLabel("No checkpoints are recorded for this session.")
        self.checkpoints_empty.setObjectName("muted")
        self.checkpoints_empty.setWordWrap(True)
        self.checkpoints_empty.setAccessibleName("Checkpoint list status")
        card.body.addWidget(self.checkpoints_empty)
        return card

    @property
    def selected_checkpoint_session(self) -> str:
        """The session whose checkpoints are on screen ('' when none)."""
        return str(self.checkpoint_session_combo.currentData() or "")

    @property
    def selected_checkpoint_sequence(self) -> int:
        """The highlighted checkpoint's sequence (0 when nothing is selected)."""
        items = self.checkpoint_table.selectedItems()
        if not items:
            return 0
        return int(items[0].data(0, Qt.ItemDataRole.UserRole) or 0)

    @traces(SWR.SWR_2437)
    def _refresh_checkpoint_sessions(self) -> None:
        """Rebuild the session picker, keeping the user's choice where possible."""
        combo = self.checkpoint_session_combo
        previous = self.selected_checkpoint_session
        entries = [
            (session.id, f"{session.id} · {session.branch}" if session.branch else session.id)
            for session in self._store.sessions
        ]
        blocked = combo.blockSignals(True)
        combo.clear()
        for session_id, label in entries:
            combo.addItem(label, session_id)
        target = previous or self._store.focused_session_id
        index = combo.findData(target)
        if index < 0:
            index = 0 if combo.count() else -1
        combo.setCurrentIndex(index)
        combo.blockSignals(blocked)
        combo.setEnabled(combo.count() > 0)
        chosen = self.selected_checkpoint_session
        if chosen and chosen != previous:
            self.checkpoints_requested.emit(chosen)
        elif not chosen:
            # No session left to offer: drop the previous session's rows rather
            # than leaving them under a heading that no longer names them.
            self.refresh_checkpoints()

    def _checkpoint_session_selected(self, _index: int) -> None:
        session_id = self.selected_checkpoint_session
        if session_id:
            self.checkpoints_requested.emit(session_id)

    @traces(SWR.SWR_2437)
    def refresh_checkpoints(self) -> None:
        """Render the store's checkpoint listing for the selected session."""
        listing = self._store.checkpoints
        table = self.checkpoint_table
        table.clear()
        session_id = self.selected_checkpoint_session
        # A listing for another session — or a listing left over after the last
        # session disappeared — must not be shown under this one's heading.
        stale = listing.session_id != session_id
        rows = () if stale else listing.rows
        for row in rows:
            item = QTreeWidgetItem(
                [
                    str(row.sequence),
                    row.created_label,
                    str(row.iteration),
                    str(row.file_count),
                    row.kind,
                ]
            )
            item.setData(0, Qt.ItemDataRole.UserRole, row.sequence)
            table.addTopLevelItem(item)
        for column in range(table.columnCount()):
            table.resizeColumnToContents(column)
        self.checkpoints_empty.setText(self._checkpoint_status_text(stale))
        self.checkpoints_empty.setVisible(table.topLevelItemCount() == 0)
        self._sync_restore_button()

    def _checkpoint_status_text(self, stale: bool) -> str:
        listing = self._store.checkpoints
        if not self.selected_checkpoint_session:
            return "Start or open a session to see the checkpoints recorded for it."
        if listing.loading or stale:
            return "Reading this session's checkpoints…"
        if not listing.available and listing.unavailable_reason:
            return listing.unavailable_reason
        return (
            "No checkpoints are recorded for this session. Rotaris records one after "
            "each iteration of a worktree-isolated run."
        )

    def _sync_restore_button(self) -> None:
        listing = self._store.checkpoints
        session_id = self.selected_checkpoint_session
        sequence = self.selected_checkpoint_sequence
        if not session_id:
            reason = "Select a session to restore one of its checkpoints."
        elif listing.loading:
            reason = "Rotaris is still reading this session's checkpoints."
        elif not listing.available:
            reason = listing.unavailable_reason or (
                "This session's checkpoints cannot be restored."
            )
        elif not sequence:
            reason = "Select a checkpoint in the list to restore it."
        else:
            reason = ""
        set_action_availability(
            self.restore_checkpoint_button,
            enabled=not reason,
            reason=reason,
        )

    def _request_restore(self) -> None:
        session_id = self.selected_checkpoint_session
        sequence = self.selected_checkpoint_sequence
        if session_id and sequence:
            self.checkpoint_restore_requested.emit(session_id, sequence)

    def refresh(self) -> None:
        s = self._store
        self.refresh_button.setEnabled(True)
        self.refresh_button.setText("Refresh")
        self.branch_tag.setText(s.branch or "not a git repository")
        self.sync_label.setText(f"ahead {s.ahead}  behind {s.behind}")
        self.policy_label.setText(s.commit_policy)
        for row in range(self.worktree_table.topLevelItemCount()):
            item = self.worktree_table.topLevelItem(row)
            for column in range(self.worktree_table.columnCount()):
                widget = self.worktree_table.itemWidget(item, column)
                if widget is not None:
                    self.worktree_table.removeItemWidget(item, column)
                    widget.hide()
                    widget.setParent(None)
                    widget.deleteLater()
        self.worktree_table.clear()
        for tree in s.worktrees:
            item = QTreeWidgetItem(
                [
                    tree.branch,
                    tree.session or "-",
                    tree.session_status,
                    str(tree.ahead),
                    f"+{tree.additions} -{tree.deletions} / {tree.files_touched}",
                ]
            )
            item.setData(0, Qt.ItemDataRole.UserRole, tree.path)
            item.setData(1, Qt.ItemDataRole.UserRole, tree.session)
            item.setData(2, Qt.ItemDataRole.UserRole, tree.session_status)
            item.setData(3, Qt.ItemDataRole.UserRole, tree.merge_status)
            self.worktree_table.addTopLevelItem(item)
            if not tree.is_base and not tree.active:
                delete_btn = make_button("", "danger")
                # The design system's icon, not a ✕ character left to
                # font-fallback (SWR-3708). The name stays on the accessible
                # side, where it always was.
                set_button_icon(delete_btn, "x-circle")
                delete_btn.setMinimumWidth(28)
                delete_btn.setMinimumHeight(24)
                delete_btn.setAccessibleName(f"Delete worktree {tree.branch}")
                delete_btn.setToolTip("Delete this worktree")
                delete_btn.clicked.connect(
                    lambda checked=False, p=tree.path: self.delete_worktree_requested.emit(p)
                )
                self.worktree_table.setItemWidget(item, 5, delete_btn)
                delete_btn.show()
        self.commit_table.clear()
        for commit in s.commits:
            item = QTreeWidgetItem([commit.hash, commit.message, commit.author, commit.time_label])
            if commit.local:
                item.setForeground(0, self.palette().brush(self.foregroundRole()))
            self.commit_table.addTopLevelItem(item)
        self.worktrees_empty.setVisible(self.worktree_table.topLevelItemCount() == 0)
        self.commits_empty.setVisible(self.commit_table.topLevelItemCount() == 0)
        self.create_button.setEnabled(bool(s.branch))
        self.create_button.setToolTip(
            "" if s.branch else "Open a Git repository before creating a worktree."
        )
        for table in (self.worktree_table, self.commit_table):
            for column in range(table.columnCount()):
                table.resizeColumnToContents(column)
        self._focus(getattr(s, "git_focus", ""))
        self._sync_merge_button()

    @traces(SWR.SWR_3612)
    def _focus(self, target: str) -> None:
        """Select the worktree or commit a requirement surface asked for.

        SWR-3612 sends a requirement's branch, worktree and commit *here* rather
        than rebuilding any of them beside the board, which only works if this
        view actually lands on the row that was asked for. A target that matches
        nothing selects nothing: the run's branch may already be merged away, and
        moving the selection to an unrelated row would be worse than leaving it.

        Matched by prefix on the commit column because the history shows short
        hashes and a run records the full one.
        """
        if not target:
            return
        for row in range(self.worktree_table.topLevelItemCount()):
            item = self.worktree_table.topLevelItem(row)
            if item.text(0) == target:
                self.worktree_table.setCurrentItem(item)
                self.worktree_table.scrollToItem(item)
                return
        for row in range(self.commit_table.topLevelItemCount()):
            item = self.commit_table.topLevelItem(row)
            short = item.text(0)
            if short and (target.startswith(short) or short.startswith(target)):
                self.commit_table.setCurrentItem(item)
                self.commit_table.scrollToItem(item)
                return

    def _eligible_selected_items(self) -> list[QTreeWidgetItem]:
        eligible = [
            item
            for item in self.worktree_table.selectedItems()
            if str(item.data(1, Qt.ItemDataRole.UserRole) or "")
            and str(item.data(2, Qt.ItemDataRole.UserRole) or "") == "completed"
            and str(item.data(3, Qt.ItemDataRole.UserRole) or "ready") in {"ready", "merge_failed"}
        ]
        # Selection order is not user-visible; row order is what the user sees
        # and what the merge-order dialog starts from.
        return sorted(eligible, key=self.worktree_table.indexOfTopLevelItem)

    def _sync_merge_button(self) -> None:
        eligible = self._eligible_selected_items()
        self.merge_button.setEnabled(bool(eligible))
        self.merge_button.setToolTip(
            "Merge selected completed worktrees into base."
            if eligible
            else "Select one or more completed isolated session worktrees to merge."
        )

    def _merge_selected(self) -> None:
        session_ids = [
            str(item.data(1, Qt.ItemDataRole.UserRole)) for item in self._eligible_selected_items()
        ]
        if session_ids:
            self.merge_worktrees_requested.emit(session_ids)

    def _request_refresh(self) -> None:
        self.refresh_button.setEnabled(False)
        self.refresh_button.setText("Refreshing…")
        self.sync_label.setText("Refreshing repository state…")
        self.refresh_requested.emit()
