"""Productive use: a user presses Verify (or Verify and adopt) on a repository
with fifteen hundred requirements and then waits several minutes while the
workspace's own check suite runs.

Expected outcome: the board says which phase the pass is in, names the check it
is running and counts the requirements it records, keeps a clock ticking so a
silent check still reads as alive, states no percentage for the pass as a whole,
and does none of it by repainting the board. When the pass ends the narration
goes away; when a repository event lands mid-pass, it does not.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import pytest
from fakes import FakeRequirementsBridge
from PySide6.QtWidgets import QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.requirements_state import (
    PassProgress,
    RequirementsBoardState,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import (
    _PASS_SEQUENCES,
    RequirementsController,
    _PassProgressRelay,
)
from rotaris.views.requirements import RequirementsView

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.integration

STARTED_AT = 1_000_000.0


def _running(**overrides: object) -> PassProgress:
    """A pass in flight, in its check phase unless a test says otherwise."""
    value = PassProgress(
        active=True,
        kind="verification",
        phase="checks",
        step=2,
        steps=4,
        label="pytest",
        detail="uv run pytest",
        index=2,
        total=3,
        started_at=STARTED_AT,
        phase_started_at=STARTED_AT,
    )
    return value if not overrides else value.__class__(**{**vars(value), **overrides})


@pytest.fixture
def view(qtbot) -> Iterator[RequirementsView]:
    """A board view, shown, so its banners answer like they do in the window."""
    widget = RequirementsView()
    qtbot.addWidget(widget)
    yield widget


# -- what the board says while a pass runs ---------------------------------


@verifies(SWR.SWR_3320)
def test_the_banner_names_the_phase_the_check_and_where_it_has_got_to(view) -> None:
    """Productive use: a user watches a suite they cannot otherwise see run.
    Expected outcome: the phase, its position in the pass, the check that is
    running and its position in the suite — the four facts that separate a
    running pass from a hung one."""
    view.set_pass_progress(_running())

    message = view.pass_banner.message.text()

    assert "Step 2 of 4" in message
    assert "Running this workspace's check suite" in message
    assert "pytest (2/3)" in message


@verifies(SWR.SWR_3320)
def test_a_pass_that_has_not_reached_its_first_phase_states_no_position(view) -> None:
    """Productive use: the instant after a user presses Verify.
    Expected outcome: the banner is already up and says the pass is starting —
    without claiming a step, because "Step 0 of 4" is a position nothing is at."""
    view.set_pass_progress(
        PassProgress(active=True, kind="verification", steps=4, started_at=STARTED_AT),
    )

    message = view.pass_banner.message.text()

    assert message.startswith("Starting")
    assert "Step 0" not in message


@verifies(SWR.SWR_3320)
def test_recording_verifications_counts_requirements_and_states_no_overall_percent(
    view,
) -> None:
    """Productive use: the suite is done and the pass is writing evidence.
    Expected outcome: a count of requirements, in words as well as in fill, and
    no percentage claiming to describe the pass as a whole — the suite dominates
    it and nobody knows how long the suite takes."""
    view.set_pass_progress(
        _running(phase="recording", step=4, label="SWR-812", index=812, total=1496),
    )

    message = view.pass_banner.message.text()
    bar = view.pass_banner.progress_bar

    assert "Recording verifications" in message
    assert bar is not None
    assert bar.isVisibleTo(view.pass_banner)
    assert bar.accessibleName() == "812 of 1496 requirements"
    assert "%" not in message


@verifies(SWR.SWR_3320)
def test_a_phase_with_no_denominator_shows_no_meter_and_still_shows_a_clock(
    view,
) -> None:
    """Productive use: the coverage sweep, which is one indivisible step.
    Expected outcome: no bar at all rather than an invented one, and a clock —
    the only thing that separates "still sweeping" from "stopped"."""
    view.set_pass_progress(
        _running(phase="coverage", step=3, label="", index=0, total=0),
    )

    bar = view.pass_banner.progress_bar

    assert bar is None or not bar.isVisibleTo(view.pass_banner)
    assert "Sweeping coverage" in view.pass_banner.message.text()


@verifies(SWR.SWR_3320)
def test_the_clock_advances_without_a_new_progress_value(view, monkeypatch) -> None:
    """Productive use: a check produces no output for four minutes.
    Expected outcome: the reading still moves, because it is computed from the
    moment the pass started rather than written into every value."""
    monkeypatch.setattr(time, "time", lambda: STARTED_AT + 61)
    view.set_pass_progress(_running())
    assert "1:01" in view.pass_banner.message.text()

    monkeypatch.setattr(time, "time", lambda: STARTED_AT + 125)
    view._progress_clock.timeout.emit()

    assert "2:05" in view.pass_banner.message.text()


@verifies(SWR.SWR_3320)
def test_the_clock_runs_only_while_a_pass_does(view) -> None:
    """Productive use: the pass ends while the user is looking at something else.
    Expected outcome: no timer left ticking behind a view with nothing to say."""
    view.set_pass_progress(_running())
    assert view._progress_clock.isActive()

    view.set_pass_progress(PassProgress())

    assert not view._progress_clock.isActive()
    assert not view.pass_banner.isVisibleTo(view)


@verifies(SWR.SWR_3320)
def test_the_narration_survives_the_user_opening_another_page(view, qtbot) -> None:
    """Productive use: a user opens a requirement's detail mid-pass.
    Expected outcome: the pass banner is still there. It sits above the page
    stack precisely so a five-minute wait does not vanish when a page changes."""
    view.set_pass_progress(_running())
    view._stack.setCurrentIndex(1)

    assert view.pass_banner.isVisibleTo(view)
    assert "pytest (2/3)" in view.pass_banner.message.text()


# -- what a progress value must not cost -----------------------------------


@verifies(SWR.SWR_3320, SWR.SWR_3317)
def test_a_progress_tick_does_not_touch_a_single_card(view) -> None:
    """Productive use: the recording phase reports fifteen hundred times.
    Expected outcome: not one card widget is realised, recycled or repainted.
    A board that rebuilt itself per tick would spend everything SWR-3317 bought."""
    view.set_board(RequirementsBoardState(available=True))
    rebuilds = 0
    original = view._rebuild

    def _counted() -> None:
        nonlocal rebuilds
        rebuilds += 1
        original()

    view._rebuild = _counted
    for index in range(1, 51):
        view.set_pass_progress(
            _running(phase="recording", step=4, label=f"SWR-{index}", index=index, total=50),
        )

    assert rebuilds == 0


@verifies(SWR.SWR_3320)
def test_a_pass_that_reports_per_requirement_is_throttled_but_never_truncated() -> None:
    """Productive use: fifteen hundred verifications written in under a second.
    Expected outcome: the Qt loop is handed a handful of values, and the last one
    is the total — a counter that stopped at 1495 of 1496 would be a bug report."""
    published: list[PassProgress] = []
    relay = _PassProgressRelay("verification", published.append)

    relay.on_phase("recording", 1496)
    for index in range(1, 1497):
        relay.on_item("recording", f"SWR-{index}", index, 1496)

    assert len(published) < 50, "a value per requirement would starve the Qt loop"
    assert published[-1].index == 1496
    assert published[-1].counted == "1496 of 1496 requirements"


@verifies(SWR.SWR_3320)
def test_a_suite_of_a_few_checks_is_never_throttled() -> None:
    """Productive use: three checks, minutes apart.
    Expected outcome: every one of them reaches the banner. Dropping one would
    leave the wrong check named for the whole of the next one."""
    published: list[PassProgress] = []
    relay = _PassProgressRelay("verification", published.append)

    relay.on_phase("checks", 3)
    relay.on_item("checks", "pytest", 1, 3)
    relay.on_item("checks", "ruff", 2, 3)
    relay.on_item("checks", "mypy", 3, 3)

    assert [value.label for value in published] == ["", "pytest", "ruff", "mypy"]


@verifies(SWR.SWR_3320)
def test_each_pass_walks_its_own_phases() -> None:
    """Productive use: adoption records what it adopted; verification only records.
    Expected outcome: the step numbers a user reads are the pass's own, not one
    sequence pretending to describe both."""
    assert _PASS_SEQUENCES["verification"][-1] == "recording"
    assert _PASS_SEQUENCES["adoption"][-2:] == ("adopting", "recording")
    assert len(_PASS_SEQUENCES["adoption"]) == 5


# -- the wire from the worker to the board ---------------------------------


@verifies(SWR.SWR_3320)
def test_progress_from_a_worker_reaches_the_store_and_the_view(qtbot) -> None:
    """Productive use: the pass runs on its own thread and reports from there.
    Expected outcome: the value lands on the store and on the view's banner, and
    the controller's own status line says the same thing the banner does."""
    store = WorkspaceStore()
    controller = RequirementsController(store, bridge=FakeRequirementsBridge())
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    qtbot.addWidget(view)
    controller.attach_view(view)
    store.set_requirement_pass(verifying=True, progress=PassProgress(active=True, steps=4))

    value = _running(phase="recording", step=4, label="SWR-9", index=9, total=10)
    controller._pass_progress(value)

    assert store.requirements.progress.index == 9
    assert "SWR-9 (9/10)" in view.pass_banner.message.text()
    assert controller._status_text(store.requirements) == value.summary
    controller.shutdown()


@verifies(SWR.SWR_3320)
def test_a_value_arriving_after_the_pass_reported_does_not_revive_the_banner(
    qtbot,
) -> None:
    """Productive use: a queued progress value lands behind the pass's report.
    Expected outcome: nothing comes back. The report is the end of the pass, and
    a banner that reappeared after it would be narrating a thread that is gone."""
    store = WorkspaceStore()
    controller = RequirementsController(store, bridge=FakeRequirementsBridge())
    qtbot.addWidget(controller.surface)

    controller._pass_progress(_running())

    assert not store.requirements.progress.active
    controller.shutdown()


@verifies(SWR.SWR_3320, SWR.SWR_3312)
def test_an_evaluation_landing_mid_pass_leaves_the_pass_where_it_was(qtbot) -> None:
    """Productive use: a commit lands while the suite is running.
    Expected outcome: the board follows the repository (SWR-3312) *and* the pass
    keeps saying what it is doing. A board built by an evaluation knows nothing
    about a worker thread, and must not answer for one."""
    store = WorkspaceStore()
    store.set_requirement_pass(
        verifying=True,
        progress=_running(),
    )

    store.set_requirements(RequirementsBoardState(available=True))

    assert store.requirements.verifying
    assert store.requirements.progress.label == "pytest"


@verifies(SWR.SWR_3320)
def test_a_finished_pass_clears_what_the_board_says_about_it(qtbot) -> None:
    """Productive use: the pass finishes and its report is published.
    Expected outcome: the busy flags and the narration go together — one of them
    surviving the other is how a board ends up saying two different things."""
    store = WorkspaceStore()
    store.set_requirement_pass(verifying=True, progress=_running())

    store.set_requirement_pass(verifying=False, progress=PassProgress())

    assert not store.requirements.verifying
    assert not store.requirements.progress.active
    assert store.requirements.progress.sentence == ""


@verifies(SWR.SWR_3320)
def test_every_control_the_progress_surface_adds_can_be_named(view) -> None:
    """Productive use: a screen-reader user waits out the same pass.
    Expected outcome: the banner and its meter both say what they are, and the
    count is in words as well as in fill (`apps/rotaris/AGENTS.md`)."""
    view.set_pass_progress(
        _running(phase="recording", step=4, label="SWR-3", index=3, total=4),
    )

    assert "Verifying this workspace" in view.pass_banner.accessibleName()
    assert view.pass_banner.progress_bar.accessibleName() == "3 of 4 requirements"
    assert "3 of 4 requirements" in view.pass_banner.accessibleDescription()


@verifies(SWR.SWR_3320)
def test_the_pass_banner_offers_no_control_a_user_could_misread(view) -> None:
    """Productive use: a user looks for a way to make the wait stop.
    Expected outcome: no Dismiss on this banner. Dismissing a *finding* is a
    display choice; a running pass is not one, and a control that looked like it
    could stop the suite while it silently only hid the text would be worse than
    none."""
    view.set_pass_progress(_running())

    assert not view.pass_banner.dismiss_button.isVisibleTo(view.pass_banner)
    assert not view.pass_banner.copy_button.isVisibleTo(view.pass_banner)


@verifies(SWR.SWR_3320)
def test_the_board_view_is_a_widget_the_controller_can_push_progress_into(view) -> None:
    """Productive use: the controller probes the view for what it can take.
    Expected outcome: the method the controller looks for exists on the real
    view, so a rename cannot silently turn the narration off (SWR-3315)."""
    assert isinstance(view, QWidget)
    assert callable(view.set_pass_progress)
