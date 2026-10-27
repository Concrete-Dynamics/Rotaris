# ADR-0048 — Windows, views and the three modality levels — Alternatives considered

Part 2 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

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
