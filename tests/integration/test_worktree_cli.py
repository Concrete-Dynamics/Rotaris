from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_2408, SWR.SWR_2409)
def test_headless_cli_forwards_create_and_attach_worktree_options(
    tmp_path: Path, monkeypatch
) -> None:
    """Productive use: headless user launches a task in a new or existing worktree.
    Expected outcome: public CLI forwards isolation choices to session execution unchanged."""
    from rotaris_core.cli import argparse_app, background

    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        argparse_app,
        "_load_config",
        lambda workspace, _config: RotarisConfig(workspace_root=workspace),
    )
    monkeypatch.setattr("rotaris_core.config.validation.validate_config", lambda _config: [])
    monkeypatch.setattr(background, "run_background", lambda **kwargs: calls.append(kwargs))

    assert (
        argparse_app.main(
            [
                "run",
                "implement task",
                "--workspace",
                str(tmp_path),
                "--isolate",
                "--worktree-branch",
                "feature/isolated",
            ]
        )
        == 0
    )
    assert calls[-1]["isolate"] is True
    assert calls[-1]["worktree_branch"] == "feature/isolated"

    attached = tmp_path / "existing-worktree"
    assert (
        argparse_app.main(
            ["run", "continue task", "--workspace", str(tmp_path), "--worktree", str(attached)]
        )
        == 0
    )
    assert calls[-1]["isolate"] is False
    assert calls[-1]["worktree_path"] == attached
