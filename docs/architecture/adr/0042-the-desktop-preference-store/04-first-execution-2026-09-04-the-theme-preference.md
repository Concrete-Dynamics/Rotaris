# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — First execution — 2026-09-04, the theme preference

Part 4 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## First execution — 2026-09-04, the theme preference

*Recorded under GD-10.* `packages/platform/src/preferences.ts` builds the first closed registry entries:
`appearance/theme`, `interface/settingsTab` and `ui/reduced_motion`, each with its type, default, owner and
coercion. Main resolves the root once before its first read and records it. The implemented order is
`ROTARIS_PREFERENCES_ROOT`, then `XDG_CONFIG_HOME/Rotaris/Rotaris`, then the platform per-user settings root;
Windows resolves to `%LOCALAPPDATA%\Rotaris\Rotaris`.

> **Corrected 2026-10-06 (fin22), after OQ-33's ruling (R-071).** The order above read `XDG_CONFIG_HOME` on every
> platform, which the decision never restricted. OQ-33 was ruled Linux-only: the configuration home is honoured on Linux
> alone, and the benchmark-private variable carries its job on Windows and macOS. The implemented order is now
> `ROTARIS_PREFERENCES_ROOT`, then on Linux `XDG_CONFIG_HOME/Rotaris/Rotaris` (else `~/.config/Rotaris/Rotaris`), on Windows
> `%LOCALAPPDATA%\Rotaris\Rotaris` and on macOS `~/Library/Application Support/Rotaris/Rotaris`, the same platforms
> `resolveUserDirs` honours the variable on
> (`docs/defects/fixed/the-preference-root-honours-xdg-config-home-on-every-platform.md`).

The theme write uses `replaceDocumentSync`, including the file flush and directory flush supplied by the
atomic document primitive, before the command returns. Tests established that an unknown stored theme resolves
to Rotaris Dim while leaving the file byte-identical, ordinary registered values round-trip, and the isolated
proof root keeps the user's preference location untouched. The fifteen startup captures each exercised this
same read path before first window creation.
