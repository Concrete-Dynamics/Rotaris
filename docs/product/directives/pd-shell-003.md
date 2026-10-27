[Product directives](../directives.md) › PD-SHELL-003

<a id="pd-shell-003"></a>

### PD-SHELL-003 — the main window carries one product-drawn frame on every desktop

On Windows, Linux and macOS, the main window SHALL show no native frame, application menu, menu bar or toolbar above
the product. Its product-drawn title bar SHALL be the window's visible top frame and SHALL retain the
title "Rotaris" together with every item and ordering REQ-SHELL-033 already fixes.

At the right edge of that title bar, after the existing title-bar contents, the product SHALL draw three
keyboard-reachable window controls in this order: minimize, maximize or restore, and close. Each SHALL
carry an accessible name and a matching tooltip. The middle control SHALL read and perform "Maximize"
while the window is not maximized and "Restore" while it is maximized. Double-clicking an otherwise
inactive part of the title bar SHALL make the same maximize-or-restore transition. Minimize and
maximize/restore SHALL act on the main window that raised the command. Close SHALL enter the existing
close flow, including the unsaved-settings, worktree-integration and active-run guards; it SHALL NOT
bypass or duplicate them.

The controls and draggable region SHALL use the adopted design language: title-bar ground, neutral icon
ink, hover wash, an in-bounds focus ring, and danger ink only while the close control is hovered or
focused. Interactive title-bar contents and all three controls SHALL remain outside the draggable region.
The product SHALL use the same controls and command path on Windows, Linux and macOS rather than branching to a
different renderer surface per platform. Other application windows retain their existing native frame.

**Why, and what it costs.** The native Electron menu bar adds a second, host-styled band above the shell
and makes the product's specified title bar read as content rather than window chrome. One product-drawn
frame removes that duplicate hierarchy and keeps the main window visually consistent across every
supported desktop host. The cost is that the product now owns three pieces of
platform behaviour that the host previously drew: the controls must remain operable by keyboard and
pointer, the maximize state must stay truthful after host-driven changes, and the close control must
continue through the guard rather than destroying the window directly. Auxiliary dialogs and pop-outs
keep their native frame because extending custom chrome to every role would enlarge the change without
answering the duplicate main-window toolbar the owner identified.

> **Extends:** REQ-SHELL-022, REQ-SHELL-033, REQ-SHELL-119

*Raised by the owner, 2026-09-24; logged as [R-050](../requests.md#r-050).*

> **First execution, 2026-09-24:** the frameless-window options, all four command outcomes and the three
> rendered controls passed their focused tests; the whole unit suite passed 2,168 tests with 26 skipped;
> typecheck, lint and the production build passed. `pnpm app:drive` was attempted twice and its child Electron
> could not connect to this host's Wayland socket. A normal development launch then painted the main window;
> its log records `main window 1 loaded`. The driver/CUA interfaces still exposed no target for inspecting its
> pixels or exercising pointer gestures, so the screenshot and live control gestures remain unverified.
>
> **Revision 2, 2026-09-24:** the owner extended the same product-drawn frame to macOS after reviewing the
> first implementation. The main window is now frameless on all three supported desktops; auxiliary senders
> are refused before any frame command acts, Electron's default application menu is removed rather than merely
> hidden, and the control group has an exposed accessible name. Electron's
> draggable region owns native double-click maximize/restore; the renderer listens to resize to keep its icon
> truthful rather than expecting a pointer event that Electron deliberately withholds from draggable regions.
>
> **Windows run, 2026-10-21** (the Windows ARM64 session's D1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, built at `dbf6a514`, display at 150% (144 dpi)). A scratch driver (never committed) drove the built app on a scratch workspace and read the window through Win32 (`IsZoomed`, `IsIconic`, `GetWindowRect`, the window style, per-monitor DPI aware) beside the controls' accessible names. Unit tests first: `main-window-options.test.ts`, `main-windows.test.ts`, `window-controls.test.ts`, 83 passed.
>
> - **The frame.** The group "Window controls" holds Minimize, Maximize and "Close window", in that order. The window has no menu (`GetMenu` 0) and no system-menu style; it keeps `WS_CAPTION` in its style bits, which Electron's frameless window keeps for the shell's animations and Snap, but an OS-level capture of its rectangle (`CopyFromScreen` over `GetWindowRect`) shows no native caption, only the product's title bar.
> - **The product's controls.** Maximize → `IsZoomed` true and the label "Restore"; Restore → false and "Maximize"; Minimize → `IsIconic` true.
> - **"Electron's draggable region owns native double-click maximize/restore" held.** A real double-click (`SetCursorPos` and two `mouse_event` pairs, in physical pixels: CSS px × 1.5 plus the window's origin) on the bare drag region maximized the window and a second restored it; a double-click on the Sessions button (`no-drag`) changed nothing. A first attempt whose point fell on the workspace-path pill inside the drag region opened the folder chooser instead — the pill is a control, as designed, and the drag region is the bar around it.
> - **"The renderer listens to resize…" held.** After every host-driven change the label matched `IsZoomed`: Win+Up twice (Restore, zoomed), Win+Down twice (Maximize, restored), Win+Left (snapped to the left half, not zoomed, Maximize), a drag of the title bar to the screen's top edge (Aero Snap: zoomed, Restore) and away again (restored, Maximize), and Minimize followed by a restore (`ShowWindow(SW_RESTORE)` standing in for the taskbar click; Maximize).
> - **Close guards.** With a Settings value changed ("Unsaved changes"), Close window showed "Save settings before leaving?" (Save / Discard / Cancel) and the window stayed. With a scripted run waiting, Close window raised the native box "Quit while a run is active?"; Escape dismissed it and the window stayed and answered. Otherwise Close window ran the orderly shutdown: `quit: requested (before-quit)`, `main process exiting with status 0`, exit 0.
> - **Snap Layouts (recorded only).** Hovering the product's Maximize for 1.5 s showed its own "Maximize" tooltip and no Snap Layouts flyout: the shell offers that flyout over a native maximize button, and this one is drawn by the product.
