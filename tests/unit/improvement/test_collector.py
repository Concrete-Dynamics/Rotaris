"""Tests for :class:`ImprovementCollector`.

REQ-20260515-POSTRUN-IMPROVE-001,007,008,012,T001.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any, cast

from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.improvement.collector import ImprovementCollector
from rotaris_core.improvement.proposals import ImprovementProposalArtifact, new_artifact_id
from rotaris_core.improvement.types import RunType
from rotaris_core.reqtocode import SWR, verifies


class _MockResponse:
    def __init__(self, text: str) -> None:
        self.message = Message(role="assistant", content=[TextContent(text=text)])


class MockLLM:
    model = "mock/cheap"

    def __init__(self, responses: list[str]) -> None:
        self._responses = iter(responses)
        self.calls: list[list[Message]] = []

    def completion(self, messages, **kwargs):  # noqa: ANN001, ARG002
        self.calls.append(messages)
        return _MockResponse(next(self._responses))


def _make_collector(*responses: str, timeout: float = 5.0) -> tuple[ImprovementCollector, MockLLM]:
    llm = MockLLM(list(responses))
    return ImprovementCollector(cast("Any", llm), timeout=timeout), llm


def _valid_output() -> str:
    return json.dumps(
        {
            "proposals": [
                {
                    "category": "agents_md_update",
                    "summary": "Document the missing pytest cache fixture.",
                    "recommended_action": "Append a note to tests/AGENTS.md.",
                    "risk": "low",
                    "evidence": [
                        {
                            "kind": "repeated_tool_failure",
                            "text": "Agent searched 3x for fixture.",
                        },
                    ],
                },
            ],
            "notes": None,
        },
    )


@verifies(SWR.SWR_1602, SWR.SWR_1603)
def test_generates_artifact_from_valid_json() -> None:
    collector, _llm = _make_collector(_valid_output())
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            run_type=RunType.TASK_RUN,
            progress=None,
            todo=None,
            transcript_events=[{"role": "assistant", "content": "ok"}],
        ),
    )
    assert artifact.session_id == "sess-1"
    assert artifact.source_session_id == "sess-1"
    assert artifact.source_run_type == RunType.TASK_RUN
    assert artifact.collector_model == "mock/cheap"
    assert len(artifact.proposals) == 1
    assert artifact.proposals[0].category.value == "agents_md_update"
    assert artifact.proposals[0].evidence[0].kind == "repeated_tool_failure"
    assert artifact.proposals[0].evidence[0].source_session_id == "sess-1"


@verifies(SWR.SWR_1602)
def test_retries_on_parse_failure_then_succeeds() -> None:
    collector, llm = _make_collector("not json", _valid_output())
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
        ),
    )
    assert len(artifact.proposals) == 1
    assert len(llm.calls) == 2
    retry_prompt = cast("TextContent", llm.calls[1][1].content[0]).text
    assert "Parse error:" in retry_prompt


@verifies(SWR.SWR_1602)
def test_returns_empty_artifact_when_retry_also_fails() -> None:
    collector, _llm = _make_collector("bad", "still bad")
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
        ),
    )
    assert artifact.proposals == []
    assert artifact.notes is not None
    assert "collector parse failed" in artifact.notes


@verifies(SWR.SWR_1602)
def test_empty_proposals_list_is_accepted() -> None:
    empty = json.dumps({"proposals": [], "notes": "no actionable signals"})
    collector, _ = _make_collector(empty)
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
        ),
    )
    assert artifact.proposals == []
    assert artifact.notes == "no actionable signals"


@verifies(SWR.SWR_1602)
def test_strips_markdown_fences() -> None:
    fenced = f"```json\n{_valid_output()}\n```"
    collector, _ = _make_collector(fenced)
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
        ),
    )
    assert len(artifact.proposals) == 1


@verifies(SWR.SWR_1602, SWR.SWR_1605)
def test_unknown_category_coerced_to_workspace_note() -> None:
    payload = json.dumps(
        {
            "proposals": [
                {
                    "category": "definitely_not_a_real_category",
                    "summary": "x",
                    "recommended_action": "y",
                    "evidence": [{"kind": "transcript_observation", "text": "z"}],
                },
            ],
        },
    )
    collector, _ = _make_collector(payload)
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
        ),
    )
    assert artifact.proposals[0].category.value == "workspace_note"


@verifies(SWR.SWR_1602)
async def test_timeout_returns_empty_artifact() -> None:
    release = threading.Event()

    class _SlowLLM:
        model = "mock/slow"

        def completion(self, messages, **kwargs):  # noqa: ANN001, ARG002
            release.wait(timeout=1)
            return _MockResponse(_valid_output())

    collector = ImprovementCollector(cast("Any", _SlowLLM()), timeout=0.05)
    try:
        artifact = await collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
        )
    finally:
        release.set()
    assert artifact.proposals == []
    assert artifact.notes is not None
    assert "timed out" in artifact.notes


@verifies(SWR.SWR_1612)
def test_timeout_does_not_block_the_host_closing_its_event_loop() -> None:
    """A user ending a run gets their shell back even while the provider hangs.

    The collector timeout only helps if the abandoned completion stops holding
    the host loop hostage: ``asyncio.run`` joins its default executor on close,
    so a completion parked in that executor delays the host until the provider
    answers.
    """
    release = threading.Event()

    class _HungLLM:
        model = "mock/hung"

        def completion(self, messages, **kwargs):  # noqa: ANN001, ARG002
            release.wait(timeout=10)
            return _MockResponse(_valid_output())

    collector = ImprovementCollector(cast("Any", _HungLLM()), timeout=0.05)

    started = time.perf_counter()
    try:
        artifact = asyncio.run(
            collector.generate_artifact(
                session_id="sess-1",
                progress=None,
                todo=None,
            ),
        )
        elapsed = time.perf_counter() - started
    finally:
        release.set()

    assert artifact.notes is not None
    assert "timed out" in artifact.notes
    assert elapsed < 5, f"host loop shutdown waited {elapsed:.1f}s for the hung completion"


@verifies(SWR.SWR_1602, SWR.SWR_1613)
def test_workspace_history_contributes_considered_session_ids() -> None:
    collector, _llm = _make_collector(_valid_output())
    history = [
        ImprovementProposalArtifact(
            artifact_id=new_artifact_id("hist-1"),
            source_session_id="older-1",
            proposals=[],
        ),
        ImprovementProposalArtifact(
            artifact_id=new_artifact_id("hist-2"),
            source_session_id="older-2",
            proposals=[],
        ),
    ]
    artifact = asyncio.run(
        collector.generate_artifact(
            session_id="sess-1",
            progress=None,
            todo=None,
            workspace_history=history,
        ),
    )
    assert artifact.considered_session_ids == ["older-1", "older-2"]
