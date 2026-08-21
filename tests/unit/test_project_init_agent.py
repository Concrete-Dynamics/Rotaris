"""Behaviour of the `project-initializer` agent runner (SWR-2803, SWR-2804).

These tests drive the *real* agent — real persona, real toolset, real
``LocalConversation`` — and fake only the two things a hermetic test must: the
network call to the model (``ScriptedLLM``) and the Serena MCP server
(``RecordingMCPToolProvider``). Everything the runner reasons about — the
``ActionEvent``/``ObservationEvent`` pairs it derives its verdict from — is
produced by the SDK, not by the test.
"""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.defaults import DEFAULT_CONFIG
from rotaris_core.config.project_init_state import read_initialization_state
from rotaris_core.init import serena_task
from rotaris_core.init.serena_task import (
    run_serena_initialization,
)
from rotaris_core.reqtocode import SWR, verifies
from tests.integration.scripted_llm import (
    RecordingMCPToolProvider,
    ScriptedLLM,
    say,
    tool_call,
)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig

pytestmark = pytest.mark.asyncio


def _serena_stub(**overrides: object) -> RecordingMCPToolProvider:
    """A Serena already bound to its project, as SWR-2905 leaves it.

    ``activate_project`` is absent because Serena stops advertising it in
    single-project mode — the initializer cannot call a tool that is not there,
    and the runner reads ``onboarding``'s *presence* as proof Serena arrived.

    ``onboarding``'s answer is deliberately *instructions*, not a confirmation:
    that is what the real tool returns, and the memories only exist once
    ``write_memory`` has run.
    """
    tools: dict[str, object] = {
        "onboarding": "Gather the project's facts, then persist them with write_memory.",
        "write_memory": "Memory written.",
    }
    tools.update(overrides)
    return RecordingMCPToolProvider(
        tools,  # type: ignore[arg-type]
        # `write_memory` is the one tool here the agent passes arguments to, so it
        # gets a real schema; the default is a closed empty object, which would
        # reject them.
        schemas={
            "write_memory": {
                "type": "object",
                "properties": {
                    "memory_name": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["memory_name", "content"],
            },
        },
    )


def _config(workspace: Path) -> RotarisConfig:
    """Built-in defaults, pointed at *workspace* and allowed to run unattended.

    ``autonomous`` + the unsandboxed opt-in is the workspace posture under which
    Serena's MCP tools are dispatched without an approval prompt. Without it the
    engine (SWR-2508) correctly downgrades an unattended run to ``ask`` and
    denies every MCP call, which would make these tests assert on the permission
    system rather than on initialization.
    """
    runtime = DEFAULT_CONFIG.runtime.model_copy(
        update={"permission_mode": "autonomous", "allow_unsandboxed_autonomous": True},
    )
    return DEFAULT_CONFIG.model_copy(update={"workspace_root": workspace, "runtime": runtime})


def _code_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "code-ws"
    workspace.mkdir()
    (workspace / "main.py").write_text("print('hello')\n", encoding="utf-8")
    return workspace


def _docs_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "docs-ws"
    workspace.mkdir()
    (workspace / "README.md").write_text("# Docs only\n", encoding="utf-8")
    return workspace


@verifies(SWR.SWR_2803, SWR.SWR_2804, SWR.SWR_2905)
async def test_activates_project_and_writes_config(tmp_path: Path) -> None:
    """Productive use: a user initializing a code project gets Serena activated and onboarded.
    Expected outcome: onboarding really fires, activation is reported as done without the
    agent doing anything about it, and the result records a `code` classification so the
    prompt never returns."""
    workspace = _code_workspace(tmp_path)
    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            tool_call("write_memory", memory_name="core", content="A demo project."),
            say(
                "onboarding: success\n"
                "summary: Serena is set up and its project memories are written.",
            ),
        ],
    )
    serena = _serena_stub()

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert result.succeeded
    assert result.status == "success"
    assert result.classification == "code"
    assert result.activation == "success"
    assert result.onboarding == "success"
    assert result.error is None
    assert result.warnings == ()
    assert result.summary == "Serena is set up and its project memories are written."

    # The agent genuinely called Serena, and genuinely wrote a memory — the step
    # claims memories exist, and `onboarding` alone does not create one. It spent
    # no turn on activation, which Serena already did at launch (SWR-2905).
    assert serena.called_names == ["onboarding", "write_memory"]
    assert scripted.exhausted

    # The runner reports; `registry.run_pending_tasks` is what records. Running
    # the task directly therefore leaves the workspace untouched by design.
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803, SWR.SWR_2804)
async def test_skips_onboarding_for_empty_project(tmp_path: Path) -> None:
    """Productive use: a user initializing a docs-only project still gets Serena activated.
    Expected outcome: onboarding never runs, the result says `skipped-no-code`, and the
    config records the workspace as initialized with a `non-code` classification."""
    workspace = _docs_workspace(tmp_path)
    scripted = ScriptedLLM(
        [
            say(
                "onboarding: skipped-no-code\n"
                "summary: Serena is activated; no code memories were created.",
            ),
        ],
    )
    serena = _serena_stub()

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert result.succeeded
    assert result.classification == "non-code"
    # Activation is reported accurately for a run that called no tool at all —
    # it is read from Serena's arrival, not from anything the agent did.
    assert result.activation == "success"
    assert result.onboarding == "skipped-no-code"
    assert result.warnings == ()

    assert serena.called_names == []

    # The classification the registry will record travels on the result; the
    # runner itself writes nothing (see `registry.run_pending_tasks`).
    assert result.classification == "non-code"
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803)
async def test_reports_failure_without_writing_config(tmp_path: Path) -> None:
    """Productive use: when Serena errors, the user is told and can retry initialization.
    Expected outcome: a retryable failure naming the failed step, and an untouched
    `initialization` section so the prompt reappears."""
    workspace = _code_workspace(tmp_path)
    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            say(
                "onboarding: failure\nsummary: Serena could not write this project's memories.",
            ),
        ],
    )
    serena = _serena_stub(onboarding=RuntimeError("serena daemon is not running"))

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert not result.succeeded
    assert result.status == "failure"
    assert result.retryable
    # Serena arrived, so activation is honestly a success; only onboarding failed.
    assert result.activation == "success"
    assert result.onboarding == "failure"
    assert result.error is not None
    assert "onboarding" in result.error
    assert "serena daemon is not running" in result.error

    # The tool really was attempted — this is a Serena failure, not a missing call.
    assert serena.called("onboarding")

    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803)
async def test_claimed_success_without_onboarding_is_a_failure(tmp_path: Path) -> None:
    """Productive use: a user is never told a project was initialized when it was not.
    Expected outcome: a model that reports success without calling `onboarding` on a code
    project yields a failure, a warning naming the discrepancy, and no config marker."""
    workspace = _code_workspace(tmp_path)
    scripted = ScriptedLLM(
        [
            say(
                "onboarding: success\nsummary: All done, Serena is fully configured.",
            ),
        ],
    )
    serena = _serena_stub()

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert not result.succeeded
    # Serena did arrive, so the honest verdict is "activated, but not onboarded".
    assert result.activation == "success"
    assert result.onboarding == "failure"
    assert result.tool_calls == ()
    assert serena.called_names == []
    assert result.error is not None
    assert "never called" in result.error
    assert any("tool calls decide" in warning for warning in result.warnings)
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803, SWR.SWR_2804)
async def test_onboarding_on_a_non_code_project_is_flagged(tmp_path: Path) -> None:
    """Productive use: an operator can see when the agent ignored the non-code skip rule.
    Expected outcome: the run still succeeds, but carries a warning that onboarding ran
    against a workspace classified `non-code`."""
    workspace = _docs_workspace(tmp_path)
    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            tool_call("write_memory", memory_name="core", content="A handbook."),
            say("onboarding: success\nsummary: Done."),
        ],
    )
    serena = _serena_stub()

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert result.succeeded
    assert result.classification == "non-code"
    assert result.onboarding == "success"
    assert any("skip rule" in warning for warning in result.warnings)
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803)
async def test_onboarding_without_a_written_memory_is_a_failure(tmp_path: Path) -> None:
    """Productive use: a run that called Serena's onboarding and then wrote nothing does
    not get recorded as having given the project its memories.

    Expected outcome: a retryable failure saying exactly that. `onboarding` writes no
    memory itself — it returns instructions — so reading its success alone as the verdict
    let an agent bank a permanent marker for work it never did."""
    workspace = _code_workspace(tmp_path)
    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            say("onboarding: success\nsummary: All set."),
        ],
    )
    serena = _serena_stub()

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert not result.succeeded
    assert result.retryable
    assert result.activation == "success"
    assert result.onboarding == "failure"
    assert result.error is not None
    assert "no project memory was written" in result.error
    assert serena.called_names == ["onboarding"]
    # The model claimed otherwise; the tool calls decide.
    assert any("tool calls decide" in warning for warning in result.warnings)
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803)
async def test_model_failure_mid_run_is_a_retryable_failure(tmp_path: Path) -> None:
    """Productive use: a model outage during initialization leaves the project re-initializable.
    Expected outcome: the runner returns a retryable failure instead of raising, and the
    `initialization` section is untouched even though activation had already succeeded."""
    workspace = _code_workspace(tmp_path)
    # An empty script means the agent's first step raises — the same shape as a
    # provider error the moment the run begins.
    scripted = ScriptedLLM([])
    serena = _serena_stub()

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert not result.succeeded
    assert result.retryable
    assert result.activation == "success"
    assert result.onboarding == "failure"
    assert result.error is not None
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803)
async def test_timeout_reports_failure_and_leaves_config_untouched(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a hung Serena call cannot leave initialization stuck forever.
    Expected outcome: the run is abandoned at the budget, reported as a retryable
    timeout, and the workspace stays un-initialized so the prompt can return."""
    workspace = _code_workspace(tmp_path)
    released = threading.Event()

    scripted = ScriptedLLM([say("onboarding: failure\nsummary: I never got started.")])

    # The model hangs past the budget and comes back with nothing done. Hanging
    # here rather than inside a Serena tool is what makes the run genuinely
    # incomplete: a tool call that eventually *returns* is a slow success the
    # runner is right to accept, timeout or not.
    unhurried = scripted.llm.completion

    def _never_answers(*args: object, **kwargs: object) -> object:
        # Long enough to outlast the budget and the grace, short enough that the
        # test does not pay for it: nothing can set `released` until the runner
        # has returned, so this wait is the test's whole runtime.
        released.wait(timeout=1.0)
        return unhurried(*args, **kwargs)

    object.__setattr__(scripted.llm, "completion", _never_answers)

    # The runner gives a timed-out conversation a grace window to unwind before
    # closing it anyway; shrinking it keeps this test at the budget's speed
    # rather than the grace's.
    monkeypatch.setattr(serena_task, "_PAUSE_GRACE_SECONDS", 0.05)

    try:
        result = await run_serena_initialization(
            _config(workspace),
            workspace,
            llm=scripted.llm,
            mcp_tool_provider=_serena_stub(),
            timeout_seconds=0.05,
        )
    finally:
        released.set()

    assert not result.succeeded
    assert result.retryable
    # Serena was there — the run simply never got far enough to use it.
    assert result.activation == "success"
    assert result.onboarding == "failure"
    assert result.error is not None
    assert "did not finish within" in result.error or "timed out" in result.error
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803, SWR.SWR_2905)
async def test_reports_activation_failure_when_serena_never_arrives(tmp_path: Path) -> None:
    """Productive use: a user whose Serena is broken is told setup did not happen, rather
    than being told it succeeded because the agent had nothing to report.
    Expected outcome: with no Serena tools on the conversation, activation is a failure,
    the error points at the MCP server, and nothing is recorded."""
    workspace = _code_workspace(tmp_path)
    scripted = ScriptedLLM([say("onboarding: failure\nsummary: I have no Serena tools.")])
    # A provider that serves nothing — the shape of a Serena that failed to start.
    serena = RecordingMCPToolProvider({})

    result = await run_serena_initialization(
        _config(workspace),
        workspace,
        llm=scripted.llm,
        mcp_tool_provider=serena,
        timeout_seconds=60.0,
    )

    assert not result.succeeded
    assert result.retryable
    assert result.activation == "failure"
    assert result.onboarding == "failure"
    assert result.error is not None
    assert "Serena" in result.error
    assert result.step("activation") is not None
    assert result.step("activation").detail  # type: ignore[union-attr]
    assert read_initialization_state(workspace).never_initialized


@verifies(SWR.SWR_2803)
async def test_persona_is_read_only_and_outside_the_delegation_dag() -> None:
    """Productive use: the initializer can inspect a project but never modify it.
    Expected outcome: the built-in persona is read-only, carries only Serena, and is
    unreachable through `delegate` from any other persona."""
    persona = DEFAULT_CONFIG.personas["project-initializer"]

    assert persona.model == "small_model"
    assert persona.read_only
    assert persona.mcp_servers == ["serena"]
    assert sorted(persona.tools) == ["glob", "grep", "read_file"]
    assert persona.delegates_to == []
    assert persona.system_prompt_file == "prompts/project_initializer.md"

    reachable = {name for other in DEFAULT_CONFIG.personas.values() for name in other.delegates_to}
    assert "project-initializer" not in reachable


@verifies(SWR.SWR_2802, SWR.SWR_2803)
async def test_registry_dispatches_a_blocking_runner_not_a_coroutine() -> None:
    """Productive use: clicking Initialize actually runs the task instead of failing silently.
    Expected outcome: the entry point the registry dispatches is callable from a plain
    worker thread, so `run_pending_tasks` never receives an un-awaited coroutine."""
    import asyncio as _asyncio

    from rotaris_core.init import registry, serena_task

    runner = getattr(serena_task, registry._SERENA_RUNNER_ATTRIBUTE)

    # `run_pending_tasks` is synchronous and driven from a Qt worker thread. A
    # coroutine function here would be dispatched, never awaited, and every
    # Serena run would fail on the resulting coroutine object.
    assert not _asyncio.iscoroutinefunction(runner)
    assert _asyncio.iscoroutinefunction(serena_task.run_serena_initialization)


@verifies(SWR.SWR_2803)
async def test_setup_tools_are_preapproved_but_editing_tools_are_not(tmp_path: Path) -> None:
    """Productive use: clicking Initialize does not then ask permission for the calls it implies.
    Expected outcome: the Serena setup tools are allowed for the initializer under the
    default `ask` posture, while Serena's editing tools still require approval."""
    from rotaris_core.permissions import Decision, resolve_permission_engine

    workspace = _code_workspace(tmp_path)
    # Default posture, not the `autonomous` opt-in the other tests use.
    config = DEFAULT_CONFIG.model_copy(update={"workspace_root": workspace})
    persona = config.personas["project-initializer"]

    from rotaris_core.init.serena_task import _build_agent

    agent = _build_agent(persona, config, ScriptedLLM([say("noop")]).llm)
    engine = resolve_permission_engine(agent.permission_binding_key)
    rule_ids = [rule.rule_id for rule in engine.policy.rules]

    assert "project-init:serena-setup-tools" in rule_ids
    grant = next(r for r in engine.policy.rules if r.rule_id == "project-init:serena-setup-tools")
    assert grant.decision is Decision.ALLOW
    assert grant.personas == frozenset({"project-initializer"})
    # Narrow on purpose: symbolic editing is not part of what Initialize consents to.
    assert "replace_symbol_body" not in grant.tools
    assert "insert_after_symbol" not in grant.tools
    # `activate_project` is absent because Serena no longer offers it: the project
    # is bound at launch (SWR-2905), so there is nothing to pre-approve.
    assert grant.tools == {"onboarding", "write_memory"}
