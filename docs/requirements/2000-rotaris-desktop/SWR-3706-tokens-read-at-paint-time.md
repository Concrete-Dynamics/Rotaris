---
req-id: SWR-3706
status: approved
trace: required
type: technical
derived-from: SWR-3700
title: "Every surface reads tokens at paint time"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3706 — Every surface reads tokens at paint time

A themeable token layer is only as live as its slowest reader. Rotaris has
roughly four hundred and sixty presentation reads spread across forty-one view
and widget modules, and they were written against module constants: bound once,
at import, to whichever palette loaded first. Some are worse than merely early —
a stylesheet assembled in a class body is fixed before any instance exists, so
even rebinding the module would not reach it.

Every one of those reads shall resolve against the active theme when the surface
paints or restyles.

- A module obtains tokens through the **accessor**, not by importing values.
- A presentation value is read **inside** the method that paints or restyles,
  never in a class body, a default argument, or a module-level constant.
- A widget that paints itself **repaints** on a theme change; a widget that
  carries a stylesheet **re-applies** it.
- The global stylesheet is **rebuilt from the active theme** and re-applied to
  the application, and Qt's own palette is set to match so unstyled native
  surfaces follow too.
- The accessibility sweep's mirror of the global stylesheet is derived from the
  same builder rather than transcribed, so retuning a token cannot silently
  weaken the sweep.
- No production module under `apps/rotaris/src/` holds a colour, radius or
  spacing literal outside the theme package.

## Acceptance criteria

- No module outside `rotaris.theme` contains a hex colour literal or an
  `rgba(` literal.
- No class body, module-level constant or default argument outside
  `rotaris.theme` holds a resolved presentation value.
- After a theme change, a sweep of the live widget tree of all seven primary
  views finds no widget still painted in the previous theme's ground, text or
  accent.
- Self-painting widgets receive a repaint on a theme change, and stylesheet
  widgets receive a re-apply.
- The application stylesheet and the Qt palette both change with the theme.
- The accessibility sweep's stylesheet mirror is generated from the stylesheet
  builder, and its guard test fails if the two disagree.

## Test coverage

A static test walks every production module under `apps/rotaris/src/` and fails
on a colour literal or an import-time presentation binding — this is the test
that keeps the property true as the app grows, rather than a one-off audit. A
live sweep builds all seven views, changes the theme, and asserts no surviving
old-theme colour anywhere in the widget tree. The existing accessibility sweep's
mirror-guard test is extended to assert the mirror is derived rather than
transcribed.

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
