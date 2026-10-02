## A long unbroken token in a task's text runs out of the task plan and gives the sidebar a horizontal scrollbar

The Workspace sidebar's task plan draws each task's text in a button (`.todo-task__text`). The button sits in a grid
column of `minmax(0, 1fr)` and is itself allowed to shrink (`min-width: 0`), but nothing lets its text break inside a
word. Ordinary words wrap. A token with no break opportunity runs past the column's right edge instead: a path, a hash,
or here a run of 80 `x` characters. The sidebar (`.agents`, `overflow: auto`) then grows a horizontal scrollbar, and the
token is cut at the column edge unless the user scrolls the sidebar sideways.

Seen in the default live run's `terminal` scenario at 1440 × 900. The task's text quotes the scenario's `awk` line, and
its `xxxxxxxx…` runs from the task plan into the transcript's border, with a scrollbar under the sidebar.

Live-run finding: a71-11

A sibling of [`the-project-sections-failure-hint-runs-out-of-the-sidebar.md`](the-project-sections-failure-hint-runs-out-of-the-sidebar.md),
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

## Outcome — repaired 2026-10-01 (R-067)

**Governed by `REQ-SHELL-022` after all.** The note's "None found" missed it: REQ-SHELL-022 requires that "no control
requires horizontal scrolling to reach" and that every control's label is rendered in full. A task's text is a control,
the button that renames the task.

**Reproduced in the built app.** `layout-proof` gained section 6, which adds a task through the pane's own "+ Add task"
control while a scripted run holds the plan open. The task's text is `LONG-` followed by 195 `x`, and the check runs at
1400 × 900. On the build before the repair both new checks failed: the text's content was 1273 px wide in a 189 px box,
and the sidebar's `scrollWidth` was 1307 against a `clientWidth` of 259. Its screenshot showed the scrollbar at the foot
of the sidebar, as in the live run's `terminal.png`.

**Repaired.** `packages/ui/src/shell.css` gives `.todo-task__text` `overflow-wrap: anywhere`, in a rule of its own beside
the shared `.todo-task__text, .todo-phase__add` rule. The grid's `minmax(0, 1fr)` column and the button's `min-width: 0`
were already in place, so nothing else was needed. On the rebuilt app the text wraps inside its 189 px box (content 189
in 189, nine lines), the sidebar's `scrollWidth` equals its `clientWidth` (259), and `layout-proof` passes 21 of 21.

**Pinned.** `packages/ui/src/layout-regression.test.ts`, "breaks an unbroken token in a task's text inside the plan
column (REQ-SHELL-022)", fails without the rule. `layout-proof` section 6's two checks fail on the build before and pass
on this one.


**The live run did not show it either way.** The live `terminal` scenario was run once on the rebuilt app
(`katalyst`, pack `.live-run/runs/2026-10-01T09-29-52-765Z/`). This time the model named its tasks in short words
("Delegate ordered command run", "Report results"), so no unbroken token reached the plan. Its `terminal.png` shows the
sidebar with no horizontal scrollbar, but proves nothing about the repair. The run itself failed on an HTTP 400 that has
nothing to do with the plan; it is recorded as
[`a-tool-call-whose-arguments-are-a-json-string-ends-the-run-with-http-400`](a-tool-call-whose-arguments-are-a-json-string-ends-the-run-with-http-400.md).
