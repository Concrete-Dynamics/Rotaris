# Rotaris Design System — vendored reference

Source of truth for the app's visual language. Authored in the Claude Design
project **"Rotaris Design System"** and vendored here so the repo is
self-contained and a re-sync is a reviewable diff.

Implemented by `apps/rotaris/src/rotaris/theme/` (SWR-3700 … SWR-3706). The
`rotaris-dim` palette is a transcription of `tokens/*.css` below, in the same
OKLCH units — see `theme/palettes/rotaris_dim.py`.

## Files

| Path | What it is |
| --- | --- |
| `tokens/colors.css` | ground, accent ramp, the X/Y/Z axis ramps, semantics, diff colours |
| `tokens/typography.css` | font stacks, the type scale, tracking, leading |
| `tokens/spacing.css` | the 8px module and the 32px grid unit |
| `tokens/effects.css` | radii, elevation, motion |
| `components.css` | every component's anatomy, variants and states |

## What did not come across, and why

The design system is CSS. Some of it has no Qt equivalent, and QSS *accepts
these properties and silently does nothing with them* — so each is handled
elsewhere rather than being copied into a stylesheet where it would look
correct and change nothing.

| CSS | Where it lives in Rotaris |
| --- | --- |
| `box-shadow` | `theme.spec.Elevation` → `theme.motif.apply_elevation` (a `QGraphicsDropShadowEffect`) |
| `letter-spacing` | `theme.spec.TypeStyle.tracking` → `QFont.setLetterSpacing` |
| `font-variant-numeric: tabular-nums` | `theme.spec.TypeStyle.tabular` → `QFont.setFeature("tnum")` |
| `text-transform: uppercase` | the component uppercases its own text |
| `oklch()`, `color-mix()` | resolved in Python by `theme.color` before the stylesheet is built |
| `@keyframes` | `QPropertyAnimation` with `theme.motion.*.curve()` |
| Phosphor icon font | the app rasterises Unicode glyphs for the nav rail (SWR-2092, a DPI workaround) |

## Where Rotaris deliberately differs

The design system is a design system, not a Rotaris release. Three places where
the app's own contract overrides it, all enforced by tests:

1. **Contrast.** `apps/rotaris/AGENTS.md` requires 4.5:1 for text and 3:1 for
   interactive boundaries. This system's ground (`oklch(21% 0 0)`) is still
   lighter than the palette Rotaris shipped before, which compresses the range
   above it, and several specified values land under the floor when used as
   small text on a card. The system itself never paints text in a `500` — tags
   use a `fill-*` wash under its `-ink`, icons use the `300` — so Rotaris splits
   the roles: `color.run` is the dot (3:1) and `color.run_text` is the label
   (4.5:1). Where a value still falls short it is lifted by the smallest
   available move, one step up the ramp the designer drew. Every lift is
   commented at the point it happens in `rotaris_dim.py`.
2. **Font format.** The system self-hosts `woff2`, which Qt cannot read. The
   same faces are bundled as variable `.ttf` under
   `apps/rotaris/src/rotaris/assets/fonts/` with their OFL licences.
3. **Which face.** Rotaris does not set its interface in the system's brand
   display/body pair. Space Grotesk and Manrope were applied across the desktop
   and rejected in review: at the sizes this interface actually uses — ten- and
   eleven-pixel chips, dense table rows — they were not readable enough to work
   in. A web design system is drawn at web sizes; a dense operator tool is not
   a marketing page, and the host's own UI face is the one its platform hinted
   for those sizes. What Rotaris takes from `typography.css` is the *system* —
   the size ramp, the weight roles, the tracking, the tabular figures — which is
   the part that survives a change of face. The weight numbers do not transfer
   literally: the system's 500 body was drawn against Manrope, and against a
   grotesque like Segoe UI that renders a step heavy, so `rotaris_dim` fills the
   same role with 400. Both faces stay bundled (see `theme/fonts.py` for why),
   and `test_theme_typography.py` asserts no palette re-adopts them by accident.
