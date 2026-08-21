from __future__ import annotations

from typing import TYPE_CHECKING

from textual.coordinate import Coordinate
from textual.events import Resize
from textual.geometry import Size
from textual.widgets import DataTable

from rotaris_core.config.project_snapshot import SnapshotModel, SnapshotProvider, update_provider
from rotaris_core.config.schema import ModelConfig, RotarisConfig
from rotaris_core.config.startup_models import STARTUP_MODEL_FIELDS
from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.screens.runtime_models import RuntimeModelsScreen
from rotaris_core.tui.screens.startup_models import (
    StartupModelsScreen,
    _ModelPickerScreen,
)
from rotaris_core.tui.widgets.model_catalog_table import (
    ModelCatalogTable,
    build_configured_catalog_rows,
    build_provider_catalogs,
    merge_runtime_catalog_row,
)

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def _picker_config(tmp_path: Path) -> RotarisConfig:
    return RotarisConfig(
        workspace_root=tmp_path,
        default_summary_model="copilot/gpt-5.2-codex",
        models={
            "copilot/gpt-5.2-codex": ModelConfig(
                provider="openai",
                model_id="gpt-5.2-codex",
                auth_provider="copilot",
            ),
            "codex/codex-mini": ModelConfig(
                provider="openai",
                model_id="codex-mini",
                auth_provider="codex",
            ),
        },
    )


@verifies(SWR.SWR_727)
def test_configured_picker_rows_normalize_auth_provider_labels(tmp_path: Path) -> None:
    rows = build_configured_catalog_rows(_picker_config(tmp_path))

    assert rows["copilot/gpt-5.2-codex"].provider_display_name == "GitHub Copilot"
    assert rows["copilot/gpt-5.2-codex"].source == "configured"
    assert rows["codex/codex-mini"].provider_display_name == "OpenAI Codex"
    assert rows["codex/codex-mini"].source == "configured"


@verifies(SWR.SWR_727)
def test_runtime_merge_deduplicates_snapshot_backed_configured_model(tmp_path: Path) -> None:
    rows = build_configured_catalog_rows(_picker_config(tmp_path))

    merged = merge_runtime_catalog_row(
        rows,
        provider_id="copilot",
        provider_display_name="GitHub Copilot",
        model=DiscoveredModel(
            id="gpt-5.2-codex",
            qualified_id="copilot/gpt-5.2-codex",
            display_name="GPT-5.2-Codex",
        ),
    )

    assert len(rows) == 2
    assert merged.selection_value == "copilot/gpt-5.2-codex"
    assert merged.provider_display_name == "GitHub Copilot"
    assert merged.model_display_name == "GPT-5.2-Codex"
    assert merged.source == "configured + runtime"
    assert rows["codex/codex-mini"].source == "configured"


@verifies(SWR.SWR_727)
def test_runtime_merge_adds_runtime_only_model_without_disturbing_configured_rows(
    tmp_path: Path,
) -> None:
    rows = build_configured_catalog_rows(_picker_config(tmp_path))

    runtime_only = merge_runtime_catalog_row(
        rows,
        provider_id="copilot",
        provider_display_name="GitHub Copilot",
        model=DiscoveredModel(
            id="runtime-only",
            qualified_id="copilot/runtime-only",
            display_name="Runtime Only",
        ),
    )

    assert len(rows) == 3
    assert runtime_only.selection_value == "copilot/runtime-only"
    assert runtime_only.provider_display_name == "GitHub Copilot"
    assert runtime_only.model_display_name == "Runtime Only"
    assert runtime_only.source == "runtime"
    assert rows["codex/codex-mini"].source == "configured"


@verifies(SWR.SWR_727)
def test_build_provider_catalogs_includes_authenticated_custom_snapshot_provider(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)

    update_provider(
        SnapshotProvider(
            id="openai-compatible--local-llama",
            display_name="Local Llama",
            family="openai-compatible",
            base_url="http://localhost:8000/v1",
            authenticated=True,
            models=[
                SnapshotModel(
                    id="openai-compatible--local-llama/llama-3.3",
                    display_name="Llama 3.3",
                    discovered_at="2026-05-21T00:00:00+00:00",
                ),
            ],
            discovered_at="2026-05-21T00:00:00+00:00",
        ),
        base=global_dir,
    )

    catalogs = build_provider_catalogs(_picker_config(tmp_path))

    assert [catalog.provider_id for catalog in catalogs] == [
        "copilot",
        "codex",
        "openai-compatible--local-llama",
    ]
    assert catalogs[2].display_name == "Local Llama"


@verifies(SWR.SWR_727)
def test_configured_picker_rows_use_custom_snapshot_provider_label(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)

    update_provider(
        SnapshotProvider(
            id="openai-compatible--local-llama",
            display_name="Local Llama",
            family="openai-compatible",
            base_url="http://localhost:8000/v1",
            authenticated=True,
            models=[],
            discovered_at="2026-05-21T00:00:00+00:00",
        ),
        base=global_dir,
    )

    config = RotarisConfig(
        workspace_root=tmp_path,
        models={
            "openai-compatible--local-llama/llama-3.3": ModelConfig(
                provider="openai",
                model_id="llama-3.3",
                auth_provider="openai-compatible--local-llama",
            ),
        },
    )

    rows = build_configured_catalog_rows(config)

    assert rows["openai-compatible--local-llama/llama-3.3"].provider_display_name == "Local Llama"


@verifies(SWR.SWR_864)
def test_configured_picker_rows_skip_synthetic_startup_models(tmp_path: Path) -> None:
    config = RotarisConfig(
        workspace_root=tmp_path,
        models={
            "claude-base": ModelConfig(
                provider="anthropic",
                model_id="claude-sonnet-4-20250514",
            ),
            "__startup_slot__:medium_model": ModelConfig(
                provider="anthropic",
                model_id="claude-sonnet-4-20250514",
                thinking="high",
            ),
        },
    )

    rows = build_configured_catalog_rows(config)

    assert list(rows) == ["claude-base"]


@verifies(SWR.SWR_727)
async def test_startup_model_picker_full_workflow_deduplicates_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def fake_discover(provider_id: str, **_kwargs: object) -> DiscoveryResult:
        if provider_id == "copilot":
            return DiscoveryResult(
                [
                    DiscoveredModel(
                        id="gpt-5.2-codex",
                        qualified_id="copilot/gpt-5.2-codex",
                        display_name="GPT-5.2-Codex",
                    ),
                ],
                None,
                200,
            )
        return DiscoveryResult([], f"{provider_id} unavailable", None)

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.discover_authenticated_models",
        fake_discover,
    )

    app = RotarisTuiApp(config=_picker_config(tmp_path))
    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)

        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, _ModelPickerScreen)

        table = app.screen.query_one(ModelCatalogTable)
        assert isinstance(table, ModelCatalogTable)
        assert table.row_count == 2
        assert table.get_row_at(0) == ["GitHub Copilot", "GPT-5.2-Codex", "configured + runtime"]
        assert table.get_row_at(1) == ["OpenAI Codex", "codex-mini", "configured"]


@verifies(SWR.SWR_727)
async def test_startup_model_picker_refresh_keeps_deduplicated_rows_stable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def fake_discover(provider_id: str, **_kwargs: object) -> DiscoveryResult:
        if provider_id == "copilot":
            return DiscoveryResult(
                [
                    DiscoveredModel(
                        id="gpt-5.2-codex",
                        qualified_id="copilot/gpt-5.2-codex",
                        display_name="GPT-5.2-Codex",
                    ),
                ],
                None,
                200,
            )
        return DiscoveryResult([], None, 200)

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.discover_authenticated_models",
        fake_discover,
    )

    app = RotarisTuiApp(config=_picker_config(tmp_path))
    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, _ModelPickerScreen)

        table = app.screen.query_one(ModelCatalogTable)
        assert table.row_count == 2

        await pilot.press("r")
        await pilot.pause()

        assert table.row_count == 2
        assert table.get_row_at(0) == ["GitHub Copilot", "GPT-5.2-Codex", "configured + runtime"]
        assert table.get_row_at(1) == ["OpenAI Codex", "codex-mini", "configured"]


@verifies(SWR.SWR_727)
async def test_startup_model_picker_random_interaction_does_not_break_table(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def fake_discover(provider_id: str, **_kwargs: object) -> DiscoveryResult:
        if provider_id == "copilot":
            return DiscoveryResult(
                [
                    DiscoveredModel(
                        id="gpt-5.2-codex",
                        qualified_id="copilot/gpt-5.2-codex",
                        display_name="GPT-5.2-Codex",
                    ),
                ],
                None,
                200,
            )
        return DiscoveryResult([], None, 200)

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.discover_authenticated_models",
        fake_discover,
    )

    app = RotarisTuiApp(config=_picker_config(tmp_path))
    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, _ModelPickerScreen)

        await pilot.press("x", "tab", "pageup", "space")
        await pilot.pause()

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        table = app.screen.query_one(ModelCatalogTable)
        assert table.row_count == 2
        assert table.get_row_at(0) == ["GitHub Copilot", "GPT-5.2-Codex", "configured + runtime"]
        assert table.get_row_at(1) == ["OpenAI Codex", "codex-mini", "configured"]


@verifies(SWR.SWR_727)
async def test_startup_model_picker_includes_custom_snapshot_provider_row(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    update_provider(
        SnapshotProvider(
            id="openai-compatible--local-llama",
            display_name="Local Llama",
            family="openai-compatible",
            base_url="http://localhost:8000/v1",
            authenticated=True,
            models=[
                SnapshotModel(
                    id="openai-compatible--local-llama/llama-3.3",
                    display_name="Llama 3.3",
                    discovered_at="2026-05-21T00:00:00+00:00",
                ),
            ],
            discovered_at="2026-05-21T00:00:00+00:00",
        ),
        base=global_dir,
    )

    async def fake_discover(provider_id: str, **_kwargs: object) -> DiscoveryResult:
        if provider_id == "openai-compatible--local-llama":
            return DiscoveryResult(
                [
                    DiscoveredModel(
                        id="llama-3.3",
                        qualified_id="openai-compatible--local-llama/llama-3.3",
                        display_name="Llama 3.3",
                    ),
                ],
                None,
                200,
            )
        return DiscoveryResult([], None, 200)

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.discover_authenticated_models",
        fake_discover,
    )

    app = RotarisTuiApp(config=_picker_config(tmp_path))
    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, _ModelPickerScreen)

        table = app.screen.query_one(ModelCatalogTable)
        assert table.row_count == 3
        assert table.get_row_at(2) == ["Local Llama", "Llama 3.3", "runtime"]


@verifies(SWR.SWR_864, SWR.SWR_862)
async def test_startup_model_picker_cycles_thinking_and_saves_override(tmp_path: Path) -> None:
    app = RotarisTuiApp(config=_picker_config(tmp_path))

    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)

        table = app.screen.query_one("#startup-models-table", DataTable)
        assert table.get_cell_at(Coordinate(0, 2)) == "copilot/gpt-5.2-codex"
        assert table.get_cell_at(Coordinate(0, 3)) == "provider / endpoint default"
        assert table.row_count == len(STARTUP_MODEL_FIELDS) + len(app.config.personas)

        await pilot.press("tab")
        await pilot.pause()
        await pilot.press("right")
        await pilot.pause()
        await pilot.press("s")
        await pilot.pause()

    agents_yaml = (tmp_path / ".rotaris" / "agents.yaml").read_text(encoding="utf-8")
    assert "default_summary_model_thinking: low" in agents_yaml


@verifies(SWR.SWR_727)
async def test_startup_models_and_picker_use_wider_modal_width(tmp_path: Path) -> None:
    app = RotarisTuiApp(config=_picker_config(tmp_path))

    async with app.run_test(size=(160, 40)) as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)

        startup_container = app.screen.query_one("#startup-models-container")
        assert startup_container.size.width >= 120

        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, _ModelPickerScreen)

        picker_container = app.screen.query_one("#model-picker-container")
        assert picker_container.size.width >= 120


@verifies(SWR.SWR_727)
async def test_startup_models_wider_modal_width_survives_random_resize(tmp_path: Path) -> None:
    app = RotarisTuiApp(config=_picker_config(tmp_path))

    async with app.run_test(size=(160, 40)) as pilot:
        await pilot.pause()
        app.action_show_startup_models()
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)

        await pilot.press("f5")
        await pilot.pause()
        app.post_message(Resize(Size(150, 40), Size(160, 40)))
        await pilot.pause()

        startup_container = app.screen.query_one("#startup-models-container")
        assert startup_container.size.width >= 120


@verifies(SWR.SWR_727, SWR.SWR_807)
async def test_runtime_model_selector_uses_shared_catalog_table_and_merged_sources(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def fake_discover(provider_id: str, **_kwargs: object) -> DiscoveryResult:
        if provider_id == "copilot":
            return DiscoveryResult(
                [
                    DiscoveredModel(
                        id="gpt-5.2-codex",
                        qualified_id="copilot/gpt-5.2-codex",
                        display_name="GPT-5.2-Codex",
                        limits={"context_window": 128000, "output_tokens": 16000},
                    ),
                ],
                None,
                200,
            )
        return DiscoveryResult([], None, 200)

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.discover_authenticated_models",
        fake_discover,
    )

    app = RotarisTuiApp(config=_picker_config(tmp_path))
    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_runtime_models()
        await pilot.pause()
        assert isinstance(app.screen, RuntimeModelsScreen)

        table = app.screen.query_one(ModelCatalogTable)
        assert isinstance(table, ModelCatalogTable)
        assert table.row_count == 1
        assert table.get_row_at(0) == ["GitHub Copilot", "GPT-5.2-Codex", "configured + runtime"]


@verifies(SWR.SWR_727)
async def test_runtime_models_screen_uses_wider_modal_width(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def fake_discover(provider_id: str, **_kwargs: object) -> DiscoveryResult:
        if provider_id == "copilot":
            return DiscoveryResult(
                [
                    DiscoveredModel(
                        id="gpt-5.2-codex",
                        qualified_id="copilot/gpt-5.2-codex",
                        display_name="GPT-5.2-Codex",
                    ),
                ],
                None,
                200,
            )
        return DiscoveryResult([], None, 200)

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.discover_authenticated_models",
        fake_discover,
    )

    app = RotarisTuiApp(config=_picker_config(tmp_path))
    async with app.run_test(size=(160, 40)) as pilot:
        await pilot.pause()
        app.action_show_runtime_models()
        await pilot.pause()
        assert isinstance(app.screen, RuntimeModelsScreen)

        runtime_container = app.screen.query_one("#runtime-models-container")
        assert runtime_container.size.width >= 120


# ---------------------------------------------------------------------------
# Onboarding Review — Save & Continue Flow (SWR-833)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_833)
async def test_onboarding_review_save_writes_to_agents_yaml(tmp_path: Path) -> None:
    """Onboarding review save persists slot assignments to workspace agents.yaml."""
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml

    yaml_path = tmp_path / ".rotaris" / "agents.yaml"
    write_minimal_agents_yaml(yaml_path)

    config = _picker_config(tmp_path)
    config.small_model = "copilot/gpt-5-nano"
    config.medium_model = "copilot/gpt-5"

    app = RotarisTuiApp(config=config)

    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models(onboarding=True, push_before_main=True)
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)
        assert app.screen._onboarding_review is True

        # Press save.
        await pilot.press("s")
        await pilot.pause()

    # Verify agents.yaml was written with slot assignments.
    agents_yaml = yaml_path.read_text(encoding="utf-8")
    assert "small_model: copilot/gpt-5-nano" in agents_yaml
    assert "medium_model: copilot/gpt-5" in agents_yaml


@verifies(SWR.SWR_833)
async def test_onboarding_review_save_transitions_to_main_screen(
    tmp_path: Path,
) -> None:
    """Onboarding save transitions to MainScreen after persisting."""
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml
    from rotaris_core.tui.screens.main import MainScreen

    yaml_path = tmp_path / ".rotaris" / "agents.yaml"
    write_minimal_agents_yaml(yaml_path)

    config = _picker_config(tmp_path)
    config.small_model = "copilot/gpt-5-nano"

    app = RotarisTuiApp(config=config)

    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models(onboarding=True, push_before_main=True)
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)

        # Press save.
        await pilot.press("s")
        await pilot.pause()

        # After save, MainScreen should be pushed (via on_close callback).
        assert isinstance(app.screen, MainScreen), (
            f"Expected MainScreen after save, got {type(app.screen).__name__}"
        )


@verifies(SWR.SWR_833)
async def test_onboarding_review_dismiss_skips_save_transitions_to_main(
    tmp_path: Path,
) -> None:
    """Onboarding close (escape) without saving still transitions to MainScreen."""
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml
    from rotaris_core.tui.screens.main import MainScreen

    yaml_path = tmp_path / ".rotaris" / "agents.yaml"
    write_minimal_agents_yaml(yaml_path)

    config = _picker_config(tmp_path)
    config.small_model = "copilot/gpt-5-nano"

    app = RotarisTuiApp(config=config)

    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_show_startup_models(onboarding=True, push_before_main=True)
        await pilot.pause()
        assert isinstance(app.screen, StartupModelsScreen)

        # Press escape to dismiss without saving.
        await pilot.press("escape")
        await pilot.pause()

        # Without save, MainScreen should still be pushed (push_before_main path).
        assert isinstance(app.screen, MainScreen), (
            f"Expected MainScreen after dismiss, got {type(app.screen).__name__}"
        )
