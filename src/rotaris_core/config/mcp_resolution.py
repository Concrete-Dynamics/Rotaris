"""Auto-resolution of npm/uvx package names in MCP command fields."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import MCPServerConfig

_log = logging.getLogger(__name__)

# Known executables that should NEVER be auto-resolved
_KNOWN_EXECUTABLES: frozenset[str] = frozenset(
    {
        "npx",
        "npm",
        "node",
        "uvx",
        "uv",
        "pipx",
        "pip",
        "python",
        "python3",
        "deno",
        "bun",
        "docker",
        "podman",
        "bash",
        "sh",
        "zsh",
        "fish",
        "cmd",
        "powershell",
        "pwsh",
        "go",
        "cargo",
        "java",
    },
)


def _is_path(command: str) -> bool:
    """True if command looks like a filesystem path.

    Covers absolute, relative, or separator-containing paths.
    """
    if command.startswith(("/", "./", "../", "~")):
        return True
    if "\\" in command:
        return True
    return command[1:2] == ":"


def is_npm_package(command: str) -> bool:
    """True if command should be auto-resolved as an npm package."""
    if not command:
        return False
    if command.startswith("npm:"):
        return True
    return command.startswith("@")


def is_uvx_package(command: str) -> bool:
    """True if command has explicit uvx: prefix."""
    return command.startswith("uvx:")


@traces(SWR.SWR_1715, SWR.SWR_1716)
def resolve_command(command: str, args: list[str]) -> tuple[str, list[str]]:
    """Resolve an MCP command + args, expanding npm/uvx package shorthands."""
    if not command:
        return command, list(args)

    if _is_path(command):
        return command, list(args)

    if command in _KNOWN_EXECUTABLES:
        return command, list(args)

    if is_uvx_package(command):
        pkg = command[len("uvx:") :]
        if not pkg:
            return command, list(args)
        if shutil.which("uvx") is None:
            _log.warning("MCP command '%s' requires 'uvx' but it is not on PATH.", command)
        return "uvx", [pkg, *args]

    if is_npm_package(command):
        pkg = command.removeprefix("npm:")
        if not pkg:
            return command, list(args)
        if shutil.which("npx") is None:
            _log.warning("MCP command '%s' requires 'npx' but it is not on PATH.", command)
        return "npx", ["-y", pkg, *args]

    return command, list(args)


@traces(SWR.SWR_2807)
def mcp_server_is_available(
    name: str,
    cfg: MCPServerConfig,
    *,
    workspace_root: Path | None = None,
) -> bool:
    """True when *cfg* names a server this machine can actually launch.

    The single definition of "this MCP server is available": an ``http``/``sse``
    server is reachable by definition, and a ``stdio`` server is available when
    its command — *after* the npm/uvx shorthand resolution above — is on PATH.
    Checking the literal ``command`` field instead would report ``uvx:serena``
    as missing while the persona factory happily launches it as ``uvx serena``.

    It lives here, beside the resolution it depends on, rather than in
    :mod:`rotaris_core.agents.factory`, so that a caller which only needs to *ask*
    the question — the project-initialization prompt runs this on every
    workspace open — does not have to import the agent factory and the SDK
    behind it. The factory delegates here and keeps its own warn-once log.

    Args:
        name: Server name, used for the workspace-argument fill-in below.
        cfg: The configured server.
        workspace_root: Resolve the command the way a real stdio launch would,
            including the workspace argument fill-in. Only the command is
            inspected, so this never changes the answer — it keeps the check on
            the same code path as the launch it predicts.
    """
    if cfg.type in ("http", "sse"):
        return True
    raw_command = cfg.command or ""
    args = list(cfg.args)
    if workspace_root is None:
        resolved_command, _ = resolve_command(raw_command, args)
    else:
        resolved_command, _ = resolve_stdio_server_command_args(
            name,
            raw_command,
            args,
            workspace_root,
        )
    return shutil.which(resolved_command) is not None


SERENA_LAUNCH_MARKER = "start-mcp-server"
"""Argument that identifies a Serena MCP launch, whatever the server is named."""

SERENA_PROJECT_ARGUMENTS = ("--project", "--project-from-cwd")
"""Serena's own ways of naming the project; either one means "do not fill in"."""


@traces(SWR.SWR_2905)
def _bind_serena_to_workspace(args: list[str], workspace_root: Path) -> list[str]:
    """Append ``--project <workspace_root>`` to a Serena launch that lacks one.

    Rotaris knows the directory a run works in before the run starts, so Serena
    is launched already bound to it. That is not a convenience: it is what makes
    Serena drop ``activate_project`` and ``get_current_config`` from the tool set
    it advertises (its single-project mode), so no agent can spend a turn
    deciding which project it is working on — and, in an isolated session, no
    agent can bind the repository root when the run is executing in a worktree.

    The match is on Serena's launch verb rather than on the configured server
    name, for the same reason the filesystem branch below matches on its package
    name: a user may call the entry anything. A user who named the project
    themselves keeps their value.
    """
    if SERENA_LAUNCH_MARKER not in args:
        return args
    if any(argument in SERENA_PROJECT_ARGUMENTS for argument in args):
        return args
    return [*args, "--project", str(workspace_root)]


@traces(SWR.SWR_2823)
def resolve_serena_cli_command(cfg: MCPServerConfig) -> tuple[str, list[str]] | None:
    """Return the command and argument *prefix* a Serena CLI subcommand appends to.

    The deterministic project setup (SWR-2820) runs Serena's own CLI rather than
    its MCP server, and both have to be the *same* Serena — otherwise a workspace
    is indexed by one build and queried by another, and the pin SWR-2819 exists to
    guarantee holds for the server and silently not for the setup that feeds it.
    Hard-coding ``uvx --from serena-agent==<pinned>`` here would do exactly that
    to anyone who repointed the server at a checkout of their own.

    So the invocation is derived from the configured entry: the same shorthand
    expansion :func:`resolve_command` gives a launch, truncated at Serena's launch
    verb. Everything after that verb is server-only (``--context``,
    ``--transport``, ``--project``) and must not reach a CLI call. The verb is
    matched rather than the server's name, for the reason
    :func:`_bind_serena_to_workspace` gives: a user may call the entry anything.

    Returns:
        ``(command, prefix_args)`` — append the subcommand and its arguments — or
        ``None`` when this entry cannot produce a CLI call at all: a non-stdio
        server has no local executable, and an entry with no launch verb is not a
        Serena launch. The caller reports the task as unavailable rather than
        guessing at an invocation.
    """
    if cfg.type not in (None, "", "stdio"):
        return None
    raw_command = cfg.command or ""
    if not raw_command:
        return None

    resolved_command, resolved_args = resolve_command(raw_command, list(cfg.args))
    if SERENA_LAUNCH_MARKER not in resolved_args:
        return None
    return resolved_command, resolved_args[: resolved_args.index(SERENA_LAUNCH_MARKER)]


def resolve_stdio_server_command_args(
    server_name: str,
    command: str,
    args: list[str],
    workspace_root: Path,
) -> tuple[str, list[str]]:
    """Resolve an MCP stdio server command and fill known missing workspace args."""
    resolved_command, resolved_args = resolve_command(command, args)
    resolved_args = _bind_serena_to_workspace(resolved_args, workspace_root)

    filesystem_packages = {
        "@modelcontextprotocol/server-filesystem",
        "filesystem-mcp",
    }

    package_index = next(
        (index for index, arg in enumerate(resolved_args) if arg in filesystem_packages),
        None,
    )
    if package_index is None:
        return resolved_command, resolved_args

    path_args = resolved_args[package_index + 1 :]
    if not path_args:
        return resolved_command, [*resolved_args, str(workspace_root)]
    if len(path_args) == 1 and not Path(path_args[0]).exists() and server_name == "filesystem":
        _log.warning(
            "MCP server '%s' points at missing path '%s'; using workspace root '%s' instead.",
            server_name,
            path_args[0],
            workspace_root,
        )
        return resolved_command, [*resolved_args[: package_index + 1], str(workspace_root)]

    return resolved_command, resolved_args
