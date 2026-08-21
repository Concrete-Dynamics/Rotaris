from __future__ import annotations

import datetime as dt
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from rotaris_core.edit_diff import EditDiffArtifact
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
    from rotaris_core.orchestrator.artifacts import ArtifactRecord, SessionArtifactStore
    from rotaris_core.session.state import SessionState
    from rotaris_core.tools.todo_state import TodoList
    from rotaris_core.tui.render_state import RenderState


def _check_mcp_server_available(server_cfg: MCPServerConfig | None) -> str:
    """Return 'active' or 'unavailable' based on whether the server command is on PATH.

    HTTP/SSE servers are always considered active (no connection check without a live
    agent).  Stdio servers are checked via ``shutil.which`` after command resolution.
    """
    srv_type = getattr(server_cfg, "type", "stdio") if server_cfg else "stdio"
    if srv_type in ("http", "sse"):
        return "active"
    import shutil

    from rotaris_core.config.mcp_resolution import resolve_command

    raw_command = str(getattr(server_cfg, "command", None) or "")
    if not raw_command:
        return "active"
    args = list(getattr(server_cfg, "args", []) or [])
    resolved_command, _ = resolve_command(raw_command, args)
    return "active" if shutil.which(resolved_command) is not None else "unavailable"


@dataclass
class ScreenViewModel:
    child_states: list[dict[str, Any]] = field(default_factory=list)
    transcript_events: list[dict[str, Any]] = field(default_factory=list)
    focused_badge: FocusedAgentBadge = field(default_factory=lambda: FocusedAgentBadge.empty())
    todo: TodoList | None = None
    todo_source: str = "agent"
    info_kwargs: dict[str, Any] = field(default_factory=dict)
    warnings_list: list[dict[str, Any]] = field(default_factory=list)
    is_running: bool = False
    session_id: str | None = None


@dataclass(frozen=True, slots=True)
class FocusedAgentBadge:
    label: str
    state: str
    elapsed: str | None = None
    has_agent: bool = False

    @classmethod
    def empty(cls) -> FocusedAgentBadge:
        return cls(label="No agent selected", state="none")

    @property
    def text(self) -> str:
        if self.elapsed:
            return f"{self.label} · {self.elapsed}"
        return self.label


_TERMINAL_AGENT_STATES = frozenset({"succeeded", "failed", "cancelled", "blocked"})


def build_focused_agent_badge(
    child_states: list[dict[str, Any]],
    focused_agent_id: str | None,
    *,
    now: dt.datetime | None = None,
    monotonic_now: float | None = None,
) -> FocusedAgentBadge:
    if focused_agent_id is None:
        return FocusedAgentBadge.empty()

    focused = _find_focused_child(child_states, focused_agent_id)
    if focused is None:
        return FocusedAgentBadge.empty()

    label = str(
        focused.get("display_name")
        or focused.get("canonical_name")
        or focused.get("name")
        or focused_agent_id,
    )
    state = str(focused.get("state") or "unknown")
    elapsed_seconds = _focused_elapsed_seconds(
        focused,
        state,
        now=now or dt.datetime.now(dt.UTC),
        monotonic_now=time.monotonic() if monotonic_now is None else monotonic_now,
    )
    elapsed = _format_badge_elapsed(elapsed_seconds) if elapsed_seconds is not None else None
    return FocusedAgentBadge(label=label, state=state, elapsed=elapsed, has_agent=True)


def _find_focused_child(
    child_states: list[dict[str, Any]],
    focused_agent_id: str,
) -> dict[str, Any] | None:
    for child in child_states:
        canonical = str(child.get("canonical_name") or child.get("name") or "")
        if canonical == focused_agent_id:
            return child
    return None


def _focused_elapsed_seconds(
    child: dict[str, Any],
    state: str,
    *,
    now: dt.datetime,
    monotonic_now: float,
) -> float | None:
    start_value = child.get("spawned_at", child.get("started_at"))
    if start_value is None:
        return None

    is_terminal = state in _TERMINAL_AGENT_STATES
    end_value = child.get("completed_at") if is_terminal else None
    if is_terminal and end_value is None:
        return None
    if isinstance(start_value, int | float):
        start = float(start_value)
        if isinstance(end_value, int | float):
            return max(0.0, float(end_value) - start)
        return max(0.0, monotonic_now - start)

    start_dt = _parse_datetime(start_value)
    if start_dt is None:
        return None
    if end_value is not None:
        end_dt = _parse_datetime(end_value)
        if end_dt is not None:
            return max(0.0, (end_dt - start_dt).total_seconds())
    return max(0.0, (now - start_dt).total_seconds())


def _parse_datetime(value: object) -> dt.datetime | None:
    if isinstance(value, dt.datetime):
        parsed = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = dt.datetime.fromisoformat(raw)
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _format_badge_elapsed(seconds: float) -> str:
    total = int(seconds)
    minutes, secs = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _artifact_info(
    record: ArtifactRecord,
    *,
    reader_persona: str | None = None,
) -> dict[str, Any]:
    return {
        "id": record.id,
        "slug": record.slug,
        "title": record.title,
        "kind": record.kind,
        "source_persona": record.source_persona,
        "status": record.status,
        "edited": record.edited_at is not None,
        "read": reader_persona in record.consumed_by if reader_persona is not None else False,
    }


def _artifact_infos_by_id(
    artifact_store: SessionArtifactStore,
    artifact_ids: list[str],
    *,
    reader_persona: str | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for artifact_id in artifact_ids:
        if artifact_id in seen:
            continue
        seen.add(artifact_id)
        record = artifact_store.get(artifact_id)
        if record is None or record.superseded_by is not None:
            continue
        rows.append(_artifact_info(record, reader_persona=reader_persona))
    return rows


@traces(SWR.SWR_1043, SWR.SWR_1246)
def build_screen_view_model(
    session: SessionState | None,
    config: RotarisConfig | None,
    render_state: RenderState,
    focused_agent_id: str | None,
    active_model_key: str | None,
    show_tool_events: bool,
    live_agent_activity: dict[str, dict[str, Any]],
    recent_activity_events: list[dict[str, Any]],
    system_prompt_chars: int,
    merged_child_states: list[dict[str, Any]],
    artifact_store: SessionArtifactStore | None = None,
    focused_artifact_id: str | None = None,
) -> ScreenViewModel:
    from rotaris_core.tools.todo_state import TodoList

    todo: TodoList | None = None
    todo_source = "agent"
    transcript_events: list[dict[str, Any]] = []
    focused_badge = build_focused_agent_badge(merged_child_states, focused_agent_id)

    # Resolve the focused child state BEFORE todo resolution so per-child
    # todo_state can take priority (REQ-20260429-120000-003).
    info_kwargs: dict[str, Any] = {}
    focused_persona_name: str | None = None
    focused_child_state: dict[str, Any] | None = None
    if focused_agent_id is not None and session is not None:
        for child in session.child_states:
            canonical = str(child.get("canonical_name") or child.get("name") or "")
            if canonical == focused_agent_id:
                focused_child_state = child
                focused_persona_name = str(child.get("persona") or "") or None
                break

    if session is not None:
        transcript_events = _merge_user_only_edit_diffs(
            session.transcript_events,
            session.ui_edit_diffs,
        )
        # Per-child todo takes priority when a child is focused and has todo_state
        # (REQ-20260429-120000-003).
        if focused_child_state is not None and focused_child_state.get("todo_state"):
            todo = TodoList.model_validate(focused_child_state["todo_state"])
            todo_source = str(
                focused_child_state.get("canonical_name")
                or focused_child_state.get("name", "child")
            )
        elif session.agent_todo_state is not None:
            todo = TodoList.model_validate(session.agent_todo_state)
            todo_source = "agent"
        elif session.todo_state is not None:
            todo = TodoList.model_validate(session.todo_state)
            todo_source = "plan"
    if config is not None and focused_persona_name is None:
        focused_persona_name = config.default_persona

    focused_persona_cfg = None
    if config is not None and focused_persona_name is not None:
        focused_persona_cfg = config.personas.get(focused_persona_name)

    if config is not None:
        info_kwargs["workspace"] = str(config.workspace_root)

    # REQ-20260413-204058-022: the right panel must show the model for the
    # *focused* agent, not always the top-level active model override.
    #
    # The runtime (app.py agent_factory) only applies active_model_key to the
    # default/top-level persona; child agents always run on their own configured
    # model.  Mirror that same rule here so the display stays in sync with what
    # each agent actually uses.
    focused_is_default = config is not None and focused_persona_name == config.default_persona
    if active_model_key and focused_is_default:
        info_kwargs["model_name"] = active_model_key
    elif focused_persona_cfg is not None and focused_persona_cfg.model:
        info_kwargs["model_name"] = focused_persona_cfg.model
    elif active_model_key:
        # Fallback: no persona config resolved (pre-session state), show the
        # active model key so the panel is never blank.
        info_kwargs["model_name"] = active_model_key

    # Compute the resolved compression threshold from the active model's context
    # capacity and the global percentage setting.  Store in info_kwargs so the
    # InfoPane can display it in the header, and reuse the same object in the
    # warnings block below to avoid duplicate computation.
    if config is not None and hasattr(config, "compressor"):
        from rotaris_core.config.compression import resolve_compression_threshold

        model_config_for_threshold = None
        model_name_for_threshold = info_kwargs.get("model_name")
        if isinstance(model_name_for_threshold, str):
            model_config_for_threshold = config.models.get(model_name_for_threshold)
        resolved = resolve_compression_threshold(config, model_config_for_threshold)
        if (
            isinstance(resolved.percentage, int)
            and isinstance(resolved.tokens, int)
            and isinstance(resolved.capacity, int)
        ):
            info_kwargs["compression_threshold_percentage"] = resolved.percentage
            info_kwargs["compression_threshold_tokens"] = resolved.tokens
            info_kwargs["compression_threshold_capacity"] = resolved.capacity

    if session is not None:
        info_kwargs["has_session"] = True
        token_data = session.token_usage
        total_tokens = 0
        if isinstance(token_data, dict):
            prompt = token_data.get("prompt_tokens", 0) or 0
            completion = token_data.get("completion_tokens", 0) or 0
            total_tokens = int(prompt) + int(completion)
        if total_tokens > 0:
            info_kwargs["token_estimate"] = total_tokens
            info_kwargs["token_is_actual"] = True
        else:
            raw_events = session.transcript_events
            new_count = len(raw_events)
            if new_count > render_state.cached_token_event_count:
                for e in raw_events[render_state.cached_token_event_count :]:
                    render_state.cached_token_chars += len(str(e.get("content", "")))
                render_state.cached_token_event_count = new_count
            total_chars = system_prompt_chars + render_state.cached_token_chars
            info_kwargs["token_estimate"] = total_chars // 4
            info_kwargs["token_is_actual"] = False
        info_kwargs["tool_call_count"] = session.global_tool_call_count
        info_kwargs["compression_count"] = session.global_compressions
        info_kwargs["agent_metrics"] = [
            {
                "name": agent_name,
                "tokens": metrics.token_usage.total_tokens,
                "context_tokens": metrics.last_prompt_tokens,
                "tool_call_count": metrics.tool_call_count,
                "compressions": metrics.compressions,
            }
            for agent_name, metrics in session.agent_metrics.items()
            if (
                metrics.token_usage.total_tokens > 0
                or metrics.tool_call_count > 0
                or metrics.compressions > 0
            )
        ]

    if config is not None:
        # Pre-run: show ALL configured MCP servers with live availability checks so the
        # user can see which ones are working before starting a task.
        # During/after a run: show only the focused persona's servers.  The factory
        # already excluded unavailable ones, so status is always "active" here.
        if session is None:
            mcp_names = list(config.mcp_servers)
        elif focused_persona_cfg is not None and focused_persona_cfg.mcp_servers:
            mcp_names = [
                name for name in focused_persona_cfg.mcp_servers if name in config.mcp_servers
            ]
        else:
            mcp_names = list(config.mcp_servers)

        mcp_servers_info = []
        for name in mcp_names:
            srv = config.mcp_servers.get(name)
            srv_type = getattr(srv, "type", "stdio") if srv else "stdio"
            source = config.mcp_server_sources.get(name, "default")
            # Availability is only checked in pre-run state (no session yet).
            status = _check_mcp_server_available(srv) if session is None else "active"
            mcp_servers_info.append(
                {"name": name, "status": status, "source": source, "type": srv_type},
            )

        info_kwargs["mcp_servers"] = mcp_servers_info

    if session is None and config is not None:
        # Pre-run: show all public built-in tools so the user can see what's available
        # in the system regardless of which persona will be used.
        from rotaris_core.agents.factory import ALLOWED_PUBLIC_TOOL_NAMES

        info_kwargs["tools"] = [
            {"name": name, "used": False} for name in sorted(ALLOWED_PUBLIC_TOOL_NAMES)
        ]
    elif focused_persona_cfg is not None:
        used_tool_names: set[str] = set()
        if focused_agent_id is not None:
            from rotaris_core.tracking.tracker import GlobalTracker

            agent_data = GlobalTracker().get_agent_data(focused_agent_id)
            if agent_data is not None:
                used_tool_names = {
                    name for name, count in agent_data.tool_calls.items() if count > 0
                }
        tool_list: list[dict[str, Any]] = []
        seen: set[str] = set()
        for tool_name in [*focused_persona_cfg.tools, *focused_persona_cfg.custom_tools]:
            if tool_name in seen:
                continue
            seen.add(tool_name)
            tool_list.append({"name": tool_name, "used": tool_name in used_tool_names})
        info_kwargs["tools"] = tool_list

    if session is not None and artifact_store is not None:
        info_kwargs["focused_artifact_id"] = focused_artifact_id
        if focused_child_state is not None:
            produced_ids = [
                str(value)
                for value in (focused_child_state.get("produced_artifact_ids") or [])
                if value
            ]
            received_ids = [
                str(value)
                for value in (focused_child_state.get("received_artifact_ids") or [])
                if value
            ]
            info_kwargs["artifacts_produced"] = _artifact_infos_by_id(
                artifact_store,
                produced_ids,
                reader_persona=focused_persona_name,
            )
            info_kwargs["artifacts_received"] = _artifact_infos_by_id(
                artifact_store,
                received_ids,
                reader_persona=focused_persona_name,
            )
            info_kwargs["artifacts_all"] = []
        else:
            info_kwargs["artifacts_produced"] = []
            info_kwargs["artifacts_received"] = []
            info_kwargs["artifacts_all"] = [
                _artifact_info(record) for record in artifact_store.list(include_superseded=False)
            ]

    context_tokens = int(info_kwargs.get("context_tokens", 0) or 0)
    if context_tokens == 0 and render_state.last_context_tokens > 0:
        context_tokens = render_state.last_context_tokens
        info_kwargs["context_tokens"] = context_tokens

    warnings_list: list[dict[str, Any]] = []
    if config is not None and context_tokens > 0 and hasattr(config, "compressor"):
        threshold = int(info_kwargs.get("compression_threshold_tokens") or 0)
        if threshold > 0 and context_tokens >= threshold * 0.8:
            pct = int((context_tokens / threshold) * 100)
            warnings_list.append(
                {
                    "level": "warning",
                    "text": (
                        f"Context at {pct}% of compression threshold "
                        f"({context_tokens}/{threshold} tokens)"
                    ),
                },
            )

    for event in recent_activity_events:
        if event.get("phase") in {"failed", "blocked"} or event.get("icon") in {"[X]", "✗"}:
            agent_name = event.get("agent_name", "unknown")
            text = event.get("text", "Error occurred")
            warnings_list.append({"level": "error", "text": f"{agent_name}: {text}"})

    is_running = session is not None and session.execution_status == "running"

    return ScreenViewModel(
        child_states=merged_child_states,
        transcript_events=transcript_events,
        focused_badge=focused_badge,
        todo=todo,
        todo_source=todo_source,
        info_kwargs=info_kwargs,
        warnings_list=warnings_list,
        is_running=is_running,
        session_id=session.session_id if session is not None else None,
    )


def _merge_user_only_edit_diffs(
    transcript_events: list[dict[str, Any]],
    ui_edit_diffs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not ui_edit_diffs:
        return list(transcript_events)

    diffs_by_key: dict[tuple[str, str], list[EditDiffArtifact]] = defaultdict(list)
    diffs_by_agent: dict[str, list[EditDiffArtifact]] = defaultdict(list)
    for raw_diff in ui_edit_diffs:
        try:
            diff = EditDiffArtifact.model_validate(raw_diff)
        except Exception:  # noqa: BLE001
            continue
        agent_name = diff.agent_name.strip()
        if not agent_name:
            continue
        diffs_by_agent[agent_name].append(diff)
        if diff.tool_event_key:
            diffs_by_key[(agent_name, diff.tool_event_key)].append(diff)

    merged: list[dict[str, Any]] = []
    emitted_ids: set[str] = set()
    for event in transcript_events:
        merged.append(event)
        if event.get("role") != "tool":
            continue
        agent_name = str(event.get("name", "")).strip()
        if not agent_name:
            continue

        tool_event_key = str(event.get("tool_event_key", "")).strip()
        matched_diffs: list[EditDiffArtifact] = []
        if tool_event_key:
            matched_diffs.extend(diffs_by_key.get((agent_name, tool_event_key), []))

        if not matched_diffs and bool(event.get("tool_terminal")):
            for diff in diffs_by_agent.get(agent_name, []):
                if diff.diff_id in emitted_ids or diff.tool_event_key:
                    continue
                matched_diffs.append(diff)

        for diff in matched_diffs:
            if diff.diff_id in emitted_ids:
                continue
            merged.append(_diff_to_transcript_event(diff))
            emitted_ids.add(diff.diff_id)

    return merged


def _diff_to_transcript_event(diff: EditDiffArtifact) -> dict[str, Any]:
    return {
        "role": "edit_diff",
        "name": diff.agent_name,
        "tool_name": diff.tool_name,
        "tool_event_key": diff.tool_event_key or "",
        "diff": diff.model_dump(mode="json"),
    }
