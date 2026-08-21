# Bug — Child agent launch fails: `mcp_config.lsp.tools` extra inputs forbidden

**Date:** 2026-07-09
**Status:** Fixed
**Severity:** High (blocks delegation to most personas)
**Affected session:** `20260709-153136-d66276c445d8` (workspace: `/home/david/dev/platform-mvp`)

---

## What happened

Two child agents — `analyze-plan01-contract-landscape` (codebase-analyst, deepseek-v4-pro) and `plan-execution-plan01-baseline` (planner, codex/gpt-5.5) — both failed before launch with the same Pydantic validation error. The orchestrator parent continued running unaware, eventually reporting the children as complete (artifacts were published from the queued-but-never-launched tasks), and the user had to interrupt.

## Error

```
pydantic_core._pydantic_core.ValidationError: 1 validation error for RotarisAgent
mcp_config.lsp.tools
  Extra inputs are not permitted [type=extra_forbidden, input_value={'lsp_hover': {'enabled':...me': 'find_references'}}, input_type=dict]
```

Full traceback from `evidence/debug.log`:

```
File ".../orchestrator/scheduler.py", line 562, in spawn_children
    agent = await asyncio.to_thread(
            ...
            )
File ".../ralph/loop.py", line 667, in _nested_child_factory
    return agent_factory(persona, nested_rk, model_override=model_override)
File ".../ralph/bootstrap.py", line 239, in agent_factory
    return factory_fn(llm)
File ".../agents/factory.py", line 898, in factory
    return Agent(
        llm=llm,
        ...
        mcp_config=mcp_config,
    )
File ".../pydantic/main.py", line 263, in __init__
    validated_self = self.__pydantic_validator__.validate_python(data, self_instance=self)
```

## Steps to reproduce

1. Configure a persona with `mcp_servers: [lsp]` (or any MCP server that has `disabled_tools` or `tool_name_map` entries)
2. Use that persona as a delegation target (any child agent not the orchestrator root)
3. Observe the child fails during `Agent(...)` construction in `agents/factory.py` line ~898
4. The orchestrator parent does not surface this error to the user; the session appears to continue but the children never ran

## What was expected

Child agents launch successfully with their MCP servers configured, including tool renames and disabled tools.

## Root cause

**`_normalize_mcp_server_config()` adds a `"tools"` key that OpenHands SDK v1.34.0 rejects.**

### The tool transforms pipeline

1. `src/rotaris_core/config/defaults.py` defines the `lsp` MCP server with:
   - `disabled_tools: [lsp_hover, lsp_completion, lsp_signature_help, lsp_health]`
   - `tool_name_map: {lsp_lsp_init: lsp_init, lsp_diagnostics: problems, lsp_definition: go_to_definition, lsp_references: find_references, ...}`

2. `_mcp_tool_transforms()` (`agents/factory.py:131`) converts these into a FastMCP tool transform dict:

   ```python
   {
       "lsp_hover": {"enabled": False},
       "lsp_lsp_init": {"name": "lsp_init"},
       ...
   }
   ```

3. `_normalize_mcp_server_config()` (`agents/factory.py:88`) adds this dict as the `"tools"` key on the server config:

   ```python
   if tool_transforms:
       normalized["tools"] = tool_transforms
   ```

4. This config is passed as `mcp_config={"lsp": {...}}` to `RotarisAgent(...)` → `Agent(...)` in the SDK.

### The SDK validation failure

In OpenHands SDK v1.34.0, `MCPServer` (`openhands/sdk/mcp/config.py:415`):

```python
class MCPServer(_MCPBaseModel):
    model_config = ConfigDict(extra="forbid")
    # Fields: url, transport, command, args, env, cwd, description, icon, timeout,
    #         sse_read_timeout, keep_alive, headers, auth
    # NO "tools" field
```

The `AgentBase.mcp_config` field (`openhands/sdk/agent/base.py:132`) is typed as `dict[str, MCPServer]` with no `BeforeValidator` that would call `coerce_mcp_config` or `drop_unknown_mcp_server_fields`. Pydantic validates each server entry directly as `MCPServer`, and `extra="forbid"` rejects any key not in `MCPServer.model_fields` — including `"tools"`.

### Why the orchestrator doesn't fail

The orchestrator persona uses `mcp_servers: [tavily]`. The `tavily` server is HTTP-based with no `disabled_tools` or `tool_name_map`, so `_mcp_tool_transforms()` returns an empty dict and the `"tools"` key is never added.

## Affected personas

All personas using MCP servers with `disabled_tools` or `tool_name_map` configured. From the session's `run_config.json`, these are blocked:

| Persona               | Uses `lsp`?            | Can launch as child? |
| --------------------- | ---------------------- | -------------------- |
| orchestrator          | No (`tavily` only)     | ✅ Yes               |
| intent-classifier     | No                     | ✅ Yes               |
| librarian             | No (`tavily` only)     | ✅ Yes               |
| ui-verifier           | No (`playwright` only) | ✅ Yes               |
| codebase-analyst      | Yes                    | ❌ No                |
| planner               | Yes                    | ❌ No                |
| architect             | Yes                    | ❌ No                |
| coding-agent          | Yes                    | ❌ No                |
| tester                | Yes                    | ❌ No                |
| docs-writer           | Yes                    | ❌ No                |
| refactorer            | Yes                    | ❌ No                |
| requirements-engineer | Yes                    | ❌ No                |
| verifier              | Yes                    | ❌ No                |

## Additional observation: pause hang

After the child launch failures, the orchestrator continued running and reading files. When the user interrupted, `conversation.pause()` timed out twice (2× 20 s), indicating the conversation was stuck waiting for the failed children to report completion:

```
WARNING rotaris_core.orchestrator.scheduler_conversation: conversation.pause() did not complete
    within 20s (pre_state={'paused': None, 'running': None, ...})
```

This is likely because the children were queued-but-never-started, yet the delegate observation returned `status='queued'` with a task_id, so the orchestrator expected them to complete and publish artifacts. The artifacts WERE published (possibly from the queuing step itself), but the children never actually ran.

## Proposed fix direction

### Short-term: don't pass `"tools"` to the SDK

In `_normalize_mcp_server_config()` (`agents/factory.py:88`), stop adding the `"tools"` key:

```python
# REMOVE:
# if tool_transforms:
#     normalized["tools"] = tool_transforms
```

This unblocks child agent launches immediately but loses tool renaming and disabling for MCP servers.

### Proper fix: handle tool transforms through the SDK's supported mechanism

1. Investigate whether OpenHands SDK v1.34.0 provides an alternative mechanism for MCP tool renaming/disabling (e.g., through the MCP plugin system, `add_mcp_config_to()`, or post-discovery tool filtering).
2. If the SDK no longer supports per-server tool transforms, implement the filtering at the Rotaris level:
   - After MCP tool discovery, filter out disabled tools by name
   - Apply renames to the discovered tool list before registering them with the agent
   - Update `prompt_render.py` to use the renamed tool names in the MCP section of the system prompt
3. Consider whether `tool_name_map` and `disabled_tools` still belong in `MCPServerConfig` or should move to a different layer.

### Related: surface child launch errors

The scheduler's `spawn_children` method (line 562 in `scheduler.py`) catches the error but the parent orchestrator doesn't receive a clear signal that the child failed. Consider:

- Recording a `child_launch_failed` diagnostic issue in `issues.json`
- Notifying the delegating agent that the child couldn't be started (rather than silently publishing an empty artifact)

## Session evidence

- Session: `/home/david/dev/platform-mvp/.rotaris/sessions/20260709-153136-d66276c445d8`
- `evidence/debug.log` — contains both stack traces and the pause timeout warnings
- `timeline.jsonl` — shows child_end events for the failed children with state `running` (incorrect)
- `issues.json` — empty (no diagnostic issues were recorded for the launch failures)
