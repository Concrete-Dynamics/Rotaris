"""Populate the workspace composer's slash catalogue from the running window.

Everything here is a closure over behaviour the main window already has, so the
command palette and the slash commands cannot disagree about what exists
(SWR-2442).
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

from rotaris.models.slash_commands import SKILL, SlashCommandError

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.models.slash_commands import SlashCommandRegistry
    from rotaris.models.state import SkillInfo
    from rotaris.views.main_window import MainWindow

_NON_NAME = re.compile(r"[^a-z0-9:_.-]+")

NO_RUN = "No run is active."
EMPTY_TRANSCRIPT = "The transcript is empty."
NO_GIT = "No git service is available for this workspace."
NO_MODELS = "No models are configured. Choose one in Settings."


def normalize_command_name(name: str) -> str:
    """Turn a skill or action label into a typeable command name."""
    return _NON_NAME.sub("-", name.strip().lower()).strip("-")


def _action_handler(callback: Callable[[], None]) -> Callable[[str], None]:
    """Adapt an argument-less action to the command handler signature."""

    def handler(_args: str) -> None:
        callback()

    return handler


@traces(SWR.SWR_2442)
def build_slash_catalogue(window: MainWindow) -> None:
    """Rebuild the workspace's slash catalogue from the window's current state."""
    registry = window.workspace.slash_registry
    registry.clear()
    _register_palette_commands(registry, window)
    _register_run_commands(registry, window)
    _register_argument_commands(registry, window)
    _register_skill_commands(registry, window)


def _register_palette_commands(registry: SlashCommandRegistry, window: MainWindow) -> None:
    """Mirror every command-palette entry, so neither surface drifts (SWR-2030)."""
    for spec in window.commands.commands():
        name = normalize_command_name(spec.id)
        if not name:
            continue
        shortcut = f" ({spec.shortcut})" if spec.shortcut else ""
        registry.register(name, f"{spec.label}{shortcut}", _action_handler(spec.callback))


def _register_run_commands(registry: SlashCommandRegistry, window: MainWindow) -> None:
    store = window.store

    def run_active() -> bool:
        bridge = window.run_bridge
        return bool(bridge is not None and getattr(bridge, "running", False))

    def has_transcript() -> bool:
        return bool(store.transcript)

    def has_git() -> bool:
        return window.git_service is not None

    registry.register(
        "stop",
        "Cancel the active run",
        _action_handler(window._cancel_run),
        available=run_active,
        unavailable_reason=NO_RUN,
    )
    registry.register(
        "pause",
        "Pause the active run",
        _action_handler(window._pause_run),
        available=run_active,
        unavailable_reason=NO_RUN,
    )
    registry.register(
        "compress",
        "Compress agent context",
        _action_handler(window._compress_context),
        available=run_active,
        unavailable_reason=NO_RUN,
    )
    registry.register(
        "clear",
        "Clear the transcript",
        _action_handler(window._clear_transcript),
        available=has_transcript,
        unavailable_reason=EMPTY_TRANSCRIPT,
    )
    registry.register("new", "Start a new session", _action_handler(window._new_session))
    registry.register(
        "resume", "Browse and resume sessions", _action_handler(window._show_sessions)
    )
    registry.register(
        "sessions", "Browse and resume sessions", _action_handler(window._show_sessions)
    )
    registry.register(
        "search",
        "Search the transcript",
        _action_handler(window._search_transcript),
        available=has_transcript,
        unavailable_reason=EMPTY_TRANSCRIPT,
    )
    registry.register(
        "worktree",
        "Create a git worktree",
        _action_handler(window._create_worktree),
        available=has_git,
        unavailable_reason=NO_GIT,
    )
    registry.register(
        "stash", "Stash the composer prompt", _action_handler(window.workspace._stash_prompt)
    )
    registry.register(
        "pop", "Apply a stashed prompt", _action_handler(window.workspace._open_prompt_stash)
    )


def _register_argument_commands(registry: SlashCommandRegistry, window: MainWindow) -> None:
    store = window.store

    @traces(SWR.SWR_2812, SWR.SWR_2814)
    def set_model(args: str) -> None:
        name = args.strip()
        if not name:
            raise SlashCommandError("Usage: /model <name>")
        if name not in store.model_catalog:
            # A model the provider refuses is still a model the user has heard of —
            # answer with the reason rather than claiming it does not exist.
            withheld = next(
                (
                    option
                    for option in store.model_options
                    if option.name == name and not option.available
                ),
                None,
            )
            if withheld is not None:
                raise SlashCommandError(f"{name} is unavailable. {withheld.reason}")
            available = ", ".join(store.model_catalog) or "none"
            raise SlashCommandError(f"Unknown model {name!r}. Available: {available}")
        # Drive the visible chip: its existing signal writes through to the store.
        window.workspace.model_combo.setCurrentText(name)
        window.notify(f"Model set to {name}.")

    def set_persona(args: str) -> None:
        name = args.strip()
        if not name:
            raise SlashCommandError("Usage: /persona <name>")
        known = [persona.name for persona in store.personas]
        if name not in known:
            available = ", ".join(known) or "none"
            raise SlashCommandError(f"Unknown persona {name!r}. Available: {available}")
        window.workspace.persona_combo.setCurrentText(name)
        window.notify(f"Persona set to {name}.")

    registry.register(
        "model",
        "Switch the model for the next prompt",
        set_model,
        argument_hint="<name>",
        available=lambda: bool(store.model_catalog),
        unavailable_reason=NO_MODELS,
    )
    registry.register(
        "persona",
        "Switch the persona for the next prompt",
        set_persona,
        argument_hint="<name>",
    )


def _register_skill_commands(registry: SlashCommandRegistry, window: MainWindow) -> None:
    """Offer every user-invocable skill; loading one force-loads it (SWR-2051)."""
    for skill in window.store.skills:
        if skill.invocation_mode == "auto-only":
            continue
        for candidate in (skill.name, skill.trigger):
            name = normalize_command_name(candidate.removeprefix("/") if candidate else "")
            if not name or registry.get(name) is not None:
                continue
            registry.register(
                name,
                skill.description or f"Load skill: {skill.name}",
                _make_skill_handler(window, skill),
                kind=SKILL,
            )


def _make_skill_handler(window: MainWindow, skill: SkillInfo) -> Callable[[str], None]:
    def handler(_args: str) -> None:
        if not window.store.skills_enabled:
            raise SlashCommandError("Skills are disabled. Enable them in Settings.")
        window.store.set_skill_load_mode(skill.name, "on")
        window.notify(f"Skill loaded for the next prompt: {skill.name}")

    return handler
