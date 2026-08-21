"""End-to-end cost telemetry: SDK metrics → tracker → snapshot → user-visible summary.

Everything asserted here comes from what the OpenHands SDK reports.  Rotaris
computes no prices of its own, so the decisive product behaviour is that a run
whose model cannot be priced reads as *unknown*, never as free.
"""

from __future__ import annotations

import warnings
from typing import TYPE_CHECKING

from rotaris_core.config import loader
from rotaris_core.cost import CostSource, extract_cost_usage, format_cost
from rotaris_core.providers import litellm_runtime
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import build_metrics, render_summary
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.metrics import hydrate_tracker_from_session, sync_tracker_to_session
from rotaris_core.tracking.tracker import GlobalTracker

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.session.state import SessionState


class StubMetrics:
    """The subset of ``openhands.sdk``'s ``Metrics`` that cost reporting reads.

    The SDK appends to ``costs`` only for calls it could price, and to
    ``token_usages`` for every call that reported usage.
    """

    def __init__(self, *, accumulated_cost: float, priced: int, calls: int) -> None:
        self.accumulated_cost = accumulated_cost
        self.costs = [object() for _ in range(priced)]
        self.token_usages = [object() for _ in range(calls)]


class StubLLM:
    def __init__(self, metrics: StubMetrics, input_cost_per_token: float | None = None) -> None:
        self.metrics = metrics
        self.input_cost_per_token = input_cost_per_token


def _config_yaml(*, pricing: bool) -> str:
    prices = (
        """
    input_cost_per_token: 0.0000004
    output_cost_per_token: 0.0000012
""".rstrip()
        if pricing
        else ""
    )
    return f"""
personas:
  orchestrator:
    name: orchestrator
    model: custom
models:
  custom:
    provider: openai
    model_id: openai/Qwen/Qwen3.6-35B-A3B
    api_key_env: MODEL_TOKEN{prices}
""".strip()


def _write_config(tmp_path: Path, monkeypatch, *, pricing: bool) -> Path:
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setenv("MODEL_TOKEN", "token")
    (global_dir / "agents.yaml").write_text(_config_yaml(pricing=pricing), encoding="utf-8")
    return workspace_root


def _persist_run(workspace_root: Path, llm: object) -> SessionState:
    """Drive the real capture path: LLM metrics → tracker → saved session."""
    from rotaris_core.config.schema import RotarisConfig

    tracker = GlobalTracker()
    tracker.set_agent_cost("orchestrator", extract_cost_usage(llm))

    manager = SessionManager(workspace_root)
    state = manager.create_session(RotarisConfig(workspace_root=workspace_root))
    sync_tracker_to_session(state, tracker)
    manager.save_session(state)
    return manager.load_session(state.session_id)


@verifies(SWR.SWR_835, SWR.SWR_838, SWR.SWR_841)
def test_unpriceable_model_run_reports_unknown_cost_not_zero(tmp_path, monkeypatch) -> None:
    workspace_root = _write_config(tmp_path, monkeypatch, pricing=False)
    GlobalTracker().reset()
    try:
        llm = StubLLM(StubMetrics(accumulated_cost=0.0, priced=0, calls=6))

        loaded = _persist_run(workspace_root, llm)
        summary = render_summary(loaded, build_metrics(loaded, tmp_path))

        assert loaded.global_cost.source is CostSource.UNAVAILABLE
        assert loaded.global_cost.unpriced_calls == 6
        assert format_cost(loaded.global_cost) == "n/a"
        assert "- Cost: n/a" in summary
        assert "$0.00" not in summary
    finally:
        GlobalTracker().reset()


@verifies(SWR.SWR_837, SWR.SWR_839, SWR.SWR_841)
def test_configured_pricing_run_surfaces_a_labelled_cost(tmp_path, monkeypatch) -> None:
    workspace_root = _write_config(tmp_path, monkeypatch, pricing=True)
    GlobalTracker().reset()
    try:
        config = loader.load_config(workspace_root)
        configured_llm = loader.load_llm_for_model(config, "custom")
        # The SDK carries the configured prices; LiteLLM does the arithmetic and
        # reports the total back through metrics.
        assert configured_llm.input_cost_per_token == 0.0000004
        assert configured_llm.output_cost_per_token == 0.0000012

        llm = StubLLM(
            StubMetrics(accumulated_cost=0.0480, priced=6, calls=6),
            input_cost_per_token=configured_llm.input_cost_per_token,
        )

        loaded = _persist_run(workspace_root, llm)
        summary = render_summary(loaded, build_metrics(loaded, tmp_path))

        assert loaded.global_cost.source is CostSource.CONFIGURED
        assert loaded.global_cost.accumulated_cost == 0.0480
        assert format_cost(loaded.global_cost) == "$0.0480 (configured)"
        assert "- Cost: $0.0480 (configured)" in summary
    finally:
        GlobalTracker().reset()


@verifies(SWR.SWR_835, SWR.SWR_839)
def test_partially_priced_run_is_marked_partial_after_resume(tmp_path, monkeypatch) -> None:
    workspace_root = _write_config(tmp_path, monkeypatch, pricing=False)
    GlobalTracker().reset()
    try:
        priced = StubLLM(StubMetrics(accumulated_cost=0.02, priced=2, calls=2))
        unpriced = StubLLM(StubMetrics(accumulated_cost=0.0, priced=0, calls=4))

        tracker = GlobalTracker()
        tracker.set_agent_cost("orchestrator", extract_cost_usage(priced))
        tracker.set_agent_cost("child-1", extract_cost_usage(unpriced))

        from rotaris_core.config.schema import RotarisConfig

        manager = SessionManager(workspace_root)
        state = manager.create_session(RotarisConfig(workspace_root=workspace_root))
        sync_tracker_to_session(state, tracker)
        manager.save_session(state)

        # Resume: a fresh process hydrates the tracker from the snapshot.
        resumed_tracker = GlobalTracker()
        resumed_tracker.reset()
        hydrate_tracker_from_session(manager.load_session(state.session_id), resumed_tracker)

        global_cost = resumed_tracker.get_global_cost()
        assert global_cost.source is CostSource.MIXED
        assert global_cost.priced_calls == 2
        assert global_cost.unpriced_calls == 4
        assert format_cost(global_cost) == "~$0.0200 (partial)"
    finally:
        GlobalTracker().reset()


@verifies(SWR.SWR_838, SWR.SWR_840)
def test_unpriceable_run_warns_once_per_model_not_once_per_call() -> None:
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        litellm_runtime.configure_litellm_runtime()
        for _ in range(8):
            warnings.warn(
                "Cost calculation failed: This model isn't mapped yet. "
                "model=Qwen/Qwen3.6-35B-A3B, custom_llm_provider=openai.",
                UserWarning,
                stacklevel=2,
            )

    assert len(recorded) == 1
