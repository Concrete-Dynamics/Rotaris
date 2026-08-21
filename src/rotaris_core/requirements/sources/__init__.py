"""Requirement source adapters (SWR-3102).

:mod:`~rotaris_core.requirements.sources.base` holds the interface, the
capability model and the shared helpers every adapter needs. Concrete adapters —
the built-in ReqToCode source (SWR-3103), the declarative source (SWR-3104) —
live beside it and are reached through the registry (SWR-3115), never imported
by name from consuming code.
"""

from __future__ import annotations

from rotaris_core.requirements.sources.base import (
    FULL_CAPABILITIES,
    READ_ONLY,
    BaseRequirementSource,
    HistoricalRequirementSource,
    RequirementArtifact,
    RequirementDraft,
    RequirementEdit,
    RequirementSource,
    RequirementSourceError,
    SourceCapabilities,
    SourceCapability,
    SourceFailure,
    SourceHistoryUnavailable,
    SourceIssue,
    SourceRead,
    UnsupportedOperation,
    WritableRequirementSource,
    WriteRefusal,
    history_of,
    refusal_for,
    require_capability,
    supports,
)

__all__ = [
    "FULL_CAPABILITIES",
    "READ_ONLY",
    "BaseRequirementSource",
    "HistoricalRequirementSource",
    "RequirementArtifact",
    "RequirementDraft",
    "RequirementEdit",
    "RequirementSource",
    "RequirementSourceError",
    "SourceCapabilities",
    "SourceCapability",
    "SourceFailure",
    "SourceHistoryUnavailable",
    "SourceIssue",
    "SourceRead",
    "UnsupportedOperation",
    "WritableRequirementSource",
    "WriteRefusal",
    "history_of",
    "refusal_for",
    "require_capability",
    "supports",
]
