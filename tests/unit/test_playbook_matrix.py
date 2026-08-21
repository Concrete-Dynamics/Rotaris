"""Playbook composition matrix: persona x intent x model tier (SWR-2416).

Design authority: ``docs/architecture/prompt-composition-matrix.md``.
"""

from __future__ import annotations

import pytest

from rotaris_core.agents.playbook import (
    CONSUMER_SLOTS,
    FALLBACK_TIER,
    SLOTS,
    implementation_owner_for_intent,
    load_matrix,
    load_variants,
    render_playbook,
    resolve_playbook_cell,
)
from rotaris_core.agents.prompt_render import PromptRenderContext, render_system_prompt
from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.ralph.intent_classifier import IntentCategory
from rotaris_core.reqtocode import SWR, verifies

_TIERS = ("small_model", "medium_model", "large_model")
_INTENTS = tuple(intent.value for intent in IntentCategory)


# ── matrix integrity ────────────────────────────────────────────────────────


@verifies(SWR.SWR_2416)
def test_every_matrix_persona_exists_in_default_personas() -> None:
    """A matrix row for a persona that does not exist would never resolve."""
    for persona in load_matrix()["personas"]:
        assert persona in DEFAULT_PERSONAS, persona


@verifies(SWR.SWR_2416)
def test_every_owner_target_is_a_real_persona() -> None:
    for intent, owner in load_matrix()["owners"].items():
        assert owner in DEFAULT_PERSONAS, f"{intent} -> {owner}"


@verifies(SWR.SWR_2416)
def test_every_group_member_is_a_real_intent() -> None:
    for group, members in load_matrix()["groups"].items():
        for member in members:
            assert member in _INTENTS, f"{group} -> {member}"


@verifies(SWR.SWR_2416)
def test_every_selected_variant_is_catalogued() -> None:
    """A cell may only select catalogued variants — never invent prompt text."""
    catalogue = load_variants()["slots"]
    for persona, entry in load_matrix()["personas"].items():
        sources = [entry.get("defaults") or {}]
        for tier_cells in (entry.get("intents") or {}).values():
            sources.extend(cell for cell in tier_cells.values() if isinstance(cell, dict))
        for source in sources:
            for slot, variant in source.items():
                if slot == "not_routed":
                    continue
                assert slot in SLOTS, f"{persona}: unknown slot {slot}"
                assert variant in catalogue[slot]["variants"], f"{persona}: {slot}={variant}"


@pytest.mark.parametrize("persona", ["orchestrator", "coding-agent"])
@verifies(SWR.SWR_2416)
def test_core_personas_resolve_for_every_intent_and_tier(persona: str) -> None:
    """The two personas on the critical path must have no resolution holes."""
    for intent in _INTENTS:
        for tier in _TIERS:
            cell = resolve_playbook_cell(persona, intent, tier)
            assert cell is not None, f"{persona}/{intent}/{tier}"
            if cell.routed:
                assert cell.variants, f"{persona}/{intent}/{tier} routed but empty"


@verifies(SWR.SWR_2416)
def test_route_is_only_selected_for_whole_request_routers() -> None:
    """`ROUTE` tells an agent to hand the request to someone else.

    Selecting it for an implementer told `coding-agent` to "delegate straight to the
    implementation owner" — which is itself.
    """
    routers = {"orchestrator", "planner"}
    for persona, entry in load_matrix()["personas"].items():
        sources = [entry.get("defaults") or {}]
        for tier_cells in (entry.get("intents") or {}).values():
            sources.extend(cell for cell in tier_cells.values() if isinstance(cell, dict))
        if persona not in routers:
            assert all("ROUTE" not in source for source in sources), persona


@verifies(SWR.SWR_2416)
def test_implementer_playbook_never_tells_it_to_delegate_the_work_away() -> None:
    rendered = render_playbook(
        resolve_playbook_cell("coding-agent", "moderate_feature", "medium_model"),
    )
    assert "Delegate straight to the implementation owner" not in rendered


@verifies(SWR.SWR_2416)
def test_publish_required_only_for_publishing_personas() -> None:
    """`publish-required` in a cell for a persona that cannot publish is a spec error."""
    for persona, entry in load_matrix()["personas"].items():
        publishes = DEFAULT_PERSONAS[persona].can_publish_artifacts
        sources = [entry.get("defaults") or {}]
        for tier_cells in (entry.get("intents") or {}).values():
            sources.extend(cell for cell in tier_cells.values() if isinstance(cell, dict))
        for source in sources:
            artifact = source.get("ARTIFACT")
            if artifact in {"publish-required", "read+publish"}:
                assert publishes, f"{persona} cannot publish but selects {artifact}"


# ── tier axis ───────────────────────────────────────────────────────────────


@verifies(SWR.SWR_2416)
def test_orchestrator_keys_on_implementation_owner() -> None:
    assert implementation_owner_for_intent("refactor") == "refactorer"
    assert implementation_owner_for_intent("requirements") == "requirements-engineer"
    assert implementation_owner_for_intent("architectural") == "architect"
    assert implementation_owner_for_intent("small_feature") == "coding-agent"
    assert implementation_owner_for_intent("moderate_feature") == "coding-agent"


@verifies(SWR.SWR_2416)
def test_unknown_tier_downgrades_to_medium_and_is_reported_as_unresolved() -> None:
    cell = resolve_playbook_cell("coding-agent", "small_feature", None)
    assert cell is not None
    assert cell.tier == FALLBACK_TIER
    assert cell.tier_resolved is False
    rendered = render_playbook(cell)
    assert "undetermined" in rendered
    assert FALLBACK_TIER in rendered


@verifies(SWR.SWR_2416)
def test_persona_without_a_matrix_row_gets_no_playbook() -> None:
    """`intent-classifier` runs before classification exists — no axes are defined."""
    assert resolve_playbook_cell("intent-classifier", "small_feature", "small_model") is None
    assert render_playbook(None) == ""


# ── the two scenarios the matrix exists for ─────────────────────────────────


@verifies(SWR.SWR_2416)
def test_small_feature_with_large_coding_agent_delegates_immediately() -> None:
    orchestrator = resolve_playbook_cell(
        "orchestrator",
        "small_feature",
        "large_model",
        tier_source="coding-agent",
    )
    assert orchestrator is not None
    assert orchestrator.variants["ROUTE"] == "direct"
    assert orchestrator.variants["RESEARCH"] == "self"
    assert orchestrator.variants["CHUNKING"] == "whole-feature"
    assert orchestrator.variants["VERIFY"] == "gate-only"

    coder = resolve_playbook_cell("coding-agent", "small_feature", "large_model")
    assert coder is not None
    assert coder.variants["AUTONOMY"] == "full"
    assert coder.variants["RESEARCH"] == "self"
    assert coder.variants["CHUNKING"] == "whole-feature"
    # The coding agent owns its own testing in this cell.
    assert coder.variants["VERIFY"] == "self"


@verifies(SWR.SWR_2416)
def test_moderate_feature_with_small_coding_agent_pre_researches_and_chunks() -> None:
    orchestrator = resolve_playbook_cell(
        "orchestrator",
        "moderate_feature",
        "small_model",
        tier_source="coding-agent",
    )
    assert orchestrator is not None
    assert orchestrator.variants["ROUTE"] == "plan-first"
    assert orchestrator.variants["RESEARCH"] == "artifact-required"
    assert orchestrator.variants["CHUNKING"] == "micro-slice"

    coder = resolve_playbook_cell("coding-agent", "moderate_feature", "small_model")
    assert coder is not None
    assert coder.variants["AUTONOMY"] == "strict"
    assert coder.variants["RESEARCH"] == "artifact-required"
    assert coder.variants["CHUNKING"] == "micro-slice"
    # A strict executor must not certify its own work.
    assert coder.variants["VERIFY"] == "external-only"

    librarian = resolve_playbook_cell("librarian", "moderate_feature", "medium_model")
    assert librarian is not None
    assert librarian.variants["ARTIFACT"] == "publish-required"


# ── consumer axis (planner sizes for its executor) ──────────────────────────


@verifies(SWR.SWR_2425)
def test_large_planner_sizes_the_plan_for_a_small_executor() -> None:
    """The plan is the executor's input contract, so it is cut at the executor's capacity."""
    cell = resolve_playbook_cell(
        "planner",
        "moderate_feature",
        "large_model",
        consumer_tier="small_model",
        consumer_source="coding-agent",
    )
    assert cell is not None
    # Consumer-facing: the implementation contract the small executor needs.
    assert cell.variants["CHUNKING"] == "micro-slice"
    assert cell.variants["OUTPUT"] == "strict-schema"
    # Self-facing: the large planner keeps its own capability.
    assert cell.variants["AUTONOMY"] == "full"
    assert cell.variants["RESEARCH"] == "self-then-delegate"
    assert cell.variants["BUDGET"] == "normal"
    assert cell.tier == "large_model"


@verifies(SWR.SWR_2425)
def test_consumer_tier_never_upgrades_the_plan() -> None:
    """Downgrade, never upgrade (docs §5): a small planner keeps its own strict shape."""
    small = resolve_playbook_cell("planner", "moderate_feature", "small_model")
    assert small is not None
    with_large_executor = resolve_playbook_cell(
        "planner",
        "moderate_feature",
        "small_model",
        consumer_tier="large_model",
        consumer_source="coding-agent",
    )
    assert with_large_executor is not None
    assert with_large_executor.variants == small.variants
    assert with_large_executor.consumer_tier == ""


@verifies(SWR.SWR_2425)
def test_equal_tiers_leave_the_planner_cell_untouched() -> None:
    baseline = resolve_playbook_cell("planner", "moderate_feature", "medium_model")
    assert baseline is not None
    same = resolve_playbook_cell(
        "planner",
        "moderate_feature",
        "medium_model",
        consumer_tier="medium_model",
        consumer_source="coding-agent",
    )
    assert same is not None
    assert same.variants == baseline.variants
    assert same.consumer_tier == ""


@verifies(SWR.SWR_2425)
def test_unresolved_executor_tier_downgrades_to_medium_and_is_reported() -> None:
    cell = resolve_playbook_cell(
        "planner",
        "moderate_feature",
        "large_model",
        consumer_tier=None,
        consumer_source="coding-agent",
    )
    assert cell is not None
    assert cell.consumer_tier == FALLBACK_TIER
    assert cell.consumer_tier_resolved is False
    assert cell.variants["CHUNKING"] == "slice"
    assert cell.variants["OUTPUT"] == "structured"


@verifies(SWR.SWR_2425)
def test_not_routed_consumer_cell_is_ignored() -> None:
    """`G-build-s` is `not_routed` for a medium planner; that says nothing about sizing."""
    baseline = resolve_playbook_cell("planner", "small_feature", "small_model")
    assert baseline is not None
    cell = resolve_playbook_cell(
        "planner",
        "small_feature",
        "small_model",
        consumer_tier="small_model",
        consumer_source="coding-agent",
    )
    assert cell is not None
    assert cell.routed is True
    assert cell.variants == baseline.variants


@verifies(SWR.SWR_2425)
def test_consumer_axis_only_moves_consumer_slots() -> None:
    own = resolve_playbook_cell("planner", "large_feature", "large_model")
    sized = resolve_playbook_cell(
        "planner",
        "large_feature",
        "large_model",
        consumer_tier="small_model",
        consumer_source="coding-agent",
    )
    assert own is not None
    assert sized is not None
    changed = {slot for slot in SLOTS if own.variants.get(slot) != sized.variants.get(slot)}
    assert changed <= CONSUMER_SLOTS


@verifies(SWR.SWR_2425)
def test_planner_render_names_the_executor_it_sized_against() -> None:
    rendered = render_playbook(
        resolve_playbook_cell(
            "planner",
            "moderate_feature",
            "large_model",
            consumer_tier="small_model",
            consumer_source="coding-agent",
        ),
    )
    assert "`coding-agent`" in rendered
    assert "`small_model`" in rendered
    assert "not yours" in rendered


@verifies(SWR.SWR_2425)
def test_consumer_tier_is_auditable_in_the_cell_payload() -> None:
    payload = resolve_playbook_cell(
        "planner",
        "moderate_feature",
        "large_model",
        consumer_tier="small_model",
        consumer_source="coding-agent",
    )
    assert payload is not None
    as_dict = payload.as_dict()
    assert as_dict["consumer_tier"] == "small_model"
    assert as_dict["consumer_source"] == "coding-agent"
    assert as_dict["consumer_tier_resolved"] is True


# ── rendering ───────────────────────────────────────────────────────────────


@verifies(SWR.SWR_2416)
def test_rendered_cell_names_every_selected_variant() -> None:
    cell = resolve_playbook_cell("coding-agent", "large_feature", "medium_model")
    assert cell is not None
    rendered = render_playbook(cell)
    for slot, variant in cell.variants.items():
        if variant in {"n/a", "none"}:
            assert f"({variant})" not in rendered, slot
        else:
            assert f"({variant})" in rendered, slot


@verifies(SWR.SWR_2416)
def test_rendered_cell_declares_itself_authoritative_but_not_over_hard_blocks() -> None:
    rendered = render_playbook(resolve_playbook_cell("tester", "small_feature", "medium_model"))
    assert "follow the playbook" in rendered
    assert "hard blocks" in rendered


@verifies(SWR.SWR_2416)
def test_orchestrator_render_names_the_owner_it_sized_against() -> None:
    rendered = render_playbook(
        resolve_playbook_cell(
            "orchestrator",
            "refactor",
            "large_model",
            tier_source="refactorer",
        ),
    )
    assert "`refactorer`" in rendered
    assert "not yours" in rendered


@verifies(SWR.SWR_2416)
def test_unrouted_persona_gets_a_bounded_fallback_instead_of_silence() -> None:
    cell = resolve_playbook_cell("coding-agent", "question", "large_model")
    assert cell is not None
    assert cell.routed is False
    rendered = render_playbook(cell)
    assert "not part of the standard flow" in rendered


@verifies(SWR.SWR_2416)
def test_run_override_is_rendered_after_the_cell_and_declared_to_win() -> None:
    """`swarm`/`single` used to ride on the intent snippet; it is now an explicit layer."""
    cell = resolve_playbook_cell("orchestrator", "small_feature", "large_model")
    rendered = render_playbook(cell, "swarm")

    assert "Run override — swarm" in rendered
    assert rendered.index("Run override") > rendered.index("Active Playbook")

    single = render_playbook(cell, "single")
    assert "Run override — single agent" in single
    assert "without delegating to child agents" in single


@verifies(SWR.SWR_2416)
def test_unknown_or_absent_run_override_renders_nothing_extra() -> None:
    cell = resolve_playbook_cell("orchestrator", "small_feature", "large_model")
    assert render_playbook(cell, None) == render_playbook(cell)
    assert render_playbook(cell, "not-a-strategy") == render_playbook(cell)


@verifies(SWR.SWR_2416)
def test_run_override_still_reaches_personas_without_a_matrix_row() -> None:
    assert "Run override — single agent" in render_playbook(None, "single")


# ── budget clamps the real runtime policy ───────────────────────────────────


@verifies(SWR.SWR_2416)
def test_tight_budget_narrows_the_runtime_policy() -> None:
    """A BUDGET the model can ignore is not a budget — it must clamp the real limits."""
    from rotaris_core.agents.playbook import clamp_policy_to_budget
    from rotaris_core.config.schema import RuntimePolicy

    policy = RuntimePolicy()
    cell = resolve_playbook_cell("orchestrator", "small_feature", "large_model")
    assert cell is not None and cell.variants["BUDGET"] == "tight"

    clamped = clamp_policy_to_budget(policy, cell)

    assert clamped.max_active_children == 2
    assert clamped.max_children == 6
    assert clamped.max_depth == 2
    # The original object is untouched — the clamp returns a copy.
    assert policy.max_active_children == 6


@verifies(SWR.SWR_2416)
def test_budget_clamp_never_raises_a_configured_limit() -> None:
    from rotaris_core.agents.playbook import clamp_policy_to_budget
    from rotaris_core.config.schema import RuntimePolicy

    stricter = RuntimePolicy(max_active_children=1, max_children=2, max_depth=1)
    cell = resolve_playbook_cell("orchestrator", "small_feature", "large_model")

    clamped = clamp_policy_to_budget(stricter, cell)

    assert clamped is stricter, "a workspace already tighter than the budget keeps its numbers"


@verifies(SWR.SWR_2416)
def test_wide_budget_and_missing_cell_leave_the_policy_alone() -> None:
    from rotaris_core.agents.playbook import clamp_policy_to_budget
    from rotaris_core.config.schema import RuntimePolicy

    policy = RuntimePolicy()
    wide = resolve_playbook_cell("orchestrator", "whole_project", "small_model")
    assert wide is not None and wide.variants["BUDGET"] == "wide"

    assert clamp_policy_to_budget(policy, wide) is policy
    assert clamp_policy_to_budget(policy, None) is policy
    unrouted = resolve_playbook_cell("coding-agent", "question", "large_model")
    assert clamp_policy_to_budget(policy, unrouted) is policy


@verifies(SWR.SWR_2416)
def test_every_budget_variant_has_a_limit_entry() -> None:
    from rotaris_core.agents.playbook import BUDGET_LIMITS

    catalogued = load_variants()["slots"]["BUDGET"]["variants"]
    assert set(BUDGET_LIMITS) == set(catalogued)


# ── layered overrides ───────────────────────────────────────────────────────


def _write_override(root, filename: str, body: str) -> None:
    scope = root / ".rotaris" / "playbooks"
    scope.mkdir(parents=True, exist_ok=True)
    (scope / filename).write_text(body, encoding="utf-8")


@verifies(SWR.SWR_2416)
def test_workspace_override_can_remap_a_cell(tmp_path) -> None:
    from rotaris_core.agents.playbook import reload_playbooks

    _write_override(
        tmp_path,
        "matrix.yaml",
        "personas:\n  coding-agent:\n    intents:\n      small_feature:\n"
        "        large_model:\n          VERIFY: external-only\n",
    )
    reload_playbooks()
    try:
        base = resolve_playbook_cell("coding-agent", "small_feature", "large_model")
        overridden = resolve_playbook_cell(
            "coding-agent",
            "small_feature",
            "large_model",
            workspace_root=str(tmp_path),
        )
        assert base is not None and overridden is not None
        assert base.variants["VERIFY"] == "self"
        assert overridden.variants["VERIFY"] == "external-only"
        # Slots the override did not name are inherited, not wiped.
        assert overridden.variants["CHUNKING"] == base.variants["CHUNKING"]
    finally:
        reload_playbooks()


@verifies(SWR.SWR_2416)
def test_workspace_override_may_reword_a_variant_but_not_add_one(tmp_path) -> None:
    from rotaris_core.agents.playbook import load_variants as load_layered_variants
    from rotaris_core.agents.playbook import reload_playbooks

    _write_override(
        tmp_path,
        "variants.yaml",
        'slots:\n  AUTONOMY:\n    variants:\n      full: "REWORDED."\n'
        '      turbo: "invented"\n  NOT_A_SLOT:\n    variants:\n      x: "invented"\n',
    )
    reload_playbooks()
    try:
        slots = load_layered_variants(str(tmp_path))["slots"]
        assert slots["AUTONOMY"]["variants"]["full"] == "REWORDED."
        assert "turbo" not in slots["AUTONOMY"]["variants"]
        assert "NOT_A_SLOT" not in slots

        cell = resolve_playbook_cell("coding-agent", "small_feature", "large_model")
        assert "REWORDED." in render_playbook(cell, None, str(tmp_path))
    finally:
        reload_playbooks()


@verifies(SWR.SWR_2416)
def test_unreadable_override_is_ignored_rather_than_failing_the_run(tmp_path) -> None:
    from rotaris_core.agents.playbook import reload_playbooks

    _write_override(tmp_path, "matrix.yaml", "not: valid: yaml: [")
    reload_playbooks()
    try:
        cell = resolve_playbook_cell(
            "coding-agent",
            "small_feature",
            "large_model",
            workspace_root=str(tmp_path),
        )
        assert cell is not None
        assert cell.variants["VERIFY"] == "self"
    finally:
        reload_playbooks()


@verifies(SWR.SWR_2416)
def test_playbook_token_is_substituted_into_the_system_prompt() -> None:
    cell = resolve_playbook_cell("coding-agent", "small_feature", "large_model")
    ctx = PromptRenderContext(persona_name="coding-agent", playbook=render_playbook(cell))
    result = render_system_prompt("Body.\n\n[[ROTARIS:PLAYBOOK]]", ctx)
    assert "[[ROTARIS:PLAYBOOK]]" not in result
    assert "Active Playbook" in result


@verifies(SWR.SWR_2416)
def test_empty_playbook_leaves_no_dangling_heading() -> None:
    ctx = PromptRenderContext(persona_name="coding-agent", playbook="")
    result = render_system_prompt("Body.\n\n[[ROTARIS:PLAYBOOK]]", ctx)
    assert result.strip() == "Body."
