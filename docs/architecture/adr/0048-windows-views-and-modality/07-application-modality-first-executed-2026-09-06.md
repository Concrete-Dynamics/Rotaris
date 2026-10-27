# ADR-0048 — Windows, views and the three modality levels — Application modality — first executed 2026-09-06 (Part W)

Part 7 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## Application modality — first executed 2026-09-06 (Part W)

*Recorded under GD-10.* The command palette and the keyboard help (`REQ-SHELL-051`, `REQ-SHELL-054`) are the product's
first application-modal surfaces, so the level this record decided but Part R could not exercise was built here: the
surface is an in-window overlay **and** registers itself with main's window registry over the new `window.modality`
command, which calls `PersonaWindows.setFamilyModal`. That disables every persona window of the main window's family
(`BrowserWindow.setEnabled(false)`) while the surface is open and restores them when it closes; a persona window created
while a surface is open is created disabled, and the main window's navigation, reload or renderer crash restores the
family, so a modal surface cannot outlive the renderer that opened it. Only the main window may send the command; a
persona window sending it is refused (`window.notMain`). The pause dialog, the approval dialog and the confirmations
stay window-modal, as this record says.

**How it was observed, and why the obvious way proves nothing.** This record says the level "is observable — a click on
the persona window while the palette is open must do nothing — and therefore must be built rather than assumed". The
proof's first attempt used `webContents.sendInputEvent`, and it is the wrong instrument: an injected event enters the
renderer **below** the host's input block, so it passes through a window the host has disabled and would have reported
success against a product that did nothing. `pnpm palette-proof` therefore delivers a real click and real keystrokes
through the operating system's own cursor and keyboard queue (`apps/desktop/scripts/os-input.ps1`, verification only)
and reads what the host says about the window. Measured: the persona window enabled before the palette opened, **not
enabled while it was open** — by the registry's own reading and by the host's `IsWindowEnabled` at the instant of the
click — enabled again after Escape closed it, and the window's rendered content identical before and after the blocked
click and the three keystrokes that followed it (`alpha` → `alpha`).

**A reading this forced, kept because it will mislead the next person.** A disabled window on Windows can still be
brought to the **foreground**: the host refuses the window's input, not its z-order. An assertion that the blocked
window is not foreground fails against a correct implementation, and the proof does not make it. What the reading turns
on is the host's enabled state at the moment of the input and the window's unchanged content.

**On Linux (2026-09-28, R-062) the host half is not measured, and the proof says so.** The driver is Win32's, and X11
has no per-window enabled state to report. Until then the proof spawned `powershell.exe` on every platform and went red
on `ENOENT`. Under Xvfb it now asserts the registry's reading: the persona window was enabled before the palette,
disabled while it was open, enabled after Escape, and main logged the modality pair. The host-input readings are stated
not applicable. **Not measured on Linux:** that a real X server click and real keystrokes are refused by the disabled
window. That needs an XTEST driver, which this harness does not have
([`palette-proof-reads-the-win32-host-input-on-every-platform.md`](../../../defects/fixed/palette-proof-reads-the-win32-host-input-on-every-platform.md)).

**Found — one defect, in this part's own code, before any of the above could be measured.** Binding `Ctrl+L` and
`Ctrl+Return` through the registry made both wait two animation frames, so that the Workspace view would be mounted
before the caret moved. That is correct when the chord arrives from another view and wrong when it arrives from
Workspace, which is the ordinary case: the caret then arrived a frame after the keystroke that followed it, and text
typed immediately after `Ctrl+L` went to whatever held focus before. The product's own prompt seam is a user typing at
exactly that speed, and it stopped submitting — no run started in the modality launch, and the finding came from that
failure rather than from a review. `nowOrAfterMount` now does the work in the same turn where the surface is already
mounted and defers only where it is not (`REQ-CHAT-002`). The falsified reason is kept beside it: waiting for the mount
is right for the switch and wrong for the common case.

**Not built, said so.** Three entries of `REQ-SHELL-049` are absent from all three surfaces, each recorded in
`OMITTED_COMMANDS` with its reason rather than dropped: "Search transcript" (Ctrl+F — no transcript search panel),
"Open terminal" (Ctrl+Shift+T — no terminal window, owed with ADR-0021) and "Open demo window" (`REQ-SHELL-162` — no
demo mode), plus `REQ-CHAT-167`'s reasoning toggle, whose preference key is not registered. *Corrected 2026-10-13
(fin41, N71):* "Open terminal" returned with the terminal window on 2026-09-10 (Part AL′). The other two reasons were
falsified a day later and the entries stayed withheld for five weeks: the search panel was built on 2026-09-07 (Part Z,
`REQ-CHAT-074`) and `display/showReasoning` was registered the same day (Part AA). Both entries are in the registry
since 2026-10-13 (the section at the end of this record); only "Open demo window" is still omitted, and its reason is
still true. `REQ-SHELL-048`'s third
surface, the composer's slash catalogue, is the CHAT domain's and is not built; `slashName` and `slashDescription` are
this registry's normal form so that catalogue consumes this table rather than restating it. Window-level Escape
(`REQ-SHELL-055`) resolves in the specified order over the slots that exist: the compact drawers register a closer, and
the slash popup and the search panel register nothing because neither is built. *Corrected 2026-10-13:* the slash popup's slot was filled
on 2026-09-09 (the next section); the search panel was built on 2026-09-07 and its slot is still empty — recorded as
[`window-level-escape-skips-the-open-transcript-search-panel`](../../../defects/fixed/window-level-escape-skips-the-open-transcript-search-panel.md),
not repaired. *Repaired 2026-10-14 (fin43):* the pane holds the `searchPanel` slot while its panel is open, with the one
close its field's Escape and its Close button run, so the window's Escape closes the panel and refocuses the composer
before the drawers (`resolveWorkspaceEscape`, `searchPanelCloser`); `transcript-proof`'s behaviour stage presses Escape
from the panel's Next button and reads the panel closed and the composer focused. The palette and the help are drawn in
the main window only; an auxiliary window offers neither. `REQ-SHELL-165`'s determinable case — presenting an action
with no chord where the product knows the host consumed it — is not built, because no host publishes its reservations;
the chord is shown and nothing is raised, which is that requirement's ordinary branch.
