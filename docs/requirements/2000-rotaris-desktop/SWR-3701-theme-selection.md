---
req-id: SWR-3701
status: approved
trace: required
test: required
title: "A user can choose the Rotaris theme, and it applies without a relaunch"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3701 — A user can choose the Rotaris theme, and it applies without a relaunch

Rotaris is a tool people sit in front of for hours. Its ground, its contrast and
its accent are not decoration for that user — they decide whether a long session
is comfortable, and whether the interface is legible at all for a reader the AA
floor does not serve. Rotaris has one appearance and no way to say anything
about it.

A user shall be able to choose the theme Rotaris paints itself in, from
Settings, and see the choice take effect immediately.

- **Settings → Interface** carries a theme control listing every built-in
  theme by its label, with the active one selected and each one's character
  described in a sentence rather than only named.
- Choosing a theme **repaints the running application** — every view, every
  open dialog, every self-painting widget. Nothing waits for a relaunch, and
  nothing is left showing the previous palette.
- The choice **persists** and is restored on the next launch. A stored theme
  that no longer exists falls back to the default and the application still
  starts.
- The change **preserves the user's work**: an in-progress run keeps running,
  transcript scroll position is kept, unsaved composer text is kept, and panel
  sizes are kept.
- Every theme Rotaris offers **meets the same accessibility floor** it holds
  itself to elsewhere — 4.5:1 for body text and 3:1 for interactive boundaries —
  so a theme is never a way to ship an unreadable interface.

## Acceptance criteria

- Settings → Interface lists the built-in themes with labels and descriptions,
  and marks the active one.
- Selecting a different theme updates the visible window without a relaunch, and
  the newly-selected theme is the one reported as active.
- The selection survives an application restart.
- A persisted theme name that is no longer known starts the application on the
  default theme instead of failing.
- Switching a theme mid-run leaves the run, the transcript position, unsent
  composer text, and panel sizes intact.
- The theme control carries an accessible name, and the active theme is
  conveyed by more than colour.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The theme control lists every registered theme, marks the active one, and reports a selection | Settings interface section over the theme registry | `apps/rotaris/tests/test_theme_selection.py` |
| Integration | Setting a theme repaints the application stylesheet and Qt palette, notifies subscribers once, and writes the choice through to config; an unknown stored name degrades to the default | `ThemeManager` → `QApplication` → config service | `apps/rotaris/tests/test_theme_manager.py` |
| User-flow E2E | A user opens Settings, picks another theme, and the open window is repainted while their run, scroll position and unsent prompt survive; the choice is still in force after a restart | Real `MainWindow` driven by accessible name | `apps/rotaris/tests/test_theme_switching_flow.py` |

Depends on: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
