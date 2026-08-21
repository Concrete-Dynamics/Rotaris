"""The ``checkpoints:`` config section for automatic per-iteration git checkpoints
(SWR-2436), exercised through the real layered config loader."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.config import loader
from rotaris_core.config.schema import CheckpointConfig
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _scopes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    """Create an isolated global config dir and workspace, return (global_dir, root)."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    return global_dir, workspace_root


def _write_global(global_dir: Path, body: str) -> None:
    (global_dir / "agents.yaml").write_text(body.strip() + "\n", encoding="utf-8")


def _write_workspace(workspace_root: Path, body: str) -> None:
    path = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml"
    path.write_text(body.strip() + "\n", encoding="utf-8")


@verifies(SWR.SWR_2436)
def test_checkpoint_defaults_leave_the_decision_to_the_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user who has configured nothing still gets undoable iterations
    where Rotaris owns the tree.
    Expected outcome: 'enabled' is left unset so worktree isolation can decide, the ref
    count is bounded, and new files are part of a checkpoint."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)

    checkpoints = loader.load_config(workspace_root).checkpoints

    assert checkpoints.enabled is None
    assert checkpoints.max_per_session == 50
    assert checkpoints.include_untracked is True


@verifies(SWR.SWR_2436)
def test_explicit_false_is_distinguishable_from_unset() -> None:
    """Productive use: a user who says 'never checkpoint this project' must not have that
    silently reversed by worktree isolation.
    Expected outcome: an explicit false is preserved as false and is distinguishable from
    the unset default, which stays None."""
    unset = CheckpointConfig()
    disabled = CheckpointConfig(enabled=False)
    forced_on = CheckpointConfig(enabled=True)

    assert unset.enabled is None
    assert disabled.enabled is False
    assert forced_on.enabled is True
    assert unset.enabled is not disabled.enabled
    # The distinction has to survive a falsy-value test, which is where a
    # two-valued flag would collapse the two cases into one.
    assert not disabled.enabled
    assert not unset.enabled


@verifies(SWR.SWR_2436)
def test_workspace_checkpoint_settings_layer_over_the_global_ones(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user turns checkpointing on machine-wide and tightens the retained
    count for one noisy repository.
    Expected outcome: the workspace value wins for the field it sets, and the global value
    survives for the fields it does not."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_global(
        global_dir,
        """
checkpoints:
  enabled: true
  max_per_session: 200
  include_untracked: false
""",
    )
    _write_workspace(
        workspace_root,
        """
checkpoints:
  max_per_session: 5
""",
    )

    checkpoints = loader.load_config(workspace_root).checkpoints

    assert checkpoints.enabled is True
    assert checkpoints.max_per_session == 5
    assert checkpoints.include_untracked is False


@verifies(SWR.SWR_2436)
def test_workspace_can_switch_checkpointing_off_explicitly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: one repository opts out of checkpointing even though the machine-wide
    config enables it.
    Expected outcome: the loaded config reports an explicit false, not an unset value."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_global(global_dir, "checkpoints:\n  enabled: true\n")
    _write_workspace(workspace_root, "checkpoints:\n  enabled: false\n")

    assert loader.load_config(workspace_root).checkpoints.enabled is False


@verifies(SWR.SWR_2436)
def test_bare_checkpoints_key_loads_as_unset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user leaves a placeholder 'checkpoints:' heading in their config.
    Expected outcome: the config still loads and the section keeps its defaults instead of
    crashing on the None that YAML produces for an empty key."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(workspace_root, "checkpoints:\n")

    checkpoints = loader.load_config(workspace_root).checkpoints

    assert checkpoints.enabled is None
    assert checkpoints.max_per_session == 50


@verifies(SWR.SWR_2436)
def test_zero_checkpoint_retention_is_rejected_at_load_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: 'keep zero checkpoints' is a way to silently lose undo, so it should
    be spelled 'enabled: false' instead.
    Expected outcome: a retention count below one fails validation with the field named."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(workspace_root, "checkpoints:\n  max_per_session: 0\n")

    with pytest.raises(ValidationError) as excinfo:
        loader.load_config(workspace_root)

    assert "checkpoints.max_per_session" in str(excinfo.value)
