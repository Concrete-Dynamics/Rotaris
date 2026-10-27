# ADR-0048 — Windows, views and the three modality levels — Decision

Part 3 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

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
