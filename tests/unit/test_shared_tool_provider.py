"""Unit tests for SharedMCPToolProvider's per-server post-connect wiring.

Three servers need something done to them the moment their shared client comes
up, and each wants a different failure posture: a server named ``lsp`` must be
told its root or its answers are meaningless (so a failure discards the client),
Git must be told its working directory (best effort), and Serena is already
bound at launch and only gets *checked* (SWR-2905).

``lsp`` stopped being a *default* server with SWR-2818 — Serena answers the same
questions, bound to the run's own tree — but the name is still configurable, so
the branch and these tests stay: a user who declares an ``lsp:`` server in their
``agents.yaml`` gets the same correct root they always did.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import Mock

from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS
from rotaris_core.config.schema import MCPServerConfig, PersonaConfig, RotarisConfig
from rotaris_core.mcp.scoped_tool_provider import scope_tool_provider_for_persona
from rotaris_core.mcp.session_manager import SessionMCPManager
from rotaris_core.mcp.shared_tool_provider import AggregateMCPClient, SharedMCPToolProvider
from rotaris_core.reqtocode import SWR, verifies

# The provider normalizes the workspace root through pathlib, so servers receive
# it spelled the way the host OS spells it.
_WORKSPACE_ROOT = "/workspace/root"
_EXPECTED_ROOT = str(Path(_WORKSPACE_ROOT))


@dataclass
class FakeMCPTool:
    name: str


class FakeMCPClient:
    """Minimal fake matching the MCPClient interface our wrapper needs."""

    def __init__(self, tools: list[FakeMCPTool]) -> None:
        self._closed = False
        self._tools = tools
        self._connected = True
        self.calls: list[tuple[str, dict]] = []

    def sync_close(self) -> None:
        self._closed = True

    def is_connected(self) -> bool:
        return self._connected and not self._closed

    async def connect(self) -> None:
        self._connected = True

    async def call_tool_mcp(self, name: str, arguments: dict) -> object:
        self.calls.append((name, arguments))
        return {"result": "ok"}

    def call_async_from_sync(self, fn, *args, **kwargs) -> object:
        import asyncio

        return asyncio.run(fn(*args))


@verifies(SWR.SWR_1731)
def test_create_tools_auto_inits_lsp_server(monkeypatch) -> None:
    fake_client = FakeMCPClient([FakeMCPTool(name="lsp_init"), FakeMCPTool(name="hover_info")])
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    provider.create_tools({"lsp": object()})  # type: ignore[dict-item]

    assert fake_client.calls == [("lsp_init", {"root": _EXPECTED_ROOT})]


@verifies(SWR.SWR_1731)
def test_create_tools_discards_failed_lsp_client_and_recovers_on_retry(monkeypatch, caplog) -> None:
    """Productive use: a delegated agent can use LSP after an earlier startup failure.

    Expected outcome: failed LSP tools are withheld from that child and the next
    child receives a newly initialized client.
    """
    failed_client = FakeMCPClient([FakeMCPTool(name="lsp_init")])
    healthy_client = FakeMCPClient([FakeMCPTool(name="lsp_init")])
    clients = iter([failed_client, healthy_client])

    async def fail_init(*_args, **_kwargs) -> object:
        raise RuntimeError("language server exited")

    monkeypatch.setattr(failed_client, "call_tool_mcp", fail_init)
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: next(clients),
    )
    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    with caplog.at_level(logging.ERROR):
        first_tools = provider.create_tools({"lsp": object()})  # type: ignore[dict-item]

    assert first_tools.tools == []
    assert failed_client._closed is True
    assert manager.get_or_create("lsp") is None
    assert "lsp_init call failed" in caplog.text

    second_tools = provider.create_tools({"lsp": object()})  # type: ignore[dict-item]

    assert len(second_tools.tools) == 1
    assert healthy_client.calls == [("lsp_init", {"root": _EXPECTED_ROOT})]
    assert manager.get_or_create("lsp") is not None


@verifies(SWR.SWR_1731)
def test_create_tools_auto_inits_git_working_directory(monkeypatch) -> None:
    """Productive use: an agent can use the shared Git MCP server in its workspace.

    Expected outcome: the server receives its working directory before any agent invokes
    a Git command.
    """
    fake_client = FakeMCPClient([FakeMCPTool(name="git_set_working_dir")])
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    provider = SharedMCPToolProvider(
        SessionMCPManager(),
        workspace_root=_WORKSPACE_ROOT,
    )

    provider.create_tools({"git": object()})  # type: ignore[dict-item]
    provider.create_tools({"git": object()})  # type: ignore[dict-item]

    assert fake_client.calls == [
        ("git_set_working_dir", {"path": _EXPECTED_ROOT}),
    ]


@verifies(SWR.SWR_1731)
def test_create_tools_keeps_git_available_when_working_directory_init_fails(
    monkeypatch,
    caplog,
) -> None:
    """Productive use: an agent can start even when Git MCP setup rejects its workspace.

    Expected outcome: the initialization error is reported without crashing shared MCP
    startup.
    """
    fake_client = FakeMCPClient([FakeMCPTool(name="git_set_working_dir")])

    async def fail_working_directory(*_args, **_kwargs) -> None:
        raise RuntimeError("workspace rejected")

    monkeypatch.setattr(fake_client, "call_tool_mcp", fail_working_directory)
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )
    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    with caplog.at_level(logging.ERROR):
        provider.create_tools({"git": object()})  # type: ignore[dict-item]

    assert manager.get_or_create("git") is not None
    assert "git_set_working_dir call failed" in caplog.text


@verifies(SWR.SWR_1731)
def test_default_git_server_hides_working_directory_initialization_from_agents() -> None:
    """Productive use: an agent can start Git MCP in its selected workspace.

    Expected outcome: shared startup owns the workspace setup while agents cannot change
    it mid-conversation.
    """
    assert "git_set_working_dir" in DEFAULT_MCP_SERVERS["git"].disabled_tools


@verifies(SWR.SWR_2905)
def test_create_tools_probes_the_serena_binding(monkeypatch) -> None:
    """Productive use: a run's agents rely on Serena resolving symbols in *their* tree.

    Expected outcome: shared startup asks Serena a project-scoped question, so a
    mis-binding shows up in the logs instead of as wrong symbols hours later.
    """
    fake_client = FakeMCPClient(
        [FakeMCPTool(name="list_memories"), FakeMCPTool(name="find_symbol")],
    )
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    provider = SharedMCPToolProvider(SessionMCPManager(), workspace_root=_WORKSPACE_ROOT)

    provider.create_tools({"serena": object()})  # type: ignore[dict-item]
    provider.create_tools({"serena": object()})  # type: ignore[dict-item]

    assert fake_client.calls == [("list_memories", {})], "probe once, on first connect"


@verifies(SWR.SWR_2905)
def test_a_failed_serena_probe_keeps_its_tools_available(monkeypatch, caplog) -> None:
    """Productive use: a developer whose Serena memory store is unhappy still gets
    symbol search, references and symbolic edits for the rest of the run.

    Expected outcome: the probe failure is reported, and — unlike a failed LSP init —
    the client is kept, because dropping Serena would cost the run its code
    intelligence to punish a diagnostic.
    """
    fake_client = FakeMCPClient([FakeMCPTool(name="list_memories")])

    async def fail_probe(*_args, **_kwargs) -> None:
        raise RuntimeError("no active project")

    monkeypatch.setattr(fake_client, "call_tool_mcp", fail_probe)
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )
    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    with caplog.at_level(logging.WARNING):
        tools = provider.create_tools({"serena": object()})  # type: ignore[dict-item]

    assert len(tools.tools) == 1
    assert manager.get_or_create("serena") is not None
    assert fake_client._closed is False
    assert "did not answer a project-scoped call" in caplog.text


@verifies(SWR.SWR_2905)
def test_serena_without_a_memory_tool_is_not_probed(monkeypatch) -> None:
    """Productive use: a user pins an older Serena that serves no memory tools.

    Expected outcome: startup does not invent a call it cannot make; the binding is a
    launch argument either way, and there is simply nothing here to confirm it.
    """
    fake_client = FakeMCPClient([FakeMCPTool(name="find_symbol")])
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    provider = SharedMCPToolProvider(SessionMCPManager(), workspace_root=_WORKSPACE_ROOT)

    provider.create_tools({"serena": object()})  # type: ignore[dict-item]

    assert fake_client.calls == []


@verifies(SWR.SWR_1731)
def test_create_tools_forwards_runtime_tool_change_callback(monkeypatch) -> None:
    """Productive use: an agent can receive newly discovered MCP tools mid-conversation.

    Expected outcome: the SDK's runtime tool-change callback reaches the shared MCP
    client that owns the session connection.
    """
    sdk_factory = Mock(return_value=FakeMCPClient([]))
    monkeypatch.setattr(
        "openhands.sdk.mcp.utils.create_mcp_tools",
        sdk_factory,
    )
    provider = SharedMCPToolProvider(SessionMCPManager())

    def callback(tools) -> None:
        return None

    server_spec = object()

    provider.create_tools(
        {"server": server_spec},  # type: ignore[dict-item]
        on_tools_changed=callback,
    )

    sdk_factory.assert_called_once_with(
        {"server": server_spec},
        timeout=30.0,
        on_tools_changed=callback,
    )


@verifies(SWR.SWR_1731)
def test_create_tools_skips_lsp_init_when_tool_missing(monkeypatch) -> None:
    fake_client = FakeMCPClient([FakeMCPTool(name="hover_info")])
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    provider.create_tools({"lsp": object()})  # type: ignore[dict-item]

    assert fake_client.calls == []


@verifies(SWR.SWR_1731)
def test_create_tools_skips_lsp_init_without_workspace_root(monkeypatch) -> None:
    fake_client = FakeMCPClient([FakeMCPTool(name="lsp_init")])
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager)

    provider.create_tools({"lsp": object()})  # type: ignore[dict-item]

    assert fake_client.calls == []


def _grant_config(mcp_tools: dict[str, list[str]] | None) -> tuple[PersonaConfig, RotarisConfig]:
    persona = PersonaConfig(
        name="codebase-analyst",
        model="small_model",
        mcp_servers=["serena", "git"],
        mcp_tools=mcp_tools,
    )
    config = RotarisConfig(
        mcp_servers={
            "serena": MCPServerConfig(command="uvx"),
            "git": MCPServerConfig(command="npx", disabled_tools=["git_set_working_dir"]),
        },
    )
    return persona, config


@verifies(SWR.SWR_3009)
def test_a_scoped_provider_hands_the_model_only_the_granted_tools(monkeypatch) -> None:
    """Productive use: a read-only analyst works on the tree without editing it.

    Expected outcome: the tool list the SDK receives has Serena's lookups and none
    of its editing tools, so there is nothing for the model to call.
    """
    serena = FakeMCPClient(
        [FakeMCPTool(name="find_symbol"), FakeMCPTool(name="replace_symbol_body")],
    )
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: serena,
    )
    persona, config = _grant_config({"serena": ["find_symbol"]})
    shared = SharedMCPToolProvider(SessionMCPManager(), workspace_root=_WORKSPACE_ROOT)

    scoped = shared.for_persona(persona, config)
    client = scoped.create_tools({"serena": object()})  # type: ignore[dict-item]

    assert [tool.name for tool in client.tools] == ["find_symbol"]


@verifies(SWR.SWR_3009)
def test_the_shared_client_keeps_its_whole_tool_list_so_probes_still_work(monkeypatch) -> None:
    """Productive use: Git is told its working directory even though that tool is disabled.

    Expected outcome: scoping filters only what the SDK is handed; the per-server
    client the post-connect probes read keeps every tool the server reported.
    """
    git = FakeMCPClient(
        [FakeMCPTool(name="git_set_working_dir"), FakeMCPTool(name="git_status")],
    )
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: git,
    )
    persona, config = _grant_config(None)
    manager = SessionMCPManager()
    shared = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    scoped = shared.for_persona(persona, config)
    client = scoped.create_tools({"git": object()})  # type: ignore[dict-item]

    assert git.calls == [("git_set_working_dir", {"path": _EXPECTED_ROOT})]
    assert [tool.name for tool in client.tools] == ["git_status"]
    cached = manager.get_or_create("git")
    assert cached is not None
    assert {tool.name for tool in cached.tools} == {"git_set_working_dir", "git_status"}


@verifies(SWR.SWR_3009)
def test_one_servers_open_grant_does_not_leak_anothers_withheld_tool(monkeypatch) -> None:
    """Productive use: `codebase-analyst` carries both `git` and `serena`.

    Expected outcome: `git` having no grant does not let Serena's editing tools
    through — the filter attributes every tool to the server that served it.
    """
    clients = {
        "serena": FakeMCPClient(
            [FakeMCPTool(name="find_symbol"), FakeMCPTool(name="rename_symbol")],
        ),
        "git": FakeMCPClient([FakeMCPTool(name="git_status")]),
    }
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: clients[next(iter(single_config))],
    )
    persona, config = _grant_config({"serena": ["find_symbol"]})
    shared = SharedMCPToolProvider(SessionMCPManager(), workspace_root=_WORKSPACE_ROOT)

    scoped = shared.for_persona(persona, config)
    client = scoped.create_tools({"serena": object(), "git": object()})  # type: ignore[dict-item]

    assert {tool.name for tool in client.tools} == {"find_symbol", "git_status"}


@verifies(SWR.SWR_3009)
def test_a_persona_that_narrows_nothing_gets_the_provider_unchanged() -> None:
    """Productive use: a workspace that never wrote a grant pays nothing for the feature."""
    persona = PersonaConfig(name="architect", model="small_model", mcp_servers=["tavily"])
    config = RotarisConfig(mcp_servers={"tavily": MCPServerConfig(type="http", url="http://x")})
    shared = SharedMCPToolProvider(SessionMCPManager(), workspace_root=_WORKSPACE_ROOT)

    assert shared.for_persona(persona, config) is shared


@verifies(SWR.SWR_3009)
def test_a_grant_is_enforced_without_a_session_provider(monkeypatch) -> None:
    """Productive use: a host that never built a session-scoped provider is still held to the grant.

    Expected outcome: the SDK's own provider is wrapped rather than bypassed.
    """
    created = AggregateMCPClient(
        [FakeMCPTool(name="find_symbol"), FakeMCPTool(name="rename_symbol")],  # type: ignore[list-item]
    )

    class _DefaultProvider:
        def create_tools(self, mcp_config, timeout=30.0, *, on_tools_changed=None):  # noqa: ANN001, ANN202
            return created

    monkeypatch.setattr(
        "openhands.sdk.mcp.utils.DefaultMCPToolProvider",
        _DefaultProvider,
    )
    persona, config = _grant_config({"serena": ["find_symbol"]})

    scoped = scope_tool_provider_for_persona(None, persona, config)
    assert scoped is not None
    client = scoped.create_tools({"serena": object()})  # type: ignore[dict-item]

    assert [tool.name for tool in client.tools] == ["find_symbol"]


@verifies(SWR.SWR_1731)
def test_create_tools_does_not_init_non_lsp_servers(monkeypatch) -> None:
    fake_client = FakeMCPClient([FakeMCPTool(name="lsp_init")])
    monkeypatch.setattr(
        "rotaris_core.mcp.shared_tool_provider._create_real_mcp_client",
        lambda single_config, *, timeout, on_tools_changed=None: fake_client,
    )

    manager = SessionMCPManager()
    provider = SharedMCPToolProvider(manager, workspace_root=_WORKSPACE_ROOT)

    provider.create_tools({"other": object()})  # type: ignore[dict-item]

    assert fake_client.calls == []
