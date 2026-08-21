from __future__ import annotations

import os
import tempfile
from contextlib import suppress
from pathlib import Path
from typing import NamedTuple

from rotaris_core.reqtocode import SWR, traces


class BootstrapResult(NamedTuple):
    written: bool
    path: Path
    skipped_reason: str | None


def _render_minimal_agents_yaml(default_persona: str) -> str:
    # Hand-written literal keeps the file exactly minimal, including comments.
    return (
        "# Rotaris minimal startup config.\n"
        "# Edit to override built-in personas, models, or MCP servers.\n"
        "# Run `rotaris-cli login <provider>` to wire up real models.\n"
        "\n"
        f"default_persona: {default_persona}\n"
        "default_summary_model: null\n"
        "default_summary_model_thinking: null\n"
        "large_model: null\n"
        "large_model_thinking: null\n"
        "medium_model: null\n"
        "medium_model_thinking: null\n"
        "small_model: null\n"
        "small_model_thinking: null\n"
        "fallback_model: null\n"
        "fallback_model_thinking: null\n"
        "improvement_collector_model: null\n"
        "improvement_collector_model_thinking: null\n"
    )


@traces(SWR.SWR_726, SWR.SWR_727, SWR.SWR_728, SWR.SWR_737, SWR.SWR_738)
def write_minimal_agents_yaml(
    path: Path,
    *,
    default_persona: str = "orchestrator",
    overwrite: bool = False,
) -> BootstrapResult:
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists() and not overwrite:
        return BootstrapResult(written=False, path=path, skipped_reason="exists")

    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(fd)
    tmp_path = Path(tmp)
    try:
        tmp_path.write_text(_render_minimal_agents_yaml(default_persona), encoding="utf-8")
        os.chmod(tmp_path, 0o644)
        os.replace(tmp_path, path)
    finally:
        with suppress(FileNotFoundError):
            tmp_path.unlink()

    return BootstrapResult(written=True, path=path, skipped_reason=None)


def is_bootstrap_needed(workspace_root: Path) -> bool:
    path = workspace_root / ".rotaris" / "agents.yaml"
    if not path.exists():
        return True
    try:
        return path.read_text(encoding="utf-8").strip() == ""
    except (IsADirectoryError, UnicodeDecodeError):
        return True
