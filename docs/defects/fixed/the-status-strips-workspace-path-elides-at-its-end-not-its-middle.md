## The status strip's workspace path elides at its end, not its middle

The status strip's workspace-path link (drawn since fin10's repair of
[the strip's note](the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md)) is a strip
item like the others: a label longer than 28 characters may shrink, and CSS `text-overflow: ellipsis` cuts it at its
**end**, so a deep path keeps its beginning (`/tmp/claude-0/-home-user-…`) and loses the folder name that tells workspaces
apart. REQ-WORKSPACE-149 rule 2 requires the status-bar path link, like the title-bar chip, to be shortened from the
**middle** against its measured width, the removed span one `…`, and hidden rather than clipped where even `…` does not fit.
The title-bar chip does this (`elideMiddle`, `packages/ui/src/workspace-label.ts`, measured in `WorkspaceChip.tsx`); the strip
does not measure its items. Seen 2026-10-02 with `pnpm app:drive` at 1180 px under a 96-character scratch path: the label
took the whole of the spacer's slack (0 px left) and showed the path's head. Noticed while building that link; not repaired
there, since the strip's flex layout gives the item no width of its own to measure against.

## Specs

- REQ-WORKSPACE-149 rule 2: middle elision of the status-bar path link against the rendered width available to it.
- REQ-WORKSPACE-021: hiding (by REQ-SHELL-047) removes the label only; rule 2 hides a label that cannot hold `…`.

## Relevant files

- `packages/ui/src/AppShell.tsx`: the strip draws the link as a `Button` with the item classes, no measurement.
- `packages/ui/src/shell.css`: `.status-strip__item[data-elide='1']`, the end-ellipsis shrink every long item takes.
- `packages/ui/src/workspace-label.ts`, `packages/ui/src/WorkspaceChip.tsx`: the middle elision the chip already applies.

## Outcome (fixed 2026-10-03, fin11)

The strip's path link **and** its branch item (REQ-WORKSPACE-149 names both; the branch name was cut at its end the same
way) now draw their label under rule 2. `StatusStripItem` (`packages/ui/src/StatusStripItem.tsx`) gives an item marked
`middle` (`StripItem`, `packages/ui/src/composer.ts`) a flex basis of its whole label's measured width plus what the box
spends beside it, lets the row shrink it to nothing (`.status-strip__item[data-middle='1']` in `shell.css`: `flex: 0 1
var(--status-strip-label-basis, auto)`, `min-width: 0`, border-box, `text-overflow: clip`), and re-elides the label from
the middle against the box's width on every ResizeObserver change, hiding it where even `…` does not fit. The pure half is
`rowLabel` (`packages/ui/src/workspace-label.ts`); the canvas measurer and the furniture spend were extracted from
`WorkspaceChip` into `packages/ui/src/label-measure.ts`, which the chip now uses too. The branch's ` ↑{n}` marker is drawn
after the name, whole (`suffix`, from `branchStripItem`), so it is never cut. The tooltip and the description keep the full
text.

Pinned by `workspace-label.test.ts` (rule 2 in a flex row: the basis, one middle `…` keeping `/tmp/` and the folder name,
null → hidden, a zero measurer), `composer.test.ts` (exactly the path link and the branch item are `middle`; the marker a
suffix), `ui.test.ts` (`branchStripItem`'s suffix) and `layout-regression.test.ts` (the `data-middle` rule); each fails
without the change. Shown by `pnpm layout-proof` section 7 (load 2.1 on 4 CPUs): at 1180 px under a 183-character workspace
path the link reads `/home/user/Rotaris-crw-wt-…-818d53f7b76a/proj-folder` (52 characters, content 306 in 306 px,
`text-overflow: clip`, the tooltip the full path), the branch label `fin11…dows ↑2` unclipped beside it, the strip not
overflowing (scrollWidth 1180 against 1180); at 1400 px the label grows to
`/home/user/Rotaris-crw-wt-fin11-striplabe…-6880-59f4-942d-818d53f7b76a/proj-folder`. 27 passed, 0 failed.
