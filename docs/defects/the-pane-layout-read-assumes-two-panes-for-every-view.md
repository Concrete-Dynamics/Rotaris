## The pane-layout read assumes two panes for every view

Noticed 2026-10-14 by fin45's reviewer of `fin45-retro-and-record` (an optional finding), recorded by fin46's acceptance
round 1 (finding C18). Main's `prefs.get` answers a pane layout by calling `preferences.readLayout(layoutView, 2)`: the
pane count it compares the stored `panels/{view-key}/panes` against is the literal `2` for every view in
`PANE_LAYOUT_VIEWS`, not the pane count of the view being read. No view's count is stated anywhere a reader could check.

Every view that stores a layout has two panes today (the Overview's split, the Git view's two columns, the Library's
Prompts tab and the Workspace's transcript/composer divider), so nothing observable is wrong yet. The defect is latent:
if a view gained a third pane, its renderer would write `panes: 3`, main would read it back against `2`, and REQ-SHELL-069's
restore rule would discard every layout that view wrote, restoring the declared defaults on each launch; a layout stored
with two panes before the change would be handed to the three-pane view instead of being refused.

## Specs

- `REQ-SHELL-069` (`docs/spec/12-desktop-shell-windows.md`): declared defaults are restored when "the stored pane count
  differs from the view's current pane count". The read compares against a constant rather than the view's current pane
  count, so the rule holds only while every view has two panes.

## Relevant files

- `apps/desktop/src/main/commands/shell.ts` — `prefs.get`, the `readLayout(layoutView, 2)` call (line 130 at `4225daf`).
- `packages/platform/src/preferences.ts` — `PANE_LAYOUT_VIEWS` and `PreferenceStore.readLayout(view, panes)`, where a
  per-view pane count would sit beside the view list.
