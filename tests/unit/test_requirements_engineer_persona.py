from __future__ import annotations

from rotaris_core.agents.factory import load_system_prompt
from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_364, SWR.SWR_370)
def test_requirements_engineer_in_default_personas() -> None:
    assert "requirements-engineer" in DEFAULT_PERSONAS


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_364, SWR.SWR_370)
def test_requirements_engineer_config_is_bounded_to_requirements_work() -> None:
    persona = DEFAULT_PERSONAS["requirements-engineer"]

    assert persona.model == "medium_model"
    assert "Requirements engineer:" in (persona.purpose or "")
    assert persona.system_prompt_file == "prompts/requirements_engineer.md"
    assert set(persona.tools) == {
        "write_file",
        "haet_read",
        "haet_edit",
        "read_file",
        "grep",
        "glob",
        "delegate",
        "artifact_read",
        "artifact_list",
        "artifact_write",
    }
    assert persona.delegates_to == ["librarian", "codebase-analyst"]


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_366, SWR.SWR_370)
def test_orchestrator_delegates_to_requirements_engineer() -> None:
    assert "requirements-engineer" in DEFAULT_PERSONAS["orchestrator"].delegates_to


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_367, SWR.SWR_370)
def test_planner_delegates_to_requirements_engineer() -> None:
    assert "requirements-engineer" in DEFAULT_PERSONAS["planner"].delegates_to
    assert "delegate" in DEFAULT_PERSONAS["planner"].tools


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_365, SWR.SWR_369, SWR.SWR_370)
def test_requirements_engineer_prompt_loads_with_required_contract() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["requirements-engineer"])

    for text in (
        "Traceability and Acceptance Specialist",
        "Request Classification",
        "TYPE A: Requirement Discovery",
        "TYPE B: Requirement Creation",
        "TYPE C: Requirement Update / Status Hygiene",
        "TYPE D: Acceptance Criteria Review",
        "NEVER edit production source code",
        "NEVER mark a requirement `approved` without evidence",
        "Requirement Quality Standard",
        "Status Guidance",
        "docs/requirements/",
    ):
        assert text in prompt


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_366, SWR.SWR_370)
def test_orchestrator_prompt_routes_requirements_work() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["orchestrator"])

    assert "`requirements-engineer`" in prompt
    assert "traceable requirements + acceptance criteria" in prompt


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_367, SWR.SWR_370)
def test_planner_prompt_routes_requirements_work() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["planner"])

    assert "`requirements-engineer`" in prompt
    assert "acceptance criteria, traceability gaps" in prompt
    assert "## Requirement Traceability" in prompt


@verifies(SWR.SWR_159, SWR.SWR_161)
def test_orchestrator_prompt_routes_plan_worthy_work_through_planner() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["orchestrator"])

    assert "Need a structured execution plan with ordered steps" in prompt
    assert "Owns prerequisite research/design delegation and synthesizes the plan." in prompt


@verifies(SWR.SWR_159, SWR.SWR_161)
def test_planner_prompt_prefers_delegated_research() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["planner"])

    assert "`codebase-analyst` — this repository" in prompt
    assert "Read files yourself only for bounded validation" in prompt


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_370, SWR.SWR_368)
def test_requirements_engineer_context_uses_authoritative_result() -> None:
    """Productive use: implementers can consume completed requirements work.
    Expected outcome: inherited context contains the exact final result without lossy summaries.
    """
    manager = ChildManager(parent_agent_id="parent", current_depth=1, policy=RuntimePolicy())
    record = manager.spawn_child(
        "requirements",
        "requirements-engineer",
        "shape requirements",
        run_in_background=True,
    )
    manager.spawn_child("implementation", "coding-agent", "implement", depends_on=[record.task_id])

    report = ChildReportArtifact(
        agent_name="requirements",
        persona="requirements-engineer",
        status="succeeded",
        summary="Defined acceptance criteria",
        key_findings="REQ-1 covers the behavior.",
        final_response="Implement REQ-1 exactly as specified.",
    )
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("requirements", ChildTaskState.SUCCEEDED, report)

    ready = manager.resolve_ready_children()
    payload = ready[0].task_payload

    assert "RESULT:\nImplement REQ-1 exactly as specified." in payload
    assert "SUMMARY: Defined acceptance criteria" not in payload
    assert "REQ-1 covers the behavior." not in payload
