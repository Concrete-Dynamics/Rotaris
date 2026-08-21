from __future__ import annotations

import datetime as dt

from rotaris_core.cost import CostSnapshot, CostSource, format_cost
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import (
    SESSION_SCHEMA_VERSION,
    AgentMetrics,
    SessionState,
)


@verifies(SWR.SWR_910, SWR.SWR_918, SWR.SWR_1024, SWR.SWR_1025, SWR.SWR_1026)
def test_session_state_defaults() -> None:
    now = dt.datetime.now(dt.UTC)

    state = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    )

    assert state.schema_version == SESSION_SCHEMA_VERSION
    assert state.execution_status == "idle"
    assert state.config_snapshot == {}
    assert state.transcript_events == []
    assert state.ui_edit_diffs == []
    assert state.child_states == []
    assert state.report_artifacts == []
    assert state.todo_state is None
    assert state.ralph_progress is None
    assert state.exhausted_provider_models == []
    assert state.message_count == 0
    assert state.message_limit is None
    assert state.wait_state is None


@verifies(SWR.SWR_910, SWR.SWR_918, SWR.SWR_1025, SWR.SWR_1026)
def test_session_state_serialization_roundtrip() -> None:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-serialize",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    )
    state.message_count = 7
    state.message_limit = 10

    restored = SessionState.model_validate_json(state.model_dump_json())

    assert restored == state
    assert restored.message_count == 7
    assert restored.message_limit == 10


@verifies(SWR.SWR_3612)
def test_a_snapshot_written_before_requirement_runs_still_loads() -> None:
    """The migration mechanism for the SWR-3612 attribution is the Pydantic default.

    No schema bump: a payload from a Rotaris that had never heard of requirement
    execution must load, and must read as "no requirement started this" rather
    than as missing data. That is why the fields are ``str`` defaulting to empty
    and not ``str | None``.
    """
    now = dt.datetime.now(dt.UTC)
    old_payload = SessionState(
        session_id="session-before-requirements",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    ).model_dump(mode="json")
    del old_payload["requirement_id"]
    del old_payload["unit_id"]

    restored = SessionState.model_validate(old_payload)

    assert restored.requirement_id == ""
    assert restored.unit_id == ""
    assert restored.schema_version == SESSION_SCHEMA_VERSION


@verifies(SWR.SWR_3612)
def test_the_requirement_attribution_survives_a_round_trip() -> None:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-req",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        requirement_id="SWR-3412",
        unit_id="unit-2",
    )

    restored = SessionState.model_validate_json(state.model_dump_json())

    assert restored.requirement_id == "SWR-3412"
    assert restored.unit_id == "unit-2"


@verifies(SWR.SWR_1024, SWR.SWR_1025, SWR.SWR_1028)
def test_session_state_with_populated_fields() -> None:
    now = dt.datetime.now(dt.UTC)

    state = SessionState(
        session_id="session-populated",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        config_snapshot={"default_persona": "orchestrator"},
        transcript_events=[{"role": "user", "content": "hello"}],
        ui_edit_diffs=[{"diff_id": "d1", "path": "sample.txt"}],
        child_states=[{"name": "child-a", "state": "queued"}],
        report_artifacts=[{"agent_name": "child-a", "status": "succeeded"}],
        todo_state={"phases": []},
        ralph_progress={"session_id": "session-populated", "iterations": []},
        execution_status="running",
    )

    dumped = state.model_dump(mode="json")

    assert dumped["config_snapshot"] == {"default_persona": "orchestrator"}
    assert dumped["transcript_events"] == [{"role": "user", "content": "hello"}]
    assert dumped["ui_edit_diffs"] == [{"diff_id": "d1", "path": "sample.txt"}]
    assert dumped["child_states"] == [{"name": "child-a", "state": "queued"}]
    assert dumped["report_artifacts"] == [{"agent_name": "child-a", "status": "succeeded"}]
    assert dumped["todo_state"] == {"phases": []}
    assert dumped["ralph_progress"] == {
        "session_id": "session-populated",
        "iterations": [],
    }
    assert dumped["execution_status"] == "running"


@verifies(SWR.SWR_1025, SWR.SWR_1026)
def test_session_state_datetime_fields_roundtrip_as_utc_strings() -> None:
    now = dt.datetime.now(dt.UTC).replace(microsecond=0)
    state = SessionState(
        session_id="session-dates",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    )

    payload = state.model_dump(mode="json")

    assert payload["created_at"].endswith("Z")
    assert payload["updated_at"].endswith("Z")


@verifies(SWR.SWR_1025)
def test_schema_version_constant_value() -> None:
    assert SESSION_SCHEMA_VERSION == 1


@verifies(SWR.SWR_835)
def test_session_state_cost_survives_serialization_roundtrip() -> None:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-cost",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        global_cost=CostSnapshot(
            accumulated_cost=0.125,
            priced_calls=4,
            unpriced_calls=1,
            source=CostSource.MIXED,
        ),
        agent_metrics={
            "agent-a": AgentMetrics(
                cost=CostSnapshot(
                    accumulated_cost=0.125, priced_calls=4, source=CostSource.CONFIGURED
                )
            )
        },
    )

    restored = SessionState.model_validate(state.model_dump(mode="json"))

    assert restored.global_cost.accumulated_cost == 0.125
    assert restored.global_cost.source is CostSource.MIXED
    assert restored.agent_metrics["agent-a"].cost.source is CostSource.CONFIGURED


@verifies(SWR.SWR_835, SWR.SWR_841)
def test_pre_cost_snapshot_still_loads_and_reads_as_unavailable() -> None:
    """Snapshots written before cost telemetry must load, and an absent cost
    must not read as a free run."""
    now = dt.datetime.now(dt.UTC).isoformat()
    legacy = {
        "schema_version": SESSION_SCHEMA_VERSION,
        "session_id": "legacy",
        "workspace_root": "/tmp/workspace",
        "created_at": now,
        "updated_at": now,
        "agent_metrics": {"agent-a": {"tool_call_count": 2}},
    }

    state = SessionState.model_validate(legacy)

    assert state.global_cost == CostSnapshot()
    assert state.global_cost.source is CostSource.UNAVAILABLE
    assert state.agent_metrics["agent-a"].cost == CostSnapshot()
    assert format_cost(state.global_cost) == "—"
