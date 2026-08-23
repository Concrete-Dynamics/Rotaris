"""Global external coding-agent hook discovery and runtime policy (SWR-3725)."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from rotaris_core.fs import atomic_write
from rotaris_core.hooks.models import DEFAULT_HOOK_TIMEOUT_SECONDS, ResolvedHook
from rotaris_core.reqtocode import SWR, traces

__all__ = [
    "CLAUDE_CODE_AGENT_ID",
    "ROTARIS_AGENT_ID",
    "ExternalHookPolicy",
    "ExternalHookPolicyStore",
    "ExternalHookRecord",
    "claude_settings_path",
    "discover_claude_code_hooks",
    "enabled_external_hooks",
    "policy_path",
]

CLAUDE_CODE_AGENT_ID = "claude-code"
ROTARIS_AGENT_ID = "rotaris"
_POLICY_FILENAME = "external-hooks.json"
_CLAUDE_EVENT_MAP = {
    "PreToolUse": "pre_tool",
    "PostToolUse": "post_tool",
    "SessionStart": "session_start",
    "SessionEnd": "session_end",
    "SubagentStop": "child_completed",
}
_CLAUDE_TOOL_MAP = {
    "Bash": frozenset({"terminal"}),
    "PowerShell": frozenset({"terminal"}),
    "Read": frozenset({"read_file", "haet_read"}),
    "Edit": frozenset({"haet_edit"}),
    "Write": frozenset({"write_file"}),
}


def policy_path() -> Path:
    """Return the global external-hook policy path, with a testable override."""
    configured = os.environ.get("ROTARIS_CONFIG_DIR", "").strip()
    root = Path(configured).expanduser() if configured else Path.home() / ".config" / "rotaris"
    return root / _POLICY_FILENAME


def claude_settings_path() -> Path:
    """Return the user-global Claude Code settings location."""
    configured = os.environ.get("ROTARIS_CLAUDE_SETTINGS_PATH", "").strip()
    return (
        Path(configured).expanduser() if configured else Path.home() / ".claude" / "settings.json"
    )


@dataclass(frozen=True, slots=True)
class ExternalHookPolicy:
    """Global runtime selection state keyed by agent and stable hook identity."""

    agents: dict[str, bool] = field(default_factory=dict)
    hooks: dict[str, bool] = field(default_factory=dict)

    def agent_enabled(self, agent_id: str) -> bool:
        return self.agents.get(agent_id, True)

    def hook_enabled(self, hook_id: str) -> bool:
        return self.hooks.get(hook_id, True)

    def enabled(self, agent_id: str, hook_id: str) -> bool:
        return self.agent_enabled(agent_id) and self.hook_enabled(hook_id)

    def with_agent(self, agent_id: str, enabled: bool) -> ExternalHookPolicy:
        agents = dict(self.agents)
        agents[agent_id] = bool(enabled)
        return ExternalHookPolicy(agents=agents, hooks=dict(self.hooks))

    def with_hook(self, hook_id: str, enabled: bool) -> ExternalHookPolicy:
        hooks = dict(self.hooks)
        hooks[hook_id] = bool(enabled)
        return ExternalHookPolicy(agents=dict(self.agents), hooks=hooks)


@traces(SWR.SWR_3725)
class ExternalHookPolicyStore:
    """Atomic persistence for the global runtime-only external-hook policy."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or policy_path()

    def load(self) -> ExternalHookPolicy:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return ExternalHookPolicy()
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return ExternalHookPolicy()
        if not isinstance(raw, dict):
            return ExternalHookPolicy()
        return ExternalHookPolicy(
            agents=_bool_map(raw.get("agents")),
            hooks=_bool_map(raw.get("hooks")),
        )

    def save(self, policy: ExternalHookPolicy) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "agents": dict(sorted(policy.agents.items())),
            "hooks": dict(sorted(policy.hooks.items())),
        }
        atomic_write(self.path, json.dumps(payload, indent=2, sort_keys=True) + "\n")

    def set_agent_enabled(self, agent_id: str, enabled: bool) -> ExternalHookPolicy:
        policy = self.load().with_agent(agent_id, enabled)
        self.save(policy)
        return policy

    def set_hook_enabled(self, hook_id: str, enabled: bool) -> ExternalHookPolicy:
        policy = self.load().with_hook(hook_id, enabled)
        self.save(policy)
        return policy


@dataclass(frozen=True, slots=True)
class ExternalHookRecord:
    """One discovered external hook and its Rotaris compatibility verdict."""

    agent_id: str
    agent_label: str
    record_id: str
    source_path: Path
    event: str
    matcher: str
    command: str
    compatible: bool
    reason: str = ""
    resolved_hook: ResolvedHook | None = None

    @property
    def label(self) -> str:
        return f"{self.event} hook"


@traces(SWR.SWR_3725)
def discover_claude_code_hooks(
    path: Path | None = None,
) -> tuple[tuple[ExternalHookRecord, ...], str]:
    """Read user-global Claude Code command hooks without changing their source."""
    source = path or claude_settings_path()
    try:
        raw = json.loads(source.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return (), "Claude Code global settings were not found."
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        return (), f"Claude Code hooks could not be read: {exc}"
    hooks = raw.get("hooks") if isinstance(raw, dict) else None
    if not isinstance(hooks, dict):
        return (), "Claude Code global settings contain no hook declarations."

    records: list[ExternalHookRecord] = []
    for event, groups in hooks.items():
        if not isinstance(event, str) or not isinstance(groups, list):
            continue
        for group_index, group in enumerate(groups):
            if not isinstance(group, dict):
                continue
            matcher = str(group.get("matcher", "") or "")
            handlers = group.get("hooks")
            if not isinstance(handlers, list):
                continue
            for handler_index, handler in enumerate(handlers):
                if not isinstance(handler, dict):
                    continue
                records.append(
                    _record_from_handler(
                        source,
                        event,
                        matcher,
                        group_index,
                        handler_index,
                        handler,
                    ),
                )
    return tuple(records), ""


def enabled_external_hooks(
    records: tuple[ExternalHookRecord, ...], policy: ExternalHookPolicy
) -> tuple[ResolvedHook, ...]:
    """Return compatible external hooks selected by the global runtime policy."""
    return tuple(
        record.resolved_hook
        for record in records
        if record.compatible
        and policy.enabled(record.agent_id, record.record_id)
        and record.resolved_hook is not None
    )


def _record_from_handler(
    source: Path,
    event: str,
    matcher: str,
    group_index: int,
    handler_index: int,
    handler: dict[str, Any],
) -> ExternalHookRecord:
    identity = _record_id(source, event, matcher, handler, group_index, handler_index)
    handler_type = str(handler.get("type", "command") or "command")
    command = str(handler.get("command", "") or "")
    mapped_event = _CLAUDE_EVENT_MAP.get(event)
    if handler_type != "command":
        return _inactive(
            source,
            event,
            matcher,
            command,
            identity,
            f"{handler_type} handlers are unavailable in Rotaris.",
        )
    if not command.strip():
        return _inactive(
            source, event, matcher, command, identity, "The command handler has no command."
        )
    if handler.get("if"):
        return _inactive(
            source,
            event,
            matcher,
            command,
            identity,
            "Claude Code `if` predicates require tool arguments that Rotaris does not expose here.",
        )
    if mapped_event is None:
        return _inactive(
            source,
            event,
            matcher,
            command,
            identity,
            f"The Claude Code {event} lifecycle event has no Rotaris equivalent.",
        )
    tool_names, matcher_reason = _tool_names(matcher, mapped_event)
    if matcher_reason:
        return _inactive(source, event, matcher, command, identity, matcher_reason)
    try:
        timeout_seconds = float(
            handler.get("timeout", DEFAULT_HOOK_TIMEOUT_SECONDS) or DEFAULT_HOOK_TIMEOUT_SECONDS
        )
    except (TypeError, ValueError):
        return _inactive(
            source,
            event,
            matcher,
            command,
            identity,
            "The command handler timeout is invalid.",
        )
    if timeout_seconds <= 0:
        return _inactive(
            source,
            event,
            matcher,
            command,
            identity,
            "The command handler timeout must be positive.",
        )
    hook = ResolvedHook(
        name=f"Claude Code {event}",
        event=mapped_event,
        matcher="",
        command=command,
        timeout_seconds=timeout_seconds,
        required=False,
        source="external:claude-code",
        index=handler_index,
        tool_names=tool_names,
        identity=identity,
    )
    return ExternalHookRecord(
        agent_id=CLAUDE_CODE_AGENT_ID,
        agent_label="Claude Code",
        record_id=identity,
        source_path=source,
        event=event,
        matcher=matcher,
        command=command,
        compatible=True,
        resolved_hook=hook,
    )


def _inactive(
    source: Path, event: str, matcher: str, command: str, identity: str, reason: str
) -> ExternalHookRecord:
    return ExternalHookRecord(
        agent_id=CLAUDE_CODE_AGENT_ID,
        agent_label="Claude Code",
        record_id=identity,
        source_path=source,
        event=event,
        matcher=matcher,
        command=command,
        compatible=False,
        reason=reason,
    )


def _record_id(
    source: Path,
    event: str,
    matcher: str,
    handler: dict[str, Any],
    group_index: int,
    handler_index: int,
) -> str:
    canonical = json.dumps(handler, sort_keys=True, separators=(",", ":"), default=str)
    material = "\x1f".join(
        (
            CLAUDE_CODE_AGENT_ID,
            str(source),
            event,
            matcher,
            canonical,
            str(group_index),
            str(handler_index),
        )
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]
    return f"{CLAUDE_CODE_AGENT_ID}:{digest}"


def _tool_names(matcher: str, event: str) -> tuple[frozenset[str], str]:
    if event not in {"pre_tool", "post_tool"}:
        return frozenset(), ""
    stripped = matcher.strip()
    if not stripped or stripped == "*":
        return frozenset(), ""
    if any(char in stripped for char in "^$.*+?[](){}\\"):
        return frozenset(), "Regular-expression matchers are unavailable in Rotaris."
    selectors = [part.strip() for part in stripped.replace(",", "|").split("|") if part.strip()]
    if not selectors:
        return frozenset(), ""
    resolved: set[str] = set()
    unknown = [selector for selector in selectors if selector not in _CLAUDE_TOOL_MAP]
    if unknown:
        return frozenset(), f"Claude Code tool selector {unknown[0]!r} has no Rotaris equivalent."
    for selector in selectors:
        resolved.update(_CLAUDE_TOOL_MAP[selector])
    return frozenset(resolved), ""


def _bool_map(value: object) -> dict[str, bool]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): bool(item)
        for key, item in value.items()
        if isinstance(key, str) and isinstance(item, bool)
    }
