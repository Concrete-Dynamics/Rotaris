"""Productive use: a user's workspace grew a techstack, and something has to
decide which commands verify it — without that something being the persona whose
completion the gate constrains.

Expected outcome: a dedicated `gatekeeper` persona, on its own model slot,
unreachable by delegation, holding exactly two tools nobody else can be granted.
It can strengthen a gate on its own authority and it *cannot* weaken one, because
the rule lives inside the write tool rather than in the prompt above it.

No model is reached. The authoring turn runs on a real SDK conversation with a
scripted LLM — the same arrangement `test_project_init_agent.py` uses for the
other system-only persona — so the tool registration, the per-run binding and the
permission grant are all exercised rather than mocked past. One of the tests has
the persona report something flatly untrue about its own work, because what the
run reports is read from the write tool and never from what a persona said.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.gate_tools import (
    GateWriteAction,
    GateWriteExecutor,
    ProbeAction,
    ProbeExecutor,
)
from rotaris_core.verifier.gate_writer import read_verifier_section
from rotaris_core.verifier.gatekeeper import (
    GATEKEEPER_PERSONA,
    author_gate_sync,
    resolve_gatekeeper_model,
)
from tests.integration.scripted_llm import ScriptedLLM, say, tool_call

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _config(tmp_path: Path, **overrides: Any) -> RotarisConfig:
    config = RotarisConfig(workspace_root=tmp_path, personas=dict(DEFAULT_PERSONAS))
    for key, value in overrides.items():
        setattr(config, key, value)
    return config


# -- the persona -------------------------------------------------------------


@verifies(SWR.SWR_2614)
def test_the_gatekeeper_is_system_only_and_no_persona_can_reach_it() -> None:
    """Not tidiness — the whole reason a separate persona exists.

    Authoring a gate must not be done by the persona whose completion that gate
    constrains, and a delegation edge would put it one call away from being
    exactly that.
    """
    assert GATEKEEPER_PERSONA in DEFAULT_PERSONAS
    reachable = [
        name
        for name, persona in DEFAULT_PERSONAS.items()
        if GATEKEEPER_PERSONA in persona.delegates_to
    ]
    assert reachable == []
    assert DEFAULT_PERSONAS[GATEKEEPER_PERSONA].delegates_to == []


@verifies(SWR.SWR_2614)
def test_its_tools_cannot_be_granted_to_anybody_else() -> None:
    """A persona's tool list is validated against the public names.

    Keeping the two gate tools out of that set is what makes "the gatekeeper is
    the only writer" a property of the code rather than of a convention.
    """
    from rotaris_core.agents.factory import ALLOWED_PUBLIC_TOOL_NAMES
    from rotaris_core.tools.gate_tools import GATE_WRITE_TOOL_NAME, PROBE_TOOL_NAME

    assert PROBE_TOOL_NAME not in ALLOWED_PUBLIC_TOOL_NAMES
    assert GATE_WRITE_TOOL_NAME not in ALLOWED_PUBLIC_TOOL_NAMES


@verifies(SWR.SWR_2614)
def test_the_gatekeeper_is_read_only_and_carries_no_workspace_write_tool() -> None:
    persona = DEFAULT_PERSONAS[GATEKEEPER_PERSONA]

    assert persona.read_only
    assert set(persona.tools) == {"read_file", "grep", "glob"}


@verifies(SWR.SWR_2614)
def test_the_model_slot_resolves_and_falls_back_through_the_existing_chain(
    tmp_path: Path,
) -> None:
    """Authoring is a short, cheap, once-per-techstack job.

    Inheriting a task persona's large model for it would be paying for nothing,
    so it gets its own slot — and an unset slot must still resolve.
    """
    assert (
        resolve_gatekeeper_model(_config(tmp_path, gatekeeper_model="gpt-5-nano")) == "gpt-5-nano"
    )

    chained = _config(tmp_path, gatekeeper_model=None, small_model="cheap-model")
    assert resolve_gatekeeper_model(chained) == "cheap-model"

    last_resort = _config(
        tmp_path,
        gatekeeper_model=None,
        small_model=None,
        default_summary_model="",
        fallback_model="fallback-model",
    )
    assert resolve_gatekeeper_model(last_resort) == "fallback-model"


# -- the write tool ----------------------------------------------------------


def _write(root: Path, checks: list[dict[str, Any]], *, reason: str = "detected") -> Any:
    executor = GateWriteExecutor(root)
    observation = executor(GateWriteAction(checks=checks, reason=reason))
    return executor, observation


@verifies(SWR.SWR_2614)
def test_the_write_tool_binds_a_first_gate(tmp_path: Path) -> None:
    _, observation = _write(
        tmp_path,
        [{"name": "pytest", "command": "uv run pytest -q", "role": "test"}],
    )

    assert observation.written
    assert [check.name for check in read_verifier_section(tmp_path) or ()] == ["pytest"]


@verifies(SWR.SWR_2614)
def test_the_write_tool_refuses_a_weakening_in_band_and_says_to_stop(tmp_path: Path) -> None:
    """The property that makes it safe to give an agent the pen.

    A prompt instruction not to weaken the gate is one a model can lose track of.
    This one it cannot reach: the refusal happens below it, and it is phrased as
    a routing instruction so the persona does not treat it as an obstacle.
    """
    _write(tmp_path, [{"name": "pytest", "command": "pytest -q", "role": "test"}])

    executor, observation = _write(tmp_path, [], reason="nothing worth running")

    assert not observation.written
    assert "approval-gated proposal" in observation.text
    assert "do not" in observation.text.lower()
    assert executor.writes[-1].refusal
    assert [check.name for check in read_verifier_section(tmp_path) or ()] == ["pytest"]


@verifies(SWR.SWR_2614)
def test_the_write_tool_insists_on_a_reason(tmp_path: Path) -> None:
    """It is what the user is shown when their configuration changes under them."""
    _, observation = _write(tmp_path, [{"name": "a", "command": "b"}], reason="  ")

    assert not observation.written
    assert observation.is_error


@verifies(SWR.SWR_2614)
def test_the_write_tool_rejects_a_malformed_suite_without_touching_the_file(
    tmp_path: Path,
) -> None:
    _, observation = _write(tmp_path, [{"name": "no-command"}])

    assert not observation.written
    assert read_verifier_section(tmp_path) is None


# -- the probe tool ----------------------------------------------------------


@verifies(SWR.SWR_2614, SWR.SWR_2613)
def test_the_probe_tool_runs_the_cheap_form_and_never_the_real_command(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """A gatekeeper that could run the suite would be a gatekeeper that could
    spend an hour of somebody's machine deciding what to write down."""
    seen: list[str] = []

    class _Runner:
        def __init__(self, *_args: object, **_kwargs: object) -> None: ...

        def __call__(self, command: str) -> tuple[int, str]:
            seen.append(command)
            return 0, "12 tests collected"

        def close(self) -> None: ...

    monkeypatch.setattr("rotaris_core.verifier.execution.CommandRunner", _Runner)

    executor = ProbeExecutor(tmp_path)
    observation = executor(ProbeAction(command="uv run pytest -q", role="test"))

    assert seen == ["uv run pytest -q --collect-only -q"]
    assert observation.verdict == "verified"


@verifies(SWR.SWR_2614, SWR.SWR_2618)
def test_the_probe_tool_cannot_be_pointed_outside_the_workspace(tmp_path: Path) -> None:
    """The persona names a directory; it does not get to choose a tree."""
    from rotaris_core.tools.gate_tools import _inside

    (tmp_path / "apps").mkdir()

    assert _inside(tmp_path, "apps") == (tmp_path / "apps").resolve()
    assert _inside(tmp_path, "../elsewhere") == tmp_path
    assert _inside(tmp_path, "/etc") == tmp_path
    assert _inside(tmp_path, "") == tmp_path


# -- the authoring turn ------------------------------------------------------
#
# Driven by a real SDK conversation with a scripted model, exactly as
# `test_project_init_agent.py` drives the other system-only persona. That is
# worth the extra machinery here: it exercises the tool registration, the
# per-run binding and the permission grant, none of which a fake conversation
# would touch.


def _gate_check(name: str = "pytest", command: str = "uv run pytest -q") -> dict[str, Any]:
    return {"name": name, "command": command, "role": "test"}


@verifies(SWR.SWR_2614)
def test_an_authoring_turn_reports_what_the_tool_did_not_what_the_persona_says(
    tmp_path: Path,
) -> None:
    """ "The gate moved" has to be an observation, not a claim.

    The persona here reports something flatly untrue about its own work. The
    outcome comes from the write tool, so the lie changes nothing — the same
    structural reason `verifier_results` is runner-owned and stripped from LLM
    output (SWR-2603).
    """
    scripted = ScriptedLLM(
        [
            tool_call("verifier_gate_write", checks=[_gate_check()], reason="a pyproject appeared"),
            say("I decided to write nothing at all."),
        ],
    )

    outcome = author_gate_sync(_config(tmp_path), tmp_path, llm=scripted.llm)

    assert outcome.wrote
    assert not outcome.failure
    assert [check.name for check in read_verifier_section(tmp_path) or ()] == ["pytest"]


@verifies(SWR.SWR_2614, SWR.SWR_2613)
def test_the_persona_can_probe_and_then_bind_what_survived(tmp_path: Path) -> None:
    """The productive path, end to end, with both tools in one turn."""
    (tmp_path / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")
    scripted = ScriptedLLM(
        [
            tool_call("verifier_probe", command="uv run pytest -q", role="test"),
            tool_call("verifier_gate_write", checks=[_gate_check()], reason="probed and bound"),
            say("Bound one test check."),
        ],
    )

    outcome = author_gate_sync(_config(tmp_path), tmp_path, llm=scripted.llm)

    assert outcome.wrote
    assert "verifier_probe" in scripted.tools_offered[0]
    assert "verifier_gate_write" in scripted.tools_offered[0]


@verifies(SWR.SWR_2614, SWR.SWR_2617)
def test_a_refused_change_is_carried_out_of_the_turn_for_a_proposal(tmp_path: Path) -> None:
    """The gatekeeper found something it believes should change and correctly
    could not do it. That is exactly what SWR-2617 turns into a proposal."""
    _write(tmp_path, [_gate_check()])
    scripted = ScriptedLLM(
        [
            tool_call("verifier_gate_write", checks=[], reason="this project has no tests"),
            say("Refused; reporting it."),
        ],
    )

    outcome = author_gate_sync(_config(tmp_path), tmp_path, llm=scripted.llm)

    assert not outcome.wrote
    assert outcome.refusals
    assert "emptying the check suite" in outcome.refusals[0]
    assert [check.name for check in read_verifier_section(tmp_path) or ()] == ["pytest"]


@verifies(SWR.SWR_2614)
def test_a_gatekeeper_that_fails_leaves_the_gate_exactly_as_it_was(tmp_path: Path) -> None:
    """An unreachable or unhelpful gatekeeper is never an aborted run."""
    _write(tmp_path, [_gate_check()])

    class _Broken:
        def __init__(self, agent: Any) -> None:
            self.agent = agent

        def send_message(self, message: str) -> None:
            del message

        def run(self) -> None:
            raise RuntimeError("the provider is down")

        def close(self) -> None: ...

    outcome = author_gate_sync(
        _config(tmp_path),
        tmp_path,
        llm=ScriptedLLM([say("never reached")]).llm,
        conversation_factory=_Broken,
    )

    assert outcome.failure
    assert not outcome.wrote
    assert [check.name for check in read_verifier_section(tmp_path) or ()] == ["pytest"]


@verifies(SWR.SWR_2614)
def test_a_workspace_without_the_persona_says_so_instead_of_raising(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path, personas={})

    outcome = author_gate_sync(config, tmp_path)

    assert "not configured" in outcome.failure
    assert not outcome.wrote


@verifies(SWR.SWR_2614, SWR.SWR_2615)
def test_the_turn_is_told_the_workspace_and_why_it_was_called(tmp_path: Path) -> None:
    """Authoring runs on a gate-state transition, and the persona is told which."""
    scripted = ScriptedLLM([say("Nothing bindable here.")])

    author_gate_sync(
        _config(tmp_path),
        tmp_path,
        reason="the first pyproject.toml appeared",
        llm=scripted.llm,
    )

    sent = "\n".join(
        str(getattr(part, "text", ""))
        for message in scripted.prompts[0]
        for part in (getattr(message, "content", None) or [])
    )
    assert "the first pyproject.toml appeared" in sent
    assert str(tmp_path) in sent
