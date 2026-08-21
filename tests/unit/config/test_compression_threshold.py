from __future__ import annotations

from typing import TYPE_CHECKING

import yaml

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.config import loader
from rotaris_core.config.compression import resolve_compression_threshold
from rotaris_core.config.schema import CompressorConfig, ModelConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp


@verifies(SWR.SWR_1403, SWR.SWR_1435, SWR.SWR_1437)
def test_global_percentage_uses_explicit_model_compression_capacity() -> None:
    config = RotarisConfig(
        compressor=CompressorConfig(threshold_percentage=50),
    )
    model = ModelConfig(
        provider="openai",
        model_id="gpt-test",
        max_input_tokens=200_000,
        context_compression_threshold=10_000,
    )

    threshold = resolve_compression_threshold(config, model)

    assert threshold.tokens == 5_000
    assert threshold.percentage == 50
    assert threshold.capacity == 10_000


@verifies(SWR.SWR_1436, SWR.SWR_1437, SWR.SWR_1440)
def test_global_percentage_uses_known_model_context_capacity_when_within_default_cap() -> None:
    config = RotarisConfig(
        compressor=CompressorConfig(
            default_threshold=500_000,
            threshold_percentage=50,
        ),
    )
    model = ModelConfig(
        provider="openai",
        model_id="gpt-test",
        max_input_tokens=200_000,
    )

    threshold = resolve_compression_threshold(config, model)

    assert threshold.tokens == 100_000
    assert threshold.percentage == 50
    assert threshold.capacity == 200_000


@verifies(SWR.SWR_1401, SWR.SWR_1436, SWR.SWR_1437)
def test_global_percentage_bounds_huge_model_context_by_default_threshold() -> None:
    config = RotarisConfig(
        compressor=CompressorConfig(
            default_threshold=120_000,
            threshold_percentage=40,
        ),
    )
    model = ModelConfig(
        provider="deepseek",
        model_id="deepseek-v4-flash",
        max_input_tokens=1_048_576,
    )

    threshold = resolve_compression_threshold(config, model)

    assert threshold.tokens == 48_000
    assert threshold.percentage == 40
    assert threshold.capacity == 120_000


@verifies(SWR.SWR_1436, SWR.SWR_1438)
def test_global_percentage_uses_default_threshold_fallback() -> None:
    config = RotarisConfig(
        compressor=CompressorConfig(
            default_threshold=120_000,
            threshold_percentage=50,
            auto_threshold_ratio=0.9,
        ),
    )

    threshold = resolve_compression_threshold(config, None)

    assert threshold.tokens == 60_000
    assert threshold.capacity == 120_000


@verifies(SWR.SWR_1439)
def test_threshold_percentage_loads_from_workspace_agents_yaml(
    tmp_path: Path,
    monkeypatch,
) -> None:
    config_dir = tmp_path / ".rotaris"
    config_dir.mkdir()
    (config_dir / "agents.yaml").write_text(
        "compressor:\n  threshold_percentage: 45\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", tmp_path / "global")

    config = loader.load_config(tmp_path)

    assert config.compressor.threshold_percentage == 45


@verifies(SWR.SWR_1439)
def test_persist_compressor_config_writes_workspace_agents_yaml(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    app = RotarisTuiApp(config=config)
    config.compressor.threshold_percentage = 35

    app._persist_compressor_config()

    agents_yaml = tmp_path / ".rotaris" / "agents.yaml"
    data = yaml.safe_load(agents_yaml.read_text(encoding="utf-8"))
    assert data["compressor"]["threshold_percentage"] == 35
