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
without the change. Shown by `pnpm layout-proof` section 7 (load 2.1 on 4 CPUs; the figures below are that run's, and vary
run to run with the checkout's own path and branch, which the workspace then inherited): at 1180 px under a 183-character workspace
path the link reads `/home/user/Rotaris-crw-wt-…-818d53f7b76a/proj-folder` (52 characters, content 306 in 306 px,
`text-overflow: clip`, the tooltip the full path), the branch label `fin11…dows ↑2` unclipped beside it, the strip not
overflowing (scrollWidth 1180 against 1180); at 1400 px the label grows to
`/home/user/Rotaris-crw-wt-fin11-striplabe…-6880-59f4-942d-818d53f7b76a/proj-folder`. 27 passed, 0 failed.

**Repair round, 2026-10-03 (fin11, the verifier's blocking finding).** The repair above let both labels shrink in
proportion to their basis, so a long path took the branch item's share too: under a 169-character path on `main` the
branch label read `m…` at 1440 px, `…` at 1250 px and nothing at 1180 px while the row had room for `main`, and the item's
state words were middle-shortened as well (`no …ry` for `no git repository`) — a regression against origin/main, where a
branch label of 28 characters or fewer never shrank. Rule 2 shortens a label only when it is wider than the space available
to it, and REQ-SHELL-047 already makes the path the first label to go. Now the path link's shrink factor dwarfs every other
item's (`.status-strip__link[data-middle='1'] { flex-shrink: 1000000 }`), so it absorbs the whole shortfall until it
reaches nothing; the branch item is `middle` only while it shows a branch name (`stripItems`, `composer.ts`), so its state
words are never cut; a link whose label rule 2 hid is hidden whole (`data-label-hidden`, `visibility: hidden`), no empty
focus stop; and the label is re-measured when the document finishes loading a font (`document.fonts` `loadingdone`), which
the ResizeObserver alone did not cover although the comment said it did. Pinned by `composer.test.ts` (state words never
`middle`), `StatusStripItem.test.ts` (the state words drawn whole as plain text; a branch name as the rule-2 label after the
icon) and `layout-regression.test.ts` (the path's factor, the hidden link), each failing without the change. The
proofs now assert it: `pnpm layout-proof` gives its workspace its own repository on `main` and requires the branch label
to read `main` whole at 1180 px (the old check accepted a hidden label, `label === null`, and passed over exactly this) —
on the unrepaired build it failed (`label "null"`, load 1.3), on the repaired one it passed (`main`, 26 in 26 px, beside
the path's 351 px box; load 1.9); `pnpm git-proof` opens its plain folder under a deep path and requires `no git
repository` and `no git` whole and never `data-middle` (passed, load 2.4).
