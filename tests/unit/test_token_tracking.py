"""Regression tests for global token aggregation and InfoPane display.

Pins two correctness contracts:

1. ``GlobalTracker.set_agent_tokens`` must REPLACE the per-agent snapshot and
   recompute the global aggregate as the *sum* of all per-agent values, so
   repeated reads of an LLM's already-cumulative ``accumulated_token_usage``
   do not double-count.
2. ``InfoPane`` must render the GlobalTracker aggregate as the canonical
   "tokens" total whenever the tracker has data — regardless of any
   previously-supplied session-level ``token_estimate``.  Without this, the
   top-line total can drift below the sum of per-agent rows.
"""

from __future__ import annotations

import datetime as dt

import pytest

from rotaris_core.cost import CostSnapshot, CostSource, format_cost
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.metrics import hydrate_tracker_from_session, sync_tracker_to_session
from rotaris_core.session.state import AgentMetrics, SessionState
from rotaris_core.tokens import TokenSnapshot
from rotaris_core.tracking.tracker import GlobalTracker
from rotaris_core.tui.widgets.info_pane import InfoPane


@pytest.fixture(autouse=True)
def _reset_tracker() -> None:
    GlobalTracker().reset()
    yield
    GlobalTracker().reset()


@verifies(SWR.SWR_1419)
def test_set_agent_tokens_replaces_and_recomputes_global() -> None:
    tracker = GlobalTracker()

    # First snapshot from agent A (cumulative read #1).
    tracker.set_agent_tokens("agent-a", TokenSnapshot(prompt_tokens=100, completion_tokens=50))
    # Cumulative read #2 for the same agent — must REPLACE, not add.
    tracker.set_agent_tokens("agent-a", TokenSnapshot(prompt_tokens=300, completion_tokens=120))

    assert tracker.get_agent_data("agent-a").tokens.total_tokens == 420
    # Global aggregate is the sum of per-agent values, so it equals agent-a's
    # latest cumulative snapshot — NOT 100+50+300+120.
    assert tracker.get_global_tokens().total_tokens == 420


@verifies(SWR.SWR_1419)
def test_global_aggregate_is_sum_across_agents() -> None:
    tracker = GlobalTracker()

    tracker.set_agent_tokens("agent-a", TokenSnapshot(prompt_tokens=1000, completion_tokens=200))
    tracker.set_agent_tokens("agent-b", TokenSnapshot(prompt_tokens=500, completion_tokens=50))
    tracker.set_agent_tokens("agent-c", TokenSnapshot(prompt_tokens=2_000_000, completion_tokens=0))

    expected = 1000 + 200 + 500 + 50 + 2_000_000
    assert tracker.get_global_tokens().total_tokens == expected


@verifies(SWR.SWR_1419)
def test_compression_tracking_is_global_and_per_agent() -> None:
    tracker = GlobalTracker()

    tracker.track_compression("agent-a")
    tracker.track_compression("agent-a")
    tracker.track_compression("agent-b")

    assert tracker.get_global_compressions() == 3
    assert tracker.get_agent_data("agent-a").compressions == 2
    assert tracker.get_agent_data("agent-b").compressions == 1


@verifies(SWR.SWR_1419)
def test_sync_tracker_to_session_persists_global_and_agent_metrics() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_tokens("agent-a", TokenSnapshot(prompt_tokens=100, completion_tokens=25))
    tracker.track_tool_call("agent-a", "read_file")
    tracker.track_tool_call("agent-a", "write_file")
    tracker.track_compression("agent-a")

    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    )

    sync_tracker_to_session(state, tracker)

    assert state.token_usage == {
        "prompt_tokens": 100,
        "completion_tokens": 25,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "reasoning_tokens": 0,
    }
    assert state.global_token_usage.total_tokens == 125
    assert state.global_tool_call_count == 2
    assert state.global_compressions == 1
    assert state.agent_metrics["agent-a"].tool_calls == {"read_file": 1, "write_file": 1}
    assert state.agent_metrics["agent-a"].compressions == 1


@verifies(SWR.SWR_1419)
def test_hydrate_tracker_from_session_replaces_prior_process_metrics() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_tokens("stale-agent", TokenSnapshot(prompt_tokens=999, completion_tokens=1))

    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-2",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        token_usage=TokenSnapshot(prompt_tokens=300, completion_tokens=40).model_dump(mode="json"),
        global_tool_call_count=2,
        global_compressions=3,
        agent_metrics={
            "restored-agent": AgentMetrics(
                tool_call_count=2,
                tool_calls={"read_file": 1, "write_file": 1},
                token_usage=TokenSnapshot(prompt_tokens=300, completion_tokens=40),
                compressions=3,
            ),
        },
    )

    hydrate_tracker_from_session(state, tracker)

    assert tracker.get_agent_data("stale-agent") is None
    restored = tracker.get_agent_data("restored-agent")
    assert restored is not None
    assert restored.tokens.total_tokens == 340
    assert sum(restored.tool_calls.values()) == 2
    assert restored.compressions == 3
    assert tracker.get_global_tokens().total_tokens == 340
    assert sum(tracker.get_global_tool_calls().values()) == 2
    assert tracker.get_global_compressions() == 3


@verifies(SWR.SWR_1419)
async def test_info_pane_top_total_matches_tracker_sum_not_session_estimate() -> None:
    """The visible top-line must equal the per-agent sum once tracker has data.

    Reproduces the screenshot bug where the header showed ``~23,989`` while
    per-agent rows summed into the millions.
    """
    tracker = GlobalTracker()
    tracker.set_agent_tokens(
        "research-agents-md-protocol",
        TokenSnapshot(prompt_tokens=400_000, completion_tokens=97_945),
    )
    tracker.set_agent_tokens(
        "create-agents-md-loader",
        TokenSnapshot(prompt_tokens=1_000_000, completion_tokens=136_970),
    )

    pane = InfoPane()
    # Earlier session-level estimate (much smaller) must NOT win once the
    # tracker has data.
    pane.has_session = True
    pane.update_info(token_estimate=23_989, token_is_actual=True)

    pane.render()
    rendered = pane._build_renderable()

    # type: ignore[attr-defined]
    text = rendered.renderables[0].plain
    expected_total = 400_000 + 97_945 + 1_000_000 + 136_970
    assert f"{expected_total:,}" in text
    assert "23,989" not in text


@verifies(SWR.SWR_1419)
async def test_info_pane_falls_back_to_token_estimate_when_tracker_empty() -> None:
    pane = InfoPane()
    pane.has_session = True
    pane.update_info(token_estimate=12_345, token_is_actual=False)

    rendered = pane._build_renderable()
    # type: ignore[attr-defined]
    text = rendered.renderables[0].plain
    assert "~12,345" in text


@verifies(SWR.SWR_1419)
async def test_info_pane_renders_context_tokens_separately() -> None:
    pane = InfoPane()
    pane.has_session = True
    pane.update_info(token_estimate=1, context_tokens=85_000)

    rendered = pane._build_renderable()
    section_texts = [
        # type: ignore[attr-defined]
        getattr(r, "plain", "")
        for r in rendered.renderables
    ]
    assert any("85,000" in text and "current window" in text for text in section_texts)


@verifies(SWR.SWR_1419)
async def test_info_pane_renders_compression_counts() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_tokens("agent-a", TokenSnapshot(prompt_tokens=100, completion_tokens=25))
    tracker.track_tool_call("agent-a", "read_file")
    tracker.track_compression("agent-a")
    tracker.track_compression("agent-a")

    pane = InfoPane()
    pane.has_session = True
    pane.update_info(token_estimate=1)

    rendered = pane._build_renderable()
    text = "\n".join(
        # type: ignore[attr-defined]
        getattr(r, "plain", "")
        for r in rendered.renderables
    )

    assert "compr  2" in text
    assert "125 tok / 1 calls / 2 compr" in text


@verifies(SWR.SWR_1419)
def test_track_compression_completion_counts_exactly_once_per_id() -> None:
    """Delivering the same completion_id twice must not double the count."""
    tracker = GlobalTracker()

    first = tracker.track_compression_completion("agent-a", "rotaris-condenser-abc123")
    second = tracker.track_compression_completion("agent-a", "rotaris-condenser-abc123")

    assert first is True
    assert second is False
    assert tracker.get_global_compressions() == 1
    assert tracker.get_agent_data("agent-a").compressions == 1


@verifies(SWR.SWR_1419)
def test_track_compression_completion_counts_distinct_ids_independently() -> None:
    tracker = GlobalTracker()

    tracker.track_compression_completion("agent-a", "rotaris-condenser-aaa")
    tracker.track_compression_completion("agent-a", "rotaris-condenser-bbb")
    tracker.track_compression_completion("agent-b", "rotaris-condenser-ccc")

    assert tracker.get_global_compressions() == 3
    assert tracker.get_agent_data("agent-a").compressions == 2
    assert tracker.get_agent_data("agent-b").compressions == 1


@verifies(SWR.SWR_1419)
def test_track_compression_completion_same_id_for_different_agents() -> None:
    """Each per-agent dedup is independent; same ID for two agents counts twice globally."""
    tracker = GlobalTracker()

    tracker.track_compression_completion("agent-a", "rotaris-condenser-shared")
    tracker.track_compression_completion("agent-b", "rotaris-condenser-shared")

    assert tracker.get_global_compressions() == 2
    assert tracker.get_agent_data("agent-a").compressions == 1
    assert tracker.get_agent_data("agent-b").compressions == 1


@verifies(SWR.SWR_1419)
def test_seen_compression_ids_survive_sync_and_hydrate_roundtrip() -> None:
    """Dedup state must persist through session save/load so a session resume
    does not recount compressions that the SDK replays from event history.
    """
    tracker = GlobalTracker()
    tracker.track_compression_completion("agent-a", "rotaris-condenser-aaa")
    tracker.track_compression_completion("agent-a", "rotaris-condenser-bbb")

    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="test-dedup",
        workspace_root="/tmp",
        created_at=now,
        updated_at=now,
    )
    sync_tracker_to_session(state, tracker)

    # Restore into a fresh tracker instance.
    tracker2 = GlobalTracker()
    tracker2.reset()
    hydrate_tracker_from_session(state, tracker2)

    # Attempting to re-count the same IDs after hydration must be silently ignored.
    r1 = tracker2.track_compression_completion("agent-a", "rotaris-condenser-aaa")
    r2 = tracker2.track_compression_completion("agent-a", "rotaris-condenser-bbb")

    assert r1 is False
    assert r2 is False
    assert tracker2.get_global_compressions() == 2
    assert tracker2.get_agent_data("agent-a").compressions == 2


@verifies(SWR.SWR_1419)
def test_background_token_aggregation_takes_last_iteration_not_sum() -> None:
    """background.py must use the last cumulative snapshot, not merge all iterations.

    Each iteration.token_usage stores the GlobalTracker cumulative aggregate at
    that point — i.e. iteration N already includes all tokens from iterations
    1..N.  Merging them would inflate the count.

    This regression test pins the correct behaviour: the final value equals the
    last iteration's snapshot, not the sum of all iteration snapshots.
    """
    from rotaris_core.ralph.state import RalphIterationState, RalphProgressFile

    # Simulate three iterations with growing cumulative totals.
    iter1 = RalphIterationState(
        iteration_number=1,
        task_id="t1",
        task_name="task-1",
        outcome="completed",
        started_at=dt.datetime.now(dt.UTC),
        ended_at=dt.datetime.now(dt.UTC),
        token_usage=TokenSnapshot(prompt_tokens=1_000, completion_tokens=200).model_dump(
            mode="json",
        ),
    )
    iter2 = RalphIterationState(
        iteration_number=2,
        task_id="t2",
        task_name="task-2",
        outcome="completed",
        started_at=dt.datetime.now(dt.UTC),
        ended_at=dt.datetime.now(dt.UTC),
        # Cumulative: includes iter1's tokens too.
        token_usage=TokenSnapshot(prompt_tokens=2_000, completion_tokens=400).model_dump(
            mode="json",
        ),
    )
    iter3 = RalphIterationState(
        iteration_number=3,
        task_id="t3",
        task_name="task-3",
        outcome="completed",
        started_at=dt.datetime.now(dt.UTC),
        ended_at=dt.datetime.now(dt.UTC),
        # Cumulative: includes iter1 + iter2 tokens.
        token_usage=TokenSnapshot(prompt_tokens=3_000, completion_tokens=600).model_dump(
            mode="json",
        ),
    )
    progress = RalphProgressFile(
        session_id="s1",
        started_at=dt.datetime.now(dt.UTC),
        iterations=[iter1, iter2, iter3],
    )

    # Replicate the aggregation logic from cli/background.py
    final_token_usage: TokenSnapshot | None = None
    for iteration in progress.iterations:
        if iteration.token_usage is not None:
            final_token_usage = TokenSnapshot.model_validate(iteration.token_usage)

    assert final_token_usage is not None
    # Must equal the LAST iteration's value (3,600), NOT the sum (1,200 + 2,400 + 3,600 = 7,200).
    assert final_token_usage.total_tokens == 3_000 + 600
    # The old buggy sum would have been (1,200 + 2,400 + 3,600) = 7,200 — confirm not that.
    assert final_token_usage.total_tokens != (1_200 + 2_400 + 3_600)


@verifies(SWR.SWR_1419)
def test_info_pane_renders_compression_threshold_in_header() -> None:
    """The info pane header must show the compression threshold percentage,
    token threshold, and model capacity when configured."""
    pane = InfoPane()
    pane.model_name = "gpt-4o"
    pane.compression_threshold_percentage = 60
    pane.compression_threshold_tokens = 72_000
    pane.compression_threshold_capacity = 120_000

    rendered = pane._build_renderable()
    section_texts = [getattr(r, "plain", "") for r in rendered.renderables]

    combined = "\n".join(section_texts)
    assert "compr threshold" in combined
    assert "60%" in combined
    assert "72,000" in combined
    assert "120,000" in combined
    assert "72,000 of 120,000 tok" in combined


@verifies(SWR.SWR_835)
def test_set_agent_cost_replaces_and_recomputes_global() -> None:
    """``accumulated_cost`` is already cumulative, so repeated reads of the same
    agent must replace its snapshot instead of adding to it."""
    tracker = GlobalTracker()

    tracker.set_agent_cost(
        "agent-a",
        CostSnapshot(accumulated_cost=0.10, priced_calls=1, source=CostSource.PROVIDER),
    )
    tracker.set_agent_cost(
        "agent-a",
        CostSnapshot(accumulated_cost=0.25, priced_calls=3, source=CostSource.PROVIDER),
    )
    tracker.set_agent_cost(
        "agent-b",
        CostSnapshot(accumulated_cost=0.05, priced_calls=1, source=CostSource.PROVIDER),
    )

    assert tracker.get_agent_data("agent-a").cost.accumulated_cost == 0.25
    global_cost = tracker.get_global_cost()
    assert global_cost.accumulated_cost == pytest.approx(0.30)
    assert global_cost.priced_calls == 4


@verifies(SWR.SWR_839)
def test_global_cost_of_priced_and_unpriced_agents_is_mixed() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_cost(
        "agent-a",
        CostSnapshot(accumulated_cost=0.4, priced_calls=2, source=CostSource.PROVIDER),
    )
    tracker.set_agent_cost(
        "agent-b",
        CostSnapshot(unpriced_calls=5, source=CostSource.UNAVAILABLE),
    )

    global_cost = tracker.get_global_cost()

    assert global_cost.source is CostSource.MIXED
    assert not global_cost.is_complete
    assert "(partial)" in format_cost(global_cost)


@verifies(SWR.SWR_835)
def test_agent_cost_survives_sync_and_hydrate_roundtrip() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_cost(
        "agent-a",
        CostSnapshot(accumulated_cost=0.75, priced_calls=3, source=CostSource.CONFIGURED),
    )

    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="test-cost",
        workspace_root="/tmp",
        created_at=now,
        updated_at=now,
    )
    sync_tracker_to_session(state, tracker)

    assert state.global_cost.accumulated_cost == 0.75
    assert state.agent_metrics["agent-a"].cost.source is CostSource.CONFIGURED

    tracker2 = GlobalTracker()
    tracker2.reset()
    hydrate_tracker_from_session(state, tracker2)

    assert tracker2.get_global_cost().accumulated_cost == 0.75
    assert tracker2.get_global_cost().source is CostSource.CONFIGURED
    assert tracker2.get_agent_data("agent-a").cost.priced_calls == 3


@verifies(SWR.SWR_835)
def test_reset_clears_global_cost() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_cost(
        "agent-a",
        CostSnapshot(accumulated_cost=0.9, priced_calls=2, source=CostSource.PROVIDER),
    )

    tracker.reset()

    assert tracker.get_global_cost() == CostSnapshot()


@verifies(SWR.SWR_841)
async def test_info_pane_renders_unavailable_cost_without_a_zero_claim() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_cost("agent-a", CostSnapshot(unpriced_calls=5, source=CostSource.UNAVAILABLE))
    pane = InfoPane()
    pane.has_session = True
    pane.update_info(token_estimate=1_000)

    rendered = pane._build_renderable()
    section_texts = [getattr(r, "plain", "") for r in rendered.renderables]

    combined = "\n".join(section_texts)
    assert "cost  n/a" in combined
    assert "$0.00" not in combined


@verifies(SWR.SWR_839, SWR.SWR_841)
async def test_info_pane_labels_configured_cost() -> None:
    tracker = GlobalTracker()
    tracker.set_agent_cost(
        "agent-a",
        CostSnapshot(accumulated_cost=0.25, priced_calls=4, source=CostSource.CONFIGURED),
    )
    pane = InfoPane()
    pane.has_session = True
    pane.update_info(token_estimate=1_000)

    rendered = pane._build_renderable()
    combined = "\n".join(getattr(r, "plain", "") for r in rendered.renderables)

    assert "cost  $0.2500 (configured)" in combined
