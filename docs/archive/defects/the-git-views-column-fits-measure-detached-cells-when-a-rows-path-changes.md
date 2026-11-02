## The Git view's column fits measure detached cells when a row's path changes

`packages/ui/src/GitView.tsx` measures two worktree-table columns in `useLayoutEffect`s: the Branch fit
(`--git-branch-fit`, fin16) captures the `.git__branch-line` elements and observes their tags once per `branchKey`, and the
State fit (`--git-state-fit`, fin14) captures the `.git__state-phrase` elements once per `phraseKey`. Neither key carries
the row's path, but each row's `tr` is keyed by it (`key={row.path}`). A row whose path changes while its branch and tags
(or its phrase) stay the same is remounted by React without either key changing, so neither effect runs again: the next
`ResizeObserver` callback measures and the observers watch the old, detached elements. A detached line measures 0 for
every tag and `NaN` for the name's `min-width` (counted as 0 by `branchLineFloor`); a detached phrase measures 0. The row
drops out of the fit until the next key change. Where that row's line or phrase was the widest the column falls back
(Branch to its heading's 9ch, hiding a tagged row's name at the minimum window again; State to 10ch, letting a bound row's
`completed · ready` run under the Ahead figure again); in every case the remounted row's tags and phrase are no longer
observed, so a face finishing loading after the change re-measures nothing of them.

Reached when a worktree moves on disk while the view is open (`git worktree move`, or a main checkout renamed and
repaired) and the view refreshes. Found by fin16's verifier reading the code, 2026-10-04; recorded by fin17 before the
repair.

## Specs

- REQ-GIT-109 (the State cell's statuses legible, never shortened) and REQ-GIT-077 (the base and active markers) with
  UIR-002's elision as fin16 repaired it
  ([the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md](the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md),
  [the-git-views-worktree-state-cell-overruns-the-ahead-column.md](the-git-views-worktree-state-cell-overruns-the-ahead-column.md)):
  the measured floors those repairs keep are lost for a remounted row.

## Relevant files

- `packages/ui/src/GitView.tsx`: `phraseKey` and `branchKey` and the two `useLayoutEffect`s over them; the worktree row's
  `tr key={row.path}`.
- `packages/ui/src/ui.test.ts`: the pure fit functions' tests; no test covers what re-runs the measurement.

## Outcome (2026-10-04, fin17, repaired)

Both keys now carry each row's path beside what the column draws: `branchFitKey(rows)` (path, branch, base and active)
and `stateFitKey(rows, join)` (path, presented status, merge status), exported from `packages/ui/src/GitView.tsx` and read
by the two `useLayoutEffect`s. A moved row changes its key, so the effect runs again after the remount: it measures the
new cells and the observer watches the new tags and phrase. The State fit had the same shape as the Branch fit the
verifier named, so both are repaired.

**Pinned by** `packages/ui/src/ui.test.ts`, "a row whose path changes is measured again, though its branch, tags and
phrase stay the same": a linked worktree moved and the base row moved, each with branch, tags and presented phrase
unchanged, change both keys; nothing changed changes neither; a tag or a phrase changing still changes them. Red on the
unrepaired keys (the first `not.toBe` failed with both keys equal), green on the repair. This repository has no DOM in
vitest, so the remount itself is not rendered in a unit test.

**Built-app evidence.** `pnpm git-proof` green on the repaired build (`--skip-build` after `pnpm build`, as root under
Xvfb, Node 24, load average 0.48 at the start and 0.73 at the end on 4 CPUs): launches 3 and 3b measure the fits at
1440×900 and 1000×680 with no finding, the base row's `main` cut to `m…` at the minimum beside `base` and `active`
(`worktree-ahead-minimum.png`); `pnpm ui-audit --views=5 --sizes=1440x900,1000x680` reports the Git view clean. **Not
driven in the built app:** a path change while the view is open. No product control moves a worktree, and the proof's
launches cannot run `git worktree move` between two reads of one launch; and the geometry it would move is narrow, since
a moved row changes a column only when its line or phrase is the widest (a tagged row: the base row, which the main
checkout's own path names).
