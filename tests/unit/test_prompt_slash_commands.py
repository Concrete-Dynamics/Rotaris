from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING

from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.prompt_commands import (
    discover_prompt_commands,
    expand_prompt,
    parse_prompt_file,
    register_prompt_commands,
)
from rotaris_core.tui.widgets.slash_commands import SlashCommandRegistry

if TYPE_CHECKING:
    import pytest


class DummyApp:
    def __init__(self, workspace: Path) -> None:
        persona = PersonaConfig(name="tester", model="gpt-4o")
        self.config = RotarisConfig(personas={persona.name: persona}, workspace_root=workspace)
        self.current_session = SimpleNamespace(transcript_events=[])
        self.steering: list[str] = []

    def handle_steering_prompt(self, text: str) -> None:
        self.steering.append(text)


def _write_prompt(directory: Path, name: str = "draftpr") -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    prompt_file = directory / f"{name}.md"
    prompt_file.write_text(
        "---\n"
        "description: Prep branch, commit, open draft PR\n"
        "argument-hint: '[FILES=] [PR_TITLE=\"\"]'\n"
        "---\n\n"
        "Files: $FILES\nTitle: $PR_TITLE\nArgs: $ARGUMENTS\nFirst: $1\nDollar: $$\n",
        encoding="utf-8",
    )
    return prompt_file


@verifies(SWR.SWR_1186)
def test_prompt_commands_discover_official_codex_prompt_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)
    prompt_file = _write_prompt(home / ".codex" / "prompts")

    prompts = discover_prompt_commands()

    assert [prompt.path for prompt in prompts] == [prompt_file.resolve()]
    assert prompts[0].command_name == "prompts:draftpr"
    assert prompts[0].argument_hint == '[FILES=] [PR_TITLE=""]'


@verifies(SWR.SWR_1186)
def test_prompt_command_expands_placeholders(tmp_path: Path) -> None:
    prompt = parse_prompt_file(_write_prompt(tmp_path))

    expanded = expand_prompt(
        prompt,
        'one FILES="src/app.py tests/test_app.py" PR_TITLE="Ship it"',
    )

    assert "Files: src/app.py tests/test_app.py" in expanded
    assert "Title: Ship it" in expanded
    assert 'Args: one FILES="src/app.py tests/test_app.py" PR_TITLE="Ship it"' in expanded
    assert "First: one" in expanded
    assert "Dollar: $" in expanded


@verifies(SWR.SWR_1142, SWR.SWR_1186)
def test_prompt_slash_command_sends_expanded_prompt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)
    _write_prompt(home / ".codex" / "prompts")
    app = DummyApp(tmp_path)
    registry = SlashCommandRegistry()

    register_prompt_commands(registry, app)  # type: ignore[arg-type]

    assert registry.execute('/prompts:draftpr FILES="src/app.py"', app) is True  # type: ignore[arg-type]
    assert "Files: src/app.py" in app.steering[0]
    assert registry.get("draftpr") is not None
