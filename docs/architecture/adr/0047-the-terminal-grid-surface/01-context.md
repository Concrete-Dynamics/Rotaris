# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — Context

Part 1 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## Context

`REQ-SHELL-095` and `REQ-SHELL-098` require a real character grid with alternate-screen fidelity,
per-cell bold, italic, underline and reverse video, and the sixteen ANSI colours as **theme tokens**.

`REQ-SHELL-089`, `REQ-SHELL-090` and `REQ-SHELL-097`: **no keystroke reaches the process until
take-control is armed.** While unarmed, any printable or named key raises a one-time informational
banner and is consumed. Key handling priority is fixed in five ordered rules, and one chord always
leaves the grid and is never forwarded.

`REQ-SHELL-096` and `REQ-SHELL-166`: the key encoding vocabulary is **closed** — named encodings for the
arrows, home and end, page up and down, tab, backspace, escape, enter and control-letter chords;
printable text verbatim; and **a key with no encoding transmits nothing at all**, with no substitute
sequence invented.

`REQ-SHELL-101` and `REQ-CHAT-075`: scrollbar range equals retained history rows; a refresh keeps the
tail only if already at the tail; one wheel notch scrolls **exactly three rows**, and high-resolution
deltas scroll proportionally with the **fractional remainder accumulated across events** so slow
continuous scrolling loses no motion; clamped at both ends, never wrapping. Selection is whole-cell,
direction-independent, right-trimmed per row, newline-joined; an empty-selection copy puts nothing on
the clipboard and **reports failure**.

`REQ-SHELL-098`: the cursor is painted only when *all three* hold — process running, grid focused, view
at the tail — filled while armed, hollow while read-only; the theme's terminal background fills the
entire widget throughout a resize so no frame exposes the platform surface colour.

`REQ-SHELL-100`: cell size comes from the theme's monospace face, is **re-measured on theme change** and
the new grid size re-reported to the backend; a padding gutter; never fewer than a stated minimum;
dimensions reported to the backend **only while visible and meaningfully laid out, and only when they
change**, so a placeholder-size viewport can never shrink the emulated screen and discard output.

`REQ-SHELL-107`: user terminal input is **not a tool call** — it bypasses permission patterns but is
written to the session permission audit log as user-originated input, one entry per submitted line, with
control sequences flushing the pending line, navigation keys unlogged, a held key not flooding the log,
and both the typed line and the command context secret-redacted before logging.

`REQ-SHELL-086`: closing the pop-out stops its ticking, the previews keep streaming, and the next open
rebuilds it fresh — a **deliberate difference** from the persona window, which hides rather than
rebuilds.
