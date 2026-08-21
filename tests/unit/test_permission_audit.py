"""Productive use: an operator reviews what an agent was allowed and refused to do.
Expected outcome: every decision is appended to the session's audit log with the rule
and resolution that produced it, and no credential ever reaches the file."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ALLOW_ALL_POLICY,
    Decision,
    DecisionSource,
    PermissionEngine,
    PermissionPolicy,
    PermissionRequest,
    PermissionRule,
    SessionAuditLog,
    register_audit_session,
    reset_audit_registry,
    resolve_audit_session,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _clean_audit_registry() -> Iterator[None]:
    reset_audit_registry()
    yield
    reset_audit_registry()


def _engine(
    tmp_path: Path,
    policy: PermissionPolicy,
    *,
    session_id: str = "session-1",
    agent_id: str = "coder",
) -> PermissionEngine:
    return PermissionEngine(
        policy=policy,
        path_auth=PathAuth(tmp_path),
        persona="coder",
        headless=True,
        agent_id=agent_id,
        audit_sink=SessionAuditLog(session_id, agent_id, "coder"),
    )


def _request(tool: str = "terminal", **kwargs: object) -> PermissionRequest:
    return PermissionRequest(
        tool_name=tool,
        persona="coder",
        arguments=kwargs.pop("arguments", {}),  # type: ignore[arg-type]
        command=kwargs.pop("command", None),  # type: ignore[arg-type]
    )


def _entries(session_dir: Path) -> list[dict[str, object]]:
    path = session_dir / "evidence" / "permissions.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _deny_everything() -> PermissionPolicy:
    return PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-terminal",
                Decision.DENY,
                tools=frozenset({"terminal"}),
                description="terminal is off limits",
            ),
        ),
        default_decision=Decision.DENY,
        preset_name="restricted",
    )


@verifies(SWR.SWR_2506)
def test_each_decision_is_appended_with_its_rule_and_source(tmp_path: Path) -> None:
    session_dir = tmp_path / "session"
    register_audit_session("session-1", session_dir)
    engine = _engine(tmp_path, _deny_everything())

    engine.resolve(_request(command="rm -rf /"))
    engine.resolve(_request(tool="grep", arguments={"pattern": "TODO"}))

    denied, defaulted = _entries(session_dir)
    assert denied["decision"] == "deny"
    assert denied["rule_id"] == "deny-terminal"
    assert denied["source"] == DecisionSource.RULE.value
    assert denied["tool_name"] == "terminal"
    assert denied["agent_id"] == "coder"
    assert denied["session_id"] == "session-1"
    assert "rm -rf /" in str(denied["summary"])
    assert "terminal is off limits" in str(denied["reason"])

    # No rule covers grep, so the preset's own default decided it.
    assert defaulted["decision"] == "deny"
    assert defaulted["source"] == DecisionSource.PRESET.value
    assert defaulted["rule_id"] == "preset:restricted"


@verifies(SWR.SWR_2506)
def test_a_loop_control_tool_is_recorded_as_a_builtin_allow(tmp_path: Path) -> None:
    session_dir = tmp_path / "session"
    register_audit_session("session-1", session_dir)

    _engine(tmp_path, _deny_everything()).resolve(_request(tool="finish"))

    entry = _entries(session_dir)[0]
    assert entry["decision"] == "allow"
    assert entry["source"] == DecisionSource.BUILTIN.value


@verifies(SWR.SWR_2506)
def test_credentials_are_masked_in_commands_and_arguments(tmp_path: Path) -> None:
    """The audit log outlives the run, so a secret written here is a lasting leak."""
    session_dir = tmp_path / "session"
    register_audit_session("session-1", session_dir)
    engine = _engine(tmp_path, ALLOW_ALL_POLICY)

    engine.resolve(_request(command="curl -H 'Authorization: Bearer sk-live-42' https://api.test"))
    engine.resolve(_request(tool="http", arguments={"api_key": "sk-live-42", "url": "https://a"}))

    written = (session_dir / "evidence" / "permissions.jsonl").read_text(encoding="utf-8")
    assert "sk-live-42" not in written
    assert "***" in written
    # The call stays judgeable: the program and its harmless arguments survive.
    assert "curl" in written
    assert "https://a" in written


@verifies(SWR.SWR_2506)
def test_two_agents_of_one_session_share_an_append_only_log(tmp_path: Path) -> None:
    session_dir = tmp_path / "session"
    register_audit_session("session-1", session_dir)

    _engine(tmp_path, ALLOW_ALL_POLICY, agent_id="coder").resolve(_request(command="ls"))
    _engine(tmp_path, ALLOW_ALL_POLICY, agent_id="reviewer").resolve(_request(command="cat x"))
    _engine(tmp_path, ALLOW_ALL_POLICY, agent_id="coder").resolve(_request(command="git status"))

    entries = _entries(session_dir)
    assert [entry["agent_id"] for entry in entries] == ["coder", "reviewer", "coder"]
    assert [str(entry["summary"]).split(": ", 1)[1] for entry in entries] == [
        "ls",
        "cat x",
        "git status",
    ]


@verifies(SWR.SWR_2506)
def test_a_session_nobody_registered_writes_nothing(tmp_path: Path) -> None:
    """Unit tests and one-off agents run without a session directory on disk."""
    assert resolve_audit_session("session-1") is None

    decision = _engine(tmp_path, ALLOW_ALL_POLICY).resolve(_request(command="ls"))

    assert decision.decision is Decision.ALLOW
    assert not (tmp_path / "session").exists()


@verifies(SWR.SWR_2506)
def test_another_sessions_directory_is_never_used(tmp_path: Path) -> None:
    other_dir = tmp_path / "other-session"
    register_audit_session("session-2", other_dir)

    _engine(tmp_path, ALLOW_ALL_POLICY, session_id="session-1").resolve(_request(command="ls"))

    assert _entries(other_dir) == []


@verifies(SWR.SWR_2506)
def test_an_unwritable_audit_log_does_not_break_dispatch(tmp_path: Path) -> None:
    """Auditing is evidence, not a gate: a failing write must not deny or raise."""
    blocked = tmp_path / "blocked"
    blocked.write_text("not a directory", encoding="utf-8")
    register_audit_session("session-1", blocked)

    decision = _engine(tmp_path, ALLOW_ALL_POLICY).resolve(_request(command="ls"))

    assert decision.decision is Decision.ALLOW
