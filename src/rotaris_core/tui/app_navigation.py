from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.tui.app import RotarisTuiApp


def _canonical_name(agent: dict[str, Any]) -> str:
    return str(agent.get("canonical_name") or agent.get("name") or "")


def merge_live_agent_activity(
    app: RotarisTuiApp,
    child_states: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [merge_activity_into_child(app, child) for child in child_states]


def get_agent_tree(
    app: RotarisTuiApp,
) -> tuple[list[dict[str, Any]], dict[str, list[str]], dict[str, str]]:
    if app.current_session is None:
        return [], {"": []}, {}

    flat_agents = list(app.current_session.child_states)
    canonical_names = {_canonical_name(agent) for agent in flat_agents if _canonical_name(agent)}
    children_by_parent: dict[str, list[str]] = {"": []}
    parent_of: dict[str, str] = {}

    for agent in flat_agents:
        canonical_name = _canonical_name(agent)
        if not canonical_name:
            continue
        parent_agent_id = str(agent.get("parent_agent_id") or "")
        if parent_agent_id in canonical_names:
            children_by_parent.setdefault(parent_agent_id, []).append(canonical_name)
            parent_of[canonical_name] = parent_agent_id
        else:
            children_by_parent.setdefault("", []).append(canonical_name)

    return flat_agents, children_by_parent, parent_of


def merge_activity_into_child(app: RotarisTuiApp, child: dict[str, Any]) -> dict[str, Any]:
    merged = dict(child)
    key = _canonical_name(merged)
    if key and key in app._live_agent_activity:
        merged.update(app._live_agent_activity[key])
    if str(merged.get("state") or "") == "summarizing":
        activity_phase = str(merged.get("activity_phase") or "")
        if activity_phase not in {"failed", "blocked", "stopping", "completed", "pending"}:
            merged.update(
                {
                    "activity_icon": "ANIMATED_THINKING",
                    "activity_text": "Summarizing response",
                    "activity_phase": "summarizing",
                },
            )
    return merged


def sync_parent_activity_from_manager(app: RotarisTuiApp, manager: Any) -> None:
    children = manager.snapshot_children()
    if not children:
        return

    canonical_names = {record.canonical_name for record in children}
    roots = [
        record
        for record in children
        if not record.parent_agent_id or record.parent_agent_id not in canonical_names
    ]
    for root in roots:
        descendants = [
            record
            for record in children
            if record.canonical_name != root.canonical_name
            and record.parent_agent_id == root.canonical_name
        ]
        active_descendants = [record for record in descendants if not record.state.is_terminal()]
        if active_descendants:
            app._live_agent_activity[root.canonical_name] = {
                "persona": root.persona,
                "activity_icon": "ANIMATED_WAITING",
                "activity_text": "Waiting on child agents",
                "activity_phase": "waiting",
            }


def input_has_focus(app: RotarisTuiApp) -> bool:
    focused = app.focused
    if focused is None:
        return False

    from textual.widgets import Input, TextArea

    return isinstance(focused, Input | TextArea)


@traces(SWR.SWR_1415, SWR.SWR_1416, SWR.SWR_1417)
def focus_child(app: RotarisTuiApp) -> None:
    flat_agents, children_by_parent, _parent_of = get_agent_tree(app)
    if not flat_agents:
        return

    canonical_names = {_canonical_name(agent) for agent in flat_agents}
    if app.focused_agent_id is None or app.focused_agent_id not in canonical_names:
        roots = children_by_parent.get("", [])
        if roots:
            app.focused_agent_id = roots[0]
        return

    children = children_by_parent.get(app.focused_agent_id, [])
    if children:
        app.focused_agent_id = children[0]


def focus_parent(app: RotarisTuiApp) -> None:
    if app.focused_agent_id is None:
        return

    _flat_agents, _children_by_parent, parent_of = get_agent_tree(app)
    parent_agent_id = parent_of.get(app.focused_agent_id)
    if parent_agent_id is not None:
        app.focused_agent_id = parent_agent_id
    else:
        app.focused_agent_id = None


def focus_next_sibling(app: RotarisTuiApp) -> None:
    focus_sibling(app, direction=1)


def focus_prev_sibling(app: RotarisTuiApp) -> None:
    focus_sibling(app, direction=-1)


def focus_sibling(app: RotarisTuiApp, *, direction: int) -> None:
    if app.focused_agent_id is None:
        return

    flat_agents, children_by_parent, parent_of = get_agent_tree(app)
    canonical_names = {_canonical_name(agent) for agent in flat_agents}
    if app.focused_agent_id not in canonical_names:
        return

    parent_agent_id = parent_of.get(app.focused_agent_id, "")
    siblings = children_by_parent.get(parent_agent_id, [])
    if not siblings:
        return

    try:
        current_index = siblings.index(app.focused_agent_id)
    except ValueError:
        return

    app.focused_agent_id = siblings[(current_index + direction) % len(siblings)]
