---
name: Rotaris
colors:
  graphite-ground: "oklch(21% 0.006 275)"
  graphite-chrome: "oklch(18% 0.006 275)"
  graphite-surface: "oklch(24.5% 0.007 275)"
  graphite-raised: "oklch(28% 0.008 275)"
  hairline: "oklch(30% 0.008 275)"
  ink: "oklch(94% 0.004 275)"
  ink-secondary: "oklch(80% 0.006 275)"
  ink-tertiary: "oklch(68% 0.008 275)"
  axis-z-violet: "oklch(59% 0.160 292)"
  axis-y-running: "oklch(65% 0.188 165)"
  axis-x-waiting: "oklch(67% 0.190 86)"
  danger: "oklch(64% 0.200 25)"
  info: "oklch(70% 0.130 210)"
typography:
  body:
    fontFamily: "Manrope"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.62
  title:
    fontFamily: "Manrope"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.12
  label:
    fontFamily: "Manrope"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.075em"
  data:
    fontFamily: "JetBrains Mono"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "5px"
  md: "8px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.axis-z-violet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "32px"
  nav-item:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    height: "32px"
---

# Design System: Rotaris

This file is the summary the Impeccable design skill reads. **The authority is `docs/design/`**: the language is
[`docs/design/README.md`](docs/design/README.md) §1 as [part 08](docs/design/README/08-8-the-2026-11-14-revision.md)
revises it, the structure is [`docs/design/information-architecture.md`](docs/design/information-architecture.md), and
the values are `packages/contracts/src/theme/themes.ts`. Where this file and those disagree, they govern and this file
is the defect. The frontmatter gives `rotaris-dim`'s values; `nocturne` and `high-contrast` are in `themes.ts`.

## Overview

An Operate surface: a desktop tool an engineer runs for hours beside a terminal and an editor, to start, watch and
steer AI agents. The ambition is precision and restraint. The window is a frame of deep graphite chrome — title bar,
navigation sidebar, status strip — around a lit ground where the work is read. Structure is carried by hairlines and
headings, not boxes. Colour is rare and means something: three axis colours state what the work is doing.

## Colors

### Primary

**Axis Z violet** (hue 292). The accent: the one filled control of a view, the current selection, the focus ring, and
the *done* state. Never a decoration.

### Secondary

**Axis Y green** (running, healthy) and **Axis X amber** (waiting, warning): the other two axes of the product's mark.
Red is failure and destruction; cyan is information and an idle dot.

### Neutral

**Graphite**: every neutral carries a trace of hue 275 at a chroma under 0.01. The planes, from deepest: chrome 18 %,
ground 21 %, surface 24.5 %, raised 28 %. Ink at 94 %, 80 % and 68 %.

### Named Rules

- **The lit plane.** The chrome is darker than the content. Never the reverse.
- **A fill means it floats or takes input.** A dialog, a menu, a drawer, the composer, a field. Not a region of a page.
- **State twice.** A state colour always stands beside its word.

## Typography

One family in the interface: **Manrope**, 400 and 500 only. **JetBrains Mono** for code, identifiers, paths and
figures, with tabular numerals. **Space Grotesk** is the wordmark's alone.

### Hierarchy

A view's title: 16 px, medium. A section's heading: 12 px, medium, sentence case, primary ink. Body: 14 px; dense
interface text 12 px; captions 11 px in the secondary or tertiary ink. A tracked upper-case label (10 px) only where a
line labels and does not head: table columns, navigation groups.

### Named Rules

- **Hierarchy from size, ink and space.** Nothing is set above weight 500.
- **Mono is for what is measured or typed**, never for atmosphere.

## Layout

A sidebar of 232 px (a 68 px rail below 1600 px or when folded) beside one view. A view is inset once: 20 px above,
24 px at the sides. Spacing is the 4 px scale. A region is a section — a hairline above, a heading, its content — and
sections are separated by 20 px. The Workspace fills its region with three panes: agents, transcript and composer,
inspector.

## Elevation & Depth

Flat by default. A hairline defines an edge; a shadow means only "this floats", with an offset and a soft blur
(`--rt-shadow-md`, `--rt-shadow-lg`).

## Shapes

Radius 5 px on controls and rows, 8 px on floating surfaces, 14 px on the composer. A page region has no radius.

## Components

### Buttons

Primary (filled violet): at most one per view. Secondary (outlined) for a view's other acts; ghost and link for acts
inside a row; danger and warning by outline and ink, never by fill. 32 px, compact 24 px.

### Cards / Containers

On a view's ground a card is a ruled section. Inside a floating surface it keeps a surface fill and a hairline border.
Cards are never nested.

### Inputs / Fields

A surface fill, a hairline boundary at 3:1, 32 px high; the focus ring is the accent's light step, 2 px, offset.

### Navigation

The sidebar: New session; Workspace, Overview; Sessions; then at the foot Project — Requirements, Git, Library — and Settings.
A view button is 32 px, icon beside label; the active one carries an accent tint and an accent icon.

### Empty state

A statement in the primary ink, one hint, one next act. No frame, no motif behind the text.

## Do's and Don'ts

### Do:

- Cite a token by name; add a control to the design system before using it.
- Let a table's Activity or path column give way first, by eliding.
- Say what an empty region will hold and how to fill it.

### Don't:

- Box a region of a page, nest a card, or head a section with a tracked label.
- Use the display face, a gradient, a glow or a coloured side stripe.
- Add a second filled control to a view.
