"""Requirement sources and the canonical requirement model (epic SWR-3100).

The public surface every later slice imports from. Everything here is pure
in-memory domain code — model, hashing, relations, the adapter seam — so
importing it costs no filesystem access and no SDK import.

```python
from rotaris_core.requirements import CanonicalRequirement, build_hierarchy
from rotaris_core.requirements.sources import BaseRequirementSource
```

Concrete sources live under :mod:`rotaris_core.requirements.sources`; delivery
state (SWR-3200) is layered beside the model, never inside it.
"""

from __future__ import annotations

from rotaris_core.requirements.hashing import (
    HASH_ALGORITHM,
    HASH_LENGTH,
    canonical_payload,
    content_hash,
    normalize_block,
    normalize_inline,
    normalize_line_endings,
    requirement_hash,
)
from rotaris_core.requirements.model import (
    DECLARED_RELATION_KINDS,
    DELIVERY_FIELD_NAMES,
    ENFORCED_RELATION_KINDS,
    FULL_CAPABILITIES,
    READ_ONLY,
    CanonicalRequirement,
    HierarchyIssue,
    HierarchyIssueKind,
    Relation,
    RelationKind,
    RequirementHierarchy,
    RequirementLifecycle,
    RequirementType,
    SortKey,
    SourceCapabilities,
    SourceCapability,
    build_hierarchy,
    requirement_sort_key,
)
from rotaris_core.requirements.relations import (
    REVERSE_FIELD_NAMES,
    REVERSE_OF,
    RelationEdge,
    RelationGraph,
    RelationIssue,
    RelationIssueKind,
    ReverseEdge,
    ReverseRelationKind,
    build_relation_graph,
    is_reverse_field,
    reverse_kind,
    strip_reverse_fields,
)

__all__ = [
    "DECLARED_RELATION_KINDS",
    "DELIVERY_FIELD_NAMES",
    "ENFORCED_RELATION_KINDS",
    "FULL_CAPABILITIES",
    "HASH_ALGORITHM",
    "HASH_LENGTH",
    "READ_ONLY",
    "REVERSE_FIELD_NAMES",
    "REVERSE_OF",
    "CanonicalRequirement",
    "HierarchyIssue",
    "HierarchyIssueKind",
    "Relation",
    "RelationEdge",
    "RelationGraph",
    "RelationIssue",
    "RelationIssueKind",
    "RelationKind",
    "RequirementHierarchy",
    "RequirementLifecycle",
    "RequirementType",
    "ReverseEdge",
    "ReverseRelationKind",
    "SortKey",
    "SourceCapabilities",
    "SourceCapability",
    "build_hierarchy",
    "build_relation_graph",
    "canonical_payload",
    "content_hash",
    "is_reverse_field",
    "normalize_block",
    "normalize_inline",
    "normalize_line_endings",
    "requirement_hash",
    "requirement_sort_key",
    "reverse_kind",
    "strip_reverse_fields",
]
