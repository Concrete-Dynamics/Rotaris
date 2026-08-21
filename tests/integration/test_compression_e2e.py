from __future__ import annotations

import shutil
from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock

import pytest
from openhands.sdk.context.condenser.base import NoCondensationAvailableException
from openhands.sdk.event.condenser import (
    Condensation,
    CondensationRequest,
    CondensationSummaryEvent,
)
from openhands.sdk.llm.llm import LLM

from rotaris_core.agents.compressor import Compressor, RotarisCondenser
from rotaris_core.config import loader
from rotaris_core.config.schema import CompressorConfig, ModelConfig, PersonaConfig, RotarisConfig
from rotaris_core.orchestrator.child_state import ChildTaskRecord
from rotaris_core.orchestrator.scheduler import Scheduler
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem import LoremMarkdownGenerator
from rotaris_core.tui.live_activity import describe_compression_event, describe_sdk_event

if TYPE_CHECKING:
    from pathlib import Path


class MockState:
    def __init__(self, events: list[object] | None = None):
        self.events = events or []


_lorem = LoremMarkdownGenerator(seed=555)
SHORT_TEXT = _lorem.sentence()
TINY_TEXT = _lorem.words(2)
SUMMARY_TEXT = _lorem.sentence()
TAIL_TEXT = _lorem.words(3)
BIG_TEXT = _lorem.markdown(words=12_000)
assert len(BIG_TEXT) >= 50_000


class MockTextPart:
    def __init__(self, text: str):
        self.text = text


class MockLLMMessage:
    def __init__(self, content: list[MockTextPart]):
        self.content = content


class MockMessageEvent:
    def __init__(self, source: str, text: str):
        self.source = source
        self.content = text
        self.llm_message = MockLLMMessage([MockTextPart(text)])


class MockConversation:
    def __init__(self, *, events: list[object] | None = None):
        self.state = MockState(events)


class MockManipulationIndices:
    def find_next(self, index: int) -> int:
        return index


class MockView:
    def __init__(self, events: list[object], *, unhandled_condensation_request: bool = False):
        self.events = events
        self.unhandled_condensation_request = unhandled_condensation_request
        self.manipulation_indices = MockManipulationIndices()


def _make_sdk_llm() -> LLM:
    return LLM(model="openai/gpt-4o", api_key="test")


def _copy_config_files(source_dir: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for file_name in ("agents.yaml", "models.yml"):
        source_file = source_dir / file_name
        if source_file.exists():
            shutil.copy2(source_file, target_dir / file_name)


def _make_config(
    *,
    threshold: int,
    chars_per_token: int = 1,
    preserve_recent_turns: int = 2,
) -> RotarisConfig:
    return RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
            ),
        },
        models={
            "gpt-4o": ModelConfig(
                provider="openai",
                model_id="gpt-4o",
                max_input_tokens=threshold,
            ),
        },
        compressor=CompressorConfig(
            default_threshold=threshold,
            threshold_percentage=100,
            chars_per_token=chars_per_token,
            preserve_recent_turns=preserve_recent_turns,
        ),
    )


def _make_record() -> ChildTaskRecord:
    return ChildTaskRecord(
        name="compression-check",
        canonical_name="compression-check",
        persona="orchestrator",
        task_payload="inspect context size",
    )


@verifies(SWR.SWR_1405)
def test_compression_config_round_trip(
    tmp_path: Path,
    monkeypatch,
    global_config_dir: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    workspace_root = tmp_path / "workspace"
    workspace_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_root.mkdir()
    _copy_config_files(global_config_dir, global_dir)
    workspace_dir.mkdir(parents=True)
    (workspace_dir / "agents.yaml").write_text(
        """
compressor:
  model: gpt-4o-mini
  timeout_seconds: 60
  default_threshold: 50000
  chars_per_token: 3
  preserve_recent_turns: 2
""".strip()
        + "\n",
        encoding="utf-8",
    )

    original_load_scope = loader._load_scope

    def _load_scope_with_compressor(config_dir: Path) -> dict[str, Any]:
        data = original_load_scope(config_dir)
        agents_config = loader._load_yaml_file(config_dir / "agents.yaml")
        data["compressor"] = loader._merge_entry_fields({}, agents_config.get("compressor", {}))
        return data

    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(loader, "_load_scope", _load_scope_with_compressor)

    config = loader.load_config(workspace_root)

    assert config.compressor.model == "gpt-4o-mini"
    assert config.compressor.timeout_seconds == 60
    assert config.compressor.default_threshold == 50_000
    assert config.compressor.chars_per_token == 3
    assert config.compressor.preserve_recent_turns == 2


@verifies(SWR.SWR_1405)
async def test_compression_threshold_check_in_scheduler() -> None:
    scheduler = Scheduler(
        config=_make_config(threshold=1_000, chars_per_token=1),
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = MockConversation(events=[MockMessageEvent("assistant", SHORT_TEXT)])

    result = await scheduler._maybe_compress_context(conversation, _make_record())

    assert result is None


@verifies(SWR.SWR_1405)
async def test_compression_threshold_check_with_agent_llm_below_threshold() -> None:
    from tests.unit.test_tokens import FakeLLM, FakeMetrics, FakeTokenUsage

    scheduler = Scheduler(
        config=_make_config(threshold=10_000, chars_per_token=1),
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = MockConversation(events=[MockMessageEvent("assistant", BIG_TEXT)])
    llm = FakeLLM(FakeMetrics(usages=[FakeTokenUsage(prompt_tokens=5_000)]))

    result = await scheduler._maybe_compress_context(conversation, _make_record(), agent_llm=llm)

    assert result is None


@verifies(SWR.SWR_1440, SWR.SWR_1404)
def test_compression_threshold_resolves_runtime_llm_model() -> None:
    class RuntimeLLM:
        model = "openai/runtime-model"

    config = RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="configured",
            ),
        },
        models={
            "configured": ModelConfig(
                provider="openai",
                model_id="configured",
                max_input_tokens=100_000,
            ),
            "runtime": ModelConfig(
                provider="openai",
                model_id="runtime-model",
                max_input_tokens=200_000,
            ),
        },
        compressor=CompressorConfig(threshold_percentage=50),
    )
    scheduler = Scheduler(
        config=config,
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )

    model_config = scheduler._resolve_compression_model_config("configured", RuntimeLLM())

    assert model_config is config.models["runtime"]


@verifies(SWR.SWR_1405)
async def test_compression_uses_actual_tokens_when_above_threshold(monkeypatch) -> None:
    from tests.unit.test_tokens import FakeLLM, FakeMetrics, FakeTokenUsage

    captured: dict[str, Any] = {}

    async def fake_run_compressor(
        config: RotarisConfig,
        messages: list[dict[str, Any]],
        preserve_recent: int | None = None,
    ) -> dict[str, Any]:
        captured["triggered"] = True
        return {"compressed_history": "compressed", "preserved_messages": []}

    monkeypatch.setattr("rotaris_core.agents.compressor.run_compressor", fake_run_compressor)

    scheduler = Scheduler(
        config=_make_config(threshold=10_000, chars_per_token=1),
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = MockConversation(events=[MockMessageEvent("assistant", TINY_TEXT)])
    llm = FakeLLM(FakeMetrics(usages=[FakeTokenUsage(prompt_tokens=15_000)]))

    result = await scheduler._maybe_compress_context(conversation, _make_record(), agent_llm=llm)

    assert result is not None
    assert captured.get("triggered") is True


@verifies(SWR.SWR_1405)
async def test_compression_ignores_stale_prompt_metrics_after_context_shrinks(
    monkeypatch,
) -> None:
    from tests.unit.test_tokens import FakeLLM, FakeMetrics, FakeTokenUsage

    captured: dict[str, Any] = {}

    async def fake_run_compressor(
        config: RotarisConfig,
        messages: list[dict[str, Any]],
        preserve_recent: int | None = None,
    ) -> dict[str, Any]:
        del config, messages, preserve_recent
        captured["triggered"] = True
        return {"compressed_history": "compressed", "preserved_messages": []}

    monkeypatch.setattr("rotaris_core.agents.compressor.run_compressor", fake_run_compressor)

    scheduler = Scheduler(
        config=_make_config(threshold=120_000, chars_per_token=1),
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = MockConversation(
        events=[
            CondensationSummaryEvent(summary="Previous work summary"),
            MockMessageEvent("assistant", SUMMARY_TEXT),
            MockMessageEvent("assistant", TAIL_TEXT),
        ],
    )
    llm = FakeLLM(FakeMetrics(usages=[FakeTokenUsage(prompt_tokens=121_178)]))

    result = await scheduler._maybe_compress_context(conversation, _make_record(), agent_llm=llm)

    assert result is None
    assert captured == {}


@verifies(SWR.SWR_1405, SWR.SWR_1404)
async def test_compression_falls_back_to_char_estimate_when_no_llm() -> None:
    scheduler = Scheduler(
        config=_make_config(threshold=100, chars_per_token=1),
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = MockConversation(events=[MockMessageEvent("assistant", SHORT_TEXT)])

    result = await scheduler._maybe_compress_context(conversation, _make_record(), agent_llm=None)

    assert result is None


@verifies(SWR.SWR_1405)
def test_condenser_ignores_stale_prompt_metrics_after_summary_event() -> None:
    from tests.unit.test_tokens import FakeMetrics, FakeTokenUsage

    sdk_llm = _make_sdk_llm()
    sdk_llm._metrics = FakeMetrics(usages=[FakeTokenUsage(prompt_tokens=121_178)])

    condenser = RotarisCondenser(
        llm=sdk_llm,
        threshold_tokens=120_000,
        preserve_recent=4,
        chars_per_token=1,
    )
    view = MockView(
        [
            CondensationSummaryEvent(summary="Previous work summary"),
            MockMessageEvent("assistant", SUMMARY_TEXT),
            MockMessageEvent("assistant", TAIL_TEXT),
        ],
    )

    requirement = condenser.condensation_requirement(view, sdk_llm)

    assert requirement is None


@verifies(SWR.SWR_1405)
def test_condenser_skips_single_event_condensation_window() -> None:
    condenser = RotarisCondenser(
        llm=_make_sdk_llm(),
        threshold_tokens=1,
        preserve_recent=4,
        chars_per_token=1,
    )
    view = MockView(
        [
            MockMessageEvent("assistant", "keep first 1"),
            MockMessageEvent("assistant", "keep first 2"),
            CondensationSummaryEvent(summary="Previous work summary"),
            MockMessageEvent("assistant", "recent 1"),
            MockMessageEvent("assistant", "recent 2"),
            MockMessageEvent("assistant", "recent 3"),
            MockMessageEvent("assistant", "recent 4"),
        ],
    )

    with pytest.raises(NoCondensationAvailableException, match="too small"):
        condenser.get_condensation(view)


@verifies(SWR.SWR_1405)
async def test_compression_threshold_triggers_when_exceeded(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_run_compressor(
        config: RotarisConfig,
        messages: list[dict[str, Any]],
        preserve_recent: int | None = None,
    ) -> dict[str, Any]:
        captured["config"] = config
        captured["messages"] = messages
        captured["preserve_recent"] = preserve_recent
        return {"compressed_history": "compressed", "preserved_messages": []}

    monkeypatch.setattr("rotaris_core.agents.compressor.run_compressor", fake_run_compressor)

    scheduler = Scheduler(
        config=_make_config(threshold=10, chars_per_token=1, preserve_recent_turns=2),
        workspace_root="/tmp/test",
        summary_agent=MagicMock(),
    )
    conversation = MockConversation(
        events=[
            MockMessageEvent("assistant", "a" * 12),
            MockMessageEvent("assistant", "b" * 12),
            MockMessageEvent("assistant", "c" * 12),
        ],
    )

    result = await scheduler._maybe_compress_context(conversation, _make_record())

    assert result == {"compressed_history": "compressed", "preserved_messages": []}
    assert captured["config"].compressor.default_threshold == 10
    assert captured["preserve_recent"] == 2
    assert captured["messages"] == [
        {"role": "assistant", "content": "aaaaaaaaaaaa"},
        {"role": "assistant", "content": "bbbbbbbbbbbb"},
        {"role": "assistant", "content": "cccccccccccc"},
    ]


@verifies(SWR.SWR_1405)
async def test_compression_fallback_on_llm_failure() -> None:
    class ExplodingLLM:
        def completion(self, messages: object, **kwargs: object) -> object:
            del messages, kwargs
            raise RuntimeError("llm unavailable")

    compressor = Compressor(ExplodingLLM())
    messages = [
        {"role": "user", "content": "inspect src/app.py"},
        {"role": "assistant", "content": "running tests now"},
        {"role": "tool", "content": "pytest failed once", "tool_name": "terminal"},
    ]

    result = await compressor.compress_context(messages, preserve_recent=1)

    assert result["compressed_history"]
    assert result["preserved_messages"] == messages[-1:]
    assert result["tool_calls_summary"] == (
        "Structured compression unavailable; raw transcript excerpt preserved."
    )
    assert result["current_state"] == (
        "Compression fallback generated after LLM output could not be parsed."
    )


@verifies(SWR.SWR_1405)
def test_live_activity_compression_event_integration() -> None:
    start = describe_compression_event("start", "my-agent")
    done = describe_compression_event("done", "my-agent")

    assert start == {
        "activity_phase": "compressing",
        "activity_icon": "[COMP]",
        "activity_text": "Compressing context…",
        "feed_icon": "[COMP]",
        "feed_text": "my-agent: Compressing context…",
    }
    assert done == {
        "activity_phase": "thinking",
        "activity_icon": "",
        "activity_text": "Context compressed",
        "feed_icon": "",
        "feed_text": "my-agent: Context compressed",
    }


@verifies(SWR.SWR_1405)
def test_live_activity_maps_sdk_condensation_events() -> None:
    start = describe_sdk_event(CondensationRequest())
    done = describe_sdk_event(
        Condensation(
            forgotten_event_ids=["event-1"],
            summary="compressed",
            summary_offset=2,
            llm_response_id="condense-1",
        ),
    )

    assert start == describe_compression_event("start")
    assert done == describe_compression_event("done")


@verifies(SWR.SWR_1405)
def test_condensation_event_counted_exactly_once_even_if_delivered_twice() -> None:
    """A SDK Condensation event arriving twice (e.g. via SDK event history replay on
    session resume) must result in exactly one counted compression, not two.
    """
    from rotaris_core.tracking.tracker import GlobalTracker

    tracker = GlobalTracker()
    tracker.reset()
    try:
        cond = Condensation(
            forgotten_event_ids=["evt-1", "evt-2"],
            summary="compressed summary",
            summary_offset=0,
            llm_response_id="rotaris-condenser-test-dedup-123",
        )

        # Simulate the same event being delivered twice to the callback.
        for _ in range(2):
            tracker.track_compression_completion("agent-x", cond.llm_response_id)

        assert tracker.get_global_compressions() == 1
        assert tracker.get_agent_data("agent-x").compressions == 1
    finally:
        tracker.reset()


@verifies(SWR.SWR_836)
async def test_compression_still_fires_when_cost_is_unavailable(monkeypatch) -> None:
    """Compression decides on tokens alone; an unpriceable model must not change it."""
    from rotaris_core.cost import CostSnapshot, CostSource, extract_cost_usage
    from rotaris_core.tracking.tracker import GlobalTracker

    async def fake_run_compressor(
        config: RotarisConfig,
        messages: list[dict[str, Any]],
        preserve_recent: int | None = None,
    ) -> dict[str, Any]:
        del config, messages, preserve_recent
        return {"compressed_history": "compressed", "preserved_messages": []}

    monkeypatch.setattr("rotaris_core.agents.compressor.run_compressor", fake_run_compressor)

    tracker = GlobalTracker()
    tracker.reset()
    try:
        tracker.set_agent_cost(
            "child-1", CostSnapshot(unpriced_calls=9, source=CostSource.UNAVAILABLE)
        )
        assert extract_cost_usage(object()) == CostSnapshot()

        scheduler = Scheduler(
            config=_make_config(threshold=10, chars_per_token=1, preserve_recent_turns=2),
            workspace_root="/tmp/test",
            summary_agent=MagicMock(),
        )
        conversation = MockConversation(
            events=[
                MockMessageEvent("assistant", "a" * 12),
                MockMessageEvent("assistant", "b" * 12),
            ],
        )

        result = await scheduler._maybe_compress_context(conversation, _make_record())

        assert result == {"compressed_history": "compressed", "preserved_messages": []}
        assert tracker.get_global_cost().source is CostSource.UNAVAILABLE
    finally:
        tracker.reset()
