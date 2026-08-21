"""Requirement change propagation (epic SWR-3500).

The loop closes here. Slice 1 said what a requirement *is*, slice 2 said where
its implementation *stands*, slice 4 *built* it — and this package is what
happens when the requirement then changes, which is the thing every requirement
tool in existence handles by doing nothing.

Three layers, each depending only on the one before it:

```text
records.py    AnalysisRecord, AnalysisLog, AnalysisRecordStore   SWR-3514
detection.py  classify_changes, SourceChangeDetector             SWR-3501
              assess_specification, NeedsUpdatePass              SWR-3502
impact.py     ImpactRequest, ImpactAnalyzer, ImpactOutcome       SWR-3503
removal.py    RemovalAnalyzer, DanglingDependent, RemovalImpact  SWR-3509
```

The order is the order of trust. Detection is arithmetic over hashes and cannot
be wrong about *whether* something moved. Impact analysis is a model's judgement
about *what* moving means, and is therefore the only part that needs a record
proving how it decided — which is why :mod:`~rotaris_core.requirements.change.records`
sits underneath it rather than beside it.

```python
from rotaris_core.requirements.change import (
    ImpactAnalyzer,
    NeedsUpdatePass,
    RequirementBaseline,
    SourceChangeDetector,
)

detector = SourceChangeDetector()
result = detector.detect(source, baseline)          # skips the read if nothing moved
for change in result.changes.of_kind(ChangeKind.MODIFIED):
    ...                                             # analyse, then act

pass_ = NeedsUpdatePass(transitions, audit=audit_store)
pass_.run(records, hashes, at=now)                  # Done → Needs Update, recorded
```

Nothing in this package writes to a requirement source, to code or to tests. The
detector reads; the impact analyser is handed values and holds no writable
collaborator at all (:func:`~rotaris_core.requirements.change.impact.read_only_report`);
the only writes are Rotaris' own — a delivery transition through the state
machine (SWR-3203) and an appended analysis record.
"""

from __future__ import annotations

from rotaris_core.requirements.change.detection import (
    DEFAULT_DRIFT_LIFECYCLES,
    SPECIFICATION_ACTOR,
    AuditSink,
    BaselineEntry,
    ChangeKind,
    ChangeSet,
    DetectionResult,
    NeedsUpdateOutcome,
    NeedsUpdatePass,
    PropagationLoopError,
    ReentrancyGuard,
    RequirementBaseline,
    RequirementChange,
    SourceChangeDetector,
    SpecificationAssessment,
    SpecificationVerdict,
    TransitionDoor,
    assess_specification,
    classify_changes,
)
from rotaris_core.requirements.change.impact import (
    RULE_DECIDER,
    RULE_PERSONA,
    WRITE_OPERATIONS,
    ImpactAnalysis,
    ImpactAnalyzer,
    ImpactFailure,
    ImpactFailureKind,
    ImpactModel,
    ImpactOutcome,
    ImpactRequest,
    ProposedVerdict,
    RequirementVersion,
    read_only_report,
    read_verdict,
    version_diff,
)
from rotaris_core.requirements.change.records import (
    ANALYSIS_SCHEMA_VERSION,
    ANALYSIS_SUBDIRNAME,
    AnalysisInputs,
    AnalysisKind,
    AnalysisLog,
    AnalysisNotice,
    AnalysisNoticeKind,
    AnalysisRead,
    AnalysisRecord,
    AnalysisRecordStore,
    analysis_filename,
    analysis_record_id,
    diff_digest,
)
from rotaris_core.requirements.change.removal import (
    DanglingDependent,
    RemovalAnalyzer,
    RemovalImpact,
    RemovalLedger,
    analyse_removal,
    dangling_dependents,
)

__all__ = [
    "ANALYSIS_SCHEMA_VERSION",
    "ANALYSIS_SUBDIRNAME",
    "DEFAULT_DRIFT_LIFECYCLES",
    "RULE_DECIDER",
    "RULE_PERSONA",
    "SPECIFICATION_ACTOR",
    "WRITE_OPERATIONS",
    "AnalysisInputs",
    "AnalysisKind",
    "AnalysisLog",
    "AnalysisNotice",
    "AnalysisNoticeKind",
    "AnalysisRead",
    "AnalysisRecord",
    "AnalysisRecordStore",
    "AuditSink",
    "BaselineEntry",
    "ChangeKind",
    "ChangeSet",
    "DanglingDependent",
    "DetectionResult",
    "ImpactAnalysis",
    "ImpactAnalyzer",
    "ImpactFailure",
    "ImpactFailureKind",
    "ImpactModel",
    "ImpactOutcome",
    "ImpactRequest",
    "NeedsUpdateOutcome",
    "NeedsUpdatePass",
    "PropagationLoopError",
    "ProposedVerdict",
    "ReentrancyGuard",
    "RemovalAnalyzer",
    "RemovalImpact",
    "RemovalLedger",
    "RequirementBaseline",
    "RequirementChange",
    "RequirementVersion",
    "SourceChangeDetector",
    "SpecificationAssessment",
    "SpecificationVerdict",
    "TransitionDoor",
    "analysis_filename",
    "analyse_removal",
    "analysis_record_id",
    "assess_specification",
    "classify_changes",
    "dangling_dependents",
    "diff_digest",
    "read_only_report",
    "read_verdict",
    "version_diff",
]
