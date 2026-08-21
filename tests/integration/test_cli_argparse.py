from __future__ import annotations

import sys
from typing import TYPE_CHECKING

import pytest

from rotaris_core import __version__
from rotaris_core.cli.argparse_app import main
from rotaris_core.config import loader
from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    write_snapshot,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_1817, SWR.SWR_1820, SWR.SWR_2104)
def test_run_without_task_or_session_returns_error(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(argv=["run"])
    captured = capsys.readouterr()

    assert code == 1
    assert captured.out == ""
    assert "Error: task is required for headless mode" in captured.err


@verifies(SWR.SWR_1823, SWR.SWR_2104)
def test_run_with_unknown_argument_exits_with_argparse_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exc_info:
        main(argv=["run", "--nonexistent"])

    captured = capsys.readouterr()
    assert exc_info.value.code == 2
    assert "unrecognized arguments: --nonexistent" in captured.err


@verifies(SWR.SWR_1819, SWR.SWR_1823, SWR.SWR_1826)
@pytest.mark.parametrize(
    ("argv", "expected_output"),
    [
        ([], "CLI-native agentic orchestration framework (headless)"),
        (["run"], "--workspace"),
        (["sessions"], "--workspace"),
        (["version"], "usage: rotaris-headless version [-h]"),
    ],
)
def test_help_exits_zero_for_root_and_subcommands(
    argv: list[str],
    expected_output: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exc_info:
        main(argv=[*argv, "--help"])

    captured = capsys.readouterr()
    assert exc_info.value.code == 0
    assert expected_output in captured.out
    assert captured.err == ""


@verifies(SWR.SWR_1817, SWR.SWR_1820, SWR.SWR_2101, SWR.SWR_2104)
def test_version_subcommand_prints_package_version(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = main(argv=["version"])
    captured = capsys.readouterr()

    assert code == 0
    assert captured.out.strip() == f"Rotaris {__version__}"
    assert captured.err == ""


@verifies(SWR.SWR_1817, SWR.SWR_2104, SWR.SWR_2105)
def test_sessions_subcommand_handles_empty_workspace(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = main(argv=["sessions", "--workspace", str(tmp_path)])
    captured = capsys.readouterr()

    assert code == 0
    assert captured.out == ""
    assert captured.err == ""


@verifies(SWR.SWR_773)
def test_headless_provider_delete_requires_yes_when_noninteractive(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = main(argv=["providers", "delete", "openai-compatible--lab"])
    captured = capsys.readouterr()

    assert code == 2
    assert "requires --yes" in captured.err


@verifies(SWR.SWR_773)
def test_headless_provider_delete_with_yes(monkeypatch, capsys) -> None:
    from rotaris_core.auth.provider_settings import ProviderDeleteResult

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.delete_openai_compatible_provider",
        lambda provider_id: ProviderDeleteResult(True, "deleted", provider_id),
    )

    code = main(argv=["providers", "delete", "openai-compatible--lab", "--yes"])
    captured = capsys.readouterr()

    assert code == 0
    assert captured.out.strip() == "deleted"


@verifies(SWR.SWR_316)
def test_run_reports_incomplete_model_override_without_traceback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_config_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "deepseek": SnapshotProvider(
                    id="deepseek",
                    display_name="DeepSeek",
                    family="deepseek",
                    base_url="https://api.deepseek.com/v1",
                    authenticated=True,
                    models=[
                        SnapshotModel(
                            id="deepseek/deepseek-v4-pro",
                            display_name="DeepSeek V4 Pro",
                            discovered_at="2026-01-01T00:00:00+00:00",
                        ),
                    ],
                    small_model="deepseek/deepseek-v4-pro",
                    medium_model="deepseek/deepseek-v4-pro",
                    large_model="deepseek/deepseek-v4-pro",
                    default_summary_model="deepseek/deepseek-v4-pro",
                    discovered_at="2026-01-01T00:00:00+00:00",
                ),
            },
        ),
        base=global_dir,
    )
    (global_dir / "agents.yaml").write_text(
        """
default_summary_model: deepseek/deepseek-v4-pro
small_model: deepseek/deepseek-v4-pro
medium_model: deepseek/deepseek-v4-pro
large_model: deepseek/deepseek-v4-pro
personas:
    orchestrator:
        name: orchestrator
        model: deepseek/deepseek-v4-pro
        tools: []
compressor:
    model: deepseek/deepseek-v4-pro
""".strip(),
        encoding="utf-8",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        """
models:
    deepseek/deepseek-v4-pro:
        context_compression_threshold: 250000
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "rotaris_core.cli.background.run_background",
        lambda **_kwargs: None,
    )

    code = main(argv=["run", "--workspace", str(workspace_root), "test task"])
    captured = capsys.readouterr()

    assert code == 0
    assert "Config error:" not in captured.err


@verifies(SWR.SWR_1818, SWR.SWR_1824, SWR.SWR_2106)
def test_argparse_does_not_import_tui(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    del tmp_path
    tui_modules = [key for key in sys.modules if key.startswith("rotaris_core.tui")]
    saved_modules = {key: sys.modules.pop(key) for key in tui_modules}

    try:
        code = main(argv=["version"])
        captured = capsys.readouterr()

        assert code == 0
        assert captured.out.strip() == f"Rotaris {__version__}"
        assert captured.err == ""
        assert not any(key.startswith("rotaris_core.tui") for key in sys.modules)
    finally:
        sys.modules.update(saved_modules)
