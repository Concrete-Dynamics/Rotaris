"""Productive use: server and CI users repair Rotaris machine tools without a GUI.
Expected outcome: CLI boundaries report progress and preserve machine-readable stdout."""

from __future__ import annotations

from typer.testing import CliRunner

from rotaris_core.cli.app import app
from rotaris_core.cli.argparse_app import main as headless_main
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.setup import SetupEvent, SetupEventKind, SetupOutcome


@verifies(SWR.SWR_3715)
def test_rotaris_cli_setup_reports_each_step_and_failure_exit(
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """Productive use: an operator provisions a machine explicitly in a terminal.
    Expected outcome: progress is readable and a failed required step returns exit code one."""
    monkeypatch.setattr(
        "rotaris_core.cli.commands.setup.run_setup",
        lambda **kwargs: (
            kwargs["emit"](
                SetupEvent(SetupEventKind.PROGRESS, "install:git", "Provision Git", 1, 4)
            )
            or SetupOutcome.DEGRADED
        ),
    )
    monkeypatch.setattr(
        "rotaris_core.config.loader.load_config",
        lambda *_args: type("C", (), {"mcp_servers": {}})(),
    )

    result = CliRunner(mix_stderr=False).invoke(app, ["setup"])

    assert result.exit_code == 1
    assert "Provision Git" in result.stderr
    assert result.stdout.strip() == "degraded"


@verifies(SWR.SWR_3715)
def test_headless_setup_keeps_diagnostics_on_stderr(monkeypatch, capsys) -> None:  # type: ignore[no-untyped-def]
    """Productive use: a stream-processing host reads setup status without mixed diagnostics.
    Expected outcome: the outcome alone reaches stdout and step detail reaches stderr."""
    monkeypatch.setattr(
        "rotaris_core.config.load_config", lambda *_args: type("C", (), {"mcp_servers": {}})()
    )

    def fake_run(**kwargs):  # type: ignore[no-untyped-def]
        kwargs["emit"](
            SetupEvent(
                SetupEventKind.FAILURE,
                "install:git",
                "Provision Git failed",
                detail="network unreachable",
            )
        )
        return SetupOutcome.DEGRADED

    monkeypatch.setattr("rotaris_core.setup.run_setup", fake_run)

    assert headless_main(["setup"]) == 1
    captured = capsys.readouterr()
    assert captured.out.strip() == "degraded"
    assert "Provision Git failed" in captured.err
    assert "network unreachable" in captured.err
