"""Productive use: a user starts a task and watches it work.
Expected outcome: what the agent does appears on screen because the run said so,
not because a timer happened to look at the disk afterwards.

The decisive move in these tests is stopping the poll. Everything the desktop
showed before SWR-2454 came through it — the run wrote its state, the timer read
it back 750 ms later, and the whole session was re-derived to show one new line.
With the timer stopped there is exactly one way for a row to reach the store, so
if the row is there, the live channel delivered it.
"""

from __future__ import annotations

import asyncio
import math
import time
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

pytestmark = pytest.mark.integration

#: SWR-2454's budget: activity is visible within this many milliseconds of the
#: engine producing it, at the 95th percentile. The requirement calls the number
#: "the one to review" — it is a ceiling on the design, not a description of it,
#: and the recorded baseline below it is what a review would actually look at.
LATENCY_BUDGET_MS = 250.0

#: Rows measured per run: enough for a 95th percentile to mean something, few
#: enough that the test stays a test.
MEASURED_ROWS = 150

#: How many rows the session already holds before measuring starts. The budget
#: is claimed "on a session of any length", so it is measured at both ends: an
#: empty session and one carrying more than the 3000-row ladder's midpoint.
PRELOADED_LENGTHS = (0, 2000)

#: Marks the rows being timed, so arrivals can be matched to departures without
#: depending on transcript indices, which the projector is free to rearrange.
_MARK = "measured-row-"


def _percentile(values: list[float], fraction: float) -> float:
    """Nearest-rank percentile. Stdlib-only, and exact for the sizes here."""
    ordered = sorted(values)
    rank = max(1, math.ceil(fraction * len(ordered)))
    return ordered[rank - 1]


def _service(tmp_path, store: WorkspaceStore) -> ConfigService:
    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    service.session_manager = SessionManager(tmp_path)
    return service


def _streaming_run_task(sdk, released: asyncio.Event | None = None):
    """A run that reports three rows and then stays alive until told to stop."""

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
        iteration_observer.bind_scheduler_callbacks(SimpleNamespace(snapshot_children=list))
        record = SimpleNamespace(canonical_name="coder-1", persona="coder")
        action = action_event(sdk)
        # Everything a run records goes through the session's recorder, prompt
        # included: this fake stands in for the engine, so it does the engine's
        # half of the seam (SWR-2454).
        resolve_transcript_recorder(state.session_id).record_user(prompt)
        feed_conversation(
            state,
            record,
            action,
            observation_event(sdk, action),
            message_event(sdk, "Task complete."),
        )
        if released is not None:
            # Held open on purpose: the assertion is about what the user can see
            # *during* a run, and a run that has ended has had its final
            # whole-state read.
            await asyncio.wait_for(released.wait(), timeout=20)
        return SimpleNamespace(iterations=[])

    return fake_run_task


def _measuring_run_task(sdk, released: asyncio.Event, sent: dict[int, float], preloaded: int):
    """A run that stamps each row as it says it, on a session of a chosen length."""

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
        iteration_observer.bind_scheduler_callbacks(SimpleNamespace(snapshot_children=list))
        record = SimpleNamespace(canonical_name="coder-1", persona="coder")
        resolve_transcript_recorder(state.session_id).record_user(prompt)

        # Give the session its length in one go. Building it a row at a time
        # would measure the persister's deep copy of a growing state, which is
        # the durability layer's cost (SWR-2130) and not the one under test.
        for index in range(preloaded):
            iteration_observer._recorder._append(  # noqa: SLF001
                {"role": "assistant", "name": "coder", "content": f"earlier {index}"}
            )
        iteration_observer._touch()  # noqa: SLF001
        await asyncio.sleep(0)

        for index in range(MEASURED_ROWS):
            # Stamped immediately before the engine records it: everything after
            # this line is what the budget covers.
            sent[index] = time.perf_counter()
            feed_conversation(state, record, message_event(sdk, f"{_MARK}{index}"))
            await asyncio.sleep(0.001)

        await asyncio.wait_for(released.wait(), timeout=120)
        return SimpleNamespace(iterations=[])

    return fake_run_task


@verifies(SWR.SWR_2454)
@pytest.mark.serial
@pytest.mark.parametrize("preloaded", PRELOADED_LENGTHS)
def test_a_row_is_visible_within_the_budget_however_long_the_session_is(
    tmp_path, qtbot, monkeypatch, preloaded: int, record_property
) -> None:
    """Productive use: the agent is talking and the user is reading along.
    Expected outcome: what it says reaches the view inside the budget, and does
    so on the two-thousandth row as readily as on the first.

    This is the requirement's measured baseline. It prints and records the
    numbers rather than only gating on them: the budget is a ceiling to review,
    and there is no CI on this platform to notice it drifting.

    Marked ``serial`` because it is a *measurement*. Run after a few hundred
    other Qt tests in one process it reports a p95 of some hundreds of
    milliseconds against the same code that reports three on its own — the
    widgets they leave alive, and the garbage they leave to collect, are what
    it ends up timing. The budget belongs to the product, so it is measured
    where the product's conditions hold rather than loosened to survive a
    crowded process.
    """
    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    released = asyncio.Event()
    sent: dict[int, float] = {}
    arrived: dict[int, float] = {}
    monkeypatch.setattr(
        "rotaris_core.cli.background._run_task",
        _measuring_run_task(sdk, released, sent, preloaded),
    )
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    def stamp_arrival(_first: int, rows) -> None:  # noqa: ANN001
        now = time.perf_counter()
        for event in rows:
            if event.text.startswith(_MARK):
                arrived.setdefault(int(event.text[len(_MARK) :]), now)

    store.transcript_delta.connect(stamp_arrival)

    bridge = RunBridge(tmp_path, store, service)
    # The delta channel alone, so a measurement cannot be a poll that happened
    # to land: with the timer stopped there is one way for a row to arrive.
    bridge.run_started.connect(lambda _sid: bridge._poller.stop())
    try:
        with qtbot.waitSignal(bridge.run_started, timeout=15_000):
            assert bridge.start("narrate what you are doing") is True
        qtbot.waitUntil(lambda: len(arrived) == MEASURED_ROWS, timeout=120_000)
        assert bridge.running, "the measurement is of a run in flight"
    finally:
        released.set()
        qtbot.waitUntil(lambda: not bridge.running, timeout=30_000)
        bridge.shutdown()

    latencies = sorted((arrived[i] - sent[i]) * 1000.0 for i in range(MEASURED_ROWS))
    p95 = _percentile(latencies, 0.95)
    record_property("latency_p95_ms", round(p95, 3))
    record_property("latency_median_ms", round(_percentile(latencies, 0.5), 3))
    record_property("latency_max_ms", round(latencies[-1], 3))
    record_property("preloaded_rows", preloaded)
    print(  # noqa: T201 - the recorded baseline, printed so `-s` shows it
        f"[SWR-2454] {preloaded:>4} rows already held: "
        f"median {_percentile(latencies, 0.5):.1f} ms, "
        f"p95 {p95:.1f} ms, max {latencies[-1]:.1f} ms, n={MEASURED_ROWS}"
    )

    assert p95 < LATENCY_BUDGET_MS, f"p95 {p95:.1f} ms over the {LATENCY_BUDGET_MS:.0f} ms budget"


@verifies(SWR.SWR_2454)
def test_the_transcript_arrives_without_the_poll(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: the agent runs a command and reports back.
    Expected outcome: the rows are on screen while the run is still going, with
    the reconciling read switched off."""
    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    released = asyncio.Event()
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _streaming_run_task(sdk, released))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    # Stop the timer the moment it starts, so nothing this test sees can have
    # come from a snapshot read.
    bridge.run_started.connect(lambda _sid: bridge._poller.stop())
    try:
        with qtbot.waitSignal(bridge.run_started, timeout=15_000):
            assert bridge.start("run the tests") is True
        qtbot.waitUntil(
            lambda: any("Task complete." in event.text for event in store.transcript),
            timeout=10_000,
        )
        texts = "\n".join(f"{event.text} {event.detail}" for event in store.transcript)
        kinds = [event.kind for event in store.transcript]

        assert not bridge._poller.isActive()
        assert "run the tests" in texts
        assert "pytest -x -q" in texts
        assert "tool" in kinds
        # And the surfaces that are not the transcript (SWR-2130). These used to
        # arrive only through the snapshot read, which is why the desktop
        # shortened the persistence debounce to make that read frequent enough.
        assert store.session_status == "running"
        assert store.run_summary.tool_calls >= 0
    finally:
        released.set()
        qtbot.waitUntil(lambda: not bridge.running, timeout=15_000)
        bridge.shutdown()


@verifies(SWR.SWR_2130)
def test_the_run_does_not_shorten_the_persistence_debounce(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: a run writes its record as often as durability wants, not
    as often as a view wants. Expected outcome: the session manager the run
    builds carries the engine's own debounce window.

    The knob and the view are what SWR-2130 exists to separate; this asserts the
    separation rather than the comment describing it."""
    from rotaris_core.session.manager import SessionManager as Manager

    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    windows: list[float | None] = []
    original = Manager.__init__

    def recording_init(self, workspace, *args, **kwargs):  # noqa: ANN001, ANN202
        windows.append(kwargs.get("persist_debounce_seconds"))
        original(self, workspace, *args, **kwargs)

    monkeypatch.setattr(Manager, "__init__", recording_init)
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _streaming_run_task(sdk))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=15_000):
            assert bridge.start("run the tests") is True
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
    finally:
        bridge.shutdown()

    assert windows, "the run never built a session manager"
    assert all(window is None for window in windows), windows


@verifies(SWR.SWR_2454)
def test_the_final_read_owns_the_transcript_once_the_run_is_over(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: the run ends and the session settles.
    Expected outcome: the whole-state read takes the transcript back, so the
    retroactive "this session is no longer live" rules a delta cannot express
    still get applied."""
    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _streaming_run_task(sdk))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=15_000):
            assert bridge.start("run the tests") is True
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
    finally:
        bridge.shutdown()

    assert service._transcript_is_live is False
    assert store.session_status == "completed"
    texts = "\n".join(event.text for event in store.transcript)
    assert "Task complete." in texts
    assert "Run finished." in texts
