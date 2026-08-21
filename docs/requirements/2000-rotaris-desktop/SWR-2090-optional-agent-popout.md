---
req-id: SWR-2090
status: approved
trace: required
test: required
title: "Optional agent detail pop-out"
epic: SWR-2000
date: 2026-07-20
---

# Optional agent detail pop-out

Clicking an agent shall inspect it in the workspace inspector by default. Settings shall provide an Interface toggle that optionally restores opening or raising the separate persona window on every agent click. The preference shall persist across application restarts.

## Acceptance criteria

- With no stored preference, an agent click changes inspector selection without opening a window.
- With the toggle enabled, an agent click also opens or raises its persona window with that instance selected.
- Changing the toggle updates behavior immediately and persists across application restarts.
- Explicit pop-out actions remain available regardless of the toggle.
