# ADR-0048 — Windows, views and the three modality levels — Context

Part 1 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

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
