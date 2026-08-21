"""Integration coverage for the run wiring: SDK events → _SessionObserver →
persisted session → ConfigService.apply_session → WorkspaceStore →
WorkspaceView chat rows.

These drive the exact same code path a live Rotaris run uses (scheduler
callbacks bound by bind_scheduler_callbacks, real SessionManager persistence,
real snapshot reload) with real OpenHands SDK event objects — only the LLM and
the scheduler itself are stubbed out.

The level is `integration`, not `e2e`, despite the file name: the seam is
entered by calling the observer directly rather than by driving the window a
user sees. Renaming the file is deferred because requirement records reference
it by name.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from PySide6.QtWidgets import QLabel
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from run_wiring import (
    ObserverHarness,
    action_event,
    demo_config,
    message_event,
    observation_event,
    sdk_events,
    token_chunk,
)

from rotaris.models import TodoItem
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge
from rotaris.views.transcript import _event_html
from rotaris.views.workspace import WorkspaceView

pytestmark = pytest.mark.integration


def _labels(view: WorkspaceView) -> str:
    return "\n".join(label.text() for label in view.findChildren(QLabel))


def _transcript_text(view: WorkspaceView) -> str:
    model = view.transcript_scroll.transcript_model
    return "\n".join(str(model.data(model.index(row, 0))) for row in range(model.rowCount()))


# ── tests ─────────────────────────────────────────────────────────────────


@verifies(SWR.SWR_2433)
def test_swr_2433_delegation_context_header_flows_through_child_transcript_e2e(
    tmp_path, qtbot
) -> None:
    """Productive use: a desktop user can inspect why each child agent was delegated.
    Expected outcome: child transcript headers survive selection changes, collapse, and reload.
    """
    h = ObserverHarness(tmp_path)
    try:
        h.records = [
            SimpleNamespace(
                canonical_name="root-agent",
                persona="orchestrator",
                model_dump=lambda *, mode: {
                    "canonical_name": "root-agent",
                    "persona": "orchestrator",
                    "state": "running",
                },
            ),
            SimpleNamespace(
                canonical_name="coder-1",
                persona="coder",
                model_dump=lambda *, mode: {
                    "canonical_name": "coder-1",
                    "persona": "coder",
                    "state": "running",
                    "parent_agent_id": "root-agent",
                    "depends_on": [],
                    "category": "deep",
                    "run_in_background": True,
                    "task_payload": "TASK: implement the transcript fix",
                    "session_id": "child-session-1",
                    "inherited_context": ["analyst-1"],
                },
            ),
            SimpleNamespace(
                canonical_name="coder-2",
                persona="coder",
                model_dump=lambda *, mode: {
                    "canonical_name": "coder-2",
                    "persona": "coder",
                    "state": "queued",
                    "parent_agent_id": "root-agent",
                    "depends_on": ["coder-1"],
                    "category": "quick",
                    "run_in_background": False,
                    "task_payload": "TASK: verify the transcript fix",
                    "session_id": "child-session-2",
                    "inherited_context": [],
                },
            ),
        ]
        h.observer._apply(h.records, None)
        h.state.transcript_events.append({"role": "user", "content": "fix delegation headers"})
        h.drain()
        store = h.reload_into_store(tmp_path)
        reloaded_store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    store.select_agent("coder-1")
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    first_header = view.transcript_scroll.transcript_model.event_at(0)
    assert first_header is not None
    assert first_header.kind == "delegation_context"
    first_expanded = _event_html(0, first_header, False, delegation_collapsed=False)
    assert "coder-1" in first_expanded
    assert "coder" in first_expanded
    assert "TASK: implement the transcript fix" in first_expanded
    assert "Mode: background" in first_expanded
    assert "Inherited context: analyst-1" in first_expanded

    first_collapsed = _event_html(0, first_header, False, delegation_collapsed=True)
    assert "coder-1" in first_collapsed
    assert "coder" in first_collapsed
    assert "TASK: implement the transcript fix" not in first_collapsed
    assert "Mode:" not in first_collapsed

    view.transcript_scroll.transcript_delegate._delegation_collapsed.add(0)
    store.select_agent("coder-2")
    second_header = view.transcript_scroll.transcript_model.event_at(0)
    assert second_header is not None
    assert second_header.kind == "delegation_context"
    second_expanded = _event_html(0, second_header, False, delegation_collapsed=False)
    assert "coder-2" in second_expanded
    assert "TASK: verify the transcript fix" in second_expanded
    assert "Mode: blocking" in second_expanded
    assert "Depends on: coder-1" in second_expanded

    store.select_agent("")
    full_run_events = [
        view.transcript_scroll.transcript_model.event_at(row)
        for row in range(view.transcript_scroll.transcript_model.rowCount())
    ]
    assert all(event is not None for event in full_run_events)
    assert all(event.kind != "delegation_context" for event in full_run_events if event is not None)

    reloaded_store.select_agent("coder-1")
    reloaded_view = WorkspaceView(reloaded_store)
    qtbot.addWidget(reloaded_view)
    reloaded_header = reloaded_view.transcript_scroll.transcript_model.event_at(0)
    assert reloaded_header is not None
    assert reloaded_header.kind == "delegation_context"
    reloaded_expanded = _event_html(0, reloaded_header, False, delegation_collapsed=False)
    assert "TASK: implement the transcript fix" in reloaded_expanded
    assert "Mode: background" in reloaded_expanded


@verifies(SWR.SWR_2417)
def test_tool_calls_flow_from_sdk_events_into_chat_rows(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        action = action_event(sdk)
        h.event(action)
        h.event(observation_event(sdk, action, output="3 passed in 0.21s"))
        h.event(message_event(sdk, "All tests pass."))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    tool_rows = [e for e in store.transcript if e.kind == "tool"]
    assert len(tool_rows) == 1
    assert tool_rows[0].tool == "shell"
    assert "pytest -x -q" in tool_rows[0].text
    assert "3 passed" in tool_rows[0].detail
    assert tool_rows[0].role == "coder-1"
    assert tool_rows[0].timestamp  # tool rows carry a wall-clock timestamp
    assert len(tool_rows[0].full_text) >= len(tool_rows[0].text)
    assert len(tool_rows[0].full_detail) >= len(tool_rows[0].detail)

    message_rows = [e for e in store.transcript if e.kind == "message"]
    assert any("All tests pass." in e.text for e in message_rows)

    store.select_agent("coder-1")
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    rendered = _transcript_text(view)
    assert "shell" in rendered
    assert "pytest -x -q" in rendered
    assert "3 passed" in rendered
    assert "All tests pass." in rendered


@verifies(SWR.SWR_2419)
def test_file_diff_flows_from_sdk_observation_into_rotaris_transcript(tmp_path, qtbot) -> None:
    """Productive use: a desktop user can inspect an agent's successful file edit.
    Expected outcome: the structured diff survives reload beside its matching tool row.
    """
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    diff_payload: dict[str, object] = {
        "path": "src/widget.py",
        "operation": "replace",
        "added_lines": 1,
        "removed_lines": 1,
        "entries": [
            {"kind": "context", "line_number": 6, "text": "def render():"},
            {"kind": "delete", "line_number": 7, "text": '    return "old"'},
            {"kind": "add", "line_number": 7, "text": '    return "new"'},
        ],
    }
    try:
        action = action_event(
            sdk,
            command="replace src/widget.py",
            tool_name="write_file",
        )
        h.event(action)
        h.event(observation_event(sdk, action, output="File updated.", ui_diff=diff_payload))
        h.drain()

        assert len(h.state.ui_edit_diffs) == 1
        assert all(event.get("role") != "edit_diff" for event in h.state.transcript_events)
        assert 'return "old"' not in str(h.state.transcript_events)
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    kinds = [event.kind for event in store.transcript]
    tool_index = kinds.index("tool")
    assert kinds[tool_index + 1] == "edit_diff"
    diff_event = store.transcript[tool_index + 1]
    assert diff_event.role == "coder-1"
    assert diff_event.diff is not None
    assert diff_event.diff.path == "src/widget.py"
    assert [line.kind for line in diff_event.diff.entries] == ["context", "delete", "add"]
    assert "src/widget.py" in diff_event.text
    assert '[7]-     return "old"' in diff_event.text
    assert '[7]+     return "new"' in diff_event.text

    store.select_agent("coder-1")
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    rendered = _transcript_text(view)
    assert "src/widget.py" in rendered
    assert 'return "old"' in rendered
    assert 'return "new"' in rendered


@verifies(SWR.SWR_2419)
def test_malformed_or_failed_file_edit_does_not_create_diff(tmp_path) -> None:
    """Productive use: a desktop user can trust that shown diffs represent successful edits.
    Expected outcome: malformed UI metadata and failed tool calls produce no diff block.
    """
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        malformed_action = action_event(sdk, tool_name="write_file")
        h.event(malformed_action)
        h.event(
            observation_event(
                sdk,
                malformed_action,
                output="File updated.",
                ui_diff={"path": "src/widget.py"},
            )
        )
        failed_action = action_event(sdk, call_id="call-2", tool_name="write_file")
        h.event(failed_action)
        h.event(
            sdk.AgentErrorEvent(
                source="agent",
                tool_name="write_file",
                tool_call_id="call-2",
                error="write failed",
            )
        )
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    assert h.state.ui_edit_diffs == []
    assert all(event.kind != "edit_diff" for event in store.transcript)


@verifies(SWR.SWR_2417, SWR.SWR_2015)
def test_tool_result_full_detail_capped_with_ellipsis(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        action = action_event(sdk)
        h.event(action)
        h.event(observation_event(sdk, action, output="x" * 5000))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    tool_rows = [e for e in store.transcript if e.kind == "tool"]
    assert len(tool_rows) == 1
    assert len(tool_rows[0].full_detail) <= h.observer._TOOL_FULL_MAX + 10
    assert tool_rows[0].full_detail.endswith("…")


@verifies(SWR.SWR_2013, SWR.SWR_2084, SWR.SWR_2011, SWR.SWR_2012, SWR.SWR_2014)
def test_tool_call_metrics_update_while_conversation_is_running(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.event(action_event(sdk))
        h.drain()

        # Conversation has not returned. Inspector state must still reflect
        # the call immediately, before the backend's end-of-run tracker sync.
        assert h.state.global_tool_call_count == 1
        assert h.state.agent_metrics["coder-1"].tool_call_count == 1
        assert h.state.agent_metrics["coder-1"].tool_calls == {"shell": 1}

        # Replayed SDK event must not inflate the displayed count.
        h.event(action_event(sdk))
        h.drain()
        assert h.state.global_tool_call_count == 1
        assert h.state.agent_metrics["coder-1"].tool_call_count == 1

        h.event(action_event(sdk, call_id="call-2", tool_name="delegate"))
        h.drain()
        assert h.state.global_tool_call_count == 2
        assert h.state.agent_metrics["coder-1"].tool_call_count == 2

        store = h.reload_into_store(tmp_path)
        child = store.agents["coder-1"]
        assert child.tool_calls == 2
        assert child.called_tools == ["shell", "delegate"]

        assert store.run_summary.tool_calls == 2
        assert "orchestrator" not in store.agents

        view = WorkspaceView(store)
        qtbot.addWidget(view)
        assert view.run_header is not None
    finally:
        h.close()


@verifies(SWR.SWR_2057)
def test_action_thought_text_shows_as_agent_message(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        action = action_event(
            sdk, thought=[sdk.TextContent(text="Let me run the unit suite first.")]
        )
        h.event(action)
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    message_rows = [e for e in store.transcript if e.kind == "message"]
    assert any("Let me run the unit suite first." in e.text for e in message_rows)


@verifies(SWR.SWR_2417)
def test_tool_failures_are_visible_in_chat(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        action = action_event(sdk, call_id="call-9")
        h.event(action)
        h.event(
            sdk.AgentErrorEvent(
                source="agent",
                tool_name="shell",
                tool_call_id="call-9",
                error="command not found: pytest",
            )
        )
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    rendered = "\n".join(f"{e.kind} {e.text} {e.detail}" for e in store.transcript)
    assert "command not found: pytest" in rendered


@verifies(SWR.SWR_2058)
def test_streaming_tokens_render_live_and_finalize_without_duplication(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.token(token_chunk("Hello "))
        h.token(token_chunk("world."))
        h.drain()
        live = [e for e in h.state.transcript_events if e.get("role") == "agent"]
        assert len(live) == 1
        assert live[0]["content"] == "Hello world."

        # committed message must replace the streamed segment, not duplicate it
        h.event(message_event(sdk, "Hello world."))
        h.drain()

        # a later, separate message must become a NEW row (not merged/dropped)
        h.token(token_chunk("Second "))
        h.token(token_chunk("answer."))
        h.drain()
        h.event(message_event(sdk, "Second answer."))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    agent_rows = [e for e in store.transcript if e.kind == "message"]
    assert [e.text for e in agent_rows] == ["Hello world.", "Second answer."]


@verifies(SWR.SWR_2056)
def test_replayed_committed_message_does_not_duplicate_transcript_row(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        message = message_event(sdk, "Final answer.")
        h.event(message)
        # Resume replay reconstructs the SDK object but preserves its event ID.
        h.event(message.model_copy())
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    agent_rows = [e for e in store.transcript if e.kind == "message"]
    assert [e.text for e in agent_rows] == ["Final answer."]


@verifies(SWR.SWR_2057)
def test_cumulative_committed_messages_update_one_transcript_row(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.event(message_event(sdk, "Draft"))
        h.event(message_event(sdk, "Draft complete"))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    agent_rows = [e for e in store.transcript if e.kind == "message"]
    assert [e.text for e in agent_rows] == ["Draft complete"]


@verifies(SWR.SWR_2059)
def test_committed_messages_across_tool_boundary_remain_distinct(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.event(message_event(sdk, "Checking."))
        h.event(action_event(sdk))
        h.event(message_event(sdk, "Checking."))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    agent_rows = [e for e in store.transcript if e.kind == "message"]
    assert [e.text for e in agent_rows] == ["Checking.", "Checking."]


@verifies(SWR.SWR_2027)
def test_reasoning_streams_into_thinking_rows(tmp_path, qtbot) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.token(token_chunk(reasoning="The suite is small, "))
        h.token(token_chunk(reasoning="run it directly."))
        h.event(action_event(sdk))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    thinking_rows = [e for e in store.transcript if e.kind == "thinking"]
    assert len(thinking_rows) == 1
    assert thinking_rows[0].text == "The suite is small, run it directly."

    store.select_agent("coder-1")
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    assert "run it directly." in _transcript_text(view)


@verifies(SWR.SWR_2027)
def test_action_reasoning_content_becomes_thinking_row(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.event(action_event(sdk, reasoning_content="Check the failing module before editing."))
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    thinking_rows = [e for e in store.transcript if e.kind == "thinking"]
    assert any("Check the failing module" in e.text for e in thinking_rows)


@verifies(SWR.SWR_2028)
def test_agent_todo_state_takes_priority_over_run_todo(tmp_path) -> None:
    h = ObserverHarness(tmp_path)
    try:
        h.state.todo_state = {
            "phases": [{"tasks": [{"id": "1", "name": "outer task", "status": "PENDING"}]}]
        }
        h.state.agent_todo_state = {
            "phases": [
                {
                    "id": "phase-agent",
                    "name": "Agent plan",
                    "tasks": [
                        {"id": "a", "name": "map handlers", "status": "COMPLETED"},
                        {"id": "b", "name": "convert session", "status": "IN_PROGRESS"},
                    ],
                }
            ]
        }
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    assert store.todos == [
        TodoItem("a", "phase-agent", "done", "map handlers", "Agent plan"),
        TodoItem("b", "phase-agent", "active", "convert session", "Agent plan"),
    ]


@verifies(SWR.SWR_2072, SWR.SWR_2073)
def test_composer_persona_and_reasoning_overrides_reach_run_config(tmp_path, qtbot) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    store.personas = [
        SimpleNamespace(name="orchestrator"),
        SimpleNamespace(name="coder"),
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    view.persona_combo.setCurrentText("coder")
    view.reasoning_combo.setCurrentText("reasoning: low")

    config = service.build_run_config()
    assert config.default_persona == "coder"
    assert config.personas["coder"].thinking == "low"
    # the untouched persona keeps its configured reasoning
    assert config.personas["orchestrator"].thinking == "high"


@verifies(SWR.SWR_2024)
def test_summarized_run_failure_emits_run_failed_for_recovery(tmp_path, qtbot, monkeypatch) -> None:
    """In-run failures RalphLoop swallowed (e.g. auth errors abandoned into the
    progress summary) must surface via run_failed, not run_finished — the
    window's auth-failure recovery (fallback retry + reauth prompt) listens
    only on run_failed."""
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    service.session_manager = SessionManager(tmp_path)

    async def fake_run_task(
        prompt,
        config,
        manager,
        state,
        max_iterations,
        interrupt_handler=None,
        iteration_observer=None,
        delegation_strategy=None,
    ):
        return SimpleNamespace(iterations=[])

    failure_summary = (
        "Run failed: Conversation run failed for id=58fb4c45: "
        "litellm.AuthenticationError: AuthenticationError: DeepseekException - "
        "Authentication Fails (governor)"
    )
    monkeypatch.setattr("rotaris_core.cli.background._run_task", fake_run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("failed", failure_summary, "error"),
    )

    bridge = RunBridge(tmp_path, store, service)
    try:
        with qtbot.waitSignal(bridge.run_failed, timeout=15_000) as blocker:
            assert bridge.start("fix the bug") is True
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
    finally:
        bridge.shutdown()

    assert "AuthenticationError" in blocker.args[0]
    from rotaris_core.llm_errors import is_auth_error

    assert is_auth_error(blocker.args[0])  # the recovery trigger must match


@verifies(SWR.SWR_2007, SWR.SWR_2065)
def test_run_bridge_end_to_end_polls_events_into_store(tmp_path, qtbot, monkeypatch) -> None:
    """Full loop: RunBridge QThread → observer → persisted snapshots → store."""
    sdk = sdk_events()
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    service.session_manager = SessionManager(tmp_path)

    async def fake_run_task(
        prompt,
        config,
        manager,
        state,
        max_iterations,
        interrupt_handler=None,
        iteration_observer=None,
        delegation_strategy=None,
    ):
        state.transcript_events.append({"role": "user", "content": prompt})
        scheduler = SimpleNamespace(
            _conversation_event_callback=None,
            _conversation_token_callback=None,
            _spawn_notification_callback=None,
            _stall_callback=None,
        )
        iteration_observer.bind_ralph_loop(SimpleNamespace(scheduler=scheduler))
        iteration_observer.bind_scheduler_callbacks(SimpleNamespace(snapshot_children=list))
        record = SimpleNamespace(canonical_name="coder-1", persona="coder")
        action = action_event(sdk)
        scheduler._conversation_event_callback(record, action)
        scheduler._conversation_event_callback(record, observation_event(sdk, action))
        scheduler._conversation_event_callback(record, message_event(sdk, "Task complete."))
        await asyncio.sleep(0.05)
        return SimpleNamespace(iterations=[])

    monkeypatch.setattr("rotaris_core.cli.background._run_task", fake_run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=15_000):
            assert bridge.start("run the tests") is True
        # Regression (Qt process abort): every thread exit path must join the
        # OS thread before dropping the reference — a bridge garbage-collected
        # right after run_finished used to destroy a QThread that was still
        # winding down, which is a qFatal in Qt.
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
        with qtbot.waitSignal(bridge.run_finished, timeout=15_000):
            assert bridge.start("run the tests again") is True
    finally:
        bridge.shutdown()
    assert bridge._thread is None

    assert store.session_status == "completed"
    kinds = [e.kind for e in store.transcript]
    assert "user" in kinds
    assert "tool" in kinds
    texts = "\n".join(f"{e.text} {e.detail}" for e in store.transcript)
    assert "run the tests" in texts
    assert "pytest -x -q" in texts
    assert "Task complete." in texts
    assert "Run finished." in texts


@verifies(SWR.SWR_2912, SWR.SWR_2913)
def test_a_finished_run_leaves_no_live_agent(tmp_path, qtbot) -> None:
    """Productive use: a user watches a run finish and reads one consistent story.
    Expected outcome: the run header says finished and no agent row still pulses.

    Driven through the shipped path — real session snapshot, real
    ``ConfigService`` reload, real ``WorkspaceView`` — because the contradiction
    this covers was only ever visible on the other side of that reload: the
    optimistic in-memory update said cancelled, and the final refresh read
    ``running`` straight back off disk.
    """
    h = ObserverHarness(tmp_path)
    try:
        # A delegating orchestrator whose record the run never closed, beside a
        # child that never got dispatched — the exact snapshot the bug wrote.
        h.records = [
            SimpleNamespace(
                canonical_name="take-the-next-open-requirement",
                persona="orchestrator",
                model_dump=lambda *, mode: {
                    "canonical_name": "take-the-next-open-requirement",
                    "persona": "orchestrator",
                    "state": "running",
                    "task_payload": "Coordinating the run",
                },
            ),
            SimpleNamespace(
                canonical_name="implement-swr-167",
                persona="coder",
                model_dump=lambda *, mode: {
                    "canonical_name": "implement-swr-167",
                    "persona": "coder",
                    "state": "queued",
                    "parent_agent_id": "take-the-next-open-requirement",
                    "task_payload": "Implement it",
                },
            ),
        ]
        h.observer.bind_scheduler_callbacks(h.child_manager)
        h.event(message_event(sdk_events(), "Delegated the work."))
        h.drain()

        # The run ends the way the bridge ends one: a terminal execution status.
        h.state.execution_status = "completed"
        store = h.reload_into_store(tmp_path)

        view = WorkspaceView(store)
        qtbot.addWidget(view)

        assert store.session_status == "completed"
        assert store.run_state.busy is False
        assert store.agents, "the reload projected no agents at all"
        assert sum(1 for agent in store.agents.values() if agent.is_live) == 0
        assert view.live_label.text() == "0 live"
        assert "running" not in view.inspector_meta.text()
    finally:
        h.close()
