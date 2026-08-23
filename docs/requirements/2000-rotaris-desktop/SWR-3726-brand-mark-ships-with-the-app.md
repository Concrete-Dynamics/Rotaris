---
req-id: SWR-3726
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3700
title: "Brand mark ships with the application"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3726 — Brand mark ships with the application

The design system's logo is its `assets/logo.svg` — the amber/teal coordinate
circles under the violet ring — and it is the one Rotaris mark; the design
skill's rule is to use it as-is and never invent a different one. The desktop
app predates that decision: the title bar slot shows an ad-hoc letter `R`,
the running window carries no icon of its own, and the packaging assets hold
a generic square-R drawing — so a build, an installer and a running window
each present a different identity.

Rotaris shall ship the mark itself and use it everywhere an identity glyph
appears.

- The SVG lives at `apps/rotaris/src/rotaris/assets/logo.svg`, anchored on
  `__file__` exactly like the bundled fonts (SWR-3703), and is carried into
  frozen builds by the existing data collector. One module,
  `rotaris.theme.brand`, owns rendering: `mark_pixmap(size)` rasterises the
  mark at the primary screen's device pixel ratio, and `mark_icon()` builds
  the multi-size window icon.
- The title bar's mark slot paints the SVG at 22 px — the UI kit's size —
  instead of the letter placeholder. The placeholder survives only as the
  degradation path when the asset is missing or unrenderable, so a broken
  bundle never paints a blank mark and never crashes.
- The application window icon is `mark_icon()`, so the taskbar, alt-tab
  strip and window chrome carry the mark rather than a platform default.
- The packaging assets are the same mark: `packaging/assets/rotaris.svg`
  (AppImage and desktop entry) and `rotaris.png` / `rotaris.ico` (the
  per-platform files `bundle_spec` embeds in the built executable).

## Acceptance criteria

- `apps/rotaris/src/rotaris/assets/logo.svg` and `packaging/assets/rotaris.svg`
  are byte-identical to the design system's `assets/logo.svg`.
- The title bar mark label holds a pixmap — not text — and the pixmap paints
  the brand's amber, teal and violet.
- `mark_icon()` is non-null, and the application sets it as its window icon.
- `packaging/assets/rotaris.png` and `rotaris.ico` exist, are non-empty and
  carry their format headers; `bundle_spec("rotaris")` resolves an existing
  icon file on the build platform.
- A missing or invalid SVG yields a null `mark_pixmap` and the letter
  placeholder in the title bar — never a crash and never an unpainted mark.

## Test coverage

Unit tests in `apps/rotaris/tests/test_chrome.py` rasterise the mark, assert
the three brand hues are present, assert the title-bar slot holds a pixmap
rather than text, and exercise the missing-asset degradation. Unit tests in
`tests/unit/packaging/test_pyinstaller_bundle.py` assert the packaging assets
exist with valid headers and that `bundle_spec` resolves an icon.

| Level | Productive scenario | Exercised boundary | Covering test |
| --- | --- | --- | --- |
| Unit | The title bar and the window icon show the brand mark | `mark_pixmap` / `mark_icon` → brand-hue pixels; TitleBar mark slot | `apps/rotaris/tests/test_chrome.py` |
| Unit | A build embeds the mark on every platform | `packaging/assets/*` exist and parse; `bundle_spec().icon` resolves | `tests/unit/packaging/test_pyinstaller_bundle.py` |
| User-flow E2E | N/A — identity painting, covered by the unit/integration levels | — | — |

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
