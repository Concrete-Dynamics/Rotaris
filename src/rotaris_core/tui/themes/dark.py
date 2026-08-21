from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.themes.base import Theme

DARK = Theme(
    name="dark",
    bg="#0f1117",
    bg_overlay="#070a0f",
    bg_selection="#1c2333",
    bg_toast_warning="#1a1500",
    bg_toast_error="#1a0008",
    fg="#e2e8f0",
    fg_muted="#94a3b8",
    fg_dim="#64748b",
    fg_subtle="#8899a6",
    border="#2d3748",
    border_input="#4a5568",
    border_focus="#64748b",
    border_active="#94a3b8",
    green="#68d391",
    blue="#63b3ed",
    blue_light="#bee3f8",
    yellow="#fbd38d",
    yellow_vivid="#ed8936",
    red="#fc8181",
    red_vivid="#f56565",
    cyan="#76e4f7",
    purple="#b794f4",
    footer_key="#90cdf4",
)

# SWR-1052: built-in theme registered with the design-system theme catalog.
traces(SWR.SWR_1052)(DARK)
