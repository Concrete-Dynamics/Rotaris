---
req-id: SWR-3705
status: approved
trace: required
type: technical
derived-from: SWR-3700
title: "Colour tokens are authored in OKLCH and resolved to sRGB"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3705 — Colour tokens are authored in OKLCH and resolved to sRGB

The Rotaris design system writes every colour in OKLCH — a perceptual space in
which one ramp is one hue at nine lightnesses, and in which "the 600 step" means
the same thing whether the hue is amber or marine. Qt reads neither OKLCH nor
`color-mix()`: QSS understands `#rrggbb` and `rgba()`, and `QColor` understands
8-bit channels.

The obvious translation is a hand-copied hex table. It is also the one that
rots: the first time a ramp is retuned upstream, the table is wrong and nothing
says so, because every value still looks like a colour.

Rotaris shall keep colour tokens in the units the design system wrote them, and
resolve them.

- A palette is authored in **OKLCH**, so a palette line and the design-system
  stylesheet line it came from are the same text and a re-sync is a diff a
  reader can check.
- Resolution happens **once per theme**, at construction, not per paint.
- Colours outside the sRGB gamut are fitted by **reducing chroma while holding
  lightness and hue**, as CSS Color 4 prescribes. Clipping channels instead
  would be cheaper and would move the hue, so a ramp built from one hue would
  stop reading as one hue at its saturated end.
- The system's `color-mix(in oklch, …)` is available as a **perceptual mix**,
  with hue taking the shorter arc, and with a near-grey endpoint contributing no
  hue at all — mixing the neutral ground towards an accent must lighten it, not
  tint it, or the true-neutral ground the system insists on stops being neutral
  the first time something hovers.
- A resolved colour is usable **without conversion at the call site**: the same
  token works inside an f-string stylesheet and in a `QPainter` call.
- **Contrast is measured on what a reader sees.** A translucent colour is
  composited onto its ground before its ratio is computed.

## Acceptance criteria

- Known OKLCH coordinates resolve to their expected sRGB values within one 8-bit
  step, checked against reference conversions.
- A coordinate outside sRGB resolves to a colour of the same hue and lightness
  with reduced chroma, not to a clipped one of a different hue.
- Resolving an in-gamut coordinate leaves it unchanged.
- A perceptual mix between two colours returns endpoints exactly at weight 0 and
  1, and mixing a chroma-0 colour towards a chromatic one changes its lightness
  without introducing hue.
- A resolved colour renders as `#rrggbb` when opaque and as `rgba(...)` when
  not, and yields the equivalent `QColor` either way.
- The contrast of a translucent colour is computed after compositing it onto its
  ground, and differs from the ratio of the uncomposited colour.

## Test coverage

Unit tests check resolution against reference OKLCH→sRGB values, assert the
gamut fit preserves hue and lightness, assert mix endpoints and the achromatic
rule, assert the string and `QColor` forms agree, and assert compositing changes
the measured contrast of a translucent token. A property-style sweep asserts
every resolved colour is in range for every built-in theme.

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
