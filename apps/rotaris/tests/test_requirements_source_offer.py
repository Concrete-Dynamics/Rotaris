"""Productive use: a user opens a project that keeps sixty requirements under
``docs/requirements/`` written to its own convention, and expects Rotaris to read them
rather than to report that the project declares none.
Expected outcome: the area says the requirements are there and cannot be read yet,
offers the mapping it would use with the count it measured, writes nothing until the
user takes it, and — once taken — reads the board through it; a workspace whose
configured source matches nothing is told so against that configuration and is not
quietly re-proposed a different one.

Nothing here stubs discovery: every store is real files on disk and every proposal is
the one the shipped analyst produces from them (SWR-3311).
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_actions import requirement_source_path
from rotaris.services.requirements_controller import (
    ADOPT_SOURCE_ACTION,
    REFRESH_ACTION,
    RequirementsController,
)
from rotaris.widgets.feedback import EmptyState

if TYPE_CHECKING:
    from pathlib import Path

FOREIGN = """---
id: {req_id}
title: {title}
status: approved
---

# {req_id} — {title}

{title} is what this requirement asks the product to do.
"""

PROSE = """# Conventions

How this project writes its requirements. Carries no frontmatter, so no mapping
claims it — the file that used to refuse the proposal by sorting first.
"""

OURS = """---
req-id: SWR-4401
status: approved
trace: optional
test: optional
title: "A widget renders"
---

# SWR-4401 — A widget renders

The widget renders.
"""


def _foreign_store(root: Path, count: int = 3) -> Path:
    """A store at our path, in somebody else's convention."""
    store = root / "docs" / "requirements"
    (store / "functional").mkdir(parents=True)
    (store / "CONVENTIONS.md").write_text(PROSE, encoding="utf-8")
    for index in range(1, count + 1):
        req_id = f"SWR-FR-TRK-{index:03d}"
        (store / "functional" / f"{req_id}.md").write_text(
            FOREIGN.format(req_id=req_id, title=f"Tracking behaviour {index}"),
            encoding="utf-8",
        )
    return root


def _controller(store: WorkspaceStore, workspace: Path) -> RequirementsController:
    return RequirementsController(store, workspace=workspace)


def _read(controller: RequirementsController, qtbot) -> None:
    with qtbot.waitSignal(controller.bridge.unavailable, timeout=15000):
        controller.refresh()
    settle(qtbot)


@verifies(SWR.SWR_3120)
def test_a_foreign_store_is_offered_a_mapping_instead_of_an_empty_board(
    qtbot,
    tmp_path: Path,
) -> None:
    """The whole defect, end to end, at the surface the user is looking at.

    Before SWR-3120 this workspace produced a bound source, a board of nothing,
    and "the requirement store is readable but declares no requirement".
    """
    workspace = _foreign_store(tmp_path, count=3)
    store = WorkspaceStore()
    controller = _controller(store, workspace)
    qtbot.addWidget(controller.surface)

    _read(controller, qtbot)

    offer = store.requirements.source_offer
    assert offer is not None, "discovery ran and produced something to show"
    assert offer.worth_offering
    assert offer.requirement_count == 3, "measured by loading the mapping, not guessed"
    assert "docs/**/*.md" in offer.config_document
    assert "frontmatter.id" in offer.config_document

    placeholder = find_by_accessible_name(controller.surface, offer.title, EmptyState)
    assert placeholder.action_button is not None
    assert placeholder.action_button.property("actionId") == ADOPT_SOURCE_ACTION
    assert placeholder.action_button.text() == "Use this mapping"
    assert "Nothing has been written yet." in placeholder.accessibleDescription()

    # Offered, never taken: the workspace is untouched until the user acts.
    assert not requirement_source_path(workspace).exists()
    controller.shutdown()


@verifies(SWR.SWR_3120, SWR.SWR_3106)
def test_taking_the_offer_configures_the_workspace_and_fills_the_board(
    qtbot,
    tmp_path: Path,
) -> None:
    """Acceptance is what writes — and what it writes is what was shown."""
    workspace = _foreign_store(tmp_path, count=4)
    store = WorkspaceStore()
    controller = _controller(store, workspace)
    qtbot.addWidget(controller.surface)
    _read(controller, qtbot)
    shown = store.requirements.source_offer
    assert shown is not None

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        assert controller.adopt_source() is True
    settle(qtbot)

    configured = requirement_source_path(workspace)
    assert configured.is_file(), "the accepted mapping was persisted"
    assert json.loads(configured.read_text(encoding="utf-8")) == json.loads(shown.config_document)

    assert store.requirements.available is True
    assert len(store.requirements.cards) == 4
    assert {card.req_id for card in store.requirements.cards} == {
        f"SWR-FR-TRK-{index:03d}" for index in range(1, 5)
    }
    controller.shutdown()


@verifies(SWR.SWR_3120)
def test_a_workspace_with_no_requirement_documents_is_told_that_and_offered_nothing(
    qtbot,
    tmp_path: Path,
) -> None:
    """ "There is nothing here" is not "there is something here we cannot read"."""
    workspace = tmp_path
    (workspace / "src").mkdir()
    (workspace / "src" / "main.py").write_text("print('hello')\n", encoding="utf-8")
    store = WorkspaceStore()
    controller = _controller(store, workspace)
    qtbot.addWidget(controller.surface)

    _read(controller, qtbot)

    assert store.requirements.source_offer is None
    placeholder = find_by_accessible_name(
        controller.surface,
        "Requirements are unavailable",
        EmptyState,
    )
    assert placeholder.action_button is not None
    assert placeholder.action_button.property("actionId") == REFRESH_ACTION
    controller.shutdown()


@verifies(SWR.SWR_3120)
def test_a_store_in_our_own_convention_is_read_and_never_offered_a_mapping(
    qtbot,
    tmp_path: Path,
) -> None:
    """The unchanged path: a workspace Rotaris already reads keeps being read."""
    workspace = tmp_path
    store_dir = workspace / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    (store_dir / "SWR-4401-widget.md").write_text(OURS, encoding="utf-8")
    store = WorkspaceStore()
    controller = _controller(store, workspace)
    qtbot.addWidget(controller.surface)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        controller.refresh()
    settle(qtbot)

    assert store.requirements.available is True
    assert store.requirements.source_offer is None
    assert [card.req_id for card in store.requirements.cards] == ["SWR-4401"]
    controller.shutdown()


@verifies(SWR.SWR_3120)
def test_a_configured_source_that_matches_nothing_is_reported_against_itself(
    qtbot,
    tmp_path: Path,
) -> None:
    """A persisted mapping is the end of discovery, even when it reads nothing.

    Re-proposing here would produce a second mapping competing with the one the
    user accepted, on every start. So the board names the configuration and
    leaves fixing it to the person who wrote it (SWR-3106).
    """
    workspace = _foreign_store(tmp_path, count=2)
    configured = requirement_source_path(workspace)
    configured.parent.mkdir(parents=True, exist_ok=True)
    configured.write_text(
        json.dumps(
            {
                "source-id": "configured",
                "type": "markdown",
                "glob": "specs/**/*.md",  # matches nothing in this tree
                "id": {"source": "frontmatter.id"},
                "title": {"source": "heading"},
            },
        ),
        encoding="utf-8",
    )
    store = WorkspaceStore()
    controller = _controller(store, workspace)
    qtbot.addWidget(controller.surface)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        controller.refresh()
    settle(qtbot)

    assert store.requirements.available is True
    assert store.requirements.cards == ()
    assert store.requirements.source_offer is None, "no rediscovery competes with the config"
    assert configured.name in store.requirements.empty_reason
    assert "matched no requirement" in store.requirements.empty_reason
    controller.shutdown()


@verifies(SWR.SWR_3121)
def test_the_board_states_which_analyst_answered(qtbot, tmp_path: Path) -> None:
    """Who was asked is part of what the user is shown (SWR-3121).

    A proposal with no provenance leaves "the heuristic mapped this" and "an
    agent was asked and this is its best guess" looking identical, and they are
    not the same thing to review.
    """
    workspace = _foreign_store(tmp_path, count=2)
    store = WorkspaceStore()
    controller = _controller(store, workspace)
    qtbot.addWidget(controller.surface)

    _read(controller, qtbot)

    offer = store.requirements.source_offer
    assert offer is not None
    assert "Analysts:" in offer.summary
    assert "HeuristicAnalyst: proposed, adopted" in offer.summary, offer.summary

    placeholder = find_by_accessible_name(controller.surface, offer.title, EmptyState)
    assert "HeuristicAnalyst" in placeholder.accessibleDescription()
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3120)
def test_adopting_without_an_offer_does_nothing(qtbot, tmp_path: Path) -> None:
    """The button cannot be reached without an offer; the method still refuses."""
    store = WorkspaceStore()
    controller = _controller(store, tmp_path)
    qtbot.addWidget(controller.surface)

    assert controller.adopt_source() is False
    assert not requirement_source_path(tmp_path).exists()
    controller.shutdown()
