"""Unit tests for the versioned event schema (SWR-1829)."""

from __future__ import annotations

import json
from typing import Any, get_args

import pytest
from pydantic import ValidationError

import rotaris_core.events
from rotaris_core.events import (
    EVENT_SCHEMA_VERSION,
    AnyEvent,
    ApprovalRequestedEvent,
    CheckpointCreatedEvent,
    CheckpointRestoredEvent,
    ChildCompleteEvent,
    ChildSpawnEvent,
    ChildTransitionEvent,
    ErrorEvent,
    GateDecisionEvent,
    GateRepairEvent,
    HookFinishEvent,
    HookStartEvent,
    IterationEndEvent,
    IterationStartEvent,
    PermissionDecisionEvent,
    ResultEvent,
    RotarisEvent,
    SessionEndEvent,
    SessionStartEvent,
    ToolFinishEvent,
    ToolStartEvent,
    TranscriptRowEvent,
    UsageUpdateEvent,
    VerifierProgressEvent,
    VerifierResultEvent,
    parse_event,
    redact_arguments,
    serialize_event,
)
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit

#: Derived from the union rather than hand-listed, so a new event class that is
#: wired into ``AnyEvent`` is automatically round-tripped by the tests below.
UNION_EVENT_TYPES: tuple[type[RotarisEvent], ...] = get_args(get_args(AnyEvent)[0])

#: The P1 feature types added by SWR-1831, asserted individually below so the
#: round-trip guarantee is proven per type rather than only in aggregate.
P1_FEATURE_EVENT_TYPES: tuple[type[RotarisEvent], ...] = (
    HookStartEvent,
    HookFinishEvent,
    CheckpointCreatedEvent,
    CheckpointRestoredEvent,
    GateDecisionEvent,
    GateRepairEvent,
    ApprovalRequestedEvent,
)


def _sample(event_type: type[RotarisEvent]) -> RotarisEvent:
    """Build a fully populated instance of *event_type* for round-trip checks."""
    payloads: dict[type[RotarisEvent], dict[str, Any]] = {
        SessionStartEvent: {
            "task": "ship the stream",
            "workspace": "/repo",
            "persona": "developer",
            "permission_mode": "acceptEdits",
            "sandboxed": True,
            "max_iterations": 12,
        },
        SessionEndEvent: {
            "status": "succeeded",
            "stop_reason": "task_complete",
            "iterations_completed": 3,
            "duration_seconds": 41.5,
            "tokens": {"prompt_tokens": 10, "completion_tokens": 4},
            "cost": {"total_cost": 0.02, "source": "provider"},
        },
        IterationStartEvent: {"iteration": 2, "task": "fix the failing test"},
        IterationEndEvent: {"iteration": 2, "outcome": "progress", "summary": "one test fixed"},
        ChildSpawnEvent: {"child_id": "c-1", "agent_name": "reviewer", "task": "review diff"},
        ChildTransitionEvent: {"child_id": "c-1", "from_state": "running", "to_state": "completed"},
        ChildCompleteEvent: {
            "child_id": "c-1",
            "report": {"status": "succeeded", "summary": "done", "verifier_results": None},
        },
        ToolStartEvent: {
            "tool_name": "bash",
            "call_id": "call-7",
            "arguments": {"command": "pytest -q"},
        },
        ToolFinishEvent: {
            "tool_name": "bash",
            "call_id": "call-7",
            "status": "ok",
            "duration_ms": 12.5,
            "error": None,
        },
        PermissionDecisionEvent: {
            "request_id": "req-9",
            "tool_name": "bash",
            "decision": "allow",
            "source": "rule",
            "rule_id": "preset:read-only",
            "summary": "bash: ls -la",
        },
        VerifierResultEvent: {
            "iteration": 2,
            "passed": True,
            "checks": [{"name": "pytest", "passed": True}],
            "summary": "1 check passed",
        },
        VerifierProgressEvent: {
            "iteration": 2,
            "phase": "check_started",
            "check": "pytest",
            "index": 1,
            "total": 3,
            "status": "",
            "elapsed_s": 0.0,
            "deadline_s": 600.0,
        },
        TranscriptRowEvent: {
            "index": 7,
            "row": {
                "role": "agent",
                "name": "implementer-2",
                "persona": "coder",
                "content": "I fixed the failing assertion in test_parser.",
                "ts": "12:00:00",
            },
        },
        UsageUpdateEvent: {
            "tokens": {"prompt_tokens": 99},
            "cost": {"total_cost": 0.5},
        },
        ErrorEvent: {
            "message": "provider unreachable",
            "error_class": "ConnectionError",
            "detail": "retry 3 of 3",
            "fatal": True,
        },
        ResultEvent: {"result": {"status": "succeeded", "exit_code": 0}},
        HookStartEvent: {
            "hook_id": "workspace:0:pre_tool",
            "hook_name": "guard-writes",
            "lifecycle_point": "pre_tool",
            "scope": "workspace",
            "tool_name": "bash",
            "command": "scripts/guard.sh --strict",
        },
        HookFinishEvent: {
            "hook_id": "workspace:0:pre_tool",
            "hook_name": "guard-writes",
            "lifecycle_point": "pre_tool",
            "scope": "workspace",
            "tool_name": "bash",
            "exit_code": 2,
            "duration_ms": 31.5,
            "blocked": True,
            "timed_out": False,
            "skipped": False,
            "skip_reason": "",
            "output": "refusing to touch build artifacts",
        },
        CheckpointCreatedEvent: {
            "sequence": 4,
            "ref": "refs/rotaris/checkpoints/s-1/4",
            "kind": "iteration",
            "iteration": 3,
            "changed_paths": 7,
        },
        CheckpointRestoredEvent: {
            "sequence": 2,
            "restored": True,
            "safety_sequence": 5,
            "changed_paths": 3,
            "blocked_reason": "",
        },
        GateDecisionEvent: {
            "iteration": 3,
            "decision": "gated",
            "reason": "1 blocking check did not pass",
            "unsatisfied_checks": ["pytest"],
            "advisory_failures": ["ruff"],
            "llm_verdict": "COMPLETE",
        },
        GateRepairEvent: {
            "iteration": 3,
            "action": "retry",
            "attempt": 1,
            "max_attempts": 3,
            "remaining_attempts": 2,
            "unsatisfied_checks": ["pytest"],
            "reason": "retrying with the failing checks injected",
        },
        ApprovalRequestedEvent: {
            "request_id": "req-9",
            "agent_name": "implementer-2",
            "persona": "coder",
            "tool_name": "bash",
            "rule_id": "ask:write",
            "summary": "bash: rm -rf build",
            "resolver": "brokered",
            "timeout_seconds": 300.0,
            "unattended_reason": "",
        },
    }
    return event_type(session_id="s-1", **payloads[event_type])


@verifies(SWR.SWR_1829, SWR.SWR_1831)
def test_every_event_type_has_a_sample_payload() -> None:
    """Productive use: a maintainer adding an event type cannot skip its round-trip test.
    Expected outcome: the sample table covers exactly the union, so a new class fails here."""
    covered = {
        SessionStartEvent,
        SessionEndEvent,
        IterationStartEvent,
        IterationEndEvent,
        ChildSpawnEvent,
        ChildTransitionEvent,
        ChildCompleteEvent,
        ToolStartEvent,
        ToolFinishEvent,
        PermissionDecisionEvent,
        VerifierResultEvent,
        VerifierProgressEvent,
        TranscriptRowEvent,
        UsageUpdateEvent,
        ErrorEvent,
        ResultEvent,
        HookStartEvent,
        HookFinishEvent,
        CheckpointCreatedEvent,
        CheckpointRestoredEvent,
        GateDecisionEvent,
        GateRepairEvent,
        ApprovalRequestedEvent,
    }
    assert set(UNION_EVENT_TYPES) == covered


@verifies(SWR.SWR_1829, SWR.SWR_1831)
def test_every_event_class_is_re_exported_from_the_package() -> None:
    """Productive use: a downstream unit imports every event type from rotaris_core.events.
    Expected outcome: no event class exists in the union but is missing from the public surface."""
    exported = set(rotaris_core.events.__all__)
    assert {event_type.__name__ for event_type in UNION_EVENT_TYPES} <= exported
    for name in exported:
        assert getattr(rotaris_core.events, name, None) is not None


@verifies(SWR.SWR_1829, SWR.SWR_1831)
def test_minimum_event_coverage_is_present() -> None:
    """Productive use: an integrator can rely on every mandated event type existing.
    Expected outcome: the union carries each discriminator SWR-1829 and SWR-1831 require."""
    discriminators = {event_type().event for event_type in UNION_EVENT_TYPES}
    assert discriminators == {
        "session.start",
        "session.end",
        "iteration.start",
        "iteration.end",
        "child.spawn",
        "child.transition",
        "child.complete",
        "tool.start",
        "tool.finish",
        "permission.decision",
        "verifier.result",
        "verifier.progress",
        "transcript.row",
        "usage.update",
        "error",
        "result",
        "hook.start",
        "hook.finish",
        "checkpoint.created",
        "checkpoint.restored",
        "gate.decision",
        "gate.repair",
        "approval.requested",
    }


@verifies(SWR.SWR_1829, SWR.SWR_1831)
@pytest.mark.parametrize("event_type", UNION_EVENT_TYPES, ids=lambda t: t.__name__)
def test_event_round_trips_through_a_jsonl_line(event_type: type[RotarisEvent]) -> None:
    """Productive use: a stream consumer can rebuild the exact event from one JSONL line.
    Expected outcome: serialize -> json.loads -> parse_event returns an equal model."""
    original = _sample(event_type)
    reparsed = parse_event(json.loads(serialize_event(original)))
    assert reparsed == original
    assert type(reparsed) is event_type


@verifies(SWR.SWR_1829, SWR.SWR_1831)
@pytest.mark.parametrize("event_type", UNION_EVENT_TYPES, ids=lambda t: t.__name__)
def test_every_event_carries_the_shared_envelope(event_type: type[RotarisEvent]) -> None:
    """Productive use: a consumer can key off the envelope without knowing the payload.
    Expected outcome: schema_version, event, timestamp and session_id are on every line."""
    payload = json.loads(serialize_event(_sample(event_type)))
    assert payload["schema_version"] == EVENT_SCHEMA_VERSION
    assert payload["event"] == event_type().event
    assert payload["session_id"] == "s-1"
    assert payload["timestamp"].startswith("20")
    assert payload["timestamp"].endswith("+00:00")


@verifies(SWR.SWR_1829)
def test_schema_version_is_independent_of_the_session_snapshot_version() -> None:
    """Productive use: a maintainer can bump the wire format without rewriting session files.
    Expected outcome: the event schema exposes its own integer version constant."""
    assert isinstance(EVENT_SCHEMA_VERSION, int)
    assert EVENT_SCHEMA_VERSION == 1
    assert SessionStartEvent(session_id="s").schema_version == EVENT_SCHEMA_VERSION


@verifies(SWR.SWR_1829)
def test_multiline_payload_still_serializes_to_exactly_one_line() -> None:
    """Productive use: a consumer can split the stream on newlines and never lose an event.
    Expected outcome: an event whose payload embeds line breaks yields a single JSONL line."""
    detail = "Traceback:\n  line one\r\n  line two\u2028 line three"
    event = ErrorEvent(
        session_id="s-1",
        message="boom",
        error_class="RuntimeError",
        detail=detail,
        fatal=False,
    )
    line = serialize_event(event)
    assert "\n" not in line
    assert "\r" not in line
    # U+2028 is a line break to several JSON readers; ensure_ascii must escape it too.
    assert "\u2028" not in line
    assert len(line.splitlines()) == 1
    reparsed = parse_event(json.loads(line))
    assert isinstance(reparsed, ErrorEvent)
    assert reparsed.detail == detail


@verifies(SWR.SWR_1829)
def test_tool_start_masks_a_token_hidden_inside_an_argument_value() -> None:
    """Productive use: an operator can pipe the stream to a log without leaking a credential.
    Expected outcome: a GitHub token embedded in a tool argument never reaches the wire."""
    event = ToolStartEvent(
        session_id="s-1",
        tool_name="bash",
        call_id="c-1",
        arguments={"env": "GITHUB_TOKEN=ghp_realvalue123"},
    )
    dumped = event.model_dump_json()
    assert "ghp_realvalue123" not in dumped
    assert "ghp_" not in dumped
    assert "GITHUB_TOKEN" in dumped
    assert "ghp_realvalue123" not in serialize_event(event)


@verifies(SWR.SWR_1829)
def test_tool_start_redaction_cannot_be_bypassed_by_assignment() -> None:
    """Productive use: a caller cannot re-introduce a secret after constructing the event.
    Expected outcome: assigning raw arguments re-runs the redaction validator."""
    event = ToolStartEvent(session_id="s-1", tool_name="bash", call_id="c-1")
    event.arguments = {"api_key": "sk-livesecret", "note": "sk_livesecret2"}
    assert "sk-livesecret" not in serialize_event(event)
    assert "sk_livesecret2" not in serialize_event(event)


@verifies(SWR.SWR_1829)
def test_permission_decision_summary_is_redacted() -> None:
    """Productive use: an auditor reads which tool ran without reading its password.
    Expected outcome: a flag value in the decision summary is masked on the wire."""
    event = PermissionDecisionEvent(
        session_id="s-1",
        tool_name="bash",
        decision="deny",
        source="rule",
        rule_id="deny:secrets",
        summary="bash: deploy --password hunter2",
    )
    line = serialize_event(event)
    assert "hunter2" not in line
    assert "--password" in line
    assert "deploy" in line


@verifies(SWR.SWR_1829)
def test_redact_arguments_masks_secret_keys_and_clips_long_values() -> None:
    """Productive use: an operator sees enough of a call to judge it, never the secret.
    Expected outcome: secret-looking keys are masked and long values are truncated."""
    redacted = redact_arguments(
        {"authorization": "Bearer abc", "token": "x", "content": "a" * 500, "count": 7},
    )
    assert redacted["authorization"] == "***"
    assert redacted["token"] == "***"
    assert redacted["count"] == "7"
    assert len(redacted["content"]) == 241
    assert redacted["content"].endswith("…")


@verifies(SWR.SWR_1829)
def test_redact_arguments_is_idempotent() -> None:
    """Productive use: re-validating an event on parse must not corrupt its arguments.
    Expected outcome: redacting already-redacted arguments returns them unchanged."""
    once = redact_arguments(
        {"env": "GITHUB_TOKEN=ghp_realvalue123", "cmd": "ls", "body": "a" * 500},
    )
    assert redact_arguments(once) == once
    assert redact_arguments(redact_arguments(once)) == once


@verifies(SWR.SWR_1829)
def test_redaction_leaves_ordinary_values_readable() -> None:
    """Productive use: a debugging operator can still read the command that ran.
    Expected outcome: non-secret values pass through untouched, including near-misses."""
    redacted = redact_arguments({"command": "task-force build", "path": "src/app.py"})
    assert redacted["command"] == "task-force build"
    assert redacted["path"] == "src/app.py"


@verifies(SWR.SWR_1829)
def test_serialize_event_emits_sorted_compact_json() -> None:
    """Productive use: a diffing consumer gets byte-stable lines for equal events.
    Expected outcome: keys are sorted and no whitespace padding is emitted."""
    line = serialize_event(IterationStartEvent(session_id="s-1", iteration=1, task="go"))
    assert ", " not in line
    assert ": " not in line
    keys = list(json.loads(line))
    assert keys == sorted(keys)


@verifies(SWR.SWR_1829)
def test_serialize_event_survives_non_string_keys_in_a_payload() -> None:
    """Productive use: a report blob with integer keys must not break the stream mid-run.
    Expected outcome: mapping keys are coerced to strings instead of raising."""
    event = ChildCompleteEvent(session_id="s-1", child_id="c-1", report={"counts": {1: "a"}})
    payload = json.loads(serialize_event(event))
    assert payload["report"]["counts"] == {"1": "a"}


@verifies(SWR.SWR_1829)
def test_parse_event_rejects_an_unknown_event_type() -> None:
    """Productive use: a consumer detects a stream it cannot interpret instead of guessing.
    Expected outcome: an unknown discriminator raises a validation error."""
    with pytest.raises(ValidationError):
        parse_event({"schema_version": 1, "event": "not.a.real.event", "session_id": "s"})


@verifies(SWR.SWR_1829)
def test_parse_event_ignores_fields_added_by_a_newer_producer() -> None:
    """Productive use: a pinned consumer keeps working against a newer Rotaris build.
    Expected outcome: unknown payload fields are ignored rather than rejected."""
    parsed = parse_event(
        {
            "schema_version": 1,
            "event": "iteration.start",
            "timestamp": "2026-08-07T00:00:00+00:00",
            "session_id": "s-1",
            "iteration": 4,
            "task": "go",
            "future_field": "from a later version",
        },
    )
    assert isinstance(parsed, IterationStartEvent)
    assert parsed.iteration == 4


@verifies(SWR.SWR_1829)
def test_any_event_is_a_discriminated_union() -> None:
    """Productive use: parsing a line stays O(1) instead of trying every model in turn.
    Expected outcome: AnyEvent is annotated with the ``event`` discriminator."""
    metadata = get_args(AnyEvent)[1]
    assert metadata.discriminator == "event"


@verifies(SWR.SWR_1831)
@pytest.mark.parametrize("event_type", P1_FEATURE_EVENT_TYPES, ids=lambda t: t.__name__)
def test_p1_feature_event_survives_one_jsonl_line_field_for_field(
    event_type: type[RotarisEvent],
) -> None:
    """Productive use: an SDK consumer rebuilds a hook, checkpoint, gate or approval event.
    Expected outcome: every field of every new type survives serialize -> parse unchanged."""
    original = _sample(event_type)
    line = serialize_event(original)
    assert len(line.splitlines()) == 1
    reparsed = parse_event(json.loads(line))
    assert type(reparsed) is event_type
    assert reparsed.model_dump() == original.model_dump()


@verifies(SWR.SWR_1831)
def test_p1_feature_events_did_not_bump_the_schema_version() -> None:
    """Productive use: a consumer pinned to version 1 keeps parsing after the P1 types land.
    Expected outcome: the new types ship inside schema version 1, additively."""
    assert EVENT_SCHEMA_VERSION == 1
    for event_type in P1_FEATURE_EVENT_TYPES:
        assert _sample(event_type).schema_version == 1


@verifies(SWR.SWR_1831)
def test_hook_start_masks_a_credential_in_the_hook_command() -> None:
    """Productive use: an operator pipes a hook-carrying stream to CI logs safely.
    Expected outcome: a token in a hook's command line never reaches the wire."""
    event = HookStartEvent(
        session_id="s-1",
        hook_id="global:0:pre_tool",
        hook_name="notify",
        lifecycle_point="pre_tool",
        scope="global",
        command="curl -H 'Authorization: Bearer ghp_realvalue123' https://example.test",
    )
    line = serialize_event(event)
    assert "ghp_realvalue123" not in line
    assert "curl" in line


@verifies(SWR.SWR_1831)
def test_hook_finish_output_is_redacted_and_cannot_be_bypassed_by_assignment() -> None:
    """Productive use: hook stdout is arbitrary process output and may print a secret.
    Expected outcome: redaction runs on construction and again on mutation."""
    event = HookFinishEvent(
        session_id="s-1",
        hook_id="workspace:1:post_tool",
        hook_name="audit",
        lifecycle_point="post_tool",
        scope="workspace",
        exit_code=0,
        output="exported API_KEY=sk-livesecret",
    )
    assert "sk-livesecret" not in serialize_event(event)
    event.output = "second run: password=hunter2"
    line = serialize_event(event)
    assert "hunter2" not in line
    assert "second run" in line


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_transcript_row_is_redacted_and_cannot_be_bypassed_by_assignment() -> None:
    """Productive use: an agent quotes the command output it just read, and that
    output printed a token. Expected outcome: the secret never reaches the wire,
    on construction or on mutation, and the sentence around it still reads."""
    event = TranscriptRowEvent(
        session_id="s-1",
        index=3,
        row={
            "role": "agent",
            "name": "implementer-2",
            "content": "The deploy script exports API_KEY=sk-livesecret, which is why it worked.",
        },
    )
    line = serialize_event(event)
    assert "sk-livesecret" not in line
    assert "deploy script" in line

    event.row = {"role": "agent", "content": "Re-checking: the password=hunter2 line is there."}
    line = serialize_event(event)
    assert "hunter2" not in line
    assert "Re-checking" in line


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_transcript_row_is_redacted_however_deep_the_secret_sits() -> None:
    """Productive use: a tool row carries its output in a nested structure.
    Expected outcome: the mask reaches it — a redaction rule that only knew the
    row's top-level keys would leak the first time a row grew one."""
    event = TranscriptRowEvent(
        session_id="s-1",
        row={
            "role": "tool",
            "tool": "bash",
            "attempts": [{"output": "TOKEN=sk-livesecret"}],
            "duration": 1.5,
            "tool_terminal": True,
        },
    )
    line = serialize_event(event)

    assert "sk-livesecret" not in line
    # Non-strings are left as they are: a duration is not text to mask.
    assert event.row["duration"] == 1.5
    assert event.row["tool_terminal"] is True


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_very_long_row_is_clipped_rather_than_left_unbounded() -> None:
    """Productive use: a model pastes a whole file back into its reply.
    Expected outcome: the line stays a line — bounded, marked as clipped, and
    still one parseable event rather than a megabyte of history."""
    event = TranscriptRowEvent(session_id="s-1", row={"role": "agent", "content": "a" * 40_000})

    assert len(event.row["content"]) == 16_000
    assert event.row["content"].endswith("…")
    assert parse_event(json.loads(serialize_event(event))).row == event.row


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_row_says_where_it_goes_so_a_consumer_replaces_rather_than_appends() -> None:
    """Productive use: a tool row is published when the call starts and again
    when it ends. Expected outcome: both name the same position, so a consumer
    that replaces at that index shows one row and not two."""
    opened = TranscriptRowEvent(
        session_id="s-1", index=4, row={"role": "tool", "status": "running"}
    )
    settled = TranscriptRowEvent(
        session_id="s-1", index=4, row={"role": "tool", "status": "ok", "duration": 2.0}
    )

    assert opened.index == settled.index == 4
    assert json.loads(serialize_event(settled))["row"]["status"] == "ok"


@verifies(SWR.SWR_1831)
def test_hook_finish_reports_an_untrusted_workspace_hook_as_skipped() -> None:
    """Productive use: a CI consumer sees that a workspace hook never ran and why.
    Expected outcome: a skipped hook carries its reason and no exit code or duration."""
    event = HookFinishEvent(
        session_id="s-1",
        hook_id="workspace:0:pre_tool",
        hook_name="guard",
        lifecycle_point="pre_tool",
        scope="workspace",
        skipped=True,
        skip_reason="workspace hooks are not trusted yet",
    )
    reparsed = parse_event(json.loads(serialize_event(event)))
    assert isinstance(reparsed, HookFinishEvent)
    assert reparsed.skipped is True
    assert reparsed.skip_reason == "workspace hooks are not trusted yet"
    assert reparsed.exit_code is None
    assert reparsed.duration_ms is None
    assert reparsed.blocked is False


@verifies(SWR.SWR_1831)
def test_hook_finish_reports_a_blocking_exit_code() -> None:
    """Productive use: an automation aborts a pipeline when a pre-tool hook blocked a call.
    Expected outcome: the exit code and the blocked flag both survive the wire."""
    reparsed = parse_event(json.loads(serialize_event(_sample(HookFinishEvent))))
    assert isinstance(reparsed, HookFinishEvent)
    assert reparsed.exit_code == 2
    assert reparsed.blocked is True
    assert reparsed.lifecycle_point == "pre_tool"
    assert reparsed.scope == "workspace"


@verifies(SWR.SWR_1831)
def test_checkpoint_restore_reports_a_refusal_instead_of_a_silent_no_op() -> None:
    """Productive use: an operator learns that a rollback was refused, not that it worked.
    Expected outcome: a refused restore carries its reason and touches nothing."""
    event = CheckpointRestoredEvent(
        session_id="s-1",
        sequence=2,
        restored=False,
        blocked_reason="the working tree has uncommitted changes",
    )
    reparsed = parse_event(json.loads(serialize_event(event)))
    assert isinstance(reparsed, CheckpointRestoredEvent)
    assert reparsed.restored is False
    assert reparsed.changed_paths == 0
    assert reparsed.safety_sequence is None
    assert reparsed.blocked_reason == "the working tree has uncommitted changes"


@verifies(SWR.SWR_1831)
def test_gate_decision_keeps_the_overruled_llm_verdict_visible() -> None:
    """Productive use: a consumer sees the gate overrule the model's own "done".
    Expected outcome: a gated decision reports the verdict it overruled and why."""
    reparsed = parse_event(json.loads(serialize_event(_sample(GateDecisionEvent))))
    assert isinstance(reparsed, GateDecisionEvent)
    assert reparsed.decision == "gated"
    assert reparsed.llm_verdict == "COMPLETE"
    assert reparsed.unsatisfied_checks == ["pytest"]
    assert reparsed.advisory_failures == ["ruff"]


@verifies(SWR.SWR_1831)
def test_gate_repair_reports_the_remaining_budget() -> None:
    """Productive use: a dashboard shows how many repair attempts a gated task has left.
    Expected outcome: attempt, budget and remainder all travel on one line."""
    reparsed = parse_event(json.loads(serialize_event(_sample(GateRepairEvent))))
    assert isinstance(reparsed, GateRepairEvent)
    assert reparsed.action == "retry"
    assert reparsed.attempt == 1
    assert reparsed.max_attempts == 3
    assert reparsed.remaining_attempts == 2


@verifies(SWR.SWR_1831)
def test_approval_requested_summary_is_redacted() -> None:
    """Productive use: a pending-approval line is safe to show in a CI log.
    Expected outcome: a secret inside the approval summary is masked on the wire."""
    event = ApprovalRequestedEvent(
        session_id="s-1",
        request_id="req-1",
        tool_name="bash",
        summary="bash: deploy --password hunter2",
        resolver="brokered",
    )
    line = serialize_event(event)
    assert "hunter2" not in line
    assert "--password" in line
    event.summary = "bash: publish token=ghp_realvalue123"
    assert "ghp_realvalue123" not in serialize_event(event)


@verifies(SWR.SWR_1831)
def test_an_approval_request_can_be_paired_with_the_decision_that_resolved_it() -> None:
    """Productive use: a consumer matches a pending approval to its later resolution.
    Expected outcome: the schema carries the request id on both sides of the pair."""
    requested = ApprovalRequestedEvent(
        session_id="s-1",
        request_id="req-42",
        tool_name="bash",
        resolver="brokered",
    )
    # The resolution echoes the id the request carried, never a literal of its own.
    resolved = PermissionDecisionEvent(
        session_id="s-1",
        request_id=requested.request_id,
        tool_name="bash",
        decision="allow",
    )
    reparsed_request = parse_event(json.loads(serialize_event(requested)))
    reparsed_decision = parse_event(json.loads(serialize_event(resolved)))
    assert isinstance(reparsed_request, ApprovalRequestedEvent)
    assert isinstance(reparsed_decision, PermissionDecisionEvent)
    assert reparsed_request.request_id == reparsed_decision.request_id == "req-42"
    # Not yet populated by any emitter: a decision that names no request is the
    # default, and a consumer must read it as "unpaired", not "no human asked".
    assert PermissionDecisionEvent(session_id="s-1", tool_name="bash").request_id == ""


@verifies(SWR.SWR_1831)
def test_a_pending_approval_names_the_agent_it_is_blocking() -> None:
    """Productive use: a supervisor watching a fan-out routes the prompt to one child.
    Expected outcome: the agent name and persona survive the wire; both stay empty
    rather than guessed when the raising engine has no identity to report."""
    blocked = parse_event(json.loads(serialize_event(_sample(ApprovalRequestedEvent))))
    assert isinstance(blocked, ApprovalRequestedEvent)
    assert blocked.agent_name == "implementer-2"
    assert blocked.persona == "coder"
    # Same field, same value space as ``child.spawn`` — that join is what turns
    # "someone is blocked" into "this child is blocked, on this task".
    spawn = ChildSpawnEvent(session_id="s-1", child_id="c-2", agent_name="implementer-2")
    assert blocked.agent_name == spawn.agent_name

    # Optional by design: a request raised outside a delegation has no child
    # identity, and an absent name must still round-trip rather than break.
    anonymous = ApprovalRequestedEvent(
        session_id="s-1",
        request_id="req-3",
        tool_name="bash",
        resolver="headless",
    )
    reparsed = parse_event(json.loads(serialize_event(anonymous)))
    assert isinstance(reparsed, ApprovalRequestedEvent)
    assert reparsed.agent_name == ""
    assert reparsed.persona == ""


@verifies(SWR.SWR_1831)
def test_approval_requested_distinguishes_a_stall_from_an_unattended_denial() -> None:
    """Productive use: a headless consumer tells "waiting for a human" from "no human exists".
    Expected outcome: a pending request carries a deadline; an unattended one carries a reason."""
    pending = parse_event(json.loads(serialize_event(_sample(ApprovalRequestedEvent))))
    assert isinstance(pending, ApprovalRequestedEvent)
    assert pending.timeout_seconds == 300.0
    assert pending.unattended_reason == ""

    unattended = ApprovalRequestedEvent(
        session_id="s-1",
        request_id="req-2",
        tool_name="bash",
        resolver="headless",
        unattended_reason="headless_policy",
    )
    reparsed = parse_event(json.loads(serialize_event(unattended)))
    assert isinstance(reparsed, ApprovalRequestedEvent)
    assert reparsed.timeout_seconds is None
    assert reparsed.unattended_reason == "headless_policy"
