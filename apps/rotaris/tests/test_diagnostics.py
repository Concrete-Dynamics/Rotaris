from __future__ import annotations

import json
import tracemalloc
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.diagnostics import live
from rotaris.diagnostics.live import (
    DiagnosticsConfig,
    LiveDiagnostics,
    NoopDiagnostics,
    RotatingJsonl,
    build_summary,
    linear_slope,
    percentile,
    read_jsonl,
    resolve_diagnostics_config,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_2069)
def test_disabled_recorder_performs_no_work(tmp_path: Path) -> None:
    was_tracing = tracemalloc.is_tracing()
    recorder = NoopDiagnostics()

    with recorder.span("ignored"):
        pass
    recorder.attach_window(object())
    recorder.snapshot("ignored")
    recorder.close()

    assert recorder.run_dir is None
    assert list(tmp_path.iterdir()) == []
    assert tracemalloc.is_tracing() is was_tracing


def test_cli_diagnostics_values_override_environment(tmp_path: Path) -> None:
    env = {
        "ROTARIS_DIAGNOSTICS": "deep",
        "ROTARIS_DIAGNOSTICS_DIR": str(tmp_path / "environment"),
    }
    config = resolve_diagnostics_config("light", tmp_path / "cli", env)
    assert config == DiagnosticsConfig("light", tmp_path / "cli")
    assert resolve_diagnostics_config(None, None, env).mode == "deep"
    assert resolve_diagnostics_config(None, None, {}).mode == "off"
    with pytest.raises(ValueError, match="off, light, deep"):
        resolve_diagnostics_config(None, None, {"ROTARIS_DIAGNOSTICS": "verbose"})


@verifies(SWR.SWR_2069)
def test_jsonl_rotation_is_bounded_and_partial_lines_are_ignored(tmp_path: Path) -> None:
    stream = RotatingJsonl(tmp_path, "metrics", max_bytes=55, segments=2)
    for index in range(20):
        stream.write({"index": index, "padding": "x" * 10})
    stream.close()

    paths = sorted(tmp_path.glob("metrics-*.jsonl"))
    assert len(paths) == 2
    assert all(path.stat().st_size <= 55 for path in paths)
    paths[0].write_bytes(paths[0].read_bytes() + b'{"partial":')
    assert all("partial" not in item for item in read_jsonl(paths[0]))


@verifies(SWR.SWR_2071)
def test_summary_percentiles_and_slope() -> None:
    assert percentile([1.0, 2.0, 3.0, 4.0], 0.5) == 2.5
    assert linear_slope([(0.0, 10.0), (1.0, 20.0), (2.0, 30.0)]) == 10.0
    summary = build_summary(
        [
            {"elapsed_s": 0.0, "rss_bytes": 100, "event_loop_lag_ms": 0.0},
            {"elapsed_s": 1.0, "rss_bytes": 140, "event_loop_lag_ms": 20.0},
        ],
        {"refresh": [1.0, 2.0, 9.0]},
    )
    assert summary["rss"]["delta"] == 40
    assert summary["rss"]["slope_bytes_per_second"] == 40
    assert summary["spans"]["refresh"]["count"] == 3


def test_metric_shape_contains_counts_not_session_content() -> None:
    metric = {
        "rss_bytes": 1,
        "counts": {"transcript": 2, "agents": 1, "todos": 0, "artifacts": 0},
    }
    encoded = json.dumps(metric)
    assert "secret transcript value" not in encoded
    assert set(metric["counts"]) == {"transcript", "agents", "todos", "artifacts"}


def test_live_metrics_and_thread_dump_exclude_session_content(qtbot, tmp_path: Path) -> None:
    from rotaris.models import WorkspaceStore
    from rotaris.models.state import TranscriptEvent
    from rotaris.views import MainWindow

    secret = "DO-NOT-RECORD-session-content"
    store = WorkspaceStore()
    store.set_transcript([TranscriptEvent("00:00", "agent", secret)])
    recorder = LiveDiagnostics(DiagnosticsConfig("light", tmp_path), tmp_path)
    window = MainWindow(store, diagnostics=recorder)
    qtbot.addWidget(window)
    recorder.attach_window(window)
    recorder.sample()
    recorder.snapshot("manual")
    recorder.close()

    files = [path for path in recorder.run_dir.rglob("*") if path.is_file()]
    assert secret not in "".join(path.read_text(encoding="utf-8") for path in files)
    snapshot = json.loads(next((recorder.run_dir / "snapshots").glob("*-manual.json")).read_text())
    assert snapshot["threads"]
    assert {"name", "native_id", "stack"}.issubset(snapshot["threads"][0])
    assert all(
        "/" not in frame["file"] for thread in snapshot["threads"] for frame in thread["stack"]
    )


@verifies(SWR.SWR_2418)
def test_threshold_trigger_has_per_reason_cooldown(monkeypatch) -> None:
    recorder = LiveDiagnostics.__new__(LiveDiagnostics)
    recorder._last_snapshot_at = {}
    reasons: list[str] = []
    recorder.snapshot = reasons.append  # type: ignore[method-assign]
    now = [100.0]
    monkeypatch.setattr("rotaris.diagnostics.live.time.monotonic", lambda: now[0])

    recorder._trigger("rss-growth")
    now[0] += 30
    recorder._trigger("rss-growth")
    recorder._trigger("thread-growth")
    now[0] += 31
    recorder._trigger("rss-growth")

    assert reasons == ["rss-growth", "thread-growth", "rss-growth"]


@verifies(SWR.SWR_2069)
def test_online_summary_reservoirs_are_bounded() -> None:
    summary = live._OnlineSummary()
    for index in range(10_000):
        summary.add_metric(
            {
                "elapsed_s": float(index),
                "rss_bytes": 100 + index,
                "event_loop_lag_ms": float(index % 100),
            }
        )
        summary.add_span("refresh", float(index), failed=False)

    payload = summary.build()

    assert summary.rss.count == 10_000
    assert len(summary.rss.reservoir.values) == live.METRIC_RESERVOIR_SIZE
    assert len(summary.spans["refresh"].reservoir.values) == live.SPAN_RESERVOIR_SIZE
    assert payload["rss"]["start"] == 100
    assert payload["rss"]["end"] == 10_099
    assert payload["event_loop_lag_ms"]["quantiles_approximate"] is True


@verifies(SWR.SWR_2068)
def test_deep_close_does_not_take_allocation_snapshot(
    qtbot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer can close deep diagnostics without freezing Rotaris.
    Expected outcome: close captures only lightweight thread evidence.
    """
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)
    monkeypatch.setattr(
        tracemalloc,
        "take_snapshot",
        lambda: pytest.fail("close must stay lightweight"),
    )

    recorder.snapshot("manual")
    recorder.close()

    assert recorder._allocation_thread is None


@verifies(SWR.SWR_2418)
def test_deep_attach_does_not_enable_continuous_tracing(
    qtbot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer can run deep diagnostics during allocation-heavy analysis.
    Expected outcome: attaching the desktop leaves allocation tracing disabled between windows.
    """
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)
    monkeypatch.setattr(
        tracemalloc,
        "start",
        lambda *_args, **_kwargs: pytest.fail("attach must not start continuous tracing"),
    )

    recorder.attach_window(object())
    recorder.close()


@verifies(SWR.SWR_2418)
def test_deep_window_keeps_qt_responsive_and_reports_growth_sites(
    qtbot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a desktop user can inspect memory growth without losing UI control.
    Expected outcome: Qt heartbeats continue and summary ranks sampled retained-growth sites.
    """
    from PySide6.QtCore import QTimer

    from rotaris.models import WorkspaceStore
    from rotaris.views import MainWindow

    # Long enough that the sampling window is unmistakably still open while the
    # heartbeats below are collected, so their arrival says something about the
    # UI thread rather than about how fast the window closed.
    #
    # Seconds, not half a second: the window is opened on a worker thread, and
    # the allocations below have to land inside it or there is nothing for the
    # summary to rank. Sharing a core with seven other pytest workers, half a
    # second went on getting that thread scheduled and `tracemalloc` started --
    # so the window opened and shut before this thread allocated anything, and
    # the test failed waiting to see tracing that had already been and gone.
    # Widening it changes no assertion; it stops the machine's load deciding
    # the verdict.
    monkeypatch.setattr(live, "ALLOCATION_WINDOW_S", 5.0)
    monkeypatch.setattr(live, "ALLOCATION_SLOW_MS", 10_000.0)
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)
    window = MainWindow(WorkspaceStore(), diagnostics=recorder)
    qtbot.addWidget(window)
    recorder.attach_window(window)
    heartbeats: list[None] = []
    timer = QTimer()
    timer.setInterval(10)
    timer.timeout.connect(lambda: heartbeats.append(None))
    timer.start()

    assert recorder.request_allocation_snapshot("user-flow") is True
    qtbot.waitUntil(tracemalloc.is_tracing, timeout=10_000)
    retained = [bytearray(1024) for _ in range(1_000)]
    assert retained
    assert recorder._allocation_thread is not None
    # Waited for rather than counted after the fact: the sampling window is held
    # in a worker thread, so the Qt timer has to keep firing while it is open.
    # Counting whatever fitted into a fixed stretch of wall clock measures how
    # busy the machine is; waiting for the ticks measures the UI thread.
    qtbot.waitUntil(lambda: len(heartbeats) >= 2, timeout=5_000)
    qtbot.waitUntil(lambda: not recorder._allocation_thread.is_alive(), timeout=30_000)
    timer.stop()
    recorder.close()

    assert tracemalloc.is_tracing() is False
    summary = json.loads((recorder.run_dir / "summary.json").read_text(encoding="utf-8"))
    culprits = summary["diagnostics"]["top_memory_growth_sites"]
    assert culprits
    assert culprits[0]["sampled_retained_bytes"] > 0
    assert "test_diagnostics.py" in json.dumps(culprits)
    assert "Top sampled memory-growth sites" in (recorder.run_dir / "summary.md").read_text(
        encoding="utf-8"
    )


@verifies(SWR.SWR_2418)
def test_deep_window_does_not_take_over_external_tracemalloc(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a developer can combine Rotaris with another memory diagnostic.
    Expected outcome: Rotaris reports the conflict without stopping externally owned tracing.
    """
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)
    tracemalloc.start(1)
    try:
        assert recorder.request_allocation_snapshot("external-owner") is True
        assert recorder._allocation_thread is not None
        recorder._allocation_thread.join(timeout=5)

        assert tracemalloc.is_tracing() is True
        snapshot_path = next((recorder.run_dir / "snapshots").glob("*-external-owner.json"))
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        assert snapshot["capture_status"] == "skipped"
        assert snapshot["diagnostics_degraded"] == "external-tracemalloc-active"
    finally:
        recorder.close()
        tracemalloc.stop()


@verifies(SWR.SWR_2418)
def test_rss_growth_requests_bounded_allocation_window(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a developer can identify sources during sustained memory growth.
    Expected outcome: crossing the RSS threshold requests one retained-growth window.
    """
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)
    rss_bytes = recorder._process.memory_info().rss
    recorder._baseline_rss = rss_bytes - 256 * 1024 * 1024
    recorder._baseline_threads = recorder._process.num_threads()
    requests: list[str] = []
    recorder.request_allocation_snapshot = (  # type: ignore[method-assign]
        lambda reason, force=False: requests.append(reason) is None
    )

    recorder.sample()
    recorder.close()

    assert requests == ["rss-growth"]


@verifies(SWR.SWR_2418)
def test_deep_window_coalesces_requests_and_close_cancels_owned_tracing(
    qtbot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer can close Rotaris while a memory sample is pending.
    Expected outcome: duplicate work is rejected and owned tracing stops during close.
    """
    monkeypatch.setattr(live, "ALLOCATION_WINDOW_S", 10.0)
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)

    assert recorder.request_allocation_snapshot("first") is True
    qtbot.waitUntil(tracemalloc.is_tracing, timeout=10_000)
    assert recorder.request_allocation_snapshot("duplicate") is False
    recorder.close()

    assert tracemalloc.is_tracing() is False
    assert recorder._allocation_capture_counts["cancelled"] == 1


@verifies(SWR.SWR_2418)
def test_slow_allocation_capture_disables_future_automatic_captures(
    qtbot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer can keep using Rotaris after a costly memory sample.
    Expected outcome: one slow capture disables later automatic allocation captures.
    """
    recorder = LiveDiagnostics(DiagnosticsConfig("deep", tmp_path), tmp_path)
    monkeypatch.setattr(live, "ALLOCATION_WINDOW_S", 0.0)
    monkeypatch.setattr(live, "ALLOCATION_SLOW_MS", 0.0)

    assert recorder.request_allocation_snapshot("manual") is True
    assert recorder._allocation_thread is not None
    recorder._allocation_thread.join(timeout=5)

    assert recorder._allocation_degraded_reason is not None
    assert recorder.request_allocation_snapshot("automatic") is False
    recorder.close()
