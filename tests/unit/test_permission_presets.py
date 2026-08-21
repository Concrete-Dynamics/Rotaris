"""Productive use: an operator picks a named permission mode ('restricted',
'ask', 'autonomous') instead of hand-writing policy rules.
Expected outcome: each preset resolves calls exactly as SWR-2503 prescribes,
and an unrecognized mode name never resolves more permissively than the
strictest preset."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    DEFAULT_PRESET,
    FALLBACK_PRESET,
    PRESETS,
    Decision,
    PermissionEngine,
    PermissionRequest,
    resolve_preset,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _engine(tmp_path: Path, mode_name: str, *, headless: bool = True) -> PermissionEngine:
    return PermissionEngine(
        policy=resolve_preset(mode_name),
        path_auth=PathAuth(tmp_path),
        persona="coder",
        headless=headless,
    )


def _request(tool: str, **kwargs: object) -> PermissionRequest:
    return PermissionRequest(
        tool_name=tool,
        persona=str(kwargs.pop("persona", "coder")),
        arguments=kwargs.pop("arguments", {}),  # type: ignore[arg-type]
        command=kwargs.pop("command", None),  # type: ignore[arg-type]
    )


@verifies(SWR.SWR_2503)
def test_presets_expose_exactly_the_three_prescribed_modes() -> None:
    assert set(PRESETS) == {"restricted", "ask", "autonomous"}
    for name, policy in PRESETS.items():
        assert policy.preset_name == name


@verifies(SWR.SWR_2503)
def test_restricted_denies_mutating_tools_by_default(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "restricted")

    decision = engine.resolve(_request("write_file", arguments={"path": "notes.md"}))

    assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2503)
def test_restricted_allows_reads_inside_the_workspace(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "restricted")
    inside = tmp_path / "src" / "a.py"

    decision = engine.resolve(_request("read_file", arguments={"path": str(inside)}))

    assert decision.decision is Decision.ALLOW


@verifies(SWR.SWR_2503)
def test_restricted_asks_on_reads_outside_the_workspace(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "restricted", headless=False)
    outside = tmp_path.parent / "elsewhere.py"

    decision = engine.resolve(_request("read_file", arguments={"path": str(outside)}))

    # No approval resolver configured -> fail-safe deny (SWR-2504 not wired
    # yet), but the rule that produced it must be the outside-workspace read
    # rule, not the blanket default.
    assert decision.decision is Decision.DENY
    assert decision.rule_id == "restricted:read-outside-workspace"


@verifies(SWR.SWR_2503)
def test_ask_allows_read_only_tools(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "ask")

    decision = engine.resolve(_request("grep", arguments={}))

    assert decision.decision is Decision.ALLOW


@verifies(SWR.SWR_2503)
def test_ask_asks_on_mutating_tools_by_default(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "ask")

    decision = engine.resolve(_request("write_file", arguments={"path": "notes.md"}))

    # No approval resolver configured -> fail-safe deny, but only after routing
    # through the 'ask' default (never straight ALLOW).
    assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2503)
def test_autonomous_allows_inside_the_workspace_by_default(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "autonomous")
    inside = tmp_path / "src" / "a.py"

    decision = engine.resolve(_request("write_file", arguments={"path": str(inside)}))

    assert decision.decision is Decision.ALLOW


@verifies(SWR.SWR_2503)
def test_autonomous_allows_paths_outside_the_workspace(tmp_path: Path) -> None:
    # A worktree-isolated session in autonomous mode must not stall on a
    # prompt (or fail-safe deny headless) just because a path argument falls
    # outside the workspace root; the PathAuth tool layer owns that boundary.
    engine = _engine(tmp_path, "autonomous")
    outside = tmp_path.parent / "elsewhere.py"

    decision = engine.resolve(_request("write_file", arguments={"path": str(outside)}))

    assert decision.decision is Decision.ALLOW
    assert decision.rule_id == "preset:autonomous"


@verifies(SWR.SWR_2503)
def test_autonomous_carries_no_ask_rules() -> None:
    # An ask in autonomous is a bug twice over: unattended it resolves
    # fail-safe to deny, and attended it prompts the one mode the user chose
    # so as not to be prompted — inverting the SWR-2509 restrictiveness order.
    policy = resolve_preset("autonomous")

    assert all(rule.decision is not Decision.ASK for rule in policy.rules)


@verifies(SWR.SWR_2503)
def test_autonomous_still_denies_destructive_commands(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "autonomous")

    decision = engine.resolve(_request("execute_bash", command="rm -rf /"))

    assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2503)
def test_unknown_mode_name_falls_back_to_the_strictest_preset(tmp_path: Path) -> None:
    engine = _engine(tmp_path, "yolo-mode-that-does-not-exist")

    decision = engine.resolve(_request("write_file", arguments={"path": "notes.md"}))

    assert decision.decision is Decision.DENY
    assert engine.policy.preset_name == FALLBACK_PRESET == "restricted"


@verifies(SWR.SWR_2503)
def test_empty_mode_name_resolves_to_the_default_preset() -> None:
    assert resolve_preset(None).preset_name == DEFAULT_PRESET
    assert resolve_preset("").preset_name == DEFAULT_PRESET
    assert DEFAULT_PRESET == "ask"
