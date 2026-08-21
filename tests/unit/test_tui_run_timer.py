from __future__ import annotations

from typing import Any

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.run_timer import RunTimer


@verifies(SWR.SWR_1071)
def test_format_display_returns_none_when_inactive() -> None:
    timer = RunTimer()
    assert timer.format_display() is None


@verifies(SWR.SWR_1072)
def test_format_display_shows_segment_elapsed_during_active_run(monkeypatch: Any) -> None:
    calls = iter([100.0, 105.5])
    monkeypatch.setattr("rotaris_core.tui.run_timer.monotonic", lambda: next(calls))
    timer = RunTimer()
    timer.start_run()
    result = timer.format_display()
    assert result == "0:05"


@verifies(SWR.SWR_1072)
def test_start_segment_resets_elapsed(monkeypatch: Any) -> None:
    values = [0.0, 90.0, 95.0]
    idx = [0]

    def fake_mono() -> float:
        v = values[idx[0]]
        idx[0] = min(idx[0] + 1, len(values) - 1)
        return v

    monkeypatch.setattr("rotaris_core.tui.run_timer.monotonic", fake_mono)
    timer = RunTimer()
    timer.start_run()  # monotonic() -> 0.0
    timer.start_segment()  # monotonic() -> 90.0
    result = timer.format_display()  # monotonic() -> 95.0 -> elapsed = 5s
    assert result == "0:05"


@verifies(SWR.SWR_1073)
def test_end_run_shows_total_duration(monkeypatch: Any) -> None:
    values = [0.0, 75.0]
    idx = [0]

    def fake_mono() -> float:
        v = values[idx[0]]
        idx[0] = min(idx[0] + 1, len(values) - 1)
        return v

    monkeypatch.setattr("rotaris_core.tui.run_timer.monotonic", fake_mono)
    timer = RunTimer()
    timer.start_run()  # monotonic() -> 0.0
    timer.end_run()  # monotonic() -> 75.0 -> total = 75s
    assert timer.format_display() == "1:15"


@verifies(SWR.SWR_1073)
def test_end_run_clears_active_state(monkeypatch: Any) -> None:
    calls = iter([0.0, 10.0])
    monkeypatch.setattr("rotaris_core.tui.run_timer.monotonic", lambda: next(calls))
    timer = RunTimer()
    timer.start_run()
    timer.end_run()
    assert not timer.is_active()


@verifies(SWR.SWR_1071)
def test_format_display_hours(monkeypatch: Any) -> None:
    calls = iter([0.0, 3723.0])
    monkeypatch.setattr("rotaris_core.tui.run_timer.monotonic", lambda: next(calls))
    timer = RunTimer()
    timer.start_run()
    timer.end_run()
    assert timer.format_display() == "1:02:03"


@verifies(SWR.SWR_1073)
def test_start_run_clears_previous_total(monkeypatch: Any) -> None:
    calls = iter([0.0, 10.0, 20.0])
    monkeypatch.setattr("rotaris_core.tui.run_timer.monotonic", lambda: next(calls))
    timer = RunTimer()
    timer.start_run()  # 0.0
    timer.end_run()  # 10.0 -> total = 10s
    assert timer.format_display() == "0:10"
    timer.start_run()  # 20.0 -> clears total
    assert timer.run_total_seconds is None
    assert timer.is_active()
