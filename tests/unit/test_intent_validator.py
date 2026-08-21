"""Tests for the IntentValidator and its integration with RalphLoop._run_iteration."""

from __future__ import annotations

import datetime as dt
import threading
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from rotaris_core.ralph.intent_validator import (
    IntentAlignmentResult,
    IntentValidator,
    _parse_result,
)
from rotaris_core.reqtocode import SWR, verifies

# ---------------------------------------------------------------------------
# _parse_result unit tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_152)
def test_parse_result_aligned_verdict():
    result = _parse_result("ALIGNED\nThe agent created the file as requested.")
    assert result.aligned is True
    assert result.reason == "The agent created the file as requested."


@verifies(SWR.SWR_152)
def test_parse_result_misaligned_verdict():
    result = _parse_result("MISALIGNED\nResearched instead of creating a file.")
    assert result.aligned is False
    assert result.reason == "Researched instead of creating a file."


@verifies(SWR.SWR_152)
def test_parse_result_aligned_case_insensitive():
    result = _parse_result("aligned\nLooks good.")
    assert result.aligned is True


@verifies(SWR.SWR_152)
def test_parse_result_misaligned_case_insensitive():
    result = _parse_result("MISALIGNED\nWrong output type.")
    assert result.aligned is False


@verifies(SWR.SWR_154)
def test_parse_result_empty_text_returns_aligned():
    result = _parse_result("")
    assert result.aligned is True
    assert "empty" in result.reason


@verifies(SWR.SWR_152)
def test_parse_result_single_line_verdict_uses_that_line_as_reason():
    result = _parse_result("ALIGNED")
    assert result.aligned is True
    assert result.reason == "ALIGNED"


@verifies(SWR.SWR_154)
def test_parse_result_unknown_verdict_defaults_aligned():
    result = _parse_result("UNKNOWN\nSomething weird happened.")
    assert result.aligned is True


# ---------------------------------------------------------------------------
# IntentValidator.validate unit tests (mocked LLM)
# ---------------------------------------------------------------------------


def _make_llm_response(text: str) -> MagicMock:
    from openhands.sdk.llm.message import Message, TextContent

    msg = Message(role="assistant", content=[TextContent(text=text)])
    response = MagicMock()
    response.message = msg
    return response


@verifies(SWR.SWR_152)
@pytest.mark.asyncio
async def test_validate_returns_aligned_when_llm_says_aligned():
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response(
        "ALIGNED\nAgent created the documentation file as requested.",
    )
    validator = IntentValidator(llm=llm)
    result = await validator.validate(
        original_intent="Create a requirements doc for the help flag.",
        report_summary="Created docs/requirements/1800-cli-headless/SWR-1826-help-flag.md.",
    )
    assert result.aligned is True
    assert "created" in result.reason.lower() or "agent" in result.reason.lower()


@verifies(SWR.SWR_152)
@pytest.mark.asyncio
async def test_validate_returns_misaligned_when_llm_says_misaligned():
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response(
        "MISALIGNED\nThe request was for a documentation file but Python deps were created.",
    )
    validator = IntentValidator(llm=llm)
    result = await validator.validate(
        original_intent="Create a small requirements doc (.md) for the help flag.",
        report_summary="Added click>=8.0 to pyproject.toml dependencies.",
    )
    assert result.aligned is False
    assert "documentation" in result.reason.lower() or "dep" in result.reason.lower()


@verifies(SWR.SWR_154)
@pytest.mark.asyncio
async def test_validate_returns_aligned_on_timeout():
    llm = MagicMock()
    entered = threading.Event()
    release = threading.Event()
    finished = threading.Event()

    def _blocked_completion(messages):
        del messages
        entered.set()
        try:
            release.wait(timeout=1)
            return _make_llm_response("ALIGNED\nDone.")
        finally:
            finished.set()

    llm.completion.side_effect = _blocked_completion
    validator = IntentValidator(llm=llm, timeout=0.01)
    try:
        result = await validator.validate(
            original_intent="Do something.",
            report_summary="Done.",
        )
    finally:
        release.set()

    assert entered.wait(timeout=1), "validator never invoked llm.completion"
    assert finished.wait(timeout=1), "blocked completion thread never exited"
    # Timeout should default to aligned so the run is not blocked.
    assert result.aligned is True
    assert "timed out" in result.reason


@verifies(SWR.SWR_154)
@pytest.mark.asyncio
async def test_validate_returns_aligned_on_llm_error():
    llm = MagicMock()
    llm.completion.side_effect = RuntimeError("LLM exploded")
    validator = IntentValidator(llm=llm)
    result = await validator.validate(
        original_intent="Do something.",
        report_summary="Done.",
    )
    assert result.aligned is True
    assert "error" in result.reason.lower() or "exploded" in result.reason.lower()


# ---------------------------------------------------------------------------
# RalphLoop._apply_intent_validation integration tests
# ---------------------------------------------------------------------------


def _make_report(status: str = "succeeded", summary: str = "All done.") -> Any:
    from rotaris_core.orchestrator.report import ChildReportArtifact

    return ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status=status,
        summary=summary,
    )


def _make_task(payload: str = "Create a doc file.") -> Any:
    from rotaris_core.tools.todo_state import TodoTask

    t = TodoTask(name="A", description=payload)
    t.set_execution_context(payload)
    return t


@verifies(SWR.SWR_152)
@pytest.mark.asyncio
async def test_apply_intent_validation_skipped_when_validate_intent_false():
    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.ralph.loop import RalphLoop

    config = RotarisConfig(runtime=RuntimePolicy(validate_intent=False))
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp",
        summary_agent=MagicMock(),
    )
    report = _make_report("succeeded", "Done.")
    result = await loop._apply_intent_validation(_make_task(), report)
    # No validator created, report unchanged.
    assert result is report


@verifies(SWR.SWR_152)
@pytest.mark.asyncio
async def test_apply_intent_validation_passes_aligned_report_through():
    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.ralph.intent_validator import IntentValidator
    from rotaris_core.ralph.loop import RalphLoop

    config = RotarisConfig(runtime=RuntimePolicy(validate_intent=True))
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp",
        summary_agent=MagicMock(),
    )
    # Inject a pre-built validator that always returns aligned.
    mock_validator = MagicMock(spec=IntentValidator)
    mock_validator.validate = AsyncMock(
        return_value=IntentAlignmentResult(aligned=True, reason="Looks good."),
    )
    loop._intent_validator = mock_validator

    report = _make_report("succeeded", "Done.")
    result = await loop._apply_intent_validation(_make_task(), report)
    assert result.status == "succeeded"
    mock_validator.validate.assert_awaited_once()


@verifies(SWR.SWR_152)
@pytest.mark.asyncio
async def test_apply_intent_validation_fails_misaligned_report():
    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.ralph.intent_validator import IntentValidator
    from rotaris_core.ralph.loop import RalphLoop

    config = RotarisConfig(runtime=RuntimePolicy(validate_intent=True))
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp",
        summary_agent=MagicMock(),
    )
    mock_validator = MagicMock(spec=IntentValidator)
    mock_validator.validate = AsyncMock(
        return_value=IntentAlignmentResult(
            aligned=False,
            reason="Created Python deps instead of a doc file.",
        ),
    )
    loop._intent_validator = mock_validator

    report = _make_report("succeeded", "Added click to pyproject.toml.")
    result = await loop._apply_intent_validation(
        _make_task("Create a small .md requirements document."),
        report,
    )
    assert result.status == "failed"
    assert "Intent verification failed" in result.summary
    assert "doc file" in result.summary


@pytest.mark.asyncio
@verifies(SWR.SWR_152)
async def test_apply_intent_validation_skips_non_succeeded_reports():
    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.ralph.intent_validator import IntentValidator
    from rotaris_core.ralph.loop import RalphLoop

    config = RotarisConfig(runtime=RuntimePolicy(validate_intent=True))
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp",
        summary_agent=MagicMock(),
    )
    mock_validator = MagicMock(spec=IntentValidator)
    mock_validator.validate = AsyncMock(
        return_value=IntentAlignmentResult(aligned=False, reason="irrelevant"),
    )
    loop._intent_validator = mock_validator

    failed_report = _make_report("failed", "Something went wrong.")
    result = await loop._apply_intent_validation(_make_task(), failed_report)
    # Non-succeeded reports skip validation entirely.
    assert result is failed_report
    mock_validator.validate.assert_not_awaited()


# ---------------------------------------------------------------------------
# End-to-end: _run_iteration re-queues task when classifier says NEEDS_ITERATION
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_152)
@pytest.mark.asyncio
async def test_run_iteration_pending_when_classifier_says_needs_iteration():
    """Productive use: users can continue work rejected by the completion check.
    Expected outcome: a NEEDS_ITERATION verdict requeues the task instead of completing it.
    """
    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.ralph.completion_classifier import CompletionClassifier, CompletionVerdict
    from rotaris_core.ralph.loop import RalphIterationOutcome, RalphLoop
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask

    # Use a worker persona — the classifier is skipped for "orchestrator".
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="coding-agent",
        status="succeeded",
        summary="Added click dependency to pyproject.toml.",
    )

    class _MockConversation:
        def __init__(self):
            self.state = type("S", (), {"events": []})()
            self.paused = False
            self._run_count = 0

        def send_message(self, msg):
            pass

        def run(self):
            if not self._run_count:
                self.state.events.append(
                    type("E", (), {"tool_name": "haet_edit", "action": "edit"})(),
                )
            self._run_count += 1

        def pause(self):
            self.paused = True

        def close(self):
            pass

    config = RotarisConfig(runtime=RuntimePolicy(child_timeout=5, classify_completion=True))
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp",
        summary_agent=MagicMock(),
        conversation_factory=lambda agent: _MockConversation(),
    )

    async def _run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del record, agent, manager, agent_factory, kwargs
        return succeeded_report

    loop.scheduler.run_child = _run_child

    mock_classifier = MagicMock(spec=CompletionClassifier)
    mock_classifier.classify = AsyncMock(
        return_value=CompletionVerdict(
            verdict="NEEDS_ITERATION",
            reason="Required doc file was not created; only deps were modified.",
        ),
    )
    loop._completion_classifier = mock_classifier

    task = TodoTask(name="Create doc", description="Create a .md requirements doc.")
    task.set_execution_context("Create a .md requirements doc.")
    todo = TodoList(phases=[TodoPhase(name="Phase 1", tasks=[task])])
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        lambda persona, rk=None, model_override=None: {"persona": persona},
        todo,
    )

    # NEEDS_ITERATION → PENDING (re-queue), not ABANDONED.
    assert result.outcome == RalphIterationOutcome.PENDING
    assert task.status == TaskStatus.PENDING
    assert progress.abandoned_tasks == 0
    assert progress.completed_tasks == 0
    assert "Completion check" in result.report_summary


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_completion_skips_orchestrator_persona():
    """The CompletionClassifier must never run for the orchestrator persona.
    Orchestrators manage completion through child delegation and the todo
    state machine — the classifier would false-positive on summaries that
    describe partially-delegated work."""
    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.ralph.completion_classifier import CompletionClassifier, CompletionVerdict
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.tools.todo_state import TodoTask

    orchestrator_report = ChildReportArtifact(
        agent_name="orch",
        persona="orchestrator",
        status="succeeded",
        summary=(
            "Orchestrator started delegating Phase 1 tasks but did not complete them — "
            "children are still running."
        ),
    )

    config = RotarisConfig(runtime=RuntimePolicy(classify_completion=True))
    loop = RalphLoop(config=config, workspace_root="/tmp", summary_agent=MagicMock())

    mock_classifier = MagicMock(spec=CompletionClassifier)
    mock_classifier.classify = AsyncMock(
        return_value=CompletionVerdict(verdict="NEEDS_ITERATION", reason="not done"),
    )
    loop._completion_classifier = mock_classifier

    task = TodoTask(name="Big migration", description="Migrate the monorepo.")
    task.set_execution_context("Migrate the monorepo.")

    result, verdict = await loop._classify_completion(
        task=task,
        report=orchestrator_report,
        open_todos=["1.4 Create packages/contract-tests"],
    )

    # Report must pass through unchanged — classifier must NOT be invoked.
    assert result is orchestrator_report
    assert verdict is None
    mock_classifier.classify.assert_not_awaited()
