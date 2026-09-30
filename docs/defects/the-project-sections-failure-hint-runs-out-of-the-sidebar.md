## The sidebar Project section's failure hint runs out of the column and is cut at its edge

When project setup has failed, the Workspace sidebar's Project section shows a hint ending in "Last run failed:
{message}". The message is the failed task's raw output: the process's exit, its dbus lines and the runtime's own
explanation. One token in it, `[30698:0930/041102.232506:ERROR:dbus/bus.cc…`, has no break opportunity. The hint
(`<p class="text-tertiary settings__hint">`) does not break it, so the line runs past the sidebar's right edge. The
column then grows a horizontal scrollbar, and the word is cut at the column edge unless the user scrolls the sidebar
sideways. The rest of the hint wraps, so it fills most of the sidebar's height with process output.

Seen 2026-09-30 in the live run's `ask` scenario at 1440 × 900 (pack `.live-run/runs/2026-09-30T04-10-48-957Z/ask/ask.png`
in the `fix-composer-ground` worktree, git-ignored). That worktree had not bundled the code-intelligence runtime, so
setup failed with "the bundled code-intelligence runtime is not present in this installation". Any failure whose
output carries a long unbroken token draws the same way.

Recorded, not repaired: noticed while showing L10's repair live (R-067). There are two possible repairs, and they
are for the owner of the surface: break long tokens in the hint (`overflow-wrap: anywhere` on that hint), or cap
the hint to the failure's first line and leave the full output to the setup dialog.

## Specs

- `REQ-WORKSPACE-113`: fixes the hint's wording ("a recorded failure appends 'Last run failed: {message}'") but not
  how it is drawn. No requirement is contradicted outright. The cut is a drawing defect: text the user must scroll a
  sidebar sideways to read.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx`: the `agents__project` section and its `project-section-hint` paragraph.
- `packages/ui/src/settings/project-init.ts`: `projectSidebarSection`, which appends the whole `lastError`.
- `packages/ui/src/shell.css`: `.settings__hint` and `.agents__project`.
