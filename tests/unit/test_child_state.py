from datetime import UTC

import pytest

from rotaris_core.orchestrator.child_state import (
    VALID_TRANSITIONS,
    ChildTaskRecord,
    ChildTaskState,
)
from rotaris_core.reqtocode import SWR, verifies


def _make_record() -> ChildTaskRecord:
    return ChildTaskRecord(
        name="task",
        canonical_name="task.canonical",
        persona="tester",
        task_payload="do work",
    )


@verifies(SWR.SWR_112)
def test_child_task_state_values_are_strings() -> None:
    assert [state.value for state in ChildTaskState] == [
        "queued",
        "running",
        "waiting_on_dependencies",
        "waiting_on_model_slot",
        "succeeded",
        "failed",
        "cancelled",
        "blocked",
    ]
    assert all(isinstance(state.value, str) for state in ChildTaskState)


@verifies(SWR.SWR_112)
@pytest.mark.parametrize(
    ("state", "expected"),
    [
        (ChildTaskState.SUCCEEDED, True),
        (ChildTaskState.FAILED, True),
        (ChildTaskState.CANCELLED, True),
        (ChildTaskState.BLOCKED, True),
        (ChildTaskState.QUEUED, False),
        (ChildTaskState.RUNNING, False),
        (ChildTaskState.WAITING_ON_DEPENDENCIES, False),
        (ChildTaskState.WAITING_ON_MODEL_SLOT, False),
    ],
)
def test_is_terminal(state: ChildTaskState, expected: bool) -> None:
    assert state.is_terminal() is expected


@verifies(SWR.SWR_112)
def test_valid_transitions_cover_all_non_terminal_states() -> None:
    assert set(VALID_TRANSITIONS) == {
        ChildTaskState.QUEUED,
        ChildTaskState.WAITING_ON_DEPENDENCIES,
        ChildTaskState.WAITING_ON_MODEL_SLOT,
        ChildTaskState.RUNNING,
    }


@verifies(SWR.SWR_112)
def test_terminal_states_not_in_valid_transitions() -> None:
    for state in (
        ChildTaskState.SUCCEEDED,
        ChildTaskState.FAILED,
        ChildTaskState.CANCELLED,
        ChildTaskState.BLOCKED,
    ):
        assert state not in VALID_TRANSITIONS


@verifies(SWR.SWR_112)
@pytest.mark.parametrize(
    ("start", "next_state"),
    [
        (ChildTaskState.QUEUED, ChildTaskState.RUNNING),
        (ChildTaskState.QUEUED, ChildTaskState.WAITING_ON_DEPENDENCIES),
        (ChildTaskState.QUEUED, ChildTaskState.WAITING_ON_MODEL_SLOT),
        (ChildTaskState.QUEUED, ChildTaskState.CANCELLED),
        (ChildTaskState.QUEUED, ChildTaskState.BLOCKED),
        (ChildTaskState.WAITING_ON_DEPENDENCIES, ChildTaskState.QUEUED),
        (ChildTaskState.WAITING_ON_DEPENDENCIES, ChildTaskState.WAITING_ON_MODEL_SLOT),
        (ChildTaskState.WAITING_ON_DEPENDENCIES, ChildTaskState.BLOCKED),
        (ChildTaskState.WAITING_ON_DEPENDENCIES, ChildTaskState.CANCELLED),
        (ChildTaskState.WAITING_ON_MODEL_SLOT, ChildTaskState.QUEUED),
        (ChildTaskState.WAITING_ON_MODEL_SLOT, ChildTaskState.BLOCKED),
        (ChildTaskState.WAITING_ON_MODEL_SLOT, ChildTaskState.CANCELLED),
        (ChildTaskState.RUNNING, ChildTaskState.SUCCEEDED),
        (ChildTaskState.RUNNING, ChildTaskState.FAILED),
        (ChildTaskState.RUNNING, ChildTaskState.CANCELLED),
        (ChildTaskState.RUNNING, ChildTaskState.BLOCKED),
    ],
)
def test_transition_valid_edges(start: ChildTaskState, next_state: ChildTaskState) -> None:
    record = _make_record()
    record.state = start
    record.transition(next_state)
    assert record.state is next_state


@verifies(SWR.SWR_112)
@pytest.mark.parametrize(
    ("start", "next_state"),
    [
        (ChildTaskState.QUEUED, ChildTaskState.SUCCEEDED),
        (ChildTaskState.RUNNING, ChildTaskState.WAITING_ON_DEPENDENCIES),
        (ChildTaskState.RUNNING, ChildTaskState.QUEUED),
        (ChildTaskState.SUCCEEDED, ChildTaskState.QUEUED),
    ],
)
def test_transition_invalid_edges_raise(start: ChildTaskState, next_state: ChildTaskState) -> None:
    record = _make_record()
    record.state = start
    with pytest.raises(ValueError, match=r"Invalid transition:"):
        record.transition(next_state)


@verifies(SWR.SWR_112)
def test_transition_to_terminal_sets_completed_at() -> None:
    record = _make_record()
    record.state = ChildTaskState.RUNNING
    record.transition(ChildTaskState.FAILED)
    assert record.completed_at is not None
    assert record.completed_at.tzinfo == UTC


@verifies(SWR.SWR_112)
def test_default_state_and_model_dump() -> None:
    record = _make_record()
    assert record.state is ChildTaskState.QUEUED
    dumped = record.model_dump()
    assert dumped["state"] == ChildTaskState.QUEUED
    assert dumped["depends_on"] == []
    assert dumped["depth"] == 1
