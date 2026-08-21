from __future__ import annotations

from collections import Counter

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.state import AgentMetrics, SessionState
from rotaris_core.tokens import TokenSnapshot
from rotaris_core.tracking.tracker import AgentTrackingData, GlobalTracker

_RESTORED_TOOL_NAME = "__restored__"


@traces(SWR.SWR_1546)
def sync_tracker_to_session(state: SessionState, tracker: GlobalTracker | None = None) -> None:
    tracker = tracker or GlobalTracker()

    global_tokens = tracker.get_global_tokens()
    global_cost = tracker.get_global_cost()
    global_tool_calls = tracker.get_global_tool_calls()
    global_compressions = tracker.get_global_compressions()

    agent_metrics: dict[str, AgentMetrics] = {}
    for agent_name in tracker.get_all_agent_names():
        agent_data = tracker.get_agent_data(agent_name)
        if agent_data is None:
            continue
        tool_calls = dict(agent_data.tool_calls)
        agent_metrics[agent_name] = AgentMetrics(
            tool_call_count=sum(tool_calls.values()),
            tool_calls=tool_calls,
            token_usage=agent_data.tokens,
            cost=agent_data.cost,
            compressions=agent_data.compressions,
            last_prompt_tokens=agent_data.last_prompt_tokens,
        )

    state.token_usage = (
        global_tokens.model_dump(mode="json") if global_tokens.total_tokens > 0 else None
    )
    state.global_tool_call_count = sum(global_tool_calls.values())
    state.global_token_usage = global_tokens
    state.global_cost = global_cost
    state.global_compressions = global_compressions
    state.agent_metrics = agent_metrics
    state.seen_compression_ids = {
        k: sorted(v) for k, v in tracker.get_seen_compression_ids().items() if v
    }


def hydrate_tracker_from_session(state: SessionState, tracker: GlobalTracker | None = None) -> None:
    tracker = tracker or GlobalTracker()

    agent_data: dict[str, AgentTrackingData] = {}
    for agent_name, metrics in state.agent_metrics.items():
        tool_calls = Counter(metrics.tool_calls)
        if not tool_calls and metrics.tool_call_count > 0:
            tool_calls[_RESTORED_TOOL_NAME] = metrics.tool_call_count
        agent_data[agent_name] = AgentTrackingData(
            tokens=metrics.token_usage,
            cost=metrics.cost,
            tool_calls=tool_calls,
            compressions=metrics.compressions,
            last_prompt_tokens=metrics.last_prompt_tokens,
        )

    global_tokens = state.global_token_usage
    if global_tokens.total_tokens == 0 and isinstance(state.token_usage, dict):
        global_tokens = TokenSnapshot.model_validate(state.token_usage)
    if global_tokens.total_tokens == 0 and agent_data:
        for data in agent_data.values():
            global_tokens = global_tokens.merge(data.tokens)

    global_cost = state.global_cost
    if not global_cost.has_cost_data and agent_data:
        for data in agent_data.values():
            global_cost = global_cost.merge(data.cost)

    global_compressions = state.global_compressions
    if global_compressions == 0 and agent_data:
        global_compressions = sum(data.compressions for data in agent_data.values())

    seen_compression_ids: dict[str, set[str]] = {
        k: set(v) for k, v in state.seen_compression_ids.items()
    }

    tracker.replace_state(
        global_tokens=global_tokens,
        global_cost=global_cost,
        global_tool_calls=_restore_global_tool_calls(state, agent_data),
        global_compressions=global_compressions,
        agent_data=agent_data,
        seen_compression_ids=seen_compression_ids,
    )


def _restore_global_tool_calls(
    state: SessionState,
    agent_data: dict[str, AgentTrackingData],
) -> Counter[str]:
    aggregate: Counter[str] = Counter()
    for data in agent_data.values():
        aggregate.update(data.tool_calls)
    if not aggregate and state.global_tool_call_count > 0:
        aggregate[_RESTORED_TOOL_NAME] = state.global_tool_call_count
    return aggregate
