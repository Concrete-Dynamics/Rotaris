## The Run panel's Steer and Cancel buttons name the agent in full and overlap the agent below

Noticed 2026-11-20 in captures of a live run at 1440 × 900 (`rotaris-dim`), while redesigning the transcript for
[R-109](../product/requests.md#r-109); not caused by it and not repaired there. With an agent selected in the Run
panel's agent list, the two buttons beneath the list read "Steer Add-formatDuration-to-src-time.js" and "Cancel
Add-formatDuration-to-src-time.js". Each wraps to three lines inside a button one line high, so the label is drawn
over the button's own border and over the row of the agent below it. An agent with a short name does not show it.

## Specs

`docs/design/README.md` §1 (a control's label fits its box); `REQ-SHELL-144` for the legibility of the label. No
requirement asks for the agent's name inside these two buttons' visible label.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx`: where the Run panel draws the two buttons for the selected agent.
- `packages/ui/src/shell.css`: the buttons' rule, which sets no wrapping or truncation for a long label.
