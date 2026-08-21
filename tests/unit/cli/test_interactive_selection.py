from __future__ import annotations

from io import StringIO
from typing import Any

from rotaris_core.cli.commands.login import _RichUI
from rotaris_core.cli.interactive_selection import _AnsiSelectionRenderer
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_707)
def test_rich_ui_choose_provider_uses_interactive_selector(monkeypatch: Any) -> None:
    calls: list[tuple[str, list[tuple[str, str]]]] = []

    monkeypatch.setattr(
        "rotaris_core.cli.interactive_selection.is_interactive_terminal",
        lambda: True,
    )

    def fake_prompt(title: str, options: list[tuple[str, str]]) -> str | None:
        calls.append((title, list(options)))
        return "codex"

    monkeypatch.setattr(
        "rotaris_core.cli.interactive_selection.prompt_for_selection",
        fake_prompt,
    )

    selected = _RichUI().choose_provider([("copilot", "GitHub Copilot"), ("codex", "OpenAI Codex")])

    assert selected == "codex"
    assert calls == [
        (
            "Choose provider to sign in with:",
            [("copilot", "GitHub Copilot"), ("codex", "OpenAI Codex")],
        ),
    ]


@verifies(SWR.SWR_707)
def test_ansi_selection_renderer_adds_color_and_selection_frames() -> None:
    stream = StringIO()
    renderer = _AnsiSelectionRenderer(stream)

    renderer("Choose provider:", ["GitHub Copilot", "OpenAI Codex"], 0)
    renderer("Choose provider:", ["GitHub Copilot", "OpenAI Codex"], 1)
    renderer.finish()

    output = stream.getvalue()

    assert "\x1b[1;36mChoose provider:" in output
    assert "\x1b[1;32m>> GitHub Copilot\x1b[0m" in output
    assert "\x1b[1;32m>  OpenAI Codex\x1b[0m" in output
    assert "\x1b[2;37m   OpenAI Codex\x1b[0m" in output
