import datetime as dt
from pathlib import Path

from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import AgentMetrics, SessionState
from rotaris_core.tokens import TokenSnapshot
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask
from rotaris_core.tui.render_state import RenderState
from rotaris_core.tui.view_model import build_focused_agent_badge, build_screen_view_model
from rotaris_core.tui.widgets.top_bar import TopBar


@verifies(SWR.SWR_1421, SWR.SWR_1250)
def test_focused_agent_badge_falls_back_without_selection() -> None:
    badge = build_focused_agent_badge([], None)

    assert badge.text == "No agent selected"
    assert badge.state == "none"
    assert not badge.has_agent


@verifies(SWR.SWR_1421, SWR.SWR_1248)
def test_focused_agent_badge_elapsed_increases_for_running_agent() -> None:
    agent = {
        "name": "impl-task",
        "canonical_name": "orch.impl",
        "state": "running",
        "started_at": 10.0,
    }

    first = build_focused_agent_badge([agent], "orch.impl", monotonic_now=72.0)
    second = build_focused_agent_badge([agent], "orch.impl", monotonic_now=75.0)

    assert first.text == "orch.impl · 1:02"
    assert second.text == "orch.impl · 1:05"


@verifies(SWR.SWR_1421, SWR.SWR_1248)
def test_focused_agent_badge_elapsed_freezes_for_terminal_agent() -> None:
    agent = {
        "name": "impl-task",
        "canonical_name": "orch.impl",
        "state": "succeeded",
        "spawned_at": "2026-05-21T10:00:00+00:00",
        "completed_at": "2026-05-21T10:02:03+00:00",
    }
    later = dt.datetime(2026, 5, 21, 10, 30, tzinfo=dt.UTC)

    badge = build_focused_agent_badge([agent], "orch.impl", now=later)

    assert badge.text == "orch.impl · 2:03"


@verifies(SWR.SWR_1421, SWR.SWR_1249)
def test_top_bar_focus_badge_state_mapping() -> None:
    top_bar = TopBar()

    assert top_bar._badge_class_state("running") == "running"
    assert top_bar._badge_class_state("queued") == "waiting"
    assert top_bar._badge_class_state("waiting_on_dependencies") == "waiting"
    assert top_bar._badge_class_state("succeeded") == "succeeded"
    assert top_bar._badge_class_state("failed") == "failed"
    assert top_bar._badge_class_state("cancelled") == "cancelled"
    assert top_bar._badge_class_state("blocked") == "cancelled"


@verifies(SWR.SWR_1421, SWR.SWR_1258, SWR.SWR_1260)
def test_view_model_includes_mcp_source_field() -> None:
    config = RotarisConfig()
    config.mcp_servers = {
        "yaml-server": MCPServerConfig(command="node", args=["test.js"], type="stdio"),
        "proj-server": MCPServerConfig(url="http://localhost:1234", type="http"),
    }
    config.mcp_server_sources = {"yaml-server": "yaml", "proj-server": "discovered-project"}

    render_state = RenderState()

    view_model = build_screen_view_model(
        session=None,
        config=config,
        render_state=render_state,
        focused_agent_id=None,
        active_model_key=None,
        show_tool_events=False,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=[],
    )

    mcp_servers = view_model.info_kwargs.get("mcp_servers", [])
    assert len(mcp_servers) == 2

    # Verify they have source and type
    yaml_srv = next(s for s in mcp_servers if s["name"] == "yaml-server")
    assert yaml_srv["source"] == "yaml"
    assert yaml_srv["type"] == "stdio"
    assert yaml_srv["status"] == "active"

    proj_srv = next(s for s in mcp_servers if s["name"] == "proj-server")
    assert proj_srv["source"] == "discovered-project"
    assert proj_srv["type"] == "http"
    assert proj_srv["status"] == "active"


@verifies(SWR.SWR_1421)
def test_view_model_includes_persisted_metric_fallbacks() -> None:
    now = dt.datetime.now(dt.UTC)
    session = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        token_usage=TokenSnapshot(prompt_tokens=200, completion_tokens=50).model_dump(mode="json"),
        global_tool_call_count=4,
        global_compressions=2,
        agent_metrics={
            "agent-a": AgentMetrics(
                tool_call_count=4,
                tool_calls={"read_file": 3, "write_file": 1},
                token_usage=TokenSnapshot(prompt_tokens=200, completion_tokens=50),
                compressions=2,
            ),
        },
    )

    view_model = build_screen_view_model(
        session=session,
        config=RotarisConfig(),
        render_state=RenderState(),
        focused_agent_id=None,
        active_model_key=None,
        show_tool_events=False,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=[],
    )

    assert view_model.info_kwargs["token_estimate"] == 250
    assert view_model.info_kwargs["tool_call_count"] == 4
    assert view_model.info_kwargs["compression_count"] == 2
    assert view_model.info_kwargs["agent_metrics"] == [
        {
            "name": "agent-a",
            "tokens": 250,
            "context_tokens": 0,
            "tool_call_count": 4,
            "compressions": 2,
        },
    ]


@verifies(SWR.SWR_1243, SWR.SWR_1244)
def test_view_model_merges_user_only_edit_diffs_without_inflating_token_estimate() -> None:
    now = dt.datetime.now(dt.UTC)
    session = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        transcript_events=[
            {
                "role": "tool",
                "name": "agent-a",
                "content": "write file",
                "phase": "completed",
                "tool_name": "write file",
                "tool_terminal": True,
                "tool_event_key": "tool:call-1",
            },
        ],
        ui_edit_diffs=[
            {
                "diff_id": "agent-a:tool:call-1",
                "agent_name": "agent-a",
                "tool_name": "write file",
                "tool_event_key": "tool:call-1",
                "path": "sample.txt",
                "operation": "edit",
                "added_lines": 1,
                "removed_lines": 1,
                "entries": [
                    {"kind": "delete", "line_number": 1, "text": "old"},
                    {"kind": "add", "line_number": 1, "text": "new" * 500},
                ],
            },
        ],
    )
    render_state = RenderState()

    view_model = build_screen_view_model(
        session=session,
        config=RotarisConfig(),
        render_state=render_state,
        focused_agent_id="agent-a",
        active_model_key=None,
        show_tool_events=True,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=[],
    )

    assert [event["role"] for event in view_model.transcript_events] == ["tool", "edit_diff"]
    assert view_model.info_kwargs["token_estimate"] == len("write file") // 4


@verifies(SWR.SWR_1421, SWR.SWR_1537)
def test_view_model_groups_artifacts_for_focused_agent(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    produced = store.publish(slug="plan", title="Plan", body="plan", persona="planner")
    received = store.publish(
        slug="research",
        title="Research",
        body="research",
        persona="codebase-analyst",
    )
    store.mark_consumed(received.id, "planner")
    now = dt.datetime.now(dt.UTC)
    session = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        child_states=[
            {
                "canonical_name": "planner",
                "name": "planner",
                "persona": "planner",
                "state": "succeeded",
                "produced_artifact_ids": [produced.id],
                "received_artifact_ids": [received.id],
            },
        ],
    )

    view_model = build_screen_view_model(
        session=session,
        config=RotarisConfig(),
        render_state=RenderState(),
        focused_agent_id="planner",
        focused_artifact_id=received.id,
        active_model_key=None,
        show_tool_events=False,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=session.child_states,
        artifact_store=store,
    )

    assert view_model.info_kwargs["artifacts_produced"] == [
        {
            "id": produced.id,
            "slug": "plan",
            "title": "Plan",
            "kind": "agent_published",
            "source_persona": "planner",
            "status": "published",
            "edited": False,
            "read": False,
        },
    ]
    assert view_model.info_kwargs["artifacts_received"] == [
        {
            "id": received.id,
            "slug": "research",
            "title": "Research",
            "kind": "agent_published",
            "source_persona": "codebase-analyst",
            "status": "published",
            "edited": False,
            "read": True,
        },
    ]
    assert view_model.info_kwargs["artifacts_all"] == []
    assert view_model.info_kwargs["focused_artifact_id"] == received.id


@verifies(SWR.SWR_1421)
def test_view_model_lists_all_artifacts_without_focused_agent(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    first = store.publish(slug="first", title="First", body="one", persona="planner")
    second = store.publish(slug="second", title="Second", body="two", persona="architect")
    now = dt.datetime.now(dt.UTC)
    session = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    )

    view_model = build_screen_view_model(
        session=session,
        config=RotarisConfig(),
        render_state=RenderState(),
        focused_agent_id=None,
        focused_artifact_id=second.id,
        active_model_key=None,
        show_tool_events=False,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=[],
        artifact_store=store,
    )

    assert [row["id"] for row in view_model.info_kwargs["artifacts_all"]] == [
        first.id,
        second.id,
    ]
    assert [row["read"] for row in view_model.info_kwargs["artifacts_all"]] == [False, False]
    assert view_model.info_kwargs["artifacts_produced"] == []
    assert view_model.info_kwargs["artifacts_received"] == []


def _todo_payload(task_name: str) -> dict:
    return TodoList(phases=[TodoPhase(name="Main", tasks=[TodoTask(name=task_name)])]).model_dump(
        mode="json"
    )


@verifies(SWR.SWR_1041)
def test_view_model_prefers_the_focused_childs_own_todo_state() -> None:
    """Productive use: focusing a child agent shows that child's plan, not the parent's.
    Expected outcome: the todo pane is fed from `ChildTaskRecord.todo_state`."""
    now = dt.datetime.now(dt.UTC)
    session = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        agent_todo_state=_todo_payload("parent task"),
        child_states=[
            {
                "name": "impl-task",
                "canonical_name": "orch.impl",
                "state": "running",
                "todo_state": _todo_payload("child task"),
            }
        ],
    )

    view_model = build_screen_view_model(
        session=session,
        config=RotarisConfig(),
        render_state=RenderState(),
        focused_agent_id="orch.impl",
        active_model_key=None,
        show_tool_events=False,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=list(session.child_states),
    )

    assert view_model.todo is not None
    assert view_model.todo.phases[0].tasks[0].name == "child task"
    assert view_model.todo_source == "orch.impl"


@verifies(SWR.SWR_1041)
def test_view_model_falls_back_to_session_todo_when_child_has_none() -> None:
    """Productive use: a child without its own plan still shows the run-level plan.
    Expected outcome: resolution falls back to `session.agent_todo_state`."""
    now = dt.datetime.now(dt.UTC)
    session = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        agent_todo_state=_todo_payload("parent task"),
        child_states=[
            {
                "name": "impl-task",
                "canonical_name": "orch.impl",
                "state": "running",
                "todo_state": None,
            }
        ],
    )

    view_model = build_screen_view_model(
        session=session,
        config=RotarisConfig(),
        render_state=RenderState(),
        focused_agent_id="orch.impl",
        active_model_key=None,
        show_tool_events=False,
        live_agent_activity={},
        recent_activity_events=[],
        system_prompt_chars=0,
        merged_child_states=list(session.child_states),
    )

    assert view_model.todo is not None
    assert view_model.todo.phases[0].tasks[0].name == "parent task"
    assert view_model.todo_source == "agent"
