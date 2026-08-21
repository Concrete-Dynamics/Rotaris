"""Productive use: an agent finishes, the workspace's own checks start, and the
user can see which check is running and stop one they do not need.

Expected outcome: the run header names the running check and its position in the
suite, each check gets a transcript row that counts upward and settles on its own
outcome, Skip reaches the run, and the whole indicator disappears once the suite
ends — the run's own controls never change, because verification is a phase of a
running run and not a state of its own.
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from run_wiring import ObserverHarness
from ui_query import click_by_name, find_by_accessible_name

from rotaris.models.state import VerifierSummary
from rotaris.models.store import WorkspaceStore
from rotaris.views.workspace import WorkspaceView

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


def _check(name: str, command: str) -> SimpleNamespace:
    return SimpleNamespace(name=name, command=command, severity="blocking")


def _result(name: str, status: str, **fields: Any) -> SimpleNamespace:
    return SimpleNamespace(
        name=name,
        command=fields.get("command", f"run {name}"),
        status=status,
        duration_s=fields.get("duration_s", 1.5),
        skip_reason=fields.get("skip_reason", ""),
        output_excerpt=fields.get("output_excerpt", ""),
    )


def _suite(*checks: SimpleNamespace) -> SimpleNamespace:
    return SimpleNamespace(checks=list(checks), source="config", suite_timeout=900)


class _FakeControl:
    def __init__(self) -> None:
        self.skips = 0

    def skip_current(self) -> bool:
        self.skips += 1
        return True


def _verifier_rows(store: WorkspaceStore) -> list[Any]:
    return [event for event in store.transcript if event.kind == "verifier"]


@verifies(SWR.SWR_2609)
def test_a_running_check_is_named_in_the_transcript_and_counts_upward(tmp_path: Path) -> None:
    """The gap where a run looked dead now carries the check that is running."""
    harness = ObserverHarness(tmp_path)
    try:
        control = _FakeControl()
        harness.observer.on_verifier_started(1, _suite(_check("pytest", "pytest -q")), control)
        harness.observer.on_verifier_check_started(1, _check("pytest", "pytest -q"), 1, 1, 600.0)
        store = harness.reload_into_store(tmp_path)
    finally:
        harness.close()

    rows = _verifier_rows(store)
    assert [(row.tool, row.status) for row in rows] == [("pytest", "running")]
    assert rows[0].text == "pytest -q"
    # The row counts client-side from its start, so a long check keeps moving
    # without the run writing a snapshot per second.
    assert rows[0].started_at > 0
    assert store.verifier.active is True
    assert store.verifier.position_label == "pytest (1/1)"
    assert store.run_summary.activity == "Verifying — pytest (1/1)"


@verifies(SWR.SWR_2609)
def test_each_check_settles_on_its_own_outcome(tmp_path: Path) -> None:
    """One row per check, each carrying what that check actually concluded."""
    harness = ObserverHarness(tmp_path)
    try:
        suite = _suite(_check("ruff", "ruff check ."), _check("pytest", "pytest -q"))
        harness.observer.on_verifier_started(1, suite, _FakeControl())
        harness.observer.on_verifier_check_started(1, _check("ruff", "ruff check ."), 1, 2, 120.0)
        harness.observer.on_verifier_check_finished(1, _result("ruff", "passed"), 1, 2)
        harness.observer.on_verifier_check_started(1, _check("pytest", "pytest -q"), 2, 2, 600.0)
        harness.observer.on_verifier_check_finished(
            1,
            _result("pytest", "failed", output_excerpt="2 failed, 40 passed"),
            2,
            2,
        )
        store = harness.reload_into_store(tmp_path)
    finally:
        harness.close()

    rows = _verifier_rows(store)
    assert [(row.tool, row.status) for row in rows] == [("ruff", "ok"), ("pytest", "failed")]
    assert "2 failed" in rows[1].detail
    assert rows[1].duration == 1.5


@verifies(SWR.SWR_2610)
def test_a_skipped_check_never_reads_as_a_passing_one(tmp_path: Path) -> None:
    """Nothing was verified, so the row must not be green."""
    harness = ObserverHarness(tmp_path)
    try:
        harness.observer.on_verifier_started(
            1, _suite(_check("pytest", "pytest -q")), _FakeControl()
        )
        harness.observer.on_verifier_check_started(1, _check("pytest", "pytest -q"), 1, 1, 600.0)
        harness.observer.on_verifier_check_finished(
            1,
            _result("pytest", "skipped", skip_reason="Skipped by the user after 41s."),
            1,
            1,
        )
        store = harness.reload_into_store(tmp_path)
    finally:
        harness.close()

    row = _verifier_rows(store)[0]
    assert row.status == "blocked"
    assert "Skipped by the user" in row.detail


@verifies(SWR.SWR_2609)
def test_the_verification_phase_ends_when_the_suite_does(tmp_path: Path) -> None:
    """A finished suite leaves nothing behind for a host to keep displaying."""
    harness = ObserverHarness(tmp_path)
    try:
        harness.observer.on_verifier_started(
            1, _suite(_check("pytest", "pytest -q")), _FakeControl()
        )
        harness.observer.on_verifier_check_started(1, _check("pytest", "pytest -q"), 1, 1, 600.0)
        harness.observer.on_verifier_check_finished(1, _result("pytest", "passed"), 1, 1)
        harness.observer.on_verifier_run(1, SimpleNamespace(executed=True, results=[]))
        store = harness.reload_into_store(tmp_path)
    finally:
        harness.close()

    assert store.verifier.active is False
    assert harness.observer._verifier_control is None  # noqa: SLF001
    # The rows stay: what was verified is part of the run's record.
    assert len(_verifier_rows(store)) == 1


@verifies(SWR.SWR_2610)
def test_skip_reaches_the_running_suite(tmp_path: Path) -> None:
    """Pressing Skip stops the check, and does so through the loop that owns it."""
    harness = ObserverHarness(tmp_path)
    try:
        control = _FakeControl()
        harness.observer.on_verifier_started(1, _suite(_check("pytest", "pytest -q")), control)

        assert harness.observer.skip_verifier_check() is True
        harness.drain()

        assert control.skips == 1
    finally:
        harness.close()


@verifies(SWR.SWR_2610)
def test_skipping_with_nothing_in_flight_does_nothing(tmp_path: Path) -> None:
    """The control is wired to a button that is always there."""
    harness = ObserverHarness(tmp_path)
    try:
        assert harness.observer.skip_verifier_check() is False
    finally:
        harness.close()


@verifies(SWR.SWR_2609)
def test_the_run_header_shows_the_running_check_and_hides_when_idle(qtbot: QtBot) -> None:
    """The indicator lives beside the run status, where a user looks already."""
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert view.verifier_activity.isVisibleTo(view) is False

    store.set_verifier(
        VerifierSummary(
            active=True,
            check="pytest",
            index=2,
            total=3,
            started_at=time.time() - 41,
            deadline_s=600.0,
        ),
    )

    label = find_by_accessible_name(view, "Verification status", QLabel)
    assert label.text() == "Verifying — pytest (2/3) · 0:41 / 10:00"
    assert view.verifier_activity.isVisibleTo(view) is True

    store.set_verifier(VerifierSummary())

    assert view.verifier_activity.isVisibleTo(view) is False


@verifies(SWR.SWR_2615)
def test_the_run_header_warns_while_this_workspace_has_no_quality_gate(
    qtbot: QtBot,
) -> None:
    """The one run with nothing in flight to report is the one that most needs to.

    A workspace with no gate runs no checks, so the verification indicator stays
    dark — and that silence used to be indistinguishable from a suite that passed.
    """
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    label = find_by_accessible_name(view, "Verification status", QLabel)

    store.set_verifier(
        VerifierSummary(gate_warning="This workspace has no quality gate, so nothing verified."),
    )

    assert view.verifier_activity.isVisibleTo(view) is True
    assert label.text() == "No quality gate — nothing verified this run"
    assert "no quality gate" in label.toolTip()
    # Nothing is running, so there is nothing to stop.
    assert view.verifier_skip_button.isVisibleTo(view) is False

    store.set_verifier(VerifierSummary())

    assert view.verifier_activity.isVisibleTo(view) is False


@verifies(SWR.SWR_2609)
def test_verifying_never_changes_what_the_run_controls_do(qtbot: QtBot) -> None:
    """Verification is a phase of a running run, not a state of its own."""
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    before = (store.run_state, store.session_status)

    store.set_verifier(VerifierSummary(active=True, check="pytest", index=1, total=1))

    assert (store.run_state, store.session_status) == before
    assert view.run_state_label.text() == "Ready"


@verifies(SWR.SWR_2610)
def test_the_skip_button_asks_the_bridge_to_stop_the_check(qtbot: QtBot) -> None:
    """A user reaches Skip by its accessible name, the way a screen reader would."""
    store = WorkspaceStore()
    calls: list[bool] = []
    bridge = SimpleNamespace(
        skip_verifier_check=lambda: (calls.append(True), True)[1],
        store_updated=SimpleNamespace(connect=lambda *_: None),
    )
    view = WorkspaceView(store, run_bridge=bridge)  # type: ignore[arg-type]
    qtbot.addWidget(view)
    view.show()
    store.set_verifier(
        VerifierSummary(active=True, check="pytest", index=1, total=1, started_at=time.time()),
    )

    click_by_name(qtbot, view, "Skip the running check", QPushButton)

    assert calls == [True]
    # The press is acknowledged rather than left looking ignored while the
    # runner takes a moment to record the skip.
    assert find_by_accessible_name(view, "Skip the running check", QPushButton).isEnabled() is False


@verifies(SWR.SWR_2610)
def test_the_header_recovers_once_the_skipped_check_settles(qtbot: QtBot) -> None:
    """Skip stops one check, not the suite: the next one is skippable too."""
    store = WorkspaceStore()
    bridge = SimpleNamespace(
        skip_verifier_check=lambda: True,
        store_updated=SimpleNamespace(connect=lambda *_: None),
    )
    view = WorkspaceView(store, run_bridge=bridge)  # type: ignore[arg-type]
    qtbot.addWidget(view)
    view.show()
    store.set_verifier(
        VerifierSummary(active=True, check="pytest", index=1, total=2, started_at=time.time()),
    )
    click_by_name(qtbot, view, "Skip the running check", QPushButton)

    # The runner stopped that check and moved on, which is what the user is
    # waiting to see — a header stuck on "stopping" is the bug this guards.
    store.set_verifier(
        VerifierSummary(active=True, check="ruff", index=2, total=2, started_at=time.time()),
    )

    label = find_by_accessible_name(view, "Verification status", QLabel)
    assert label.text().startswith("Verifying — ruff (2/2)")
    assert find_by_accessible_name(view, "Skip the running check", QPushButton).isEnabled() is True
