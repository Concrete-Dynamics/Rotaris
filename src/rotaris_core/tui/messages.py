"""Textual ``Message`` types exchanged between widgets and ``RotarisTuiApp``.

These are intentionally thin signal objects. Grouping them in one module keeps
the app surface small and gives widgets a stable import target that does not
pull in the heavy ``RotarisTuiApp`` module.
"""

from __future__ import annotations

from typing import Literal

from textual.message import Message

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_1443)
class StopRun(Message):
    pass


class PauseRun(Message):
    pass


class ForceCompress(Message):
    pass


class NewSession(Message):
    pass


class ToggleToolEvents(Message):
    pass


class ToggleReasoning(Message):
    pass


class SendToBackground(Message):
    pass


class StashInput(Message):
    pass


class PopInput(Message):
    pass


class LogoutMessage(Message):
    def __init__(self, provider_id: str) -> None:
        super().__init__()
        self.provider_id = provider_id


class SetTheme(Message):
    def __init__(self, name: str) -> None:
        super().__init__()
        self.name = name


class RunCompleted(Message):
    def __init__(
        self,
        text: str,
        severity: Literal["information", "warning", "error"] = "information",
    ) -> None:
        super().__init__()
        self.text = text
        self.severity = severity


class LoadTranscriptPage(Message):
    """Posted by ChatPanel when the user scrolls near the top of the transcript.

    The app handles this by asynchronously loading a page of archived events
    from the JSONL archive and prepending them to the in-memory transcript.
    """
