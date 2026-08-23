"""Focused tests for the Rotaris-owned Serena launcher."""

from __future__ import annotations

import sys

import pytest

import rotaris_core.mcp.bundled_serena as bundled_serena
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_3724)
def test_installed_runtime_launches_serena_from_the_active_interpreter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a pip-installed Rotaris user starts a default Serena-backed agent.
    Expected outcome: the child uses this environment's interpreter and installed Serena module."""
    monkeypatch.delattr(sys, "frozen", raising=False)

    command, arguments = bundled_serena.resolved_command(["start-mcp-server"])

    assert command == sys.executable
    assert arguments == [
        "-m",
        "rotaris_core.mcp.bundled_serena",
        "start-mcp-server",
    ]


@verifies(SWR.SWR_3724)
def test_frozen_runtime_reenters_the_current_executable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: a standalone Rotaris user starts Serena from the installed artifact.
    Expected outcome: the frozen executable receives the internal Serena marker and server args."""
    monkeypatch.setattr(sys, "frozen", True, raising=False)

    command, arguments = bundled_serena.resolved_command(
        ["start-mcp-server", "--transport", "stdio"]
    )

    assert command == sys.executable
    assert arguments == [
        bundled_serena.SENTINEL,
        "start-mcp-server",
        "--transport",
        "stdio",
    ]


@verifies(SWR.SWR_3724)
def test_frozen_launcher_intercepts_only_the_serena_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a standalone executable serves Serena children and normal app launches.
    Expected outcome: the marker dispatches its tail while ordinary arguments continue normally."""
    calls: list[list[str]] = []
    monkeypatch.setattr(
        bundled_serena,
        "_run_serena",
        lambda arguments: calls.append(list(arguments)) or 7,
    )

    assert bundled_serena.intercept(["rotaris", "--version"]) is None
    assert (
        bundled_serena.intercept(
            ["rotaris", bundled_serena.SENTINEL, "start-mcp-server", "--transport", "stdio"]
        )
        == 7
    )
    assert calls == [["start-mcp-server", "--transport", "stdio"]]
