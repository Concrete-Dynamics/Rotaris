from __future__ import annotations

import pytest
from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.agents.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerActivation,
    CircuitBreakerSession,
    _action_fingerprint,
    _find_repetitive_tool_pattern,
    build_circuit_breaker,
)
from rotaris_core.config.schema import CircuitBreakerConfig, RotarisConfig
from rotaris_core.orchestrator.scheduler import Scheduler
from rotaris_core.reqtocode import SWR, verifies


class MockLLM:
    def __init__(self, payload: str) -> None:
        self.payload = payload
        self.calls: list[object] = []

    def completion(self, messages, **kwargs):  # noqa: ANN001, ANN003
        del kwargs
        self.calls.append(messages)
        return type(
            "Response",
            (),
            {
                "message": Message(
                    role="assistant",
                    content=[TextContent(text=self.payload)],
                ),
            },
        )()


class ToolEvent:
    def __init__(self, tool_name: str = "grep", action: str = "search docs") -> None:
        self.tool_name = tool_name
        self.tool_call_id = f"{tool_name}-call"
        self.action = action
        self.source = "agent"


class AssistantMessageEvent:
    def __init__(self, text: str) -> None:
        self.source = "assistant"
        self.llm_message = Message(role="assistant", content=[TextContent(text=text)])


class UserMessageEvent:
    def __init__(self, text: str) -> None:
        self.source = "user"
        self.llm_message = Message(role="user", content=[TextContent(text=text)])


class FakeBreaker:
    def __init__(self, activation: CircuitBreakerActivation) -> None:
        self.activation = activation
        self.calls: list[dict[str, object]] = []

    async def classify(self, *, events, session_id, **kwargs):  # noqa: ANN001, ANN003
        self.calls.append({"events": events, "session_id": session_id, **kwargs})
        return self.activation


@verifies(SWR.SWR_137, SWR.SWR_202, SWR.SWR_203, SWR.SWR_204)
@pytest.mark.asyncio
async def test_circuit_breaker_session_triggers_on_independent_tool_threshold() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(tool_call_threshold=2, message_count_threshold=20),
    )
    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=False, corrective_message=None))
    pause_calls: list[str] = []

    session.mark_new_user_instruction()
    session.observe_event(UserMessageEvent("start"), pause=lambda: pause_calls.append("pause"))
    session.observe_event(ToolEvent("grep"), pause=lambda: pause_calls.append("pause"))
    session.observe_event(ToolEvent("grep"), pause=lambda: pause_calls.append("pause"))

    activation = await session.activate(
        breaker,
        events=[UserMessageEvent("start"), ToolEvent("grep"), ToolEvent("grep")],
        session_id="conv-1",
    )

    assert pause_calls == ["pause"]
    assert activation is not None
    assert activation.loop_detected is False
    assert len(breaker.calls) == 1
    assert breaker.calls[0]["session_id"] == "conv-1"
    assert breaker.calls[0]["tool_call_count"] == 2
    assert breaker.calls[0]["message_count"] == 1


@verifies(SWR.SWR_137, SWR.SWR_205)
@pytest.mark.asyncio
async def test_circuit_breaker_session_supports_weighted_trigger_mode() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(
            activation_mode="weighted",
            tool_call_threshold=2,
            message_count_threshold=2,
            tool_weight=0.6,
            message_weight=0.4,
            target_score=1.0,
        ),
    )
    pause_calls: list[str] = []

    session.observe_event(ToolEvent("grep"), pause=lambda: pause_calls.append("pause"))
    session.observe_event(
        AssistantMessageEvent("still checking"),
        pause=lambda: pause_calls.append("pause"),
    )
    assert pause_calls == []

    session.observe_event(ToolEvent("grep"), pause=lambda: pause_calls.append("pause"))
    session.observe_event(
        AssistantMessageEvent("still checking"),
        pause=lambda: pause_calls.append("pause"),
    )

    assert pause_calls == ["pause"]


@verifies(SWR.SWR_137, SWR.SWR_213, SWR.SWR_214, SWR.SWR_215)
@pytest.mark.asyncio
async def test_circuit_breaker_escalates_on_third_activation() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(tool_call_threshold=1, message_count_threshold=50),
    )
    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=False, corrective_message=None))

    first = None
    second = None
    third = None
    for _ in range(3):
        session.observe_event(ToolEvent("grep"), pause=lambda: None)
        activation = await session.activate(
            breaker,
            events=[ToolEvent("grep")],
            session_id="conv-2",
        )
        if first is None:
            first = activation
        elif second is None:
            second = activation
        else:
            third = activation

    assert first is not None and first.escalation is None
    assert second is not None and second.escalation is None
    assert third is not None and third.escalation is not None
    assert third.escalation.session_id == "conv-2"
    assert third.escalation.consecutive_activation_count == 3
    assert third.escalation.reason == "repeated_loop_detection"


@verifies(SWR.SWR_132, SWR.SWR_134)
@pytest.mark.asyncio
async def test_circuit_breaker_session_escalates_on_third_terminal_stuck_activation() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(tool_call_threshold=10, message_count_threshold=20),
    )
    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=True, corrective_message="retry"))

    first = None
    second = None
    third = None
    for _ in range(3):
        session.schedule_terminal_stuck_activation()
        activation = await session.activate(
            breaker,
            events=[AssistantMessageEvent("still stuck")],
            session_id="conv-stuck",
        )
        if first is None:
            first = activation
        elif second is None:
            second = activation
        else:
            third = activation

    assert first is not None and first.corrective_message == "retry"
    assert second is not None and second.corrective_message == "retry"
    assert third is not None and third.escalation is not None
    assert third.escalation.session_id == "conv-stuck"
    assert third.escalation.consecutive_activation_count == 3
    assert third.escalation.reason == "repeated_loop_detection"


@verifies(SWR.SWR_137, SWR.SWR_201, SWR.SWR_207, SWR.SWR_209, SWR.SWR_210, SWR.SWR_211, SWR.SWR_220)
@pytest.mark.asyncio
async def test_circuit_breaker_classifier_returns_injected_message_when_loop_detected() -> None:
    llm = MockLLM(
        '{"loop_detected": true, "reason": "repetition", '
        '"corrective_message": "Stop repeating the same search and inspect '
        'the failing file directly."}',
    )
    breaker = CircuitBreaker(llm=llm, config=CircuitBreakerConfig())

    activation = await breaker.classify(
        events=[
            UserMessageEvent("Fix the bug in src/app.py"),
            ToolEvent("grep", "search src/app.py"),
            ToolEvent("grep", "search src/app.py"),
            AssistantMessageEvent("I am still investigating."),
        ],
        session_id="conv-3",
        tool_call_count=2,
        message_count=2,
        trigger_mode="independent-tools",
    )

    assert activation.loop_detected is True
    assert activation.corrective_message is not None
    assert "inspect the failing file directly" in activation.corrective_message
    assert len(llm.calls) == 1


@verifies(SWR.SWR_136, SWR.SWR_137)
@pytest.mark.asyncio
async def test_circuit_breaker_terminal_stuck_falls_back_when_classifier_returns_false() -> None:
    llm = MockLLM('{"loop_detected": false, "reason": "not a loop", "corrective_message": null}')
    breaker = CircuitBreaker(llm=llm, config=CircuitBreakerConfig())

    activation = await breaker.classify(
        events=[AssistantMessageEvent("stuck in the same loop")],
        session_id="conv-stuck-fallback",
        tool_call_count=0,
        message_count=1,
        trigger_mode="terminal-stuck",
    )

    assert activation.loop_detected is True
    assert activation.corrective_message is not None
    assert "read_file" in activation.corrective_message
    assert "write_file" in activation.corrective_message


@verifies(SWR.SWR_137, SWR.SWR_222)
@pytest.mark.asyncio
async def test_session_triggers_on_repeated_action() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(
            tool_call_threshold=100,
            message_count_threshold=100,
            repetition_threshold=4,
        ),
    )
    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=True, corrective_message="stop"))
    pause_calls: list[str] = []

    for _ in range(3):
        session.observe_event(
            ToolEvent("read_file", "read src/main.py"),
            pause=lambda: pause_calls.append("pause"),
        )
    assert pause_calls == []

    session.observe_event(
        ToolEvent("read_file", "read src/main.py"),
        pause=lambda: pause_calls.append("pause"),
    )
    assert pause_calls == ["pause"]

    activation = await session.activate(
        breaker,
        events=[ToolEvent("read_file", "read src/main.py")] * 4,
        session_id="conv-rep",
    )

    assert activation is not None
    assert len(breaker.calls) == 1
    assert breaker.calls[0]["trigger_mode"] == "repeated-action"


@verifies(SWR.SWR_137, SWR.SWR_222)
@pytest.mark.asyncio
async def test_session_triggers_on_repeated_cycle() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(
            tool_call_threshold=100,
            message_count_threshold=100,
            repetition_threshold=10,
            cycle_threshold=3,
        ),
    )
    pause_calls: list[str] = []

    for _ in range(3):
        session.observe_event(
            ToolEvent("read_file", "read src/main.py"),
            pause=lambda: pause_calls.append("pause"),
        )
        session.observe_event(
            ToolEvent("write_file", "edit src/main.py"),
            pause=lambda: pause_calls.append("pause"),
        )

    assert pause_calls == ["pause"]

    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=True, corrective_message="stop"))
    activation = await session.activate(
        breaker,
        events=[],
        session_id="conv-cycle",
    )

    assert activation is not None
    assert len(breaker.calls) == 1
    assert breaker.calls[0]["trigger_mode"] == "repeated-cycle"


@verifies(SWR.SWR_137)
@pytest.mark.asyncio
async def test_session_does_not_trigger_on_diverse_tool_usage() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(
            tool_call_threshold=100,
            message_count_threshold=100,
            repetition_threshold=4,
            cycle_threshold=3,
        ),
    )
    pause_calls: list[str] = []

    diverse_tools = [
        ToolEvent("read_file", "read src/a.py"),
        ToolEvent("write_file", "edit src/a.py"),
        ToolEvent("terminal", "pytest tests/"),
        ToolEvent("read_file", "read src/b.py"),
        ToolEvent("write_file", "edit src/b.py"),
        ToolEvent("terminal", "ruff check src/"),
        ToolEvent("read_file", "read src/c.py"),
        ToolEvent("fetch", "https://docs.example.com"),
    ]
    for event in diverse_tools:
        session.observe_event(event, pause=lambda: pause_calls.append("pause"))

    assert pause_calls == []


@verifies(SWR.SWR_137, SWR.SWR_217, SWR.SWR_220)
def test_action_fingerprint_deterministic() -> None:
    fp1 = _action_fingerprint("read_file", "read src/main.py")
    fp2 = _action_fingerprint("read_file", "read src/main.py")
    fp3 = _action_fingerprint("read_file", "read src/other.py")

    assert fp1 == fp2
    assert fp1 != fp3
    assert len(fp1) == 12


@verifies(SWR.SWR_137, SWR.SWR_217)
def test_find_repetitive_tool_pattern_consecutive_runs() -> None:
    transcript = (
        "[tool:read_file] read a.py\n"
        "[tool:write_file] edit a.py\n"
        "[tool:read_file] read b.py\n"
        "[tool:read_file] read b.py\n"
        "[tool:read_file] read b.py\n"
        "[tool:read_file] read b.py\n"
    )
    assert _find_repetitive_tool_pattern(transcript) == "read_file"


@verifies(SWR.SWR_137, SWR.SWR_217)
def test_find_repetitive_tool_pattern_no_false_positive_on_frequency() -> None:
    transcript = (
        "[tool:read_file] read a.py\n"
        "[tool:write_file] edit a.py\n"
        "[tool:read_file] read b.py\n"
        "[tool:shell] run tests\n"
        "[tool:read_file] read c.py\n"
        "[tool:write_file] edit c.py\n"
    )
    assert _find_repetitive_tool_pattern(transcript) is None


@verifies(SWR.SWR_135, SWR.SWR_137, SWR.SWR_208)
@pytest.mark.asyncio
async def test_fallback_does_not_auto_declare_loop_from_raw_counts() -> None:
    llm = MockLLM("invalid json garbage }{")
    breaker = CircuitBreaker(llm=llm, config=CircuitBreakerConfig())

    activation = await breaker.classify(
        events=[
            ToolEvent("read_file", "read a.py"),
            ToolEvent("write_file", "edit a.py"),
            ToolEvent("terminal", "pytest"),
        ],
        session_id="conv-no-loop",
        tool_call_count=60,
        message_count=10,
        trigger_mode="independent-tools",
    )

    assert activation.loop_detected is False


@verifies(SWR.SWR_137)
@pytest.mark.asyncio
async def test_fallback_detects_loop_from_repeated_assistant_messages() -> None:
    llm = MockLLM("invalid json garbage }{")
    breaker = CircuitBreaker(llm=llm, config=CircuitBreakerConfig())

    activation = await breaker.classify(
        events=[
            AssistantMessageEvent("I am investigating the issue."),
            AssistantMessageEvent("I am investigating the issue."),
            AssistantMessageEvent("I am investigating the issue."),
        ],
        session_id="conv-repeat-msg",
        tool_call_count=5,
        message_count=5,
        trigger_mode="independent-tools",
    )

    assert activation.loop_detected is True
    assert activation.corrective_message is not None


@verifies(SWR.SWR_137, SWR.SWR_212)
@pytest.mark.asyncio
async def test_fingerprints_cleared_after_activation() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(
            tool_call_threshold=100,
            message_count_threshold=100,
            repetition_threshold=3,
        ),
    )
    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=False, corrective_message=None))

    for _ in range(3):
        session.observe_event(
            ToolEvent("read_file", "read src/main.py"),
            pause=lambda: None,
        )

    await session.activate(breaker, events=[], session_id="conv-clear")

    pause_calls: list[str] = []
    session.observe_event(
        ToolEvent("read_file", "read src/main.py"),
        pause=lambda: pause_calls.append("pause"),
    )
    assert pause_calls == []


# ---------------------------------------------------------------------------
@verifies(SWR.SWR_137, SWR.SWR_216, SWR.SWR_217)
@pytest.mark.asyncio
async def test_circuit_breaker_full_activation_completes_within_two_seconds() -> None:
    """REQ-20260414-091500-016: Circuit Breaker activation cycle must
    complete in ≤ 2 seconds. We exercise the full path: trigger → classify
    → return activation. The classifier is stubbed to a non-LLM Fake to
    isolate framework overhead.
    """
    import time

    session = CircuitBreakerSession(
        CircuitBreakerConfig(tool_call_threshold=1, message_count_threshold=20),
    )
    breaker = FakeBreaker(
        CircuitBreakerActivation(
            loop_detected=True,
            corrective_message="break the loop",
        ),
    )
    session.mark_new_user_instruction()
    session.observe_event(ToolEvent("grep"), pause=lambda: None)
    session.observe_event(ToolEvent("grep"), pause=lambda: None)

    start = time.perf_counter()
    activation = await session.activate(
        breaker,
        events=[ToolEvent("grep"), ToolEvent("grep")],
        session_id="latency-1",
    )
    elapsed = time.perf_counter() - start

    assert activation is not None
    assert elapsed < 2.0, f"Circuit Breaker activation cycle took {elapsed:.3f}s, exceeds 2s NFR"


@verifies(SWR.SWR_137, SWR.SWR_221)
@pytest.mark.asyncio
async def test_circuit_breaker_session_state_does_not_leak_across_sessions() -> None:
    """REQ-20260414-091500-021: per-session state (counters, fingerprints,
    activation history) must NOT survive into a new ``CircuitBreakerSession``.
    """
    cfg = CircuitBreakerConfig(tool_call_threshold=2, message_count_threshold=20)

    session_a = CircuitBreakerSession(cfg)
    session_a.mark_new_user_instruction()
    pause_a: list[str] = []
    session_a.observe_event(ToolEvent("grep"), pause=lambda: pause_a.append("a"))
    session_a.observe_event(ToolEvent("grep"), pause=lambda: pause_a.append("a"))
    assert pause_a, "session A should have triggered to establish a counter"

    # A fresh session must start with zeroed counters — it must NOT pause
    # immediately on the first observed tool.
    session_b = CircuitBreakerSession(cfg)
    session_b.mark_new_user_instruction()
    pause_b: list[str] = []
    session_b.observe_event(ToolEvent("grep"), pause=lambda: pause_b.append("b"))
    assert pause_b == [], "circuit-breaker state leaked: session B paused on first tool call"


@verifies(SWR.SWR_137, SWR.SWR_203, SWR.SWR_219)
def test_circuit_breaker_default_thresholds_match_specified_norms() -> None:
    """REQ-003, REQ-019 + REQ-20260417-140000: defaults are
    grounded in production norms and bumped after the false-positive fix.
    The operative numbers (post-fix) are documented here.
    """
    cfg = CircuitBreakerConfig()
    # Independent thresholds — bumped from the original 10 / 20 to 60 / 60
    # by REQ-20260417-140000 to stop tripping on productive tool chains.
    assert cfg.tool_call_threshold >= 10, cfg.tool_call_threshold
    assert cfg.message_count_threshold >= 20, cfg.message_count_threshold
    # Weighted-mode defaults must remain in spec.
    assert cfg.tool_weight == pytest.approx(0.6)
    assert cfg.message_weight == pytest.approx(0.4)
    assert cfg.target_score == pytest.approx(1.0)


# ---------------------------------------------------------------------------
@verifies(SWR.SWR_132)
@pytest.mark.asyncio
async def test_terminal_stuck_activation_uses_distinct_trigger_mode() -> None:
    """REQ-20260414-235403-002: a scheduler-scheduled terminal-stuck
    activation must invoke the breaker with ``trigger_mode='terminal-stuck'``
    so the classifier can apply stuck-specific recovery semantics.
    """
    session = CircuitBreakerSession(
        CircuitBreakerConfig(tool_call_threshold=10, message_count_threshold=20),
    )
    breaker = FakeBreaker(CircuitBreakerActivation(loop_detected=True, corrective_message="resume"))

    session.schedule_terminal_stuck_activation()
    activation = await session.activate(
        breaker,
        events=[AssistantMessageEvent("stuck")],
        session_id="conv-stuck-mode",
    )

    assert activation is not None
    assert len(breaker.calls) == 1
    assert breaker.calls[0]["trigger_mode"] == "terminal-stuck", breaker.calls[0]


@verifies(SWR.SWR_133, SWR.SWR_137)
@pytest.mark.asyncio
async def test_terminal_stuck_corrective_message_resumes_same_session() -> None:
    """REQ-20260414-235403-003: the corrective message returned for a
    recoverable terminal-stuck must be present and non-empty so the
    scheduler can inject it back into the same conversation.
    """
    session = CircuitBreakerSession(CircuitBreakerConfig())
    breaker = FakeBreaker(
        CircuitBreakerActivation(
            loop_detected=True,
            corrective_message="Try inspecting the failing file directly.",
        ),
    )
    session.schedule_terminal_stuck_activation()
    activation = await session.activate(
        breaker,
        events=[AssistantMessageEvent("stuck")],
        session_id="conv-stuck-resume",
    )

    assert activation is not None
    assert activation.loop_detected is True
    assert activation.corrective_message
    assert "inspecting" in activation.corrective_message


@verifies(SWR.SWR_223, SWR.SWR_224)
def test_build_circuit_breaker_returns_none_when_disabled() -> None:
    config = RotarisConfig(circuit_breaker=CircuitBreakerConfig(enabled=False))
    assert build_circuit_breaker(config) is None


@verifies(SWR.SWR_225)
def test_scheduler_marks_circuit_breaker_disabled_after_none_build(monkeypatch) -> None:
    import rotaris_core.agents.circuit_breaker as cb_module

    calls: list[object] = []

    def fake_build(config):  # noqa: ANN001
        calls.append(config)
        return None

    monkeypatch.setattr(cb_module, "build_circuit_breaker", fake_build)
    scheduler = Scheduler.__new__(Scheduler)
    scheduler.config = RotarisConfig(circuit_breaker=CircuitBreakerConfig(enabled=False))
    scheduler._circuit_breaker = None
    scheduler._circuit_breaker_disabled = False

    assert scheduler._get_circuit_breaker() is None
    assert scheduler._circuit_breaker_disabled is True
    assert scheduler._get_circuit_breaker() is None
    assert len(calls) == 1


@verifies(SWR.SWR_137, SWR.SWR_222)
def test_distinct_long_edit_actions_do_not_read_as_repetition() -> None:
    session = CircuitBreakerSession(
        CircuitBreakerConfig(
            tool_call_threshold=100,
            message_count_threshold=100,
            repetition_threshold=4,
        ),
    )
    pause_calls: list[str] = []
    # Long enough that any prefix-window fingerprint would collide across
    # edits whose differences only appear after the shared path/metadata.
    shared_prefix = "file_path='D:/worktrees/session/apps/rotaris/chrome.py' snapshot='" + "x" * 600

    for i in range(8):
        session.observe_event(
            ToolEvent("write_file", f"{shared_prefix}' edit-{i}"),
            pause=lambda: pause_calls.append("pause"),
        )

    assert pause_calls == []

    for _ in range(4):
        session.observe_event(
            ToolEvent("write_file", f"{shared_prefix}' same-edit"),
            pause=lambda: pause_calls.append("pause"),
        )

    assert pause_calls == ["pause"]
