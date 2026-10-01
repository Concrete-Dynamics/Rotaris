## A long unbroken token in a task's text runs out of the task plan and gives the sidebar a horizontal scrollbar

The Workspace sidebar's task plan draws each task's text in a button (`.todo-task__text`). The button sits in a grid
column of `minmax(0, 1fr)` and is itself allowed to shrink (`min-width: 0`), but nothing lets its text break inside a
word. Ordinary words wrap. A token with no break opportunity runs past the column's right edge instead: a path, a hash,
or here a run of 80 `x` characters. The sidebar (`.agents`, `overflow: auto`) then grows a horizontal scrollbar, and the
token is cut at the column edge unless the user scrolls the sidebar sideways.

Seen in the default live run's `terminal` scenario at 1440 × 900. The task's text quotes the scenario's `awk` line, and
its `xxxxxxxx…` runs from the task plan into the transcript's border, with a scrollbar under the sidebar.

Live-run finding: a71-11

A sibling of [`the-project-sections-failure-hint-runs-out-of-the-sidebar.md`](fixed/the-project-sections-failure-hint-runs-out-of-the-sidebar.md),
the same fault in another paragraph of the same column. That note was repaired on 2026-10-01 (`2859446`) by a rule scoped
to the hint alone (`.agents__project .settings__hint { overflow-wrap: anywhere; }`), so the task plan is unchanged by it.
Recorded, not repaired.

## Specs

- None found. No requirement fixes how a task's text wraps. The cut is a drawing defect: text the user must scroll a
  sidebar sideways to read.

## Evidence

- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/` (the `accept` worktree; git-ignored), `terminal/terminal.png`
  (session `cd083fc1`): the struck-through task text "…printf "LINE-%03d xxxxxxxx…" runs to the column edge at about
  x = 351, and a horizontal scrollbar shows at the foot of the sidebar.

## Relevant files

- `packages/ui/src/TodoPane.tsx:106` — the `DesignButton` with `className="todo-task__text"` that draws a task's text.
- `packages/ui/src/shell.css:856` — `.todo-task__text`: `min-width: 0`, and no `overflow-wrap` or `word-break`.
- `packages/ui/src/shell.css:851` — `.todo-task`, the grid with its `minmax(0, 1fr)` text column.
- `packages/ui/src/shell.css:777` — `.agents`, the sidebar column, with `overflow: auto`; `:781` is the sibling's
  repair, which reaches only the Project section's hint.
