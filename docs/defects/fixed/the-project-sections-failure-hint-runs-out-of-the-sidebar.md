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

## Outcome

**Repaired 2026-09-29 under R-067** (acceptance round 1, finding A39; built 2026-10-01).

**Confirmed first, in the built app.** `pnpm app:drive` opened a code workspace in this worktree's build, which bundles
no code-intelligence runtime, so the background setup task failed (exit 127). Its recorded output carries
`[8996:1001/041354.004464:ERROR:dbus/bus.cc:406]`. At 1440 × 900 the hint measured `scrollWidth` 295 in a 235 px box, and
the sidebar (`.agents`) measured `scrollWidth` 307 against `clientWidth` 259. The screenshot showed the token cut at the
column edge and a horizontal scrollbar at the sidebar's foot.

**What changed.** The first of the two repairs this note named. `.agents__project .settings__hint { overflow-wrap:
anywhere; }` in `packages/ui/src/shell.css`, the way every other surface here that shows raw output breaks it. The
hint's wording (`projectSidebarSection`) is unchanged. REQ-WORKSPACE-113 appends `{message}`, and whether the sidebar
may show less of it than the whole is a question, not a drawing defect: it is raised as
[OQ-160](../../architecture/open-questions.md), and the build proceeds under the whole message.

**Pinned by** the test "breaks an unbroken token in the sidebar Project section's failure hint inside the column
(REQ-WORKSPACE-113)" in `packages/ui/src/layout-regression.test.ts`. It was red before the rule and is green after it.
Re-measured in the rebuilt app on the same failure: the hint's `scrollWidth` equals its 235 px `clientWidth`, the
sidebar's `scrollWidth` equals its 259 px `clientWidth`, the computed `overflow-wrap` is `anywhere`, and the scrollbar is
gone from the screenshot. **Live evidence:** `pnpm live-run --only=ask` against `katalyst` passed (pack
`.live-run/runs/2026-10-01T04-16-29-353Z/` of the `fix-accept1-23` worktree; git-ignored). Its `ask/ask.png` shows the
same failure hint, with the dbus token broken at the column edge, and no horizontal scrollbar under the sidebar.
