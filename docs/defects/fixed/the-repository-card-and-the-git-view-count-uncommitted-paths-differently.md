## The repository card and the Git view count a tree's uncommitted paths differently

Observed 2026-10-06 by the orchestrator's final default live run at origin/main `27a5127` (pack
`2026-10-06T01-30-08-282Z` of the `wt-live` worktree, git-ignored; the autopsy's "Unverified" observation of two
"uncommitted" counts, confirmed here). In one launch, over one tree, the workspace service logs the repository card's
read as `touched=4 uncommitted=2` and the Git view's as `uncommitted=4` (`requirements/app.log` lines 11 and 12;
`shell/app.log` lines 11 and 12), and the Overview card in `shell/shell.png` reads "4 files touched · 2 uncommitted".

The two readers define the word differently:

- the repository card (`readRepository`, `countStatus` in `packages/workspace/src/git/repository.ts`) counts every line
  of `git status --porcelain --untracked-files=all` as touched, and as uncommitted only a line whose index or work-tree
  column is set — an untracked `??` path is touched but not uncommitted (pinned by `git.test.ts`: four lines with one
  untracked give `{ touched: 4, uncommitted: 3 }`). It applies no exclusion of `.rotaris/`;
- the Git view (`readGitView`, `uncommittedOf` and `parseStatusPaths` in `packages/workspace/src/git/view.ts`) counts
  changed and untracked paths alike as uncommitted, and drops every path under `.rotaris/` first.

So a tree whose only changes are new files reads "N files touched · 0 uncommitted" on the Overview and "N uncommitted"
in the Git view, and a `.rotaris/` path not ignored by the repository is counted on the card and not in the view.

## Specs

- **REQ-MONITOR-168** — the repository card states "how many files were touched and how many changes are uncommitted";
  it defines neither figure.
- **REQ-GIT-105** — the uncommitted-path count "SHALL include untracked paths, matching the cleanliness rule of
  REQ-GIT-014, so the count and the cleanliness gates never disagree about whether a tree is dirty", counted under
  REQ-GIT-003's exclusion; **REQ-GIT-107** names a worktree row's files figure "files-touched".
- **REQ-GIT-003** — "No working-tree read or write this domain performs SHALL touch an excluded path"; the card's reader
  lives in the Git module and cites REQ-GIT-102/103, but the card is REQ-MONITOR-168's.
- Whether the card's two words take the Git domain's definitions, and so whether the card is wrong, is the open question
  raised with this note, OQ-201 (*Do the repository card's "touched" and "uncommitted" take the Git view's
  definitions?*).

## Relevant files

- `packages/workspace/src/git/repository.ts` — `countStatus`, `readRepository`.
- `packages/workspace/src/git/view.ts` — `parseStatusPaths`, `uncommittedOf`, the Git view's `uncommitted`.
- `packages/workspace/src/git/git.test.ts` — pins `countStatus`'s reading.
- `packages/ui/src/OverviewView.tsx` — the card's line (around line 225 at `27a5127`).
- `apps/desktop/src/workspace-service/index.ts` — the two log lines that show both figures.

Noticed 2026-10-06 by the autopsy of the default live run at `27a5127`; confirmed by fin18 (bundle
`fin18-rail-label-and-observations`). Not repaired: which definition the card takes is the owner's (OQ-201).
