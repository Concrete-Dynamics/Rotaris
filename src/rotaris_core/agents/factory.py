from __future__ import annotations

import logging
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, TextIO, cast

from openhands.sdk import AgentContext
from openhands.sdk.tool.spec import Tool

from rotaris_core.agents.safe_agent import RotarisAgent as Agent
from rotaris_core.agents.tool_registration import (  # noqa: F401
    RuntimeToolBinding,
    _register_artifact_tool_factories,
    _register_ask_questions_tool_factory,
    _register_background_output_tool_factory,
    _register_delegate_tool_factory,
    _register_fetch_tool_factory,
    _register_file_tool_factories,
    _register_grep_glob_tool_factories,
    _register_grep_glob_tool_factories_silenced,
    _register_haet_tool_factories,
    _register_terminal_tool_factory,
    _register_todo_tool_factory,
    _register_wait_for_tasks_tool_factory,
    _suppress_registry_duplicate_log,
    build_binding_key,
    identity_params,
    register_runtime_binding,
)
from rotaris_core.config.mcp_resolution import (
    mcp_server_is_available,
    resolve_command,
    resolve_stdio_server_command_args,
)
from rotaris_core.permissions import register_permission_engine
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from openhands.sdk import LLM

    from rotaris_core.agents.playbook import PlaybookCell
    from rotaris_core.config.mcp_grants import GrantMap
    from rotaris_core.config.schema import (
        MCPServerConfig,
        MCPToolInfo,
        ModelTier,
        PersonaConfig,
        RotarisConfig,
    )
    from rotaris_core.permissions import PermissionEngine
    from rotaris_core.tui.mcp_toggles import MCPToggleStore

_log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"
_ROTARIS_SYSTEM_PROMPT_TEMPLATE = str(PROMPTS_DIR / "system_prompt.j2")

TOOL_NAME_MAP = {
    "ask_questions": "ask_questions",
    "delegate": "delegate",
    "background_output": "background_output",
    "wait_for_tasks": "wait_for_tasks",
    "haet": "haet_edit",
    "haet_edit": "haet_edit",
    "haet_read": "haet_read",
    "read_file": "read_file",
    "write_file": "write_file",
    "terminal": "terminal",
    "git_commit": "git_commit",
    "todo": "todo",
    "fetch": "fetch",
    "grep": "grep",
    "glob": "glob",
    "artifact_read": "artifact_read",
    "artifact_list": "artifact_list",
    "artifact_write": "artifact_write",
}

#: The set of tool names that personas may declare in their ``tools:`` YAML list.
#: Names not in this set (and not MCP server names) are rejected at config-validation time.
#: Internal-only tools (e.g. ``"file_viewer"`` used by the Researcher) must NOT appear here.
ALLOWED_PUBLIC_TOOL_NAMES: frozenset[str] = frozenset(TOOL_NAME_MAP)

_custom_tools_registered = False
_sdk_terminal_registered = False
_logged_unavailable_mcp_servers: set[str] = set()


@dataclass(frozen=True, slots=True)
class ResolvedPersonaRuntime:
    prompt: str
    public_tools: list[str]
    prompt_tool_names: list[str]
    sdk_tool_names: list[str]
    removed_tools: dict[str, str] = field(default_factory=dict)
    mcp_config: dict[str, Any] = field(default_factory=dict)
    active_mcp_servers: list[str] = field(default_factory=list)
    mcp_server_tools: dict[str, list[tuple[str, str]]] = field(default_factory=dict)
    mcp_tool_grants: GrantMap = field(default_factory=dict)
    """Per-server grant this persona resolved to; ``None`` value = the whole server."""
    mcp_discovery_failures: list[str] = field(default_factory=list)
    mcp_config_warnings: list[str] = field(default_factory=list)


@traces(SWR.SWR_1733)
def _normalize_mcp_server_config(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
) -> dict[str, Any]:
    if server_cfg.type in ("http", "sse"):
        result: dict[str, Any] = {
            "transport": "streamable-http" if server_cfg.type == "http" else "sse",
            "url": server_cfg.url,
        }
        if server_cfg.headers:
            result["headers"] = dict(server_cfg.headers)
        if server_cfg.request_timeout is not None:
            result["timeout"] = float(server_cfg.request_timeout)
        return result

    raw_command = server_cfg.command or ""
    raw_args = list(server_cfg.args)
    command, args = resolve_stdio_server_command_args(
        server_name,
        raw_command,
        raw_args,
        workspace_root,
    )

    normalized: dict[str, Any] = {
        "transport": "stdio",
        "command": command,
        "args": args,
        "env": dict(server_cfg.env),
        "cwd": server_cfg.cwd or str(workspace_root),
    }
    if server_cfg.request_timeout is not None:
        normalized["timeout"] = float(server_cfg.request_timeout)
    return normalized


def _mcp_server_is_available(
    server_name: str,
    server_cfg: MCPServerConfig,
    *,
    persona_name: str,
) -> bool:
    """Persona-facing wrapper around the shared availability rule.

    The rule itself lives in :func:`rotaris_core.config.mcp_resolution.mcp_server_is_available`
    so callers outside the agent layer can ask the same question without
    importing this module and the SDK it pulls in. What stays here is the part
    that is about personas: naming the persona that loses the server, once per
    server per process.
    """
    if mcp_server_is_available(server_name, server_cfg):
        return True

    if server_name not in _logged_unavailable_mcp_servers:
        raw_command = server_cfg.command or ""
        resolved_command, _ = resolve_command(raw_command, list(server_cfg.args))
        _logged_unavailable_mcp_servers.add(server_name)
        _log.warning(
            "MCP server '%s' command '%s' (resolved: '%s') not found on PATH; "
            "excluding it from personas that request it, including '%s'.",
            server_name,
            raw_command,
            resolved_command,
            persona_name,
        )
    return False


class _EncodingCompatibleStream:
    """Proxy stream objects that lack the text attributes some SDK deps expect."""

    def __init__(self, wrapped: Any) -> None:
        self._wrapped = wrapped
        self.encoding = getattr(wrapped, "encoding", None) or "utf-8"
        self.errors = getattr(wrapped, "errors", None) or "replace"

    def __getattr__(self, name: str) -> Any:
        return getattr(self._wrapped, name)


@contextmanager
def _sdk_import_stdio_compat() -> Any:
    """Ensure SDK imports see stdout/stderr objects with an ``encoding`` attr."""
    import sys

    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = _EncodingCompatibleStream(original_stdout)
    sys.stderr = _EncodingCompatibleStream(original_stderr)
    try:
        yield
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr


def _ensure_sdk_terminal_registered() -> None:
    """Load the SDK terminal tooling only when a persona actually needs it.

    Always re-registers Rotaris's hardened terminal tool unconditionally.
    This preserves the standard runtime tool name while enforcing hard timeout
    kill semantics and clearer error surfacing for agents.
    """
    global _sdk_terminal_registered  # noqa: PLW0603
    if not _sdk_terminal_registered:
        # Importing openhands.tools.terminal triggers auto-registration of
        # terminal, delegate, task, task_tool_set, task_tracker.
        with _sdk_import_stdio_compat():
            import openhands.tools.terminal  # noqa: F401

        _sdk_terminal_registered = True

    # Always restore the hardened version — defensive against future restricted
    # registrations under the same name. Suppress the duplicate warning: the
    # overwrite is intentional and expected once the tool is first registered.
    from openhands.sdk.tool import register_tool

    from rotaris_core.tools.terminal import HardenedTerminalTool

    with _suppress_registry_duplicate_log():
        register_tool("terminal", HardenedTerminalTool)


@traces(SWR.SWR_539, SWR.SWR_540, SWR.SWR_541, SWR.SWR_542, SWR.SWR_543, SWR.SWR_544, SWR.SWR_545)
def _ensure_custom_tools_registered() -> None:
    """Register Rotaris's own tools with the SDK registry (idempotent)."""
    global _custom_tools_registered  # noqa: PLW0603
    if _custom_tools_registered:
        return

    from openhands.sdk.tool import register_tool

    from rotaris_core.tools.fetch import FetchTool
    from rotaris_core.tools.git_commit import GitCommitTool
    from rotaris_core.tools.todo import TodoTool

    register_tool("fetch", FetchTool)
    register_tool("git_commit", GitCommitTool)
    register_tool("todo", TodoTool)

    _custom_tools_registered = True


def _ensure_tools_registered(tool_names: Sequence[str]) -> None:
    _ensure_custom_tools_registered()
    if "terminal" in tool_names:
        _ensure_sdk_terminal_registered()


def _resolve_mcp_config(
    persona: PersonaConfig,
    config: RotarisConfig,
    *,
    toggle_store: MCPToggleStore | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Resolve MCP server configuration for a persona.

    Returns:
        (mcp_config_dict, warnings): The SDK-compatible MCP config and a list of
        human-readable warning strings for servers that could not be resolved.
    """
    server_names: list[str] = []
    warnings: list[str] = []

    for server_name in persona.mcp_servers:
        if server_name in config.mcp_servers and server_name not in server_names:
            server_names.append(server_name)
        elif server_name not in config.mcp_servers:
            _msg = (
                f"MCP server '{server_name}' is referenced by persona '{persona.name}' "
                "but is not configured in agents.yaml mcp_servers."
            )
            _log.warning(_msg)
            warnings.append(_msg)

    for tool_name in persona.tools:
        if tool_name not in config.mcp_servers or tool_name in server_names:
            continue
        _log.warning(
            "Persona '%s' declares MCP server '%s' in tools; treating it as an MCP server. "
            "Move it to mcp_servers to avoid resolution errors.",
            persona.name,
            tool_name,
        )
        server_names.append(tool_name)

    if not server_names:
        return {}, warnings

    from rotaris_core.tui.mcp_toggles import MCPToggleStore

    resolved_toggle_store = toggle_store if toggle_store is not None else MCPToggleStore()
    enabled_server_names: list[str] = []
    for server_name in server_names:
        if not resolved_toggle_store.is_enabled(server_name):
            _log.info("MCP server %r disabled by user toggle; skipping.", server_name)
            continue
        enabled_server_names.append(server_name)

    if not enabled_server_names:
        return {}, warnings

    available = [
        server_name
        for server_name in enabled_server_names
        if _mcp_server_is_available(
            server_name,
            config.mcp_servers[server_name],
            persona_name=persona.name,
        )
    ]

    # Servers that passed toggle + config check but failed the PATH check.
    unavailable = set(enabled_server_names) - set(available)
    for server_name in unavailable:
        _msg = (
            f"MCP server '{server_name}' (persona '{persona.name}') "
            "command not found on PATH — tools will not be available."
        )
        if _msg not in warnings:
            warnings.append(_msg)

    if not available:
        return {}, warnings

    return {
        server_name: _normalize_mcp_server_config(
            server_name,
            config.mcp_servers[server_name],
            config.workspace_root,
        )
        for server_name in available
    }, warnings


@traces(SWR.SWR_328, SWR.SWR_334, SWR.SWR_335, SWR.SWR_336)
def load_system_prompt(persona: PersonaConfig) -> str:
    if persona.system_prompt is not None:
        return persona.system_prompt
    if persona.system_prompt_file is None:
        return ""

    prompt_path = Path(persona.system_prompt_file)
    candidates = []
    if prompt_path.is_absolute():
        candidates.append(prompt_path)
    else:
        candidates.append(PROMPTS_DIR / prompt_path)
        candidates.append(PROMPTS_DIR.parent / prompt_path)
        candidates.append(PROMPTS_DIR / prompt_path.name)

    for candidate in candidates:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8")

    _log.warning(
        "System prompt file '%s' not found for persona (searched %s). Using empty prompt.",
        persona.system_prompt_file,
        [str(c) for c in candidates],
    )
    return ""


def _inject_model_family_variant(
    prompt: str,
    persona: PersonaConfig,
    model_name: str,
) -> str:
    """Append model-family-specific guidance if configured."""
    if not persona.model_family_variants:
        return prompt
    model_lower = model_name.lower()
    for family_prefix, variant_text in persona.model_family_variants.items():
        if model_lower.startswith(family_prefix.lower()):
            return f"{prompt}\n\n{variant_text}" if prompt else variant_text
    return prompt


def _apply_tool_restrictions(
    persona: PersonaConfig,
    tools: list[str],
    *,
    intent_allowed_tools: list[str] | None = None,
) -> list[str]:
    """Filter tools based on persona restrictions.

    Priority (highest first):
    1. ``intent_allowed_tools`` — when provided, the final allowed set is the
       intersection of the persona's declared tools and this list.  This
       supersedes ``coordinator_only``, ``read_only``, and ``tool_restrictions``.
    2. ``coordinator_only`` — strips to orchestration-only bundle.
    3. ``read_only`` — strips write tools.
    4. ``tool_restrictions`` — per-persona allow-list dict.
    """
    from rotaris_core.permissions import READ_ONLY_TOOLS

    read_only_tools = READ_ONLY_TOOLS
    coordinator_tools = {
        "delegate",
        "todo",
        "glob",
        "fetch",
        "haet_read",
        "read_file",
        "artifact_read",
        "artifact_list",
    }

    # Intent-based allow-list takes the highest priority (overrides coordinator_only).
    if intent_allowed_tools is not None:
        allowed_set = set(intent_allowed_tools)
        filtered = [t for t in tools if t in allowed_set]
        if len(filtered) < len(tools):
            removed = set(tools) - set(filtered)
            _log.debug(
                "Persona '%s' intent policy restricts tools; removing: %s",
                persona.name,
                removed,
            )
        return filtered

    if persona.coordinator_only:
        filtered = [t for t in tools if t in coordinator_tools]
        if len(filtered) < len(tools):
            removed = set(tools) - set(filtered)
            _log.warning(
                "Persona '%s' is coordinator-only; removing non-orchestration tools: %s",
                persona.name,
                removed,
            )
        return filtered

    # Apply read-only restriction
    if persona.read_only:
        filtered = [t for t in tools if t in read_only_tools]
        if len(filtered) < len(tools):
            removed = set(tools) - set(filtered)
            _log.warning(
                "Persona '%s' is read-only; removing write tools: %s",
                persona.name,
                removed,
            )
        return filtered

    # Apply tool_restrictions if configured
    if persona.tool_restrictions and persona.name in persona.tool_restrictions:
        allowed = persona.tool_restrictions[persona.name]
        filtered = [t for t in tools if t in allowed]
        if len(filtered) < len(tools):
            removed = set(tools) - set(filtered)
            _log.warning(
                "Persona '%s' has tool restrictions; removing: %s",
                persona.name,
                removed,
            )
        return filtered

    return tools


_MODEL_TIER_NAMES = ("small_model", "medium_model", "large_model")


@traces(SWR.SWR_386)
def _resolve_persona_model_tier(
    config: RotarisConfig,
    persona_name: str,
) -> ModelTier | None:
    """Return a persona's configured startup tier without guessing ambiguous matches."""
    recorded_tier = config.resolved_persona_model_tiers.get(persona_name)
    if recorded_tier is not None:
        return recorded_tier

    delegate = config.personas.get(persona_name)
    if delegate is None:
        return None
    if delegate.model in _MODEL_TIER_NAMES:
        return cast("ModelTier", delegate.model)

    matching_tiers = [
        tier_name
        for tier_name in _MODEL_TIER_NAMES
        if getattr(config, tier_name, None) == delegate.model
    ]
    if len(matching_tiers) == 1:
        return cast("ModelTier", matching_tiers[0])
    return None


def _implementation_owner(config: RotarisConfig, intent: str, workspace_root: str | None) -> str:
    """Persona that implements *intent*, falling back to ``coding-agent`` if unconfigured."""
    from rotaris_core.agents.playbook import implementation_owner_for_intent

    owner = implementation_owner_for_intent(intent, workspace_root)
    return owner if owner in config.personas else "coding-agent"


@traces(SWR.SWR_2416, SWR.SWR_2425)
def resolve_playbook_for_persona(
    persona_name: str,
    config: RotarisConfig,
    intent: str,
) -> PlaybookCell | None:
    """Resolve the playbook cell for *persona_name* under the run's *intent*.

    Every persona keys on its own model tier, except the orchestrator (the default
    persona), which keys on the tier of the persona that will actually implement the
    work for this intent — see ``docs/architecture/prompt-composition-matrix.md`` §2.3.

    The planner keys its self-facing slots on its own tier but its consumer-facing ones
    (task sizing, report shape) on that same implementation owner: it authors a contract
    the owner has to execute, so the contract is sized for the owner.
    """
    from rotaris_core.agents.playbook import resolve_playbook_cell

    if not intent:
        return None
    workspace_root = str(config.workspace_root) if config.workspace_root else None
    if persona_name == config.default_persona:
        owner = _implementation_owner(config, intent, workspace_root)
        return resolve_playbook_cell(
            persona_name,
            intent,
            _resolve_persona_model_tier(config, owner),
            tier_source=owner,
            workspace_root=workspace_root,
        )
    if persona_name == "planner":
        owner = _implementation_owner(config, intent, workspace_root)
        return resolve_playbook_cell(
            persona_name,
            intent,
            _resolve_persona_model_tier(config, persona_name),
            consumer_tier=_resolve_persona_model_tier(config, owner),
            consumer_source=owner,
            workspace_root=workspace_root,
        )
    return resolve_playbook_cell(
        persona_name,
        intent,
        _resolve_persona_model_tier(config, persona_name),
        workspace_root=workspace_root,
    )


def _render_prompt(
    prompt: str,
    persona: PersonaConfig,
    config: RotarisConfig,
    *,
    intent: str = "",
    run_override: str = "",
    prompt_tool_names: list[str] | None = None,
    active_mcp: list[str] | None = None,
    mcp_server_tools: dict[str, list[tuple[str, str]]] | None = None,
) -> str:
    from rotaris_core.agents.playbook import render_playbook
    from rotaris_core.agents.prompt_render import PromptRenderContext, render_system_prompt

    delegate_purposes = {
        name: config.personas[name].purpose
        for name in persona.delegates_to
        if name in config.personas
    }
    delegate_model_tiers = {
        name: _resolve_persona_model_tier(config, name) for name in persona.delegates_to
    }
    playbook = render_playbook(
        resolve_playbook_for_persona(persona.name, config, intent),
        run_override or None,
        str(config.workspace_root) if config.workspace_root else None,
    )

    resolved_active_mcp = active_mcp
    if resolved_active_mcp is None:
        resolved_active_mcp = [
            s
            for s in persona.mcp_servers
            if s in config.mcp_servers
            and _mcp_server_is_available(s, config.mcp_servers[s], persona_name=persona.name)
        ]
    resolved_mcp_tools = mcp_server_tools
    if resolved_mcp_tools is None:
        from rotaris_core.config.mcp_grants import resolve_mcp_tool_grants

        grants = resolve_mcp_tool_grants(persona, config)
        resolved_mcp_tools = {
            s: [(t.name, t.description) for t in _runtime_mcp_tools(s, config, grants)]
            for s in resolved_active_mcp
        }
    ctx = PromptRenderContext(
        persona_name=persona.name,
        model_name=persona.model,
        tools=prompt_tool_names
        if prompt_tool_names is not None
        else [TOOL_NAME_MAP.get(tool_name, tool_name) for tool_name in persona.tools],
        delegates_to=list(persona.delegates_to),
        mcp_servers=resolved_active_mcp,
        mcp_server_tools=resolved_mcp_tools,
        delegate_purposes=delegate_purposes,
        delegate_model_tiers=delegate_model_tiers,
        workspace_root=str(config.workspace_root),
        playbook=playbook,
    )
    return render_system_prompt(prompt, ctx)


def resolve_persona_runtime(
    persona: PersonaConfig,
    config: RotarisConfig,
    *,
    raw_prompt: str,
    runtime_kwargs: dict[str, Any] | None = None,
    intent: str = "",
    run_override: str = "",
    intent_allowed_tools: list[str] | None = None,
) -> ResolvedPersonaRuntime:
    restricted_tools = _apply_tool_restrictions(
        persona,
        persona.tools,
        intent_allowed_tools=intent_allowed_tools,
    )
    removed_tools = {
        tool: "tool_restriction"
        for tool in persona.tools
        if tool not in restricted_tools and tool not in config.mcp_servers
    }

    artifact_store = None
    if runtime_kwargs is not None:
        artifact_store = runtime_kwargs.get("artifact_store")
        if artifact_store is None:
            artifact_store = getattr(runtime_kwargs.get("child_manager"), "artifact_store", None)

    final_public_tools: list[str] = []
    sdk_tool_names: list[str] = []
    prompt_tool_names: list[str] = []
    for tool_name in restricted_tools:
        if tool_name in config.mcp_servers:
            continue
        if tool_name == "delegate" and runtime_kwargs is None:
            removed_tools[tool_name] = "missing_delegate_runtime"
            continue
        if tool_name == "ask_questions" and (
            runtime_kwargs is None
            or runtime_kwargs.get("user_prompt_barrier") is None
            or not callable(runtime_kwargs.get("on_questions_stored"))
        ):
            removed_tools[tool_name] = "missing_user_prompt_bridge"
            continue
        if (
            tool_name in {"artifact_read", "artifact_list", "artifact_write"}
            and artifact_store is None
        ):
            removed_tools[tool_name] = "missing_artifact_store"
            continue
        if tool_name == "artifact_write" and not persona.can_publish_artifacts:
            removed_tools[tool_name] = "artifact_write_not_enabled"
            continue
        final_public_tools.append(tool_name)
        if tool_name == "delegate":
            sdk_tool_names.extend(["delegate", "background_output", "wait_for_tasks"])
            prompt_tool_names.extend(["delegate", "background_output", "wait_for_tasks"])
            continue
        sdk_name = TOOL_NAME_MAP.get(tool_name, tool_name)
        sdk_tool_names.append(sdk_name)
        prompt_tool_names.append(sdk_name)

    from rotaris_core.config.mcp_grants import resolve_mcp_tool_grants

    mcp_config, mcp_config_warnings = _resolve_mcp_config(persona, config)
    active_mcp = list(mcp_config)
    mcp_tool_grants = resolve_mcp_tool_grants(persona, config)
    mcp_server_tools = {
        s: [(t.name, t.description) for t in _runtime_mcp_tools(s, config, mcp_tool_grants)]
        for s in active_mcp
    }
    # Detect which servers had tool discovery failures so the caller can surface them.
    mcp_discovery_failures: list[str] = []
    if active_mcp and config.workspace_root:
        from rotaris_core.config.mcp_tool_discovery import was_mcp_discovery_failed

        for _s in active_mcp:
            if was_mcp_discovery_failed(_s, config.mcp_servers[_s], config.workspace_root):
                mcp_discovery_failures.append(_s)
                _msg = (
                    f"MCP server '{_s}' (persona '{persona.name}') "
                    "tool discovery failed — tools may not appear in agent prompts."
                )
                if _msg not in mcp_config_warnings:
                    mcp_config_warnings.append(_msg)
    prompt = _render_prompt(
        raw_prompt,
        persona,
        config,
        intent=intent,
        run_override=run_override,
        prompt_tool_names=prompt_tool_names,
        active_mcp=active_mcp,
        mcp_server_tools=mcp_server_tools,
    )
    return ResolvedPersonaRuntime(
        prompt=prompt,
        public_tools=final_public_tools,
        prompt_tool_names=prompt_tool_names,
        sdk_tool_names=sdk_tool_names,
        removed_tools=removed_tools,
        mcp_config=mcp_config,
        active_mcp_servers=active_mcp,
        mcp_server_tools=mcp_server_tools,
        mcp_tool_grants=mcp_tool_grants,
        mcp_discovery_failures=mcp_discovery_failures,
        mcp_config_warnings=mcp_config_warnings,
    )


def _runtime_mcp_tools(
    server_name: str,
    config: RotarisConfig,
    grants: GrantMap | None = None,
) -> list[MCPToolInfo]:
    """Tools of *server_name* as this persona's prompt should describe them.

    Passing *grants* makes the prompt's MCP section list exactly what the scoped
    tool provider will hand the model (SWR-3009) — same resolver, two call sites,
    so prompt and runtime cannot drift apart.
    """
    from rotaris_core.config.mcp_grants import tool_is_granted
    from rotaris_core.config.mcp_tool_discovery import list_mcp_server_tools

    server_cfg = config.mcp_servers[server_name]
    tools = list_mcp_server_tools(server_name, server_cfg, config.workspace_root)
    if grants is None:
        return tools
    return [tool for tool in tools if tool_is_granted(server_name, tool.name, grants, server_cfg)]


_mcp_stderr_fix_applied = False


def _ensure_mcp_stderr_fix() -> None:
    """Work around Windows OSError 9 on sys.stderr when spawning MCP subprocesses.

    ``mcp.client.stdio.stdio_client`` uses ``anyio.open_process(..., stderr=sys.stderr)``,
    which on Windows calls ``asyncio.create_subprocess_exec`` → ``Popen._get_handles`` →
    ``msvcrt.get_osfhandle(stderr.fileno())``.  When running inside a Textual TUI (or
    other environments that redirect ``sys.stderr``), the file descriptor may be invalid
    by the time the ``anyio`` portal thread tries to spawn ``npx``, causing::

        OSError: [Errno 9] Bad file descriptor

    We monkey-patch ``mcp.client.stdio._create_platform_compatible_process`` to retry with
    ``subprocess.PIPE`` when errlog is the culprit.  We must patch
    ``mcp.client.stdio`` (not ``mcp.os.win32.utilities``) because the former imports
    ``create_windows_process`` via ``from ... import``, creating a local binding that
    does not see a module-level monkey-patch on the latter.

    The patch is idempotent.
    """
    global _mcp_stderr_fix_applied  # noqa: PLW0603
    if _mcp_stderr_fix_applied:
        return
    _mcp_stderr_fix_applied = True

    import sys as _sys

    if _sys.platform != "win32":
        return

    import subprocess as _subprocess

    import mcp.client.stdio as _stdio_mod

    _original = _stdio_mod._create_platform_compatible_process

    async def _patched_create_platform_compatible_process(
        command: str,
        args: list[str],
        env: dict[str, str] | None = None,
        errlog: TextIO = _sys.stderr,
        cwd: Path | str | None = None,
    ) -> object:
        try:
            return await _original(command, args, env=env, errlog=errlog, cwd=cwd)
        except (OSError, ValueError):
            # errlog (sys.stderr) has an unusable file descriptor.
            # Fall back to subprocess.PIPE so the MCP server can still spawn.
            return await _original(
                command, args, env=env, errlog=cast("TextIO", _subprocess.PIPE), cwd=cwd
            )

    _stdio_mod._create_platform_compatible_process = _patched_create_platform_compatible_process


@traces(SWR.SWR_2426)
def _build_runtime_tool_binding(
    runtime_kwargs: dict[str, Any] | None,
    config: RotarisConfig,
) -> RuntimeToolBinding:
    """Collect one agent's non-serialisable tool dependencies from its runtime kwargs.

    *config* travels with them because the tool registry is process-global and
    the run that registered a factory need not be the run that calls it: the
    sandbox spec, the egress allow-list and the shell timeouts all have to come
    from the run whose agent is holding the tool (SWR-2426).
    """
    if not runtime_kwargs:
        return RuntimeToolBinding(config=config)
    child_manager = runtime_kwargs.get("child_manager")
    artifact_store = runtime_kwargs.get("artifact_store")
    if artifact_store is None:
        artifact_store = getattr(child_manager, "artifact_store", None)
    return RuntimeToolBinding(
        artifact_store=artifact_store,
        child_manager=child_manager,
        scheduler=runtime_kwargs.get("scheduler"),
        agent_factory=runtime_kwargs.get("agent_factory"),
        todo_state_callback=runtime_kwargs.get("todo_state_callback"),
        gate_tools=runtime_kwargs.get("gate_tools"),
        config=config,
        user_prompt_barrier=runtime_kwargs.get("user_prompt_barrier"),
        on_questions_stored=runtime_kwargs.get("on_questions_stored"),
        response_timeout=float(runtime_kwargs.get("response_timeout", 300.0)),
    )


@traces(SWR.SWR_2501, SWR.SWR_2503, SWR.SWR_2504, SWR.SWR_2506, SWR.SWR_2508)
def _build_permission_engine(
    config: RotarisConfig,
    persona: PersonaConfig,
    runtime_kwargs: dict[str, Any] | None,
) -> PermissionEngine:
    """Build this agent's policy engine.

    Sourced from ``config`` and ``persona`` rather than ``runtime_kwargs`` so the
    entry agent — created without runtime context — is gated too.

    The active mode preset (SWR-2503) is ``persona.permission_mode`` if set,
    else the mode the session was switched to mid-run, else
    ``config.runtime.permission_mode``; an unrecognized name falls back
    to the strictest preset (see :func:`rotaris_core.permissions.resolve_preset`).
    The session override is what carries a mid-run mode change to agents built
    after it — the live ones are updated in place by
    :func:`rotaris_core.permissions.change_session_permission_mode`.
    Command-pattern rules (SWR-2502) are not yet layered in front of these
    presets.

    An ``ask`` is routed to the session's approval host (SWR-2504) when one is
    registered; without a host the resolver denies fail-safe.  The same lookup
    decides ``headless``, which only governs the fail-closed outcome for an
    unresolvable policy (``deny`` headless, ``ask`` — and therefore a prompt —
    interactive), and whether SWR-2508 downgrades a permissive mode: an
    unattended, unsandboxed run without the per-workspace opt-in gets ``ask``.

    Every decision the engine resolves is appended to the session's audit log
    (SWR-2506); the sink resolves its session directory at record time, so an
    agent built before the run bootstrap audits too, and an agent built without
    a session writes nothing.
    """
    from rotaris_core.core.path_auth import PathAuth
    from rotaris_core.permissions import (
        BrokeredApprovalResolver,
        PermissionEngine,
        SessionAuditLog,
        resolve_approval_host,
        resolve_effective_mode,
        resolve_preset,
        sandbox_active,
        session_mode_override,
    )

    kwargs = runtime_kwargs or {}
    session_id = str(kwargs.get("session_id") or "")
    agent_id = str(kwargs.get("child_canonical_name") or persona.name)
    mode_name = (
        persona.permission_mode
        or session_mode_override(session_id)
        or config.runtime.permission_mode
    )
    host = resolve_approval_host(session_id)
    effective = resolve_effective_mode(
        mode_name,
        interactive=host is not None and host.interactive,
        sandboxed=sandbox_active(config),
        opt_in=config.runtime.allow_unsandboxed_autonomous,
    )
    if effective.downgraded:
        _log.warning("Persona %r: %s", persona.name, effective.reason)
    return PermissionEngine(
        policy=resolve_preset(effective.mode),
        path_auth=PathAuth(
            Path(config.workspace_root),
            allow_outside=config.runtime.allow_outside_workspace,
        ),
        persona=persona.name,
        headless=host is None or not host.interactive,
        agent_id=agent_id,
        audit_sink=SessionAuditLog(session_id, agent_id, persona.name),
        approval_resolver=BrokeredApprovalResolver(
            session_id=session_id,
            agent_id=agent_id,
            headless_policy=config.runtime.headless_approval_policy,
            timeout=config.runtime.approval_timeout_seconds,
        ),
    )


@traces(SWR.SWR_105, SWR.SWR_115, SWR.SWR_116)
@traces(SWR.SWR_305, SWR.SWR_309, SWR.SWR_329, SWR.SWR_343)
@traces(SWR.SWR_450, SWR.SWR_501, SWR.SWR_553, SWR.SWR_2098, SWR.SWR_3004)
def create_agent_for_persona(
    persona: PersonaConfig,
    config: RotarisConfig,
    runtime_kwargs: dict[str, Any] | None = None,
) -> Callable[[LLM], Agent]:
    def factory(llm: LLM) -> Agent:
        from openhands.sdk.skills.skill import Skill

        from rotaris_core.agents.agents_md_loader import load_agents_md_content
        from rotaris_core.agents.compressor import build_context_condenser
        from rotaris_core.skills import (
            always_loaded_skills,
            format_skill_catalog,
            get_skill_catalog,
            read_always_loaded_skill_body,
        )

        _ensure_tools_registered(persona.tools)
        metadata_root = config.metadata_workspace_root or config.workspace_root
        skill_catalog = get_skill_catalog(metadata_root)
        _register_haet_tool_factories(config.workspace_root)
        _register_file_tool_factories(
            config.workspace_root,
            extra_read_roots=skill_catalog.extra_read_roots(),
        )

        system_prompt = load_system_prompt(persona)
        system_prompt = _inject_model_family_variant(
            system_prompt,
            persona,
            persona.model,
        )
        intent_allowed_tools: list[str] | None = None
        intent = ""
        run_override = ""
        if runtime_kwargs is not None:
            # The classified run intent reaches EVERY persona so each resolves its own
            # playbook cell (SWR-2416); the tool allow-list stays orchestrator-only.
            raw_intent = runtime_kwargs.get("intent")
            if isinstance(raw_intent, str):
                intent = raw_intent
            raw_override = runtime_kwargs.get("run_override")
            if isinstance(raw_override, str):
                run_override = raw_override
            if persona.name == config.default_persona:
                raw_intent_tools = runtime_kwargs.get("intent_tools")
                if isinstance(raw_intent_tools, list):
                    intent_allowed_tools = raw_intent_tools
        runtime = resolve_persona_runtime(
            persona,
            config,
            raw_prompt=system_prompt,
            runtime_kwargs=runtime_kwargs,
            intent=intent,
            run_override=run_override,
            intent_allowed_tools=intent_allowed_tools,
        )
        system_prompt = runtime.prompt

        if runtime.mcp_config_warnings and runtime_kwargs is not None:
            # Fire TUI notification callback for all MCP warnings.
            _tui_cb = runtime_kwargs.get("mcp_failure_callback")
            if callable(_tui_cb):
                for _warning in runtime.mcp_config_warnings:
                    _tui_cb(_warning)
            # Fire session-issue callback so problems appear in issues.json.
            _issue_cb = runtime_kwargs.get("mcp_issue_callback")
            if callable(_issue_cb):
                for _warning in runtime.mcp_config_warnings:
                    _issue_cb(_warning)

        tools: list[Tool] = []
        mcp_config = runtime.mcp_config

        # This agent's identity and runtime dependencies. The identity is JSON-safe
        # and rides along in each runtime-bound Tool's params; the dependencies are
        # not, so they go into the binding registry under the same key. Registered
        # factories therefore stay agent-agnostic and siblings created before their
        # conversations exist cannot inherit each other's identity (SWR-2426).
        binding_params = identity_params(persona.name, runtime_kwargs)
        binding_key = build_binding_key(runtime_kwargs, persona.name)
        register_runtime_binding(
            binding_key,
            _build_runtime_tool_binding(runtime_kwargs, config),
        )
        register_permission_engine(
            binding_key,
            _build_permission_engine(config, persona, runtime_kwargs),
        )

        for tool_name in runtime.public_tools:
            if tool_name in config.mcp_servers:
                continue
            if tool_name == "delegate" and runtime_kwargs is not None:
                # Delegate wiring is mandatory once requested: fail here rather than
                # hand the executor a None child_manager at tool-call time.
                for _required in ("child_manager", "scheduler", "agent_factory"):
                    if runtime_kwargs.get(_required) is None:
                        raise KeyError(_required)
                _register_delegate_tool_factory()
                tools.append(Tool(name="delegate", params=binding_params))
                _register_background_output_tool_factory()
                tools.append(Tool(name="background_output", params=binding_params))
                _register_wait_for_tasks_tool_factory()
                tools.append(Tool(name="wait_for_tasks", params=binding_params))
            elif tool_name == "delegate":
                _log.warning(
                    "Persona '%s' requested delegate support but was created without runtime "
                    "context; delegate tools disabled.",
                    persona.name,
                )
                continue
            elif tool_name == "ask_questions":
                assert runtime_kwargs is not None
                # Checked here so a persona that declares the tool without a
                # barrier still fails at agent build, not at question time.
                if "user_prompt_barrier" not in runtime_kwargs:
                    raise KeyError("user_prompt_barrier")
                _register_ask_questions_tool_factory()
                tools.append(Tool(name="ask_questions", params=binding_params))
            elif tool_name == "todo":
                _register_todo_tool_factory()
                tools.append(Tool(name="todo", params=binding_params))
            elif tool_name == "terminal":
                _register_terminal_tool_factory(config)
                # The identity rides along: without it the factory cannot tell
                # which run to publish live terminal frames under, or whose
                # terminal this is, and streaming silently switches itself off
                # (SWR-3618).
                tools.append(Tool(name="terminal", params=binding_params))
            elif tool_name == "fetch":
                _register_fetch_tool_factory(config)
                tools.append(Tool(name="fetch", params=binding_params))
            elif tool_name in {"grep", "glob"}:
                _register_grep_glob_tool_factories(config.workspace_root)
                tools.append(Tool(name=tool_name))
            elif tool_name in {"artifact_read", "artifact_list", "artifact_write"}:
                _register_artifact_tool_factories()
                tools.append(Tool(name=TOOL_NAME_MAP[tool_name], params=binding_params))
            else:
                tools.append(Tool(name=TOOL_NAME_MAP[tool_name]))

        for custom_tool_path in persona.custom_tools:
            from pathlib import Path as _Path

            from rotaris_core.tools.plugin_loader import load_plugin

            resolved = _Path(custom_tool_path)
            if not resolved.exists():
                _log.warning(
                    "Persona '%s': custom tool '%s' not found, skipping.",
                    persona.name,
                    custom_tool_path,
                )
                continue
            base_dir = resolved.parent
            try:
                registered_name = load_plugin(resolved, base_dir)
            except (ImportError, TypeError) as exc:
                _log.warning(
                    "Persona '%s': failed to load custom tool '%s': %s",
                    persona.name,
                    custom_tool_path,
                    exc,
                )
                continue
            tools.append(Tool(name=registered_name))

        agent_context_skills: list[Skill] = []
        if config.inject_agents_md:
            agents_md_content = load_agents_md_content(config.workspace_root)
            if agents_md_content:
                agent_context_skills.append(
                    Skill(
                        name="workspace_agents_context",
                        content=agents_md_content,
                        trigger=None,
                    ),
                )

        skill_catalog_content = format_skill_catalog(
            skill_catalog,
            enabled=config.skills.enabled,
            overrides=config.skills.overrides,
            invocation_overrides=config.skills.invocation_overrides,
        )
        if skill_catalog_content:
            agent_context_skills.append(
                Skill(
                    name="portable_skill_catalog",
                    content=skill_catalog_content,
                    trigger=None,
                ),
            )

        for skill_meta in always_loaded_skills(
            skill_catalog,
            enabled=config.skills.enabled,
            overrides=config.skills.overrides,
        ):
            try:
                body = read_always_loaded_skill_body(skill_meta.skill_file)
            except (OSError, UnicodeError) as exc:
                _log.warning("Unable to force-load skill %s: %s", skill_meta.skill_file, exc)
                continue
            # The skill's own description/trigger wording (in its SKILL.md
            # frontmatter, already stripped above) describes when it would be
            # loaded on demand. That framing doesn't apply here: this skill was
            # force-loaded, so it is unconditionally active, not gated on a
            # trigger phrase appearing in the conversation.
            content = (
                f"[{skill_meta.name}] is always active for this persona. Apply its "
                "guidance below unconditionally, right now — do not wait for a "
                "trigger phrase or ask whether it should activate.\n\n" + body
            )
            agent_context_skills.append(
                Skill(
                    name=f"portable_skill_{skill_meta.normalized_name}",
                    content=content,
                    trigger=None,
                )
            )

        # Persona-specific workspace memory (REQ-20260515-POSTRUN-IMPROVE-015):
        # inject ONLY this persona's memory; no cross-persona bleed.
        from rotaris_core.agents.persona_memory import load_persona_memory

        persona_memory_content = load_persona_memory(metadata_root, persona.name)
        if persona_memory_content:
            agent_context_skills.append(
                Skill(
                    name=f"persona_memory_{persona.name}",
                    content=persona_memory_content,
                    trigger=None,
                ),
            )

        actual_tool_names = {tool.name for tool in tools}
        advertised_missing = [
            name
            for name in runtime.sdk_tool_names
            if name not in actual_tool_names and name not in runtime.active_mcp_servers
        ]
        if advertised_missing:
            raise RuntimeError(
                f"Persona '{persona.name}' prompt/tool runtime mismatch: "
                f"advertised tools not registered: {sorted(set(advertised_missing))}",
            )

        agent_context = AgentContext(skills=agent_context_skills)

        _ensure_mcp_stderr_fix()

        condenser_callback = (
            runtime_kwargs.get("condenser_token_callback") if runtime_kwargs is not None else None
        )

        return Agent(
            llm=llm,
            tools=tools,
            mcp_config=mcp_config,
            # No built-in SDK tools (SWR-3004). The SDK already ends a run on any
            # user-visible assistant message with no tool call, so a terminal
            # completion tool is a second door to the same state — and the costly
            # one: ending on a tool call withholds ``final_response`` (SWR-2132).
            include_default_tools=[],
            agent_context=agent_context,
            condenser=build_context_condenser(
                config,
                persona.model,
                on_token_update=condenser_callback,
            ),
            system_prompt_filename=_ROTARIS_SYSTEM_PROMPT_TEMPLATE,
            system_prompt_kwargs={"persona_prompt": system_prompt},
            permission_binding_key=binding_key,
        )

    return factory
