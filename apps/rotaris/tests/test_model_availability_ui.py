"""A model the provider refuses stays visible, unselectable, and says why.

The provider lists more models than the account can call. Rotaris used to drop
the rejects, so the picker quietly disagreed with the provider's own settings
page and the user had no way to learn that the model they wanted was one toggle
away. These tests hold the surface to the other behaviour: listed, greyed, and
carrying the reason to both the pointer and a screen reader (SWR-2812).
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt
from PySide6.QtGui import QStandardItemModel
from PySide6.QtWidgets import QComboBox
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models import sample_store
from rotaris.models.state import ModelOption
from rotaris.models.store import WorkspaceStore
from rotaris.views.main_window import MainWindow
from rotaris.widgets.model_combo import (
    MODEL_NAME_ROLE,
    UNAVAILABLE_SUFFIX,
    current_model_name,
    populate_model_combo,
)

pytestmark = pytest.mark.integration

_REASON = "Your provider account has this model switched off."

_CATALOG = [
    ModelOption("copilot/gpt-5"),
    ModelOption("copilot/gpt-5.6-sol", available=False, reason=_REASON),
]


def _item_flags(combo: QComboBox, row: int) -> Qt.ItemFlag:
    model = combo.model()
    assert isinstance(model, QStandardItemModel)
    item = model.item(row)
    assert item is not None
    return item.flags()


@verifies(SWR.SWR_2812, SWR.SWR_2814)
def test_a_refused_model_is_listed_but_cannot_be_reached(qtbot) -> None:
    """Productive use: the user sees the model the provider showed them, and learns
    it is off. Expected outcome: the row exists, and neither pointer nor keyboard
    can land on it."""
    combo = QComboBox()
    qtbot.addWidget(combo)

    populate_model_combo(combo, _CATALOG)

    assert combo.count() == 2
    flags = _item_flags(combo, 1)
    assert not flags & Qt.ItemFlag.ItemIsEnabled
    assert not flags & Qt.ItemFlag.ItemIsSelectable
    # The view itself stays usable — that is what keeps the row's tooltip
    # reachable at all (SWR-2124).
    assert combo.isEnabled()


@verifies(SWR.SWR_2812, SWR.SWR_2814)
def test_the_reason_reaches_both_the_pointer_and_a_screen_reader(qtbot) -> None:
    """Productive use: a sighted user hovers, a screen-reader user tabs, and both
    learn the same thing. Expected outcome: the reason is on the tooltip and the
    accessible description, and the row says "unavailable" in words."""
    combo = QComboBox()
    qtbot.addWidget(combo)

    populate_model_combo(combo, _CATALOG)

    assert combo.itemData(1, Qt.ItemDataRole.ToolTipRole) == _REASON
    assert combo.itemData(1, Qt.ItemDataRole.AccessibleDescriptionRole) == _REASON
    # Never colour or glyph alone.
    assert combo.itemText(1).endswith(UNAVAILABLE_SUFFIX)
    assert not combo.itemIcon(1).isNull()
    assert combo.itemData(1, Qt.ItemDataRole.ForegroundRole) is not None


@verifies(SWR.SWR_2814)
def test_a_workspace_pinned_to_a_refused_model_still_names_it(qtbot) -> None:
    """Productive use: a model switched off after the workspace was configured.
    Expected outcome: the closed control names it and carries the reason, rather
    than rendering blank."""
    combo = QComboBox()
    qtbot.addWidget(combo)

    populate_model_combo(combo, _CATALOG, current="copilot/gpt-5.6-sol")

    assert combo.currentIndex() == 1
    assert current_model_name(combo) == "copilot/gpt-5.6-sol"
    assert combo.toolTip() == _REASON
    assert combo.accessibleDescription() == _REASON


@verifies(SWR.SWR_2814)
def test_the_decorated_label_never_escapes_as_a_model_id(qtbot) -> None:
    """Productive use: whatever reads the picker back gets something dispatchable.
    Expected outcome: the id role holds the bare name, not the display label."""
    combo = QComboBox()
    qtbot.addWidget(combo)

    populate_model_combo(combo, _CATALOG, current="copilot/gpt-5.6-sol")

    assert combo.itemData(1, MODEL_NAME_ROLE) == "copilot/gpt-5.6-sol"
    assert combo.itemText(1) != "copilot/gpt-5.6-sol"


@verifies(SWR.SWR_2814)
def test_refilling_a_picker_is_not_a_user_changing_the_model(qtbot) -> None:
    """Productive use: a catalog refresh must not silently rewrite the workspace's
    model. Expected outcome: rebuilding emits no selection change."""
    combo = QComboBox()
    qtbot.addWidget(combo)
    populate_model_combo(combo, _CATALOG, current="copilot/gpt-5")
    emitted: list[str] = []
    combo.currentTextChanged.connect(emitted.append)

    populate_model_combo(combo, [ModelOption("other/model"), *_CATALOG], current="copilot/gpt-5")

    assert emitted == []
    assert current_model_name(combo) == "copilot/gpt-5"


@verifies(SWR.SWR_2814)
def test_a_catalog_of_only_usable_models_leaves_the_control_plain(qtbot) -> None:
    """Productive use: the ordinary case must not grow decoration.
    Expected outcome: no icon, no suffix, no leftover reason."""
    combo = QComboBox()
    qtbot.addWidget(combo)
    populate_model_combo(combo, _CATALOG, current="copilot/gpt-5.6-sol")

    populate_model_combo(combo, [ModelOption("copilot/gpt-5")], current="copilot/gpt-5")

    assert combo.itemText(0) == "copilot/gpt-5"
    assert combo.itemIcon(0).isNull()
    assert combo.toolTip() == ""
    assert combo.accessibleDescription() == ""


@verifies(SWR.SWR_2812)
def test_the_store_offers_only_usable_models_as_a_catalog() -> None:
    """Productive use: everything that asks "which models do I have" — first-run
    checks, `/model` validation — must not count one the provider refuses.
    Expected outcome: the catalog projection drops it while the options keep it."""
    store = WorkspaceStore()
    store.model_options = list(_CATALOG)

    assert store.model_catalog == ["copilot/gpt-5"]
    assert len(store.model_options) == 2


@verifies(SWR.SWR_2812, SWR.SWR_2814)
def test_the_composer_picker_shows_the_refused_model_it_will_not_run(qtbot) -> None:
    """Productive use: the user opens the real composer chip after a catalog
    refresh. Expected outcome: the refused model is listed there, greyed, with its
    reason — not missing."""
    store = sample_store()
    store.model_options = [*store.model_options, ModelOption("off/model", False, _REASON)]
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("workspace")
    settle(qtbot)

    combo = find_by_accessible_name(window, "Model for the next prompt", QComboBox)
    row = combo.findData("off/model", MODEL_NAME_ROLE)

    assert row >= 0
    assert combo.itemData(row, Qt.ItemDataRole.ToolTipRole) == _REASON
    assert not _item_flags(combo, row) & Qt.ItemFlag.ItemIsEnabled


@verifies(SWR.SWR_2812, SWR.SWR_2814)
def test_slash_model_answers_with_the_reason_instead_of_unknown_model(qtbot) -> None:
    """Productive use: the user types the name they read in the picker.
    Expected outcome: they are told why it is off, not that it does not exist."""
    store = sample_store()
    store.model_options = [*store.model_options, ModelOption("off/model", False, _REASON)]
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show_view("workspace")

    rejected = window.workspace.slash_registry.execute("/model off/model")

    assert _REASON in rejected.message
    assert "Unknown model" not in rejected.message
    assert store.active_model != "off/model"
