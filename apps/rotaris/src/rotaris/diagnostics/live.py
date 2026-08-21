"""Bounded Rotaris diagnostics recorder with responsive trigger capture.

Nothing in this module creates Qt objects, files, or threads until
:class:`LiveDiagnostics` is explicitly constructed. Deep allocation tracing
runs only in short sampling windows, uses one-frame traces, and keeps threshold
captures lightweight.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import random
import sys
import threading
import time
import tracemalloc
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping
    from types import TracebackType

SCHEMA_VERSION = 3
MAX_STREAM_BYTES = 8 * 1024 * 1024
STREAM_SEGMENTS = 4
SNAPSHOT_BUDGET_BYTES = 16 * 1024 * 1024
METRIC_RESERVOIR_SIZE = 4096
SPAN_RESERVOIR_SIZE = 1024
MAX_SPAN_NAMES = 128
ALLOCATION_INTERVAL_MS = 300_000
ALLOCATION_WINDOW_S = 2.0
ALLOCATION_SLOW_MS = 1_000.0
TOP_ALLOCATION_SITES = 20
SUMMARY_ALLOCATION_SITES = 10


@dataclass(frozen=True, slots=True)
class DiagnosticsConfig:
    mode: str = "off"
    output_base: Path | None = None

    @property
    def enabled(self) -> bool:
        return self.mode in {"light", "deep"}


def resolve_diagnostics_config(
    cli_mode: str | None,
    cli_output: Path | None,
    env: Mapping[str, str] | None = None,
) -> DiagnosticsConfig:
    """Resolve CLI-over-environment activation without inspecting other env values."""
    values = os.environ if env is None else env
    mode = cli_mode if cli_mode is not None else values.get("ROTARIS_DIAGNOSTICS", "off")
    mode = mode.strip().lower()
    if mode not in {"off", "light", "deep"}:
        raise ValueError("diagnostics must be one of: off, light, deep")
    raw_output = values.get("ROTARIS_DIAGNOSTICS_DIR")
    output = cli_output if cli_output is not None else (Path(raw_output) if raw_output else None)
    return DiagnosticsConfig(mode=mode, output_base=output)


class _NullSpan(AbstractContextManager[None]):
    def __enter__(self) -> None:
        return None

    def __exit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc: BaseException | None,
        _tb: TracebackType | None,
    ) -> None:
        return None


class NoopDiagnostics:
    """Disabled recorder whose methods have no side effects."""

    enabled = False
    mode = "off"
    run_dir: Path | None = None

    def span(self, _name: str) -> AbstractContextManager[None]:
        return _NULL_SPAN

    def attach_window(self, _window: Any) -> None:
        return None

    def snapshot(self, _reason: str) -> None:
        return None

    def request_allocation_snapshot(self, _reason: str, *, force: bool = False) -> bool:
        del force
        return False

    def record_duration(
        self,
        _name: str,
        _wall_ms: float,
        _cpu_ms: float = 0.0,
        *,
        failed: bool = False,
    ) -> None:
        del failed
        return None

    def close(self) -> None:
        return None


_NULL_SPAN = _NullSpan()


class RotatingJsonl:
    """Synchronous rotating JSONL stream with four bounded segments."""

    def __init__(
        self,
        directory: Path,
        stem: str,
        *,
        max_bytes: int = MAX_STREAM_BYTES,
        segments: int = STREAM_SEGMENTS,
    ) -> None:
        self.directory = directory
        self.stem = stem
        self.max_bytes = max_bytes
        self.segments = segments
        self.index = 0
        self.path = self._path(0)
        self._handle = self.path.open("ab", buffering=0)

    def _path(self, index: int) -> Path:
        return self.directory / f"{self.stem}-{index:02d}.jsonl"

    def write(self, item: Mapping[str, Any]) -> None:
        payload = json.dumps(item, ensure_ascii=True, separators=(",", ":"), default=str).encode()
        payload += b"\n"
        if self._handle.tell() and self._handle.tell() + len(payload) > self.max_bytes:
            self._handle.close()
            self.index = (self.index + 1) % self.segments
            self.path = self._path(self.index)
            self._handle = self.path.open("wb", buffering=0)
        self._handle.write(payload)

    def close(self) -> None:
        if not self._handle.closed:
            self._handle.close()


class _Reservoir:
    """Deterministic bounded reservoir for approximate run-wide quantiles."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.count = 0
        self.values: list[float] = []
        self._random = random.Random(0)

    def add(self, value: float) -> None:
        self.count += 1
        if len(self.values) < self.limit:
            self.values.append(value)
            return
        replacement = self._random.randrange(self.count)
        if replacement < self.limit:
            self.values[replacement] = value


class _OnlineSeries:
    def __init__(self, reservoir_size: int) -> None:
        self.count = 0
        self.first: float | None = None
        self.last: float | None = None
        self.maximum: float | None = None
        self.failed = 0
        self.reservoir = _Reservoir(reservoir_size)
        self.sum_x = 0.0
        self.sum_y = 0.0
        self.sum_xx = 0.0
        self.sum_xy = 0.0

    def add(self, value: float, *, x: float | None = None, failed: bool = False) -> None:
        self.count += 1
        if self.first is None:
            self.first = value
        self.last = value
        self.maximum = value if self.maximum is None else max(self.maximum, value)
        self.failed += int(failed)
        self.reservoir.add(value)
        if x is not None:
            self.sum_x += x
            self.sum_y += value
            self.sum_xx += x * x
            self.sum_xy += x * value

    def slope(self) -> float | None:
        if self.count < 2:
            return None
        denominator = self.count * self.sum_xx - self.sum_x * self.sum_x
        if denominator == 0:
            return 0.0
        return (self.count * self.sum_xy - self.sum_x * self.sum_y) / denominator

    def quantiles(self) -> dict[str, Any]:
        return {
            "p50": percentile(self.reservoir.values, 0.5),
            "p95": percentile(self.reservoir.values, 0.95),
            "max": self.maximum,
            "quantile_sample_count": len(self.reservoir.values),
            "quantiles_approximate": self.count > len(self.reservoir.values),
        }


class _OnlineSummary:
    def __init__(self) -> None:
        self.rss = _OnlineSeries(METRIC_RESERVOIR_SIZE)
        self.lag = _OnlineSeries(METRIC_RESERVOIR_SIZE)
        self.spans: dict[str, _OnlineSeries] = {}

    def add_metric(self, metric: Mapping[str, Any]) -> None:
        elapsed = float(metric["elapsed_s"])
        self.rss.add(float(metric["rss_bytes"]), x=elapsed)
        self.lag.add(float(metric["event_loop_lag_ms"]))

    def add_span(self, name: str, wall_ms: float, *, failed: bool) -> None:
        key = name
        if key not in self.spans and len(self.spans) >= MAX_SPAN_NAMES:
            key = "__other__"
        series = self.spans.setdefault(key, _OnlineSeries(SPAN_RESERVOIR_SIZE))
        series.add(wall_ms, failed=failed)

    def build(self) -> dict[str, Any]:
        rss_first = int(self.rss.first) if self.rss.first is not None else None
        rss_last = int(self.rss.last) if self.rss.last is not None else None
        return {
            "schema_version": SCHEMA_VERSION,
            "samples": self.rss.count,
            "rss": {
                "start": rss_first,
                "peak": int(self.rss.maximum) if self.rss.maximum is not None else None,
                "end": rss_last,
                "delta": (
                    rss_last - rss_first if rss_first is not None and rss_last is not None else None
                ),
                "slope_bytes_per_second": self.rss.slope(),
            },
            "event_loop_lag_ms": self.lag.quantiles(),
            "spans": {
                name: {
                    "count": series.count,
                    "failed": series.failed,
                    "p50_ms": percentile(series.reservoir.values, 0.5),
                    "p95_ms": percentile(series.reservoir.values, 0.95),
                    "max_ms": series.maximum,
                    "quantile_sample_count": len(series.reservoir.values),
                    "quantiles_approximate": (series.count > len(series.reservoir.values)),
                }
                for name, series in sorted(self.spans.items())
            },
        }


class _Span(AbstractContextManager[None]):
    def __init__(self, recorder: LiveDiagnostics, name: str) -> None:
        self.recorder = recorder
        self.name = name
        self.wall = 0.0
        self.cpu = 0.0

    def __enter__(self) -> None:
        self.wall = time.perf_counter()
        self.cpu = time.process_time()
        return None

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        _exc: BaseException | None,
        _tb: TracebackType | None,
    ) -> None:
        self.recorder._record_span(
            self.name,
            (time.perf_counter() - self.wall) * 1000,
            (time.process_time() - self.cpu) * 1000,
            failed=exc_type is not None,
        )


@traces(SWR.SWR_2077, SWR.SWR_2418)
class LiveDiagnostics:
    """Qt-timer process/UI recorder with allocation evidence written by one worker."""

    enabled = True

    def __init__(self, config: DiagnosticsConfig, workspace: Path) -> None:
        if not config.enabled:
            raise ValueError("LiveDiagnostics requires light or deep mode")
        from PySide6.QtCore import Qt, QTimer

        self.mode = config.mode
        self.workspace = workspace.resolve()
        base = config.output_base or self.workspace / ".rotaris" / "diagnostics" / "rotaris"
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        self.run_dir = base / f"{stamp}-{os.getpid()}"
        self.run_dir.mkdir(parents=True, exist_ok=False)
        (self.run_dir / "snapshots").mkdir()
        self._metrics = RotatingJsonl(self.run_dir, "metrics")
        self._spans = RotatingJsonl(self.run_dir, "spans")
        self._window: Any | None = None
        self._closed = False
        self._started = time.monotonic()
        self._last_heartbeat = time.perf_counter()
        self._last_lag_ms = 0.0
        self._summary = _OnlineSummary()
        self._snapshot_bytes = 0
        self._snapshot_index = 0
        self._snapshot_lock = threading.Lock()
        self._last_snapshot_at: dict[str, float] = {}
        self._baseline_rss: int | None = None
        self._baseline_threads: int | None = None
        self._allocation_lock = threading.Lock()
        self._allocation_thread: threading.Thread | None = None
        self._allocation_cancel = threading.Event()
        self._allocation_disabled = False
        self._allocation_degraded_reason: str | None = None
        self._allocation_incomplete = False
        self._allocation_capture_counts = {
            "complete": 0,
            "slow": 0,
            "skipped": 0,
            "cancelled": 0,
            "error": 0,
        }
        self._allocation_culprits: dict[tuple[str, int], dict[str, Any]] = {}
        self._process = _process()
        self._write_manifest()
        self._heartbeat = QTimer()
        self._heartbeat.setTimerType(Qt.TimerType.PreciseTimer)
        self._heartbeat.setInterval(250)
        self._heartbeat.timeout.connect(self._on_heartbeat)
        self._heartbeat.start()
        self._sampler = QTimer()
        self._sampler.setTimerType(Qt.TimerType.PreciseTimer)
        self._sampler.setInterval(1000)
        self._sampler.timeout.connect(self.sample)
        self._sampler.start()
        self._deep_timer: Any | None = None
        if self.mode == "deep":
            self._deep_timer = QTimer()
            self._deep_timer.setInterval(ALLOCATION_INTERVAL_MS)
            self._deep_timer.timeout.connect(
                lambda: self.request_allocation_snapshot("periodic-deep")
            )
            self._deep_timer.start()

    def _write_manifest(self) -> None:
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "application": "rotaris",
            "created_at": datetime.now(UTC).isoformat(),
            "platform": {
                "system": platform.system(),
                "release": platform.release(),
                "python": platform.python_version(),
            },
            "config": {
                "mode": self.mode,
                "sample_interval_ms": 1000,
                "heartbeat_interval_ms": 250,
                "stream_max_bytes": MAX_STREAM_BYTES,
                "stream_segments": STREAM_SEGMENTS,
                "tracemalloc_frames": 1 if self.mode == "deep" else 0,
                "tracemalloc_mode": "bounded-growth-windows" if self.mode == "deep" else None,
                "allocation_interval_ms": (ALLOCATION_INTERVAL_MS if self.mode == "deep" else None),
                "allocation_window_ms": (
                    int(ALLOCATION_WINDOW_S * 1000) if self.mode == "deep" else None
                ),
                "allocation_top_sites": TOP_ALLOCATION_SITES if self.mode == "deep" else None,
                "metric_reservoir_size": METRIC_RESERVOIR_SIZE,
                "span_reservoir_size": SPAN_RESERVOIR_SIZE,
                "max_span_names": MAX_SPAN_NAMES,
            },
        }
        encoded = _canonical_json(manifest)
        manifest["checksum"] = hashlib.sha256(encoded).hexdigest()
        _write_json(self.run_dir / "manifest.json", manifest)

    def attach_window(self, window: Any) -> None:
        self._window = window

    def span(self, name: str) -> AbstractContextManager[None]:
        return _Span(self, name)

    def _record_span(self, name: str, wall_ms: float, cpu_ms: float, *, failed: bool) -> None:
        if self._closed:
            return
        self._summary.add_span(name, wall_ms, failed=failed)
        self._spans.write(
            {
                "elapsed_s": round(time.monotonic() - self._started, 3),
                "name": name,
                "wall_ms": round(wall_ms, 3),
                "cpu_ms": round(cpu_ms, 3),
                "failed": failed,
            }
        )

    def record_duration(
        self,
        name: str,
        wall_ms: float,
        cpu_ms: float = 0.0,
        *,
        failed: bool = False,
    ) -> None:
        self._record_span(name, wall_ms, cpu_ms, failed=failed)

    def _on_heartbeat(self) -> None:
        now = time.perf_counter()
        self._last_lag_ms = max(0.0, (now - self._last_heartbeat) * 1000 - 250)
        self._last_heartbeat = now
        if self._last_lag_ms > 1000:
            self._trigger("event-loop-lag")

    def sample(self) -> dict[str, Any]:
        from PySide6.QtCore import QObject, QThreadPool
        from PySide6.QtWidgets import QApplication, QWidget

        memory = self._process.memory_info()
        threads = threading.enumerate()
        root = self._window
        widgets = QApplication.allWidgets()
        metric: dict[str, Any] = {
            "elapsed_s": round(time.monotonic() - self._started, 3),
            "rss_bytes": memory.rss,
            "vms_bytes": memory.vms,
            "cpu_percent": self._process.cpu_percent(None),
            "native_threads": self._process.num_threads(),
            "python_threads": len(threads),
            "python_thread_names": sorted(thread.name for thread in threads),
            "handles": _handle_count(self._process),
            "qthreadpool_active": QThreadPool.globalInstance().activeThreadCount(),
            "qthreadpool_max": QThreadPool.globalInstance().maxThreadCount(),
            "qwidgets": len(widgets),
            "qobjects": len(root.findChildren(QObject)) + 1 if root is not None else 0,
            "event_loop_lag_ms": round(self._last_lag_ms, 3),
        }
        if self.mode == "deep" and tracemalloc.is_tracing():
            traced_current, traced_peak = tracemalloc.get_traced_memory()
            metric["traced_current_bytes"] = traced_current
            metric["traced_peak_bytes"] = traced_peak
        if root is not None:
            store = root.store
            metric["counts"] = {
                "transcript": len(store.transcript),
                "agents": len(store.agents),
                "todos": len(store.todos),
                "artifacts": len(store.artifacts),
                "markdown_cache": _markdown_counts(),
                "views": {
                    name: {
                        "widgets": len(view.findChildren(QWidget)) + 1,
                        "objects": len(view.findChildren(QObject)) + 1,
                    }
                    for name, view in root.views.items()
                },
            }
        self._metrics.write(metric)
        self._summary.add_metric(metric)
        if self._baseline_rss is None:
            self._baseline_rss = memory.rss
            self._baseline_threads = metric["native_threads"]
        else:
            if memory.rss - self._baseline_rss >= 256 * 1024 * 1024:
                self._trigger("rss-growth")
                self.request_allocation_snapshot("rss-growth")
                self._baseline_rss = memory.rss
            if metric["native_threads"] - (self._baseline_threads or 0) >= 8:
                self._trigger("thread-growth")
                self._baseline_threads = metric["native_threads"]
        return metric

    def _trigger(self, reason: str) -> None:
        now = time.monotonic()
        if now - self._last_snapshot_at.get(reason, -math.inf) < 60:
            return
        self._last_snapshot_at[reason] = now
        self.snapshot(reason)

    def snapshot(self, reason: str) -> None:
        if self._closed:
            return
        started = time.perf_counter()
        frames = sys._current_frames()
        stacks = []
        for thread in threading.enumerate():
            frame = frames.get(thread.ident or -1)
            entries = []
            while frame is not None:
                entries.append(
                    {
                        "file": Path(frame.f_code.co_filename).name,
                        "line": frame.f_lineno,
                        "function": frame.f_code.co_name,
                    }
                )
                frame = frame.f_back
            stacks.append({"name": thread.name, "native_id": thread.native_id, "stack": entries})
        payload: dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "reason": reason,
            "capture_kind": "threads",
            "elapsed_s": round(time.monotonic() - self._started, 3),
            "threads": stacks,
        }
        payload["capture_duration_ms"] = round(
            (time.perf_counter() - started) * 1000,
            3,
        )
        self._write_snapshot_payload(reason, payload)

    def request_allocation_snapshot(self, reason: str, *, force: bool = False) -> bool:
        """Queue one bounded retained-growth sampling window without a backlog."""
        if self.mode != "deep" or self._closed:
            return False
        with self._allocation_lock:
            if self._allocation_disabled and not force:
                return False
            if self._allocation_thread is not None and self._allocation_thread.is_alive():
                return False
            worker = threading.Thread(
                target=self._capture_allocations,
                args=(reason,),
                name="RotarisAllocationSnapshot",
                daemon=True,
            )
            self._allocation_thread = worker
            worker.start()
        return True

    def _capture_allocations(self, reason: str) -> None:
        started = time.perf_counter()
        status = "complete"
        memory: dict[str, Any] | None = None
        degraded_reason: str | None = None
        owns_tracing = False
        processing_duration_ms = 0.0
        try:
            from rotaris_core.runtime_memory import capture_memory_snapshot

            if tracemalloc.is_tracing():
                status = "skipped"
                degraded_reason = "external-tracemalloc-active"
            else:
                tracemalloc.start(1)
                owns_tracing = True
                if self._allocation_cancel.wait(ALLOCATION_WINDOW_S):
                    status = "cancelled"
                else:
                    processing_started = time.perf_counter()
                    memory = capture_memory_snapshot(
                        reason,
                        top_frames=TOP_ALLOCATION_SITES,
                    ).model_dump()
                    memory["rss_bytes"] = self._process.memory_info().rss
                    memory["attribution"] = "retained-growth-window"
                    memory["window_seconds"] = ALLOCATION_WINDOW_S
                    for allocation in memory["top_allocations"]:
                        allocation["file"] = self._sanitize_allocation_path(str(allocation["file"]))
                    self._record_allocation_culprits(memory["top_allocations"])
                    processing_duration_ms = (time.perf_counter() - processing_started) * 1000
        except Exception as exc:
            status = "error"
            degraded_reason = f"allocation-capture-error:{type(exc).__name__}"
        finally:
            if owns_tracing and tracemalloc.is_tracing():
                tracemalloc.stop()
        duration_ms = (time.perf_counter() - started) * 1000
        if status == "complete" and processing_duration_ms > ALLOCATION_SLOW_MS:
            status = "slow"
            degraded_reason = f"allocation-capture-slow:{processing_duration_ms:.0f}ms"
        with self._allocation_lock:
            self._allocation_capture_counts[status] += 1
            if degraded_reason is not None:
                self._allocation_degraded_reason = degraded_reason
            if status in {"slow", "error"}:
                self._allocation_disabled = True
        payload: dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "reason": reason,
            "capture_kind": "allocations",
            "capture_status": status,
            "capture_duration_ms": round(duration_ms, 3),
            "processing_duration_ms": round(processing_duration_ms, 3),
            "attribution": "retained-growth-window",
            "window_seconds": ALLOCATION_WINDOW_S,
            "elapsed_s": round(time.monotonic() - self._started, 3),
        }
        if memory is not None:
            payload["memory"] = memory
        if degraded_reason is not None:
            payload["diagnostics_degraded"] = degraded_reason
        if not self._closed:
            self._write_snapshot_payload(reason, payload)

    def _sanitize_allocation_path(self, filename: str) -> str:
        path = Path(filename)
        try:
            return path.resolve().relative_to(self.workspace).as_posix()
        except (OSError, ValueError):
            return path.name

    def _record_allocation_culprits(self, allocations: list[dict[str, Any]]) -> None:
        with self._allocation_lock:
            for allocation in allocations:
                filename = str(allocation["file"])
                line = int(allocation["line"])
                key = (filename, line)
                culprit = self._allocation_culprits.setdefault(
                    key,
                    {
                        "file": filename,
                        "line": line,
                        "sampled_retained_bytes": 0,
                        "sampled_retained_count": 0,
                        "windows": 0,
                        "max_window_bytes": 0,
                    },
                )
                size_bytes = int(allocation["size_bytes"])
                culprit["sampled_retained_bytes"] += size_bytes
                culprit["sampled_retained_count"] += int(allocation["count"])
                culprit["windows"] += 1
                culprit["max_window_bytes"] = max(culprit["max_window_bytes"], size_bytes)

    def _top_allocation_culprits(self) -> list[dict[str, Any]]:
        with self._allocation_lock:
            culprits = [dict(culprit) for culprit in self._allocation_culprits.values()]
        return sorted(
            culprits,
            key=lambda culprit: (
                -int(culprit["sampled_retained_bytes"]),
                str(culprit["file"]),
                int(culprit["line"]),
            ),
        )[:SUMMARY_ALLOCATION_SITES]

    def _write_snapshot_payload(self, reason: str, payload: Mapping[str, Any]) -> bool:
        encoded = json.dumps(payload, indent=2, ensure_ascii=True).encode()
        safe_reason = "".join(
            character if character.isalnum() or character in {"-", "_"} else "-"
            for character in reason
        )[:64]
        with self._snapshot_lock:
            if self._snapshot_bytes + len(encoded) > SNAPSHOT_BUDGET_BYTES:
                return False
            path = self.run_dir / "snapshots" / f"{self._snapshot_index:04d}-{safe_reason}.json"
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(encoded)
            os.replace(temporary, path)
            self._snapshot_index += 1
            self._snapshot_bytes += len(encoded)
        return True

    def close(self) -> None:
        if self._closed:
            return
        self._heartbeat.stop()
        self._sampler.stop()
        if self._deep_timer is not None:
            self._deep_timer.stop()
        self.snapshot("normal-close")
        self._closed = True
        self._allocation_cancel.set()
        with self._allocation_lock:
            allocation_thread = self._allocation_thread
        if allocation_thread is not None and allocation_thread.is_alive():
            allocation_thread.join(timeout=1.0)
            if allocation_thread.is_alive():
                self._allocation_incomplete = True
        self._metrics.close()
        self._spans.close()
        summary = self._summary.build()
        with self._allocation_lock:
            allocation_capture_counts = dict(self._allocation_capture_counts)
        summary["diagnostics"] = {
            "allocation_degraded_reason": self._allocation_degraded_reason,
            "allocation_capture_incomplete": self._allocation_incomplete,
            "allocation_capture_counts": allocation_capture_counts,
            "allocation_attribution": "retained-growth-window",
            "top_memory_growth_sites": self._top_allocation_culprits(),
            "snapshot_bytes": self._snapshot_bytes,
        }
        _write_json(self.run_dir / "summary.json", summary)
        (self.run_dir / "summary.md").write_text(_summary_markdown(summary), encoding="utf-8")


def percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def linear_slope(points: list[tuple[float, float]]) -> float | None:
    if len(points) < 2:
        return None
    mean_x = sum(x for x, _ in points) / len(points)
    mean_y = sum(y for _, y in points) / len(points)
    denominator = sum((x - mean_x) ** 2 for x, _ in points)
    if not denominator:
        return 0.0
    return sum((x - mean_x) * (y - mean_y) for x, y in points) / denominator


def build_summary(
    samples: list[dict[str, Any]], span_values: Mapping[str, list[float]]
) -> dict[str, Any]:
    rss = [int(sample["rss_bytes"]) for sample in samples]
    lag = [float(sample["event_loop_lag_ms"]) for sample in samples]
    points = [(float(sample["elapsed_s"]), float(sample["rss_bytes"])) for sample in samples]
    return {
        "schema_version": SCHEMA_VERSION,
        "samples": len(samples),
        "rss": {
            "start": rss[0] if rss else None,
            "peak": max(rss) if rss else None,
            "end": rss[-1] if rss else None,
            "delta": rss[-1] - rss[0] if rss else None,
            "slope_bytes_per_second": linear_slope(points),
        },
        "event_loop_lag_ms": {
            "p50": percentile(lag, 0.5),
            "p95": percentile(lag, 0.95),
            "max": max(lag) if lag else None,
        },
        "spans": {
            name: {
                "count": len(values),
                "p50_ms": percentile(values, 0.5),
                "p95_ms": percentile(values, 0.95),
                "max_ms": max(values),
            }
            for name, values in sorted(span_values.items())
            if values
        },
    }


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    """Read complete JSONL records, ignoring a crash-truncated final line."""
    records = []
    for line in path.read_bytes().splitlines():
        try:
            value = json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def _process() -> Any:
    import psutil  # type: ignore[import-untyped]

    process = psutil.Process()
    process.cpu_percent(None)
    return process


def _handle_count(process: Any) -> int | None:
    getter = getattr(process, "num_handles", None) or getattr(process, "num_fds", None)
    try:
        return int(getter()) if getter is not None else None
    except (OSError, ValueError):
        return None


def _markdown_counts() -> dict[str, int]:
    from rotaris.markdown import markdown_cache_info

    info = markdown_cache_info()
    return {"entries": info.entries, "chars": info.chars, "hits": info.hits, "misses": info.misses}


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def _summary_markdown(summary: Mapping[str, Any]) -> str:
    rss = summary["rss"]
    lines = [
        "# Rotaris diagnostics summary\n\n"
        f"Samples: {summary['samples']}\n\n"
        f"RSS start / peak / end: {rss['start']} / {rss['peak']} / {rss['end']} bytes\n\n"
        f"RSS slope: {rss['slope_bytes_per_second']} bytes/second\n"
    ]
    diagnostics = summary.get("diagnostics", {})
    culprits = diagnostics.get("top_memory_growth_sites", [])
    if culprits:
        lines.append("\n## Top sampled memory-growth sites\n\n")
        for culprit in culprits:
            lines.append(
                f"- `{culprit['file']}:{culprit['line']}`: "
                f"{culprit['sampled_retained_bytes']} retained bytes across "
                f"{culprit['windows']} window(s)\n"
            )
    return "".join(lines)
