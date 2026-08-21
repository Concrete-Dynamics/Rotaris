"""Which persona does an agentic requirements job (SWR-3117).

The roster in ``config.requirements.personas`` was declared by slice 1 and read
by nothing. These tests pin the reader, and one of them pins the thing that
actually matters in a shipped workspace: that every name in the roster resolves
against the personas Rotaris ships, so no job silently runs as the fallback.
"""

from __future__ import annotations

import pytest

from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.analysis.judge import DEFAULT_JUDGE_TIMEOUT
from rotaris_core.requirements.analysis.persona import (
    ANSWERS_PER_JUDGEMENT,
    PersonaResolutionError,
    ResolvedAnalyst,
    analyst_llm,
    analyst_timeout,
    resolve_analyst,
)

pytestmark = pytest.mark.unit

_JOBS = ("source_discovery", "decomposition", "execution", "impact_analysis", "migration_analysis")


def _config(**personas: str) -> RotarisConfig:
    """A config whose persona set is exactly *personas* (name -> model)."""
    config = RotarisConfig()
    config.personas = {
        name: PersonaConfig(name=name, model=model, purpose=f"{name} does things")
        for name, model in personas.items()
    }
    return config


@verifies(SWR.SWR_3117)
def test_a_job_resolves_to_its_configured_persona_and_that_persona_model() -> None:
    config = _config(**{"requirements-engineer": "medium_model"})

    resolved = resolve_analyst(config, "impact_analysis")

    assert resolved.persona == "requirements-engineer"
    assert resolved.model == "medium_model"
    assert resolved.job == "impact_analysis"
    assert not resolved.substituted


@verifies(SWR.SWR_3117)
def test_each_job_resolves_to_its_own_configured_persona() -> None:
    config = _config(**{"requirements-engineer": "medium_model", "coding-agent": "large_model"})
    config.requirements.personas.decomposition = "coding-agent"

    by_job = {job: resolve_analyst(config, job) for job in _JOBS}

    assert by_job["decomposition"].persona == "coding-agent"
    assert by_job["decomposition"].model == "large_model"
    assert by_job["impact_analysis"].persona == "requirements-engineer"
    assert by_job["impact_analysis"].model == "medium_model"


@verifies(SWR.SWR_3117)
def test_an_unknown_persona_falls_back_to_the_workspace_default_and_says_so() -> None:
    """The schema promises a renamed persona never makes a workspace unopenable."""
    config = _config(orchestrator="large_model")
    config.default_persona = "orchestrator"
    config.requirements.personas.impact_analysis = "a-persona-somebody-renamed"

    resolved = resolve_analyst(config, "impact_analysis")

    assert resolved.persona == "orchestrator"
    assert resolved.model == "large_model"
    assert resolved.substituted
    assert resolved.requested_persona == "a-persona-somebody-renamed"
    # A substitution the caller can report rather than one that happens quietly.
    assert "a-persona-somebody-renamed" in resolved.describe()
    assert "orchestrator" in resolved.describe()


@verifies(SWR.SWR_3117)
def test_a_workspace_without_the_persona_or_the_default_reports_it_where_it_is_used() -> None:
    config = _config()
    config.default_persona = "orchestrator"

    with pytest.raises(PersonaResolutionError) as caught:
        resolve_analyst(config, "migration_analysis")

    message = str(caught.value)
    assert "migration_analysis" in message
    assert "requirements-engineer" in message
    assert "orchestrator" in message


@verifies(SWR.SWR_3117, SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3411, SWR.SWR_3503, SWR.SWR_3507)
def test_every_shipped_job_resolves_without_falling_back() -> None:
    """The guard that matters: roster and shipped personas agree.

    If a default in ``RequirementPersonaConfig`` ever names a persona
    ``defaults.py`` does not define, every analysis of that job would quietly
    run as the orchestrator. This test is what makes that loud.
    """
    config = RotarisConfig()
    config.personas = dict(DEFAULT_PERSONAS)

    for job in _JOBS:
        resolved = resolve_analyst(config, job)
        assert not resolved.substituted, resolved.describe()
        assert resolved.model, f"{job} resolved to a persona with no model"


@verifies(SWR.SWR_3117)
def test_the_llm_handle_is_scoped_to_the_job_and_never_streams(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """A meta-call whose whole answer is one small object has nothing to stream."""
    captured: dict[str, object] = {}

    def fake_load(config, model_name, *, stream=False, usage_id=None):  # type: ignore[no-untyped-def]
        captured["model"] = model_name
        captured["stream"] = stream
        captured["usage_id"] = usage_id
        return "an-llm"

    monkeypatch.setattr("rotaris_core.config.loader.load_llm_for_model", fake_load)

    resolved = ResolvedAnalyst(
        job="impact_analysis",
        requested_persona="requirements-engineer",
        persona="requirements-engineer",
        model="medium_model",
        purpose="",
    )
    analyst_llm(RotarisConfig(), resolved)

    assert captured["model"] == "medium_model"
    assert captured["stream"] is False
    # build_llm_usage_id sanitises segments, so the job reads as impact-analysis.
    usage_id = str(captured["usage_id"])
    assert usage_id.startswith("requirements-")
    assert "impact-analysis" in usage_id


# --------------------------------------------------------------------------
# How long the answer may take, from the same configuration the transport reads
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3117, SWR.SWR_3503)
def test_the_budget_for_an_answer_covers_the_transport_own_attempt() -> None:
    """Productive use: a workspace leaves the model timeouts alone and releases a
    requirement large enough to be decomposed.

    Expected outcome: the analyst is given more time than the transport under it is
    allowed to spend on one attempt. The two limits used to be set independently — a
    judge capped at 90 s over a transport allowed 120 s — so the judge could only ever
    cut off a call that was still going fine, and the requirement was blocked with
    ``model-error`` while nothing had actually failed.
    """
    config = _config(**{"requirements-engineer": "medium_model"})

    budget = analyst_timeout(config, "medium_model")

    assert budget > config.runtime.model_timeout, (
        "an analyst that gives up before one configured attempt has run out reports"
        " a working provider as a failure"
    )
    assert budget == config.runtime.model_timeout * ANSWERS_PER_JUDGEMENT


@verifies(SWR.SWR_3117, SWR.SWR_3503)
def test_a_model_own_timeout_is_what_its_analyst_waits_for() -> None:
    """Productive use: a workspace raises ``models.<name>.timeout`` for a slow reasoning
    model, which is the documented reason that field exists.

    Expected outcome: everything that asks that model a question waits accordingly. A
    per-model override that the analyst ignored would leave a second, invisible limit to
    fire first — the setting would look applied and change nothing.
    """
    config = _config(**{"requirements-engineer": "medium_model"})
    config.models["medium_model"] = ModelConfig(
        provider="deepseek",
        model_id="deepseek-v4-pro",
        timeout=600,
    )

    assert analyst_timeout(config, "medium_model") == 600 * ANSWERS_PER_JUDGEMENT


@verifies(SWR.SWR_3117, SWR.SWR_3503)
def test_a_short_transport_timeout_never_makes_an_analysis_unanswerable() -> None:
    """Productive use: a workspace shortens ``runtime.model_timeout`` so interactive
    turns fail fast.

    Expected outcome: the requirements analyses keep the floor they always had. Handing
    a judge two seconds because the chat loop wants to fail fast would make every
    analysis a timeout, which is a different setting than the one that was changed.
    """
    config = _config(**{"requirements-engineer": "medium_model"})
    config.runtime.model_timeout = 30

    assert analyst_timeout(config, "medium_model") == DEFAULT_JUDGE_TIMEOUT


@verifies(SWR.SWR_3117, SWR.SWR_3503)
def test_the_resolution_carries_the_budget_so_no_composition_has_to_ask() -> None:
    """Who answers and how long they have are one configuration read.

    Every composition that builds an analyst already resolves the persona; carrying the
    budget with it is what makes the fix reach the headless flow, the desktop flow and
    source discovery without any of them passing a number.
    """
    config = _config(**{"requirements-engineer": "medium_model"})

    resolved = resolve_analyst(config, "decomposition")

    assert resolved.timeout == analyst_timeout(config, "medium_model")


@verifies(SWR.SWR_3117)
def test_an_analyst_resolution_built_by_hand_still_has_a_deadline() -> None:
    """A caller that skips ``resolve_analyst`` must not end up with no timeout at all."""
    resolved = ResolvedAnalyst(
        job="decomposition",
        requested_persona="planner",
        persona="planner",
        model="a/model",
        purpose="",
    )

    assert resolved.timeout == DEFAULT_JUDGE_TIMEOUT
