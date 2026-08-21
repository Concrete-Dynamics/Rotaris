from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from textual.binding import Binding
from textual.message import Message
from textual.widgets import TextArea
from textual.widgets._text_area import LanguageDoesNotExist

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_1538, SWR.SWR_1541, SWR.SWR_1542, SWR.SWR_1543)
class ArtifactEditor(TextArea):
    """Editable Markdown view for a single session artifact body."""

    BINDINGS = [
        Binding("escape", "exit_artifact", "Exit", priority=True),
    ]

    @dataclass
    class SaveRequested(Message):
        artifact_id: str
        text: str

    @dataclass
    class ExitRequested(Message):
        dirty: bool

    def __init__(
        self,
        *,
        artifact_id: str,
        slug: str,
        text: str,
        **kwargs: Any,
    ) -> None:
        kwargs.setdefault("id", "artifact-editor")
        try:
            super().__init__(
                text,
                language="markdown",
                soft_wrap=True,
                show_line_numbers=False,
                **kwargs,
            )
        except LanguageDoesNotExist:
            super().__init__(
                text,
                language=None,
                soft_wrap=True,
                show_line_numbers=False,
                **kwargs,
            )
        self.artifact_id = artifact_id
        self.slug = slug
        self._saved_text = text
        self.dirty = False
        self.border_title = f" artifact: {slug} "
        self._refresh_subtitle()

    def on_text_area_changed(self, message: TextArea.Changed) -> None:
        if message.text_area is not self:
            return
        self.dirty = self.text != self._saved_text
        self._refresh_subtitle()

    def mark_saved(self, text: str | None = None) -> None:
        self._saved_text = self.text if text is None else text
        self.dirty = False
        self._refresh_subtitle()

    def action_save_artifact(self) -> None:
        self.post_message(self.SaveRequested(self.artifact_id, self.text))

    def action_exit_artifact(self) -> None:
        self.post_message(self.ExitRequested(self.dirty))

    def _refresh_subtitle(self) -> None:
        self.border_subtitle = " modified " if self.dirty else " saved "
