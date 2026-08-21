from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.benchmark import (
    FIXTURE_SCHEMA_VERSION,
    compare_runs,
    fixture_checksum,
    inspect_run,
    load_fixture,
    replay_fixture,
    theil_sen_slope,
)

if TYPE_CHECKING:
    from pathlib import Path


def _fixture() -> dict[str, object]:
    payload: dict[str, object] = {
        "schema_version": FIXTURE_SCHEMA_VERSION,
        "source_checksum": "source",
        "transcript": [{"timestamp": "00:00", "role": "agent", "text": "render me"}],
        "agents": [],
        "todos": [],
        "artifacts": [],
        "kpis": {},
        "run_state": {
            "session_name": "session",
            "session_status": "completed",
            "run_state": "completed",
            "active_model": "model",
        },
    }
    payload["fixture_checksum"] = fixture_checksum(payload)
    return payload


@pytest.mark.unit
@verifies(SWR.SWR_2077)
def test_fixture_checksum_validation_and_schema(tmp_path: Path) -> None:
    path = tmp_path / "fixture.json"
    payload = _fixture()
    path.write_text(json.dumps(payload), encoding="utf-8")
    assert load_fixture(path)["fixture_checksum"] == payload["fixture_checksum"]

    payload["transcript"] = []
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="checksum"):
        load_fixture(path)


@pytest.mark.unit
@verifies(SWR.SWR_2077)
def test_fixture_has_only_explicit_ui_schema() -> None:
    payload = _fixture()
    assert not ({"config", "credentials", "environment", "workspace"} & payload.keys())


@pytest.mark.unit
@verifies(SWR.SWR_2077)
def test_inspect_recovers_complete_lines_from_truncated_run(tmp_path: Path) -> None:
    record = {
        "iteration": 0,
        "phase": "construct_window",
        "wall_ms": 3.0,
        "cpu_ms": 2.0,
        "rss_bytes": 100,
        "threads": 1,
        "widgets": 10,
        "transcript_operations": {"insert": 1},
    }
    (tmp_path / "iteration-000.jsonl").write_bytes(json.dumps(record).encode() + b'\n{"iteration":')
    summary = inspect_run(tmp_path)
    assert summary["records"] == 1
    assert summary["phases"]["construct_window"]["wall_ms"]["raw"] == [3.0]


@pytest.mark.unit
@verifies(SWR.SWR_2077)
def test_theil_sen_slope_resists_one_memory_outlier() -> None:
    points = [
        (0.0, 100.0),
        (1.0, 110.0),
        (2.0, 120.0),
        (3.0, 130.0),
        (4.0, 10_000.0),
    ]

    assert theil_sen_slope(points) == 10.0


@pytest.mark.unit
@verifies(SWR.SWR_2077)
def test_compare_keeps_raw_base_candidate_and_delta(tmp_path: Path) -> None:
    base = tmp_path / "base"
    candidate = tmp_path / "candidate"
    base.mkdir()
    candidate.mkdir()
    template = {"phases": {"apply_fixture": {"wall_ms": {"p50": 10.0}, "cpu_ms": {"p50": 5.0}}}}
    (base / "summary.json").write_text(json.dumps(template), encoding="utf-8")
    template["phases"]["apply_fixture"]["wall_ms"]["p50"] = 12.0
    (candidate / "summary.json").write_text(json.dumps(template), encoding="utf-8")
    delta = compare_runs(base, candidate)["phases"]["apply_fixture"]["wall_ms"]
    assert delta == {"base": 10.0, "candidate": 12.0, "delta": 2.0, "percent": 20.0}


@pytest.mark.integration
@pytest.mark.timeout(300)
@verifies(SWR.SWR_2077)
def test_two_headless_replays_have_identical_counts_and_invariants(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps(_fixture()), encoding="utf-8")

    summary = replay_fixture(fixture, tmp_path / "run", 2)

    assert summary["crashes"] == 0
    assert summary["invariants"] == {
        "fixture_checksum_stable": True,
        "operation_counts_identical": True,
        "thread_delta_within_one": True,
        "widgets_stable_after_warmup": True,
        "markdown_cache_bounded": True,
        "tail_second_half_growth_below_64_mib": True,
    }
    operations = summary["phases"]["resize_sequence"]["operations_raw"]
    assert operations[0] == operations[1]
