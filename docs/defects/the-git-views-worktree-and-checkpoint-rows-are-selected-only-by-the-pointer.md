## The Git view's worktree and checkpoint rows are selected only by the pointer

Both tables of the Git view take their selection from a click and from nothing else. A worktree row
(`packages/ui/src/GitView.tsx:480`) and a checkpoint row (`GitView.tsx:524`) are `<tr>` elements carrying
`aria-selected` and an `onClick`, but no `tabIndex`, no `role` and no key handler, and no ancestor supplies one: the
worktrees `Table` declares `aria-multiselectable="true"` (`GitView.tsx:465`) and the checkpoint table's scroll box takes
focus (`GitView.tsx:517`) for scrolling only. `selectRow` (`GitView.tsx:289`) reads a `MouseEvent` — click selects one,
Ctrl+click toggles, Shift+click extends from the anchor — and has no keyboard counterpart in the file; the view's only
key handler is the divider's (`GitView.tsx:280`, `:540`).

The consequence is a command a keyboard user cannot reach. Restore checkpoint (`GitView.tsx:514`) stays disabled with
`RESTORE_NO_ROW`, "Select a checkpoint in the list to restore it." (`GitView.tsx:29`, `:406`), until a checkpoint row is
selected, and selecting one needs a pointer. The worktree selection is likewise unreachable, so whatever is later wired
to it (Merge selected, `GitView.tsx:457`, is disabled outright today) inherits the gap. The design inventory already
records that the design `Table` models neither selection (`docs/design/README/04-4-component-inventory-against-the-specification.md`,
the Tables row), so the view carries the selection itself and carries only its pointer half.

Read in the source, not driven in the built app, 2026-11-02. Noticed while writing
[guide 05 §5](../research/design/05-interaction-patterns-for-desktop-tools.md#5-worked-example--the-git-view), the worked
example over the Git view's row, under [R-093](../product/requests.md#r-093).

## Specs

- [`REQ-SHELL-022`](../spec/12-desktop-shell-windows/01-requirements.md): on every one of the seven primary views
  "every control is reached by Tab traversal". The rows are the controls that make the selection; none is in the Tab
  order.
- [`REQ-GIT-077`](../spec/06-git-worktrees-checkpoints/03-configuration-keys.md) requires multi-row selection in the
  worktrees table and [`REQ-GIT-086`](../spec/06-git-worktrees-checkpoints/03-configuration-keys.md) single-row
  selection in the checkpoints table; neither restricts it to the pointer, and REQ-SHELL-022 makes it reachable.
- [`REQ-MONITOR-273`](../spec/02-run-monitoring-steering/06-29-commands-and-keyboard-access.md) asks a disabled
  control's reason to be keyboard-reachable; here the remedy the reason names is not.
- No requirement fixes the key model for a selectable table row (as `REQ-MONITOR-304` does for the delegation tree);
  choosing one is an open question for the repair, not this note's.

## Relevant files

- `packages/ui/src/GitView.tsx` — the two row renderings, `selectRow`, the Restore checkpoint gate.
- `packages/ui/src/design-system/data.tsx` — `Table`, a bare `<table>` with no selection or focus model.
- `docs/design/README/04-4-component-inventory-against-the-specification.md` — the Tables row naming the missing selection.
- `docs/research/design/05-interaction-patterns-for-desktop-tools.md` — §5, where the gap was read.
