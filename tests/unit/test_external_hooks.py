"""Claude Code external-hook discovery and global policy (SWR-3725)."""

from __future__ import annotations

import json

import pytest

from rotaris_core.hooks.external import (
    CLAUDE_CODE_AGENT_ID,
    ExternalHookPolicyStore,
    discover_claude_code_hooks,
    enabled_external_hooks,
)
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit


def _settings(path, hooks: dict) -> None:
    path.write_text(json.dumps({"hooks": hooks}), encoding="utf-8")


@verifies(SWR.SWR_3725)
def test_a_user_gets_stable_compatible_and_explained_claude_hook_records(tmp_path) -> None:
    """Productive use: a user opens Settings after configuring Claude Code hooks.
    Expected outcome: compatible commands become Rotaris hooks and every unavailable
    handler stays visible with a reason the user can act on."""
    source = tmp_path / "settings.json"
    hooks = {
        "PreToolUse": [
            {"matcher": "Bash|PowerShell", "hooks": [{"type": "command", "command": "echo guard"}]},
            {"matcher": "^mcp__", "hooks": [{"type": "command", "command": "echo mcp"}]},
        ],
        "Notification": [{"hooks": [{"type": "http", "url": "https://example.invalid"}]}],
    }
    _settings(source, hooks)

    first, error = discover_claude_code_hooks(source)
    second, _ = discover_claude_code_hooks(source)

    assert error == ""
    assert [record.record_id for record in first] == [record.record_id for record in second]
    assert first[0].compatible is True
    assert first[0].resolved_hook is not None
    assert first[0].resolved_hook.event == "pre_tool"
    assert first[0].resolved_hook.tool_names == frozenset({"terminal"})
    assert first[1].compatible is False
    assert "Regular-expression" in first[1].reason
    assert first[2].compatible is False
    assert "http handlers" in first[2].reason


@verifies(SWR.SWR_3725)
def test_a_users_global_agent_and_hook_choices_persist_with_agent_precedence(tmp_path) -> None:
    """Productive use: a user disables a Claude Code hook, pauses the entire agent,
    and later resumes it.
    Expected outcome: the individual choice survives the agent toggle in the durable
    global policy."""
    store = ExternalHookPolicyStore(tmp_path / "rotaris" / "external-hooks.json")
    hook_id = "claude-code:example"

    policy = store.set_hook_enabled(hook_id, False)
    policy = store.set_agent_enabled(CLAUDE_CODE_AGENT_ID, False)

    restored = store.load()
    assert policy.enabled(CLAUDE_CODE_AGENT_ID, hook_id) is False
    assert restored.agent_enabled(CLAUDE_CODE_AGENT_ID) is False
    assert restored.hook_enabled(hook_id) is False
    resumed = store.set_agent_enabled(CLAUDE_CODE_AGENT_ID, True)
    assert resumed.enabled(CLAUDE_CODE_AGENT_ID, hook_id) is False


@verifies(SWR.SWR_3725)
def test_a_disabled_external_hook_stays_out_of_the_runtime_hook_set(tmp_path) -> None:
    """Productive use: a user turns off one imported Claude Code hook before a run.
    Expected outcome: the hook is absent from the next run's effective hook set."""
    source = tmp_path / "settings.json"
    _settings(
        source,
        {"SessionStart": [{"hooks": [{"type": "command", "command": "echo hello"}]}]},
    )
    records, error = discover_claude_code_hooks(source)
    assert error == ""
    record = records[0]
    policy = (
        ExternalHookPolicyStore(tmp_path / "policy.json").load().with_hook(record.record_id, False)
    )

    assert enabled_external_hooks(records, policy) == ()
