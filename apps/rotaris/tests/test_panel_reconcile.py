"""Productive use: a run reports an agent's progress while the user watches it.
Expected outcome: the panels showing that agent cost what moved, not what they hold.

The store's change signals carry no payload — ``agents_changed`` says "something
about some agent moved" — so a panel that answers it by tearing its rows down
and building them again pays for the whole panel on every token. Measured on the
machine this was written on: building an agent row costs about 3 ms and updating
one about 0.02 ms, and three agent trees are alive at once because the workspace,
the dashboard and the mission view each hold one from startup (SWR-2454).

These tests are about identity and about count. A reconciled panel keeps the
widget objects it already had, so ``is`` is the assertion that says work was
skipped — a value assertion would pass just as well against a rebuild.
"""

from __future__ import annotations

import pytest
from PySide6.QtWidgets import QLabel, QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import AgentNode, AgentState, TodoItem
from rotaris.models.store import WorkspaceStore, sample_store
from rotaris.views.workspace import WorkspaceView
from rotaris.widgets.reflow import Coalescer, HiddenPanelReflow
from rotaris.widgets.tree import AgentTreeList

pytestmark = pytest.mark.unit


def _tree(qtbot, store: WorkspaceStore) -> AgentTreeList:
    """A shown agent tree. Shown because a hidden one holds its work back."""
    tree = AgentTreeList(store)
    qtbot.addWidget(tree)
    tree.show()
    qtbot.waitExposed(tree)
    return tree


def _rows(tree: AgentTreeList) -> list[QWidget]:
    return [
        widget
        for index in range(tree._layout.count())
        if (widget := tree._layout.itemAt(index).widget()) is not None
    ]


# ── the agent tree ────────────────────────────────────────────────────────


@verifies(SWR.SWR_2454, SWR.SWR_2122)
def test_an_agent_reporting_progress_keeps_the_row_it_already_had(qtbot) -> None:
    """The reported defect's shape: elapsed time ticks, the row must not be rebuilt."""
    store = sample_store()
    tree = _tree(qtbot, store)
    before = _rows(tree)
    assert before, "the fixture has agents, so the tree has rows"

    agent = store.agents["coding-agent-1"]
    agent.elapsed = "14m 41s"
    agent.tool_calls += 1
    tree.refresh()

    assert _rows(tree) == before, "every row object survived"
    meta = [
        label.text()
        for label in before[_index_of(tree, "coding-agent-1")].findChildren(QLabel)
        if label.text() == "14m 41s"
    ]
    assert meta == ["14m 41s"], "and the one that moved says the new time"


def _index_of(tree: AgentTreeList, agent_id: str) -> int:
    return next(i for i, row in enumerate(_rows(tree)) if row._agent_id == agent_id)


@verifies(SWR.SWR_2454)
def test_a_new_agent_costs_one_row_and_leaves_the_others_alone(qtbot) -> None:
    store = sample_store()
    tree = _tree(qtbot, store)
    before = {row._agent_id: row for row in _rows(tree)}

    store.upsert_agent(
        AgentNode(
            id="reviewer-9",
            name="reviewer-9",
            persona="reviewer",
            parent_id="coding-agent-1",
            state=AgentState.RUNNING,
        )
    )
    tree.refresh()

    after = {row._agent_id: row for row in _rows(tree)}
    assert set(after) == set(before) | {"reviewer-9"}
    assert all(after[agent_id] is row for agent_id, row in before.items())


@verifies(SWR.SWR_2454)
def test_an_agent_that_goes_away_is_off_screen_before_the_loop_deletes_it(qtbot) -> None:
    """A row taken out of a layout keeps painting until the deletion is delivered.

    Asserted without spinning the loop, because the whole point is what is true
    before ``deleteLater`` runs — a loop behind on work is exactly when this
    matters, and exactly when it will not have run.
    """
    store = sample_store()
    tree = _tree(qtbot, store)
    doomed = _rows(tree)[_index_of(tree, "tester")]

    store.set_agents([a for a in store.agent_list() if a.id != "tester"])
    tree.refresh()

    assert doomed.isVisible() is False
    assert doomed.parent() is None
    assert "tester" not in {row._agent_id for row in _rows(tree)}


@verifies(SWR.SWR_2454, SWR.SWR_2122)
def test_the_rows_stay_in_the_order_the_tree_reports(qtbot) -> None:
    """Reconciling must not let the layout drift from the delegation order."""
    store = sample_store()
    tree = _tree(qtbot, store)

    # Reparent one agent under another, which moves it in the depth-first walk.
    store.agents["librarian"].parent_id = "tester"
    tree.refresh()

    assert [row._agent_id for row in _rows(tree)] == [
        agent.id for agent, _prefix, _depth in store.agent_tree()
    ]


@verifies(SWR.SWR_2454)
def test_a_theme_change_rebuilds_rows_that_carry_their_colours_inline(qtbot) -> None:
    """The one case reconciling must *not* take: a row's colours are its own."""
    from rotaris.theme import tokens

    store = sample_store()
    tree = _tree(qtbot, store)
    before = _rows(tree)

    tree.apply_theme(tokens())

    assert all(row not in before for row in _rows(tree)), "rows were rebuilt"
    assert len(_rows(tree)) == len(before)


# ── holding work back while nobody is looking ─────────────────────────────


@verifies(SWR.SWR_2454)
def test_a_hidden_panel_does_no_work_and_catches_up_when_it_is_shown(qtbot) -> None:
    panel = QWidget()
    qtbot.addWidget(panel)
    runs: list[int] = []
    reflow = HiddenPanelReflow(panel, 0, lambda: runs.append(1))

    for _ in range(50):
        reflow.request()
    assert runs == [], "nothing was drawn for a panel nobody can see"

    panel.show()
    qtbot.waitExposed(panel)

    assert runs == [1], "and the whole backlog cost exactly one rebuild"


@verifies(SWR.SWR_2454)
def test_a_visible_panel_draws_the_first_change_at_once(qtbot) -> None:
    """Leading edge. A single change must not wait out the interval."""
    panel = QWidget()
    qtbot.addWidget(panel)
    panel.show()
    qtbot.waitExposed(panel)
    runs: list[int] = []
    reflow = HiddenPanelReflow(panel, 5_000, lambda: runs.append(1))

    reflow.request()

    assert runs == [1]


@verifies(SWR.SWR_2454)
def test_a_burst_of_changes_costs_one_rebuild_and_then_one_more(qtbot) -> None:
    holder = QWidget()
    qtbot.addWidget(holder)
    runs: list[int] = []
    coalescer = Coalescer(holder, 30, lambda: runs.append(1))

    for _ in range(200):
        coalescer.request()

    assert runs == [1], "the leading edge, and nothing per change after it"
    qtbot.waitUntil(lambda: len(runs) == 2, timeout=2_000)
    assert runs == [1, 1], "and the trailing tick, so the last change is not lost"


# ── the inspector and the sidebar ─────────────────────────────────────────


def _workspace(qtbot, store: WorkspaceStore) -> WorkspaceView:
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)
    return view


def _chips(view: WorkspaceView) -> list[QLabel]:
    return [
        widget
        for index in range(view.tools_layout.count())
        if isinstance(widget := view.tools_layout.itemAt(index).widget(), QLabel)
    ]


@verifies(SWR.SWR_2454, SWR.SWR_3010)
def test_a_tool_starting_re_dresses_its_chip_and_leaves_the_strip_standing(qtbot) -> None:
    store = sample_store()
    view = _workspace(qtbot, store)
    store.select_agent("coding-agent-1")
    view._refresh_inspector()
    before = _chips(view)
    assert before, "the fixture agent holds tools"

    agent = store.agents["coding-agent-1"]
    agent.active_tools = [*agent.active_tools, "grep"]
    view._refresh_inspector()

    assert _chips(view) == before, "no chip was rebuilt"
    assert any(chip.text() == "grep · active" for chip in before), "and one now reads active"


@verifies(SWR.SWR_2454, SWR.SWR_3010)
def test_an_agent_reporting_progress_does_not_rebuild_its_tool_strip(qtbot) -> None:
    store = sample_store()
    view = _workspace(qtbot, store)
    store.select_agent("coding-agent-1")
    view._refresh_inspector()
    before = _chips(view)

    store.agents["coding-agent-1"].elapsed = "14m 41s"
    view._refresh_inspector()

    assert _chips(view) == before


@verifies(SWR.SWR_2454)
def test_switching_agent_rebuilds_the_strip_for_the_tools_it_actually_holds(qtbot) -> None:
    store = sample_store()
    view = _workspace(qtbot, store)
    store.select_agent("coding-agent-1")
    view._refresh_inspector()
    before = _chips(view)

    store.select_agent("tester")
    view._refresh_inspector()

    after = _chips(view)
    assert all(chip not in before for chip in after)
    assert {chip.text().split(" · ")[0] for chip in after} == set(
        store.agents["tester"].tools
    )


@verifies(SWR.SWR_2454)
def test_an_agent_reporting_progress_does_not_rebuild_the_task_plan(qtbot) -> None:
    """``agents_changed`` drives the sidebar, and the sidebar draws the todos."""
    store = sample_store()
    store.set_todos(
        [TodoItem(id="t1", phase_id="p1", status="open", text="write it", phase_name="Plan")]
    )
    view = _workspace(qtbot, store)
    view._refresh_sidebar()
    before = _todo_rows(view)
    assert before, "the plan has rows to keep"

    store.agents["coding-agent-1"].elapsed = "14m 42s"
    view._refresh_sidebar()

    assert _todo_rows(view) == before


@verifies(SWR.SWR_2454)
def test_a_todo_being_ticked_does_rebuild_the_task_plan(qtbot) -> None:
    """The other half: the guard must not freeze what genuinely changed."""
    store = sample_store()
    store.set_todos(
        [TodoItem(id="t1", phase_id="p1", status="open", text="write it", phase_name="Plan")]
    )
    view = _workspace(qtbot, store)
    view._refresh_sidebar()
    before = _todo_rows(view)

    store.set_todos(
        [TodoItem(id="t1", phase_id="p1", status="done", text="write it", phase_name="Plan")]
    )
    view._refresh_sidebar()

    after = _todo_rows(view)
    assert after, "the plan is still drawn"
    assert all(row not in before for row in after), "and drawn again, not left stale"


def _todo_rows(view: WorkspaceView) -> list[QWidget]:
    return [
        widget
        for index in range(view.todo_rows.count())
        if (widget := view.todo_rows.itemAt(index).widget()) is not None
    ]


# ── pop-outs and the tabs behind the one on screen ────────────────────────


@verifies(SWR.SWR_2454, SWR.SWR_2090)
def test_a_closed_pop_out_costs_nothing_and_is_current_when_it_reopens(qtbot) -> None:
    """A pop-out is closed, not destroyed — it stays in the main window's cache.

    So without the visibility gate a user who opened one once keeps paying for
    its tab strip on every publication for the rest of the session.
    """
    from rotaris.views.agent_window import AgentWindow

    store = sample_store()
    window = AgentWindow(store, "coding-agent")
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.refresh()
    before = window.tabs.count()
    assert before, "the persona has instances"

    window.close()
    store.upsert_agent(
        AgentNode(
            id="coding-agent-9",
            name="coding-agent-9",
            persona="coding-agent",
            parent_id="coding-agent-1",
            state=AgentState.RUNNING,
        )
    )
    window.request_refresh()

    assert window.tabs.count() == before, "a closed window rebuilt nothing"

    window.show()
    qtbot.waitExposed(window)

    assert window.tabs.count() == before + 1, "and reopening it shows the new agent"


@verifies(SWR.SWR_2454, SWR.SWR_2428)
def test_a_streaming_command_does_not_relabel_the_terminal_tabs_per_chunk(qtbot) -> None:
    from rotaris_core.terminal_stream.hub import TerminalStreamHub

    from rotaris.services.terminal_stream_bridge import TerminalStreamBridge
    from rotaris.views.terminal_window import TerminalWindow

    hub = TerminalStreamHub(buffer_bytes=32 * 1024)
    bridge = TerminalStreamBridge()
    hub.open_stream("sess", "fg:coder", command="pytest -q")
    bridge.attach(hub, "sess")

    window = TerminalWindow(bridge)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    calls: list[int] = []
    window._reflow._target = lambda: calls.append(1)

    for index in range(100):
        hub.publish("sess", "fg:coder", "delta", f"line {index}\r\n")

    assert len(calls) <= 2, f"a chunk must not cost a relabel of every tab, got {len(calls)}"


@verifies(SWR.SWR_2454)
def test_a_tab_nobody_is_on_does_not_rebuild_its_tables(qtbot) -> None:
    """Artifacts and proposals arrive while the user is watching the run."""
    from rotaris.views.library import LibraryView

    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)
    calls: list[int] = []
    view._artifacts_reflow._target = lambda: calls.append(1)

    store.set_artifacts([])

    assert calls == [], "the tab is not on screen, so nothing was rebuilt"

    view.show()
    qtbot.waitExposed(view)

    assert calls == [1], "and switching to it costs exactly one rebuild"
