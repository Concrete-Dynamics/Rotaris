"""Imported external hooks executing through the runtime runner (SWR-3725)."""

from __future__ import annotations

import json
import sys

import pytest

from rotaris_core.hooks.external import (
    ExternalHookPolicy,
    discover_claude_code_hooks,
    enabled_external_hooks,
)
from rotaris_core.hooks.runner import HookRunner
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_3725)
def test_a_users_selected_claude_hook_runs_and_a_disabled_one_never_reaches_the_runner(
    tmp_path,
) -> None:
    """Productive use: a user carries a safe Claude Code terminal guard into a Rotaris run.
    Expected outcome: the selected command receives the Rotaris lifecycle event, while the
    disabled selection produces no process invocation."""
    marker = tmp_path / "marker.txt"
    script = tmp_path / "record.py"
    script.write_text(
        "from pathlib import Path\nimport sys\nPath(sys.argv[1]).write_text('ran', encoding='utf-8')\n",
        encoding="utf-8",
    )
    source = tmp_path / "settings.json"
    command = f'"{sys.executable}" "{script}" "{marker}"'
    source.write_text(
        json.dumps(
            {
                "hooks": {
                    "PreToolUse": [
                        {"matcher": "Bash", "hooks": [{"type": "command", "command": command}]}
                    ]
                }
            }
        ),
        encoding="utf-8",
    )
    records, error = discover_claude_code_hooks(source)
    assert error == ""
    enabled = enabled_external_hooks(records, ExternalHookPolicy())
    runner = HookRunner(session_id="external-hook-test", workspace=tmp_path, hooks=enabled)

    runner.run_pre_tool(tool_name="terminal", arguments={}, command="git status")

    assert marker.read_text(encoding="utf-8") == "ran"
    marker.unlink()
    disabled = ExternalHookPolicy(hooks={records[0].record_id: False})
    runner = HookRunner(
        session_id="external-hook-disabled",
        workspace=tmp_path,
        hooks=enabled_external_hooks(records, disabled),
    )
    runner.run_pre_tool(tool_name="terminal", arguments={}, command="git status")
    assert marker.exists() is False
