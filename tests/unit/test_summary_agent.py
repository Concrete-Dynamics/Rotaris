import json
from typing import Any, cast

from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.orchestrator.child_state import ChildTaskRecord
from rotaris_core.orchestrator.summary_agent import SummaryAgent
from rotaris_core.reqtocode import SWR, verifies


class MockLLMResponse:
    def __init__(self, text: str):
        self.message = Message(role="assistant", content=[TextContent(text=text)])


class MockLLM:
    def __init__(self, responses: list[str]):
        self._responses = iter(responses)
        self.calls: list[list[Message]] = []

    def completion(self, messages, **kwargs):
        self.calls.append(messages)
        return MockLLMResponse(next(self._responses))


def _make_agent(*responses: str) -> SummaryAgent:
    return SummaryAgent(cast("Any", MockLLM(list(responses))))


def _make_record() -> ChildTaskRecord:
    return ChildTaskRecord(
        name="summary-task",
        canonical_name="agent.summary",
        persona="summarizer",
        task_payload="Summarize transcript",
    )


def _valid_payload(**overrides: object) -> str:
    payload = {
        "agent_name": "ignored-by-parser",
        "persona": "ignored-by-parser",
        "status": "succeeded",
        "summary": "Completed the work successfully.",
        "edited_files": [{"path": "src/file.py", "change_type": "modified", "commit_sha": None}],
        "created_files": [{"path": "tests/test_file.py", "commit_sha": None}],
        "artifacts": [{"type": "log", "path": None, "description": "Execution log"}],
        "commands": [{"command": "pytest -q", "exit_code": 0, "summary": "Tests passed"}],
        "tests": [{"name": "pytest -q", "status": "passed", "summary": "All good"}],
        "errors": [],
        "next_recommended_actions": ["Ship it"],
    }
    payload.update(overrides)
    return json.dumps(payload)


@verifies(SWR.SWR_126, SWR.SWR_127, SWR.SWR_130)
def test_generate_report_with_valid_json_returns_report() -> None:
    agent = _make_agent(_valid_payload())

    report = __import__("asyncio").run(
        agent.generate_report(
            _make_record(),
            [{"role": "assistant", "content": "Finished task", "tool_name": None}],
        ),
    )

    assert report.agent_name == "agent.summary"
    assert report.persona == "summarizer"
    assert report.status == "succeeded"
    assert report.final_response == "Finished task"
    assert report.edited_files[0].path == "src/file.py"
    assert report.created_files[0].path == "tests/test_file.py"


@verifies(SWR.SWR_127)
def test_generate_report_parses_json_in_markdown_fences() -> None:
    fenced = f"```json\n{_valid_payload(summary='Wrapped in fences.')}\n```"
    agent = _make_agent(fenced)

    report = __import__("asyncio").run(agent.generate_report(_make_record(), []))

    assert report.summary == "Wrapped in fences."


@verifies(SWR.SWR_127)
def test_generate_report_retries_after_invalid_json_then_succeeds() -> None:
    llm = MockLLM(["not json", _valid_payload(summary="Recovered on retry.")])
    agent = SummaryAgent(cast("Any", llm))

    report = __import__("asyncio").run(
        agent.generate_report(
            _make_record(),
            [{"role": "user", "content": "do it", "tool_name": None}],
        ),
    )

    assert report.summary == "Recovered on retry."
    assert len(llm.calls) == 2
    retry_prompt = cast("TextContent", llm.calls[1][1].content[0]).text
    assert "Parse error:" in retry_prompt


@verifies(SWR.SWR_126, SWR.SWR_127)
def test_generate_report_returns_fallback_after_two_invalid_responses() -> None:
    agent = _make_agent("bad", "still bad")

    report = __import__("asyncio").run(agent.generate_report(_make_record(), []))

    assert report.status == "failed"
    assert report.errors[0].type == "summary_failure"
    assert "Expecting value" in report.errors[0].message


@verifies(SWR.SWR_127)
def test_build_transcript_summary_truncates_long_transcripts() -> None:
    agent = _make_agent()
    events = [{"role": "assistant", "content": "x" * 10000, "tool_name": None}]

    summary = agent._build_transcript_summary(events)

    assert len(summary) <= 4000
    assert summary.endswith("…")


@verifies(SWR.SWR_127)
def test_build_transcript_summary_handles_empty_event_list() -> None:
    agent = _make_agent()

    assert agent._build_transcript_summary([]) == "No transcript events."


@verifies(SWR.SWR_127)
def test_parse_report_strips_code_fences() -> None:
    agent = _make_agent()

    report = agent._parse_report(f"```json\n{_valid_payload()}\n```", _make_record())

    assert report.status == "succeeded"


@verifies(SWR.SWR_127)
def test_parse_report_injects_agent_name_and_persona_from_record() -> None:
    agent = _make_agent()

    report = agent._parse_report(
        _valid_payload(agent_name="wrong", persona="wrong"),
        _make_record(),
    )

    assert report.agent_name == "agent.summary"
    assert report.persona == "summarizer"


@verifies(SWR.SWR_127)
def test_parse_report_normalizes_key_findings_list_to_string() -> None:
    agent = _make_agent()

    report = agent._parse_report(
        _valid_payload(key_findings=["Found file A", "Confirmed test B"]),
        _make_record(),
    )

    assert report.key_findings == "- Found file A\n- Confirmed test B"


@verifies(SWR.SWR_127)
def test_parse_report_accepts_detail_payload() -> None:
    agent = _make_agent()

    report = agent._parse_report(
        _valid_payload(
            detail_payload={
                "highlight_paths": [{"path": "src/file.py", "reason": "Core edit"}],
                "snippets": [
                    {
                        "path": "src/file.py",
                        "content": "return 123",
                        "reason": "Updated return value",
                    },
                ],
            },
        ),
        _make_record(),
    )

    assert report.detail_payload is not None
    assert report.detail_payload.highlight_paths[0].path == "src/file.py"
    assert report.detail_payload.snippets[0].content == "return 123"


@verifies(SWR.SWR_127)
def test_parse_report_normalizes_detail_payload_string_lists() -> None:
    agent = _make_agent()

    report = agent._parse_report(
        _valid_payload(
            detail_payload={
                "highlight_paths": ["src/file.py"],
                "snippets": ["return 123"],
            },
        ),
        _make_record(),
    )

    assert report.detail_payload is not None
    assert report.detail_payload.highlight_paths[0].path == "src/file.py"
    assert report.detail_payload.snippets[0].content == "return 123"


@verifies(SWR.SWR_126)
def test_fallback_report_returns_valid_report_with_error_info() -> None:
    agent = _make_agent()

    report = agent._fallback_report(
        _make_record(),
        "boom",
        [{"role": "assistant", "content": "Here is the answer."}],
        fallback_status="failed",
    )

    assert report.agent_name == "agent.summary"
    assert report.persona == "summarizer"
    assert report.status == "failed"
    assert report.final_response == "Here is the answer."
    assert report.errors[0].type == "summary_failure"
    assert report.errors[0].message == "boom"


@verifies(SWR.SWR_126, SWR.SWR_127)
def test_generate_report_timeout_can_fallback_to_success() -> None:
    agent = SummaryAgent(cast("Any", MockLLM([])), timeout=0)

    report = __import__("asyncio").run(
        agent.generate_report(
            _make_record(),
            [{"role": "assistant", "content": "The codebase is an AI orchestration CLI."}],
            fallback_status="succeeded",
        ),
    )

    assert report.status == "succeeded"
    assert "The codebase is an AI orchestration CLI." in report.summary
    assert report.errors[0].type == "summary_failure"
