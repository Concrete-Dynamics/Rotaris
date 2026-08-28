"""Productive use: a user starts a long task and watches it for its whole length.
Expected outcome: the transcript, the todos and the agent tree keep up from the
first row to the four-hundredth, the list stays a list the user can read rather
than one that blanks and rebuilds, and reopening the session afterwards shows
what was on screen while it ran.

This is SWR-2454 at the product boundary. The unit tests next door assert the
delta is small and the model touches what changed; those are properties of the
seam. This one asserts the thing the user actually has: a long run they can
follow, and a session that agrees afterwards with what they saw.

The run is held open on purpose. Every assertion below runs while the loop is
still going, because the interesting failure mode — a view that only catches up
when the run ends — passes any test that waits for the end first.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.transcript import resolve_transcript_recorder
from run_wiring import (
    action_event,
    demo_config,
    feed_conversation,
    message_event,
    observation_event,
    sdk_events,
)

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge
from rotaris.views.transcript import TranscriptListView, group_tool_runs

pytestmark = pytest.mark.e2e

#: Long enough that anything costing the whole session per row would be visible
#: in the runtime, short enough to stay a test. The unit tests carry the 3000-row
#: ladder; this one is about the flow, not the curve.
ROWS = 400

#: The last index that produces a *message* rather than a tool call — what the
#: "the run has got this far" wait looks for.
_LAST_MESSAGE = (ROWS - 1) - (ROWS - 1) % 5


def _todo(completed: int) -> SimpleNamespace:
    """A todo list with *completed* of its three tasks done, as the executor holds it."""
    payload = {
        "phases": [
            {
                "id": "phase-1",
                "name": "Work the task",
                "tasks": [
                    {
                        "id": f"task-{index}",
                        "name": f"step {index}",
                        "status": "COMPLETED" if index < completed else "PENDING",
                    }
                    for index in range(3)
                ],
            }
        ]
    }
    return SimpleNamespace(model_dump=lambda *, mode: payload)


def _child(state: str = "running") -> SimpleNamespace:
    payload = {
        "canonical_name": "coder-1",
        "persona": "coder",
        "state": state,
        "parent_agent_id": "orchestrator",
    }
    return SimpleNamespace(
        canonical_name="coder-1", persona="coder", model_dump=lambda *, mode: payload
    )


def _long_run_task(sdk, released: asyncio.Event):
    """A run that says ROWS things, reports a child and its todos, then waits."""

    async def fake_run_task(
        prompt,
        config,
        manager,
        state,
        max_iterations,
        interrupt_handler=None,
        iteration_observer=None,
        delegation_strategy=None,
        **_lifecycle_kwargs,
    ):
        scheduler = SimpleNamespace(
            _conversation_event_callback=None,
            _conversation_token_callback=None,
            _spawn_notification_callback=None,
            _stall_callback=None,
        )
        iteration_observer.bind_ralph_loop(SimpleNamespace(scheduler=scheduler))
        child_manager = SimpleNamespace(snapshot_children=lambda: [_child()])
        iteration_observer.bind_scheduler_callbacks(child_manager)
        record = SimpleNamespace(canonical_name="coder-1", persona="coder")
        # The engine's half of the seam: the run records what was said, through
        # the session's own recorder rather than a host-installed callback.
        resolve_transcript_recorder(state.session_id).record_user(prompt)
        iteration_observer.on_child_created(record, child_manager, _todo(completed=0))

        for index in range(ROWS):
            if index % 5:
                # Runs of same-family tool calls, so the grouping the view has
                # switched on has something to group. Four in a row, then a
                # message to end the run — the shape a real agent produces.
                action = action_event(sdk, call_id=f"call-{index}", command=f"read {index}")
                feed_conversation(state, record, action, observation_event(sdk, action))
            else:
                feed_conversation(state, record, message_event(sdk, f"step {index}"))
            if index == ROWS // 2:
                iteration_observer.on_todo_state(_todo(completed=2))
            # Yield so the callbacks queued above run, and so a watcher gets its
            # deltas while the loop is working rather than in one burst at the end.
            await asyncio.sleep(0)

        # Held open: what this test asks about is a run in flight.
        await asyncio.wait_for(released.wait(), timeout=60)
        return SimpleNamespace(iterations=[])

    return fake_run_task


def _service(tmp_path, store: WorkspaceStore) -> ConfigService:
    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    service.session_manager = SessionManager(tmp_path)
    return service


@verifies(SWR.SWR_2454)
def test_a_user_follows_a_long_run_and_reopens_it_to_what_they_saw(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: the user watches a long task and comes back to it later.
    Expected outcome: rows, todos and agents arrive throughout; the list never
    resets under them; and the reopened session holds what they were shown."""
    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    released = asyncio.Event()
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _long_run_task(sdk, released))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    # The real view, and the real wiring: the whole-list path and the delta
    # path, both ending at one model, exactly as `views/workspace.py` connects
    # them — and with **tool grouping on**, which is what ships
    # (`main_window.py`, `display/groupToolCalls` defaults to True) and what
    # every other SWR-2454 test left off.
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_group_tools_getter(lambda: True)
    model = view.transcript_model
    store.transcript_changed.connect(lambda: view.set_events(list(store.transcript)))
    store.transcript_delta.connect(
        lambda first, rows: (
            view.apply_events_delta(first, list(rows)) or view.set_events(list(store.transcript))
        )
    )

    # Every publication the store makes, recorded as it happens. "Rows kept
    # arriving" is a statement about a *sequence*, and sampling the transcript
    # twice cannot make it: the transcript is a capped buffer and the run can
    # outrun the test, so under load the first sample already holds everything
    # the second one would -- the assertion then reads as "nothing arrived" on a
    # run that in fact delivered the lot. Recording each publication instead says
    # what the user saw arrive, at any speed.
    published: list[frozenset[str]] = []

    def record(*_args: object) -> None:
        published.append(frozenset(event.text for event in store.transcript))

    store.transcript_changed.connect(record)
    store.transcript_delta.connect(record)

    session_ids: list[str] = []
    bridge = RunBridge(tmp_path, store, service)
    bridge.run_started.connect(session_ids.append)
    try:
        with qtbot.waitSignal(bridge.run_started, timeout=15_000):
            assert bridge.start("keep working until it is done") is True

        # Early: the user is already being shown something.
        qtbot.waitUntil(lambda: len(store.transcript) > 1, timeout=15_000)
        early_ops = dict(model.operation_counts)

        # Late: the last thing the run said is on screen, and the run is still going.
        qtbot.waitUntil(
            lambda: any(f"step {_LAST_MESSAGE}" in event.text for event in store.transcript),
            timeout=60_000,
        )

        assert bridge.running, "every assertion here is about a run that has not ended"
        assert len(published) > 1, "the whole run reached the user in one publication"
        assert set().union(*published) - published[0], (
            "nothing arrived after the first rows the user was shown"
        )
        # The other live surfaces, on their own channel and equally current.
        assert [agent.id for agent in store.agent_list()] == ["coder-1"]
        assert [todo.status for todo in store.todos] == ["done", "done", "open"]
        # Grouping is on, so the view holds fewer rows than the session does —
        # and exactly the ones grouping says it should. Checked against
        # `group_tool_runs` rather than a number, so this cannot drift from it.
        assert model.rowCount() < len(store.transcript), "grouping never folded anything"
        assert [event.text for event in model.events] == [
            event.text
            for event in group_tool_runs(store.transcript, view.transcript_delegate.expanded_groups)
        ]
        # Readable throughout: rows were inserted, not rebuilt, and none of the
        # deltas was refused — a refusal is correct but costs a whole-list read.
        assert model.operation_counts["refused"] == 0
        assert model.operation_counts["reset"] == early_ops["reset"]
        watched = [(event.role, event.text) for event in store.transcript]
    finally:
        released.set()
        qtbot.waitUntil(lambda: not bridge.running, timeout=30_000)
        bridge.shutdown()

    # And the session agrees. Reopened from disk by a second service over the
    # same workspace — the path a user takes when they come back to it.
    reopened = WorkspaceStore()
    _service(tmp_path, reopened).load_session(session_ids[0])
    restored = [(event.role, event.text) for event in reopened.transcript]

    assert restored[: len(watched)] == watched, "a row was shown that the session did not keep"
