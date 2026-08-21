"""Deterministic, headless Rotaris UI capture and replay benchmark."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from rotaris_core.reqtocode import SWR, traces

from rotaris.diagnostics.live import linear_slope, percentile, read_jsonl

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping

FIXTURE_SCHEMA_VERSION = 1
RUN_SCHEMA_VERSION = 2
SIZES = ((1000, 680), (1440, 900))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rotaris-benchmark")
    commands = parser.add_subparsers(dest="command", required=True)
    capture = commands.add_parser("capture", help="export UI-visible persisted session state")
    capture.add_argument("session_dir", type=Path)
    capture.add_argument("--output", type=Path, required=True)
    replay = commands.add_parser("replay", help="replay a fixture in fresh subprocesses")
    replay.add_argument("fixture", type=Path)
    replay.add_argument("--output", type=Path, required=True)
    replay.add_argument("--iterations", type=int, default=3)
    inspect = commands.add_parser("inspect", help="summarize a replay run")
    inspect.add_argument("run_dir", type=Path)
    compare = commands.add_parser("compare", help="compare two replay runs")
    compare.add_argument("base_run", type=Path)
    compare.add_argument("candidate_run", type=Path)
    return parser


@traces(SWR.SWR_2077)
def main(argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv
    if arguments[:1] == ["_worker"]:
        worker = argparse.ArgumentParser(add_help=False)
        worker.add_argument("fixture", type=Path)
        worker.add_argument("output", type=Path)
        worker.add_argument("iteration", type=int)
        internal = worker.parse_args(arguments[1:])
        return _worker(internal.fixture, internal.output, internal.iteration)
    args = build_parser().parse_args(arguments)
    if args.command == "capture":
        capture_fixture(args.session_dir, args.output)
        print(
            "WARNING: this fixture contains transcript and tool content required for faithful "
            "rendering. Review it before sharing."
        )
        return 0
    if args.command == "replay":
        if args.iterations < 1:
            raise SystemExit("--iterations must be at least 1")
        replay_fixture(args.fixture, args.output, args.iterations)
        return 0
    if args.command == "inspect":
        summary = inspect_run(args.run_dir)
        print(json.dumps(summary, indent=2, sort_keys=True))
        return 0
    if args.command == "compare":
        print(json.dumps(compare_runs(args.base_run, args.candidate_run), indent=2, sort_keys=True))
        return 0
    return 2


def capture_fixture(session_dir: Path, output: Path) -> dict[str, Any]:
    """Project one persisted session and export only fields rendered by Rotaris."""
    session_dir = session_dir.resolve()
    if not session_dir.is_dir():
        raise FileNotFoundError(session_dir)
    workspace = _workspace_from_session_dir(session_dir)
    from rotaris_core.session.diagnostics import load_split_state

    state = load_split_state(session_dir)
    if state is None:
        from rotaris_core.session.persistence import SessionPersistence

        state = SessionPersistence(session_dir.parent).load_snapshot(session_dir.name)
    from rotaris.models import WorkspaceStore
    from rotaris.services.config_service import ConfigService

    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service.load()
    service.apply_session(state)
    body: dict[str, Any] = {
        "schema_version": FIXTURE_SCHEMA_VERSION,
        "source_checksum": _session_checksum(session_dir),
        "transcript": [asdict(item) for item in store.transcript],
        "agents": [asdict(item) for item in store.agent_list()],
        "todos": [asdict(item) for item in store.todos],
        "artifacts": [asdict(item) for item in store.artifacts],
        "kpis": asdict(store.kpis),
        "run_state": {
            "session_name": store.session_name,
            "session_status": store.session_status,
            "run_state": store.run_state.value,
            "active_model": store.active_model,
        },
    }
    body["fixture_checksum"] = fixture_checksum(body)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(body, indent=2, ensure_ascii=True), encoding="utf-8")
    return body


def load_fixture(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("schema_version") != FIXTURE_SCHEMA_VERSION:
        raise ValueError("unsupported Rotaris benchmark fixture schema")
    expected = payload.get("fixture_checksum")
    if not isinstance(expected, str) or expected != fixture_checksum(payload):
        raise ValueError("fixture checksum mismatch")
    required = {"transcript", "agents", "todos", "artifacts", "kpis", "run_state"}
    if not required.issubset(payload):
        raise ValueError("fixture is missing UI-visible state")
    return payload


def fixture_checksum(payload: Mapping[str, Any]) -> str:
    body = {key: value for key, value in payload.items() if key != "fixture_checksum"}
    return hashlib.sha256(_canonical(body)).hexdigest()


def replay_fixture(fixture: Path, output: Path, iterations: int) -> dict[str, Any]:
    payload = load_fixture(fixture)
    output.mkdir(parents=True, exist_ok=False)
    frozen = output / "fixture.json"
    frozen.write_bytes(fixture.read_bytes())
    with tempfile.TemporaryDirectory(prefix="rotaris-qsettings-") as settings_dir:
        for iteration in range(iterations):
            env = os.environ.copy()
            env.update(
                {
                    "QT_QPA_PLATFORM": "offscreen",
                    "QT_STYLE_OVERRIDE": "Fusion",
                    "QT_SCALE_FACTOR": "1",
                    "LANG": "C",
                    "LC_ALL": "C",
                    "XDG_CONFIG_HOME": settings_dir,
                    "ROTARIS_QSETTINGS_DIR": settings_dir,
                }
            )
            command = [
                sys.executable,
                "-m",
                "rotaris.benchmark",
                "_worker",
                str(frozen),
                str(output / f"iteration-{iteration:03d}.jsonl"),
                str(iteration),
            ]
            result = subprocess.run(command, env=env, check=False)
            if result.returncode:
                (output / f"iteration-{iteration:03d}.crash").write_text(
                    f"exit_code={result.returncode}\n", encoding="utf-8"
                )
    summary = inspect_run(output)
    summary["fixture_checksum"] = payload["fixture_checksum"]
    _write_run_summary(output, summary)
    return summary


def _worker(fixture_path: Path, output: Path, iteration: int) -> int:
    payload = load_fixture(fixture_path)
    from PySide6.QtCore import QObject, QSettings, Qt, QTimer
    from PySide6.QtWidgets import QApplication

    from rotaris.markdown import markdown_cache_info
    from rotaris.models import WorkspaceStore
    from rotaris.theme import theme_manager
    from rotaris.theme.fonts import register_bundled_fonts
    from rotaris.views import MainWindow

    settings_dir = os.environ.get("ROTARIS_QSETTINGS_DIR")
    if settings_dir:
        QSettings.setDefaultFormat(QSettings.Format.IniFormat)
        QSettings.setPath(QSettings.Format.IniFormat, QSettings.Scope.UserScope, settings_dir)
    app = cast("QApplication", QApplication.instance() or QApplication(sys.argv[:1]))
    app.setStyle("Fusion")
    # The bundled faces are part of what the replay measures: text layout is a
    # cost, and a host that substituted its own fonts would be benchmarked
    # against a window Rotaris never paints (SWR-3703).
    register_bundled_fonts()
    theme_manager().apply(app)
    process = _process()
    records: list[dict[str, Any]] = []
    rss_points: list[tuple[float, float]] = []
    started = time.perf_counter()
    store = WorkspaceStore()
    window: MainWindow | None = None
    heartbeat = {"last": time.perf_counter(), "max_lag_ms": 0.0}

    def heartbeat_tick() -> None:
        now = time.perf_counter()
        lag = max(0.0, (now - heartbeat["last"]) * 1000 - 250)
        heartbeat["last"] = now
        heartbeat["max_lag_ms"] = max(heartbeat["max_lag_ms"], lag)

    heartbeat_timer = QTimer()
    heartbeat_timer.setTimerType(Qt.TimerType.PreciseTimer)
    heartbeat_timer.setInterval(250)
    heartbeat_timer.timeout.connect(heartbeat_tick)
    heartbeat_timer.start()

    @contextmanager
    def phase(name: str) -> Iterator[None]:
        wall = time.perf_counter()
        cpu = time.process_time()
        yield
        _settle(app)
        memory = process.memory_info()
        elapsed = time.perf_counter() - started
        rss_points.append((elapsed, float(memory.rss)))
        model = window.workspace.transcript_scroll.transcript_model if window is not None else None
        records.append(
            {
                "schema_version": RUN_SCHEMA_VERSION,
                "iteration": iteration,
                "phase": name,
                "elapsed_s": round(elapsed, 3),
                "wall_ms": round((time.perf_counter() - wall) * 1000, 3),
                "cpu_ms": round((time.process_time() - cpu) * 1000, 3),
                "rss_bytes": memory.rss,
                "threads": process.num_threads(),
                "handles": _process_handle_count(process),
                "widgets": len(QApplication.allWidgets()),
                "qobjects": (
                    len(cast("list[QObject]", window.findChildren(QObject))) + 1
                    if window is not None
                    else 0
                ),
                "event_loop_lag_ms": round(heartbeat["max_lag_ms"], 3),
                "markdown_cache": asdict(markdown_cache_info()),
                "transcript_operations": dict(model.operation_counts) if model is not None else {},
            }
        )
        heartbeat["max_lag_ms"] = 0.0

    with phase("construct_window"):
        window = MainWindow(store)
        window.resize(*SIZES[1])
        window.show()
    with phase("apply_fixture"):
        _apply_fixture(store, payload, transcript=True)
    with phase("ordered_appends"):
        store.set_transcript([])
        for event in _transcript(payload):
            store.append_event(event)
    with phase("streaming_updates"):
        events = _transcript(payload)
        streamed_events: list[Any] = []
        store.set_transcript([])
        for target in events:
            ends = range(0, len(target.text) + 256, 256) if target.text else (0,)
            for end in ends:
                streamed = type(target)(**{**asdict(target), "text": target.text[:end]})
                store.set_transcript([*streamed_events, streamed])
            streamed_events.append(target)
    with phase("tail_replacements_1000"):
        events = list(store.transcript) or _transcript(payload)
        if not events:
            from rotaris.models.state import TranscriptEvent

            events = [TranscriptEvent("00:00", "agent", "x" * 256)]
        target = events[-1]
        width = max(1, len(target.text))
        tail_rss_samples = []
        for index in range(1000):
            replacement = f"{index:08d}".ljust(width, "x")[:width]
            events[-1] = type(target)(**{**asdict(target), "text": replacement})
            store.set_transcript(list(events))
            if index % 100 == 0 or index == 999:
                tail_rss_samples.append(process.memory_info().rss)
    records[-1]["rss_samples"] = tail_rss_samples
    halfway = len(tail_rss_samples) // 2
    records[-1]["rss_second_half_growth_bytes"] = (
        tail_rss_samples[-1] - tail_rss_samples[halfway] if tail_rss_samples else None
    )
    with phase("unchanged_state"):
        _apply_fixture(store, payload, transcript=True)
        _apply_fixture(store, payload, transcript=True)
    with phase("resize_sequence"):
        for size in (SIZES[0], SIZES[1], (1180, 760), SIZES[0], SIZES[1]):
            window.resize(*size)
            _settle(app)
    records[-1]["rss_slope_bytes_per_second"] = linear_slope(rss_points)
    records[-1]["fixture_checksum"] = payload["fixture_checksum"]
    heartbeat_timer.stop()
    with output.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, separators=(",", ":"), ensure_ascii=True) + "\n")
    window.close()
    return 0


def inspect_run(run_dir: Path) -> dict[str, Any]:
    records = [
        record for path in sorted(run_dir.glob("iteration-*.jsonl")) for record in read_jsonl(path)
    ]
    phases: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        if "phase" in record:
            phases.setdefault(str(record["phase"]), []).append(record)
    summary: dict[str, Any] = {
        "schema_version": RUN_SCHEMA_VERSION,
        "iterations": len({record.get("iteration") for record in records}),
        "records": len(records),
        "phases": {},
        "crashes": len(list(run_dir.glob("iteration-*.crash"))),
    }
    for name, items in sorted(phases.items()):
        wall = [float(item["wall_ms"]) for item in items]
        cpu = [float(item["cpu_ms"]) for item in items]
        summary["phases"][name] = {
            "wall_ms": _percentiles(wall),
            "cpu_ms": _percentiles(cpu),
            "rss_bytes_raw": [item.get("rss_bytes") for item in items],
            "threads_raw": [item.get("threads") for item in items],
            "widgets_raw": [item.get("widgets") for item in items],
            "operations_raw": [item.get("transcript_operations", {}) for item in items],
        }
    checksums = {
        record.get("fixture_checksum") for record in records if record.get("fixture_checksum")
    }
    summary["fixture_checksums"] = sorted(checksums)
    rss = [int(record["rss_bytes"]) for record in records if record.get("rss_bytes") is not None]
    lag = [float(record.get("event_loop_lag_ms", 0.0)) for record in records]
    thread_values = [
        int(record["threads"]) for record in records if record.get("threads") is not None
    ]
    handle_values = [
        int(record["handles"]) for record in records if record.get("handles") is not None
    ]
    widget_values = [
        int(record["widgets"]) for record in records if record.get("widgets") is not None
    ]
    iteration_points: dict[int, list[tuple[float, float]]] = {}
    for record in records:
        if record.get("elapsed_s") is None or record.get("rss_bytes") is None:
            continue
        iteration_points.setdefault(int(record.get("iteration", 0)), []).append(
            (float(record["elapsed_s"]), float(record["rss_bytes"]))
        )
    robust_rss_slopes = [
        slope
        for points in iteration_points.values()
        if (slope := theil_sen_slope(points)) is not None
    ]
    tail_growth = [
        int(record["rss_second_half_growth_bytes"])
        for record in records
        if record.get("rss_second_half_growth_bytes") is not None
    ]
    operation_sets = [
        json.dumps(record.get("transcript_operations", {}), sort_keys=True)
        for record in records
        if record.get("phase") == "resize_sequence"
    ]
    markdown_ok = all(
        int(record.get("markdown_cache", {}).get("entries", 0))
        <= int(record.get("markdown_cache", {}).get("max_entries", 0))
        and int(record.get("markdown_cache", {}).get("chars", 0))
        <= int(record.get("markdown_cache", {}).get("max_chars", 0))
        for record in records
    )
    summary["process"] = {
        "rss_start": rss[0] if rss else None,
        "rss_peak": max(rss) if rss else None,
        "rss_end": rss[-1] if rss else None,
        "rss_slope_bytes_per_second_raw": [
            record["rss_slope_bytes_per_second"]
            for record in records
            if record.get("rss_slope_bytes_per_second") is not None
        ],
        "event_loop_lag_ms": _percentiles(lag),
        "threads_raw": thread_values,
        "handles_raw": handle_values,
        "widgets_raw": widget_values,
        "rss_theil_sen_bytes_per_second_raw": robust_rss_slopes,
        "rss_theil_sen_bytes_per_second_p50": percentile(robust_rss_slopes, 0.5),
        "tail_second_half_growth_bytes_raw": tail_growth,
    }
    summary["invariants"] = {
        "fixture_checksum_stable": len(checksums) <= 1,
        "operation_counts_identical": len(set(operation_sets)) <= 1,
        "thread_delta_within_one": (max(thread_values) - min(thread_values) <= 1)
        if thread_values
        else True,
        "widgets_stable_after_warmup": _widgets_stable(phases),
        "markdown_cache_bounded": markdown_ok,
        "tail_second_half_growth_below_64_mib": all(
            value < 64 * 1024 * 1024 for value in tail_growth
        ),
    }
    return summary


def theil_sen_slope(points: list[tuple[float, float]]) -> float | None:
    """Robust median pairwise slope, bounded for very long benchmark runs."""
    if len(points) < 2:
        return None
    stride = max(1, math.ceil(len(points) / 2000))
    sampled = points[::stride]
    slopes = [
        (right_y - left_y) / (right_x - left_x)
        for left_index, (left_x, left_y) in enumerate(sampled)
        for right_x, right_y in sampled[left_index + 1 :]
        if right_x != left_x
    ]
    return percentile(slopes, 0.5)


def compare_runs(base_run: Path, candidate_run: Path) -> dict[str, Any]:
    base = _load_or_inspect(base_run)
    candidate = _load_or_inspect(candidate_run)
    result: dict[str, Any] = {"base": str(base_run), "candidate": str(candidate_run), "phases": {}}
    for phase in sorted(set(base.get("phases", {})) | set(candidate.get("phases", {}))):
        result["phases"][phase] = {}
        for metric in ("wall_ms", "cpu_ms"):
            old = base.get("phases", {}).get(phase, {}).get(metric, {}).get("p50")
            new = candidate.get("phases", {}).get(phase, {}).get(metric, {}).get("p50")
            delta = new - old if old is not None and new is not None else None
            result["phases"][phase][metric] = {
                "base": old,
                "candidate": new,
                "delta": delta,
                "percent": (delta / old * 100) if delta is not None and old else None,
            }
    return result


def _apply_fixture(store: Any, payload: Mapping[str, Any], *, transcript: bool) -> None:
    from rotaris.models.state import (
        AgentNode,
        AgentState,
        ArtifactInfo,
        KpiSnapshot,
        RunUiState,
        TodoItem,
    )

    agents = []
    for raw in payload["agents"]:
        data = dict(raw)
        data["state"] = AgentState(data["state"])
        agents.append(AgentNode(**data))
    store.set_agents(agents)
    store.set_todos([TodoItem(**item) for item in payload["todos"]])
    store.set_artifacts([ArtifactInfo(**item) for item in payload["artifacts"]])
    store.set_kpis(KpiSnapshot(**payload["kpis"]))
    state = payload["run_state"]
    store.session_name = state["session_name"]
    store.session_status = state["session_status"]
    store.run_state = RunUiState(state["run_state"])
    store.active_model = state["active_model"]
    if transcript:
        store.set_transcript(_transcript(payload))


def _transcript(payload: Mapping[str, Any]) -> list[Any]:
    from rotaris.models.state import TranscriptEvent

    return [TranscriptEvent(**item) for item in payload["transcript"]]


def _settle(app: Any) -> None:
    for _ in range(4):
        app.processEvents()


def _process() -> Any:
    import psutil  # type: ignore[import-untyped]

    return psutil.Process()


def _process_handle_count(process: Any) -> int | None:
    getter = getattr(process, "num_handles", None) or getattr(process, "num_fds", None)
    try:
        return int(getter()) if getter is not None else None
    except (OSError, ValueError):
        return None


def _workspace_from_session_dir(session_dir: Path) -> Path:
    if session_dir.parent.name != "sessions" or session_dir.parent.parent.name != ".rotaris":
        raise ValueError("SESSION_DIR must be <workspace>/.rotaris/sessions/<session-id>")
    return session_dir.parent.parent.parent


def _session_checksum(session_dir: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in session_dir.rglob("*") if item.is_file()):
        digest.update(path.relative_to(session_dir).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _percentiles(values: list[float]) -> dict[str, Any]:
    return {
        "raw": values,
        "p50": percentile(values, 0.5),
        "p95": percentile(values, 0.95),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "mean": statistics.fmean(values) if values else None,
    }


def _load_or_inspect(path: Path) -> dict[str, Any]:
    summary = path / "summary.json"
    return (
        json.loads(summary.read_text(encoding="utf-8")) if summary.exists() else inspect_run(path)
    )


def _write_run_summary(path: Path, summary: Mapping[str, Any]) -> None:
    (path / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8"
    )
    lines = ["# Rotaris replay benchmark", "", f"Iterations: {summary['iterations']}", ""]
    for name, phase in summary["phases"].items():
        lines.append(
            f"- {name}: wall p50 {phase['wall_ms']['p50']} ms; CPU p50 {phase['cpu_ms']['p50']} ms"
        )
    (path / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _widgets_stable(phases: Mapping[str, list[dict[str, Any]]]) -> bool:
    values = [
        int(item["widgets"])
        for name, items in phases.items()
        if name not in {"construct_window"}
        for item in items
        if item.get("widgets") is not None
    ]
    return not values or max(values) == min(values)


if __name__ == "__main__":
    raise SystemExit(main())
