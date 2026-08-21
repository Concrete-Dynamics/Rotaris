"""Unit tests for CompletionClassifier and _parse_verdict."""

from __future__ import annotations

import threading
from typing import Any
from unittest.mock import MagicMock

import pytest

from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.ralph.completion_classifier import (
    CompletionClassifier,
    _parse_verdict,
)
from rotaris_core.reqtocode import SWR, verifies

# ---------------------------------------------------------------------------
# _parse_verdict unit tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_123)
def test_parse_verdict_complete_from_json():
    result = _parse_verdict('{"verdict": "COMPLETE", "reason": "All steps finished."}')
    assert result.verdict == "COMPLETE"
    assert result.reason == "All steps finished."


@verifies(SWR.SWR_123)
def test_parse_verdict_needs_iteration_from_json():
    result = _parse_verdict('{"verdict": "NEEDS_ITERATION", "reason": "File was not created."}')
    assert result.verdict == "NEEDS_ITERATION"
    assert result.reason == "File was not created."


@verifies(SWR.SWR_123)
def test_parse_verdict_unclear_from_json():
    result = _parse_verdict('{"verdict": "UNCLEAR", "reason": "Cannot determine from summary."}')
    assert result.verdict == "UNCLEAR"


@verifies(SWR.SWR_123)
def test_parse_verdict_case_insensitive_json():
    result = _parse_verdict('{"verdict": "complete", "reason": "done"}')
    assert result.verdict == "COMPLETE"


@verifies(SWR.SWR_123)
def test_parse_verdict_unknown_json_verdict_returns_unclear():
    result = _parse_verdict('{"verdict": "MAYBE", "reason": "idk"}')
    assert result.verdict == "UNCLEAR"


@verifies(SWR.SWR_123)
def test_parse_verdict_strips_markdown_fences():
    text = '```json\n{"verdict": "COMPLETE", "reason": "done"}\n```'
    result = _parse_verdict(text)
    assert result.verdict == "COMPLETE"


@verifies(SWR.SWR_123)
def test_parse_verdict_empty_returns_unclear():
    result = _parse_verdict("")
    assert result.verdict == "UNCLEAR"
    assert "empty" in result.reason


@verifies(SWR.SWR_123)
def test_parse_verdict_malformed_json_falls_back_to_text_scan_needs_iteration():
    result = _parse_verdict("NEEDS_ITERATION\nThe required file was never created.")
    assert result.verdict == "NEEDS_ITERATION"


@verifies(SWR.SWR_123)
def test_parse_verdict_malformed_json_falls_back_to_text_scan_complete():
    result = _parse_verdict("COMPLETE — all tasks are done.")
    assert result.verdict == "COMPLETE"


@verifies(SWR.SWR_123)
def test_parse_verdict_unrecognised_text_returns_unclear():
    result = _parse_verdict("I am a confused LLM and I do not know what to say.")
    assert result.verdict == "UNCLEAR"


# ---------------------------------------------------------------------------
# CompletionClassifier.classify unit tests (mocked LLM)
# ---------------------------------------------------------------------------


def _make_llm_response(text: str) -> MagicMock:
    from openhands.sdk.llm.message import Message, TextContent

    msg = Message(role="assistant", content=[TextContent(text=text)])
    response = MagicMock()
    response.message = msg
    return response


def _make_report(summary: str = "All done.") -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name="a",
        persona="orchestrator",
        status="succeeded",
        summary=summary,
    )


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_returns_complete_on_clean_report():
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response(
        '{"verdict": "COMPLETE", "reason": "Import was fixed successfully."}'
    )
    classifier = CompletionClassifier(llm=llm)
    verdict = await classifier.classify(
        report=_make_report("Fixed the SCSS import."),
        intent="Fix the broken @carbon/react SCSS import.",
        open_todos=[],
    )
    assert verdict.verdict == "COMPLETE"
    assert "Import" in verdict.reason or "fixed" in verdict.reason.lower()


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_returns_needs_iteration_on_incomplete_work():
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response(
        '{"verdict": "NEEDS_ITERATION", "reason": "The required file was not created."}'
    )
    classifier = CompletionClassifier(llm=llm)
    verdict = await classifier.classify(
        report=_make_report("Researched the topic only."),
        intent="Create a requirements doc file.",
        open_todos=["Write requirements.md"],
    )
    assert verdict.verdict == "NEEDS_ITERATION"


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_returns_unclear_on_ambiguous_response():
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response(
        '{"verdict": "UNCLEAR", "reason": "Summary too vague to assess."}'
    )
    classifier = CompletionClassifier(llm=llm)
    verdict = await classifier.classify(
        report=_make_report("Did some stuff."),
        intent="Implement feature X.",
        open_todos=[],
    )
    assert verdict.verdict == "UNCLEAR"


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_returns_unclear_on_timeout():
    llm = MagicMock()
    release = threading.Event()

    def _slow(*_: Any, **__: Any) -> Any:
        release.wait(timeout=1)

    llm.completion.side_effect = _slow
    classifier = CompletionClassifier(llm=llm, timeout=0.05)
    try:
        verdict = await classifier.classify(
            report=_make_report(),
            intent="Do something.",
            open_todos=[],
        )
    finally:
        release.set()
    assert verdict.verdict == "UNCLEAR"
    assert "timed out" in verdict.reason


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_returns_unclear_on_llm_exception():
    llm = MagicMock()
    llm.completion.side_effect = RuntimeError("provider exploded")
    classifier = CompletionClassifier(llm=llm)
    verdict = await classifier.classify(
        report=_make_report(),
        intent="Do something.",
        open_todos=[],
    )
    assert verdict.verdict == "UNCLEAR"
    assert "error" in verdict.reason.lower() or "exploded" in verdict.reason


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_handles_malformed_json_via_text_fallback():
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response(
        "NEEDS_ITERATION\nThe step was skipped entirely."
    )
    classifier = CompletionClassifier(llm=llm)
    verdict = await classifier.classify(
        report=_make_report("Skipped the implementation."),
        intent="Implement the fix.",
        open_todos=[],
    )
    assert verdict.verdict == "NEEDS_ITERATION"


@pytest.mark.asyncio
@verifies(SWR.SWR_123)
async def test_classify_passes_open_todos_in_prompt():
    """Verify that open todos appear in the LLM call."""
    llm = MagicMock()
    llm.completion.return_value = _make_llm_response('{"verdict": "COMPLETE", "reason": "Done."}')
    classifier = CompletionClassifier(llm=llm)
    await classifier.classify(
        report=_make_report(),
        intent="Do the thing.",
        open_todos=["write tests", "update docs"],
    )
    call_args = llm.completion.call_args
    messages = call_args[0][0]
    user_msg_text = messages[1].content[0].text
    assert "write tests" in user_msg_text
    assert "update docs" in user_msg_text
