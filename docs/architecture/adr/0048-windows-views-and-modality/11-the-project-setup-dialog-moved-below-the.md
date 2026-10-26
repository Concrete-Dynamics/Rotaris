# ADR-0048 — Windows, views and the three modality levels — The project-setup dialog moved below the window's chrome — reported back 2026-10-02

Part 11 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## The project-setup dialog moved below the window's chrome — reported back 2026-10-02

*[`the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`](../../../defects/fixed/the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md);
REQ-WORKSPACE-106. Found the first surface of this level placed against the decision, as the second's first placement was.*

The Context's first non-modal window-level surface was built `fixed` at the window's corner, and measured in the built app
on 2026-10-02 it lay over the title bar's Sessions, Minimize, Maximize and Close window and the notice's dismissal in every
view, which "leaves the rest navigable" does not allow. It is now drawn in AppShell's `windowDialog` slot, `absolute`
against the rail-and-view region at its top corner (`packages/ui/src/shell.css`, `.project-setup`), so the window's chrome
and the notice are never under it, and `init-proof`'s `consent` scenario measures that. Unlike the re-authentication
prompt it belongs to no view, so it is not laid out in flow: in flow it would take room from every view at
REQ-SHELL-022's minimum. It therefore still lies over the view's top corner while open; whether the decision's "leaves the
rest navigable" admits that, or this surface needs a region every view yields to, is raised as
[OQ-187](../../open-questions.md) (raised as OQ-186 and renumbered at this bundle's merge of `origin/main` d0012a2, which had
taken OQ-185), with the measured controls under it. The level is otherwise as decided: no `aria-modal`, no
backdrop, no focus trap.
