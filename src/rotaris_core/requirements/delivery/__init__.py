"""Requirement delivery state, satisfaction and persistence (epic SWR-3200).

The second axis of a requirement. :mod:`rotaris_core.requirements` answers *what
the specification says*; this package answers *where its implementation stands* —
and keeps the two apart, because collapsing them is what makes a board lie
(SWR-3202).

Four layers, each depending only on the one before it:

```text
state.py       DeliveryState, DeliveryStatus, DeliveryView   SWR-3201, SWR-3202
satisfied.py   SatisfiedDelivery, SatisfiedLog               SWR-3204
store.py       DeliveryRecord, DeliveryStore                 SWR-3205
transitions.py apply_transition, DeliveryTransitions         SWR-3203
```

and, above them, the derivations nobody stores — obligations (SWR-3206),
evidence (SWR-3207, SWR-3208), staleness (SWR-3209), health (SWR-3211), epic
progress (SWR-3212) and completion (SWR-3215) — which
:mod:`~rotaris_core.requirements.delivery.projection` assembles into the one
value every user interface reads.

Three doors, and no fourth:

- anything that **changes** a delivery state goes through
  :func:`~rotaris_core.requirements.delivery.transitions.apply_transition` — the
  system actor (SWR-3400) and the user actor (SWR-3600) have no other way in,
  ``Done`` is refused without a completion gate to check SWR-3215's conditions,
  and an epic is refused outright by
  :func:`~rotaris_core.requirements.delivery.epics.epic_transitions`, the
  hierarchy-bound writer;
- anything that **reads** one record goes through
  :class:`~rotaris_core.requirements.delivery.store.DeliveryStore`, which answers
  ``Backlog`` for a requirement it has never written about without writing a
  thing;
- anything that **shows** requirements goes through
  :class:`~rotaris_core.requirements.delivery.projection.BoardProjector`, which
  reads and never writes (SWR-3216).

```python
from rotaris_core.requirements.delivery import (
    BoardProjector,
    DeliveryStore,
    DeliveryTransitions,
)

store = DeliveryStore(workspace)
transitions = DeliveryTransitions(store, completion=completion_gate(read_evidence))
outcome = transitions.apply(request)
if not outcome.accepted and outcome.refusal is not None:
    print(outcome.refusal.message)  # names the unmet precondition

board = BoardProjector(registry.index, store).project()
print(board.counts())  # one number per delivery column
```
"""

from __future__ import annotations

from rotaris_core.requirements.delivery.adoption import (
    AdoptionCandidate,
    AdoptionOutcome,
    AdoptionReport,
    AdoptionResult,
    adopt,
    adoption_candidates,
    unjudged_adoption,
)
from rotaris_core.requirements.delivery.epics import (
    ChildProgress,
    EpicProgress,
    aggregate_epic,
    aggregate_epics,
    apply_epic_transition,
    epic_transitions,
    is_epic,
)
from rotaris_core.requirements.delivery.projection import (
    UNSET_COLUMN_LABELS,
    BlockerKind,
    BlockerOption,
    BlockerView,
    BoardAxis,
    BoardEntry,
    BoardInputs,
    BoardProjection,
    BoardProjector,
    CheckOutcome,
    CoverageEvidence,
    DetailReader,
    EvidenceReader,
    ExecutionReader,
    ExecutionSummary,
    ExecutionUnitView,
    IntegrationView,
    NoDetails,
    NoEvidence,
    NoExecution,
    QueueEntryView,
    QueueView,
    RelationsView,
    RequirementPriority,
    ReviewView,
    RunOutcome,
    RunSnapshotView,
    RunView,
    StoredDetails,
    UnitState,
    UnresolvedRelation,
    WorkspaceEvidence,
    axis_column_keys,
    project_board,
    read_priority,
)
from rotaris_core.requirements.delivery.satisfied import (
    DeliveryOrigin,
    DeliverySnapshot,
    SatisfactionState,
    SatisfiedDelivery,
    SatisfiedLog,
)
from rotaris_core.requirements.delivery.state import (
    DEFAULT_DELIVERY_STATE,
    ActorKind,
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    DeliveryView,
    TransitionCause,
    UnknownDeliveryState,
    parse_delivery_state,
    read_delivery_state,
)
from rotaris_core.requirements.delivery.store import (
    DELIVERY_SCHEMA_VERSION,
    DELIVERY_SUBDIRNAME,
    DeliveryIndex,
    DeliveryLockTimeoutError,
    DeliveryRead,
    DeliveryRecord,
    DeliveryStore,
    DeliveryStoreError,
    FutureRecordError,
    RecordNotice,
    RecordNoticeKind,
    assert_no_requirement_content,
    blank_index,
    record_filename,
)
from rotaris_core.requirements.delivery.transitions import (
    ADOPTION_TRANSITIONS,
    LEGAL_TRANSITIONS,
    CompletionGate,
    DeliveryTransitions,
    RefusalKind,
    TransitionOutcome,
    TransitionRecord,
    TransitionRefusal,
    TransitionRequest,
    UnmetCondition,
    allowed_targets,
    apply_transition,
    is_legal,
    permitted_actors,
    resume_target,
)
from rotaris_core.requirements.delivery.verification import (
    VERIFICATION_SCHEMA_VERSION,
    VERIFICATION_SUBDIRNAME,
    RequirementVerification,
    VerificationIndex,
    VerificationNotice,
    VerificationNoticeKind,
    VerificationOrigin,
    VerificationRead,
    VerificationStore,
    VerificationStoreError,
    verifications_by_id,
)

__all__ = [
    "ADOPTION_TRANSITIONS",
    "ActorKind",
    "AdoptionCandidate",
    "AdoptionOutcome",
    "AdoptionReport",
    "AdoptionResult",
    "BlockerKind",
    "BlockerOption",
    "BlockerView",
    "BoardAxis",
    "BoardEntry",
    "BoardInputs",
    "BoardProjection",
    "BoardProjector",
    "CheckOutcome",
    "ChildProgress",
    "CompletionGate",
    "CoverageEvidence",
    "DEFAULT_DELIVERY_STATE",
    "DELIVERY_SCHEMA_VERSION",
    "DELIVERY_SUBDIRNAME",
    "DeliveryActor",
    "DeliveryIndex",
    "DeliveryLockTimeoutError",
    "DeliveryOrigin",
    "DeliveryRead",
    "DeliveryRecord",
    "DeliverySnapshot",
    "DeliveryState",
    "DeliveryStatus",
    "DeliveryStore",
    "DeliveryStoreError",
    "DeliveryTransitions",
    "DeliveryView",
    "DetailReader",
    "EpicProgress",
    "EvidenceReader",
    "ExecutionReader",
    "ExecutionSummary",
    "ExecutionUnitView",
    "FutureRecordError",
    "IntegrationView",
    "LEGAL_TRANSITIONS",
    "NoDetails",
    "NoEvidence",
    "NoExecution",
    "QueueEntryView",
    "QueueView",
    "RecordNotice",
    "RecordNoticeKind",
    "RefusalKind",
    "RelationsView",
    "RequirementPriority",
    "RequirementVerification",
    "ReviewView",
    "RunOutcome",
    "RunSnapshotView",
    "RunView",
    "SatisfactionState",
    "SatisfiedDelivery",
    "SatisfiedLog",
    "StoredDetails",
    "TransitionCause",
    "TransitionOutcome",
    "TransitionRecord",
    "TransitionRefusal",
    "TransitionRequest",
    "UNSET_COLUMN_LABELS",
    "UnitState",
    "UnknownDeliveryState",
    "UnmetCondition",
    "UnresolvedRelation",
    "VERIFICATION_SCHEMA_VERSION",
    "VERIFICATION_SUBDIRNAME",
    "VerificationIndex",
    "VerificationNotice",
    "VerificationNoticeKind",
    "VerificationOrigin",
    "VerificationRead",
    "VerificationStore",
    "VerificationStoreError",
    "WorkspaceEvidence",
    "adopt",
    "adoption_candidates",
    "axis_column_keys",
    "aggregate_epic",
    "aggregate_epics",
    "allowed_targets",
    "apply_epic_transition",
    "apply_transition",
    "assert_no_requirement_content",
    "blank_index",
    "epic_transitions",
    "is_epic",
    "is_legal",
    "parse_delivery_state",
    "permitted_actors",
    "project_board",
    "read_delivery_state",
    "read_priority",
    "record_filename",
    "resume_target",
    "unjudged_adoption",
    "verifications_by_id",
]
