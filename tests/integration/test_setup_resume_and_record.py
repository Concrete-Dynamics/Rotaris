"""Productive use: an interrupted first launch resumes and later launches start quickly.
Expected outcome: setup records preserve completed work, degradation, and fingerprint fast paths."""

from __future__ import annotations

import subprocess
from types import SimpleNamespace
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.setup import SetupManifest, SetupOutcome, load_setup_record, run_setup

if TYPE_CHECKING:
    from pathlib import Path


def _manifest() -> SetupManifest:
    return SetupManifest(schema_version=1, tools=(), mcp_pins={"@scope/mcp": "1.0.0"})


def _servers() -> dict[str, object]:
    return {"demo": SimpleNamespace(type="stdio", command="npx", args=["-y", "@scope/mcp@1.0.0"])}


@verifies(SWR.SWR_3715)
def test_cancel_resume_then_second_launch_fast_path(tmp_path: Path) -> None:
    """Productive use: a user pauses setup, resumes once, and opens later without another run.
    Expected outcome: cancellation lands on a boundary, warmup runs once, and matching state is a no-op."""
    checks = iter([False, True])
    commands: list[list[str]] = []

    cancelled = run_setup(
        manifest=_manifest(),
        mcp_servers=_servers(),
        data_dir=tmp_path,
        cancelled=lambda: next(checks),
        command_runner=lambda command, **_kwargs: subprocess.CompletedProcess(command, 0, "", ""),
    )
    assert cancelled == SetupOutcome.CANCELLED

    def run(command: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, "cached", "")

    resumed = run_setup(
        manifest=_manifest(), mcp_servers=_servers(), data_dir=tmp_path, command_runner=run
    )
    second = run_setup(
        manifest=_manifest(), mcp_servers=_servers(), data_dir=tmp_path, command_runner=run
    )

    assert resumed == SetupOutcome.COMPLETE
    assert second == SetupOutcome.COMPLETE
    assert commands == [["npx", "-y", "@scope/mcp@1.0.0", "--help"]]
    record = load_setup_record(tmp_path / "setup" / "state.json")
    assert record is not None
    assert record.outcome == "complete"


@verifies(SWR.SWR_3715)
def test_offline_warmup_records_degraded_capability_and_acceptance(tmp_path: Path) -> None:
    """Productive use: an offline user can still open Rotaris with a precise capability summary.
    Expected outcome: network-shaped command failure persists degradation and remembered acceptance."""

    def offline(_command: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise OSError("network unreachable")

    outcome = run_setup(
        manifest=_manifest(),
        mcp_servers=_servers(),
        data_dir=tmp_path,
        command_runner=offline,
        continue_on_failure=True,
    )

    assert outcome == SetupOutcome.DEGRADED
    record = load_setup_record(tmp_path / "setup" / "state.json")
    assert record is not None
    assert record.accepted_degradation is True
    assert record.degraded_capabilities == ["demo MCP server"]
    assert "network unreachable" in record.steps["warm:npx:@scope/mcp@1.0.0"].detail
