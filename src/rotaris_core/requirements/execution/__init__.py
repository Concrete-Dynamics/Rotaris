"""Requirement execution — units, snapshots, the completion contract, the run seam.

The third axis of a requirement. :mod:`rotaris_core.requirements` answers *what
the specification says* and :mod:`rotaris_core.requirements.delivery` answers
*where its implementation stands*; this package answers *how the work actually
gets done*, and keeps all three apart:

```text
units.py      ExecutionUnit, RequirementUnits         SWR-3401
snapshot.py   RunSnapshot, SpecificationDrift         SWR-3402, SWR-3403
contract.py   AgentClaim, RunnerMeasurements          SWR-3408
run_seam.py   RequirementRunSeam, IsolationRequest    SWR-3416
store.py      UnitStore, IntegrationLog               SWR-3401, SWR-3409
reader.py     WorkspaceExecution                      SWR-3216
```

The last two are what makes the rest of it visible. Everything above computes
inside one process; :mod:`.store` is where the unit set and the integration
attempts land, and :mod:`.reader` is the
:class:`~rotaris_core.requirements.delivery.projection.ExecutionReader` the
board reads them back through — the only object outside this package that any
consumer of execution data needs.

Four rules hold across the package, and each is the reason one of the modules
exists at all:

- **A requirement is not a work item.** Units are Rotaris' own artefacts; nothing
  here writes to a requirement source or changes a requirement's identity or
  hash (SWR-3401).
- **A run works against a snapshot.** The specification version is captured once,
  at the start, and everything the run is judged against comes from that capture
  (SWR-3402) — including the refusal to reach ``Done`` when the requirement moved
  underneath it (SWR-3403).
- **"The model stopped" is not "the unit is complete".** The fields that assert
  execution and verification are the runner's and are structurally unreachable
  from model output (SWR-3408).
- **No Qt.** Runs are launched through an engine seam, so the scheduler, the
  headless CLI and the tests can all start one; the desktop coordinator is one
  consumer of it, not its owner (SWR-3416).

Delivery state still moves in exactly one place —
:func:`~rotaris_core.requirements.delivery.transitions.apply_transition` — and
this package reaches it the way every other actor does: by building a
:class:`~rotaris_core.requirements.delivery.transitions.TransitionRequest`
(:func:`~rotaris_core.requirements.execution.snapshot.completion_transition`) and
by supplying completion gates
(:func:`~rotaris_core.requirements.execution.snapshot.specification_guard`,
:func:`~rotaris_core.requirements.execution.contract.contract_gate`).
:class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions` is
that composition, ready-made and the only writer
:class:`~rotaris_core.requirements.execution.flow.RequirementFlow` accepts — so a
composition root cannot assemble a run that has lost SWR-3403's refusal or
SWR-3213's trail.

```python
from rotaris_core.requirements.execution import (
    RequirementRunSeam,
    UnitSpec,
    capture_snapshot,
    plan_units,
    unit_isolation,
)

units = plan_units("SWR-3401", [UnitSpec(key="impl"), UnitSpec(key="tests", depends_on=("impl",))])
unit = units.units[0]
snapshot = capture_snapshot(requirement, run_id="run-1", base_commit=head, at=now)
result = RequirementRunSeam(isolation=isolation, host=host).start(
    snapshot=snapshot,
    isolation_request=unit_isolation(unit.req_id, unit.unit_id, run_id=snapshot.run_id),
)
print(result.outcome, result.to_view().branch)
```
"""

from __future__ import annotations

from rotaris_core.requirements.execution.contract import (
    COMPLETION_CONDITIONS,
    RUNNER_OWNED_FIELDS,
    AgentClaim,
    CheckLike,
    ClaimIntake,
    CompletionCondition,
    CompletionResult,
    RunnerMeasurements,
    check_outcomes,
    contract_gate,
    parse_agent_claim,
    seal_completion,
)
from rotaris_core.requirements.execution.reader import WorkspaceExecution
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    REQUIREMENT_WORKTREE_SUBPATH,
    GitIsolation,
    IsolationError,
    IsolationProvider,
    IsolationRequest,
    RequirementRunSeam,
    RunEvent,
    RunHost,
    RunPhase,
    RunReport,
    RunResult,
    RunWorkspace,
    UnitLaunch,
    unit_branch,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import (
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SUBDIRNAME,
    SPECIFICATION_CHANGED_CONDITION,
    SPECIFICATION_CHANGED_REASON,
    AuditWriter,
    ExecutionTransitions,
    RunSnapshot,
    SnapshotError,
    SnapshotStore,
    SpecificationDrift,
    capture_snapshot,
    completion_transition,
    detect_drift,
    review_for,
    specification_change_event,
    specification_diff,
    specification_guard,
)
from rotaris_core.requirements.execution.store import (
    INTEGRATION_LOG_SUBDIRNAME,
    UNIT_STORE_SCHEMA_VERSION,
    UNIT_STORE_SUBDIRNAME,
    IntegrationLog,
    UnitStore,
)
from rotaris_core.requirements.execution.units import (
    ExecutionUnit,
    RequirementUnits,
    UnitError,
    UnitSpec,
    mint_unit_id,
    plan_units,
    slug_token,
    units_for,
)

__all__ = [
    "COMPLETION_CONDITIONS",
    "INTEGRATION_LOG_SUBDIRNAME",
    "REQUIREMENT_BRANCH_PREFIX",
    "REQUIREMENT_WORKTREE_SUBPATH",
    "RUNNER_OWNED_FIELDS",
    "SNAPSHOT_SCHEMA_VERSION",
    "SNAPSHOT_SUBDIRNAME",
    "SPECIFICATION_CHANGED_CONDITION",
    "SPECIFICATION_CHANGED_REASON",
    "UNIT_STORE_SCHEMA_VERSION",
    "UNIT_STORE_SUBDIRNAME",
    "AgentClaim",
    "AuditWriter",
    "CheckLike",
    "ClaimIntake",
    "CompletionCondition",
    "CompletionResult",
    "ExecutionTransitions",
    "ExecutionUnit",
    "GitIsolation",
    "IntegrationLog",
    "IsolationError",
    "IsolationProvider",
    "IsolationRequest",
    "RequirementRunSeam",
    "RequirementUnits",
    "RunEvent",
    "RunHost",
    "RunPhase",
    "RunReport",
    "RunResult",
    "RunSnapshot",
    "RunWorkspace",
    "RunnerMeasurements",
    "SnapshotError",
    "SnapshotStore",
    "SpecificationDrift",
    "UnitError",
    "UnitLaunch",
    "UnitSpec",
    "UnitStore",
    "WorkspaceExecution",
    "capture_snapshot",
    "check_outcomes",
    "completion_transition",
    "contract_gate",
    "detect_drift",
    "mint_unit_id",
    "parse_agent_claim",
    "plan_units",
    "review_for",
    "seal_completion",
    "slug_token",
    "specification_change_event",
    "specification_diff",
    "specification_guard",
    "unit_branch",
    "unit_isolation",
    "units_for",
]
