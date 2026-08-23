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
| `base.css` | focus ring, selection, scrollbars, reduced-motion, utility classes |
| `motif.css` | the grid / dot-grid / fade-rule / axis-mark brand motifs |
| `guidelines/` | one rule card per topic (colour, type, motion, spacing, icons, motif) |

## Where the export contradicts itself — and which side wins

The export was authored incrementally and a few surfaces lag the tokens:

* `guidelines/motion-tokens.html` still shows the previous durations
  (100/180/260ms, shift 4px). The tokens in `tokens/effects.css` (90/160/240ms,
  shift 3px) are authoritative — the app transcribes those.
* The React kit's `StatusDot` defaults to `size=7` while `components.css`
  specifies 6px. The stylesheet wins.
* `guidelines/brand-wordmark.html` calls the logo "interim" while `readme.md`
  calls it final. Not the app's problem: the app draws no logo asset.

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

The design system is a design system, not a Rotaris release. The places where
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
3. **Which face — resolved.** Earlier revisions shipped the brand pair and
   Rotaris rejected it as unreadable at ten- and eleven-pixel sizes. The current
   export answers that objection in the type system itself: body weight drops
   from 500 to 400, every weight caps at 500, and the scale no longer asks a
   display face for 13px work. Rotaris keeps the display face and overrides the
   body face: **Space Grotesk** for display and section heads, **Roboto** for
   body and UI — the face every platform hints for dense work — with the
   system's own Manrope sitting directly behind it as the first fallback, and
   JetBrains Mono for every number and path. The weight roles stay the
   system's: 400 resting, 500 emphasised. The one exception is the High
   Contrast palette, which keeps its heavier weights (700/800): it exists for
   readers AA does not serve, and weight is its contrast budget, not decoration.
4. **Geometry is tokens, not pixels.** Every fixed dimension the design system
   pins — control heights, icon buttons, the nav rail, dots, scrollbars, radii,
   spacing — lives in the palette's `Sizing`/`Spacing`/`Radii` tokens and is
   read at paint time (SWR-3706). Views never hardcode a pixel for something a
   token names, which is what lets Qt's high-DPI scaling scale the whole
   interface uniformly on any display size.
5. **Dropdown height.** The CSS gives `.input` and `.select` the same
   `min-height:32px`. Rotaris gives dropdowns the compact control height
   (26px) instead: a picker is denser than a text field, and inputs keep the
   full 32px typing target. The QSS sweep enforces the split.
