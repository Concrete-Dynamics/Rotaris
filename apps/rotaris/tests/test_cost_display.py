"""Cost surfaces in the Rotaris chrome and dashboard (SWR-841).

An unpriceable model must read as unknown, never as a free run.
"""

from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

import pytest
from PySide6.QtCore import Qt
from rotaris_core.cost import CostSnapshot, CostSource, format_cost
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState

from rotaris.models.state import KpiSnapshot
from rotaris.models.store import WorkspaceStore
from rotaris.services.session_projection import (
    SessionProjectionContext,
    build_session_projection,
)
from rotaris.views.chrome import StatusBar
from rotaris.views.dashboard import DashboardView

pytestmark = pytest.mark.integration


def _session(cost: CostSnapshot) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id="cost-session",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
        global_cost=cost,
    )


@verifies(SWR.SWR_835, SWR.SWR_841)
def test_projection_carries_a_prerendered_cost_label() -> None:
    state = _session(
        CostSnapshot(accumulated_cost=0.25, priced_calls=3, source=CostSource.CONFIGURED)
    )

    projection = build_session_projection(state, None, SessionProjectionContext(), [])

    assert projection.kpis.cumulative_cost_label == "$0.2500 (configured)"


@verifies(SWR.SWR_841)
def test_projection_of_an_unpriced_run_is_not_zero() -> None:
    state = _session(CostSnapshot(unpriced_calls=7, source=CostSource.UNAVAILABLE))

    projection = build_session_projection(state, None, SessionProjectionContext(), [])

    assert projection.kpis.cumulative_cost_label == "n/a"
    assert "0.00" not in projection.kpis.cumulative_cost_label


@verifies(SWR.SWR_841)
def test_projection_tolerates_a_state_without_cost() -> None:
    """Snapshots written before cost telemetry must still project, not crash."""
    now = dt.datetime.now(dt.UTC)
    legacy = SessionState(
        session_id="legacy",
        workspace_root="/tmp/workspace",
        created_at=now,
        updated_at=now,
    )
    stripped = SimpleNamespace(**legacy.model_dump())
    stripped.global_token_usage = legacy.global_token_usage
    stripped.agent_metrics = {}
    del stripped.global_cost

    projection = build_session_projection(stripped, None, SessionProjectionContext(), [])

    assert projection.kpis.cumulative_cost_label == "—"


@verifies(SWR.SWR_841)
def test_status_bar_renders_unavailable_cost(qtbot) -> None:
    store = WorkspaceStore()
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    store.set_kpis(
        KpiSnapshot(
            cumulative_tokens=12_000,
            cumulative_cost_label=format_cost(
                CostSnapshot(unpriced_calls=4, source=CostSource.UNAVAILABLE)
            ),
        )
    )
    bar.refresh()

    assert bar.cost_label.text() == "n/a cost"


@verifies(SWR.SWR_839, SWR.SWR_841)
def test_status_bar_renders_a_priced_cost(qtbot) -> None:
    store = WorkspaceStore()
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    store.set_kpis(
        KpiSnapshot(
            cumulative_tokens=12_000,
            cumulative_cost_label=format_cost(
                CostSnapshot(accumulated_cost=1.5, priced_calls=6, source=CostSource.PROVIDER)
            ),
        )
    )
    bar.refresh()

    assert bar.cost_label.text() == "$1.5000 cost"


@verifies(SWR.SWR_841)
def test_status_bar_shows_no_cost_item_until_something_reports_one(qtbot) -> None:
    """A window that has never run anything has no cost to state.

    The projection renders every cost it can, "n/a" and "—" included; an empty
    label is the fourth case, where no session has reported usage at all. The
    strip used to render that as the bare word "cost" with nothing in front of
    it — a label whose value the reader was left to guess.
    """
    store = WorkspaceStore()
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    assert bar.cost_label.text() == ""
    assert bar.cost_label.isHidden()

    store.set_kpis(
        KpiSnapshot(
            cumulative_tokens=12_000,
            cumulative_cost_label=format_cost(
                CostSnapshot(accumulated_cost=1.5, priced_calls=6, source=CostSource.PROVIDER)
            ),
        )
    )

    assert bar.cost_label.text() == "$1.5000 cost"
    assert not bar.cost_label.isHidden()
    assert "$1.5000" in bar.cost_label.toolTip()
    assert bar.cost_label.accessibleName() == "Cost so far"
    # And it stays a reading. The strip's actionable items are drawn as links
    # (SWR-2509); a cost has nowhere to go, so it must not be dressed as though
    # it had — the number is the whole answer.
    assert "<a href=" not in bar.cost_label.text()
    assert bar.cost_label.cursor().shape() == Qt.CursorShape.ArrowCursor


@verifies(SWR.SWR_841)
def test_dashboard_kpi_shows_cost_beside_tokens(qtbot) -> None:
    store = WorkspaceStore()
    view = DashboardView(store)
    qtbot.addWidget(view)

    store.set_kpis(
        KpiSnapshot(
            cumulative_tokens=12_000,
            cumulative_cost_label=format_cost(
                CostSnapshot(unpriced_calls=4, source=CostSource.UNAVAILABLE)
            ),
        )
    )
    view.refresh()

    assert view.kpi_tokens_cost.text() == "cost n/a"


@verifies(SWR.SWR_841)
def test_dashboard_cost_label_defaults_to_empty_without_data(qtbot) -> None:
    """A store that has never seen a run must not claim a cost either way."""
    store = WorkspaceStore()
    view = DashboardView(store)
    qtbot.addWidget(view)

    assert "$" not in view.kpi_tokens_cost.text()
