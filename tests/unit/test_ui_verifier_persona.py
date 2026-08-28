from __future__ import annotations

from rotaris_core.agents.factory import load_system_prompt
from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_372)
def test_ui_verifier_in_default_personas() -> None:
    assert "ui-verifier" in DEFAULT_PERSONAS


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_372, SWR.SWR_379)
def test_ui_verifier_config_is_read_only_leaf_node() -> None:
    persona = DEFAULT_PERSONAS["ui-verifier"]

    assert persona.model == "large_model"
    assert "UI verifier:" in (persona.purpose or "")
    assert persona.system_prompt_file == "prompts/ui_verifier.md"
    assert persona.read_only is True
    assert persona.delegates_to == []
    # Playwright drives the browser; Serena reads the code behind what it sees,
    # by symbol rather than by whole file (SWR-2801). Both are read-only here.
    assert persona.mcp_servers == ["playwright", "serena"]
    assert set(persona.tools) == {
        "haet_read",
        "grep",
        "glob",
        "artifact_read",
        "artifact_list",
    }


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_374)
def test_orchestrator_delegates_to_ui_verifier() -> None:
    assert "ui-verifier" in DEFAULT_PERSONAS["orchestrator"].delegates_to


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_375)
def test_coding_agent_delegates_to_ui_verifier() -> None:
    assert "ui-verifier" in DEFAULT_PERSONAS["coding-agent"].delegates_to


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_376)
def test_tester_delegates_to_ui_verifier() -> None:
    assert "ui-verifier" in DEFAULT_PERSONAS["tester"].delegates_to


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_373, SWR.SWR_377, SWR.SWR_378, SWR.SWR_384, SWR.SWR_385)
def test_ui_verifier_prompt_loads_with_required_contract() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["ui-verifier"])

    for text in (
        "single purpose is to verify UI paths and runtime behaviour in a real browser",
        "This persona is distinct from:",
        "`tester`: writes and maintains automated test suites.",
        "`verifier`: checks completed work against requirements",
        "Request Classification",
        "TYPE A: Flow Verification",
        "TYPE B: Regression Smoke-Test",
        "TYPE C: Visual / DOM Assertion",
        "TYPE D: Accessibility Quick Scan",
        "Verification Protocol",
        "Return a structured report with verdict, checklist, evidence, and blockers.",
        "## Required Output Format",
        "Headless mode is the default",
        "Do not write Playwright tests or any other automated test code.",
        "Do not run shell commands, package installs, or Git operations.",
        "Do not delegate to other personas.",
        "NEVER mark a UI path `PASS` unless you directly observed the requested behaviour.",
        "[[ROTARIS:PERSONA_NAME]]",
        "[[ROTARIS:TOOLS_SECTION]]",
        "[[ROTARIS:MCP_SECTION]]",
    ):
        assert text in prompt


@verifies(SWR.SWR_301, SWR.SWR_303, SWR.SWR_379, SWR.SWR_381)
def test_ui_verifier_prompt_forbids_code_editing_and_test_authoring() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["ui-verifier"])

    for text in (
        "Do not edit or create files.",
        "Do not write Playwright tests or any other automated test code.",
        "You are read-only.",
    ):
        assert text in prompt
