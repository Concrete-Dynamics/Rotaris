from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.themes.base import Theme

MONO = Theme(
    name="mono",
    # Backgrounds — pure black base per REQ-20260511-004
    bg="#000000",
    bg_overlay="#080808",
    bg_selection="#1a1a2e",
    bg_toast_warning="#1a1400",
    bg_toast_error="#1a0008",
    # Foregrounds — white content, light-gray chrome
    fg="#ffffff",
    fg_muted="#9e9e9e",
    fg_dim="#6e6e6e",
    fg_subtle="#808080",
    # Borders — gray hierarchy
    border="#333333",
    border_input="#4a4a4a",
    border_focus="#808080",
    border_active="#b0b0b0",
    # Semantic accents — vivid on black, semantically subordinate to chrome
    green="#50fa7b",
    blue="#8be9fd",
    blue_light="#aee8ff",
    yellow="#f1fa8c",
    yellow_vivid="#ffb86c",
    red="#ff5555",
    red_vivid="#ff6e67",
    cyan="#8be9fd",
    purple="#bd93f9",
    footer_key="#8be9fd",
)

# SWR-1052: built-in theme registered with the design-system theme catalog.
traces(SWR.SWR_1052)(MONO)
