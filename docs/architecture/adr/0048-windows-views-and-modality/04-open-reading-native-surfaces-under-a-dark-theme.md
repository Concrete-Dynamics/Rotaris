# ADR-0048 — Windows, views and the three modality levels — Open reading — native surfaces under a dark theme

Part 4 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## Open reading — native surfaces under a dark theme

`REQ-SHELL-160(b)` makes it an acceptance criterion that, on each supported platform and in each
built-in theme, **no native surface presents a light background while a dark theme is active**, and it
names native dialogs as things to be inspected on screen. `REQ-SHELL-164` says the product is answerable
only for what it supplies to a native dialog, and that a host whose native dialog falls short does not
put the product out of conformance. On most platforms the operating-system folder chooser follows the
**system** light/dark setting, not the application's theme, and no application-side call changes that.
Read literally, a dark theme on a light-mode host is non-conformant and the only remedy is to stop using
native choosers — which four requirements require us to use.

**Reading taken:** `REQ-SHELL-160(b)` covers surfaces the application itself tints — the engine's own
menus, caret, disabled text and form-control colour scheme, all of which the theme-source and
colour-scheme mechanisms of ADR-0050 do control — and `REQ-SHELL-164` carves out the host's own dialogs.
**This needs confirming rather than assuming** (OQ-29).

**First execution on Windows, 2026-09-04:** the built-app proof confirmed the reading for the product-owned
leg. Electron's native theme source follows each theme's dark flag before window creation; every document
advertises the matching colour scheme; themed window grounds, carets, form controls and disabled text followed
the active theme across all fifteen captures. The operating-system folder chooser remains governed by the
host's theme under the `REQ-SHELL-164` carve-out. Platform-specific confirmation continues with IC-3 for macOS
and Linux; `../spikes/theme-proof.md` holds the Windows evidence.
