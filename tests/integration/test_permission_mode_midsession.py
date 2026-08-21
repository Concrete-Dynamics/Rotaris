"""Productive use: a user watching a restricted run decides the agent should be
allowed to get on with it, and loosens the permission mode without restarting.
Expected outcome: the very next tool call the agent makes goes through, and the
session's audit log shows the refusal, the mode change, and the acceptance in
the order they happened.

The Rotaris composer selector of SWR-2509 is the control that triggers this from
the desktop.  Its desktop half is covered by ``apps/rotaris``; what the tests
below pin down is the half a widget test cannot reach — what a mid-run change
actually does inside ``rotaris_core``: which live engines it reaches, which it
deliberately leaves alone, what agents built *after* it start in, what lands in
the audit trail, and that a mid-run reach for ``autonomous`` is re-resolved
through SWR-2508 rather than granted."""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING, Any

import pytest
from openhands.sdk.event import ActionEvent, AgentErrorEvent, ObservationEvent
from openhands.sdk.llm import LLM, MessageToolCall, TextContent
from openhands.sdk.tool import Action, Observation, ToolDefinition, ToolExecutor

from rotaris_core.agents.factory import create_agent_for_persona
from rotaris_core.agents.tool_registration import build_binding_key
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.permissions import (
    ApprovalHost,
    change_session_permission_mode,
    register_approval_host,
    register_audit_session,
    reset_approval_registry,
    reset_audit_registry,
    reset_permission_registry,
    reset_session_mode_overrides,
    resolve_permission_engine,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import initialize_session_diagnostics
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence
    from pathlib import Path

    from rotaris_core.agents.safe_agent import RotarisAgent
    from rotaris_core.permissions.engine import PermissionEngine

SESSION_ID = "midsession-mode-change"
#: A second run alive at the same time; one composer's selector must not touch it.
OTHER_SESSION_ID = "concurrent-run"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    for reset in (
        reset_permission_registry,
        reset_approval_registry,
        reset_audit_registry,
        reset_session_mode_overrides,
    ):
        reset()
    yield
    for reset in (
        reset_permission_registry,
        reset_approval_registry,
        reset_audit_registry,
        reset_session_mode_overrides,
    ):
        reset()


class EchoAction(Action):
    command: str = ""


class EchoObservation(Observation):
    ran: str = ""

    @property
    def agent_observation(self) -> list[TextContent]:
        return [TextContent(text=self.ran)]


class EchoTool(ToolDefinition[EchoAction, EchoObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[EchoTool]:
        del conv_state
        return [
            cls(
                name="terminal",
                description="Run a shell command.",
                action_type=EchoAction,
                observation_type=EchoObservation,
                executor=kwargs["executor"],
            ),
        ]


class RecordingExecutor(ToolExecutor[EchoAction, EchoObservation]):
    """Stands in for the shell, so "did it actually run" is directly observable."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, action: EchoAction, conversation: object = None) -> EchoObservation:
        del conversation
        self.calls.append(action.command)
        return EchoObservation(ran=action.command)


def _action_event(command: str, call_id: str) -> ActionEvent:
    return ActionEvent(
        thought=[TextContent(text="get the workspace into shape")],
        action=EchoAction(command=command),
        tool_name="terminal",
        tool_call_id=call_id,
        tool_call=MessageToolCall(
            id=call_id,
            name="terminal",
            arguments=f'{{"command": "{command}"}}',
            origin="completion",
        ),
        llm_response_id="resp-1",
    )


def _attach_tool(agent: RotarisAgent, executor: RecordingExecutor) -> None:
    """Give the agent its tool map without a live conversation.

    ``tools_map`` is what the SDK resolves an allowed dispatch against; the
    permission gate under test sits in front of it and is entirely real.
    """
    agent._tools = {"terminal": EchoTool.create(executor=executor)[0]}  # noqa: SLF001
    agent._initialized = True  # noqa: SLF001


@verifies(SWR.SWR_2503, SWR.SWR_2506)
def test_switching_to_autonomous_mid_run_allows_the_next_dispatch(
    tmp_workspace: Path,
) -> None:
    session_dir = tmp_workspace / ".rotaris" / "sessions" / SESSION_ID
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id=SESSION_ID,
        workspace_root=str(tmp_workspace),
        created_at=now,
        updated_at=now,
    )
    initialize_session_diagnostics(session_dir, state)
    register_audit_session(SESSION_ID, session_dir)
    # A desktop session: someone is watching, so 'autonomous' is not downgraded.
    register_approval_host(SESSION_ID, ApprovalHost(present=lambda payload: None))

    persona = PersonaConfig(name="coder", model="gpt-4o", tools=["terminal"])
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_workspace)
    config.runtime.permission_mode = "restricted"
    runtime_kwargs = {"session_id": SESSION_ID}
    agent = create_agent_for_persona(persona, config, runtime_kwargs)(
        LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
    )
    executor = RecordingExecutor()
    _attach_tool(agent, executor)
    assert (
        resolve_permission_engine(
            build_binding_key(runtime_kwargs, persona.name)
        ).policy.preset_name
        == "restricted"
    )

    command = "pytest -q"
    refused = agent._execute_action_event(None, _action_event(command, "call-1"))  # type: ignore[arg-type]  # noqa: SLF001
    assert isinstance(refused[0], AgentErrorEvent)
    assert executor.calls == []

    effective = change_session_permission_mode(SESSION_ID, "autonomous", config=config)
    assert effective.mode == "autonomous"

    allowed = agent._execute_action_event(None, _action_event(command, "call-2"))  # type: ignore[arg-type]  # noqa: SLF001

    # The same call the run refused a moment ago now reaches the tool.
    assert executor.calls == [command]
    assert isinstance(allowed[0], ObservationEvent)

    audit_path = session_dir / "evidence" / "permissions.jsonl"
    entries = [json.loads(line) for line in audit_path.read_text(encoding="utf-8").splitlines()]
    assert [entry.get("event") or entry.get("decision") for entry in entries] == [
        "deny",
        "permission_mode_change",
        "allow",
    ]


# --- SWR-2509: the core-side half of the composer's permission-mode selector ---


def _persona(name: str, pinned_mode: str | None = None) -> PersonaConfig:
    return PersonaConfig(
        name=name,
        model="gpt-4o",
        tools=["terminal"],
        permission_mode=pinned_mode,
    )


def _workspace_config(
    tmp_workspace: Path,
    personas: Sequence[PersonaConfig],
    mode: str,
) -> RotarisConfig:
    """A workspace whose ``runtime.permission_mode`` is what the selector shows."""
    config = RotarisConfig(
        personas={persona.name: persona for persona in personas},
        workspace_root=tmp_workspace,
    )
    config.runtime.permission_mode = mode
    return config


def _engine_for(
    persona: PersonaConfig,
    config: RotarisConfig,
    runtime_kwargs: dict[str, Any],
) -> PermissionEngine:
    """Build one agent the way a run does, and hand back the engine gating it.

    Going through ``create_agent_for_persona`` rather than constructing an engine
    by hand is the point: it is the real spawn path, so the engine ends up in the
    registry under the real binding key — the only handle a session-level mode
    change has on a live agent.
    """
    create_agent_for_persona(persona, config, runtime_kwargs)(
        LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
    )
    return resolve_permission_engine(build_binding_key(runtime_kwargs, persona.name))


def _watched(session_id: str) -> None:
    """Register an approval host that can prompt: somebody is at the screen."""
    register_approval_host(session_id, ApprovalHost(present=lambda payload: None))


def _audited_session(tmp_workspace: Path, session_id: str) -> Path:
    """Give *session_id* a session directory, so the audit sink has somewhere to write."""
    session_dir = tmp_workspace / ".rotaris" / "sessions" / session_id
    now = dt.datetime.now(dt.UTC)
    initialize_session_diagnostics(
        session_dir,
        SessionState(
            session_id=session_id,
            workspace_root=str(tmp_workspace),
            created_at=now,
            updated_at=now,
        ),
    )
    register_audit_session(session_id, session_dir)
    return session_dir


def _mode_changes(session_dir: Path) -> list[dict[str, Any]]:
    audit_path = session_dir / "evidence" / "permissions.jsonl"
    entries = [json.loads(line) for line in audit_path.read_text(encoding="utf-8").splitlines()]
    return [entry for entry in entries if entry.get("event") == "permission_mode_change"]


@verifies(SWR.SWR_2509)
def test_the_selector_retunes_every_agent_of_the_focused_session_and_no_other(
    tmp_workspace: Path,
) -> None:
    """Two runs are live; the composer's selector belongs to the focused one."""
    coder = _persona("coder")
    reviewer = _persona("reviewer")
    config = _workspace_config(tmp_workspace, (coder, reviewer), "restricted")
    _watched(SESSION_ID)
    _watched(OTHER_SESSION_ID)

    entry = _engine_for(coder, config, {"session_id": SESSION_ID})
    child = _engine_for(
        reviewer,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "reviewer-1"},
    )
    bystander = _engine_for(coder, config, {"session_id": OTHER_SESSION_ID})
    assert [engine.policy.preset_name for engine in (entry, child, bystander)] == [
        "restricted",
        "restricted",
        "restricted",
    ]

    effective = change_session_permission_mode(SESSION_ID, "ask", config=config)

    assert effective.mode == "ask"
    # The entry agent and the child it already spawned both move.
    assert entry.policy.preset_name == "ask"
    assert child.policy.preset_name == "ask"
    # The run the user was not looking at keeps the mode it started in.
    assert bystander.policy.preset_name == "restricted"


@verifies(SWR.SWR_2509)
def test_a_persona_pinned_to_a_mode_is_not_widened_by_the_selector(
    tmp_workspace: Path,
) -> None:
    """A persona pinned in config outranks the selector: pinning is a decision."""
    coder = _persona("coder")
    auditor = _persona("auditor", pinned_mode="restricted")
    config = _workspace_config(tmp_workspace, (coder, auditor), "restricted")
    _watched(SESSION_ID)

    unpinned = _engine_for(coder, config, {"session_id": SESSION_ID})
    pinned = _engine_for(
        auditor,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "auditor-1"},
    )

    effective = change_session_permission_mode(SESSION_ID, "autonomous", config=config)

    assert unpinned.policy.preset_name == "autonomous"
    assert pinned.policy.preset_name == "restricted"
    # The confirmation says what it actually did, not what was asked for.
    assert effective.skipped_personas == ("auditor",)


@verifies(SWR.SWR_2509)
def test_tightening_mid_run_reaches_persona_pinned_agents_too(
    tmp_workspace: Path,
) -> None:
    """The pin bounds how much rope a persona gets, not how little.

    This is the case the first implementation got wrong, and it is the one that
    costs the most when it is wrong: a user watching an agent misbehave reaches
    for the strictest mode in the selector, is told it took effect, and the
    pinned agent keeps running autonomous.  Both halves are asserted here — that
    the tightening lands, and that nothing was reported as skipped — because
    either alone would have passed against the broken version.
    """
    coder = _persona("coder")
    auditor = _persona("auditor", pinned_mode="autonomous")
    config = _workspace_config(tmp_workspace, (coder, auditor), "autonomous")
    _watched(SESSION_ID)

    unpinned = _engine_for(coder, config, {"session_id": SESSION_ID})
    pinned = _engine_for(
        auditor,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "auditor-1"},
    )
    assert pinned.policy.preset_name == "autonomous"

    effective = change_session_permission_mode(SESSION_ID, "restricted", config=config)

    assert effective.mode == "restricted"
    assert unpinned.policy.preset_name == "restricted"
    assert pinned.policy.preset_name == "restricted"
    assert effective.skipped_personas == ()


@verifies(SWR.SWR_2509)
def test_a_change_to_the_pinned_mode_itself_is_not_treated_as_widening(
    tmp_workspace: Path,
) -> None:
    """Equal restrictiveness applies; only a strictly looser change is skipped.

    Pinning ``ask`` and choosing ``ask`` must not be reported as a skip, or the
    skip list fills with personas nothing was withheld from and stops meaning
    anything.
    """
    auditor = _persona("auditor", pinned_mode="ask")
    config = _workspace_config(tmp_workspace, (auditor,), "restricted")
    _watched(SESSION_ID)

    pinned = _engine_for(auditor, config, {"session_id": SESSION_ID})

    effective = change_session_permission_mode(SESSION_ID, "ask", config=config)

    assert pinned.policy.preset_name == "ask"
    assert effective.skipped_personas == ()


@verifies(SWR.SWR_2509)
def test_the_audit_entry_names_the_personas_the_change_did_not_reach(
    tmp_workspace: Path,
) -> None:
    """SWR-2506's trail must not record a change as broader than it was.

    Without this the log says "mode changed to autonomous" and a reader has no
    way to learn that one of the live agents never moved.
    """
    coder = _persona("coder")
    auditor = _persona("auditor", pinned_mode="restricted")
    config = _workspace_config(tmp_workspace, (coder, auditor), "restricted")
    session_dir = _audited_session(tmp_workspace, SESSION_ID)
    _watched(SESSION_ID)
    _engine_for(coder, config, {"session_id": SESSION_ID})
    _engine_for(
        auditor,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "auditor-1"},
    )

    change_session_permission_mode(SESSION_ID, "autonomous", config=config)

    changes = _mode_changes(session_dir)
    assert len(changes) == 1
    assert changes[0]["effective_mode"] == "autonomous"
    assert changes[0]["skipped_personas"] == ["auditor"]


@verifies(SWR.SWR_2509)
def test_a_pin_nobody_can_resolve_does_not_license_a_widening(
    tmp_workspace: Path,
) -> None:
    """An unrecognized pin resolves to the strictest preset, and ranks that way.

    ``resolve_preset`` already gives such an engine the ``restricted`` policy, so
    ranking the raw string any higher would let a typo in a config file act as
    permission to loosen an agent that is in fact fully locked down.
    """
    auditor = _persona("auditor", pinned_mode="paranoid")
    config = _workspace_config(tmp_workspace, (auditor,), "restricted")
    _watched(SESSION_ID)

    pinned = _engine_for(auditor, config, {"session_id": SESSION_ID})
    assert pinned.policy.preset_name == "restricted"

    effective = change_session_permission_mode(SESSION_ID, "autonomous", config=config)

    assert pinned.policy.preset_name == "restricted"
    assert effective.skipped_personas == ("auditor",)


@verifies(SWR.SWR_2509)
def test_the_chosen_mode_carries_to_agents_built_later_in_the_same_session(
    tmp_workspace: Path,
) -> None:
    """The next Ralph iteration and any newly spawned child start in the new mode.

    Only the unpinned ones: a persona pin keeps precedence in agents built after
    the change just as it does in the live ones.
    """
    coder = _persona("coder")
    auditor = _persona("auditor", pinned_mode="restricted")
    config = _workspace_config(tmp_workspace, (coder, auditor), "restricted")
    _watched(SESSION_ID)

    first_iteration = _engine_for(coder, config, {"session_id": SESSION_ID})
    change_session_permission_mode(SESSION_ID, "ask", config=config)
    assert first_iteration.policy.preset_name == "ask"

    # The entry agent rebuilt for the next Ralph iteration carries the same
    # runtime context, so it re-registers under the same binding key and really
    # replaces the engine above rather than adding a second one beside it.
    next_iteration = _engine_for(coder, config, {"session_id": SESSION_ID})
    later_child = _engine_for(
        coder,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "helper-1"},
    )
    later_pinned_child = _engine_for(
        auditor,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "auditor-1"},
    )

    assert next_iteration is not first_iteration
    assert next_iteration.policy.preset_name == "ask"
    assert later_child.policy.preset_name == "ask"
    assert later_pinned_child.policy.preset_name == "restricted"


@verifies(SWR.SWR_2509)
def test_choosing_a_mode_mid_run_is_written_to_the_session_audit_log(
    tmp_workspace: Path,
) -> None:
    """The trail says what was asked for, what took effect, and what it replaced."""
    coder = _persona("coder")
    config = _workspace_config(tmp_workspace, (coder,), "restricted")
    session_dir = _audited_session(tmp_workspace, SESSION_ID)
    _watched(SESSION_ID)
    _engine_for(coder, config, {"session_id": SESSION_ID})

    change_session_permission_mode(SESSION_ID, "ask", config=config)

    changes = _mode_changes(session_dir)
    assert len(changes) == 1
    assert changes[0]["session_id"] == SESSION_ID
    assert changes[0]["requested_mode"] == "ask"
    assert changes[0]["effective_mode"] == "ask"
    assert changes[0]["previous_mode"] == "restricted"
    assert changes[0]["source"] == "user"


@verifies(SWR.SWR_2509)
def test_reaching_for_autonomous_mid_run_is_downgraded_when_nobody_can_be_asked(
    tmp_workspace: Path,
) -> None:
    """SWR-2508 is re-resolved on the mid-run switch, not only at run start.

    No approval host is registered, so this run is unattended; the workspace has
    neither the sandbox nor the ``allow_unsandboxed_autonomous`` opt-in.  Picking
    ``autonomous`` from the composer must therefore land on ``ask``, and say so.
    """
    coder = _persona("coder")
    config = _workspace_config(tmp_workspace, (coder,), "restricted")
    assert config.runtime.sandbox_mode == "off"
    assert config.runtime.allow_unsandboxed_autonomous is False
    session_dir = _audited_session(tmp_workspace, SESSION_ID)
    live = _engine_for(coder, config, {"session_id": SESSION_ID})

    effective = change_session_permission_mode(SESSION_ID, "autonomous", config=config)

    assert effective.requested == "autonomous"
    assert effective.mode == "ask"
    assert effective.downgraded is True
    assert "autonomous" in effective.reason
    assert live.policy.preset_name == "ask"

    # An agent built after the switch re-resolves the downgrade for itself,
    # rather than inheriting the permissive name that was asked for.
    later_child = _engine_for(
        coder,
        config,
        {"session_id": SESSION_ID, "child_canonical_name": "helper-1"},
    )
    assert later_child.policy.preset_name == "ask"

    changes = _mode_changes(session_dir)
    assert len(changes) == 1
    assert changes[0]["requested_mode"] == "autonomous"
    assert changes[0]["effective_mode"] == "ask"
    assert changes[0]["reason"] == effective.reason
