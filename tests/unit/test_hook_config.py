"""Hook declarations in the layered config (SWR-2701), exercised through the real
config loader plus the resolution and matching helpers the runtime consults."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.config import loader
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.hooks.models import (
    DEFAULT_HOOK_TIMEOUT_SECONDS,
    HOOK_EVENTS,
    LIFECYCLE_HOOK_EVENTS,
    TOOL_HOOK_EVENTS,
    ResolvedHook,
    hooks_for_event,
    matches_tool,
    resolve_hooks,
)
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


def _hook(matcher: str, *, event: str = "pre_tool") -> ResolvedHook:
    return ResolvedHook(
        name="fmt",
        event=event,
        matcher=matcher,
        command="echo fired",
        timeout_seconds=DEFAULT_HOOK_TIMEOUT_SECONDS,
        required=False,
        source="workspace",
        index=0,
    )


@verifies(SWR.SWR_2701)
def test_hook_events_cover_tool_and_lifecycle_points() -> None:
    """Productive use: a user reading the docs can name any of the seven hook points.
    Expected outcome: the event vocabulary is exactly the tool events plus the
    lifecycle events, with no overlap between the two families."""
    assert sorted(TOOL_HOOK_EVENTS) == ["post_tool", "pre_tool"]
    assert sorted(LIFECYCLE_HOOK_EVENTS) == [
        "child_completed",
        "iteration_end",
        "session_end",
        "session_start",
        "verifier_finished",
    ]
    assert HOOK_EVENTS == TOOL_HOOK_EVENTS | LIFECYCLE_HOOK_EVENTS
    assert not TOOL_HOOK_EVENTS & LIFECYCLE_HOOK_EVENTS
    assert len(HOOK_EVENTS) == 7


@verifies(SWR.SWR_2701)
def test_workspace_hooks_round_trip_through_the_layered_loader(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer declares a formatting hook in their workspace config.
    Expected outcome: every declared field survives the load unchanged and the hook
    reaches the runtime as one resolved entry with a stable id."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - name: format-after-edit
      event: post_tool
      matcher: "git commit *"
      command: uv run ruff format .
      timeout_seconds: 12.5
      required: true
""",
    )

    config = loader.load_config(workspace_root)

    assert config.hooks.enabled is True
    assert len(config.hooks.entries) == 1
    entry = config.hooks.entries[0]
    assert entry.name == "format-after-edit"
    assert entry.event == "post_tool"
    assert entry.matcher == "git commit *"
    assert entry.command == "uv run ruff format ."
    assert entry.timeout_seconds == 12.5
    assert entry.required is True
    assert entry.enabled is True

    resolved = resolve_hooks(config)
    assert len(resolved) == 1
    assert resolved[0].hook_id == "workspace:0:post_tool"
    assert resolved[0].name == "format-after-edit"
    assert resolved[0].timeout_seconds == 12.5


@verifies(SWR.SWR_2701)
def test_hook_entry_defaults_are_permissive_but_bounded(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user declares the smallest possible hook — an event and a command.
    Expected outcome: it applies to every occurrence, is non-blocking, and still carries
    the documented default timeout rather than running unbounded."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - event: session_end
      command: notify-send done
""",
    )

    entry = loader.load_config(workspace_root).hooks.entries[0]

    assert entry.name == ""
    assert entry.matcher == ""
    assert entry.required is False
    assert entry.enabled is True
    assert entry.timeout_seconds == DEFAULT_HOOK_TIMEOUT_SECONDS


@verifies(SWR.SWR_2701)
def test_workspace_hook_list_replaces_the_global_list(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a project pins its own hook set, overriding the machine-wide one.
    Expected outcome: the workspace list replaces the global list outright rather than
    appending to it, so the project can subtract a global hook it does not want."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_global(
        global_dir,
        """
hooks:
  entries:
    - name: global-audit
      event: pre_tool
      command: echo audit
    - name: global-notify
      event: session_end
      command: echo done
""",
    )
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - name: workspace-only
      event: iteration_end
      command: echo iteration
""",
    )

    config = loader.load_config(workspace_root)

    assert [entry.name for entry in config.hooks.entries] == ["workspace-only"]
    resolved = resolve_hooks(config)
    assert [hook.hook_id for hook in resolved] == ["workspace:0:iteration_end"]


@verifies(SWR.SWR_2701)
def test_workspace_can_switch_hooks_off_without_dropping_the_global_list(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer silences hooks for one repository without editing the
    machine-wide declarations.
    Expected outcome: the inherited entries stay in the config for later re-enabling, but
    the effective hook set the runtime sees is empty."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_global(
        global_dir,
        """
hooks:
  entries:
    - name: global-audit
      event: pre_tool
      command: echo audit
""",
    )
    _write_workspace(
        workspace_root,
        """
hooks:
  enabled: false
""",
    )

    config = loader.load_config(workspace_root)

    assert config.hooks.enabled is False
    assert [entry.name for entry in config.hooks.entries] == ["global-audit"]
    assert resolve_hooks(config) == ()


@verifies(SWR.SWR_2701)
def test_hook_source_provenance_records_the_declaring_scope(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the workspace-hook trust gate must tell a repo-authored hook from
    one the user installed themselves.
    Expected outcome: entries carry the scope they were read from, and an in-memory config
    with no scope reads as the built-in default scope."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_global(
        global_dir,
        """
hooks:
  entries:
    - name: global-audit
      event: pre_tool
      command: echo audit
""",
    )

    global_only = loader.load_config(workspace_root)
    assert [entry.source for entry in global_only.hooks.entries] == ["global"]
    assert resolve_hooks(global_only)[0].source == "global"

    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - name: repo-hook
      event: pre_tool
      command: echo repo
""",
    )
    layered = loader.load_config(workspace_root)
    assert [entry.source for entry in layered.hooks.entries] == ["workspace"]
    assert resolve_hooks(layered)[0].hook_id == "workspace:0:pre_tool"

    in_memory = RotarisConfig.model_validate(
        {"hooks": {"entries": [{"event": "pre_tool", "command": "echo mem"}]}},
    )
    assert resolve_hooks(in_memory)[0].source == "default"


@verifies(SWR.SWR_2701)
def test_user_authored_source_field_is_overwritten_by_the_loader(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a cloned repository must not be able to pass its hooks off as the
    user's own trusted global ones.
    Expected outcome: a 'source' written into the workspace file is replaced with the
    scope the loader actually read the entry from."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - name: sneaky
      event: pre_tool
      command: echo sneaky
      source: global
""",
    )

    config = loader.load_config(workspace_root)

    assert config.hooks.entries[0].source == "workspace"


@verifies(SWR.SWR_2701)
def test_hook_list_shorthand_is_accepted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user who only wants entries writes 'hooks:' as a plain list.
    Expected outcome: the shorthand produces the same config as the mapping form, with
    provenance still stamped on each entry."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  - name: shorthand
    event: session_start
    command: echo start
""",
    )

    config = loader.load_config(workspace_root)

    assert config.hooks.enabled is True
    assert [entry.name for entry in config.hooks.entries] == ["shorthand"]
    assert config.hooks.entries[0].source == "workspace"


@verifies(SWR.SWR_2701)
def test_bare_hooks_key_loads_as_unset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user leaves a placeholder 'hooks:' heading in their config while
    deciding what to put under it.
    Expected outcome: the config still loads, with no hooks declared and nothing crashing
    on the None that YAML produces for an empty key."""
    global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_global(
        global_dir,
        """
hooks:
  entries:
    - name: global-audit
      event: pre_tool
      command: echo audit
""",
    )
    _write_workspace(
        workspace_root,
        """
hooks:
""",
    )

    config = loader.load_config(workspace_root)

    assert [entry.name for entry in config.hooks.entries] == ["global-audit"]

    _write_workspace(workspace_root, "default_persona: orchestrator\n")
    assert loader.load_config(workspace_root).hooks.entries[0].name == "global-audit"


@verifies(SWR.SWR_2701)
def test_unknown_hook_event_is_rejected_at_load_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user mistypes an event name and wants to be told, not to watch a
    hook that never fires.
    Expected outcome: loading fails with a field-anchored error naming the offending value
    and listing the events that would have worked."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - event: on_thursday
      command: echo nope
""",
    )

    with pytest.raises(ValidationError) as excinfo:
        loader.load_config(workspace_root)

    message = str(excinfo.value)
    assert "hooks.entries.0.event" in message
    assert "on_thursday" in message
    assert "pre_tool" in message


@verifies(SWR.SWR_2701, SWR.SWR_2502)
def test_malformed_hook_matcher_is_rejected_at_load_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user writes a matcher with an unbalanced quote.
    Expected outcome: the config is refused at load time with the matcher field named,
    instead of the hook quietly matching nothing for the rest of the session."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - event: pre_tool
      matcher: "git commit -m 'unbalanced"
      command: echo nope
""",
    )

    with pytest.raises(ValidationError) as excinfo:
        loader.load_config(workspace_root)

    message = str(excinfo.value)
    assert "hooks.entries.0.matcher" in message
    assert "unbalanced" in message


@verifies(SWR.SWR_2701)
def test_blank_hook_command_is_rejected_at_load_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a half-written hook entry should not load as a silent no-op.
    Expected outcome: an entry whose command is whitespace fails validation with the
    command field named."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - event: pre_tool
      command: "   "
""",
    )

    with pytest.raises(ValidationError) as excinfo:
        loader.load_config(workspace_root)

    assert "hooks.entries.0.command" in str(excinfo.value)


@verifies(SWR.SWR_2701)
def test_non_positive_hook_timeout_is_rejected_at_load_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user cannot accidentally configure a hook that is killed before
    it starts.
    Expected outcome: a zero or negative timeout is a load-time error on the
    timeout_seconds field."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - event: pre_tool
      command: echo hi
      timeout_seconds: 0
""",
    )

    with pytest.raises(ValidationError) as excinfo:
        loader.load_config(workspace_root)

    assert "hooks.entries.0.timeout_seconds" in str(excinfo.value)


@verifies(SWR.SWR_2701)
def test_disabled_entry_is_dropped_without_renumbering_its_neighbours(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer temporarily switches one hook off.
    Expected outcome: it stops running, and the hooks around it keep the identifiers that
    diagnostics and the session snapshot already refer to."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - name: first
      event: pre_tool
      command: echo one
    - name: second
      event: pre_tool
      command: echo two
      enabled: false
    - name: third
      event: post_tool
      command: echo three
""",
    )

    resolved = resolve_hooks(loader.load_config(workspace_root))

    assert [hook.name for hook in resolved] == ["first", "third"]
    assert [hook.hook_id for hook in resolved] == [
        "workspace:0:pre_tool",
        "workspace:2:post_tool",
    ]


@verifies(SWR.SWR_2701)
def test_unnamed_hook_falls_back_to_its_stable_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a warning about a hook the user never named still has to identify it.
    Expected outcome: the resolved hook's display name is its stable id rather than blank."""
    _global_dir, workspace_root = _scopes(tmp_path, monkeypatch)
    _write_workspace(
        workspace_root,
        """
hooks:
  entries:
    - event: child_completed
      command: echo child
""",
    )

    resolved = resolve_hooks(loader.load_config(workspace_root))[0]

    assert resolved.name == resolved.hook_id == "workspace:0:child_completed"


@verifies(SWR.SWR_2701)
def test_hooks_for_event_selects_only_that_event() -> None:
    """Productive use: the session loop asks for the hooks attached to one lifecycle point.
    Expected outcome: it gets exactly those, in declaration order, and nothing else."""
    hooks = (
        _hook("", event="pre_tool"),
        _hook("", event="session_end"),
        _hook("", event="pre_tool"),
    )

    assert hooks_for_event(hooks, "pre_tool") == (hooks[0], hooks[2])
    assert hooks_for_event(hooks, "session_end") == (hooks[1],)
    assert hooks_for_event(hooks, "iteration_end") == ()


@verifies(SWR.SWR_2701)
def test_empty_matcher_applies_to_every_call() -> None:
    """Productive use: a user declares a hook without a matcher to cover everything.
    Expected outcome: it matches any tool, with or without a shell command attached."""
    hook = _hook("")

    assert matches_tool(hook, tool_name="str_replace_editor")
    assert matches_tool(hook, tool_name="terminal", command="rm -rf /")


@verifies(SWR.SWR_2701)
def test_matcher_globs_the_tool_name_when_no_command_is_available() -> None:
    """Productive use: a user scopes a hook to the file-editing tools by name.
    Expected outcome: the matcher is read as a case-sensitive glob over the tool name and
    non-matching tools are left alone."""
    hook = _hook("str_replace*")

    assert matches_tool(hook, tool_name="str_replace_editor")
    assert not matches_tool(hook, tool_name="terminal")
    assert not matches_tool(hook, tool_name="STR_REPLACE_EDITOR")


@verifies(SWR.SWR_2701, SWR.SWR_2502)
def test_matcher_is_a_command_pattern_against_every_segment_of_a_command() -> None:
    """Productive use: a user hooks 'git push' and expects it to fire even when the push is
    the tail of a compound command line.
    Expected outcome: the matcher is applied per command segment, and an unrelated command
    line does not fire the hook."""
    hook = _hook("git push *")

    assert matches_tool(hook, tool_name="terminal", command="git push origin main")
    assert matches_tool(hook, tool_name="terminal", command="uv run pytest && git push")
    assert not matches_tool(hook, tool_name="terminal", command="git status")
    # Never a substring match: a different command that merely contains the words.
    assert not matches_tool(hook, tool_name="terminal", command="echo git push")


@verifies(SWR.SWR_2701)
def test_matches_tool_never_raises_on_an_unreadable_command_or_matcher() -> None:
    """Productive use: a hook must never be able to take down the tool call it observes.
    Expected outcome: an untokenisable command line and an uncompilable matcher both
    resolve to 'does not match' instead of raising."""
    hook = _hook("git push *")

    assert not matches_tool(hook, tool_name="terminal", command="git commit -m 'unbalanced")

    # An uncompilable matcher cannot reach here through config load, but the
    # runtime must still be total if one ever does.
    broken = ResolvedHook(
        name="broken",
        event="pre_tool",
        matcher="'unbalanced",
        command="echo hi",
        timeout_seconds=DEFAULT_HOOK_TIMEOUT_SECONDS,
        required=False,
        source="workspace",
        index=0,
    )
    assert not matches_tool(broken, tool_name="terminal", command="git push")


@verifies(SWR.SWR_2701)
def test_blank_command_falls_back_to_tool_name_matching() -> None:
    """Productive use: a non-terminal tool call carries no shell command at all.
    Expected outcome: the matcher is evaluated against the tool name, so a hook scoped to
    a tool still fires for it."""
    hook = _hook("terminal")

    assert matches_tool(hook, tool_name="terminal", command="   ")
    assert not matches_tool(hook, tool_name="str_replace_editor", command="")
