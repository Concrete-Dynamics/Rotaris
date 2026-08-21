"""A real Ralph run emits the SWR-1829 event stream (SWR-1828).

Drives the actual :class:`RalphLoop` — the loop setup is copied from
``tests/integration/test_ralph_e2e.py`` and given a real session directory so
the diagnostics writers, and with them the tool-call / permission / error
emission seams, are on the path.  A mock in place of the loop would prove
nothing about where the events actually come from.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import shlex
import subprocess
import sys
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import (
    CheckConfig,
    RotarisConfig,
    RuntimePolicy,
    VerifierConfig,
)
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.events import (
    CompositeIterationObserver,
    StreamEventObserver,
    parse_event,
    register_event_sink,
    reset_event_registry,
    serialize_event,
)
from rotaris_core.hooks.models import ResolvedHook
from rotaris_core.hooks.runner import HookRunner
from rotaris_core.orchestrator.report import ChildReportArtifact, EditedFile
from rotaris_core.permissions import (
    ApprovalHost,
    ApprovalOption,
    BrokeredApprovalResolver,
    Decision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRequest,
    register_approval_host,
    reset_approval_registry,
)
from rotaris_core.permissions.audit import (
    SessionAuditLog,
    register_audit_session,
    reset_audit_registry,
)
from rotaris_core.ralph import RalphLoop
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session import SessionManager
from rotaris_core.session.checkpoint_restore import CheckpointRestorer
from rotaris_core.session.checkpoint_service import CheckpointService
from rotaris_core.session.state import SessionState
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from rotaris_core.events import RotarisEvent

pytestmark = pytest.mark.usefixtures("clean_event_registry")

SESSION_ID = "20260807-120000-abcdef123456"

#: The shape SWR-1829's redaction sweep exists for: a credential embedded in an
#: argument whose key does not look secret at all.
LEAKED_TOKEN = "ghp_realvalue123"
LEAKY_COMMAND = f"gh auth login --with-token GITHUB_TOKEN={LEAKED_TOKEN}"


@pytest.fixture
def clean_event_registry() -> Iterator[None]:
    """Keep a registered sink, host or audit session leaking into the next test."""
    reset_event_registry()
    reset_approval_registry()
    reset_audit_registry()
    yield
    reset_event_registry()
    reset_approval_registry()
    reset_audit_registry()


class _MockConversation:
    def __init__(self) -> None:
        self.state = type("_S", (), {"events": []})()

    def send_message(self, msg: object) -> None:
        del msg

    def run(self) -> None:
        return None

    def close(self) -> None:
        return None


class _MockSummaryAgent:
    async def generate_report(
        self,
        record: Any,
        transcript: Any,
        *,
        fallback_status: str = "failed",
    ) -> ChildReportArtifact:
        del transcript, fallback_status
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Done",
        )


def _make_todo() -> TodoList:
    task = TodoTask(name="Ship it", description="Ship the change")
    task.set_execution_context("Ship the change")
    return TodoList(phases=[TodoPhase(name="Phase 1", tasks=[task])])


def _build_loop(session_dir: Path, workspace: Path, *, stream: bool) -> RalphLoop:
    """A runnable loop writing into *session_dir*, optionally streaming."""
    observer = (
        CompositeIterationObserver(StreamEventObserver(SESSION_ID))
        if stream
        else CompositeIterationObserver()
    )
    loop = RalphLoop(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=5)),
        workspace_root=str(workspace),
        summary_agent=_MockSummaryAgent(),
        conversation_factory=lambda agent: _MockConversation(),
        conversation_persistence_dir=session_dir,
        iteration_observer=observer,
    )

    async def _run_child(record: Any, agent: Any, **kwargs: Any) -> ChildReportArtifact:
        del agent, kwargs
        # Everything below goes through the real diagnostics writers, which are
        # the emission seams this test exists to exercise.
        diagnostics = loop.scheduler.diagnostics
        diagnostics.tool_call(
            agent_name=record.canonical_name,
            tool_name="terminal",
            call_id="call-1",
            status="completed",
            elapsed_ms=42,
            args=json.dumps({"command": LEAKY_COMMAND}),
            result="ok",
        )
        diagnostics.permission_decision(
            session_id=SESSION_ID,
            agent_id=record.canonical_name,
            persona=record.persona,
            tool_name="terminal",
            decision="allow",
            rule_id="rule-1",
            source="policy",
            summary=f"terminal: {LEAKY_COMMAND}",
            reason="allowed by policy",
        )
        diagnostics.issue(
            kind="informational",
            severity="info",
            actor=record.canonical_name,
            message="Nothing is wrong here.",
        )
        diagnostics.issue(
            kind="tool_error",
            severity="error",
            actor=record.canonical_name,
            message="The build step failed.",
            evidence_ref="evidence/tool-calls.jsonl",
        )
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Done",
        )

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    return loop


async def _run(session_dir: Path, workspace: Path, *, stream: bool = True) -> Any:
    loop = _build_loop(session_dir, workspace, stream=stream)
    return await loop.run(
        _make_todo(),
        agent_factory=lambda persona, rk=None, model_override=None: {"persona": persona},
        session_id=SESSION_ID,
    )


def _kinds(events: list[RotarisEvent]) -> list[str]:
    return [event.event for event in events]


def _first(events: list[RotarisEvent], kind: str) -> Any:
    """The first event of *kind*; fails loudly rather than raising ``StopIteration``."""
    for event in events:
        if event.event == kind:
            return event
    pytest.fail(f"no {kind} in {_kinds(events)}")
    raise AssertionError  # pragma: no cover - ``pytest.fail`` does not return


@verifies(SWR.SWR_1828, SWR.SWR_1829)
@pytest.mark.asyncio
async def test_a_run_emits_the_covered_event_types_in_a_usable_order(tmp_path: Path) -> None:
    """Productive use: a CI consumer follows a whole run from one event stream.
    Expected outcome: the run emits session, iteration, child, tool, permission
    and error events, with ``session.start`` first, ``session.end`` last, and
    each pair correctly nested."""
    captured: list[RotarisEvent] = []
    register_event_sink(SESSION_ID, captured.append)

    progress = await _run(tmp_path / "sessions" / SESSION_ID, tmp_path / "workspace")

    assert progress.completed_tasks == 1
    kinds = _kinds(captured)

    for expected in (
        "session.start",
        "iteration.start",
        "child.spawn",
        "child.transition",
        "tool.start",
        "tool.finish",
        "permission.decision",
        "error",
        "verifier.result",
        "child.complete",
        "iteration.end",
        "session.end",
    ):
        assert expected in kinds, f"{expected} missing from {kinds}"

    assert kinds[0] == "session.start"
    assert kinds[-1] == "session.end"
    assert kinds.count("session.start") == 1
    assert kinds.count("session.end") == 1
    assert kinds.index("iteration.start") < kinds.index("iteration.end")
    assert kinds.index("child.spawn") < kinds.index("child.complete")
    assert kinds.index("tool.start") < kinds.index("tool.finish")

    start = captured[0]
    assert start.task == "Ship the change"  # type: ignore[attr-defined]
    assert start.persona  # type: ignore[attr-defined]
    assert start.workspace == str(tmp_path / "workspace")  # type: ignore[attr-defined]
    assert isinstance(start.sandboxed, bool)  # type: ignore[attr-defined]

    end = captured[-1]
    assert end.status == "completed"  # type: ignore[attr-defined]
    assert end.stop_reason == "all tasks completed"  # type: ignore[attr-defined]
    assert end.iterations_completed == 1  # type: ignore[attr-defined]

    # An ``info`` issue is not an error; only the ``error`` one is reported.
    errors = [event for event in captured if event.event == "error"]
    assert [event.message for event in errors] == ["The build step failed."]  # type: ignore[attr-defined]
    assert errors[0].error_class == "tool_error"  # type: ignore[attr-defined]


@verifies(SWR.SWR_1829)
@pytest.mark.asyncio
async def test_a_secret_in_a_tool_argument_never_reaches_the_stream(tmp_path: Path) -> None:
    """Productive use: a run's stream can be piped anywhere without leaking a token.
    Expected outcome: a ``GITHUB_TOKEN=ghp_...`` argument appears in no
    serialized event, while the tool call itself is still reported."""
    captured: list[RotarisEvent] = []
    register_event_sink(SESSION_ID, captured.append)

    await _run(tmp_path / "sessions" / SESSION_ID, tmp_path / "workspace")

    lines = [serialize_event(event) for event in captured]
    assert lines, "the run published nothing"
    for line in lines:
        assert LEAKED_TOKEN not in line, f"a credential leaked into the stream: {line}"

    tool_starts = [event for event in captured if event.event == "tool.start"]
    assert tool_starts, "the tool call was not reported at all"
    assert any("***" in str(value) for value in tool_starts[0].arguments.values())  # type: ignore[attr-defined]

    decisions = [event for event in captured if event.event == "permission.decision"]
    assert decisions and "***" in decisions[0].summary  # type: ignore[attr-defined]


def _volatile_stripped(payload: Any) -> Any:
    """Drop the fields that differ between two runs of the same scenario."""
    volatile = {
        "timestamp",
        "id",
        "issue_id",
        "task_id",
        "elapsed_ms",
        "started_at",
        "spawned_at",
    }
    if isinstance(payload, dict):
        return {
            key: _volatile_stripped(value) for key, value in payload.items() if key not in volatile
        }
    if isinstance(payload, list):
        return [_volatile_stripped(item) for item in payload]
    return payload


def _artifact_snapshot(session_dir: Path) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    for relative in (
        "issues.json",
        "timeline.jsonl",
        "evidence/tool-calls.jsonl",
        "evidence/permissions.jsonl",
    ):
        path = session_dir / relative
        if not path.exists():
            snapshot[relative] = None
            continue
        text = path.read_text(encoding="utf-8")
        if relative.endswith(".jsonl"):
            rows = [json.loads(line) for line in text.splitlines() if line.strip()]
            snapshot[relative] = _volatile_stripped(rows)
        else:
            snapshot[relative] = _volatile_stripped(json.loads(text))
    return snapshot


@verifies(SWR.SWR_1828)
@pytest.mark.asyncio
async def test_publishing_does_not_change_what_the_run_writes_to_disk(tmp_path: Path) -> None:
    """Productive use: every existing run keeps its evidence unchanged.
    Expected outcome: the on-disk artifacts of a streamed run and an unstreamed
    run are identical once run-to-run timestamps are set aside."""
    without = tmp_path / "without" / "sessions" / SESSION_ID
    await _run(without, tmp_path / "without" / "workspace", stream=False)
    unstreamed = _artifact_snapshot(without)

    captured: list[RotarisEvent] = []
    register_event_sink(SESSION_ID, captured.append)
    with_sink = tmp_path / "with" / "sessions" / SESSION_ID
    await _run(with_sink, tmp_path / "with" / "workspace", stream=True)
    streamed = _artifact_snapshot(with_sink)

    assert captured, "the streamed run published nothing, so this proves nothing"
    assert unstreamed["evidence/tool-calls.jsonl"], "the run wrote no tool calls"
    assert streamed == unstreamed


@verifies(SWR.SWR_1828)
@pytest.mark.asyncio
async def test_a_sink_that_raises_on_every_event_cannot_break_the_run(tmp_path: Path) -> None:
    """Productive use: a consumer that closes the pipe does not kill the agent run.
    Expected outcome: the run completes normally and still writes its evidence."""
    calls: list[str] = []

    def _hostile(event: RotarisEvent) -> None:
        calls.append(event.event)
        raise RuntimeError("this consumer is gone")

    register_event_sink(SESSION_ID, _hostile)
    session_dir = tmp_path / "sessions" / SESSION_ID

    progress = await _run(session_dir, tmp_path / "workspace")

    assert progress.completed_tasks == 1
    assert progress.stop_reason == "all tasks completed"
    assert "session.start" in calls and "session.end" in calls
    assert (session_dir / "evidence" / "tool-calls.jsonl").read_text(encoding="utf-8").strip()


@verifies(SWR.SWR_1828)
@pytest.mark.asyncio
async def test_a_run_without_a_registered_sink_publishes_nothing(tmp_path: Path) -> None:
    """Productive use: the desktop app and the test suite pay nothing for the stream.
    Expected outcome: a run whose session id nobody registered delivers no
    events to another session's sink and still completes."""
    other: list[RotarisEvent] = []
    register_event_sink("a-different-session", other.append)

    progress = await _run(tmp_path / "sessions" / SESSION_ID, tmp_path / "workspace")

    assert progress.completed_tasks == 1
    assert other == []


# --------------------------------------------------------------------------
# The P1 features on the wire (SWR-1832): hooks, checkpoints, the completion
# gate, the repair budget and approval requests, on one subscriber, in the
# order those things happened.
# --------------------------------------------------------------------------


def _git(cwd: Path, *args: str) -> None:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def _repository(root: Path) -> Path:
    """A real Git working tree, so the checkpoints are real checkpoints."""
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\nsessions/\n", encoding="utf-8")
    (root / "alpha.txt").write_text("alpha v1\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


def _checkpoint_service(workspace: Path) -> CheckpointService:
    """The session's real checkpoint policy, recording under ``SESSION_ID``."""
    manager = SessionManager(workspace)
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id=SESSION_ID,
        workspace_root=str(workspace),
        created_at=now,
        updated_at=now,
    )
    manager.flush_session(state)
    return CheckpointService(
        session_manager=manager,
        state=state,
        tree_root=workspace,
        config=RotarisConfig(workspace_root=workspace),
        isolated=True,
    )


def _hook_command(script: Path) -> str:
    """A shell one-liner running *script*, quoted for this platform's shell."""
    parts = (sys.executable, str(script))
    return subprocess.list2cmdline(parts) if os.name == "nt" else shlex.join(parts)


def _lifecycle_hook(workspace: Path) -> ResolvedHook:
    script = workspace / "hook.py"
    script.write_text("print('hook ran')\n", encoding="utf-8")
    return ResolvedHook(
        name="notify",
        event="iteration_end",
        matcher="",
        command=_hook_command(script),
        timeout_seconds=60.0,
        required=False,
        source="global",
        index=0,
    )


#: The workspace's own blocking check, and it never passes: the gate has to
#: overrule an agent that reported success, which is the moment ``gate.decision``
#: and ``gate.repair`` exist to make visible.  Kept path-free and quote-free so
#: it survives whichever shell the hardened terminal executor picks.
_FAILING_CHECK = "import sys\nprint('1 failed - the change is broken')\nsys.exit(1)\n"


def _gating_loop(session_dir: Path, workspace: Path) -> RalphLoop:
    """A streaming loop whose workspace declares one blocking check that fails."""
    (workspace / "check.py").write_text(_FAILING_CHECK, encoding="utf-8")
    return RalphLoop(
        config=RotarisConfig(
            runtime=RuntimePolicy(child_timeout=30, classify_completion=False),
            verifier=VerifierConfig(
                checks=[CheckConfig(name="tests", command="python check.py", timeout=120)],
            ),
            workspace_root=workspace,
        ),
        workspace_root=str(workspace),
        summary_agent=_MockSummaryAgent(),
        conversation_factory=lambda agent: _MockConversation(),
        conversation_persistence_dir=session_dir,
        iteration_observer=CompositeIterationObserver(StreamEventObserver(SESSION_ID)),
    )


def _approving_host() -> None:
    """A host that answers "approve once" the moment it is asked."""
    host = ApprovalHost()

    def _present(payload: dict[str, Any]) -> None:
        host.barrier.resolve(str(payload["request_id"]), ApprovalOption.APPROVE_ONCE)

    host.present = _present
    register_approval_host(SESSION_ID, host)


def _ask_engine(workspace: Path) -> PermissionEngine:
    """A real engine that asks for everything and audits what it decided."""
    return PermissionEngine(
        policy=PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        path_auth=PathAuth(workspace),
        persona="engineer",
        headless=False,
        agent_id="engineer",
        audit_sink=SessionAuditLog(SESSION_ID, "engineer", "engineer"),
        approval_resolver=BrokeredApprovalResolver(
            session_id=SESSION_ID,
            agent_id="engineer",
            timeout=30.0,
        ),
    )


@verifies(SWR.SWR_1832)
@pytest.mark.asyncio
@pytest.mark.timeout(300)
async def test_a_run_that_hooks_checkpoints_gates_and_asks_emits_each_event_once(
    tmp_path: Path,
) -> None:
    """Productive use: a consumer follows a whole P1-feature run from one bus
    subscription — which hooks ran, what was checkpointed, what the runner
    decided about completion, and which call is waiting on a human.
    Expected outcome: every corresponding event arrives exactly once, in the
    order those things happened, and the approval request and the decision that
    resolved it share a ``request_id``."""
    workspace = _repository(tmp_path / "workspace")
    session_dir = tmp_path / "sessions" / SESSION_ID
    session_dir.mkdir(parents=True)

    captured: list[RotarisEvent] = []
    register_event_sink(SESSION_ID, captured.append)
    register_audit_session(SESSION_ID, session_dir)
    _approving_host()

    loop = _gating_loop(session_dir, workspace)
    hook = _lifecycle_hook(workspace)
    service = _checkpoint_service(workspace)

    async def _run_child(record: Any, agent: Any, **kwargs: Any) -> ChildReportArtifact:
        del agent, kwargs
        # 1. A hook runs, through the real runner and a real child process.
        HookRunner(
            session_id=SESSION_ID,
            workspace=workspace,
            hooks=(hook,),
            diagnostics=loop.scheduler.diagnostics,
        ).run_lifecycle("iteration_end")

        # 2. The iteration edited a file, so it earns a checkpoint.
        (workspace / "alpha.txt").write_text("alpha v2\n", encoding="utf-8")
        assert service.capture(iteration=1) is not None, "the checkpoint was not recorded"

        # 3. A tool call is gated on a human, who approves it.
        decision = _ask_engine(workspace).resolve(
            PermissionRequest(
                tool_name="terminal",
                persona="engineer",
                command="git push --force",
            ),
        )
        assert decision.decision is Decision.ALLOW

        # 4. The agent reports success.  The workspace's own check disagrees, so
        #    the loop's real completion gate overrules it and charges the repair
        #    budget — neither is called from here.
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Done",
            # The iteration really did change the tree, which is what makes the
            # verifier suite worth running at all.
            edited_files=[EditedFile(path="alpha.txt", change_type="modified")],
        )

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    progress = await loop.run(
        _make_todo(),
        agent_factory=lambda persona, rk=None, model_override=None: {"persona": persona},
        session_id=SESSION_ID,
        # One iteration, so one of each thing happens and "exactly once" means
        # what it says.  A gated task re-queues, and a second attempt would
        # legitimately gate again.
        max_iterations=1,
    )

    assert len(progress.iterations) == 1
    assert progress.completed_tasks == 0, "the gate let a failing check through"
    kinds = _kinds(captured)

    # Exactly once, each: emitting twice is as much a defect as not emitting.
    for expected in (
        "hook.start",
        "hook.finish",
        "checkpoint.created",
        "gate.decision",
        "gate.repair",
        "approval.requested",
    ):
        assert kinds.count(expected) == 1, f"{expected} appeared {kinds.count(expected)}x: {kinds}"

    # In the order the run did those things: the hook and the checkpoint during
    # the iteration, the approval while the agent was working, and the gate and
    # its repair charge once the loop had the agent's report in hand.
    assert (
        kinds.index("hook.start")
        < kinds.index("hook.finish")
        < kinds.index("checkpoint.created")
        < kinds.index("approval.requested")
        < kinds.index("permission.decision")
        < kinds.index("gate.decision")
        < kinds.index("gate.repair")
    )

    hook_start = _first(captured, "hook.start")
    hook_finish = _first(captured, "hook.finish")
    assert hook_start.hook_id == hook_finish.hook_id == hook.hook_id
    assert hook_start.lifecycle_point == "iteration_end"
    assert hook_finish.exit_code == 0
    assert hook_finish.skipped is False

    created = _first(captured, "checkpoint.created")
    assert created.sequence == 1
    assert created.kind == "iteration"
    assert created.changed_paths >= 1
    assert created.ref

    gate = _first(captured, "gate.decision")
    assert gate.iteration == 1
    assert gate.decision == "gated"
    assert gate.unsatisfied_checks == ["tests"]

    repair = _first(captured, "gate.repair")
    assert repair.iteration == 1
    assert repair.attempt == 1
    assert repair.remaining_attempts == repair.max_attempts - repair.attempt

    # The pairing the whole approval story rests on.
    requested = _first(captured, "approval.requested")
    resolved = [
        event
        for event in captured
        if event.event == "permission.decision" and event.tool_name == "terminal"
    ]
    assert len(resolved) == 1
    assert requested.request_id == resolved[0].request_id != ""


@verifies(SWR.SWR_1832)
def test_a_checkpoint_and_the_rollback_that_follows_it_are_both_reported(
    tmp_path: Path,
) -> None:
    """Productive use: a consumer watching a session sees an undo point appear
    and sees the rollback that used it — including one the tree refused.
    Expected outcome: the restore publishes once with the paths it touched and
    the safety checkpoint it took first; a restore of a checkpoint that does not
    exist publishes once too, carrying the reason the tree was left alone."""
    workspace = _repository(tmp_path / "workspace")
    captured: list[RotarisEvent] = []
    register_event_sink(SESSION_ID, captured.append)

    service = _checkpoint_service(workspace)
    (workspace / "alpha.txt").write_text("alpha v2\n", encoding="utf-8")
    assert service.capture(iteration=1) is not None
    (workspace / "beta.txt").write_text("beta v1\n", encoding="utf-8")
    assert service.capture(iteration=2) is not None

    restorer = CheckpointRestorer(
        session_manager=SessionManager(workspace),
        session_id=SESSION_ID,
        tree_root=workspace,
    )
    result = restorer.restore(1, force=True)
    assert result.restored, result.blocked_reason

    kinds = _kinds(captured)
    assert kinds.count("checkpoint.restored") == 1
    # Two iteration checkpoints plus the pre-restore safety one, each announced
    # only once it is recorded on the session.
    created = [event for event in captured if event.event == "checkpoint.created"]
    assert [event.sequence for event in created] == [1, 2, 3]
    assert [event.kind for event in created] == ["iteration", "iteration", "pre_restore"]

    restored = _first(captured, "checkpoint.restored")
    assert restored.restored is True
    assert restored.sequence == 1
    assert restored.safety_sequence == 3
    assert restored.changed_paths >= 1
    assert restored.blocked_reason == ""

    captured.clear()
    refused = restorer.restore(99)

    assert refused.restored is False
    assert _kinds(captured) == ["checkpoint.restored"]
    assert captured[0].restored is False
    assert captured[0].sequence == 99
    assert captured[0].changed_paths == 0
    assert "No checkpoint 99" in captured[0].blocked_reason


def _delegated_engine(
    workspace: Path,
    *,
    agent_name: str,
    persona: str,
) -> PermissionEngine:
    """An engine wired the way ``agents.factory`` wires a delegated child's.

    The canonical name reaches the engine *and* its resolver from one value,
    because the ``ApprovalResolver`` protocol passes only the request — the
    resolver cannot ask the engine whom it gates.
    """
    return PermissionEngine(
        policy=PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        path_auth=PathAuth(workspace),
        persona=persona,
        headless=False,
        agent_id=agent_name,
        approval_resolver=BrokeredApprovalResolver(
            session_id=SESSION_ID,
            agent_id=agent_name,
            timeout=30.0,
        ),
    )


def _approval_lines(lines: list[str]) -> list[dict[str, Any]]:
    """Every ``approval.requested`` line, read the way a stream consumer reads it."""
    payloads = [json.loads(line) for line in lines]
    return [payload for payload in payloads if payload["event"] == "approval.requested"]


@verifies(SWR.SWR_1831, SWR.SWR_1832)
def test_a_blocked_child_is_named_on_the_serialized_approval_line(tmp_path: Path) -> None:
    """Productive use: a supervisor watching a fan-out of children sees one of them
    stall on an approval and knows which one to ask.
    Expected outcome: the JSONL line the consumer actually reads names the child's
    canonical agent name and its persona; an engine with no identity binding
    reports no name rather than a guessed one, and its line still parses."""
    lines: list[str] = []
    register_event_sink(SESSION_ID, lambda event: lines.append(serialize_event(event)))
    _approving_host()

    child = _delegated_engine(tmp_path, agent_name="implementer-2", persona="coder")
    decision = child.resolve(
        PermissionRequest(
            tool_name="terminal",
            persona="coder",
            arguments={"command": "rm -rf build"},
            command="rm -rf build",
        ),
    )
    assert decision.allowed

    raised = _approval_lines(lines)
    assert len(raised) == 1
    # Off the wire, not off the model in memory: the serialized line is the only
    # surface a consumer has.
    assert raised[0]["agent_name"] == "implementer-2"
    assert raised[0]["persona"] == "coder"
    reparsed = parse_event(raised[0])
    assert reparsed.agent_name == "implementer-2"
    assert reparsed.persona == "coder"
    # The identity has to arrive alongside the pairing key, or it routes nothing.
    assert reparsed.request_id != ""

    # The other half of the contract: what a resolver that was never told whom
    # it gates puts on the wire.  It reports no agent rather than borrowing the
    # persona as a stand-in -- a supervisor routes on this field, so a wrong
    # name is worse than an absent one -- and the line still parses, which is
    # what makes the field safely optional.
    #
    # This shape is reachable because the resolver holds its own copy of the
    # identity (``ApprovalResolver`` passes only the request, so it cannot read
    # ``engine.agent_id``).  Here the engine's own ``agent_id`` has fallen back
    # to "architect" while its resolver has nothing, so the two disagree.  That
    # is a wiring hazard, not an endorsement: ``agents.factory`` passes one
    # value to both, and a caller that sets only the engine's gets nameless
    # events.  Asserted so the divergence stays visible if anyone changes it.
    lines.clear()
    unbound_resolver = BrokeredApprovalResolver(session_id=SESSION_ID, timeout=30.0)
    unbound = PermissionEngine(
        policy=PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        path_auth=PathAuth(tmp_path),
        persona="architect",
        headless=False,
        approval_resolver=unbound_resolver,
    )
    assert unbound.agent_id == "architect"
    assert unbound.resolve(
        PermissionRequest(tool_name="terminal", persona="architect", command="ls"),
    ).allowed

    unnamed = _approval_lines(lines)
    assert len(unnamed) == 1
    assert unnamed[0]["agent_name"] == ""
    # The persona is the one the engine matched the request against, so it is
    # known, truthful and still reported -- and on a line with no agent name it
    # is the only routing key a consumer has left.
    assert unnamed[0]["persona"] == "architect"
    assert parse_event(unnamed[0]).agent_name == ""
