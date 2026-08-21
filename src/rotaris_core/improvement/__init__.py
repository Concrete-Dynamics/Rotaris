"""Post-run improvement loop substrate.

Phase 1 of REQ-20260515-POSTRUN-IMPROVE. Provides:

* :class:`~rotaris_core.improvement.types.RunType` — distinguishes ``task_run``
  from ``improvement_run`` so future ``Improver`` work cannot self-chain.
* :class:`~rotaris_core.improvement.proposals.ImprovementProposalArtifact` — the
  structured artifact authored by the post-run :class:`ImprovementCollector`.
* :class:`~rotaris_core.improvement.collector.ImprovementCollector` — dedicated
  model-backed analyst invoked once per terminal ``task_run``.

The orchestrator and scheduler are not involved in proposal authorship; the
collector consumes already-finished run state only.

Re-exported lazily, for the reason spelled out in ``rotaris_core.tools``: the
barrel used to put ``collector`` -- and through it ``openhands.sdk`` and litellm
-- in front of every other name here. ``proposals`` is 0.29s of pydantic models
on its own but cost 10.2s through this file, which every TUI snapshot test pays
via ``tests/unit/snapshot_helpers.py``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rotaris_core.improvement.approval import (
        approved_proposals,
        set_proposal_status,
    )
    from rotaris_core.improvement.collector import (
        IMPROVEMENT_COLLECTOR_SYSTEM_PROMPT,
        ImprovementCollector,
    )
    from rotaris_core.improvement.history import (
        DEFAULT_HISTORY_RETENTION,
        ImprovementArtifactVersion,
        ImprovementHistoryCause,
        latest_artifact_version,
        list_artifact_versions,
        load_artifact_version,
    )
    from rotaris_core.improvement.improver import (
        IMPROVER_SYSTEM_PROMPT,
        build_improver_todo,
        complete_improvement_run,
        prepare_improvement_run,
    )
    from rotaris_core.improvement.persistence import (
        latest_improvement_artifact,
        list_improvement_artifact_ids,
        list_improvement_artifacts,
        load_improvement_artifact,
        save_improvement_artifact,
    )
    from rotaris_core.improvement.proposals import (
        ApprovalStatus,
        ImprovementCheckpointRecord,
        ImprovementEvidence,
        ImprovementProposal,
        ImprovementProposalArtifact,
        ImprovementProposalCategory,
        RiskLevel,
        validate_artifact,
    )
    from rotaris_core.improvement.rollback import (
        IMPROVEMENT_CHECKPOINT_REF_PREFIX,
        ImprovementRollbackPreview,
        ImprovementRollbackResult,
        ImprovementRollbackService,
    )
    from rotaris_core.improvement.types import RunType
else:
    #: Exported name -> the submodule of ``rotaris_core.improvement`` defining it.
    _EXPORT_SOURCES = {
        "DEFAULT_HISTORY_RETENTION": "history",
        "IMPROVEMENT_CHECKPOINT_REF_PREFIX": "rollback",
        "IMPROVEMENT_COLLECTOR_SYSTEM_PROMPT": "collector",
        "IMPROVER_SYSTEM_PROMPT": "improver",
        "ApprovalStatus": "proposals",
        "ImprovementArtifactVersion": "history",
        "ImprovementCheckpointRecord": "proposals",
        "ImprovementCollector": "collector",
        "ImprovementEvidence": "proposals",
        "ImprovementHistoryCause": "history",
        "ImprovementProposal": "proposals",
        "ImprovementProposalArtifact": "proposals",
        "ImprovementProposalCategory": "proposals",
        "ImprovementRollbackPreview": "rollback",
        "ImprovementRollbackResult": "rollback",
        "ImprovementRollbackService": "rollback",
        "RiskLevel": "proposals",
        "RunType": "types",
        "approved_proposals": "approval",
        "build_improver_todo": "improver",
        "complete_improvement_run": "improver",
        "latest_artifact_version": "history",
        "latest_improvement_artifact": "persistence",
        "list_artifact_versions": "history",
        "list_improvement_artifact_ids": "persistence",
        "list_improvement_artifacts": "persistence",
        "load_artifact_version": "history",
        "load_improvement_artifact": "persistence",
        "prepare_improvement_run": "improver",
        "save_improvement_artifact": "persistence",
        "set_proposal_status": "approval",
        "validate_artifact": "proposals",
    }

    def __getattr__(name):
        """Resolve a re-exported name from its submodule on first access."""
        source = _EXPORT_SOURCES.get(name)
        if source is None:
            raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
        from importlib import import_module

        value = getattr(import_module(f"{__name__}.{source}"), name)
        globals()[name] = value  # cached: __getattr__ is skipped from here on
        return value

    def __dir__():
        return sorted([*globals(), *_EXPORT_SOURCES])


__all__ = [
    "DEFAULT_HISTORY_RETENTION",
    "IMPROVEMENT_CHECKPOINT_REF_PREFIX",
    "IMPROVEMENT_COLLECTOR_SYSTEM_PROMPT",
    "IMPROVER_SYSTEM_PROMPT",
    "ApprovalStatus",
    "ImprovementArtifactVersion",
    "ImprovementCheckpointRecord",
    "ImprovementCollector",
    "ImprovementEvidence",
    "ImprovementHistoryCause",
    "ImprovementProposal",
    "ImprovementProposalArtifact",
    "ImprovementProposalCategory",
    "ImprovementRollbackPreview",
    "ImprovementRollbackResult",
    "ImprovementRollbackService",
    "RiskLevel",
    "RunType",
    "approved_proposals",
    "build_improver_todo",
    "complete_improvement_run",
    "latest_artifact_version",
    "latest_improvement_artifact",
    "list_artifact_versions",
    "list_improvement_artifacts",
    "list_improvement_artifact_ids",
    "load_artifact_version",
    "load_improvement_artifact",
    "prepare_improvement_run",
    "save_improvement_artifact",
    "set_proposal_status",
    "validate_artifact",
]
