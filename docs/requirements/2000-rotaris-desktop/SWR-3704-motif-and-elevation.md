---
req-id: SWR-3704
status: approved
trace: required
type: technical
derived-from: SWR-3700
title: "Brand motif and elevation in Qt"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3704 — Brand motif and elevation in Qt

Two parts of the design system have no Qt equivalent and would otherwise be
dropped silently, because Qt's stylesheet accepts the declarations and does
nothing with them.

**Elevation.** The system writes it as `box-shadow`, layering a hairline and a
soft ambient shadow. QSS implements no shadow at all. Rotaris therefore splits an
elevation step: the hairline is a real border in the stylesheet, and the ambient
part is a drop-shadow effect a floating widget attaches. Resting surfaces get the
hairline only — the system reserves shadow for things that actually float, and a
card that casts one reads as a dialog.

**The motif.** The brand's grid is not a decoration bolted on: it is the 8px
module the layout is built on, made visible. It appears behind hero sections and
empty states and never under dense data. The fade rule — a divider that dissolves
at both ends rather than stopping cleanly — is drawn on the same 32px unit. The
axis mark is the coordinate system as a small abstract figure.

Rotaris shall carry both as painters that read the active theme.

- An **elevation token** carries a border colour, a blur, a vertical offset and
  a shadow colour, and states whether it has a shadow at all.
- Attaching an elevation to a widget configures a drop-shadow effect from that
  token; a step with no shadow attaches none rather than a zero-radius one.
- The **grid background**, **dot grid**, **fade rule** and **axis mark** are
  painters, drawn from theme tokens at paint time, on the theme's grid unit.
- The motif honours its own rule: the grid background is available to hero and
  empty-state surfaces and is not applied to tables, transcripts or trees.
- Animation stays as sparse as the system says: one recurring motion, a status
  dot breathing while its state is actively running, on the theme's pulse
  duration and easing.
- Motion tokens resolve to real `QEasingCurve`s, so a transition Rotaris runs
  uses the system's easing rather than Qt's default.

## Acceptance criteria

- An elevation applied to a widget produces a drop-shadow matching that token's
  blur, offset and colour; the resting step produces no shadow effect.
- The grid, dot-grid, fade-rule and axis-mark painters draw from the active
  theme and change with it.
- The fade rule is drawn with a gradient that reaches full transparency at both
  ends.
- Motion tokens convert to easing curves whose endpoints are the declared
  cubic-bezier control points.
- The pulsing status indicator animates only while its state is running, and
  stops when the state is not.

## Test coverage

Unit tests assert the elevation → effect mapping including the no-shadow case,
that each painter renders onto an image and changes when the theme changes, that
the fade rule's gradient is transparent at both ends, and that the easing curves
carry the declared control points. A behavioural test asserts the pulse animation
starts and stops with the state rather than running continuously.

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Derived requirements: [SWR-3723 — Motion respects the reduced-motion preference](SWR-3723-reduced-motion-gate.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
