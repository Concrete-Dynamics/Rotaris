from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from rotaris_core.config import loader
from rotaris_core.config.project_init_state import (
    mark_task,
    read_initialization_state,
    write_initialization_state,
)
from rotaris_core.config.schema import DEFAULT_SOURCE_EXTENSIONS, InitializationState
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setattr(Path, "home", staticmethod(lambda: fake_home))
    monkeypatch.setenv("APPDATA", str(fake_home / "AppData" / "Roaming"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(fake_home / ".config"))
    return fake_home


@pytest.fixture
def global_dir(tmp_path: Path, isolated_home: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    empty_global = tmp_path / "global"
    empty_global.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", empty_global)
    return empty_global


@pytest.fixture
def workspace(tmp_path: Path, global_dir: Path) -> Path:
    ws = tmp_path / "ws"
    (ws / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir(parents=True)
    return ws


def _write_agents_yaml(config_dir: Path, content: str) -> None:
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "agents.yaml").write_text(content, encoding="utf-8")


def _read_agents_yaml(workspace_root: Path) -> dict[str, object]:
    path = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml"
    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_workspace_without_initialization_section_reads_as_never_initialized(
    workspace: Path,
) -> None:
    """Productive use: a user opening a brand-new workspace is offered project setup.
    Expected outcome: a workspace whose config records no initialization outcome
    reports itself as never initialized, so the setup prompt can be shown."""
    state = read_initialization_state(workspace)

    assert state.never_initialized
    assert state.completed == []
    assert state.skipped == []
    assert state.last_run is None


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_bare_initialization_key_reads_as_never_initialized(workspace: Path) -> None:
    """Productive use: a user hand-edits agents.yaml and leaves `initialization:` empty.
    Expected outcome: the empty section is treated as "never initialized" instead of
    crashing the read, so the workspace still gets its setup prompt."""
    _write_agents_yaml(
        workspace / loader.WORKSPACE_CONFIG_DIR_NAME,
        "default_persona: orchestrator\ninitialization:\n",
    )

    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_written_initialization_state_round_trips_through_the_workspace_file(
    workspace: Path,
) -> None:
    """Productive use: a user's initialization choices survive closing and reopening the app.
    Expected outcome: the state written to the workspace config reads back field for field."""
    state = InitializationState(
        completed=["serena"],
        skipped=["future-task"],
        last_run="2026-08-06T10:00:00+00:00",
        classification="code",
    )

    write_initialization_state(workspace, state)

    reloaded = read_initialization_state(workspace)
    assert reloaded == state
    assert not reloaded.never_initialized


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_recorded_run_with_no_applicable_tasks_is_not_never_initialized(
    workspace: Path,
) -> None:
    """Productive use: a user opens a workspace where no initialization task applies.
    Expected outcome: the workspace is marked initialized by the recorded run timestamp
    alone, so the prompt does not reappear on every launch."""
    write_initialization_state(workspace, InitializationState(last_run="2026-08-06T10:00:00+00:00"))

    reloaded = read_initialization_state(workspace)
    assert not reloaded.never_initialized
    assert reloaded.completed == []
    assert reloaded.skipped == []


@verifies(SWR.SWR_2806)
def test_writing_initialization_state_preserves_unrelated_top_level_keys(
    workspace: Path,
) -> None:
    """Productive use: recording an initialization outcome never costs a user their settings.
    Expected outcome: desktop-app and persona keys in the same agents.yaml survive the write."""
    _write_agents_yaml(
        workspace / loader.WORKSPACE_CONFIG_DIR_NAME,
        (
            "default_persona: coding-agent\n"
            "rotaris:\n"
            "  last_view: workspace\n"
            "  window:\n"
            "    width: 1280\n"
            "personas:\n"
            "  coding-agent:\n"
            "    model: custom-model\n"
        ),
    )

    write_initialization_state(workspace, InitializationState(completed=["serena"], last_run="t"))

    raw = _read_agents_yaml(workspace)
    assert raw["default_persona"] == "coding-agent"
    assert raw["rotaris"] == {"last_view": "workspace", "window": {"width": 1280}}
    assert raw["personas"] == {"coding-agent": {"model": "custom-model"}}
    assert raw["initialization"] == {
        "completed": ["serena"],
        "skipped": [],
        "last_run": "t",
    }


@verifies(SWR.SWR_2806)
def test_writing_initialization_state_bootstraps_a_missing_agents_yaml(
    workspace: Path,
) -> None:
    """Productive use: a user initializes a workspace that has no config file yet.
    Expected outcome: the writer creates the config instead of failing, and the state is read
    back from it."""
    path = workspace / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml"
    assert not path.exists()

    write_initialization_state(workspace, InitializationState(skipped=["serena"], last_run="t"))

    assert path.exists()
    assert read_initialization_state(workspace).skipped == ["serena"]


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_mark_task_records_completion_and_stamps_the_run_timestamp(workspace: Path) -> None:
    """Productive use: a user runs project setup and the result is remembered.
    Expected outcome: the finished task is recorded as completed with a run timestamp, so the
    prompt does not reappear."""
    state = mark_task(workspace, "serena", outcome="completed", classification="code")

    assert state.completed == ["serena"]
    assert state.skipped == []
    assert state.classification == "code"
    assert state.last_run is not None
    assert not state.never_initialized
    assert read_initialization_state(workspace) == state


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_mark_task_moves_a_previously_skipped_task_into_completed(workspace: Path) -> None:
    """Productive use: a user who skipped setup later triggers it manually.
    Expected outcome: the task moves from skipped to completed instead of being listed twice,
    so it is never offered as pending again."""
    mark_task(workspace, "serena", outcome="skipped")

    state = mark_task(workspace, "serena", outcome="completed")

    assert state.completed == ["serena"]
    assert state.skipped == []
    assert state.is_resolved("serena")


@verifies(SWR.SWR_2804, SWR.SWR_2806)
def test_mark_task_keeps_the_recorded_classification_when_none_is_supplied(
    workspace: Path,
) -> None:
    """Productive use: the UI can keep explaining why no code memories were created.
    Expected outcome: a later task outcome that carries no classification does not erase the
    documentation-only verdict recorded earlier."""
    mark_task(workspace, "serena", outcome="completed", classification="non-code")

    state = mark_task(workspace, "future-task", outcome="skipped")

    assert state.classification == "non-code"


@verifies(SWR.SWR_2802, SWR.SWR_2806)
def test_workspace_initialization_section_reaches_the_loaded_config(workspace: Path) -> None:
    """Productive use: the app decides whether to prompt for setup from the loaded config.
    Expected outcome: the initialization section written into the workspace config is visible
    on the RotarisConfig the app loads."""
    _write_agents_yaml(
        workspace / loader.WORKSPACE_CONFIG_DIR_NAME,
        (
            "initialization:\n"
            "  completed: [serena]\n"
            "  skipped: []\n"
            '  last_run: "2026-08-06T10:00:00+00:00"\n'
            "  classification: code\n"
        ),
    )

    config = loader.load_config(workspace)

    assert config.initialization.completed == ["serena"]
    assert config.initialization.classification == "code"
    assert not config.initialization.never_initialized


@verifies(SWR.SWR_2804, SWR.SWR_2806)
def test_workspace_source_extensions_override_reaches_the_loaded_config(workspace: Path) -> None:
    """Productive use: a user working in an unusual language declares which files count as code.
    Expected outcome: the workspace override replaces the built-in extension list on the loaded
    config, so classification follows the user's declaration."""
    _write_agents_yaml(
        workspace / loader.WORKSPACE_CONFIG_DIR_NAME,
        'project_init:\n  source_extensions: [".nim", ".zig"]\n',
    )

    config = loader.load_config(workspace)

    assert config.project_init.source_extensions == [".nim", ".zig"]


@verifies(SWR.SWR_2804, SWR.SWR_2806)
def test_default_source_extensions_are_used_when_no_override_is_configured(
    workspace: Path,
) -> None:
    """Productive use: a user gets sensible code detection without configuring anything.
    Expected outcome: the documented default extension list is present on the loaded config."""
    config = loader.load_config(workspace)

    assert config.project_init.source_extensions == list(DEFAULT_SOURCE_EXTENSIONS)
    assert ".py" in config.project_init.source_extensions
    assert len(DEFAULT_SOURCE_EXTENSIONS) == 23


@verifies(SWR.SWR_2806)
def test_workspace_initialization_merges_field_wise_over_the_global_scope(
    workspace: Path,
    global_dir: Path,
) -> None:
    """Productive use: a per-project initialization record does not lose a user's global settings.
    Expected outcome: the workspace overrides only the fields it names; global fields for both
    project-initialization sections survive."""
    _write_agents_yaml(
        global_dir,
        (
            'project_init:\n  source_extensions: [".py"]\n'
            "initialization:\n"
            "  skipped: [legacy-task]\n"
            '  last_run: "2026-01-01T00:00:00+00:00"\n'
        ),
    )
    _write_agents_yaml(
        workspace / loader.WORKSPACE_CONFIG_DIR_NAME,
        "initialization:\n  completed: [serena]\n",
    )

    config = loader.load_config(workspace)

    assert config.initialization.completed == ["serena"]
    assert config.initialization.skipped == ["legacy-task"]
    assert config.initialization.last_run == "2026-01-01T00:00:00+00:00"
    assert config.project_init.source_extensions == [".py"]
