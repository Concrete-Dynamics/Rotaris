---
req-id: SWR-2092
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2000
title: "DPI-aware nav-rail icon rendering"
epic: SWR-2000
date: 2026-07-20
---

# SWR-2092 — DPI-aware nav-rail icon rendering

The `_glyph_icon()` function in `views/chrome.py` MUST create pixmaps at the
physical pixel density of the primary screen (`devicePixelRatio`) rather than
assuming 1×, so that nav-rail icons render at the same perceived size on
high-DPI Windows displays (125%, 150%, 200% scaling) as they do on Linux
(typically 1×).

The icon raster size MUST match the display size (`setIconSize`) to avoid
unnecessary upscaling at 1× DPR. Font size CALCULATION MUST use
`setPointSizeF` for sub-pixel precision on high-DPI fonts.

Derived from: [SWR-2000 — Rotaris Desktop](../2000-rotaris-desktop.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
