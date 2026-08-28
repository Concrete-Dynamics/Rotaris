from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.skills import clear_skill_catalog_cache
from rotaris_core.tui.skill_commands import register_skill_commands
from rotaris_core.tui.widgets.slash_commands import SlashCommandRegistry

if TYPE_CHECKING:
    from pathlib import Path


class DummyApp:
    def __init__(self, workspace: Path) -> None:
        persona = PersonaConfig(name="tester", model="gpt-4o")
        self.config = RotarisConfig(personas={persona.name: persona}, workspace_root=workspace)
        self.current_session = SimpleNamespace(transcript_events=[])
        self.session_manager = None
        self.notifications: list[tuple[str, str | None]] = []
        self.steering: list[str] = []
        self.refreshed = False

    def notify(self, message: str, severity: str | None = None, **_: object) -> None:
        self.notifications.append((message, severity))

    def request_widget_refresh(self) -> None:
        self.refreshed = True

    def handle_steering_prompt(self, text: str) -> None:
        self.steering.append(text)


def _write_skill(directory: Path, extra: str = "") -> Path:
    directory.mkdir(parents=True)
    skill_file = directory / "SKILL.md"
    skill_file.write_text(
        f"---\nname: Review\ndescription: Review changes.\n{extra}---\n\nskill body\n",
        encoding="utf-8",
    )
    return skill_file


@verifies(SWR.SWR_431)
def test_skills_command_lists_catalog(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    _write_skill(tmp_path / ".agents" / "skills" / "review")
    app = DummyApp(tmp_path)
    registry = SlashCommandRegistry()
    register_skill_commands(registry, app)  # type: ignore[arg-type]

    assert registry.execute("/skills", app) is True  # type: ignore[arg-type]

    content = app.current_session.transcript_events[-1]["content"]
    assert "Review [project]" in content
    assert "in_context=no" in content


@verifies(SWR.SWR_428)
def test_skill_trigger_injects_body_and_marks_in_context(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    _write_skill(
        tmp_path / ".agents" / "skills" / "review",
        'trigger: {type: keyword, keywords: ["/review"]}\n',
    )
    app = DummyApp(tmp_path)
    registry = SlashCommandRegistry()
    register_skill_commands(registry, app)  # type: ignore[arg-type]

    assert registry.execute("/review", app) is True  # type: ignore[arg-type]
    assert "skill body" in app.steering[0]
    registry.execute("/skills", app)  # type: ignore[arg-type]
    assert "in_context=yes" in app.current_session.transcript_events[-1]["content"]


@verifies(SWR.SWR_428)
def test_skill_name_registers_as_slash_command(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    _write_skill(tmp_path / ".agents" / "skills" / "review")
    app = DummyApp(tmp_path)
    registry = SlashCommandRegistry()
    register_skill_commands(registry, app)  # type: ignore[arg-type]

    assert registry.execute("/review", app) is True  # type: ignore[arg-type]
    assert "skill body" in app.steering[0]


@verifies(SWR.SWR_432, SWR.SWR_433)
def test_skill_command_loads_manual_skill(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    manual = _write_skill(tmp_path / "manual")
    app = DummyApp(tmp_path / "workspace")
    registry = SlashCommandRegistry()
    register_skill_commands(registry, app)  # type: ignore[arg-type]

    assert registry.execute(f"/skill {manual}", app) is True  # type: ignore[arg-type]
    registry.execute("/skills", app)  # type: ignore[arg-type]

    content = app.current_session.transcript_events[-1]["content"]
    assert "Review [manual]" in content
