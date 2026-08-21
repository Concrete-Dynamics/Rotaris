"""Productive use: a user opens the same workspace twice, and edits a manifest
between the two.

Expected outcome: the gate is a remembered fact rather than a guess re-made from
scratch — "this workspace has no gate yet" is distinguishable from "this
workspace was checked and needs none", the fingerprint moves for the edits that
change what a gate should be and stays put for the ones that do not, and a
deleted or corrupted state file costs a recomputation rather than a session.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.gate_state import (
    GateRecord,
    ProbeRecord,
    gate_state_path,
    load_gate_record,
    marker_files,
    refresh_gate_state,
    resolve_gate_state,
    save_gate_record,
    subproject_roots,
    unprobed_checks,
    workspace_fingerprint,
)
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _suite(*checks: ResolvedCheck, source: str = "detected") -> ResolvedCheckSuite:
    return ResolvedCheckSuite(checks=list(checks), source=source)  # type: ignore[arg-type]


def _check(name: str = "pytest", command: str = "make test") -> ResolvedCheck:
    return ResolvedCheck(name=name, command=command, role="test")


def _python_project(root: Path) -> Path:
    (root / "pyproject.toml").write_text("[project]\nname = 'x'\n", encoding="utf-8")
    (root / "tests").mkdir()
    return root


# -- the four states ---------------------------------------------------------


@verifies(SWR.SWR_2612)
def test_a_workspace_with_no_marker_at_all_is_absent_not_pending(tmp_path: Path) -> None:
    """The distinction the whole record exists for, at its far end.

    An empty directory has no gate *and* nothing a gate could cover. Reporting it
    as `pending` would put a "no quality gate" warning on a workspace that has
    not been asked to hold code yet.
    """
    record = resolve_gate_state(_suite(source="detection_empty"), tmp_path)

    assert record.state == "absent"
    assert record.fingerprint == ""


@verifies(SWR.SWR_2612)
def test_a_workspace_with_code_and_no_gate_is_pending(tmp_path: Path) -> None:
    """The other end: markers exist, detection resolved nothing, so a gate is owed."""
    _python_project(tmp_path)

    record = resolve_gate_state(_suite(source="detection_empty"), tmp_path)

    assert record.state == "pending"
    assert record.fingerprint


@verifies(SWR.SWR_2612)
def test_a_bound_suite_that_was_never_probed_here_is_stale(tmp_path: Path) -> None:
    """`stale` means "bound but not calibrated at this fingerprint".

    That covers both "the fingerprint moved" and "nothing has probed this yet",
    because both give a caller the same instruction: probe before trusting it.
    """
    _python_project(tmp_path)

    record = resolve_gate_state(_suite(_check()), tmp_path)

    assert record.state == "stale"


@verifies(SWR.SWR_2612, SWR.SWR_2613)
def test_a_suite_whose_every_check_carries_a_current_probe_is_calibrated(
    tmp_path: Path,
) -> None:
    _python_project(tmp_path)
    fingerprint = workspace_fingerprint(tmp_path)
    probed = GateRecord(
        state="stale",
        fingerprint=fingerprint,
        probes=(ProbeRecord(check="pytest", command="make test", verdict="verified"),),
    )

    record = resolve_gate_state(_suite(_check()), tmp_path, record=probed)

    assert record.state == "calibrated"
    assert record.probes == probed.probes


@verifies(SWR.SWR_2612)
def test_an_explicitly_empty_suite_is_calibrated_never_pending(tmp_path: Path) -> None:
    """`checks: []` is a stated decision, and a decision is not a gap.

    Reporting it as `pending` would re-litigate on every run something the user
    already settled (SWR-2601).
    """
    _python_project(tmp_path)

    record = resolve_gate_state(_suite(source="explicit_empty"), tmp_path)

    assert record.state == "calibrated"
    assert record.suite_origin == "config"


# -- the fingerprint ---------------------------------------------------------


@verifies(SWR.SWR_2612)
def test_the_fingerprint_moves_when_a_marker_is_added_removed_or_edited(
    tmp_path: Path,
) -> None:
    _python_project(tmp_path)
    original = workspace_fingerprint(tmp_path)

    (tmp_path / "Makefile").write_text("test:\n\tpytest\n", encoding="utf-8")
    added = workspace_fingerprint(tmp_path)
    assert added != original

    (tmp_path / "Makefile").write_text("test:\n\tpytest -n auto\n", encoding="utf-8")
    edited = workspace_fingerprint(tmp_path)
    assert edited not in {original, added}

    (tmp_path / "Makefile").unlink()
    assert workspace_fingerprint(tmp_path) == original


@verifies(SWR.SWR_2612)
def test_the_fingerprint_is_stable_across_an_ordinary_source_edit(tmp_path: Path) -> None:
    """Otherwise every iteration would invalidate every probe verdict.

    The gate depends on what a project *declares*, not on what its code says this
    minute, and re-probing a whole suite because somebody edited a test would
    make calibration cost more than it saves.
    """
    _python_project(tmp_path)
    (tmp_path / "tests" / "test_thing.py").write_text("def test_a(): pass\n", encoding="utf-8")
    original = workspace_fingerprint(tmp_path)

    (tmp_path / "tests" / "test_thing.py").write_text("def test_b(): pass\n", encoding="utf-8")

    assert workspace_fingerprint(tmp_path) == original


@verifies(SWR.SWR_2612, SWR.SWR_2618)
def test_a_sub_projects_manifest_is_part_of_the_fingerprint(tmp_path: Path) -> None:
    """One root gate covers several projects, so one fingerprint has to see them."""
    _python_project(tmp_path)
    app = tmp_path / "apps" / "desktop"
    app.mkdir(parents=True)
    (app / "package.json").write_text('{"name":"desktop"}', encoding="utf-8")

    assert subproject_roots(tmp_path) == ("apps/desktop",)
    assert "apps/desktop/package.json" in marker_files(tmp_path)

    before = workspace_fingerprint(tmp_path)
    (app / "package.json").write_text('{"name":"desktop","version":"2"}', encoding="utf-8")
    assert workspace_fingerprint(tmp_path) != before


@verifies(SWR.SWR_2612)
def test_the_scan_never_descends_into_a_worktree_a_virtualenv_or_node_modules(
    tmp_path: Path,
) -> None:
    """The bound that keeps a session start cheap.

    A workspace routinely holds trees larger than itself — nested worktrees,
    virtualenvs, dependency trees — each carrying manifests of its own. Walking
    them would put thousands of irrelevant files in the fingerprint and re-hash
    them on every marker-touching iteration.
    """
    _python_project(tmp_path)
    for buried in (".venv/lib/proj", "node_modules/dep", ".claude/worktrees/wt", "dist/inner"):
        directory = tmp_path / buried
        directory.mkdir(parents=True)
        (directory / "pyproject.toml").write_text("[project]\nname='no'\n", encoding="utf-8")

    assert subproject_roots(tmp_path) == ()
    assert marker_files(tmp_path) == ("pyproject.toml",)


# -- persistence -------------------------------------------------------------


@verifies(SWR.SWR_2612)
def test_a_missing_or_malformed_state_file_recomputes_instead_of_raising(
    tmp_path: Path,
) -> None:
    """Deleting the file is a supported reset, and a truncated one is not a wedge."""
    _python_project(tmp_path)
    assert load_gate_record(tmp_path) is None

    path = gate_state_path(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"state": "not-a-state"', encoding="utf-8")

    assert load_gate_record(tmp_path) is None
    assert refresh_gate_state(_suite(_check()), tmp_path).state == "stale"


@verifies(SWR.SWR_2612)
def test_a_record_round_trips_and_an_unchanged_workspace_is_not_rewritten(
    tmp_path: Path,
) -> None:
    _python_project(tmp_path)

    first = refresh_gate_state(_suite(_check()), tmp_path, run_id="run-1")
    assert load_gate_record(tmp_path) is not None
    stamped = gate_state_path(tmp_path).stat().st_mtime_ns

    second = refresh_gate_state(_suite(_check()), tmp_path, run_id="run-1")

    assert second.same_facts_as(first)
    assert gate_state_path(tmp_path).stat().st_mtime_ns == stamped


@verifies(SWR.SWR_2612)
def test_a_workspace_that_cannot_be_written_still_resolves(tmp_path: Path, monkeypatch) -> None:
    """An unwritable workspace re-derives its state; it never fails to open."""
    _python_project(tmp_path)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise OSError("read-only file system")

    monkeypatch.setattr("rotaris_core.verifier.gate_state.atomic_write", _explode)

    assert save_gate_record(tmp_path, GateRecord()) is False
    assert refresh_gate_state(_suite(_check()), tmp_path).state == "stale"


# -- what a probe pass asks --------------------------------------------------


@verifies(SWR.SWR_2612, SWR.SWR_2613)
def test_a_calibrated_gate_asks_for_no_probes_and_a_changed_command_asks_again(
    tmp_path: Path,
) -> None:
    """A verdict is about a command, not about a name.

    Swapping what `pytest` runs while keeping the label would otherwise inherit
    the old command's verdict — which is exactly the drift SWR-2613 exists to
    catch.
    """
    _python_project(tmp_path)
    fingerprint = workspace_fingerprint(tmp_path)
    record = GateRecord(
        state="calibrated",
        fingerprint=fingerprint,
        probes=(ProbeRecord(check="pytest", command="make test", verdict="verified"),),
    )

    assert unprobed_checks(_suite(_check()), record, fingerprint) == ()

    renamed = _check(command="uv run pytest -q")
    assert unprobed_checks(_suite(renamed), record, fingerprint) == (renamed,)

    assert unprobed_checks(_suite(_check()), record, "a-different-fingerprint") != ()


@verifies(SWR.SWR_2612, SWR.SWR_2614)
def test_an_authored_gate_keeps_saying_it_was_authored(tmp_path: Path) -> None:
    """A gate Rotaris wrote lands in `verifier.checks` and resolves as config.

    Only the record can tell "Rotaris wrote your gate" from "you wrote your
    gate", and a user reviewing a suite deserves to know which one they have.
    """
    _python_project(tmp_path)
    fingerprint = workspace_fingerprint(tmp_path)
    authored = GateRecord(
        state="calibrated",
        fingerprint=fingerprint,
        suite_origin="authored",
        probes=(ProbeRecord(check="pytest", command="make test", verdict="verified"),),
    )

    kept = resolve_gate_state(_suite(_check(), source="config"), tmp_path, record=authored)
    assert kept.suite_origin == "authored"

    edited = resolve_gate_state(
        _suite(_check(command="pytest -x"), source="config"),
        tmp_path,
        record=authored,
    )
    assert edited.suite_origin == "config"
