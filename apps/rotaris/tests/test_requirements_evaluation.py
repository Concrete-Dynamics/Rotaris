"""Productive use: a rebase lands twenty refs in half a second while the board is open.
Expected outcome: one evaluation, not twenty and not one-then-nineteen-lost. The board
used to refresh on the first notification and drop every event that arrived while that
pass was reading — so after a storm it showed the repository as it was when the storm
began. The evaluator coalesces instead (SWR-3210)."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex

from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirement_queue import load_evaluation_policy

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.delivery.projection import BoardProjection

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 16, 12, 0, tzinfo=dt.UTC)


def _board() -> BoardProjection:
    requirement = CanonicalRequirement(
        req_id="SWR-1",
        title="One",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
    )
    return project_board(BoardInputs(index=RequirementIndex(requirements=(requirement,))))


class _CountingSource:
    """A board source that remembers how often it was asked."""

    def __init__(self) -> None:
        self.projection = _board()
        self.reads = 0

    def project(self) -> BoardProjection:
        self.reads += 1
        return self.projection


class _Clock:
    """A clock the test moves, so a debounce window can be closed on purpose."""

    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> dt.datetime:
        return self.now

    def advance(self, ms: int) -> None:
        self.now += dt.timedelta(milliseconds=ms)


def _controller(tmp_path: Path, clock: _Clock, source: _CountingSource) -> RequirementsController:
    return RequirementsController(
        WorkspaceStore(),
        workspace=tmp_path,
        source=source,
        clock=clock,
    )


@verifies(SWR.SWR_3210)
def test_a_burst_of_repository_events_becomes_one_evaluation(qtbot, tmp_path: Path) -> None:
    """Productive use: a rebase fires twenty git notifications inside the window.
    Expected outcome: one pass. Twenty would read the repository twenty times for a
    repository that moved once."""
    clock, source = _Clock(), _CountingSource()
    controller = _controller(tmp_path, clock, source)
    qtbot.addWidget(controller.surface)

    for _ in range(20):
        assert controller.submit_evaluation("commit", "a ref moved") is True
        clock.advance(10)

    evaluator = controller._evaluation()  # noqa: SLF001 - the policy under test
    assert evaluator is not None
    assert len(evaluator.pending) == 20
    assert evaluator.due(clock.now) is False

    clock.advance(2000)
    assert evaluator.due(clock.now) is True
    controller.shutdown()


@verifies(SWR.SWR_3210)
def test_an_event_arriving_during_a_pass_is_held_rather_than_dropped(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a second commit lands while the board is still reading the first.
    Expected outcome: it is still pending afterwards. This is the case the old code
    lost — it returned early whenever the bridge was busy, so the board settled on a
    repository state that was already out of date."""
    clock, source = _Clock(), _CountingSource()
    controller = _controller(tmp_path, clock, source)
    qtbot.addWidget(controller.surface)
    evaluator = controller._evaluation()  # noqa: SLF001 - the policy under test
    assert evaluator is not None

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    controller.submit_evaluation("commit", "a second commit")

    assert len(evaluator.pending) == 1
    controller.shutdown()


@verifies(SWR.SWR_3210)
def test_the_events_a_finished_pass_answered_are_cleared(qtbot, tmp_path: Path) -> None:
    """Productive use: the burst's pass lands.
    Expected outcome: the pending events are gone, so the next burst debounces from
    empty instead of replaying the one that was already answered."""
    clock, source = _Clock(), _CountingSource()
    controller = _controller(tmp_path, clock, source)
    qtbot.addWidget(controller.surface)
    evaluator = controller._evaluation()  # noqa: SLF001 - the policy under test
    assert evaluator is not None
    controller.submit_evaluation("commit", "a ref moved")
    assert len(evaluator.pending) == 1

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()

    assert evaluator.pending == ()
    controller.shutdown()


@verifies(SWR.SWR_3210, SWR.SWR_3117)
def test_a_workspace_can_switch_a_trigger_off(qtbot, tmp_path: Path) -> None:
    """Productive use: a project that does not want a commit to re-read the board.
    Expected outcome: the event is refused and nothing is armed. The vocabulary is the
    configuration's own, so switching one off needs no translation table."""
    (tmp_path / ".rotaris").mkdir()
    (tmp_path / ".rotaris" / "agents.yaml").write_text(
        "requirements:\n  refresh:\n    triggers: [manual]\n",
        encoding="utf-8",
    )
    controller = _controller(tmp_path, _Clock(), _CountingSource())
    qtbot.addWidget(controller.surface)

    assert controller.submit_evaluation("commit", "a ref moved") is False
    assert controller.submit_evaluation("manual", "the user pressed refresh") is True
    controller.shutdown()


@verifies(SWR.SWR_3210, SWR.SWR_3117)
def test_the_policy_is_the_workspaces_own_and_degrades_to_the_documented_defaults(
    tmp_path: Path,
) -> None:
    """Productive use: a workspace with no configuration, and one with a broken block.
    Expected outcome: both get 400 ms and every trigger — the schema's documented
    defaults rather than a guess at what was meant."""
    assert load_evaluation_policy(tmp_path) == (400, load_evaluation_policy(None)[1])
    assert load_evaluation_policy(None)[0] == 400

    (tmp_path / ".rotaris").mkdir()
    (tmp_path / ".rotaris" / "agents.yaml").write_text(
        "requirements:\n  refresh:\n    debounce_ms: not-a-number\n",
        encoding="utf-8",
    )

    assert load_evaluation_policy(tmp_path)[0] == 400


@verifies(SWR.SWR_3210, SWR.SWR_3117)
def test_a_configured_debounce_is_what_the_window_uses(qtbot, tmp_path: Path) -> None:
    """Productive use: a workspace widens the window because its hooks are chatty.
    Expected outcome: the evaluator waits that long, not the default."""
    (tmp_path / ".rotaris").mkdir()
    (tmp_path / ".rotaris" / "agents.yaml").write_text(
        "requirements:\n  refresh:\n    debounce_ms: 5000\n",
        encoding="utf-8",
    )
    clock = _Clock()
    controller = _controller(tmp_path, clock, _CountingSource())
    qtbot.addWidget(controller.surface)
    controller.submit_evaluation("commit", "a ref moved")
    evaluator = controller._evaluation()  # noqa: SLF001 - the policy under test
    assert evaluator is not None

    clock.advance(1000)
    assert evaluator.due(clock.now) is False
    clock.advance(4500)
    assert evaluator.due(clock.now) is True
    controller.shutdown()


@verifies(SWR.SWR_3210)
def test_a_controller_without_a_workspace_has_no_evaluator(qtbot) -> None:
    """Productive use: the window opens before a workspace is chosen.
    Expected outcome: nothing is armed and nothing raises — there is no repository
    for an event to be about."""
    controller = RequirementsController(WorkspaceStore(), workspace=None)
    qtbot.addWidget(controller.surface)

    assert controller.submit_evaluation("commit", "a ref moved") is False
    controller.shutdown()
