"""Confirmation modal for rolling a working tree back to a checkpoint (SWR-2437).

A restore overwrites files the user can see, so this dialog is the last thing
between them and that. Two invariants make it safe:

* **Every exit path resolves to "do not restore" except the one button that
  says so.** ``done`` is the single funnel Qt routes ``accept``, ``reject``,
  Escape and the window close box through, so refusing there covers all of
  them — a security-shaped dialog dismissed without a choice is not consent.
* **The preview text is the engine's own.** ``format_preview_lines`` already
  labels each path with what the restore *does* to it, which is the inverse of
  the checkpoint-relative status letter Git reports. Nothing here re-derives
  that verb; a dialog that inverted it a second time would promise the exact
  opposite of what happens.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, override

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens

if TYPE_CHECKING:
    from PySide6.QtWidgets import QWidget

    from rotaris.models.state import CheckpointPreview


@traces(SWR.SWR_2437)
class CheckpointRestoreDialog(QDialog):
    """Shows one checkpoint's diff summary and asks for an explicit go-ahead.

    Args:
        preview: What the restore would change, already phrased as actions.
        tree_root: The working tree that would be rewritten, named so the user
            can tell an isolated session's worktree from their own checkout.
        parent: Qt parent.
    """

    #: ``True`` only when the user pressed the restore button; emitted exactly
    #: once, on whichever exit path the dialog actually took.
    decided = Signal(bool)

    def __init__(
        self,
        preview: CheckpointPreview,
        *,
        tree_root: str = "",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._preview = preview
        self._decided = False
        self._confirmed = False

        title = f"Restore checkpoint {preview.sequence}?"
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumSize(560, 400)
        self.setAccessibleName(title)
        self.setAccessibleDescription(
            "Replaces the working tree with the files recorded in this checkpoint. "
            "A safety checkpoint of the current state is taken first."
        )

        space = tokens().space
        layout = QVBoxLayout(self)
        layout.setContentsMargins(space.xl, space[2.5], space.xl, space[2.5])
        layout.setSpacing(space.md)

        heading = QLabel(title)
        heading.setObjectName("heading")
        layout.addWidget(heading)

        summary = QLabel(self._summary_text(tree_root))
        summary.setWordWrap(True)
        summary.setAccessibleName("Restore summary")
        layout.addWidget(summary)

        self.preview_text = QPlainTextEdit("\n".join(preview.lines))
        # A path list only lines up when every glyph is the same width, so the
        # mono face is part of what makes the preview readable, not decoration.
        self.preview_text.setProperty("mono", "true")
        self.preview_text.setReadOnly(True)
        self.preview_text.setAccessibleName("Checkpoint restore preview")
        self.preview_text.setAccessibleDescription(
            "Each path is labelled with what the restore does to it: delete, "
            "recreate, overwrite or rename."
        )
        layout.addWidget(self.preview_text, 1)

        self.force_check: QCheckBox | None = None
        if preview.needs_force:
            warning = QLabel(preview.blocked_reason)
            warning.setWordWrap(True)
            warning.setObjectName("muted")
            warning.setAccessibleName("Uncommitted changes warning")
            layout.addWidget(warning)
            count = len(preview.dirty_paths)
            noun = "change" if count == 1 else "changes"
            self.force_check = QCheckBox(f"Overwrite {count} uncommitted {noun}")
            self.force_check.setAccessibleName("Overwrite uncommitted changes")
            self.force_check.setAccessibleDescription(
                "Required because this restore would replace work that no checkpoint "
                "holds a copy of."
            )
            self.force_check.toggled.connect(self._sync_confirm_button)
            layout.addWidget(self.force_check)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        self.confirm_button = QPushButton(f"Restore checkpoint {preview.sequence}")
        self.confirm_button.setProperty("variant", "danger")
        self.confirm_button.setAccessibleName(f"Restore checkpoint {preview.sequence}")
        self.confirm_button.setAccessibleDescription(
            "Overwrites the working tree with this checkpoint's files."
        )
        buttons.addButton(self.confirm_button, QDialogButtonBox.ButtonRole.DestructiveRole)
        self.confirm_button.clicked.connect(self._confirm)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        cancel = buttons.button(QDialogButtonBox.StandardButton.Cancel)
        cancel.setAccessibleName("Cancel restore")
        cancel.setAccessibleDescription("Leaves the working tree untouched.")
        cancel.setDefault(True)
        cancel.setFocus()
        self._sync_confirm_button()

    @property
    def confirmed(self) -> bool:
        """Whether the user actually asked for the restore."""
        return self._confirmed

    @property
    def force(self) -> bool:
        """Whether the user opted into overwriting uncommitted changes."""
        return self.force_check is not None and self.force_check.isChecked()

    @override
    def done(self, result: int) -> None:
        # The main funnel: accept(), reject() and Escape all arrive here, so
        # refusing by default here covers every one of them.
        self._resolve(result == QDialog.DialogCode.Accepted)
        super().done(result)

    @override
    def closeEvent(self, event) -> None:  # type: ignore[no-untyped-def]  # noqa: N802
        # A dialog closed before it was ever shown does not reach ``done``, so
        # the refusal is settled here too. Dismissing a destructive confirmation
        # is never consent.
        self._resolve(False)
        super().closeEvent(event)

    def _resolve(self, confirmed: bool) -> None:
        """Record the decision exactly once, on whichever path got here first."""
        if self._decided:
            return
        self._decided = True
        self._confirmed = confirmed
        self.decided.emit(confirmed)

    def _confirm(self) -> None:
        self.accept()

    def _sync_confirm_button(self) -> None:
        from rotaris.widgets.cards import set_action_availability

        needs_force = self.force_check is not None
        allowed = not needs_force or self.force_check is not None and self.force_check.isChecked()
        set_action_availability(
            self.confirm_button,
            enabled=allowed,
            reason=(
                ""
                if allowed
                else "Confirm that the uncommitted changes above may be overwritten first."
            ),
        )

    def _summary_text(self, tree_root: str) -> str:
        preview = self._preview
        where = f" in {tree_root}" if tree_root else ""
        files = "nothing" if preview.changed_count == 0 else f"{preview.changed_count} file(s)"
        return (
            f"This replaces {files}{where} with the state recorded in checkpoint "
            f"{preview.sequence}. Rotaris records a safety checkpoint of the current "
            f"tree first, so the rollback can itself be rolled back. Your branch "
            f"history is not rewritten."
        )
