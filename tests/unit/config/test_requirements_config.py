"""Productive use: a user opens a workspace and the requirements board works without
being configured first — and a user who does configure it declares sources, scheduling
and board defaults in one place that later slices only read.
Expected outcome: an absent block yields documented defaults for every field the whole
feature reads, a partial workspace block overlays the user block field by field, and an
unknown source type is rejected instead of producing a silently empty board."""

from __future__ import annotations

import pytest
import yaml
from pydantic import ValidationError

from rotaris_core.config.defaults import DEFAULT_CONFIG, DEFAULT_REQUIREMENTS
from rotaris_core.config.schema import (
    ALL_EVALUATION_TRIGGERS,
    ALL_HUMAN_DECISION_TRIGGERS,
    RequirementsConfig,
    RequirementSourceConfig,
    RotarisConfig,
)
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit

WORKSPACE_YAML = """
requirements:
  sources:
    - id: house
      type: markdown
      glob: "specs/**/*.md"
      fields:
        id: frontmatter.id
        title: heading
        lifecycle: frontmatter.state
  scheduling:
    mode: automatic
    max_concurrent_units: 4
  execution:
    branch_template: "req/{requirement_id}/{unit_id}"
  board:
    default_sort: id
"""


@verifies(SWR.SWR_3117)
def test_a_workspace_that_configures_nothing_gets_working_defaults() -> None:
    """No configuration at all must still give the built-in source and manual scheduling."""
    config = RotarisConfig()

    requirements = config.requirements
    assert requirements.enabled
    assert requirements.sources == []
    assert requirements.scheduling.mode == "manual"
    assert requirements.refresh.incremental
    assert requirements.delivery.store_subpath == "requirements"
    assert requirements.execution.branch_template == "rotaris/req/{requirement_id}/{unit_id}"
    assert requirements.board.default_sort == "priority"
    assert not requirements.human_in_the_loop.allow_force_done


@verifies(SWR.SWR_3117)
def test_every_field_later_slices_read_exists_with_a_default() -> None:
    """The completeness claim of SWR-3117, named field by field.

    Each entry is a setting a requirement of slices 2-6 asks for. A field missing
    here is a merge in ``config/schema.py`` at exactly the point two slices run in
    parallel, which is the cost this test exists to prevent.
    """
    requirements = RequirementsConfig()

    expected: dict[str, tuple[str, ...]] = {
        # SWR-3104 / SWR-3115: which sources exist and how they map.
        "sources": (),
        # SWR-3116 / SWR-3210: refresh cadence and evaluation triggers.
        "refresh": (
            "incremental",
            "debounce_ms",
            "triggers",
            "max_workers",
            "timeout_seconds",
            "watch_filesystem",
        ),
        # SWR-3206 / SWR-3209: evidence obligations and freshness.
        "evidence": (
            "follow_source_flags",
            "product",
            "technical",
            "epic",
            "stale_on_lost_ancestor",
            "stale_on_trace_move",
        ),
        # SWR-3205 / SWR-3213 / SWR-3214: the delivery store.
        "delivery": (
            "store_subpath",
            "schema_version",
            "retain_tombstones",
            "audit_trail",
            "history_limit",
        ),
        # SWR-3404 / SWR-3405 / SWR-3409 / SWR-3410 / SWR-3415: execution.
        "execution": (
            "branch_template",
            "integration_branch_template",
            "worktree_subpath",
            "target_branch",
            "run_check_suite",
            "run_reqtocode_verification",
            "retry_limit",
            "keep_failed_worktrees",
            "unit_timeout_minutes",
            "decomposition",
        ),
        # SWR-3406 / SWR-3412 / SWR-3510 / SWR-3608: scheduling.
        "scheduling": (
            "mode",
            "max_concurrent_units",
            "max_concurrent_requirements",
            "avoid_file_conflicts",
            "priority_order",
            "auto_release_dependents",
            "queue_limit",
        ),
        # SWR-3301 / SWR-3309 / SWR-3312: board defaults.
        "board": (
            "default_sort",
            "group_by",
            "filters",
            "show_deprecated",
            "live_updates",
            "card_limit",
        ),
        # SWR-3106 / SWR-3404 / SWR-3503 / SWR-3507: agentic personas.
        "personas": (
            "source_discovery",
            "decomposition",
            "execution",
            "impact_analysis",
            "migration_analysis",
        ),
        # SWR-3215 / SWR-3506 / SWR-3512 / SWR-3607: human decisions.
        "human_in_the_loop": (
            "escalate",
            "require_review_before_done",
            "allow_force_done",
            "confirm_migration_worklist",
            "confirm_source_writes",
            "answer_timeout_minutes",
        ),
        # SWR-3501 / SWR-3504 / SWR-3509 / SWR-3513: change propagation.
        "change": (
            "analyze_changes",
            "adopt_hash_after_verification",
            "propagate_evidence_loss",
            "gate_on_dependencies",
            "report_dangling_dependents",
        ),
    }

    for section, fields in expected.items():
        assert section in type(requirements).model_fields, f"requirements.{section} is missing"
        block = getattr(requirements, section)
        for name in fields:
            assert name in type(block).model_fields, f"requirements.{section}.{name} is missing"
            assert getattr(block, name) is not None or name == "target_branch"

    # Every obligation kind of SWR-3206 is resolvable per requirement type.
    for kind in ("implementation", "test", "verification", "execution", "integration"):
        assert getattr(requirements.evidence.product, kind)
        assert getattr(requirements.evidence.technical, kind)
        assert getattr(requirements.evidence.epic, kind)

    # The two enumerations the requirements name explicitly are complete.
    assert tuple(requirements.refresh.triggers) == ALL_EVALUATION_TRIGGERS
    assert tuple(requirements.human_in_the_loop.escalate) == ALL_HUMAN_DECISION_TRIGGERS


@verifies(SWR.SWR_3117)
def test_a_partial_workspace_block_overlays_the_user_block_field_wise() -> None:
    """Workspace over user, per field — the precedence rule in AGENTS.md."""
    user = {
        "scheduling": {"max_concurrent_units": 8, "mode": "manual"},
        "board": {"default_sort": "state"},
        "delivery": {"history_limit": 50},
    }
    workspace = {"scheduling": {"mode": "automatic"}}

    merged = RequirementsConfig.overlay(user, workspace)

    # The workspace's field wins …
    assert merged.scheduling.mode == "automatic"
    # … the user's other fields in the same section survive …
    assert merged.scheduling.max_concurrent_units == 8
    # … sections the workspace never mentions are untouched …
    assert merged.board.default_sort == "state"
    assert merged.delivery.history_limit == 50
    # … and everything neither scope set falls back to the documented default.
    assert merged.refresh.debounce_ms == 400
    assert merged.execution.retry_limit == 1


@verifies(SWR.SWR_3117)
def test_list_fields_replace_rather_than_merge() -> None:
    """The repository's own rule for lists, applied inside the block too."""
    merged = RequirementsConfig.overlay(
        {"refresh": {"triggers": ["commit", "merge"]}},
        {"refresh": {"triggers": ["manual"]}},
    )

    assert merged.refresh.triggers == ["manual"]


@verifies(SWR.SWR_3117)
def test_an_unknown_source_type_is_rejected() -> None:
    """A typo must not produce a source that silently reads nothing."""
    with pytest.raises(ValidationError):
        RequirementsConfig.model_validate(
            {"sources": [{"id": "house", "type": "confluence", "glob": "**/*.md"}]},
        )

    with pytest.raises(ValidationError, match="unknown_setting"):
        RequirementsConfig.model_validate({"unknown_setting": True})


@verifies(SWR.SWR_3117)
def test_a_declarative_source_without_a_glob_is_rejected() -> None:
    """A mapping that names no files is a configuration error, not an empty store."""
    with pytest.raises(ValidationError, match="needs a 'glob'"):
        RequirementSourceConfig.model_validate({"id": "specs", "type": "markdown"})

    # The built-in source needs none: it resolves the repository layout itself.
    assert RequirementSourceConfig(id="house").type == "reqtocode"


@verifies(SWR.SWR_3117)
def test_duplicate_source_ids_are_rejected() -> None:
    """Attribution and collision reports (SWR-3115) need the ids to be unique."""
    with pytest.raises(ValidationError, match="duplicate source id"):
        RequirementsConfig.model_validate(
            {
                "sources": [
                    {"id": "house"},
                    {"id": "house", "type": "markdown", "glob": "specs/**/*.md"},
                ],
            },
        )


@verifies(SWR.SWR_3117)
def test_a_real_configuration_document_loads_into_the_block() -> None:
    """The shape a user actually writes in `.rotaris/agents.yaml`, parsed and validated."""
    document = yaml.safe_load(WORKSPACE_YAML)

    config = RotarisConfig.model_validate(document)

    requirements = config.requirements
    assert [source.id for source in requirements.sources] == ["house"]
    source = requirements.sources[0]
    assert source.type == "markdown"
    assert source.glob == "specs/**/*.md"
    assert source.fields.lifecycle == "frontmatter.state"
    assert source.fields.parent == "frontmatter.epic"  # untouched default
    assert requirements.scheduling.mode == "automatic"
    assert requirements.scheduling.max_concurrent_units == 4
    assert requirements.execution.branch_template == "req/{requirement_id}/{unit_id}"
    assert requirements.board.default_sort == "id"
    assert requirements.refresh.debounce_ms == 400


@verifies(SWR.SWR_3117)
def test_the_block_survives_a_dump_and_reload() -> None:
    """A config Rotaris writes back must load again — the whole block, not a subset."""
    config = RotarisConfig.model_validate(yaml.safe_load(WORKSPACE_YAML))

    roundtrip = RotarisConfig.model_validate(config.model_dump())

    assert roundtrip.requirements == config.requirements


@verifies(SWR.SWR_3106, SWR.SWR_3117)
def test_the_default_config_names_personas_that_exist() -> None:
    """A persona the workspace does not have would make an agentic job unroutable."""
    personas = DEFAULT_REQUIREMENTS.personas

    assert personas.source_discovery == "requirements-engineer"
    for name in (
        personas.source_discovery,
        personas.decomposition,
        personas.execution,
        personas.impact_analysis,
        personas.migration_analysis,
    ):
        assert name in DEFAULT_CONFIG.personas, f"persona {name!r} is not configured"

    assert DEFAULT_CONFIG.requirements == DEFAULT_REQUIREMENTS
