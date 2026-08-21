"""Productive use: after a run, an operator asks what the agent was allowed to do.
Expected outcome: the session's own diagnostics answer it — every decision in the audit
log, each denial as an issue, each human approval on the timeline, all of it counted in
the run metrics."""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ApprovalHost,
    ApprovalOption,
    BrokeredApprovalResolver,
    Decision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRequest,
    PermissionRule,
    SessionAuditLog,
    register_approval_host,
    register_audit_session,
    reset_approval_registry,
    reset_audit_registry,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import (
    build_metrics,
    initialize_session_diagnostics,
    render_summary,
)
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

SESSION_ID = "audited-session"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    reset_approval_registry()
    reset_audit_registry()
    yield
    reset_approval_registry()
    reset_audit_registry()


def _state(workspace_root: Path) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id=SESSION_ID,
        workspace_root=str(workspace_root),
        created_at=now,
        updated_at=now,
    )


def _session_dir(tmp_path: Path) -> Path:
    session_dir = tmp_path / "sessions" / SESSION_ID
    initialize_session_diagnostics(session_dir, _state(tmp_path))
    register_audit_session(SESSION_ID, session_dir)
    return session_dir


def _engine(tmp_path: Path) -> PermissionEngine:
    """An engine wired the way ``agents.factory`` wires one for a real run."""
    policy = PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-recursive-delete",
                Decision.DENY,
                tools=frozenset({"terminal"}),
                matcher=lambda command: "rm -rf" in command,
                description="recursive delete",
            ),
            PermissionRule("allow-grep", Decision.ALLOW, tools=frozenset({"grep"})),
        ),
        default_decision=Decision.ASK,
        preset_name="ask",
    )
    return PermissionEngine(
        policy=policy,
        path_auth=PathAuth(tmp_path),
        persona="coder",
        headless=False,
        agent_id="coder",
        audit_sink=SessionAuditLog(SESSION_ID, "coder", "coder"),
        approval_resolver=BrokeredApprovalResolver(
            session_id=SESSION_ID,
            agent_id="coder",
            timeout=10.0,
        ),
    )


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


@verifies(SWR.SWR_2506)
def test_a_runs_decisions_land_in_the_session_audit_log(tmp_path: Path) -> None:
    session_dir = _session_dir(tmp_path)
    engine = _engine(tmp_path)

    engine.resolve(PermissionRequest(tool_name="grep", persona="coder", arguments={"p": "TODO"}))
    engine.resolve(
        PermissionRequest(tool_name="terminal", persona="coder", command="rm -rf build"),
    )

    entries = _read_jsonl(session_dir / "evidence" / "permissions.jsonl")
    assert [(e["decision"], e["source"]) for e in entries] == [
        ("allow", "rule"),
        ("deny", "rule"),
    ]
    assert entries[1]["rule_id"] == "deny-recursive-delete"
    assert "rm -rf build" in str(entries[1]["summary"])


@verifies(SWR.SWR_2506)
def test_a_denial_is_raised_as_an_issue_pointing_at_the_audit_log(tmp_path: Path) -> None:
    session_dir = _session_dir(tmp_path)

    _engine(tmp_path).resolve(
        PermissionRequest(tool_name="terminal", persona="coder", command="rm -rf build"),
    )

    issues = json.loads((session_dir / "issues.json").read_text(encoding="utf-8"))["issues"]
    denial = next(issue for issue in issues if issue["kind"] == "permission_denied")
    assert denial["evidence_ref"] == "evidence/permissions.jsonl"
    assert denial["metadata"]["rule_id"] == "deny-recursive-delete"
    assert "rm -rf build" in denial["message"]


@verifies(SWR.SWR_2506)
def test_a_human_approval_is_visible_on_the_session_timeline(tmp_path: Path) -> None:
    session_dir = _session_dir(tmp_path)
    shown: list[dict[str, object]] = []

    def _present(payload: dict[str, object]) -> None:
        shown.append(payload)
        host.barrier.resolve(str(payload["request_id"]), ApprovalOption.APPROVE_ONCE)

    host = ApprovalHost(present=_present)
    register_approval_host(SESSION_ID, host)

    decision = _engine(tmp_path).resolve(
        PermissionRequest(tool_name="terminal", persona="coder", command="git push"),
    )

    assert decision.decision is Decision.ALLOW
    timeline = _read_jsonl(session_dir / "timeline.jsonl")
    approved = next(e for e in timeline if e["type"] == "permission_approved")
    assert approved["metadata"] == {
        "tool_name": "terminal",
        "rule_id": "approval:once",
        "source": "user-once",
        "persona": "coder",
    }
    # An allow never becomes an issue; only denials do.
    issues = json.loads((session_dir / "issues.json").read_text(encoding="utf-8"))["issues"]
    assert [issue for issue in issues if issue["kind"] == "permission_denied"] == []


@verifies(SWR.SWR_2506)
def test_the_run_metrics_and_summary_count_the_denials(tmp_path: Path) -> None:
    session_dir = _session_dir(tmp_path)
    engine = _engine(tmp_path)

    engine.resolve(PermissionRequest(tool_name="grep", persona="coder", arguments={"p": "x"}))
    engine.resolve(
        PermissionRequest(tool_name="terminal", persona="coder", command="rm -rf build"),
    )

    metrics = build_metrics(_state(tmp_path), session_dir)
    assert metrics["permission_decision_records"] == 2
    assert metrics["permission_denials"] == 1
    assert metrics["permissions_by_decision"] == {"allow": 1, "deny": 1}
    assert metrics["permissions_by_source"] == {"rule": 2}
    assert "denied by the permission policy" in render_summary(_state(tmp_path), metrics)
