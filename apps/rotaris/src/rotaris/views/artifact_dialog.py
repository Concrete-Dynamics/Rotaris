"""Modeless artifact inspector/editor dialog (mirrors the TUI artifact editor).

Editing is intentionally scoped to ``body_markdown`` — structured metadata
(slug, title, tags, source ids) stays immutable, same as the TUI.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPlainTextEdit,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.markdown import MarkdownBrowser
from rotaris.theme.manager import Themed
from rotaris.widgets import make_button

if TYPE_CHECKING:
    from PySide6.QtGui import QCloseEvent

    from rotaris.models.state import ArtifactInfo
    from rotaris.services.config_service import ConfigService
    from rotaris.theme.spec import Theme


@traces(SWR.SWR_2018)
class ArtifactDialog(Themed, QDialog):
    """Inspect and edit one session artifact's Markdown body."""

    def __init__(
        self,
        config_service: ConfigService,
        info: ArtifactInfo,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._service = config_service
        self.artifact_id = info.id
        self._saved_text = ""
        self.setWindowTitle(f"Artifact · {info.slug}")
        self.resize(720, 560)
        self.setModal(False)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(10)

        title = QLabel(info.title)
        title.setObjectName("heading")
        layout.addWidget(title)
        self._meta = QLabel(
            f"{info.id} · {info.kind} · {info.status}"
            + (f" · by {info.producer or info.persona}" if info.producer or info.persona else "")
            + (" · edited" if info.edited else "")
        )
        layout.addWidget(self._meta)

        self.tabs = QTabWidget()
        self.editor = QPlainTextEdit()
        self.preview = MarkdownBrowser()
        self.tabs.addTab(self.preview, "Preview")
        self.tabs.addTab(self.editor, "Markdown")
        layout.addWidget(self.tabs, 1)
        self.editor.textChanged.connect(self._refresh_preview)

        footer = QHBoxLayout()
        self.status_label = QLabel("")
        self.status_label.setObjectName("muted")
        footer.addWidget(self.status_label)
        footer.addStretch(1)
        self.save_button = make_button("Save", "primary")
        self.save_button.clicked.connect(self.save)
        footer.addWidget(self.save_button)
        close_button = make_button("Close", "ghost")
        close_button.clicked.connect(self.close)
        footer.addWidget(close_button)
        layout.addLayout(footer)

        self._load_body()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self._meta.setStyleSheet(
            f"font-family:{theme.type.mono};"
            f"font-size:{theme.type.scale.x2s}px;"
            f"color:{theme.color.text_secondary};"
        )
        # A real QFont rather than a stylesheet family: Markdown is written
        # against the column it will be read in, and only a font Qt can measure
        # keeps a table or a fenced block lined up while it is being typed.
        self.editor.setFont(theme.type.mono_font(theme.type.scale.sm))

    @property
    def dirty(self) -> bool:
        return self.editor.toPlainText() != self._saved_text

    def _load_body(self) -> None:
        try:
            body = self._service.artifact_body(self.artifact_id)
        except (ValueError, RuntimeError, OSError) as exc:
            body = ""
            self.editor.setReadOnly(True)
            self.save_button.setEnabled(False)
            self.status_label.setText(f"Could not load artifact: {exc}")
        self._saved_text = body
        self.editor.setPlainText(body)

    def _refresh_preview(self) -> None:
        self.preview.set_markdown(self.editor.toPlainText())

    def save(self) -> None:
        text = self.editor.toPlainText()
        try:
            self._service.save_artifact(self.artifact_id, text)
        except (ValueError, RuntimeError, OSError) as exc:
            self.status_label.setText(f"Save failed: {exc}")
            return
        self._saved_text = text
        self.status_label.setText("Saved.")

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802
        if self.dirty:
            answer = QMessageBox.question(
                self,
                "Discard changes?",
                "This artifact has unsaved edits. Discard them?",
                QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer != QMessageBox.StandardButton.Discard:
                event.ignore()
                return
        super().closeEvent(event)
