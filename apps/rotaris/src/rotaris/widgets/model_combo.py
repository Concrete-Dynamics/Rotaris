"""The one way a model picker is filled in.

A provider lists models it will not accept. Dropping them made every picker
disagree with the provider's own settings page and left the user with no way to
learn that the model they wanted is one toggle away. So the rejects stay listed,
greyed and unselectable, and say why (SWR-2812).

Five combos show models — the run chip, the composer chip, the agent inspector,
the startup slots and the persona table — and they all come through
:func:`populate_model_combo` so a reason cannot be right in one and missing in
the next.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtGui import QStandardItemModel
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import ModelOption
from rotaris.theme import tokens
from rotaris.widgets.icons import glyph_icon

if TYPE_CHECKING:
    from collections.abc import Sequence

    from PySide6.QtWidgets import QComboBox

#: Marks an unavailable row in words as well as in colour and glyph — meaning
#: must never ride on colour alone (apps/rotaris/AGENTS.md).
UNAVAILABLE_SUFFIX = " — unavailable"
UNAVAILABLE_GLYPH = "⚠"

#: Holds the model's real name, so a caller reading the combo back gets the id
#: it can dispatch with rather than the decorated label.
MODEL_NAME_ROLE = Qt.ItemDataRole.UserRole

#: Same property name `set_action_availability` uses, so a control carries one
#: notion of "why can't I use this" no matter which of the two wrote it.
_REASON_PROPERTY = "availabilityReason"

_FALLBACK_REASON = "The provider will not accept requests for this model."


@traces(SWR.SWR_2814)
def populate_model_combo(
    combo: QComboBox,
    options: Sequence[ModelOption],
    *,
    current: str = "",
    placeholder: str = "",
) -> None:
    """Fill `combo` with `options` and select `current`.

    Unavailable options are listed but cannot be reached by pointer or keyboard:
    their item flags are cleared while the popup view itself stays enabled, which
    is what keeps the tooltip reachable (SWR-2124 — a disabled *control* may never
    see the pointer at all; a disabled *item* still does).

    `current` is always selectable-or-not shown: a workspace pinned to a model the
    provider has since switched off keeps naming it, with the reason on the closed
    control, instead of rendering as an empty chip. Signals stay blocked for the
    whole rebuild so refilling a picker never reads as the user changing a model.

    `placeholder` names what an empty catalog shows. The workspace chips want one
    — a run always has *some* model — while a Settings slot must stay blank rather
    than suggest a model the workspace has not got.
    """
    entries = list(options)
    if not entries and not current and placeholder:
        entries = [ModelOption(placeholder)]
    if current and all(entry.name != current for entry in entries):
        entries.append(ModelOption(current))

    t = tokens()
    was_blocked = combo.blockSignals(True)
    try:
        combo.clear()
        item_model = combo.model()
        for row, entry in enumerate(entries):
            combo.addItem(entry.name)
            combo.setItemData(row, entry.name, MODEL_NAME_ROLE)
            if entry.available:
                continue
            reason = entry.reason or _FALLBACK_REASON
            combo.setItemText(row, f"{entry.name}{UNAVAILABLE_SUFFIX}")
            # The glyph is a shape beside the row, not one of its words, so it
            # takes the graphical form of the waiting colour; the suffix above
            # is what actually carries the meaning.
            combo.setItemIcon(row, glyph_icon(UNAVAILABLE_GLYPH, t.color.wait))
            combo.setItemData(row, t.color.text_disabled.qcolor, Qt.ItemDataRole.ForegroundRole)
            combo.setItemData(row, reason, Qt.ItemDataRole.ToolTipRole)
            combo.setItemData(row, reason, Qt.ItemDataRole.AccessibleDescriptionRole)
            if isinstance(item_model, QStandardItemModel):
                item = item_model.item(row)
                if item is not None:
                    item.setFlags(
                        item.flags() & ~Qt.ItemFlag.ItemIsEnabled & ~Qt.ItemFlag.ItemIsSelectable
                    )

        index = next((i for i, entry in enumerate(entries) if entry.name == current), 0)
        combo.setCurrentIndex(index)
        selected = entries[index] if 0 <= index < len(entries) else None
        if selected is not None and not selected.available:
            reason = selected.reason or _FALLBACK_REASON
            combo.setProperty(_REASON_PROPERTY, reason)
            combo.setToolTip(reason)
            combo.setAccessibleDescription(reason)
        elif combo.property(_REASON_PROPERTY):
            combo.setProperty(_REASON_PROPERTY, "")
            combo.setToolTip("")
            combo.setAccessibleDescription("")
    finally:
        combo.blockSignals(was_blocked)


@traces(SWR.SWR_2814)
def select_model(combo: QComboBox, name: str) -> bool:
    """Select the row for `name`, silently; False when the combo has no such row.

    Matches on the stored id rather than the label, which an unavailable row
    decorates. Silent because callers use it to mirror store state into a
    control — not to announce a user's choice.
    """
    index = combo.findData(name, MODEL_NAME_ROLE)
    if index < 0:
        return False
    was_blocked = combo.blockSignals(True)
    try:
        combo.setCurrentIndex(index)
    finally:
        combo.blockSignals(was_blocked)
    return True


@traces(SWR.SWR_2814)
def current_model_name(combo: QComboBox) -> str:
    """The selected model's id, without the "unavailable" decoration."""
    name = combo.currentData(MODEL_NAME_ROLE)
    return name if isinstance(name, str) else combo.currentText()
