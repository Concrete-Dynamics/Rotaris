# ADR-0048 — Windows, views and the three modality levels

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-05)
- **Depends on:** ADR-0002, ADR-0042, ADR-0043
- **Contains an open reading of a conflict between two requirements.**

## Context

`REQ-SHELL-017` to `REQ-SHELL-019` and `REQ-WORKSPACE-013`: a workspace switch **builds a new main
window first**, shows it, then closes the old one; if the old window vetoes its close the replacement is
discarded and nothing changes. Two main windows exist simultaneously during a switch.

`REQ-SHELL-072`, `REQ-SHELL-076`, `REQ-SHELL-078`, `REQ-SHELL-081`, `REQ-SHELL-111`, `REQ-SHELL-123`,
`REQ-SHELL-154` and `REQ-SHELL-167`: at most one persona window **per persona** — not per agent instance
— at a fixed initial size; exactly one terminal window per main window; one dialog per artifact. All are
owned by their main window and destroyed with it. **Closing a persona window hides rather than destroys
it**, so reopening is instantaneous.

`REQ-SHELL-151`, `REQ-SHELL-084`, `REQ-CHAT-063` and `REQ-WORKSPACE-150`: an off-screen surface performs
**zero repaints and runs zero repaint or refresh timers**, however fast changes arrive; when it becomes
visible its first painted frame already carries current state, within the 100 ms gesture budget, with no
visible catch-up redraw.

`REQ-SHELL-051`, `REQ-SHELL-054`, `REQ-SHELL-117`, `REQ-NOTIFY-266`, `REQ-NOTIFY-071` and
`REQ-WORKSPACE-106` require **three distinct modality levels** and they must be observably different:
**application-modal** (the command palette, the keyboard help), **window-modal** (worktree and
checkpoint progress, the message-limit confirmation), and **non-modal window-level** (the project-setup
consent dialog, the re-authentication prompt).

`REQ-SHELL-055`, `REQ-CHAT-002`, `REQ-CHAT-026` and `REQ-SHELL-168`: Escape resolution is layered and
fixed — a modal surface answers Escape *before* the window sees it; window-level Escape is live **only
on one view** and resolves a search panel then two drawers; the plan gate is answered by no dismissal at
all; every confirmation treats Escape as its declining answer, and a declining answer that would open an
external page performs the refusal alone.

`REQ-SHELL-161`, `REQ-SHELL-109` and `REQ-SHELL-110`: showing, raising and activating an auxiliary window
is a **request** to the host window manager; a declined raise is a supported outcome, **never retried or
reported, and must never be compensated for by taking focus**. No z-order between auxiliary windows is
required.

`REQ-SHELL-022`, `REQ-SHELL-059`, `REQ-SHELL-047`, `REQ-SHELL-061`, `REQ-SHELL-064` and `REQ-SHELL-065`:
the window refuses to resize below a stated minimum and opens at a stated size; at the minimum, every
control on **every one of the seven views** lies wholly inside the bounds, is reachable by keyboard, has
its label rendered in full with two named elision exceptions, and needs no horizontal scrolling.
`REQ-SHELL-071`: a view whose dividers declare no defaults still opens determinately, by **equal
division subject to minimums**, leftover logical pixels given one each to the leading panes in order,
tolerance one logical pixel per pane.

`REQ-SHELL-023`, `REQ-SHELL-152` and `REQ-SHELL-070`: switching tabs exchanges panes that are **already
built**, so no tab shows an intermediate blank state, and every registered divider in **every view —
including views not on screen** — participates in layout capture.

## Alternatives considered

**A — One window, everything else in-window.** Persona panes, the terminal and artifact details become
overlays or docked panels.

*For:* one renderer, one replica, one theme application, cheap; the zero-work-off-screen rule is easy
because a hidden panel is just a component that is not rendered.
*Against:* it contradicts the specification directly. Several requirements describe separate windows
with their own titles, their own initial sizes, their own accessibility sweeps and their own banners,
and one talks about a host window manager **declining a raise**. This is not a presentation detail that
can be reinterpreted.

**B — One window per top-level window, each a full renderer.** Chosen.

*For:* matches the window model exactly. Each window gets its own banner, its own acknowledgement stack
anchored to its own content area, its own accessibility tree. A crash in a persona window does not take
the main window with it. Hiding a window lets the platform's own occlusion handling stop painting, which
helps the zero-work rule.
*Against:* each window is a process, so memory cost is real — a persona window per persona plus a
terminal window is easily four or five renderers. Each holds its own replica and its own theme tokens.
**Application-modality has to be implemented by us**, because the platform's modal flag is window-modal
against a parent, not application-modal.

**C — The main window plus embedded views inside a lightweight frame window.** *Against:* the auxiliary
windows must be movable, resizable, independently titled operating-system windows; wrapping views in a
frame buys nothing over B and loses the per-window isolation.

## Decision

**Alternative B**, with these specifics.

- **A window registry in main** owns the mapping from a main window to its persona windows, terminal
  window and artifact dialogs, and enforces the uniqueness rules. It is also where the
  replacement-then-close switch is orchestrated, because the sequence spans two windows and a preference
  write and only main sees both.
- **Hide, do not destroy, for persona windows.** On hide, the renderer unsubscribes and cancels every
  timer; on show, it requests a snapshot and applies it before the first paint. Platform background
  throttling helps, **but throttling is not sufficient evidence** for the zero-timer rule, which demands
  that no repaint or refresh timer belonging to the surface is running. That is an explicit teardown,
  not a reliance on the platform.
- **Background throttling stays enabled for user-facing windows and is disabled for the benchmark
  iteration window** (ADR-0053), where a throttled timer would corrupt measurement.
- **Three modality levels, implemented differently:**
  - *Application-modal*: rendered in-window as an overlay **and registered with the window registry**,
    which disables input routing in every other window of that main window's family for the duration.
    The platform has no application-modal primitive, so this is ours to enforce; it is **observable** —
    a click on the persona window while the palette is open must do nothing — and therefore must be
    built rather than assumed.
  - *Window-modal*: an in-window overlay with a focus trap, blocking only its own window.
  - *Non-modal window-level*: an in-window panel that does not trap focus and leaves the rest
    navigable.
- **Native dialogs are used only where the specification names them** — the folder choosers and the
  quit-guard message boxes — so that the labelling obligations and the rendered-pixel contrast rule of
  ADR-0050 apply everywhere else.
- **All seven views stay mounted; only one is visible.** Required anyway by the no-blank-tab rule, by
  divider registration across views not on screen, and by ADR-0045's construction-time slot allocation.
  A hidden view must nonetheless perform zero repaint work and run no timers, so **visibility is a
  first-class signal passed down to every surface, not a styling property**.
- **Pane geometry is owned by a layout service** keyed as ADR-0042 requires, with the equal-division
  fallback implemented as a pure function so it is testable at both canonical window sizes.

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

## Consequences accepted

1. Several renderer processes, with their memory cost; **application-modality is our code** and must be
   tested across windows; a visibility signal threaded through every surface.
2. Windows created and destroyed immediately must not deliver deferred offers, so **every deferred timer
   is owned by the window registry and cancelled on close** (ADR-0055).
3. The acknowledgement stack is per window and is not the notice store (ADR-0049).

## Revisit if

Renderer memory becomes the constraint that breaks the benchmark's memory tripwire or a practical
machine budget — the first thing to give would be keeping hidden persona windows alive, which trades
"reopening is instantaneous" for footprint and would need a requirement change rather than an
implementation change.
