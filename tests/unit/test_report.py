from rotaris_core.orchestrator import report as report_models
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_130, SWR.SWR_2132)
def test_extracts_terminal_and_last_child_responses_deterministically() -> None:
    """Productive use: a parent can receive the child response that is safe to use.
    Expected outcome: terminal tool activity keeps the latest response available but not final."""
    terminal_tool_transcript = [
        {"role": "assistant", "content": "I will inspect the failing test."},
        {"role": "tool", "tool_name": "terminal", "content": "pytest -q"},
    ]
    terminal_reply_transcript = [
        {"role": "tool", "tool_name": "terminal", "content": "pytest -q"},
        {"role": "assistant", "content": "The focused tests pass."},
    ]

    assert report_models.extract_last_response(terminal_tool_transcript) == (
        "I will inspect the failing test."
    )
    assert report_models.extract_final_response(terminal_tool_transcript) is None
    assert (
        report_models.extract_last_response(terminal_reply_transcript) == "The focused tests pass."
    )
    assert (
        report_models.extract_final_response(terminal_reply_transcript) == "The focused tests pass."
    )


@verifies(SWR.SWR_130)
def test_child_report_artifact_required_fields() -> None:
    report = report_models.ChildReportArtifact(
        agent_name="agent",
        persona="tester",
        status="succeeded",
        summary="done",
    )
    assert report.agent_name == "agent"
    assert report.persona == "tester"
    assert report.status == "succeeded"
    assert report.summary == "done"


@verifies(SWR.SWR_130)
def test_child_report_artifact_optional_lists_default_empty() -> None:
    report = report_models.ChildReportArtifact(
        agent_name="agent",
        persona="tester",
        status="succeeded",
        summary="done",
    )
    assert report.edited_files == []
    assert report.created_files == []
    assert report.artifacts == []
    assert report.commands == []
    assert report.tests == []
    assert report.errors == []
    assert report.next_recommended_actions == []


@verifies(SWR.SWR_130)
def test_child_report_artifact_model_dump_and_validate_round_trip() -> None:
    report = report_models.ChildReportArtifact(
        agent_name="agent",
        persona="tester",
        status="failed",
        summary="oops",
    )
    dumped = report.model_dump()
    assert dumped["agent_name"] == "agent"
    assert dumped["status"] == "failed"
    restored = report_models.ChildReportArtifact.model_validate(dumped)
    assert restored == report


@verifies(SWR.SWR_130)
def test_sub_models_construct_correctly() -> None:
    edited = report_models.EditedFile(path="a.py", change_type="modified", commit_sha="abc")
    created = report_models.CreatedFile(path="b.py", commit_sha="def")
    artifact = report_models.Artifact(type="log", path="out.txt", description="output")
    command = report_models.CommandResult(command="pytest", exit_code=0, summary="ok")
    test_result = report_models.TestResult(name="unit", status="passed", summary="ok")
    error = report_models.ErrorInfo(type="ValueError", message="bad")

    assert edited.path == "a.py"
    assert created.path == "b.py"
    assert artifact.type == "log"
    assert command.exit_code == 0
    assert test_result.status == "passed"
    assert error.message == "bad"


@verifies(SWR.SWR_130)
def test_populated_sub_models_serialize_deserialize() -> None:
    report = report_models.ChildReportArtifact(
        agent_name="agent",
        persona="tester",
        status="blocked",
        summary="blocked on dependency",
        edited_files=[report_models.EditedFile(path="a.py", change_type="modified")],
        created_files=[report_models.CreatedFile(path="b.py")],
        artifacts=[report_models.Artifact(type="log", description="log")],
        commands=[report_models.CommandResult(command="pytest", summary="ran")],
        tests=[report_models.TestResult(name="unit", status="skipped", summary="skip")],
        errors=[report_models.ErrorInfo(type="RuntimeError", message="boom")],
        next_recommended_actions=["fix dependency"],
    )
    dumped = report.model_dump()
    restored = report_models.ChildReportArtifact.model_validate(dumped)
    assert restored == report
