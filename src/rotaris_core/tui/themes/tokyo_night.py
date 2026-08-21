from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.themes.base import Theme

TOKYO_NIGHT = Theme(
    name="tokyo-night",
    bg="#1a1b26",
    bg_overlay="#0d0e17",
    bg_selection="#1a2338",
    bg_toast_warning="#2a2112",
    bg_toast_error="#2a1620",
    fg="#c0caf5",
    fg_muted="#a8b0d0",
    fg_dim="#7a8098",
    fg_subtle="#b0b8d4",
    border="#4a4a52",
    border_input="#52525e",
    border_focus="#c0cad8",
    border_active="#cfd8e8",
    green="#a8d898",
    blue="#a8c4f0",
    blue_light="#c8d8e8",
    yellow="#e8c898",
    yellow_vivid="#e0af68",
    red="#f0a8b0",
    red_vivid="#f7768e",
    cyan="#a8d8f0",
    purple="#c8b8f0",
    footer_key="#b0c8dc",
)

# SWR-1052: built-in theme registered with the design-system theme catalog.
traces(SWR.SWR_1052)(TOKYO_NIGHT)
