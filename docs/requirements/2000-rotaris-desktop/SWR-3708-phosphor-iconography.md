---
req-id: SWR-3708
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3700
title: "Iconography ships with the application"
epic: SWR-2000
date: 2026-08-21
---

# SWR-3708 — Iconography ships with the application

The design system's icon language is Phosphor — every symbol in the design
project's guidelines, components and UI kit is a Phosphor glyph, and its brand
rules forbid emoji and ad-hoc marks. The desktop app predates that decision:
the nav rail rasterises seven Unicode characters picked for what Windows
font-fallback happened to have (SWR-2092), buttons carry text-glyph prefixes
like `✕`, and everything else is words alone. Which symbol a surface shows is
currently a property of the host's font directory, exactly the defect
SWR-3703 removed for text.

Rotaris shall bundle the Phosphor icon fonts (regular and fill weights, MIT
licence alongside, in the same `assets/fonts/` directory SWR-3703 registers at
startup) and shall expose the icon vocabulary through one module,
`rotaris.theme.phosphor`:

- a curated name → glyph mapping using Phosphor's own icon names
  (`git-branch`, `gauge`, `folder-simple`, …) — only names the product uses,
  so an unused icon is a removal, not dead weight;
- an unknown name raises rather than rendering a blank, so a typo is a test
  failure and never a silent empty pixmap;
- `icon(name, color, size)` rasterises a glyph at the primary screen's device
  pixel ratio, the same DPI treatment SWR-2092 gives the rail today;
- `set_button_icon(button, name)` places an icon on a design-system button and
  keeps it correct: the ink is resolved from the button's `variant` property
  against the *active* theme, and every registered icon is re-rasterised when
  the theme changes (SWR-3701, SWR-3706) — never captured at call time.

The nav rail's seven items shall name Phosphor icons instead of fallback
characters. The rasteriser keeps accepting a raw character so a surface with a
genuine text glyph (a close `×`, tree branch art) still works, but no shipped
nav item uses one.

## Acceptance criteria

- `Phosphor.ttf` and `Phosphor-Fill.ttf` are bundled with their licence and
  registered by the SWR-3703 loader; under the `offscreen` platform the
  families resolve without any host font.
- Every `NAV_ITEMS` entry names an icon in the curated mapping, and each
  renders a non-empty pixmap at 1×, 1.5× and 2× device pixel ratio.
- `phosphor.icon()` for an unknown name raises `KeyError`.
- After a theme change, a button icon placed by `set_button_icon` reports the
  new theme's ink for its variant — no icon holds the colour of the theme the
  user just left.
- No production module outside `rotaris.theme.phosphor` spells a Phosphor
  codepoint; surfaces name icons.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Rail icons render at fractional DPR; unknown name raises; button icon retints on theme switch | `phosphor.icon` / `set_button_icon` → pixmap and ink | `test_theme_phosphor.py` |
| Integration | Chrome and views build with Phosphor icons under `offscreen` | Window construction → non-empty nav icons | existing `test_chrome.py` NAV_ITEMS sweeps |
| User-flow E2E | N/A — no user-observable behaviour beyond painting, covered by the integration sweep | — | — |

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
