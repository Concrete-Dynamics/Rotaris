"""Productive use: a user releases a requirement, walks away, and later opens Rotaris to a
session list holding both the runs they started themselves and the ones a requirement
started. They need to tell them apart, and to find "the run that implemented SWR-3416"
without opening a session directory.
Expected outcome: a requirement-started session states its requirement and its unit
wherever sessions are listed — the sidebar, the dashboard and the sessions browser — and is
searchable by either; a run a person started renders nothing at all for it, no placeholder
and no empty badge; and a session directory written before requirement runs existed still
lists, with the attribution simply absent."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from fakes import FakeCoordinatorBridge, FakeRunConfigService
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import SessionInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_coordinator import RunCoordinator
from rotaris.views.dashboard import _session_row as _dashboard_row
from rotaris.views.main_window import _SessionsDialog
from rotaris.views.workspace import _session_row as _sidebar_row

pytestmark = pytest.mark.integration

REQ = "SWR-3416"
UNIT = "swr-3416-impl-a1b2c3d4"

#: The sidebar's elision budget at the 1000x680 minimum window (SWR-3011): the
#: narrowest a row is ever drawn, and therefore where a badge that grew the row
#: would show up first.
NARROW = 200


class _StubSessionManager:
    def __init__(self, items: list[dict[str, Any]]) -> None:
        self._items = items

    def list_sessions(self) -> list[dict[str, Any]]:
        return self._items


def _metadata(session_id: str, **extra: Any) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "updated_at": dt.datetime.now(dt.UTC).isoformat(),
        "execution_status": "completed",
        **extra,
    }


def _refresh(store: WorkspaceStore, items: list[dict[str, Any]], tmp_path: Any) -> None:
    service = ConfigService(tmp_path, store)
    service.session_manager = _StubSessionManager(items)
    service.refresh_sessions()


def _session(**extra: Any) -> SessionInfo:
    values: dict[str, Any] = {
        "id": "20260815-121200-aaaaaaaaaaaa",
        "name": "Implement the run seam",
        "status": "completed",
        "branch": "rotaris/req/swr-3416",
    }
    values.update(extra)
    return SessionInfo(**values)


def _label_texts(widget: Any) -> list[str]:
    return [label.text() for label in widget.findChildren(QLabel)]


def _switch(row: Any) -> QPushButton:
    """The row's own name button — the control that focuses the run."""
    return next(
        button
        for button in row.findChildren(QPushButton)
        if button.accessibleName().startswith("Switch to session")
    )


# --------------------------------------------------------------------------
# the value itself
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3612)
def test_a_run_a_person_started_has_no_attribution_to_render() -> None:
    """Empty means "a human started this", not "unknown" — so there is nothing to draw."""
    assert _session().attribution == ""
    assert _session(requirement_id="", unit_id=UNIT).attribution == ""


@verifies(SWR.SWR_3612)
def test_the_attribution_states_the_requirement_and_the_unit() -> None:
    """Both facts, in one string every surface can render or search."""
    assert _session(requirement_id=REQ).attribution == REQ
    assert _session(requirement_id=REQ, unit_id=UNIT).attribution == f"{REQ} · {UNIT}"


# --------------------------------------------------------------------------
# from metadata.json to the store
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3612)
def test_refreshed_sessions_carry_the_requirement_and_unit_from_metadata(tmp_path) -> None:
    """The one thing ``list_sessions`` reads is metadata.json, so this is the whole path."""
    store = WorkspaceStore()
    _refresh(
        store,
        [
            _metadata("20260815-121200-aaaaaaaaaaaa", requirement_id=REQ, unit_id=UNIT),
            _metadata("20260815-121300-bbbbbbbbbbbb"),
        ],
        tmp_path,
    )

    rows = {session.id: session for session in store.sessions}
    assert rows["20260815-121200-aaaaaaaaaaaa"].requirement_id == REQ
    assert rows["20260815-121200-aaaaaaaaaaaa"].unit_id == UNIT
    # A run a person started: both empty, and nothing to render.
    assert rows["20260815-121300-bbbbbbbbbbbb"].requirement_id == ""
    assert rows["20260815-121300-bbbbbbbbbbbb"].attribution == ""


@verifies(SWR.SWR_3612)
def test_a_session_written_before_requirement_runs_existed_still_lists(tmp_path) -> None:
    """A missing key costs that row its badge, never the user their session list."""
    store = WorkspaceStore()
    _refresh(
        store,
        [
            _metadata("20260815-121200-aaaaaaaaaaaa"),
            _metadata("20260815-121300-bbbbbbbbbbbb", requirement_id=REQ),
        ],
        tmp_path,
    )

    assert len(store.sessions) == 2
    assert all(session.unit_id == "" for session in store.sessions)


@verifies(SWR.SWR_3612)
def test_a_requirement_run_is_never_briefly_anonymous(tmp_path, qtbot) -> None:
    """The launcher knows what the run is for before the first metadata write does."""
    store = WorkspaceStore()
    coordinator = RunCoordinator(
        tmp_path, store, FakeRunConfigService(), bridge_factory=FakeCoordinatorBridge
    )

    session_id = coordinator.launch_new(
        "Implement the run seam",
        requirement_id=REQ,
        unit_id=UNIT,
    )

    row = next(session for session in store.sessions if session.id == session_id)
    assert row.requirement_id == REQ
    assert row.unit_id == UNIT


@verifies(SWR.SWR_3612)
def test_a_run_started_from_the_composer_claims_no_requirement(tmp_path, qtbot) -> None:
    """The default is what a person typing into the composer means."""
    store = WorkspaceStore()
    coordinator = RunCoordinator(
        tmp_path, store, FakeRunConfigService(), bridge_factory=FakeCoordinatorBridge
    )

    session_id = coordinator.launch_new("Fix the login token refresh bug")

    row = next(session for session in store.sessions if session.id == session_id)
    assert row.attribution == ""


@verifies(SWR.SWR_3612)
def test_the_attribution_survives_a_refresh_that_raced_the_first_write(tmp_path) -> None:
    """A refresh against attribution-less metadata must not strip the badge off."""
    store = WorkspaceStore()
    session_id = "20260815-121400-cccccccccccc"
    store.upsert_session(
        SessionInfo(
            id=session_id,
            name="Implement the run seam",
            status="starting",
            requirement_id=REQ,
            unit_id=UNIT,
        )
    )

    _refresh(store, [_metadata(session_id)], tmp_path)

    row = next(session for session in store.sessions if session.id == session_id)
    assert row.requirement_id == REQ
    assert row.unit_id == UNIT


# --------------------------------------------------------------------------
# where sessions are listed
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3612)
def test_the_sidebar_row_badges_the_requirement_and_names_the_unit(qtbot) -> None:
    """Acceptance criterion 2, in the switcher a user has open all day."""
    row = _sidebar_row(_session(requirement_id=REQ, unit_id=UNIT), lambda _sid: None)
    qtbot.addWidget(row)

    assert REQ in _label_texts(row)
    badge = next(label for label in row.findChildren(QLabel) if label.text() == REQ)
    # The unit is too long for a sidebar row, so it lives where there is room.
    assert UNIT in badge.accessibleName()
    assert UNIT in badge.toolTip()
    assert f"{REQ} · {UNIT}" in _switch(row).toolTip()


@verifies(SWR.SWR_3612)
def test_the_sidebar_row_of_a_human_run_draws_no_badge_at_all(qtbot) -> None:
    """No placeholder and no empty pill: absence is the message."""
    row = _sidebar_row(_session(), lambda _sid: None)
    qtbot.addWidget(row)

    assert REQ not in " ".join(_label_texts(row))
    assert all("Requirement" not in label.accessibleName() for label in row.findChildren(QLabel))


@verifies(SWR.SWR_3612, SWR.SWR_3011)
def test_the_badge_takes_its_width_from_the_name_not_from_the_panel(qtbot) -> None:
    """Measured, not assumed: at the 1000x680 minimum the row must still fit.

    The name is what gives way — the row never grows to hold both, which is the
    property that keeps a requirement badge from widening the window minimum.
    """
    name = "Implement the requirement run seam and its headless consumer"
    attributed = _sidebar_row(
        _session(name=name, requirement_id=REQ, unit_id=UNIT, focused=True),
        lambda _sid: None,
        NARROW,
    )
    plain = _sidebar_row(_session(name=name, focused=True), lambda _sid: None, NARROW)
    qtbot.addWidget(attributed)
    qtbot.addWidget(plain)

    drawn = _switch(attributed)
    assert drawn.text() != name, "a name wider than the budget is elided, never clipped"
    assert len(drawn.text()) < len(_switch(plain).text())
    assert drawn.fontMetrics().horizontalAdvance(drawn.text()) <= NARROW


@verifies(SWR.SWR_3612)
def test_a_focused_requirement_run_says_both_things(qtbot) -> None:
    """Setting one accessible description must not silently drop the other."""
    row = _sidebar_row(_session(requirement_id=REQ, unit_id=UNIT, focused=True), lambda _sid: None)
    qtbot.addWidget(row)

    described = _switch(row).accessibleDescription()
    assert "Currently focused run" in described
    assert REQ in described


@verifies(SWR.SWR_3612)
def test_the_dashboard_row_badges_the_requirement(qtbot) -> None:
    """The other place runs are listed, with the same rule."""
    attributed = _dashboard_row(
        _session(requirement_id=REQ, unit_id=UNIT), lambda _sid: None, lambda _sid: None
    )
    plain = _dashboard_row(_session(), lambda _sid: None, lambda _sid: None)
    qtbot.addWidget(attributed)
    qtbot.addWidget(plain)

    assert REQ in _label_texts(attributed)
    assert REQ not in " ".join(_label_texts(plain))


@verifies(SWR.SWR_3612)
def test_the_sessions_browser_states_the_requirement_and_the_unit(qtbot) -> None:
    """The full-width listing has room for both, so it shows both."""
    store = WorkspaceStore()
    store.set_sessions(
        [
            _session(requirement_id=REQ, unit_id=UNIT),
            _session(
                id="20260815-121300-bbbbbbbbbbbb",
                name="Fix the login bug",
                branch="main",
            ),
        ]
    )
    dialog = _SessionsDialog(store)
    qtbot.addWidget(dialog)

    rows = [dialog.sessions.item(index).text() for index in range(dialog.sessions.count())]
    attributed = next(row for row in rows if REQ in row)
    assert UNIT in attributed
    # The run a person started gains no column, no dash and no empty field.
    plain = next(row for row in rows if "Fix the login bug" in row)
    assert REQ not in plain
    assert " ·" not in plain


@verifies(SWR.SWR_3612)
def test_the_sessions_browser_finds_a_run_by_its_requirement_or_unit(qtbot) -> None:
    """Which run implemented SWR-3416, answered from the list a user already has open."""
    store = WorkspaceStore()
    store.set_sessions(
        [
            _session(requirement_id=REQ, unit_id=UNIT),
            _session(
                id="20260815-121300-bbbbbbbbbbbb",
                name="Fix the login bug",
                branch="main",
            ),
        ]
    )
    dialog = _SessionsDialog(store)
    qtbot.addWidget(dialog)

    dialog.search.setText(REQ.casefold())
    assert dialog.sessions.count() == 1

    dialog.search.setText(UNIT)
    assert dialog.sessions.count() == 1

    dialog.search.setText("login")
    assert dialog.sessions.count() == 1
