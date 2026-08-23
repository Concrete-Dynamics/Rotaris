---
req-id: SWR-3722
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3704
title: "Motion respects the reduced-motion preference"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3722 — Motion respects the reduced-motion preference

The design system ships one rule for motion that has no Qt equivalent by
default: `prefers-reduced-motion` collapses every animation and transition to
instant (`base.css`). A pulse, a rise, a spinner, a state fade — they exist to
confirm a change, and a reader who has asked the operating system for reduced
motion has already said those confirmations do them more harm than good. Qt
honours no such preference on its own: a `QPropertyAnimation` runs at its full
duration whatever the platform setting says.

Rotaris shall read the preference from the operating system where the platform
exposes one, offer a Settings toggle that mirrors and overrides it, and make
every animation it runs pass through one gate: when reduced motion is on, an
animation completes instantly — the end state is reached, only the travel is
gone.

- One **motion gate** owns the decision: `rotaris.theme.motion_enabled()` reads
  the stored preference (Settings), which in turn defaults to the platform's
  reduced-motion setting where one can be detected, and to "animations on"
  where it cannot.
- Every animated surface — the pulsing status dot, the toast rise, the spinner,
  hover and press transitions, dialog entrances — consults the gate before it
  starts. A disabled gate means the end state is painted directly, never a
  zero-opacity intermediate or a frozen first frame.
- Toggling the preference in Settings takes effect on the next animation,
  without a relaunch.
- The gate is **instant-completion, not no-completion**: state still changes,
  focus still moves, toasts still appear and dismiss. What is removed is the
  travel, never the outcome.
- The design system's own exceptions stay exceptions: the status-dot pulse and
  the spinner are continuous by design, and under reduced motion they render
  static (the dot full-opacity, the spinner as an arc) rather than animating.

## Acceptance criteria

- With reduced motion on, a toast appears at its final position at full
  opacity, a dialog opens at full size, and a pulsing dot paints without a
  running animation.
- With reduced motion off, behaviour is unchanged from before the gate
  existed.
- The stored preference is respected on startup, and changing it in Settings
  affects the next animation without restarting.
- On a platform that exposes a reduced-motion setting, a fresh install with
  that setting on starts with the gate closed.

## Test coverage

Unit tests assert the gate resolves the platform default and the stored
preference in the right order, and that every animation helper honours a closed
gate by completing instantly. A behavioural test turns the preference on,
raises a toast and opens a dialog, and asserts no animation object runs and the
surfaces are at their final geometry. A regression test asserts the pulse and
the spinner render statically under the gate.

Derived from: [SWR-3704 — Brand motif and elevation in Qt](SWR-3704-motif-and-elevation.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
