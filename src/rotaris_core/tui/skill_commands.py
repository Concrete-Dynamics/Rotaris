from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.skills import add_manual_skill, get_skill_catalog

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.skills import SkillCatalog, SkillMeta
    from rotaris_core.tui.app import RotarisTuiApp
    from rotaris_core.tui.widgets.slash_commands import SlashCommandRegistry

_log = logging.getLogger(__name__)


@traces(SWR.SWR_428, SWR.SWR_431)
def register_skill_commands(registry: SlashCommandRegistry, app: RotarisTuiApp) -> None:
    """Register static and skill-backed slash commands for the active app config."""
    registry.register("skills", "List discovered SKILL.md files", _handle_skills)
    registry.register(
        "skill",
        "Load a SKILL.md for this session (usage: /skill <path>)",
        lambda args, app_ref: _handle_skill(args, app_ref, registry),
    )

    catalog = _catalog_for_app(app)
    if catalog is None:
        return

    for skill in catalog.ordered_skills():
        _register_skill_name_command(registry, skill)
        for keyword in skill.trigger_keywords:
            if not keyword.startswith("/"):
                continue
            command_name = keyword[1:].strip().lower()
            if not command_name or registry.get(command_name) is not None:
                if command_name:
                    _log.debug(
                        "Skipping skill slash command /%s for %s because it is already registered.",
                        command_name,
                        skill.normalized_name,
                    )
                continue
            registry.register(
                command_name,
                f"Load skill: {skill.name}",
                _make_skill_trigger_handler(skill.normalized_name),
            )


def _register_skill_name_command(registry: SlashCommandRegistry, skill: SkillMeta) -> None:
    command_name = skill.normalized_name
    if not command_name or registry.get(command_name) is not None:
        return
    registry.register(
        command_name,
        f"Load skill: {skill.name}",
        _make_skill_trigger_handler(skill.normalized_name),
    )


@traces(SWR.SWR_431)
def _handle_skills(args: str, app: RotarisTuiApp) -> None:
    del args
    catalog = _catalog_for_app(app)
    if catalog is None:
        app.notify("No config available.", severity="warning")
        return

    skills = catalog.ordered_skills()
    if not skills:
        _append_system_message(app, "No SKILL.md files discovered.")
        app.notify("No SKILL.md files discovered.", severity="information")
        return

    lines = ["Discovered SKILL.md files:", ""]
    for skill in skills:
        triggers = ", ".join(k for k in skill.trigger_keywords if k.startswith("/")) or "-"
        in_context = "yes" if skill.normalized_name in catalog.in_context else "no"
        description = _one_line(skill.description, limit=120)
        lines.append(
            f"- {skill.name} [{skill.source_scope}] in_context={in_context} "
            f"triggers={triggers}\n  {description}\n  {skill.skill_file}",
        )
    _append_system_message(app, "\n".join(lines))
    app.notify(f"Listed {len(skills)} skill(s).", severity="information")


@traces(SWR.SWR_432, SWR.SWR_433)
def _handle_skill(args: str, app: RotarisTuiApp, registry: SlashCommandRegistry) -> None:
    path_text = _unquote_path_arg(args.strip())
    if not path_text:
        app.notify("Usage: /skill <path-to-SKILL.md-or-directory>", severity="error")
        return
    if app.config is None:
        app.notify("No config available.", severity="warning")
        return

    try:
        skill = add_manual_skill(app.config.workspace_root, Path(path_text))
    except ValueError as exc:
        app.notify(str(exc), severity="error")
        return

    register_skill_commands(registry, app)
    app.notify(f"Loaded skill: {skill.name}", severity="information")


def _make_skill_trigger_handler(normalized_name: str) -> Callable[[str, RotarisTuiApp], None]:
    def _handler(args: str, app: RotarisTuiApp) -> None:
        del args
        catalog = _catalog_for_app(app)
        if catalog is None:
            app.notify("No config available.", severity="warning")
            return
        skill = catalog.skills.get(normalized_name)
        if skill is None:
            app.notify(f"Skill not found: {normalized_name}", severity="error")
            return
        _inject_skill_body(app, catalog, skill)

    return _handler


def _inject_skill_body(app: RotarisTuiApp, catalog: SkillCatalog, skill: SkillMeta) -> None:
    try:
        body = skill.skill_file.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        app.notify(f"Unable to read skill {skill.name}: {exc}", severity="error")
        return

    payload = f"[SKILL.md]\nName: {skill.name}\nSource: {skill.skill_file}\n\n{body}"
    catalog.mark_in_context(skill.normalized_name)
    app.handle_steering_prompt(payload)


def _catalog_for_app(app: RotarisTuiApp) -> SkillCatalog | None:
    if app.config is None:
        return None
    return get_skill_catalog(app.config.workspace_root)


def _append_system_message(app: RotarisTuiApp, content: str) -> None:
    if app.current_session is not None:
        app.current_session.transcript_events.append({"role": "system", "content": content})
        if app.session_manager is not None:
            try:
                app.session_manager.persister.request_save(app.current_session)
            except Exception:  # noqa: BLE001
                _log.exception("Failed to save session after skill command output")
        app.request_widget_refresh()
        return
    app.notify(content, severity="information")


def _one_line(text: str, *, limit: int) -> str:
    one_line = " ".join(text.split())
    if len(one_line) <= limit:
        return one_line
    return one_line[: limit - 1].rstrip() + "..."


def _unquote_path_arg(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value
