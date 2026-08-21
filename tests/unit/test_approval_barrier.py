"""Productive use: a user answers one suspended tool call while other agents keep working.
Expected outcome: exactly the answered call resumes, and no waiting call can hang forever."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from rotaris_core.permissions import (
    ApprovalBarrier,
    ApprovalOption,
    ApprovalRequestPayload,
    ApprovalWaitStatus,
    Decision,
    PermissionDecision,
    PermissionRequest,
    redact_secrets,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from rotaris_core.permissions import ApprovalResponse


def _wait_in_thread(
    barrier: ApprovalBarrier,
    request_id: str,
    sink: list[ApprovalResponse],
    timeout: float = 5.0,
) -> threading.Thread:
    def _run() -> None:
        sink.append(barrier.wait_for_response(request_id, timeout))

    thread = threading.Thread(target=_run)
    thread.start()
    return thread


@verifies(SWR.SWR_2504)
def test_approval_resolves_only_the_answered_request() -> None:
    barrier = ApprovalBarrier()
    barrier.create("first")
    barrier.create("second")
    first_result: list[ApprovalResponse] = []
    second_result: list[ApprovalResponse] = []
    first = _wait_in_thread(barrier, "first", first_result)
    second = _wait_in_thread(barrier, "second", second_result)

    assert barrier.resolve("first", ApprovalOption.APPROVE_ONCE) is True
    first.join(timeout=5)

    assert first_result[0].status is ApprovalWaitStatus.RESOLVED
    assert first_result[0].option is ApprovalOption.APPROVE_ONCE
    # The sibling is still blocked on its own decision.
    assert second_result == []
    assert barrier.pending_ids() == ("second",)

    barrier.cancel_all()
    second.join(timeout=5)
    assert second_result[0].status is ApprovalWaitStatus.CANCELLED


@verifies(SWR.SWR_2504)
def test_unanswered_approval_times_out_instead_of_hanging() -> None:
    barrier = ApprovalBarrier()
    barrier.create("slow")

    response = barrier.wait_for_response("slow", timeout=0.05)

    assert response.status is ApprovalWaitStatus.TIMED_OUT
    assert barrier.pending_ids() == ()


@verifies(SWR.SWR_2504)
def test_waiting_on_an_unknown_request_returns_immediately() -> None:
    barrier = ApprovalBarrier()

    response = barrier.wait_for_response("never-created", timeout=30.0)

    assert response.status is ApprovalWaitStatus.CANCELLED
    assert barrier.resolve("never-created", ApprovalOption.APPROVE_ONCE) is False


@verifies(SWR.SWR_2504)
def test_cancelled_approval_reports_cancellation() -> None:
    barrier = ApprovalBarrier()
    barrier.create("doomed")
    sink: list[ApprovalResponse] = []
    waiter = _wait_in_thread(barrier, "doomed", sink)

    assert barrier.cancel("doomed") is True
    waiter.join(timeout=5)

    assert sink[0].status is ApprovalWaitStatus.CANCELLED


@verifies(SWR.SWR_2504)
def test_payload_masks_credentials_and_names_the_requester() -> None:
    request = PermissionRequest(
        tool_name="terminal",
        persona="coder",
        command="curl -H 'Authorization: Bearer sk-live-42' --token=hunter2 https://api.example",
    )
    pending = PermissionDecision(
        decision=Decision.ASK,
        rule_id="ask:mutating",
        reason="Mutating tool.",
    )

    payload = ApprovalRequestPayload.from_request(
        request_id="req-1",
        session_id="session-9",
        agent_id="coder-1",
        request=request,
        pending=pending,
    ).to_payload()

    assert payload["agent_id"] == "coder-1"
    assert payload["persona"] == "coder"
    assert payload["rule_id"] == "ask:mutating"
    assert "sk-live-42" not in payload["command"]
    assert "hunter2" not in payload["command"]
    # The command itself stays readable, so the user can judge the call.
    assert "curl" in payload["command"]
    assert "https://api.example" in payload["command"]


@verifies(SWR.SWR_2504)
def test_secret_arguments_are_masked_by_name() -> None:
    request = PermissionRequest(
        tool_name="haet_write",
        persona="coder",
        arguments={"path": "src/app.py", "api_key": "sk-live-42"},
    )
    pending = PermissionDecision(Decision.ASK, "ask:mutating", "Mutating tool.")

    payload = ApprovalRequestPayload.from_request(
        request_id="req-2",
        session_id="session-9",
        agent_id="coder-1",
        request=request,
        pending=pending,
    ).to_payload()

    assert "src/app.py" in payload["argument_summary"]
    assert "sk-live-42" not in payload["argument_summary"]


@verifies(SWR.SWR_2504)
def test_redaction_leaves_ordinary_commands_untouched() -> None:
    assert redact_secrets("git commit -m 'ship it'") == "git commit -m 'ship it'"
