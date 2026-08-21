from __future__ import annotations

import re
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.tui.app import RotarisTuiApp
    from rotaris_core.tui.widgets.slash_commands import SlashCommandRegistry

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
_PLACEHOLDER_RE = re.compile(r"\$\$|\$ARGUMENTS|\$[1-9]|\$[A-Z][A-Z0-9_]*")
_PROMPT_NAME_RE = re.compile(r"[^a-z0-9:_-]+")


@dataclass(frozen=True, slots=True)
class PromptCommand:
    name: str
    description: str
    argument_hint: str
    body: str
    path: Path

    @property
    def command_name(self) -> str:
        return f"prompts:{self.name}"

    @property
    def display_description(self) -> str:
        suffix = f" {self.argument_hint}" if self.argument_hint else ""
        return f"Prompt: {self.description}{suffix}"


@traces(SWR.SWR_1142, SWR.SWR_1186)
def register_prompt_commands(registry: SlashCommandRegistry, app: RotarisTuiApp) -> None:
    """Register Codex-style custom prompt slash commands."""
    del app
    for prompt in discover_prompt_commands():
        _register_prompt(registry, prompt.command_name, prompt)
        if registry.get(prompt.name) is None:
            _register_prompt(registry, prompt.name, prompt)


@traces(SWR.SWR_1186)
def discover_prompt_commands() -> list[PromptCommand]:
    prompts: dict[str, PromptCommand] = {}
    for base in _prompt_roots():
        if not base.is_dir():
            continue
        for prompt_file in sorted(base.glob("*.md")):
            try:
                prompt = parse_prompt_file(prompt_file)
            except ValueError:
                continue
            prompts.setdefault(prompt.command_name, prompt)
    return [prompts[name] for name in sorted(prompts)]


@traces(SWR.SWR_1186)
def parse_prompt_file(prompt_file: Path) -> PromptCommand:
    resolved = prompt_file.resolve()
    try:
        raw = resolved.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"unreadable prompt file: {exc}") from exc

    metadata: dict[str, Any] = {}
    body = raw
    match = _FRONTMATTER_RE.match(raw)
    if match is not None:
        try:
            loaded = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError as exc:
            raise ValueError(f"malformed YAML frontmatter: {exc}") from exc
        if not isinstance(loaded, dict):
            raise ValueError("frontmatter must be a mapping")
        metadata = dict(loaded)
        body = raw[match.end() :]

    name = _normalize_prompt_name(prompt_file.stem)
    if not name:
        raise ValueError("prompt filename normalizes to empty command")
    description = str(metadata.get("description") or prompt_file.stem).strip()
    argument_hint = str(metadata.get("argument-hint") or "").strip()
    return PromptCommand(
        name=name,
        description=" ".join(description.split()),
        argument_hint=" ".join(argument_hint.split()),
        body=body.strip(),
        path=resolved,
    )


@traces(SWR.SWR_1186)
def expand_prompt(prompt: PromptCommand, args: str) -> str:
    positional, named = _parse_prompt_args(args)

    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if token == "$$":
            return "$"
        if token == "$ARGUMENTS":
            return args
        if len(token) == 2 and token[1].isdigit():
            index = int(token[1]) - 1
            return positional[index] if index < len(positional) else ""
        return named.get(token[1:], "")

    return _PLACEHOLDER_RE.sub(replace, prompt.body)


def _register_prompt(
    registry: SlashCommandRegistry,
    command_name: str,
    prompt: PromptCommand,
) -> None:
    registry.register(command_name, prompt.display_description, _make_prompt_handler(prompt))


def _make_prompt_handler(prompt: PromptCommand) -> Callable[[str, RotarisTuiApp], None]:
    def _handler(args: str, app: RotarisTuiApp) -> None:
        app.handle_steering_prompt(expand_prompt(prompt, args))

    return _handler


def _parse_prompt_args(args: str) -> tuple[list[str], dict[str, str]]:
    if not args.strip():
        return [], {}
    try:
        tokens = shlex.split(args)
    except ValueError:
        tokens = args.split()

    positional: list[str] = []
    named: dict[str, str] = {}
    for token in tokens:
        key, separator, value = token.partition("=")
        if separator and key.isupper():
            named[key] = value
        else:
            positional.append(token)
    return positional, named


def _prompt_roots() -> tuple[Path, ...]:
    home = Path.home()
    return (
        home / ".codex" / "prompts",
        home / ".agents" / "prompts",
    )


def _normalize_prompt_name(name: str) -> str:
    return _PROMPT_NAME_RE.sub("-", name.strip().lower()).strip("-")
