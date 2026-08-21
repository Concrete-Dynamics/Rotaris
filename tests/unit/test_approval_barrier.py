"""Productive use: a user answers one suspended tool call while other agents keep working.
Expected outcome: exactly the answered call resumes, and no waiting call can hang forever."""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING

from rotaris_core.core.waiting import WAIT_INDEFINITELY, wait_budget
from rotaris_core.orchestrator.user_prompt_barrier import (
    PromptResponse,
    PromptWaitStatus,
    UserPromptBarrier,
)
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


class _Conversation:
    """The only thing ``UserPromptBarrier`` asks of a conversation: a stable id."""

    def __init__(self, conversation_id: str) -> None:
        self.id = conversation_id


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


# ── how long a run may wait for the person it is asking (SWR-3625) ──────────


@verifies(SWR.SWR_3625)
def test_a_zero_budget_waits_for_the_person_instead_of_denying_at_once() -> None:
    """Productive use: a requirement released on the board raises a permission prompt
    while the user is doing something else, and answers it twenty minutes later.

    Expected outcome: the call is still waiting when they get to it. Zero used to be
    rejected by the schema, and the smallest legal budget denied the call on a timer —
    a decision made for the user by the clock.
    """
    barrier = ApprovalBarrier()
    barrier.create("patient")
    sink: list[ApprovalResponse] = []
    waiter = _wait_in_thread(barrier, "patient", sink, timeout=WAIT_INDEFINITELY)

    # Long enough that any finite budget derived from 0 would have expired.
    time.sleep(0.2)
    assert sink == [], "the wait gave up on its own"
    assert barrier.pending_ids() == ("patient",)

    assert barrier.resolve("patient", ApprovalOption.APPROVE_ONCE) is True
    waiter.join(timeout=5)
    assert sink[0].status is ApprovalWaitStatus.RESOLVED


@verifies(SWR.SWR_3625)
def test_an_indefinite_wait_is_still_released_by_cancelling_the_run() -> None:
    """Patient, not unkillable — the property that makes 'indefinitely' safe to offer.

    Productive use: a user stops a released run that is sitting on a prompt.
    Expected outcome: the run stops, rather than the stop waiting out a budget with
    no end.
    """
    barrier = ApprovalBarrier()
    barrier.create("doomed")
    sink: list[ApprovalResponse] = []
    waiter = _wait_in_thread(barrier, "doomed", sink, timeout=WAIT_INDEFINITELY)

    barrier.cancel_all()
    waiter.join(timeout=5)

    assert sink[0].status is ApprovalWaitStatus.CANCELLED


@verifies(SWR.SWR_3625)
def test_a_stated_budget_still_expires() -> None:
    """The other end of the range: a user who chose 5 minutes gets 5 minutes."""
    barrier = ApprovalBarrier()
    barrier.create("slow")

    assert barrier.wait_for_response("slow", timeout=0.05).status is ApprovalWaitStatus.TIMED_OUT


@verifies(SWR.SWR_3625)
def test_the_question_barrier_reads_a_zero_budget_the_same_way() -> None:
    """Both barriers block a run on a person; one sentinel, or 'wait for me' means two
    things depending on which one asked.

    Productive use: a released run asks a question rather than for a permission.
    Expected outcome: it waits exactly as long.
    """
    barrier = UserPromptBarrier()
    conversation = _Conversation("conv-1")
    prompt_id = barrier.create_prompt(conversation)
    sink: list[PromptResponse] = []

    def _run() -> None:
        sink.append(barrier.wait_for_response(conversation, prompt_id, WAIT_INDEFINITELY))

    waiter = threading.Thread(target=_run)
    waiter.start()
    time.sleep(0.2)
    assert sink == [], "the question gave up on its own"

    assert barrier.resolve(conversation, prompt_id, {"q1": {"answer": "yes"}}) is True
    waiter.join(timeout=5)
    assert sink[0].status is PromptWaitStatus.RESOLVED


@verifies(SWR.SWR_3625)
def test_the_budget_translation_is_stated_in_one_place() -> None:
    """A negative budget reads as indefinite too, so a bad write cannot mean 'deny now'."""
    assert wait_budget(WAIT_INDEFINITELY) is None
    assert wait_budget(-1.0) is None
    assert wait_budget(300.0) == 300.0
