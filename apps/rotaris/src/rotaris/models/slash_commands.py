"""Framework-free slash command model for the workspace composer.

Deliberately imports neither Qt nor `rotaris_core.tui`: the parsing and ranking
rules are the part that actually breaks, and they are testable without a
`QApplication`. Handlers take only the argument string — view and window code
supplies closures over its own state (SWR-2443).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

#: Command kinds, shown as a badge in the suggestion popup.
ACTION = "action"
SKILL = "skill"

#: Highlighting states for a `/name` token being typed (SWR-2440).
RESOLVED = "resolved"
PARTIAL = "partial"
UNKNOWN = "unknown"

#: Outcomes of submitting composer text (SWR-2438).
EXECUTED = "executed"
NOT_A_COMMAND = "not-a-command"
UNKNOWN_COMMAND = "unknown-command"
UNAVAILABLE = "unavailable"
FAILED = "failed"


class SlashCommandError(Exception):
    """A command rejected its arguments. The message is shown to the user."""


@traces(SWR.SWR_2442, SWR.SWR_2443)
@dataclass(frozen=True)
class SlashCommand:
    """One invocable command, independent of how it is presented."""

    name: str
    description: str
    handler: Callable[[str], None]
    kind: str = ACTION
    argument_hint: str = ""
    available: Callable[[], bool] | None = None
    unavailable_reason: str = ""

    def is_available(self) -> bool:
        """Whether the command can run right now."""
        return True if self.available is None else bool(self.available())


@dataclass(frozen=True)
class SlashResult:
    """What happened when composer text was submitted."""

    status: str
    message: str = ""

    @property
    def handled(self) -> bool:
        """Whether the composer should stop treating the text as a prompt."""
        return self.status != NOT_A_COMMAND


def _command_body(text: str) -> str | None:
    """The text after a leading `/`, or None when `text` is not a command line.

    `/ ` is the escape for a prompt that genuinely starts with a slash, and
    multi-line text is always a prompt.
    """
    if "\n" in text or not text.startswith("/"):
        return None
    body = text[1:]
    if body[:1].isspace():
        return None
    return body


@traces(SWR.SWR_2438)
def parse_slash_input(text: str) -> tuple[str, str] | None:
    """Split submitted composer text into a lowercased name and its arguments."""
    body = _command_body(text.strip())
    if not body:
        return None
    name, _, args = body.partition(" ")
    return name.lower(), args.strip()


@traces(SWR.SWR_2439)
def slash_filter_text(text: str) -> str | None:
    """The in-progress command name to filter suggestions by, or None to hide.

    Returns `""` for a bare `/` so the popup can list everything. Closes once
    the user starts typing arguments — those are no longer a name to match.
    """
    body = _command_body(text)
    if body is None:
        return None
    if any(char.isspace() for char in body):
        return None
    return body.lower()


@traces(SWR.SWR_2440)
def classify_slash_token(text: str, registry: SlashCommandRegistry) -> tuple[str, int] | None:
    """Classify the leading `/name` token as resolved, partial, or unknown.

    Returns the state and the index just past the token, so the caller can
    format the name and its arguments differently. None when `text` carries no
    command token at all.
    """
    body = _command_body(text)
    if not body:
        return None
    name = body.split(" ", 1)[0].split("\t", 1)[0]
    if not name:
        return None
    name_end = 1 + len(name)
    lowered = name.lower()
    if registry.get(lowered) is not None:
        return RESOLVED, name_end
    if registry.has_prefix(lowered):
        return PARTIAL, name_end
    return UNKNOWN, name_end


@traces(SWR.SWR_2439, SWR.SWR_2443)
class SlashCommandRegistry:
    """Registered commands, in registration order, with prefix-first matching."""

    def __init__(self) -> None:
        self._commands: dict[str, SlashCommand] = {}

    def register(
        self,
        name: str,
        description: str,
        handler: Callable[[str], None],
        *,
        kind: str = ACTION,
        argument_hint: str = "",
        available: Callable[[], bool] | None = None,
        unavailable_reason: str = "",
    ) -> None:
        """Register a command, replacing any earlier one with the same name."""
        lowered = name.lower()
        self._commands[lowered] = SlashCommand(
            name=lowered,
            description=description,
            handler=handler,
            kind=kind,
            argument_hint=argument_hint,
            available=available,
            unavailable_reason=unavailable_reason,
        )

    def clear(self) -> None:
        """Drop every command, so the catalogue can be rebuilt from scratch."""
        self._commands.clear()

    def get(self, name: str) -> SlashCommand | None:
        """Look a command up by name, case-insensitively."""
        return self._commands.get(name.lower())

    def list_commands(self) -> list[SlashCommand]:
        """Every command, in registration order."""
        return list(self._commands.values())

    def has_prefix(self, prefix: str) -> bool:
        """Whether any command name starts with `prefix`."""
        lowered = prefix.lower()
        return any(name.startswith(lowered) for name in self._commands)

    def match(self, filter_text: str) -> list[SlashCommand]:
        """Commands matching `filter_text`, name-prefix matches first.

        Prefix beats substring beats description-only, and each group keeps
        registration order — so `/st` offers `stash` and `stop` before a command
        that merely mentions "stash" in its description.
        """
        needle = filter_text.lstrip("/").strip().lower()
        if not needle:
            return self.list_commands()
        prefixed: list[SlashCommand] = []
        contained: list[SlashCommand] = []
        described: list[SlashCommand] = []
        for command in self._commands.values():
            if command.name.startswith(needle):
                prefixed.append(command)
            elif needle in command.name:
                contained.append(command)
            elif needle in command.description.lower():
                described.append(command)
        return [*prefixed, *contained, *described]

    @traces(SWR.SWR_2438)
    def execute(self, text: str) -> SlashResult:
        """Run the command in `text`, reporting why it did not run when it did not."""
        parsed = parse_slash_input(text)
        if parsed is None:
            return SlashResult(NOT_A_COMMAND)
        name, args = parsed
        command = self.get(name)
        if command is None:
            return SlashResult(UNKNOWN_COMMAND, f"Unknown command /{name}")
        if not command.is_available():
            reason = command.unavailable_reason or f"/{name} is not available right now."
            return SlashResult(UNAVAILABLE, reason)
        try:
            command.handler(args)
        except SlashCommandError as exc:
            return SlashResult(FAILED, str(exc))
        return SlashResult(EXECUTED)
