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

## Outcome — repaired 2026-10-14 (fin46, `fin46-accept1-7`)

`packages/platform/src/preferences.ts` now declares each view's current pane count beside the view list,
`PANE_LAYOUT_PANES` (`{ overview: 2, git: 2, library: 2, workspace: 2 }`), and main's `prefs.get`
(`apps/desktop/src/main/commands/shell.ts`) reads a layout with `preferences.readLayout(layoutView, PANE_LAYOUT_PANES[layoutView])`.
A view that gains a pane changes its figure there, so a layout written for its old count restores the declared defaults
and one written for its new count is applied, as REQ-SHELL-069 says. No count changed, so nothing a user sees changed.
The renderer components still write their own layouts with `panes: 2` (`OverviewView`, `GitView`, `PromptsTab`, the
Workspace's divider in `renderer/main.tsx`); a view gaining a pane changes its component and this table together.

Pinned by `apps/desktop/src/main/commands/shell.test.ts` ("prefs.get reads a pane layout against its own view's pane count"):
with the table's `library` set to 3 over a real `PreferenceStore`, a stored three-pane library layout is answered and a
stored two-pane one reads as nothing stored, while the Git view's two-pane layout is still answered. The case fails on the
old `readLayout(layoutView, 2)` (`expected undefined to deeply equal { version: 1, panes: 3, … }`).
`packages/platform/src/preference-registry.test.ts` pins the table's four entries. Shown in the built app on 2026-10-14
(load 1.4 to 3.2 on 4 CPUs): `pnpm git-proof` (the relaunch restores the dragged split, 528), `pnpm overview-proof` (the
relaunch restores the stored split, 420) and `pnpm composer-proof` (the Workspace divider persisted under the registered
keys with its pane count) each passed, every layout now read through the per-view count.
