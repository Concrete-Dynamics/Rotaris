"""Resolved lifecycle-hook models and matching (SWR-2701).

The config schema declares hooks (:class:`~rotaris_core.config.schema.HookEntry`);
this module turns a loaded :class:`~rotaris_core.config.schema.RotarisConfig` into
the flat, immutable set the runtime actually consults, and answers the one
question the tool-dispatch seam asks on every single tool call: *does this hook
apply here?*

Deliberately import-light. :mod:`rotaris_core.config.schema` imports
:data:`HOOK_EVENTS` from here at module scope, so nothing in this module may
import the config package at runtime — and nothing may import
``rotaris_core.tools``, which drags in ``openhands.sdk`` and costs seconds of
start-up. The only non-trivial dependency is the SWR-2502 command-pattern
matcher, which is itself a leaf.
"""

from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatchcase
from functools import lru_cache
from typing import TYPE_CHECKING

from rotaris_core.permissions.command_patterns import CommandPattern, parse_command
from rotaris_core.permissions.engine import MalformedPolicyError
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.config.schema import HookEntry, RotarisConfig

__all__ = [
    "DEFAULT_HOOK_TIMEOUT_SECONDS",
    "HOOK_EVENTS",
    "HOOK_FAILURE_DISABLE_THRESHOLD",
    "HOOK_SOURCES",
    "LIFECYCLE_HOOK_EVENTS",
    "MAX_HOOK_OUTPUT_BYTES",
    "TOOL_HOOK_EVENTS",
    "ResolvedHook",
    "hooks_for_event",
    "matches_tool",
    "resolve_hooks",
    "superseded_hooks",
]

#: Events fired around a single tool call, where a hook's exit code can steer
#: dispatch (SWR-2702).
TOOL_HOOK_EVENTS: frozenset[str] = frozenset({"pre_tool", "post_tool"})

#: Events fired by the session loop itself. Informational only: a lifecycle
#: hook can never block the loop (SWR-2703).
LIFECYCLE_HOOK_EVENTS: frozenset[str] = frozenset(
    {
        "session_start",
        "session_end",
        "iteration_end",
        "child_completed",
        "verifier_finished",
    },
)

#: Every event name a hook entry may name. Config validation rejects anything else.
HOOK_EVENTS: frozenset[str] = TOOL_HOOK_EVENTS | LIFECYCLE_HOOK_EVENTS

#: Wall-clock budget for a hook process when the entry does not set one (SWR-2704).
DEFAULT_HOOK_TIMEOUT_SECONDS: float = 60.0

#: How much of a hook's stdout/stderr is retained for diagnostics (SWR-2704).
MAX_HOOK_OUTPUT_BYTES: int = 16384

#: Failures of the *same* hook within one session before it is disabled for the
#: remainder of that session (SWR-2704).
HOOK_FAILURE_DISABLE_THRESHOLD: int = 3

#: Config scopes a hook can come from, least to most specific. ``"workspace"``
#: is the untrusted one: it travels with a cloned repository.
HOOK_SOURCES: tuple[str, ...] = ("default", "global", "workspace")

#: Scope attributed to an entry that carries no loader stamp — a config built in
#: memory rather than read off disk.
_UNSTAMPED_SOURCE = "default"


def _hook_id(source: str, index: int, event: str) -> str:
    return f"{source}:{index}:{event}"


@traces(SWR.SWR_2701)
@dataclass(frozen=True, slots=True)
class ResolvedHook:
    """One enabled hook, flattened out of the layered config.

    Immutable on purpose: the effective hook set is recorded in the session
    snapshot and must not drift while a session runs.
    """

    name: str
    event: str
    #: Empty means "every tool" / "every occurrence of the event".
    matcher: str
    command: str
    timeout_seconds: float
    required: bool
    #: ``"global"``, ``"workspace"`` or ``"default"`` — which scope declared it.
    source: str
    #: Position within its own source's entry list, counted before disabled
    #: entries are dropped so toggling ``enabled`` never renumbers its siblings.
    index: int

    @property
    def hook_id(self) -> str:
        """A stable identifier, unique within one loaded config."""
        return _hook_id(self.source, self.index, self.event)


@traces(SWR.SWR_2701)
def resolve_hooks(config: RotarisConfig) -> tuple[ResolvedHook, ...]:
    """Flatten *config*'s hook declarations into the effective hook set.

    Returns an empty tuple when hooks are switched off wholesale; individually
    disabled entries are dropped but still consume their index, so a hook's
    :attr:`~ResolvedHook.hook_id` does not change when a neighbour is toggled.
    """
    settings = config.hooks
    if not settings.enabled:
        return ()
    return _resolve_entries(settings.entries)


@traces(SWR.SWR_2701, SWR.SWR_2816)
def superseded_hooks(config: RotarisConfig) -> tuple[ResolvedHook, ...]:
    """The hooks a higher scope replaced, resolved the same way as the live set.

    A workspace hook list replaces the inherited one (SWR-2701). These are the
    entries that lost, kept by the loader so the trust gate can fall back to the
    user's own hooks when the workspace list is refused — an untrusted repository
    must not be able to disable a guardrail just by declaring a list of its own.
    """
    settings = config.hooks
    if not settings.enabled:
        return ()
    return _resolve_entries(settings.superseded_entries)


def _resolve_entries(entries: Sequence[HookEntry]) -> tuple[ResolvedHook, ...]:
    next_index: dict[str, int] = {}
    resolved: list[ResolvedHook] = []
    for entry in entries:
        source = entry.source or _UNSTAMPED_SOURCE
        index = next_index.get(source, 0)
        next_index[source] = index + 1
        if not entry.enabled:
            continue
        hook_id = _hook_id(source, index, entry.event)
        resolved.append(
            ResolvedHook(
                name=entry.name.strip() or hook_id,
                event=entry.event,
                matcher=entry.matcher,
                command=entry.command,
                timeout_seconds=entry.timeout_seconds,
                required=entry.required,
                source=source,
                index=index,
            ),
        )
    return tuple(resolved)


@traces(SWR.SWR_2701)
def hooks_for_event(hooks: Sequence[ResolvedHook], event: str) -> tuple[ResolvedHook, ...]:
    """The subset of *hooks* attached to *event*, in declaration order."""
    return tuple(hook for hook in hooks if hook.event == event)


@lru_cache(maxsize=256)
def _compiled_matcher(matcher: str) -> CommandPattern | None:
    """Compile *matcher* as a command pattern; ``None`` when it cannot be read."""
    try:
        return CommandPattern.parse(matcher)
    except MalformedPolicyError:
        return None


@traces(SWR.SWR_2701, SWR.SWR_2502)
def matches_tool(hook: ResolvedHook, *, tool_name: str, command: str = "") -> bool:
    """Whether *hook* applies to a tool call.

    An empty matcher matches everything. When the call carries a shell
    *command* the matcher is read as an SWR-2502 command pattern and tried
    against every segment of the (possibly compound) command line, so a matcher
    still catches the destructive half of ``git status && rm -rf /``. Without a
    command the matcher is a glob over the tool name.

    Never raises: config load already rejected matchers that do not compile, and
    a matcher that somehow reaches here uncompilable simply matches nothing
    rather than taking down a tool call.
    """
    matcher = hook.matcher
    if not matcher:
        return True
    if command.strip():
        pattern = _compiled_matcher(matcher)
        if pattern is None:
            return False
        return any(pattern.matches(segment) for segment in parse_command(command))
    return fnmatchcase(tool_name, matcher)
