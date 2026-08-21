"""Tests for describe_timed_tool_event and is_error propagation."""

from __future__ import annotations

from rotaris_core.orchestrator.scheduler_diagnostics import describe_timed_tool_event
from rotaris_core.reqtocode import SWR, verifies

# ---------------------------------------------------------------------------
# Fake event objects — minimal stand-ins for SDK tool lifecycle events
# ---------------------------------------------------------------------------


class _FakeObservation:
    """Minimal observation stand-in with is_error support."""

    def __init__(
        self,
        *,
        is_error: bool = False,
        text: str = "",
        command: str = "",
        exit_code: int | None = None,
        failure_kind: str | None = None,
    ) -> None:
        self.is_error = is_error
        self.text = text
        self.command = command
        self.exit_code = exit_code
        self.failure_kind = failure_kind


class _FakeTitleEvent:
    """Event with .title (human-readable tool name)."""

    def __init__(
        self,
        *,
        tool_call_id: str,
        title: str,
        status: str = "completed",
        is_error: bool = False,
        observation: _FakeObservation | None = None,
    ) -> None:
        self.tool_call_id = tool_call_id
        self.title = title
        self.status = status
        self.is_error = is_error
        self.observation = observation


class _FakeToolNameEvent:
    """Event with .tool_name (lower-level)."""

    def __init__(
        self,
        *,
        tool_call_id: str,
        tool_name: str = "",
        action: object | None = None,
        observation: object | None = None,
        rejection_reason: str | None = None,
    ) -> None:
        self.tool_call_id = tool_call_id
        self.tool_name = tool_name
        if action is not None:
            self.action = action
        if observation is not None:
            self.observation = observation
        if rejection_reason is not None:
            self.rejection_reason = rejection_reason


# ---------------------------------------------------------------------------
# No tool_call_id
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_560, SWR.SWR_561)
def test_returns_none_when_no_tool_call_id() -> None:
    """Events without tool_call_id are ignored."""
    event = _FakeTitleEvent(tool_call_id="", title="terminal", status="completed")
    assert describe_timed_tool_event(event) is None


# ---------------------------------------------------------------------------
# Title-having branch — is_error propagation
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_561)
def test_title_event_is_error_true_with_status_completed_returns_error() -> None:
    """is_error=True must take precedence over status='completed'."""
    event = _FakeTitleEvent(
        tool_call_id="call_01",
        title="terminal",
        status="completed",
        is_error=True,
        observation=_FakeObservation(is_error=True),
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    phase, tool_name, call_id, status, args, _result_text = result
    assert phase == "terminal"
    assert tool_name == "terminal"
    assert status == "error"


@verifies(SWR.SWR_561)
def test_title_event_is_error_false_with_status_completed_returns_completed() -> None:
    """Normal successful tool call returns 'completed'."""
    event = _FakeTitleEvent(
        tool_call_id="call_02",
        title="terminal",
        status="completed",
        is_error=False,
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "completed"


@verifies(SWR.SWR_561)
def test_title_event_is_error_true_no_status_returns_error() -> None:
    """is_error=True without a status string still returns 'error'."""
    event = _FakeTitleEvent(
        tool_call_id="call_03",
        title="terminal",
        status="",
        is_error=True,
        observation=_FakeObservation(is_error=True),
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "error"


@verifies(SWR.SWR_561)
def test_title_event_is_error_false_no_status_returns_running() -> None:
    """is_error=False without a recognized terminal status returns 'running' (start phase)."""
    event = _FakeTitleEvent(
        tool_call_id="call_04",
        title="terminal",
        status="",
        is_error=False,
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[0] == "start"
    assert result[3] == "running"


@verifies(SWR.SWR_561)
def test_title_event_status_blocked_no_is_error_returns_blocked() -> None:
    """A recognized terminal status other than 'completed' is preserved."""
    event = _FakeTitleEvent(
        tool_call_id="call_05",
        title="terminal",
        status="blocked",
        is_error=False,
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "blocked"


@verifies(SWR.SWR_561)
def test_title_event_status_running_returns_start() -> None:
    """Non-terminal status returns ('start', ...)."""
    event = _FakeTitleEvent(
        tool_call_id="call_06",
        title="terminal",
        status="running",
        is_error=False,
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[0] == "start"


# ---------------------------------------------------------------------------
# Title-less branch — observation.is_error propagation
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_561)
def test_tool_name_event_observation_is_error_true_returns_error() -> None:
    """Title-less event with is_error observation returns 'error'."""
    event = _FakeToolNameEvent(
        tool_call_id="call_07",
        tool_name="bash",
        observation=_FakeObservation(is_error=True, text="pool not initialized"),
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "error"


@verifies(SWR.SWR_561)
def test_tool_name_event_observation_is_error_false_returns_completed() -> None:
    """Title-less event with non-error observation returns 'completed'."""
    event = _FakeToolNameEvent(
        tool_call_id="call_08",
        tool_name="bash",
        observation=_FakeObservation(is_error=False, text="done"),
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "completed"


@verifies(SWR.SWR_561)
def test_tool_name_event_observation_without_is_error_attribute_returns_completed() -> None:
    """Observation without is_error attribute defaults to False → 'completed'."""
    obs = type("_O", (), {"text": "ok"})()
    event = _FakeToolNameEvent(
        tool_call_id="call_09",
        tool_name="bash",
        observation=obs,
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "completed"


@verifies(SWR.SWR_560)
def test_terminal_observation_nonzero_exit_returns_error_with_outcome_metadata() -> None:
    event = _FakeToolNameEvent(
        tool_call_id="call_terminal",
        tool_name="terminal",
        observation=_FakeObservation(
            text="Traceback (most recent call last):",
            command="python broken.py",
            exit_code=1,
        ),
    )

    result = describe_timed_tool_event(event)

    assert result is not None
    assert result.status == "error"
    assert result.outcome_kind == "shell_failure"
    assert result.exit_code == 1


@verifies(SWR.SWR_560)
def test_terminal_observation_suspicious_success_returns_warning_status() -> None:
    event = _FakeToolNameEvent(
        tool_call_id="call_terminal",
        tool_name="terminal",
        observation=_FakeObservation(
            text="ERROR: file or directory not found: tests/missing.py\nno tests ran",
            command="python -m pytest tests/missing.py 2>&1 | head -60",
            exit_code=0,
        ),
    )

    result = describe_timed_tool_event(event)

    assert result is not None
    assert result.status == "warning"
    assert result.outcome_kind == "suspicious_success"
    assert result.warnings


@verifies(SWR.SWR_561)
def test_tool_name_event_rejection_returns_rejected() -> None:
    """Rejection events are unaffected by the fix."""
    event = _FakeToolNameEvent(
        tool_call_id="call_10",
        tool_name="bash",
        rejection_reason="command not allowed",
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[3] == "rejected"


@verifies(SWR.SWR_561)
def test_tool_name_event_action_returns_start() -> None:
    """Events with .action are classified as 'start'."""
    event = _FakeToolNameEvent(
        tool_call_id="call_11",
        tool_name="bash",
        action=type("_A", (), {"command": "echo hi"})(),
    )
    result = describe_timed_tool_event(event)
    assert result is not None
    assert result[0] == "start"


@verifies(SWR.SWR_561)
def test_tool_name_event_no_tool_name_returns_none() -> None:
    """Title-less events without a tool_name are ignored."""
    event = _FakeToolNameEvent(
        tool_call_id="call_12",
        tool_name="",
        observation=_FakeObservation(),
    )
    result = describe_timed_tool_event(event)
    assert result is None


@verifies(SWR.SWR_561)
def test_tool_name_event_neither_observation_nor_rejection_nor_action_returns_none() -> None:
    """Event with no recognizable field returns None."""
    event = _FakeToolNameEvent(tool_call_id="call_13", tool_name="bash")
    result = describe_timed_tool_event(event)
    assert result is None
