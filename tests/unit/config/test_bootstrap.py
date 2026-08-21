from __future__ import annotations

import os
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.bootstrap import (
    BootstrapResult,
    is_bootstrap_needed,
    write_minimal_agents_yaml,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


EXPECTED_DEFAULT = """# Rotaris minimal startup config.
# Edit to override built-in personas, models, or MCP servers.
# Run `rotaris-cli login <provider>` to wire up real models.

default_persona: orchestrator
default_summary_model: null
default_summary_model_thinking: null
large_model: null
large_model_thinking: null
medium_model: null
medium_model_thinking: null
small_model: null
small_model_thinking: null
fallback_model: null
fallback_model_thinking: null
improvement_collector_model: null
improvement_collector_model_thinking: null
"""


@verifies(SWR.SWR_313, SWR.SWR_318, SWR.SWR_728, SWR.SWR_738)
def test_write_minimal_agents_yaml_writes_fresh_file(tmp_path: Path) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"

    result = write_minimal_agents_yaml(path)

    assert result == BootstrapResult(
        written=True,
        path=path,
        skipped_reason=None,
    )
    assert path.read_text(encoding="utf-8") == EXPECTED_DEFAULT


@verifies(SWR.SWR_313, SWR.SWR_318, SWR.SWR_737)
def test_write_minimal_agents_yaml_skips_non_empty_existing_file(tmp_path: Path) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"
    path.parent.mkdir(parents=True)
    path.write_text("default_persona: tester\n", encoding="utf-8")

    result = write_minimal_agents_yaml(path)

    assert result == BootstrapResult(
        written=False,
        path=path,
        skipped_reason="exists",
    )
    assert path.read_text(encoding="utf-8") == "default_persona: tester\n"


@verifies(SWR.SWR_313, SWR.SWR_318)
def test_write_minimal_agents_yaml_skips_empty_existing_file_without_overwrite(
    tmp_path: Path,
) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"
    path.parent.mkdir(parents=True)
    path.touch()

    result = write_minimal_agents_yaml(path)

    assert result == BootstrapResult(
        written=False,
        path=path,
        skipped_reason="exists",
    )
    assert path.read_text(encoding="utf-8") == ""


@verifies(SWR.SWR_313, SWR.SWR_318)
def test_write_minimal_agents_yaml_overwrite_replaces_empty_existing_file(tmp_path: Path) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"
    path.parent.mkdir(parents=True)
    path.touch()

    result = write_minimal_agents_yaml(path, overwrite=True)

    assert result == BootstrapResult(
        written=True,
        path=path,
        skipped_reason=None,
    )
    assert path.read_text(encoding="utf-8") == EXPECTED_DEFAULT


@verifies(SWR.SWR_313, SWR.SWR_318)
def test_write_minimal_agents_yaml_overwrite_replaces_non_empty_existing_file(
    tmp_path: Path,
) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"
    path.parent.mkdir(parents=True)
    path.write_text("old\n", encoding="utf-8")

    result = write_minimal_agents_yaml(path, overwrite=True)

    assert result == BootstrapResult(
        written=True,
        path=path,
        skipped_reason=None,
    )
    assert path.read_text(encoding="utf-8") == EXPECTED_DEFAULT


@verifies(SWR.SWR_313, SWR.SWR_318)
def test_write_minimal_agents_yaml_creates_missing_parent_dirs(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "project" / ".rotaris" / "agents.yaml"

    result = write_minimal_agents_yaml(path)

    assert result.written is True
    assert path.exists()


@verifies(SWR.SWR_726)
@pytest.mark.skipif(os.name == "nt", reason="Windows does not preserve POSIX 0644 mode bits")
def test_write_minimal_agents_yaml_sets_permissions_0644(tmp_path: Path) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"

    write_minimal_agents_yaml(path)

    assert path.stat().st_mode & 0o777 == 0o644


@verifies(SWR.SWR_313, SWR.SWR_318)
def test_write_minimal_agents_yaml_leaves_no_tmp_files(tmp_path: Path) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"

    write_minimal_agents_yaml(path)

    assert not any(
        candidate.name.startswith(".agents.yaml.") for candidate in path.parent.iterdir()
    )


@verifies(SWR.SWR_313, SWR.SWR_318)
def test_is_bootstrap_needed_handles_missing_empty_and_non_empty_files(tmp_path: Path) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"

    assert is_bootstrap_needed(tmp_path) is True

    path.parent.mkdir(parents=True)
    path.touch()
    assert is_bootstrap_needed(tmp_path) is True

    path.write_text("default_persona: orchestrator\n", encoding="utf-8")
    assert is_bootstrap_needed(tmp_path) is False


@verifies(SWR.SWR_313, SWR.SWR_318, SWR.SWR_728)
def test_write_minimal_agents_yaml_uses_default_persona_argument(
    tmp_path: Path,
) -> None:
    path = tmp_path / ".rotaris" / "agents.yaml"

    write_minimal_agents_yaml(path, default_persona="tester")

    assert path.read_text(encoding="utf-8") == EXPECTED_DEFAULT.replace(
        "orchestrator",
        "tester",
    )
