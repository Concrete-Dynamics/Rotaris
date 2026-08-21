from __future__ import annotations

import json

from openhands.sdk import Agent
from openhands.sdk.llm import MessageToolCall

from rotaris_core.agents.safe_agent import (
    RotarisAgent,
    _repair_object_where_array_expected,
    recover_malformed_finish_arguments,
    repair_finish_tool_call,
    repair_malformed_tool_call_arguments,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_2129)
def test_recover_malformed_finish_arguments_from_truncated_json_message() -> None:
    recovered = recover_malformed_finish_arguments(
        '{"message": "## Test Results\\n- All targeted tests passed',
    )

    assert recovered == {"message": "## Test Results\n- All targeted tests passed"}


@verifies(SWR.SWR_2129)
def test_recover_malformed_finish_arguments_from_raw_string_payload() -> None:
    recovered = recover_malformed_finish_arguments('"All focused checks passed."')

    assert recovered == {"message": "All focused checks passed."}


@verifies(SWR.SWR_2129)
def test_rotaris_agent_repairs_finish_tool_call_arguments() -> None:
    tool_call = MessageToolCall(
        id="call_finish",
        name="finish",
        arguments='{"message": "Implemented the change and ran tests',
        origin="completion",
    )

    repaired = repair_finish_tool_call(tool_call)

    assert json.loads(repaired.arguments) == {"message": "Implemented the change and ran tests"}


@verifies(SWR.SWR_2129)
def test_rotaris_agent_repairs_truncated_structured_tool_arguments() -> None:
    tool_call = MessageToolCall(
        id="call_todo",
        name="todo",
        arguments=(
            '{"operation": "replace", "payload": {"phases": [{"id": "p1", '
            '"name": "Implement", "tasks": [{"id": "t1", "name": "Do it", '
            '"status": "PENDING"}]}}'
        ),
        origin="completion",
    )

    repaired = repair_malformed_tool_call_arguments(tool_call)

    assert json.loads(repaired.arguments) == {
        "operation": "replace",
        "payload": {
            "phases": [
                {
                    "id": "p1",
                    "name": "Implement",
                    "tasks": [{"id": "t1", "name": "Do it", "status": "PENDING"}],
                },
            ],
        },
    }


@verifies(SWR.SWR_2129)
def test_rotaris_agent_does_not_repair_mismatched_structured_tool_arguments() -> None:
    tool_call = MessageToolCall(
        id="call_todo",
        name="todo",
        arguments='{"operation": "replace"]',
        origin="completion",
    )

    repaired = repair_malformed_tool_call_arguments(tool_call)

    assert repaired == tool_call


@verifies(SWR.SWR_2129)
def test_rotaris_agent_leaves_non_finish_tool_calls_unchanged() -> None:
    tool_call = MessageToolCall(
        id="call_shell",
        name="terminal",
        arguments='{"command": "pwd"}',
        origin="completion",
    )

    repaired = repair_finish_tool_call(tool_call)

    assert repaired == tool_call


@verifies(SWR.SWR_557)
def test_factory_agent_is_sdk_compatible_subclass() -> None:
    assert issubclass(RotarisAgent, Agent)


# --- Phase A: schema-level repair tests ---


@verifies(SWR.SWR_2129)
def test_repair_object_where_array_expected_todo_tasks() -> None:
    """A todo call where 'tasks' is a bare object gets wrapped in an array."""
    raw = (
        '{"operation": "replace", "payload":'
        ' {"phases": [{"id": "p1", "tasks":'
        ' {"id": "t1", "name": "Build it", "status": "PENDING"}}]}}'
    )
    fixed = _repair_object_where_array_expected(raw)
    assert fixed is not None
    assert '"tasks": [{"id": "t1", "name": "Build it", "status": "PENDING"}]' in fixed


@verifies(SWR.SWR_2129)
def test_repair_object_where_array_expected_multi_phase() -> None:
    """Multiple phases with object-instead-of-array tasks are all fixed."""
    raw = json.dumps(
        {
            "operation": "replace",
            "payload": {
                "phases": [
                    {"id": "p1", "name": "Phase 1", "tasks": {"id": "t1"}},
                    {"id": "p2", "name": "Phase 2", "tasks": {"id": "t2"}},
                ],
            },
        },
    )
    fixed = _repair_object_where_array_expected(raw)
    assert fixed is not None
    assert '"tasks": [{"id": "t1"}]' in fixed
    assert '"tasks": [{"id": "t2"}]' in fixed


@verifies(SWR.SWR_2129)
def test_repair_object_where_array_expected_no_change_for_valid() -> None:
    """Valid JSON with array tasks is not modified."""
    raw = json.dumps(
        {
            "operation": "replace",
            "payload": {"phases": [{"id": "p1", "tasks": [{"id": "t1", "status": "PENDING"}]}]},
        },
    )
    fixed = _repair_object_where_array_expected(raw)
    assert fixed is None  # No repair needed


@verifies(SWR.SWR_2129)
def test_repair_object_where_array_expected_unknown_field() -> None:
    """A non-array field like 'name' as object is NOT repaired."""
    raw = json.dumps({"name": {"first": "test"}})
    fixed = _repair_object_where_array_expected(raw)
    assert fixed is None


@verifies(SWR.SWR_2129)
def test_repair_malformed_tool_call_fixes_schema_errors() -> None:
    """repair_malformed_tool_call_arguments repairs tasks-as-object in todo call."""
    tool_call = MessageToolCall(
        id="call_todo",
        name="todo",
        arguments=json.dumps(
            {
                "operation": "replace",
                "payload": {
                    "phases": [
                        {
                            "id": "p1",
                            "name": "Phase",
                            "tasks": {"id": "t1", "name": "Do it", "status": "PENDING"},
                        },
                    ],
                },
            },
        ),
        origin="completion",
    )

    repaired = repair_malformed_tool_call_arguments(tool_call)

    parsed = json.loads(repaired.arguments)
    tasks = parsed["payload"]["phases"][0]["tasks"]
    assert isinstance(tasks, list)
    assert tasks == [{"id": "t1", "name": "Do it", "status": "PENDING"}]


@verifies(SWR.SWR_2129)
def test_repair_malformed_tool_call_fixes_files_field() -> None:
    """'files' field as object → array repair."""
    tool_call = MessageToolCall(
        id="call_write",
        name="write_file",
        arguments='{"files": {"path": "/tmp/x", "content": "hello"}}',
        origin="completion",
    )

    repaired = repair_malformed_tool_call_arguments(tool_call)

    parsed = json.loads(repaired.arguments)
    assert isinstance(parsed["files"], list)
    assert parsed["files"] == [{"path": "/tmp/x", "content": "hello"}]


@verifies(SWR.SWR_2129)
def test_repair_malformed_tool_call_leaves_valid_json_unchanged() -> None:
    """A perfectly valid todo call is returned as-is."""
    valid = json.dumps(
        {
            "operation": "replace",
            "payload": {
                "phases": [
                    {
                        "id": "p1",
                        "name": "Phase",
                        "tasks": [{"id": "t1", "name": "Do it", "status": "PENDING"}],
                    },
                ],
            },
        },
    )
    tool_call = MessageToolCall(
        id="call_todo",
        name="todo",
        arguments=valid,
        origin="completion",
    )

    repaired = repair_malformed_tool_call_arguments(tool_call)

    assert repaired == tool_call
