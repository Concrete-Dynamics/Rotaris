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
  ([the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md](fixed/the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md),
  [the-git-views-worktree-state-cell-overruns-the-ahead-column.md](fixed/the-git-views-worktree-state-cell-overruns-the-ahead-column.md)):
  the measured floors those repairs keep are lost for a remounted row.

## Relevant files

- `packages/ui/src/GitView.tsx`: `phraseKey` and `branchKey` and the two `useLayoutEffect`s over them; the worktree row's
  `tr key={row.path}`.
- `packages/ui/src/ui.test.ts`: the pure fit functions' tests; no test covers what re-runs the measurement.
