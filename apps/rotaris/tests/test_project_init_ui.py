"""Settings ▸ Project: what the manual initialization action offers, per state.

SWR-2805 makes one promise about this tab — the action is always visible and
its state reflects the workspace. These tests drive the tab the way a user
reaches it (switch tabs, read what it says, click what it offers) rather than
poking the widget attributes, so an action that renders but is unreachable, or
a state that renders blank, fails here instead of shipping.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import yaml
from PySide6.QtWidgets import QLabel, QPushButton, QToolButton
from rotaris_core.config.bootstrap import write_minimal_agents_yaml
from rotaris_core.config.project_init_state import mark_task
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, find_by_accessible_name, settle

from rotaris.models.state import INIT_TASK_LABELS, SERENA_INIT_TASK, ProjectInitState
from rotaris.models.store import WorkspaceStore
from rotaris.views.settings import SettingsView

if TYPE_CHECKING:
    from pathlib import Path

# These tests are *about* project initialization, so they opt back in to the
# real registry run the suite otherwise neutralises (see `conftest.py`'s
# `no_unasked_project_initialization`). Each points the workspace at a fake
# `serena` of its own, so the run stays hermetic.
pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("real_project_initialization")]

_ACTION = "Initialize Project…"
_SERENA_LABEL = INIT_TASK_LABELS[SERENA_INIT_TASK]
# A second initialization task, as a later requirement would register it.
_DOCS_TASK = "docs-index"
_DOCS_LABEL = "Documentation index"


def _open_project_tab(qtbot, store: WorkspaceStore) -> SettingsView:
    """Show Settings at its smallest supported size and switch to Project."""
    view = SettingsView(store)
    qtbot.addWidget(view)
    view.resize(1000, 680)
    view.show()
    qtbot.waitExposed(view)
    view.set_active_tab("project")
    qtbot.waitUntil(lambda: view.tabs.tabText(view.tabs.currentIndex()) == "Project")
    settle(qtbot)
    return view


def _status(view: SettingsView) -> str:
    return find_by_accessible_name(
        view, "Project initialization status", QLabel, visible_only=True
    ).text()


def _detail(view: SettingsView) -> str:
    return find_by_accessible_name(
        view, "Project initialization details", QLabel, visible_only=True
    ).text()


def _action(view: SettingsView, label: str = _ACTION) -> QPushButton:
    return find_by_accessible_name(view, label, QPushButton, visible_only=True)


def _clicks(view: SettingsView) -> list[int]:
    seen: list[int] = []
    view.initialize_project_requested.connect(lambda: seen.append(1))
    return seen


def _store_with(state: ProjectInitState) -> WorkspaceStore:
    store = WorkspaceStore()
    store.set_initialization(state)
    return store


def _workspace(tmp_path: Path, *, offers_serena: bool) -> Path:
    """A real workspace whose agents.yaml the product's own loader can read."""
    path = tmp_path / ".rotaris" / "agents.yaml"
    write_minimal_agents_yaml(path)
    if offers_serena:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        # http needs no launcher on PATH, so the fixture stays hermetic.
        data["mcp_servers"] = {SERENA_INIT_TASK: {"type": "http", "url": "https://serena.invalid"}}
        path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return tmp_path


def _loaded_store(workspace: Path) -> WorkspaceStore:
    """Populate a store through the real ConfigService projection.

    Only the two network-touching projections are stubbed: a real
    ``_providers()`` probes every configured endpoint and costs 5–18 s.
    """
    from rotaris.services.config_service import ConfigService

    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    return store


@verifies(SWR.SWR_2805)
def test_action_state_resolved(qtbot) -> None:
    """Productive use: a user opens Settings ▸ Project on a workspace that is already set up.
    Expected outcome: the tab reports it as initialized and says why there is nothing to run."""
    store = _store_with(
        ProjectInitState(
            completed=(SERENA_INIT_TASK,),
            never_initialized=False,
            last_run="2026-08-06T09:15:00+00:00",
        )
    )

    view = _open_project_tab(qtbot, store)

    assert _status(view) == "Project initialized"
    assert _SERENA_LABEL in _detail(view)
    action = _action(view)
    assert action.isEnabled() is False
    assert "already resolved" in action.accessibleDescription()
    assert action.toolTip() == action.accessibleDescription()
    help_button = find_by_accessible_name(
        view, "Why project initialization is unavailable", QToolButton, visible_only=True
    )
    assert help_button.toolTip() == action.accessibleDescription()


@verifies(SWR.SWR_2805)
def test_action_state_pending(qtbot) -> None:
    """Productive use: a user who skipped setup comes back to run it from Settings.
    Expected outcome: the tab names the unrun task and its action starts exactly one run."""
    store = _store_with(ProjectInitState(pending=(SERENA_INIT_TASK,)))

    view = _open_project_tab(qtbot, store)
    seen = _clicks(view)

    assert _status(view) == "Initialization pending"
    assert _SERENA_LABEL in _detail(view)
    assert _action(view).isEnabled() is True
    click_by_name(qtbot, view, _ACTION, QPushButton)

    assert seen == [1]


@verifies(SWR.SWR_2805)
def test_action_state_in_progress(qtbot) -> None:
    """Productive use: a user watches the tab while the initialization run is going.
    Expected outcome: the action is disabled with a stated reason and a progress indicator."""
    store = _store_with(ProjectInitState(pending=(SERENA_INIT_TASK,)))
    view = _open_project_tab(qtbot, store)
    assert view.project_init_progress.isVisible() is False

    # Driven through the store signal, not by rebuilding the view.
    store.set_initialization_running(True)
    qtbot.waitUntil(lambda: view.project_init_progress.isVisible())

    assert _status(view) == "Initializing project…"
    action = _action(view, "Initializing…")
    assert action.isEnabled() is False
    assert "already running" in action.accessibleDescription()


@verifies(SWR.SWR_2805)
def test_a_failed_run_stays_recoverable_from_the_tab(qtbot) -> None:
    """Productive use: initialization fails and the user returns to the tab to deal with it.
    Expected outcome: the failure is readable and one concrete retry action runs it again."""
    store = _store_with(ProjectInitState(pending=(SERENA_INIT_TASK,)))
    view = _open_project_tab(qtbot, store)
    seen = _clicks(view)

    store.set_initialization_error("Project activation failed: the server refused the connection.")
    qtbot.waitUntil(lambda: _status(view) == "Initialization failed")

    assert "refused the connection" in _detail(view)
    assert _SERENA_LABEL in _detail(view)
    assert view.project_init_progress.isVisible() is False
    retry = _action(view, "Retry initialization")
    assert retry.isEnabled() is True
    click_by_name(qtbot, view, "Retry initialization", QPushButton)

    assert seen == [1]


@verifies(SWR.SWR_2804, SWR.SWR_2805)
def test_a_non_code_workspace_is_told_why_no_memories_were_written(qtbot) -> None:
    """Productive use: a user initializes a documentation-only repository.
    Expected outcome: the tab explains the missing code memories instead of looking half-done."""
    store = _store_with(
        ProjectInitState(
            completed=(SERENA_INIT_TASK,),
            classification="non-code",
            never_initialized=False,
            last_run="2026-08-06T09:15:00+00:00",
        )
    )

    view = _open_project_tab(qtbot, store)

    detail = _detail(view)
    assert _SERENA_LABEL in detail
    assert "documentation-only project" in detail
    assert "No code memories were created" in detail


@verifies(SWR.SWR_2804, SWR.SWR_2805)
def test_a_code_workspace_says_memories_were_written(qtbot) -> None:
    """Productive use: a user initializes a normal source repository.
    Expected outcome: the tab distinguishes this outcome from the documentation-only one."""
    store = _store_with(
        ProjectInitState(
            completed=(SERENA_INIT_TASK,),
            classification="code",
            never_initialized=False,
            last_run="2026-08-06T09:15:00+00:00",
        )
    )

    view = _open_project_tab(qtbot, store)

    assert "Code memories were created" in _detail(view)
    assert "documentation-only" not in _detail(view)


@verifies(SWR.SWR_2800, SWR.SWR_2805)
def test_a_task_registered_later_appears_without_touching_this_tab(qtbot, monkeypatch) -> None:
    """Productive use: a later requirement registers a second initialization task.
    Expected outcome: the tab lists it beside the first one with no change to the view."""
    monkeypatch.setitem(INIT_TASK_LABELS, _DOCS_TASK, _DOCS_LABEL)
    store = _store_with(ProjectInitState(pending=(SERENA_INIT_TASK, _DOCS_TASK)))

    view = _open_project_tab(qtbot, store)

    detail = _detail(view)
    assert _SERENA_LABEL in detail
    assert _DOCS_LABEL in detail
    assert _action(view).isEnabled() is True


@verifies(SWR.SWR_2800, SWR.SWR_2805)
def test_a_task_with_no_registered_label_still_names_itself(qtbot) -> None:
    """Productive use: a build renders a task whose label this release does not know.
    Expected outcome: the raw task id is listed rather than an empty gap."""
    store = _store_with(ProjectInitState(pending=("future-task",)))

    view = _open_project_tab(qtbot, store)

    assert "future-task" in _detail(view)


@verifies(SWR.SWR_2805)
def test_a_workspace_with_no_applicable_task_still_explains_itself(qtbot) -> None:
    """Productive use: a user opens the tab in a workspace no initialization task applies to.
    Expected outcome: the tab explains the emptiness and names the next step, never blank."""
    view = _open_project_tab(qtbot, WorkspaceStore())

    assert _status(view) == "Nothing to initialize yet"
    detail = _detail(view)
    assert "No initialization task applies" in detail
    assert "MCP Servers" in detail
    action = _action(view)
    assert action.isEnabled() is False
    assert "No initialization task applies" in action.accessibleDescription()


@verifies(SWR.SWR_2805)
def test_a_deferred_task_can_still_be_run_from_the_tab(qtbot) -> None:
    """Productive use: a user skipped setup at first run and later changes their mind.
    Expected outcome: the tab reports the deferral and its action is still available."""
    store = _store_with(
        ProjectInitState(
            skipped=(SERENA_INIT_TASK,),
            never_initialized=False,
            last_run="2026-08-06T09:15:00+00:00",
        )
    )

    view = _open_project_tab(qtbot, store)
    seen = _clicks(view)

    assert _status(view) == "Initialization deferred"
    assert _SERENA_LABEL in _detail(view)
    click_by_name(qtbot, view, _ACTION, QPushButton)

    assert seen == [1]


@verifies(SWR.SWR_2094, SWR.SWR_2805)
def test_tab_ids_only_ever_append_so_saved_preferences_keep_their_meaning(qtbot) -> None:
    """Productive use: a user who left Settings on Display reopens the app after an update.
    Expected outcome: every pre-existing tab keeps its index, so the stored index still
    names the tab they chose."""
    view = SettingsView(WorkspaceStore())
    qtbot.addWidget(view)

    # The preference persists an *index*, so ids may only ever be appended: an
    # insertion in the middle silently reassigns every saved preference. Pin
    # the whole prefix rather than "project is last" — tabs appended after it
    # (about, and whatever follows) are exactly what the rule allows, and the
    # invariant worth guarding is that none of these twelve ever move.
    assert view._TAB_IDS[:12] == (
        "models",
        "personas",
        "runtime",
        "interface",
        "display",
        "skills",
        "instructions",
        "hooks",
        "mcp",
        "plugins",
        "tools",
        "project",
    )
    assert view.tabs.count() == len(view._TAB_IDS)
    assert view.tabs.tabText(view._TAB_IDS.index("project")) == "Project"
    assert view.set_active_tab("display") == "display"
    assert view.tabs.currentIndex() == 4
    assert view.set_active_tab("project") == "project"
    assert view.active_tab_id() == "project"


@verifies(SWR.SWR_2804, SWR.SWR_2805)
def test_project_tab_renders_an_initialized_workspace_end_to_end(qtbot, tmp_path) -> None:
    """Productive use: a user reopens a workspace they already initialized as documentation-only.
    Expected outcome: the tab reads that outcome out of the real config, with no action left."""
    workspace = _workspace(tmp_path, offers_serena=True)
    mark_task(workspace, SERENA_INIT_TASK, outcome="completed", classification="non-code")

    view = _open_project_tab(qtbot, _loaded_store(workspace))

    assert _status(view) == "Project initialized"
    detail = _detail(view)
    assert _SERENA_LABEL in detail
    assert "documentation-only project" in detail
    assert _action(view).isEnabled() is False


@verifies(SWR.SWR_2805)
def test_project_tab_offers_the_action_for_an_uninitialized_workspace(qtbot, tmp_path) -> None:
    """Productive use: a user opens a workspace whose initialization has never run.
    Expected outcome: the tab names the unrun task and one click asks the host to start it."""
    workspace = _workspace(tmp_path, offers_serena=True)

    view = _open_project_tab(qtbot, _loaded_store(workspace))
    seen = _clicks(view)

    assert _status(view) == "Initialization pending"
    assert _SERENA_LABEL in _detail(view)
    click_by_name(qtbot, view, _ACTION, QPushButton)

    assert seen == [1]
