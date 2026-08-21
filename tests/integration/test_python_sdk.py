"""End-to-end coverage for the public Python SDK (SWR-1830).

The client under test is the real one: nothing about ``execute_run``, the event
bus, the session store or the SDK's own internals is patched. The runs below are
genuine Ralph runs — a real agent factory, a real ``LocalConversation``, a real
scheduler and verifier — over a real session on disk.

Two things are faked, both of them external systems rather than seams inside the
unit: the model (:class:`tests.integration.scripted_llm.ScriptedLLM`, injected at
``rotaris_core.config.loader.load_llm_for_model``, the one call production loads
a model through) and the workspace's MCP servers, which would otherwise launch
subprocesses and open ports for a test about an SDK surface.

What that buys is the claim SWR-1830 actually makes: an SDK session is an
ordinary session. The assertions therefore end outside the SDK, with a plain
``SessionManager`` loading what the client created.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config import loader as config_loader
from rotaris_core.events.bus import reset_event_registry, resolve_event_sink
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sdk import RotarisClient, RunOptions, RunStatus
from rotaris_core.session import SessionManager
from tests.integration.scripted_llm import ScriptedLLM, say

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.events.schema import RotarisEvent

pytestmark = [pytest.mark.integration, pytest.mark.e2e]

#: Every agent the run builds answers in one text turn, so the script does not
#: have to predict how many agents a task produces. A turn carrying tool calls
#: would mean "keep going"; a text turn ends that agent.
_TURN_BUDGET = 40


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """A sink or host left registered would bleed one run into the next."""
    from rotaris_core.permissions import reset_approval_registry

    reset_event_registry()
    reset_approval_registry()
    yield
    reset_event_registry()
    reset_approval_registry()


@pytest.fixture
def sdk_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> RotarisConfig:
    """A scratch workspace whose runs are real but reach no external system."""
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    write_minimal_agents_yaml(workspace / ".rotaris" / "agents.yaml")

    # The developer's own ~/.rotaris must not decide whether this passes.
    empty_global = tmp_path / "empty-global"
    empty_global.mkdir()
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", empty_global)

    scripted = ScriptedLLM([say("The task is done.")] * _TURN_BUDGET)
    monkeypatch.setattr(
        config_loader,
        "load_llm_for_model",
        lambda *args, **kwargs: scripted.llm,
    )

    config = config_loader.load_config(workspace)
    # Configured MCP servers would start subprocesses (and a dashboard port).
    # Nothing in these tests is about MCP, and the SDK never touches it.
    config.mcp_servers.clear()
    for persona in config.personas.values():
        persona.mcp_servers.clear()
    return config


def _client(config: RotarisConfig) -> RotarisClient:
    return RotarisClient(config.workspace_root, config=config)


@verifies(SWR.SWR_1830, SWR.SWR_1828, SWR.SWR_1829)
async def test_an_sdk_run_streams_its_events_and_leaves_an_ordinary_session(
    sdk_config: RotarisConfig,
) -> None:
    """Productive use: a service embeds Rotaris, starts a task, renders the live
    event stream to its own UI and stores the outcome.
    Expected outcome: the events arrive in the order the stream-json CLI emits
    them and end with the terminal result, the result reports a completed run
    with exit code 0, and the session the SDK created is afterwards listed and
    loaded by a plain SessionManager."""
    workspace = sdk_config.workspace_root
    events: list[RotarisEvent] = []

    async with _client(sdk_config) as client:
        handle = await client.start("write the release notes")
        session_id = handle.session_id
        assert session_id, "the handle must name its session before start() returns"

        async for event in handle.events():
            events.append(event)

        result = await handle.result()

    names = [event.event for event in events]
    assert names[0] == "session.start"
    assert names[-1] == "result"
    assert names.count("result") == 1, "exactly one terminal event, as on the CLI's stream"
    # The whole iteration is on the wire, not just its ends.
    assert {
        "iteration.start",
        "child.spawn",
        "child.complete",
        "iteration.end",
        "session.end",
    } <= set(names)
    assert names.index("iteration.start") < names.index("iteration.end")
    # The run is closed before it is summarized: session.end always precedes it.
    assert max(index for index, name in enumerate(names) if name == "session.end") < len(names) - 1
    assert all(event.schema_version == 1 for event in events)
    assert all(event.session_id == session_id for event in events)
    assert handle.dropped_events == 0

    assert result.status is RunStatus.COMPLETED
    assert result.exit_code == 0
    assert result.session_id == session_id
    assert result.iterations_completed == 1
    # Awaiting twice is the same answer, not a second run.
    assert await handle.result() is result
    assert handle.done

    # The point of SWR-1830: nothing about this session is SDK-specific.
    manager = SessionManager(workspace)
    assert [summary["session_id"] for summary in manager.list_sessions()] == [session_id]
    state = manager.load_session(session_id)
    assert state.execution_status == "completed"
    assert state.transcript_events[0] == {"role": "user", "content": "write the release notes"}
    assert state.transcript_events[-1] == {"role": "system", "content": "Run completed."}
    assert (manager.session_dir(session_id) / "run.log").exists()

    # And the run left nothing registered behind it.
    assert resolve_event_sink(session_id) is None
    assert manager.acquire_lock(session_id), "the finished run kept its session lock"
    manager.release_lock(session_id)


@verifies(SWR.SWR_1830)
async def test_cancelling_an_sdk_run_reports_it_and_releases_the_session(
    sdk_config: RotarisConfig,
) -> None:
    """Productive use: a user closes the tab on a running task, and the service
    has to make sure the next request can pick that session back up.
    Expected outcome: the run reports interrupted with the SIGINT exit code
    rather than raising, and the session's lock is free again."""
    async with _client(sdk_config) as client:
        handle = await client.start("a task nobody waits for")
        session_id = handle.session_id

        await handle.cancel()
        await handle.cancel()  # idempotent

        result = await handle.result()

    assert result.status is RunStatus.INTERRUPTED
    assert result.exit_code == 130
    assert result.session_id == session_id
    assert handle.done

    manager = SessionManager(sdk_config.workspace_root)
    assert manager.acquire_lock(session_id), "a cancelled run kept its session lock"
    manager.release_lock(session_id)
    assert resolve_event_sink(session_id) is None


@verifies(SWR.SWR_1830, SWR.SWR_2408, SWR.SWR_2409)
async def test_an_impossible_option_combination_comes_back_as_an_error_result(
    sdk_config: RotarisConfig,
) -> None:
    """Productive use: an integrator passes both worktree options by mistake.
    Expected outcome: a result object carrying the diagnostic, so the caller can
    report it, rather than an exception thrown from inside the run."""
    workspace = sdk_config.workspace_root

    async with _client(sdk_config) as client:
        result = await client.run(
            "an impossible task",
            options=RunOptions(isolate=True, worktree_path=workspace / "elsewhere"),
        )

    assert result.status is RunStatus.ERROR
    assert result.exit_code == 1
    assert result.error == "Error: choose either --isolate or --worktree, not both."
    assert SessionManager(workspace).list_sessions() == []


@verifies(SWR.SWR_1830, SWR.SWR_2504)
async def test_an_approval_resolver_answers_the_runs_permission_prompts(
    sdk_config: RotarisConfig,
) -> None:
    """Productive use: an unattended service decides for itself which tool calls a
    Rotaris run may make.
    Expected outcome: the resolver the caller passed is the one every agent in
    the run consults, registered before the first of them is built, and its
    answer becomes the dispatch decision."""
    from rotaris_core.permissions import (
        ApprovalOption,
        BrokeredApprovalResolver,
        Decision,
        PermissionDecision,
        PermissionRequest,
        resolve_approval_host,
    )

    asked: list[Mapping[str, Any]] = []

    def _approve_reads(request: Mapping[str, Any]) -> str:
        asked.append(request)
        return ApprovalOption.APPROVE_ONCE.value

    async with _client(sdk_config) as client:
        handle = await client.start(
            "a task that asks",
            options=RunOptions(approval_resolver=_approve_reads),
        )
        # start() returns after session.start, which is published before the run
        # builds any agent — so the host is already in place for the first one.
        host = resolve_approval_host(handle.session_id)
        assert host is not None
        assert host.interactive, "a resolver must make the run's approval host interactive"

        resolver = BrokeredApprovalResolver(session_id=handle.session_id, agent_id="coder-1")
        # Resolving blocks on a threading.Event, exactly as a dispatching agent
        # does; running it on the loop would deadlock the answer.
        decision = await asyncio.to_thread(
            resolver.resolve,
            PermissionRequest(tool_name="read_file", persona="coder"),
            PermissionDecision(decision=Decision.ASK, rule_id="ask:read", reason="Reading."),
        )

        await handle.cancel()

    assert [entry["tool_name"] for entry in asked] == ["read_file"]
    assert decision.decision is Decision.ALLOW


@verifies(SWR.SWR_1830)
async def test_an_sdk_session_can_be_resumed_by_the_sdk_and_by_the_session_store(
    sdk_config: RotarisConfig,
) -> None:
    """Productive use: a service runs a follow-up turn on a session it started
    earlier, and an operator inspects the same session from the CLI's store.
    Expected outcome: the second run appends to the first one's history instead
    of creating a new session."""
    async with _client(sdk_config) as client:
        first = await client.run("write the release notes")
        assert first.status is RunStatus.COMPLETED

        second = await client.run(
            "now proof-read them",
            options=RunOptions(session_id=first.session_id),
        )

    assert second.session_id == first.session_id
    assert second.status is RunStatus.COMPLETED

    manager = SessionManager(sdk_config.workspace_root)
    assert [summary["session_id"] for summary in manager.list_sessions()] == [first.session_id]
    transcript = manager.load_session(first.session_id).transcript_events
    tasks = [entry["content"] for entry in transcript if entry["role"] == "user"]
    assert tasks == ["write the release notes", "now proof-read them"]
