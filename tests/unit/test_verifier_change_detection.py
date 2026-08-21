"""Productive use: a user only pays for verification when an iteration actually
changed their workspace — a research-only iteration must not trigger a test run.

Expected outcome: any tracked file modification (a mutating tool call, or files the
child report declares) triggers the suite; a read-only iteration reports a recorded
reason for skipping it.
"""

from __future__ import annotations

from rotaris_core.orchestrator.report import CreatedFile, EditedFile
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.change_detection import detect_workspace_change


@verifies(SWR.SWR_2602)
def test_a_write_file_call_triggers_verification() -> None:
    signal = detect_workspace_change(tool_calls={"write_file": 1})

    assert signal.changed is True
    assert signal.sources == ("tool:write_file",)


@verifies(SWR.SWR_2602)
def test_every_mutating_tool_triggers_verification() -> None:
    signal = detect_workspace_change(
        tool_calls={"haet_edit": 2, "git_commit": 1, "write_file": 3},
    )

    assert signal.changed is True
    assert signal.sources == ("tool:git_commit", "tool:haet_edit", "tool:write_file")


@verifies(SWR.SWR_2602)
def test_read_only_tools_do_not_trigger_verification() -> None:
    signal = detect_workspace_change(
        tool_calls={"grep": 5, "read_file": 3, "glob": 2, "terminal": 4, "todo": 1},
    )

    assert signal.changed is False
    assert signal.sources == ()
    assert "No tracked file modifications" in signal.reason


@verifies(SWR.SWR_2602)
def test_tool_names_are_matched_case_insensitively() -> None:
    signal = detect_workspace_change(tool_calls={"Write_File": 1})

    assert signal.changed is True
    assert signal.sources == ("tool:write_file",)


@verifies(SWR.SWR_2602)
def test_a_zero_delta_for_a_mutating_tool_does_not_trigger_verification() -> None:
    # A cumulative counter that did not move during this iteration is not evidence.
    signal = detect_workspace_change(tool_calls={"write_file": 0})

    assert signal.changed is False


@verifies(SWR.SWR_2602)
def test_report_declared_files_trigger_verification_without_tool_evidence() -> None:
    # An edit made through MCP or a custom tool leaves no mutating-tool trace, but
    # the report still declares it — verification must not be suppressed.
    signal = detect_workspace_change(
        tool_calls={"grep": 1},
        edited_files=[EditedFile(path="src/app.py", change_type="modified")],
        created_files=[CreatedFile(path="src/new.py")],
    )

    assert signal.changed is True
    assert signal.sources == ("report:edited_files", "report:created_files")


@verifies(SWR.SWR_2602)
def test_an_iteration_with_no_signal_at_all_reports_a_skip_reason() -> None:
    signal = detect_workspace_change()

    assert signal.changed is False
    assert signal.reason


@verifies(SWR.SWR_2602)
def test_malformed_counters_never_break_detection() -> None:
    signal = detect_workspace_change(tool_calls={"write_file": "many", 7: 1})  # type: ignore[dict-item]

    assert signal.changed is False
