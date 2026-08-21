from __future__ import annotations

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.task_context import (
    build_contextual_task_payload,
    build_progress_context,
    build_task_display_name,
    build_todo_context,
)


@verifies(SWR.SWR_401, SWR.SWR_1511, SWR.SWR_1515)
def test_build_task_display_name_compacts_long_multiline_prompt() -> None:
    prompt = (
        "Files touched:\n"
        "  - REQUIREMENTS.md -- added NFR-9\n"
        "  - generate_traceability.py -- accept file or dir for --req-dir\n"
        "Your job is to annotate all tests."
    )

    title = build_task_display_name(prompt)

    assert title == (
        "Files touched: - REQUIREMENTS.md -- added NFR-9 - generate_traceability.py..."
    )
    assert len(title) <= 80


@verifies(SWR.SWR_401, SWR.SWR_1511)
def test_build_task_display_name_handles_blank_input() -> None:
    assert build_task_display_name(" \n\t ") == "User request"


@verifies(SWR.SWR_401)
def test_build_contextual_task_payload_keeps_full_latest_request() -> None:
    request = "Annotate all tests with matching requirement IDs."

    payload = build_contextual_task_payload(request, [])

    assert payload == request


@verifies(SWR.SWR_401)
def test_build_contextual_task_payload_places_handoff_before_recent_history() -> None:
    payload = build_contextual_task_payload(
        "implement the remaining gaps",
        [
            {"role": "user", "content": "audit the shared artifact requirements"},
            {"role": "agent", "name": "orchestrator", "content": "Two gaps remain."},
        ],
        artifact_context="PRIOR AGENT CONTEXT: docs-writer is missing artifact_write.",
        todo_context="PRIOR TODO STATE:\n- Phase: main\n  - [COMPLETED] audit",
        progress_context="PRIOR RALPH PROGRESS:\n- stop_reason: all tasks completed",
    )

    assert "Latest user request:\nimplement the remaining gaps" in payload
    assert "Do not re-explore prior findings" in payload
    assert "PRIOR AGENT CONTEXT: docs-writer is missing artifact_write." in payload
    assert "PRIOR TODO STATE" in payload
    assert "PRIOR RALPH PROGRESS" in payload
    assert payload.index("Authoritative session handoff:") < payload.index(
        "Recent session context:",
    )


@verifies(SWR.SWR_401)
def test_build_todo_context_summarizes_previous_task_statuses() -> None:
    context = build_todo_context(
        {
            "phases": [
                {
                    "name": "main",
                    "tasks": [
                        {
                            "name": "Audit artifact config",
                            "description": "Audit artifact config",
                            "status": "COMPLETED",
                        },
                        {
                            "name": "Implement missing flags",
                            "description": "Add artifact_write to docs-writer",
                            "status": "PENDING",
                        },
                    ],
                },
            ],
        },
    )

    assert "PRIOR TODO STATE" in context
    assert "[COMPLETED] Audit artifact config" in context
    assert "[PENDING] Implement missing flags - Add artifact_write to docs-writer" in context


@verifies(SWR.SWR_401)
def test_build_progress_context_summarizes_recent_iterations() -> None:
    context = build_progress_context(
        {
            "stop_reason": "all tasks completed",
            "total_tasks": 2,
            "completed_tasks": 2,
            "iterations": [
                {
                    "task_name": "Audit artifacts",
                    "outcome": "completed",
                    "report_summary": "Found one configuration gap.",
                },
            ],
        },
    )

    assert "PRIOR RALPH PROGRESS" in context
    assert "stop_reason: all tasks completed" in context
    assert "completed: Audit artifacts - Found one configuration gap." in context
