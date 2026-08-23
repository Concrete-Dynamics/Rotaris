from __future__ import annotations

import logging
import sys
from importlib import import_module
from typing import TYPE_CHECKING, cast

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from typing import Protocol

    import pytest

    class _MCPResolutionModule(Protocol):
        def is_npm_package(self, command: str) -> bool: ...

        def is_uvx_package(self, command: str) -> bool: ...

        def resolve_command(self, command: str, args: list[str]) -> tuple[str, list[str]]: ...

        def resolve_serena_cli_command(
            self,
            cfg: MCPServerConfig,
        ) -> tuple[str, list[str]] | None: ...


from rotaris_core.config.defaults import (  # noqa: E402 — after the TYPE_CHECKING block
    DEFAULT_MCP_SERVERS,
)
from rotaris_core.config.schema import MCPServerConfig  # noqa: E402 — same

_mcp_resolution = cast(
    "_MCPResolutionModule",
    cast("object", import_module("rotaris_core.config.mcp_resolution")),
)


def is_npm_package(command: str) -> bool:
    return _mcp_resolution.is_npm_package(command)


def is_uvx_package(command: str) -> bool:
    return _mcp_resolution.is_uvx_package(command)


def resolve_command(command: str, args: list[str]) -> tuple[str, list[str]]:
    return _mcp_resolution.resolve_command(command, args)


def resolve_serena_cli_command(cfg: MCPServerConfig) -> tuple[str, list[str]] | None:
    return _mcp_resolution.resolve_serena_cli_command(cfg)


@verifies(SWR.SWR_1715)
def test_scoped_npm_package_resolves() -> None:
    assert resolve_command("@modelcontextprotocol/server-filesystem", []) == (
        "npx",
        ["-y", "@modelcontextprotocol/server-filesystem"],
    )


@verifies(SWR.SWR_1715)
def test_scoped_npm_package_preserves_args() -> None:
    assert resolve_command("@scope/pkg", ["/path"]) == (
        "npx",
        ["-y", "@scope/pkg", "/path"],
    )


@verifies(SWR.SWR_1715)
def test_npm_prefix_strips_prefix() -> None:
    assert resolve_command("npm:@scope/pkg", []) == ("npx", ["-y", "@scope/pkg"])


@verifies(SWR.SWR_1715)
def test_npm_prefix_unscoped() -> None:
    assert resolve_command("npm:some-pkg", []) == ("npx", ["-y", "some-pkg"])


@verifies(SWR.SWR_1716)
def test_uvx_prefix() -> None:
    assert resolve_command("uvx:computer-control-mcp", ["--flag"]) == (
        "uvx",
        ["computer-control-mcp", "--flag"],
    )


@verifies(SWR.SWR_1715)
def test_npx_unchanged() -> None:
    assert resolve_command("npx", ["-y", "@scope/pkg"]) == ("npx", ["-y", "@scope/pkg"])


@verifies(SWR.SWR_1716)
def test_uvx_unchanged() -> None:
    assert resolve_command("uvx", ["pkg"]) == ("uvx", ["pkg"])


@verifies(SWR.SWR_1715)
def test_node_unchanged() -> None:
    assert resolve_command("node", ["server.js"]) == ("node", ["server.js"])


@verifies(SWR.SWR_1716)
def test_python3_unchanged() -> None:
    assert resolve_command("python3", ["-m", "x"]) == ("python3", ["-m", "x"])


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_absolute_path_unchanged() -> None:
    assert resolve_command("/usr/bin/python3", []) == ("/usr/bin/python3", [])


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_relative_path_unchanged() -> None:
    assert resolve_command("./my-server", []) == ("./my-server", [])


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_dotdot_path_unchanged() -> None:
    assert resolve_command("../bin/server", []) == ("../bin/server", [])


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_home_path_unchanged() -> None:
    assert resolve_command("~/bin/x", []) == ("~/bin/x", [])


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_unknown_bare_name_unchanged() -> None:
    assert resolve_command("custom-binary", []) == ("custom-binary", [])


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_empty_command_returns_empty() -> None:
    assert resolve_command("", []) == ("", [])


def _missing_executable(_: str) -> None:
    return None


@verifies(SWR.SWR_1715)
def test_npx_missing_on_path_warns(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", _missing_executable)
    caplog.set_level(logging.WARNING)

    result = resolve_command("@scope/pkg", [])

    assert result == ("npx", ["-y", "@scope/pkg"])
    assert "requires 'npx' but it is not on PATH" in caplog.text


@verifies(SWR.SWR_1716)
def test_uvx_missing_on_path_warns(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", _missing_executable)
    caplog.set_level(logging.WARNING)

    result = resolve_command("uvx:computer-control-mcp", [])

    assert result == ("uvx", ["computer-control-mcp"])
    assert "requires 'uvx' but it is not on PATH" in caplog.text


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_args_list_not_mutated() -> None:
    args = ["--flag"]

    result = resolve_command("@scope/pkg", args)

    assert result == ("npx", ["-y", "@scope/pkg", "--flag"])
    assert args == ["--flag"]
    assert result[1] is not args


# ── the shared availability rule (SWR-2807) ─────────────────────────────


def _availability_helpers() -> tuple[object, object]:
    """The public rule and the agent factory's wrapper around it.

    Imported inside the helper because ``rotaris_core.agents.factory`` pulls in the
    OpenHands SDK — which is exactly the weight SWR-2807 keeps out of the public
    helper, and therefore out of every test that only needs the public one.
    """
    from rotaris_core.agents.factory import _mcp_server_is_available
    from rotaris_core.config.mcp_resolution import mcp_server_is_available

    return mcp_server_is_available, _mcp_server_is_available


def _server(**fields: object) -> object:
    from rotaris_core.config.schema import MCPServerConfig

    return MCPServerConfig(**fields)  # type: ignore[arg-type]


@verifies(SWR.SWR_2807)
def test_remote_mcp_server_is_available_without_a_local_command() -> None:
    """Productive use: a user configures a hosted MCP server and expects to use it.
    Expected outcome: an http/sse server counts as available with no launcher on PATH."""
    from rotaris_core.config.mcp_resolution import mcp_server_is_available

    assert mcp_server_is_available("serena", _server(type="http", url="https://serena.example"))
    assert mcp_server_is_available("serena", _server(type="sse", url="https://serena.example/sse"))


@verifies(SWR.SWR_2807)
def test_stdio_server_is_available_only_when_its_command_is_on_path() -> None:
    """Productive use: a user is offered only the MCP servers this machine can start.
    Expected outcome: an installed launcher counts as available; an unknown one does not."""
    import sys

    from rotaris_core.config.mcp_resolution import mcp_server_is_available

    assert mcp_server_is_available("demo", _server(command=sys.executable, args=["server.py"]))
    assert not mcp_server_is_available("demo", _server(command="definitely-not-installed-xyz"))


@verifies(SWR.SWR_2807)
def test_package_shorthand_is_resolved_before_the_path_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user writes `uvx:serena` and Rotaris offers Serena setup.
    Expected outcome: availability follows the launcher the run would really use."""
    from rotaris_core.config.mcp_resolution import mcp_server_is_available

    seen: list[str] = []

    def fake_which(command: str) -> str | None:
        seen.append(command)
        return "/usr/bin/uvx" if command == "uvx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    assert mcp_server_is_available("serena", _server(command="uvx:serena")) is True
    assert "uvx" in seen, "the literal 'uvx:serena' must never reach the PATH check"


@verifies(SWR.SWR_2807)
def test_workspace_root_does_not_change_the_answer(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Productive use: the prompt predicts a launch that also fills in workspace args.
    Expected outcome: passing the workspace keeps the availability answer identical."""
    import sys

    from rotaris_core.config.mcp_resolution import mcp_server_is_available

    for server in (
        _server(command=sys.executable),
        _server(command="definitely-not-installed-xyz"),
        _server(command="npx", args=["-y", "@modelcontextprotocol/server-filesystem"]),
    ):
        assert mcp_server_is_available("filesystem", server) == mcp_server_is_available(
            "filesystem", server, workspace_root=tmp_path
        )


@verifies(SWR.SWR_2807)
def test_persona_factory_and_public_rule_agree(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: the setup prompt and the personas see the same Serena.
    Expected outcome: the factory wrapper returns exactly the public rule's answer."""
    public_rule, factory_rule = _availability_helpers()
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda command: "/usr/bin/uvx" if command == "uvx" else None,
    )

    for server in (
        _server(command="uvx:serena"),
        _server(command="definitely-not-installed-xyz"),
        _server(type="http", url="https://serena.example"),
    ):
        assert factory_rule(  # type: ignore[operator]
            "serena", server, persona_name="project-initializer"
        ) is public_rule("serena", server)  # type: ignore[operator]


@verifies(SWR.SWR_2807)
def test_unavailable_server_is_still_reported_once_per_process(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: an operator debugging a missing tool finds one clear log line.
    Expected outcome: the factory keeps naming the persona, once per server."""
    from rotaris_core.agents import factory

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", _missing_executable)
    monkeypatch.setattr(factory, "_logged_unavailable_mcp_servers", set())
    caplog.set_level(logging.WARNING)

    server = _server(command="uvx:serena")
    for _ in range(3):
        assert (
            factory._mcp_server_is_available(  # type: ignore[arg-type]
                "serena", server, persona_name="project-initializer"
            )
            is False
        )

    assert caplog.text.count("excluding it from personas that request it") == 1
    assert "project-initializer" in caplog.text
    assert "uvx" in caplog.text, "the resolved command is what the operator must install"


# ── Serena is launched bound to the run's workspace (SWR-2905) ──────────


def _serena_args(*extra: str) -> list[str]:
    """The upstream Serena launch, as the built-in default writes it."""
    return [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "ide",
        "--transport",
        "stdio",
        *extra,
    ]


@verifies(SWR.SWR_2905)
def test_serena_launch_is_bound_to_the_workspace(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Productive use: a user starts a run and Serena comes up on the right project,
    without any agent being asked to pick one.
    Expected outcome: the launch carries `--project <workspace>`, so Serena runs in
    single-project mode and never offers `activate_project`."""
    from rotaris_core.config.mcp_resolution import resolve_stdio_server_command_args

    command, args = resolve_stdio_server_command_args(
        "serena",
        "uvx",
        _serena_args(),
        tmp_path,
    )

    assert command == "uvx"
    assert args[-2:] == ["--project", str(tmp_path)]


@verifies(SWR.SWR_2905)
def test_serena_binding_follows_the_run_workspace(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Productive use: a user runs two isolated sessions, each in its own worktree.
    Expected outcome: each launch names its own tree, so neither run resolves symbols
    against the other's — or against the repository they were branched from."""
    from rotaris_core.config.mcp_resolution import resolve_stdio_server_command_args

    first = tmp_path / "worktree-a"
    second = tmp_path / "worktree-b"

    _, first_args = resolve_stdio_server_command_args("serena", "uvx", _serena_args(), first)
    _, second_args = resolve_stdio_server_command_args("serena", "uvx", _serena_args(), second)

    assert first_args[-1] == str(first)
    assert second_args[-1] == str(second)


@verifies(SWR.SWR_2905)
def test_a_user_supplied_project_argument_is_left_alone(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Productive use: a user who pinned Serena to a project of their own keeps it.
    Expected outcome: neither `--project` nor `--project-from-cwd` is second-guessed."""
    from rotaris_core.config.mcp_resolution import resolve_stdio_server_command_args

    pinned = _serena_args("--project", "/somewhere/else")
    _, args = resolve_stdio_server_command_args("serena", "uvx", pinned, tmp_path)
    assert args == pinned

    from_cwd = _serena_args("--project-from-cwd")
    _, args = resolve_stdio_server_command_args("serena", "uvx", from_cwd, tmp_path)
    assert args == from_cwd


@verifies(SWR.SWR_2905)
def test_the_binding_is_matched_on_serenas_launch_not_on_the_server_name(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Productive use: a user names their Serena entry something else entirely.
    Expected outcome: it is still bound, because the launch verb identifies it — while
    an unrelated stdio server under any name is left untouched."""
    from rotaris_core.config.mcp_resolution import resolve_stdio_server_command_args

    _, renamed = resolve_stdio_server_command_args("code-intel", "uvx", _serena_args(), tmp_path)
    assert renamed[-2:] == ["--project", str(tmp_path)]

    _, unrelated = resolve_stdio_server_command_args(
        "serena",
        "npx",
        ["-y", "@scope/other-mcp@1.2.3"],
        tmp_path,
    )
    assert unrelated == ["-y", "@scope/other-mcp@1.2.3"]


@verifies(SWR.SWR_1715)
def test_is_npm_package_truth_table() -> None:
    assert is_npm_package("") is False
    assert is_npm_package("npm:") is True
    assert is_npm_package("npm:@scope/pkg") is True
    assert is_npm_package("@scope/pkg") is True
    assert is_npm_package("custom-binary") is False
    assert is_npm_package("uvx:computer-control-mcp") is False


@verifies(SWR.SWR_1716)
def test_is_uvx_package_truth_table() -> None:
    assert is_uvx_package("") is False
    assert is_uvx_package("uvx:") is True
    assert is_uvx_package("uvx:computer-control-mcp") is True
    assert is_uvx_package("@scope/pkg") is False
    assert is_uvx_package("npm:pkg") is False


# ---------------------------------------------------------------------------
# The CLI the deterministic setup runs (SWR-2823)


@verifies(SWR.SWR_2823, SWR.SWR_3723)
def test_serena_cli_command_uses_the_pinned_default() -> None:
    """Productive use: the Serena that indexes a project is the Serena that answers
    questions about it afterwards.

    Expected outcome: the shipped entry yields the launch prefix a subcommand appends
    to, carrying the same pin the MCP server launches with (SWR-2819)."""
    resolved = resolve_serena_cli_command(DEFAULT_MCP_SERVERS["serena"])

    assert resolved == (sys.executable, ["-m", "rotaris_core.mcp.bundled_serena"])


@verifies(SWR.SWR_2823)
def test_serena_cli_command_honours_a_repinned_workspace() -> None:
    """Productive use: a team running Serena from their own checkout indexes with that
    build rather than with the one Rotaris ships.

    Expected outcome: the override reaches the CLI invocation intact."""
    cfg = MCPServerConfig(
        type="stdio",
        command="uvx",
        args=["--from", "/opt/serena", "serena", "start-mcp-server", "--context", "ide"],
    )

    assert resolve_serena_cli_command(cfg) == ("uvx", ["--from", "/opt/serena", "serena"])


@verifies(SWR.SWR_2823)
def test_serena_cli_command_drops_server_launch_arguments() -> None:
    """Productive use: a CLI subcommand is not handed the server's transport flags.

    Expected outcome: everything from the launch verb onwards is cut, because it is
    server-only — passing `--transport stdio` to `project index` would be nonsense."""
    cfg = MCPServerConfig(
        type="stdio",
        command="uvx",
        args=[
            "--from",
            "serena-agent==1.7.0",
            "serena",
            "start-mcp-server",
            "--context",
            "ide",
            "--transport",
            "stdio",
            "--project",
            "/somewhere",
        ],
    )

    _command, prefix = resolve_serena_cli_command(cfg)

    assert prefix == ["--from", "serena-agent==1.7.0", "serena"]
    assert "--transport" not in prefix
    assert "--project" not in prefix


@verifies(SWR.SWR_2823)
def test_serena_cli_command_expands_the_uvx_shorthand() -> None:
    """Productive use: an entry written in the `uvx:` shorthand resolves for the CLI the
    same way it does for a launch.

    Expected outcome: one expansion rule, reused rather than restated."""
    cfg = MCPServerConfig(type="stdio", command="uvx:serena-agent", args=["start-mcp-server"])

    assert resolve_serena_cli_command(cfg) == ("uvx", ["serena-agent"])


@verifies(SWR.SWR_2823)
def test_serena_cli_command_is_absent_without_a_launch_verb() -> None:
    """Productive use: an entry Rotaris cannot recognise as a Serena launch yields no
    command at all, rather than a guess that would run some other program.

    Expected outcome: `None`, for a remote endpoint, an empty command, and a stdio
    command that is not launching Serena."""
    assert resolve_serena_cli_command(MCPServerConfig(type="http", url="http://x/mcp")) is None
    assert resolve_serena_cli_command(MCPServerConfig(type="stdio", command="")) is None
    assert (
        resolve_serena_cli_command(
            MCPServerConfig(type="stdio", command="uvx", args=["--from", "something-else"]),
        )
        is None
    )
