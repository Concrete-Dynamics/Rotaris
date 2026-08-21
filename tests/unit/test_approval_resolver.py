"""Productive use: an `ask` reaches the desktop user, and never silently allows without one.
Expected outcome: an approval allows the call, everything else denies it."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.permissions import (
    HEADLESS_ABORT,
    ApprovalHost,
    ApprovalOption,
    BrokeredApprovalResolver,
    Decision,
    PermissionDecision,
    PermissionRequest,
    register_approval_host,
    reset_approval_registry,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

_REQUEST = PermissionRequest(tool_name="terminal", persona="coder", command="git push")
_PENDING = PermissionDecision(
    decision=Decision.ASK,
    rule_id="ask:mutating",
    reason="Mutating tool.",
)


@pytest.fixture(autouse=True)
def _clean_registry() -> Iterator[None]:
    reset_approval_registry()
    yield
    reset_approval_registry()


def _answering_host(option: ApprovalOption) -> ApprovalHost:
    """A host that answers every request with *option* from another thread."""
    host = ApprovalHost()

    def _present(payload: dict[str, Any]) -> None:
        request_id = str(payload["request_id"])
        threading.Thread(target=host.barrier.resolve, args=(request_id, option)).start()

    host.present = _present
    return host


@verifies(SWR.SWR_2504)
def test_approve_once_allows_without_a_session_rule() -> None:
    register_approval_host("s1", _answering_host(ApprovalOption.APPROVE_ONCE))
    resolver = BrokeredApprovalResolver(session_id="s1", agent_id="coder-1")

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.ALLOW
    assert decision.session_scoped is False


@verifies(SWR.SWR_2504)
def test_approve_for_session_asks_the_engine_for_a_session_rule() -> None:
    register_approval_host("s1", _answering_host(ApprovalOption.APPROVE_SESSION))
    resolver = BrokeredApprovalResolver(session_id="s1", agent_id="coder-1")

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.ALLOW
    assert decision.session_scoped is True


@verifies(SWR.SWR_2504)
def test_denial_keeps_the_asking_rule_in_the_reason() -> None:
    register_approval_host("s1", _answering_host(ApprovalOption.DENY))
    resolver = BrokeredApprovalResolver(session_id="s1", agent_id="coder-1")

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY
    assert decision.rule_id == "ask:mutating"
    assert "denied" in decision.reason.lower()


@verifies(SWR.SWR_2504)
def test_unanswered_request_denies_after_the_timeout() -> None:
    register_approval_host("s1", ApprovalHost(present=lambda payload: None))
    resolver = BrokeredApprovalResolver(session_id="s1", agent_id="coder-1", timeout=0.05)

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY
    assert "seconds" in decision.reason


@verifies(SWR.SWR_2504)
def test_resolved_request_is_dismissed_from_the_host() -> None:
    host = _answering_host(ApprovalOption.APPROVE_ONCE)
    dismissed: list[str] = []
    host.dismiss = dismissed.append
    register_approval_host("s1", host)

    BrokeredApprovalResolver(session_id="s1").resolve(_REQUEST, _PENDING)

    assert len(dismissed) == 1
    assert host.barrier.pending_ids() == ()


@verifies(SWR.SWR_2504)
def test_host_without_an_approval_ui_denies_fail_safe() -> None:
    register_approval_host("s1", ApprovalHost())
    resolver = BrokeredApprovalResolver(session_id="s1")

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY
    assert "no approval UI" in decision.reason


@verifies(SWR.SWR_2504)
def test_unregistered_session_denies_without_waiting() -> None:
    resolver = BrokeredApprovalResolver(session_id="never-registered", timeout=30.0)

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2504)
def test_abort_policy_stops_the_run_and_still_denies() -> None:
    aborted: list[bool] = []
    register_approval_host("s1", ApprovalHost(on_abort=lambda: aborted.append(True)))
    resolver = BrokeredApprovalResolver(session_id="s1", headless_policy=HEADLESS_ABORT)

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY
    assert aborted == [True]


@verifies(SWR.SWR_2504)
def test_presenter_failure_denies_instead_of_hanging() -> None:
    def _explode(payload: dict[str, Any]) -> None:
        raise RuntimeError("no window")

    host = ApprovalHost(present=_explode)
    register_approval_host("s1", host)
    resolver = BrokeredApprovalResolver(session_id="s1", timeout=30.0)

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY
    assert host.barrier.pending_ids() == ()


@verifies(SWR.SWR_2504)
def test_one_session_cannot_approve_another_sessions_call() -> None:
    register_approval_host("other", _answering_host(ApprovalOption.APPROVE_ONCE))
    resolver = BrokeredApprovalResolver(session_id="s1", timeout=0.05)

    decision = resolver.resolve(_REQUEST, _PENDING)

    assert decision.decision is Decision.DENY
