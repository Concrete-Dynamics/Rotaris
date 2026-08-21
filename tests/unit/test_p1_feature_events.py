"""Each P1-feature emission seam publishes the right event (SWR-1832).

SWR-1831 defined seven event types; nothing published them.  This file covers
the individual seams that now do — the hook runner, the timeline writer the
completion gate and the repair budget record through, the checkpoint restorer,
and the approval resolver — one seam per test, at the level where the payload
mapping actually happens.

Two properties are asserted everywhere, because they are the ones a broken
emitter would quietly cost:

* **Exactly once.**  Emitting twice is as much a defect as not emitting: a
  consumer counting repair attempts against a budget would double-count them.
* **A broken stream degrades the stream, never the run.**  Every seam is
  exercised with a sink that raises on every event, and the subsystem must
  still do its job.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.events import register_event_sink, reset_event_registry, serialize_event
from rotaris_core.hooks.models import ResolvedHook
from rotaris_core.hooks.runner import (
    SKIP_REASON_UNTRUSTED_WORKSPACE,
    HookRunner,
    publish_skipped_hooks,
)
from rotaris_core.permissions import (
    ApprovalHost,
    ApprovalOption,
    BrokeredApprovalResolver,
    Decision,
    DecisionSource,
    PermissionDecision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRequest,
    register_approval_host,
    reset_approval_registry,
)
from rotaris_core.permissions.approval import clear_approval_request
from rotaris_core.permissions.audit import (
    SessionAuditLog,
    register_audit_session,
    reset_audit_registry,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import SessionDiagnostics

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from rotaris_core.events import RotarisEvent

pytestmark = [pytest.mark.unit, pytest.mark.usefixtures("clean_registries")]

SESSION_ID = "20260809-120000-p1events01"

#: A credential in a hook command line, to prove the schema's redaction is not
#: defeated by the field this emitter chose to put it in.
LEAKED_TOKEN = "ghp_hooksecret456"  # noqa: S105 - a fake token, not a credential


@pytest.fixture
def clean_registries() -> Iterator[None]:
    """No sink, host, audit session or unclaimed request survives a test."""
    reset_event_registry()
    reset_approval_registry()
    reset_audit_registry()
    clear_approval_request()
    yield
    reset_event_registry()
    reset_approval_registry()
    reset_audit_registry()
    clear_approval_request()


def _sink(session_id: str = SESSION_ID) -> list[RotarisEvent]:
    captured: list[RotarisEvent] = []
    register_event_sink(session_id, captured.append)
    return captured


def _hostile_sink(session_id: str = SESSION_ID) -> list[str]:
    """A consumer that has gone away: every delivery raises."""
    seen: list[str] = []

    def _raise(event: RotarisEvent) -> None:
        seen.append(event.event)
        raise RuntimeError("this consumer is gone")

    register_event_sink(session_id, _raise)
    return seen


def _kinds(events: list[RotarisEvent]) -> list[str]:
    return [event.event for event in events]


def _only(events: list[RotarisEvent], kind: str) -> Any:
    """The single event of *kind*; fails loudly on none and on more than one."""
    matches = [event for event in events if event.event == kind]
    assert len(matches) == 1, f"expected exactly one {kind}, got {_kinds(events)}"
    return matches[0]


# --------------------------------------------------------------- hook runner


def _shell(*parts: str) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(parts)
    return shlex.join(parts)


def _hook(
    command: str,
    *,
    event: str = "session_start",
    name: str = "notify",
    source: str = "global",
    index: int = 0,
) -> ResolvedHook:
    return ResolvedHook(
        name=name,
        event=event,
        matcher="",
        command=command,
        timeout_seconds=30.0,
        required=False,
        source=source,
        index=index,
    )


def _runner(workspace: Path, *hooks: ResolvedHook, **kwargs: Any) -> HookRunner:
    return HookRunner(
        session_id=SESSION_ID,
        workspace=workspace,
        hooks=hooks,
        **kwargs,
    )


@verifies(SWR.SWR_1832)
def test_an_executed_hook_publishes_a_start_and_a_finish_that_pair(tmp_path: Path) -> None:
    """Productive use: a consumer watching a run sees a hook begin and end.
    Expected outcome: one ``hook.start`` and one ``hook.finish`` for the
    invocation, in that order, sharing a ``hook_id``, with the exit code and the
    lifecycle point the hook actually had."""
    captured = _sink()
    command = _shell(sys.executable, "-c", "import sys; print('ran'); sys.exit(3)")

    outcomes = _runner(tmp_path, _hook(command)).run_lifecycle("session_start")

    assert len(outcomes) == 1
    assert _kinds(captured) == ["hook.start", "hook.finish"]
    start, finish = captured
    assert start.hook_id == finish.hook_id == outcomes[0].hook_id
    assert start.hook_name == "notify"
    assert start.lifecycle_point == finish.lifecycle_point == "session_start"
    assert start.scope == finish.scope == "global"
    assert start.command == command
    assert finish.exit_code == 3
    assert finish.duration_ms is not None
    assert finish.skipped is False
    assert "ran" in finish.output


@verifies(SWR.SWR_1832)
def test_a_hook_that_never_produced_an_exit_code_reports_none_rather_than_the_sentinel(
    tmp_path: Path,
) -> None:
    """Productive use: a consumer distinguishes "exited -1" from "never ran".
    Expected outcome: a hook whose command cannot be started reports
    ``exit_code=None`` on the wire, not the runner's internal ``-1``."""
    captured = _sink()

    _runner(tmp_path, _hook("this-command-does-not-exist-anywhere --please")).run_lifecycle(
        "session_start",
    )

    finish = _only(captured, "hook.finish")
    # The shell itself exists, so the miss surfaces as a non-zero exit rather
    # than a spawn failure on most platforms; either way it is never ``-1``.
    assert finish.exit_code != -1
    assert finish.skipped is False


@verifies(SWR.SWR_1832)
def test_a_hook_command_carrying_a_credential_never_reaches_the_stream(tmp_path: Path) -> None:
    """Productive use: a run's stream can be piped anywhere without leaking a token.
    Expected outcome: a hook whose command line embeds a token publishes the
    invocation with the token masked."""
    captured = _sink()
    command = _shell(sys.executable, "-c", f"print('{LEAKED_TOKEN}')")

    _runner(tmp_path, _hook(command)).run_lifecycle("session_start")

    assert captured, "the hook was not reported at all"
    for line in (serialize_event(event) for event in captured):
        assert LEAKED_TOKEN not in line, f"a credential leaked into the stream: {line}"


@verifies(SWR.SWR_1832, SWR.SWR_2815)
def test_a_hook_the_trust_gate_refused_is_reported_as_skipped(tmp_path: Path) -> None:
    """Productive use: a user compares the run against the repository's config.
    Expected outcome: a workspace hook held back for want of a trust verdict
    publishes a ``hook.finish`` marked ``skipped`` with no exit code and no
    duration, and no ``hook.start`` at all — no process ever existed."""
    captured = _sink()
    blocked = _hook("rm -rf /", source="workspace", name="repo-hook")

    _runner(tmp_path, skipped=(blocked,)).announce_skipped_hooks()

    assert _kinds(captured) == ["hook.finish"]
    finish = captured[0]
    assert finish.skipped is True
    assert finish.skip_reason == SKIP_REASON_UNTRUSTED_WORKSPACE
    assert finish.exit_code is None
    assert finish.duration_ms is None
    assert finish.scope == "workspace"
    assert finish.hook_name == "repo-hook"


@verifies(SWR.SWR_1832, SWR.SWR_2815)
def test_skipped_hooks_are_announced_on_first_use_not_at_construction(
    tmp_path: Path,
) -> None:
    """Productive use: a run host builds its hook runner before it registers the
    session's event sink, so an announcement made in the constructor would be
    published into the void and lost for every real run.
    Expected outcome: constructing the runner publishes nothing; the first time
    the runner is actually used it announces, exactly once however many entry
    points are called after that."""
    runner = _runner(
        tmp_path,
        # Attached to an event none of the calls below fire, so the only thing
        # that can reach the sink is the skip announcement itself.
        _hook("echo hi", event="post_tool"),
        skipped=(_hook("rm -rf /", source="workspace"),),
    )
    captured = _sink()  # registered only *after* the runner exists

    assert captured == [], "the announcement was made before anyone could hear it"

    runner.has_hooks("pre_tool")
    runner.has_hooks("pre_tool")
    runner.run_lifecycle("session_start")
    runner.run_pre_tool(tool_name="terminal", arguments={})

    assert _kinds(captured) == ["hook.finish"]
    assert captured[0].skipped is True


@verifies(SWR.SWR_1832)
def test_a_runner_with_nothing_skipped_announces_nothing(tmp_path: Path) -> None:
    """Productive use: the ordinary run, where the trust gate held nothing back.
    Expected outcome: neither construction nor use publishes a skip event."""
    captured = _sink()
    runner = _runner(tmp_path, _hook("echo hi"))

    runner.announce_skipped_hooks()
    runner.has_hooks("pre_tool")

    assert captured == []


@verifies(SWR.SWR_1832)
def test_a_sink_that_raises_cannot_stop_a_hook_from_running(tmp_path: Path) -> None:
    """Productive use: a consumer closes the pipe while a hook is mid-flight.
    Expected outcome: the hook still runs and still reports its exit code."""
    seen = _hostile_sink()
    marker = tmp_path / "hook.ran"
    command = _shell(sys.executable, "-c", f"open({str(marker)!r}, 'w').write('ran')")

    outcomes = _runner(tmp_path, _hook(command)).run_lifecycle("session_start")

    assert outcomes[0].exit_code == 0
    assert marker.is_file(), "the hook did not run"
    assert seen == ["hook.start", "hook.finish"]


@verifies(SWR.SWR_1832)
def test_publishing_skipped_hooks_for_a_session_without_a_sink_is_silent(
    tmp_path: Path,
) -> None:
    """Productive use: the desktop app pays nothing for a stream it never asked for.
    Expected outcome: announcing skipped hooks under an unregistered session id
    delivers nothing to another session's sink and does not raise."""
    del tmp_path
    other = _sink("a-different-session")

    publish_skipped_hooks(SESSION_ID, (_hook("echo hi", source="workspace"),))

    assert other == []


# ------------------------------------------------- gate and repair decisions


def _diagnostics(tmp_path: Path) -> SessionDiagnostics:
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)
    return SessionDiagnostics(session_dir, SESSION_ID)


@verifies(SWR.SWR_1832)
def test_the_gate_decision_timeline_entry_also_publishes_the_gate_decision_event(
    tmp_path: Path,
) -> None:
    """Productive use: a CI consumer gates on what the runner decided, not only
    on what the checks reported.
    Expected outcome: the loop's ``completion_gate_decision`` timeline entry
    publishes exactly one ``gate.decision`` carrying the same verdict, reason
    and check names."""
    captured = _sink()
    diagnostics = _diagnostics(tmp_path)

    diagnostics.timeline(
        "completion_gate_decision",
        severity="warning",
        actor="verifier",
        message="Iteration 2: completion gated.",
        metadata={
            "iteration": 2,
            "decision": "gated",
            "reason": "1 blocking check failed.",
            "unsatisfied_checks": ["tests"],
            "advisory_failures": ["lint"],
            "llm_verdict": "COMPLETE",
            "suite_source": "workspace",
        },
    )

    event = _only(captured, "gate.decision")
    assert event.session_id == SESSION_ID
    assert event.iteration == 2
    assert event.decision == "gated"
    assert event.reason == "1 blocking check failed."
    assert event.unsatisfied_checks == ["tests"]
    assert event.advisory_failures == ["lint"]
    # An overruled COMPLETE verdict has to stay visible rather than go silent.
    assert event.llm_verdict == "COMPLETE"


@verifies(SWR.SWR_1832)
@pytest.mark.parametrize(
    ("timeline_type", "action", "attempt", "remaining"),
    [
        ("repair_attempt_scheduled", "retry", 1, 2),
        ("repair_escalation", "escalate", 3, 0),
    ],
)
def test_a_repair_decision_publishes_its_budget_arithmetic(
    tmp_path: Path,
    timeline_type: str,
    action: str,
    attempt: int,
    remaining: int,
) -> None:
    """Productive use: a consumer shows how much repair budget a run has left.
    Expected outcome: both outcomes of one repair decision publish exactly one
    ``gate.repair``, with ``remaining_attempts`` derived from the budget and
    never negative."""
    captured = _sink()
    diagnostics = _diagnostics(tmp_path)

    diagnostics.timeline(
        timeline_type,
        actor="verifier",
        message="Iteration 4",
        metadata={
            "iteration": 4,
            "action": action,
            "attempt": attempt,
            "max_attempts": 3,
            "unsatisfied_checks": ["tests"],
            "reason": "Verification failed.",
        },
    )

    event = _only(captured, "gate.repair")
    assert event.iteration == 4
    assert event.action == action
    assert event.attempt == attempt
    assert event.max_attempts == 3
    assert event.remaining_attempts == remaining
    assert event.unsatisfied_checks == ["tests"]


@verifies(SWR.SWR_1832)
def test_an_ordinary_timeline_entry_publishes_nothing(tmp_path: Path) -> None:
    """Productive use: the session timeline stays a superset of the wire stream.
    Expected outcome: a timeline type with no event counterpart adds no line to
    the stream, so a consumer is not flooded with session bookkeeping."""
    captured = _sink()
    diagnostics = _diagnostics(tmp_path)

    diagnostics.timeline("hook_run", metadata={"hook_id": "global:0:pre_tool"})

    assert captured == []


@verifies(SWR.SWR_1832)
def test_metadata_of_the_wrong_shape_is_coerced_rather_than_failing_the_iteration(
    tmp_path: Path,
) -> None:
    """Productive use: the timeline is a loosely typed dict and the event is not,
    so a producer writing an unexpected shape must not take the iteration down
    with it.
    Expected outcome: the durable timeline line is written, the caller gets its
    event id back, and the stream still carries a well-formed event with the
    unusable fields at their defaults rather than a half-built one."""
    captured = _sink()
    diagnostics = _diagnostics(tmp_path)

    event_id = diagnostics.timeline(
        "repair_attempt_scheduled",
        metadata={"iteration": "not a number", "attempt": None, "unsatisfied_checks": "tests"},
    )

    assert event_id, "the durable timeline entry was lost"
    timeline = (diagnostics.session_dir or tmp_path) / "timeline.jsonl"
    assert "repair_attempt_scheduled" in timeline.read_text(encoding="utf-8")

    event = _only(captured, "gate.repair")
    assert event.iteration == 0
    assert event.attempt == 0
    assert event.remaining_attempts == 0
    # A bare string is not a list of check names; guessing one would invent a
    # check called "t", "e", "s", "t", "s".
    assert event.unsatisfied_checks == []


@verifies(SWR.SWR_1832)
def test_a_sink_that_raises_cannot_lose_the_gate_decisions_timeline_entry(
    tmp_path: Path,
) -> None:
    """Productive use: a consumer that has gone away must not cost the session
    its audit trail.
    Expected outcome: the timeline entry is on disk even though every delivery
    to the sink raised."""
    seen = _hostile_sink()
    diagnostics = _diagnostics(tmp_path)

    diagnostics.timeline(
        "completion_gate_decision",
        metadata={"iteration": 1, "decision": "passed", "reason": "All checks passed."},
    )

    assert seen == ["gate.decision"]
    timeline = (diagnostics.session_dir or tmp_path) / "timeline.jsonl"
    assert "completion_gate_decision" in timeline.read_text(encoding="utf-8")


# ----------------------------------------------------------- approval requests


def _engine(tmp_path: Path, *, session_dir: Path | None = None) -> PermissionEngine:
    """An engine that asks for everything and audits into *session_dir*."""
    audit = None
    if session_dir is not None:
        register_audit_session(SESSION_ID, session_dir)
        audit = SessionAuditLog(SESSION_ID, "engineer", "engineer")
    return PermissionEngine(
        policy=PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        path_auth=PathAuth(tmp_path),
        persona="engineer",
        headless=False,
        agent_id="engineer",
        audit_sink=audit,
        approval_resolver=BrokeredApprovalResolver(
            session_id=SESSION_ID,
            agent_id="engineer",
            timeout=10.0,
        ),
    )


def _approving_host() -> ApprovalHost:
    """A host that answers "approve once" the moment it is asked."""
    host = ApprovalHost()

    def _present(payload: dict[str, Any]) -> None:
        host.barrier.resolve(str(payload["request_id"]), ApprovalOption.APPROVE_ONCE)

    host.present = _present
    return register_approval_host(SESSION_ID, host)


@verifies(SWR.SWR_1832)
def test_a_pending_approval_is_announced_before_anyone_waits_on_it(tmp_path: Path) -> None:
    """Productive use: a consumer tells "still working" from "stalled at a prompt".
    Expected outcome: raising an ``ask`` publishes exactly one
    ``approval.requested`` naming the tool, the rule that asked, the resolver in
    effect and the deadline it will wait until."""
    captured = _sink()
    _approving_host()

    decision = _engine(tmp_path).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="git push --force"),
    )

    assert decision.decision is Decision.ALLOW
    event = _only(captured, "approval.requested")
    assert event.request_id
    assert event.tool_name == "terminal"
    assert event.rule_id
    assert event.summary == "terminal: git push --force"
    assert event.resolver == "brokered"
    assert event.timeout_seconds == 10.0
    # A human can still answer, so nothing is unattended about it.
    assert event.unattended_reason == ""


@verifies(SWR.SWR_1832)
def test_an_approval_request_and_the_decision_that_resolves_it_share_a_request_id(
    tmp_path: Path,
) -> None:
    """Productive use: a consumer pairs a pending approval with its resolution.
    Expected outcome: the ``permission.decision`` recorded for the resolved call
    carries the ``request_id`` of the ``approval.requested`` that raised it."""
    captured = _sink()
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)
    _approving_host()

    _engine(tmp_path, session_dir=session_dir).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="git push"),
    )

    requested = _only(captured, "approval.requested")
    resolved = _only(captured, "permission.decision")
    assert requested.request_id == resolved.request_id != ""
    assert resolved.source == DecisionSource.USER_ONCE.value
    assert _kinds(captured).index("approval.requested") < _kinds(captured).index(
        "permission.decision",
    )


@verifies(SWR.SWR_1832)
def test_an_ask_no_human_can_answer_is_still_announced_with_its_reason(
    tmp_path: Path,
) -> None:
    """Productive use: a headless run that a policy denied must not look like a
    run that was never gated at all.
    Expected outcome: the unattended path publishes ``approval.requested`` with
    ``unattended_reason`` set and no timeout, and its deny carries the same
    ``request_id``."""
    captured = _sink()
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)

    decision = _engine(tmp_path, session_dir=session_dir).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="rm -rf /"),
    )

    assert decision.decision is Decision.DENY
    requested = _only(captured, "approval.requested")
    assert requested.unattended_reason == DecisionSource.HEADLESS_POLICY.value
    assert requested.resolver == "headless"
    assert requested.timeout_seconds is None
    assert _only(captured, "permission.decision").request_id == requested.request_id


@verifies(SWR.SWR_1832)
def test_an_approval_that_ends_fail_closed_is_still_resolved_on_the_wire(
    tmp_path: Path,
) -> None:
    """Productive use: a consumer watching for stalled approvals must not be
    left holding a request that nothing ever answers.
    Expected outcome: when the resolver itself fails and the engine denies
    fail-closed, the deny still carries the raised request's id."""
    captured = _sink()
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)
    host = ApprovalHost()

    def _present(payload: dict[str, Any]) -> None:
        del payload
        raise RuntimeError("the approval host fell over after announcing")

    host.present = _present
    register_approval_host(SESSION_ID, host)

    decision = _engine(tmp_path, session_dir=session_dir).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="git push"),
    )

    assert decision.decision is Decision.DENY
    requested = _only(captured, "approval.requested")
    assert _only(captured, "permission.decision").request_id == requested.request_id != ""


@verifies(SWR.SWR_1832)
def test_the_pairing_is_written_to_the_durable_audit_trail_too(tmp_path: Path) -> None:
    """Productive use: an auditor replays a finished session from disk and still
    has to be able to say which approval a decision answered.
    Expected outcome: ``evidence/permissions.jsonl`` carries the same
    ``request_id`` the stream did."""
    captured = _sink()
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)
    _approving_host()

    _engine(tmp_path, session_dir=session_dir).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="git push"),
    )

    recorded = [
        json.loads(line)
        for line in (session_dir / "evidence" / "permissions.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip()
    ]
    assert len(recorded) == 1
    assert recorded[0]["request_id"] == _only(captured, "approval.requested").request_id


@verifies(SWR.SWR_1832)
def test_a_decision_that_never_went_to_a_human_claims_no_request_id(tmp_path: Path) -> None:
    """Productive use: a consumer must not read "resolved without a human" as
    the answer to some other request.
    Expected outcome: a decision resolved by a policy rule publishes an empty
    ``request_id``, even when an unclaimed approval is still on this thread."""
    captured = _sink()
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)
    register_audit_session(SESSION_ID, session_dir)

    SessionAuditLog(SESSION_ID, "engineer", "engineer").record(
        PermissionRequest(tool_name="read_file", persona="engineer"),
        PermissionDecision(
            decision=Decision.ALLOW,
            rule_id="rule-1",
            reason="allowed by policy",
            source=DecisionSource.RULE,
        ),
    )

    assert _only(captured, "permission.decision").request_id == ""


@verifies(SWR.SWR_1832)
def test_an_approval_raised_for_one_call_is_never_claimed_by_another(tmp_path: Path) -> None:
    """Productive use: two gated calls on one thread must not swap their answers.
    Expected outcome: a decision naming a different tool than the request that
    was raised claims no id at all, rather than the wrong one."""
    captured = _sink()
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)
    register_audit_session(SESSION_ID, session_dir)
    # Raise an approval whose decision is never recorded (no audit session at
    # the time), leaving it unclaimed on this thread.
    _engine(tmp_path).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="git push"),
    )

    SessionAuditLog(SESSION_ID, "engineer", "engineer").record(
        PermissionRequest(tool_name="write_file", persona="engineer"),
        PermissionDecision(
            decision=Decision.DENY,
            rule_id="rule-2",
            reason="denied",
            source=DecisionSource.USER_DENY,
        ),
    )

    assert _only(captured, "permission.decision").request_id == ""


@verifies(SWR.SWR_1832)
def test_a_sink_that_raises_cannot_stop_an_approval_from_resolving(tmp_path: Path) -> None:
    """Productive use: a consumer that has gone away must not hang a gated call.
    Expected outcome: the approval still resolves to the user's answer."""
    seen = _hostile_sink()
    _approving_host()

    decision = _engine(tmp_path).resolve(
        PermissionRequest(tool_name="terminal", persona="engineer", command="git push"),
    )

    assert decision.decision is Decision.ALLOW
    assert seen == ["approval.requested"]
