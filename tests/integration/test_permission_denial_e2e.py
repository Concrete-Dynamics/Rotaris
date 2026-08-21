"""Productive use: a user runs an agent under a policy that forbids a destructive command.
Expected outcome: the shell never runs it, the run keeps going, and the refusal naming the
rule shows up in the transcript the desktop app renders."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from openhands.sdk.event import ActionEvent, AgentErrorEvent
from openhands.sdk.llm import LLM, MessageToolCall, TextContent

from rotaris_core.agents.factory import create_agent_for_persona
from rotaris_core.agents.tool_registration import build_binding_key
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ApprovalHost,
    Decision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRule,
    SessionAuditLog,
    register_approval_host,
    register_permission_engine,
    reset_approval_registry,
    reset_audit_registry,
    reset_permission_registry,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState
from rotaris_core.tools.terminal import HardenedTerminalAction

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _clean_registry() -> Iterator[None]:
    reset_permission_registry()
    reset_approval_registry()
    reset_audit_registry()
    yield
    reset_permission_registry()
    reset_approval_registry()
    reset_audit_registry()


def _terminal_action_event(command: str) -> ActionEvent:
    return ActionEvent(
        thought=[TextContent(text="clean up the workspace")],
        action=HardenedTerminalAction(command=command),
        tool_name="terminal",
        tool_call_id="call-destructive",
        tool_call=MessageToolCall(
            id="call-destructive",
            name="terminal",
            arguments=f'{{"command": "{command}"}}',
            origin="completion",
        ),
        llm_response_id="resp-1",
    )


@verifies(SWR.SWR_2501)
def test_denied_terminal_command_is_blocked_and_visible_in_the_transcript(
    tmp_workspace: Path,
) -> None:
    marker = tmp_workspace / "the-shell-ran.txt"
    persona = PersonaConfig(name="coder", model="gpt-4o", tools=["terminal"])
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_workspace)

    agent = create_agent_for_persona(persona, config)(
        LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
    )

    # The factory already registered a preset-backed engine under this agent's
    # binding key (SWR-2503). Replace it with the specific command-pattern
    # policy this test exercises, addressing the very same key.
    binding_key = build_binding_key(None, persona.name)
    assert agent.permission_binding_key == binding_key
    register_permission_engine(
        binding_key,
        PermissionEngine(
            policy=PermissionPolicy(
                rules=(
                    PermissionRule(
                        "deny-recursive-delete",
                        Decision.DENY,
                        tools=frozenset({"terminal"}),
                        matcher=lambda command: "rm -rf" in command,
                        description="recursive delete",
                    ),
                ),
                preset_name="restricted",
            ),
            path_auth=PathAuth(tmp_workspace),
            persona=persona.name,
            headless=True,
        ),
    )

    command = f"rm -rf {tmp_workspace} && echo ran > {marker}"
    events = agent._execute_action_event(None, _terminal_action_event(command))  # type: ignore[arg-type]  # noqa: SLF001

    # The command never reached a shell.
    assert not marker.exists()
    assert tmp_workspace.exists()

    # The run continues: a tool result came back rather than an exception.
    assert len(events) == 1
    refusal = events[0]
    assert isinstance(refusal, AgentErrorEvent)

    # ...and it is transcript-visible: this is the event both Rotaris
    # (run_bridge._apply_tool_result_event) and the TUI render as a tool result.
    assert "deny-recursive-delete" in refusal.error
    assert "recursive delete" in refusal.error
    assert refusal.to_llm_message().role == "tool"


@verifies(SWR.SWR_2506)
def test_a_denied_call_is_recoverable_from_the_session_audit_log(tmp_workspace: Path) -> None:
    """The SWR-2506 portfolio scenario: after a run with one denied call, the audit
    log lists that denial with the rule that matched it — the record an operator
    reviews once the run is over and the transcript is gone."""
    import json

    from rotaris_core.permissions import register_audit_session
    from rotaris_core.session.diagnostics import initialize_session_diagnostics

    session_id = "audited-denial-session"
    session_dir = tmp_workspace / ".rotaris" / "sessions" / session_id
    state = SessionState(
        session_id=session_id,
        workspace_root=str(tmp_workspace),
        created_at=dt.datetime.now(dt.UTC),
        updated_at=dt.datetime.now(dt.UTC),
    )
    initialize_session_diagnostics(session_dir, state)
    register_audit_session(session_id, session_dir)

    persona = PersonaConfig(name="coder", model="gpt-4o", tools=["terminal"])
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_workspace)
    runtime_kwargs = {"session_id": session_id}
    agent = create_agent_for_persona(persona, config, runtime_kwargs)(
        LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
    )
    register_permission_engine(
        build_binding_key(runtime_kwargs, persona.name),
        PermissionEngine(
            policy=PermissionPolicy(
                rules=(
                    PermissionRule(
                        "deny-recursive-delete",
                        Decision.DENY,
                        tools=frozenset({"terminal"}),
                        matcher=lambda command: "rm -rf" in command,
                        description="recursive delete",
                    ),
                ),
                preset_name="restricted",
            ),
            path_auth=PathAuth(tmp_workspace),
            persona=persona.name,
            headless=True,
            agent_id=persona.name,
            audit_sink=SessionAuditLog(session_id, persona.name, persona.name),
        ),
    )

    agent._execute_action_event(None, _terminal_action_event("rm -rf build"))  # type: ignore[arg-type]  # noqa: SLF001

    audit_path = session_dir / "evidence" / "permissions.jsonl"
    entries = [json.loads(line) for line in audit_path.read_text(encoding="utf-8").splitlines()]
    denial = next(entry for entry in entries if entry["decision"] == "deny")
    assert denial["rule_id"] == "deny-recursive-delete"
    assert denial["tool_name"] == "terminal"
    assert denial["source"] == "rule"
    assert "rm -rf build" in denial["summary"]


@verifies(SWR.SWR_2503)
def test_default_policy_is_the_ask_preset(tmp_workspace: Path) -> None:
    """The shipped default (SWR-2503) is 'ask', not the SWR-2501 allow-all
    placeholder: a mutating tool call with no configured mode and no approval
    UI resolves fail-safe to deny; a read-only tool call is still allowed."""
    persona = PersonaConfig(name="coder", model="gpt-4o", tools=["terminal", "grep"])
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_workspace)

    create_agent_for_persona(persona, config)(
        LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
    )

    from rotaris_core.permissions import PermissionRequest, resolve_permission_engine

    engine = resolve_permission_engine(build_binding_key(None, persona.name))
    assert engine.policy.preset_name == "ask"

    mutating = engine.resolve(
        PermissionRequest(tool_name="terminal", persona="coder", command="git status"),
    )
    assert mutating.decision is Decision.DENY  # ask, fail-safe (no approval UI yet)

    read_only = engine.resolve(
        PermissionRequest(tool_name="grep", persona="coder", arguments={"pattern": "TODO"}),
    )
    assert read_only.decision is Decision.ALLOW


@verifies(SWR.SWR_2503)
def test_restricted_mode_blocks_a_write_that_autonomous_mode_permits(
    tmp_workspace: Path,
) -> None:
    """The SWR-2503 test portfolio's own prescribed scenario: launching a
    session in 'restricted' mode blocks a write that 'autonomous' mode
    permits, purely from the persona's ``permission_mode`` config field —
    no manual engine registration."""
    from rotaris_core.permissions import PermissionRequest, resolve_permission_engine

    def _resolve_write(mode: str) -> Decision:
        persona = PersonaConfig(
            name="coder",
            model="gpt-4o",
            tools=["write_file"],
            permission_mode=mode,
        )
        config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_workspace)
        # This run is unattended, so SWR-2508 would otherwise downgrade
        # 'autonomous' to 'ask'; the scenario under test is the mode contrast.
        config.runtime.allow_unsandboxed_autonomous = True
        create_agent_for_persona(persona, config)(
            LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
        )
        engine = resolve_permission_engine(build_binding_key(None, persona.name))
        target = tmp_workspace / "notes.md"
        decision = engine.resolve(
            PermissionRequest(
                tool_name="write_file",
                persona="coder",
                arguments={"path": str(target)},
            ),
        )
        return decision.decision

    assert _resolve_write("restricted") is Decision.DENY
    assert _resolve_write("autonomous") is Decision.ALLOW


@verifies(SWR.SWR_2508)
def test_unsandboxed_background_run_falls_back_to_ask_without_the_opt_in(
    tmp_workspace: Path,
) -> None:
    """The SWR-2508 portfolio scenario: a background run configured 'autonomous'
    on a host without the container sandbox behaves like 'ask' on its first
    mutating command — which, with nobody available to approve, refuses it.
    The per-workspace opt-in is the only thing that restores the old behavior."""
    from rotaris_core.permissions import PermissionRequest, resolve_permission_engine

    def _run_background_write(*, opt_in: bool) -> tuple[str, Decision]:
        persona = PersonaConfig(
            name="coder",
            model="gpt-4o",
            tools=["write_file"],
            permission_mode="autonomous",
        )
        config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_workspace)
        config.runtime.allow_unsandboxed_autonomous = opt_in
        # A background run: the headless runner attaches a host for its abort
        # hook only, so no human can answer an approval.
        runtime_kwargs = {"session_id": "background-session"}
        register_approval_host("background-session", ApprovalHost())
        create_agent_for_persona(persona, config, runtime_kwargs)(
            LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
        )
        engine = resolve_permission_engine(build_binding_key(runtime_kwargs, persona.name))
        decision = engine.resolve(
            PermissionRequest(
                tool_name="write_file",
                persona="coder",
                arguments={"path": str(tmp_workspace / "notes.md")},
            ),
        )
        return engine.policy.preset_name, decision.decision

    preset, decision = _run_background_write(opt_in=False)
    assert preset == "ask"
    assert decision is Decision.DENY

    opted_in_preset, opted_in_decision = _run_background_write(opt_in=True)
    assert opted_in_preset == "autonomous"
    assert opted_in_decision is Decision.ALLOW
