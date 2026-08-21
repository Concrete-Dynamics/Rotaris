from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig


@traces(SWR.SWR_1701)
def validate_config(config: RotarisConfig) -> list[str]:
    # Imported lazily to avoid circular imports (factory imports config).
    from rotaris_core.agents.factory import ALLOWED_PUBLIC_TOOL_NAMES
    from rotaris_core.config.project_snapshot import read_snapshot

    errors: list[str] = []
    model_names = set(config.models)
    persona_names = set(config.personas)
    mcp_server_names = set(config.mcp_servers)

    try:
        snapshot = read_snapshot()
    except Exception:
        snapshot = None

    has_providers = snapshot is not None and len(snapshot.providers) > 0
    login_hint = "Run 'rotaris-cli login' to authenticate a provider."

    if not model_names:
        errors.append(f"No models configured. {login_hint}")

    for persona_name, persona in config.personas.items():
        if persona.model not in model_names:
            errors.append(f"Persona '{persona_name}' references unknown model '{persona.model}'")
        if persona.summary_model is not None and persona.summary_model not in model_names:
            errors.append(
                "Persona "
                f"'{persona_name}' references unknown summary model '{persona.summary_model}'",
            )
        for delegate in persona.delegates_to:
            if delegate not in persona_names:
                errors.append(f"Persona '{persona_name}' delegates to unknown persona '{delegate}'")
        for mcp_server in persona.mcp_servers:
            if mcp_server not in mcp_server_names:
                errors.append(
                    f"Persona '{persona_name}' references unknown MCP server '{mcp_server}'",
                )
        # A grant for a server the persona does not carry grants nothing, silently
        # (SWR-3008); say so rather than let it read as a working restriction.
        for granted_server in persona.mcp_tools or {}:
            if granted_server not in persona.mcp_servers:
                errors.append(
                    f"Persona '{persona_name}' grants MCP tools for server "
                    f"'{granted_server}', which it does not list in mcp_servers",
                )
        seen_tools: set[str] = set()
        duplicate_tools: set[str] = set()
        for tool_name in [*persona.tools, *persona.custom_tools]:
            if tool_name in seen_tools:
                duplicate_tools.add(tool_name)
            seen_tools.add(tool_name)
        for tool_name in sorted(duplicate_tools):
            errors.append(f"Persona '{persona_name}' has duplicate tool '{tool_name}'")

        # Validate each tool name against the public allowed set.
        # MCP server names are also permitted (resolved separately).
        # Internal-only tool names (e.g. "file_viewer") are intentionally absent
        # from ALLOWED_PUBLIC_TOOL_NAMES and will be caught here.
        for tool_name in persona.tools:
            if tool_name not in ALLOWED_PUBLIC_TOOL_NAMES and tool_name not in mcp_server_names:
                errors.append(
                    f"Persona '{persona_name}' references unknown tool '{tool_name}'. "
                    f"Allowed tools: {sorted(ALLOWED_PUBLIC_TOOL_NAMES)}",
                )

    if config.default_persona not in persona_names:
        errors.append(f"Default persona '{config.default_persona}' does not exist")
    if config.default_summary_model is None:
        msg = (
            f"Default summary model is unconfigured. {login_hint}"
            if not has_providers
            else "Default summary model is unconfigured."
        )
        errors.append(msg)
    elif config.default_summary_model not in model_names:
        err_msg = f"Default summary model '{config.default_summary_model}' does not exist"
        if not has_providers and login_hint not in err_msg:
            err_msg += f". {login_hint}"
        errors.append(err_msg)
    for field_name in ("small_model", "medium_model", "large_model", "fallback_model"):
        model_name = getattr(config, field_name)
        if model_name is None:
            msg = (
                f"{field_name} is unconfigured. {login_hint}"
                if not has_providers
                else f"{field_name} is unconfigured."
            )
            errors.append(msg)
        elif model_name not in model_names:
            err_msg = f"{field_name} references unknown model '{model_name}'"
            if not has_providers:
                err_msg += f". {login_hint}"
            errors.append(err_msg)
    if config.compressor.model not in model_names:
        errors.append(f"Compressor references unknown model '{config.compressor.model}'")

    visiting: set[str] = set()
    visited: set[str] = set()

    def _visit(persona_name: str, trail: list[str]) -> None:
        if persona_name in visiting:
            cycle_start = trail.index(persona_name)
            cycle = trail[cycle_start:] + [persona_name]
            errors.append(f"Delegate cycle detected: {' -> '.join(cycle)}")
            return
        if persona_name in visited or persona_name not in config.personas:
            return

        visiting.add(persona_name)
        trail.append(persona_name)
        for delegate in config.personas[persona_name].delegates_to:
            _visit(delegate, trail)
        trail.pop()
        visiting.remove(persona_name)
        visited.add(persona_name)

    for persona_name in config.personas:
        _visit(persona_name, [])

    return errors
