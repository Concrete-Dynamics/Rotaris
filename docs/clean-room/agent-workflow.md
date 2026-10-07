# Agent workflow — branch, worktree, rebase, line endings

How changes land on `main` in this repository. `CLAUDE.md` states the rule in one
paragraph; this file holds the steps that are only needed while doing it.

## Work on a temporary branch in a temporary worktree

The primary checkout is not a place to write: another agent may be working in it,
`apps/desktop/out` is shared by every Electron proof, and a half-finished edit there is
indistinguishable from someone else's. Only trivially reversible, single-file
documentation edits may be made in place, and only when `git status` is clean.

```
git log --oneline -1 main                     # the merge base, read before anything
git worktree add -b <topic> ../Rotaris-crw-wt-<short> main
cd ../Rotaris-crw-wt-<short>
pnpm install --prefer-offline
node node_modules/electron/install.js         # electron's dist/ is NOT installed into a worktree
```

Branch names say what the work is (`part-<letter>-<topic>`, `fix-<topic>`). The worktree
directory sits beside the checkout, never inside it.

**Never `git stash` while another worktree is live.** Every worktree of the repository
shares one stash (`refs/stash` sits in the common git directory), so a `pop` takes whatever
entry is on top, and that can be another agent's: on 2026-10-03 two builders in sibling
worktrees each received the other's uncommitted edits that way
([the note](../defects/fixed/parallel-worktree-agents-swap-uncommitted-edits-through-the-shared-git-stash.md)).
To set a change aside, write it to a patch file outside the checkout and restore the files
(`git diff -- <files> > <patch>`, `git checkout -- <files>`, and `git apply <patch>` after),
or read the base in a throwaway detached worktree (`git worktree add --detach <path> main`,
removed after).

## Rebase onto main, and persevere

(Named "Merge back, and persevere" until 2026-10-04, when the owner wrote: "please always use
rebase instead of a merge commit for main.")

`main`'s history is linear. A branch lands by a rebase onto `origin/main`, the gate on the
rebased head, and a fast-forward push of that head (`git push origin HEAD:main`): never a
merge commit, never a force. A push rejected because `main` moved is rebased again, gated
again and pushed again. Merging `main` into your own branch while you work is fine: the rule
is about `main`, and the rebase at landing drops those merges.

Work is done when `main` is green with the branch on it — not when the branch is green.
Abandoning a branch because the rebase is hard is not an outcome an agent may choose.

- **Re-read `main` before rebasing.** It moves. A trailer-less commit on `main` authored by
  the owner is theirs — surface a collision with it, never reset it.
- **A register identifier you took while you worked may have been taken on `main` too.** The
  request log, the open questions and the owner decisions have no allocator, and a worktree is
  exactly where that bites. `tools/check-request-log.mjs` fails `pnpm lint` on a duplicate
  `R-NNN`; the others are still read by hand. The settlement is the same either way: **the row
  that reached `main` first keeps the number**, yours takes the next free one, keeps every word,
  and says in its own cell that it moved — renumbering the documents that cite it in the same
  commit. A collision caught before your row reaches `main` is renumbered, not logged as a defect.
- **Resolve every conflict by reading both sides**, in a merge of `main` into your branch and
  in each commit a rebase replays (stage the paths, `git rebase --continue`;
  `git rebase --skip` only a commit the resolution left empty). The five shapes seen here: disjoint
  blocks in one file (concatenate); a shared array or object literal both sides extended
  (merge the entries); a shared import line naming different symbols (the wider form wins,
  or a symbol binds twice); prose one side revised in place (splice the clause into the
  newer copy, or one side's content is silently dropped); a real implementation against the
  other branch's placeholder (the implementation wins, or the stub shadows it).
- **Never `git add -A` or `git commit -a` during a merge or a rebase, or in a shared
  checkout.** Stage the conflicted paths by name.
- **A conflict marker left behind fails the lint.** `tools/check-conflict-markers.mjs` reads
  every tracked text file, working copy and index, and fails `pnpm lint` on a line git writes
  as a marker: seven `<`, `|` or `>` at column 0 followed by a space or the line's end, and a
  line of exactly seven `=` between an opening and a closing marker (alone, that line is a
  Markdown heading underline and passes). It names the file and the line. Markdown and JSON
  read as text are where it matters: a marker there broke nothing else the gate runs
  ([the note](../defects/fixed/the-gate-passes-a-committed-merge-conflict-marker.md)).
  Text means the content, not an attribute: `pnpm-lock.yaml` (`-diff` in `.gitattributes`)
  is read too, though until 2026-10-02's third correction it was not. `pnpm` itself
  rewrites a conflicted lockfile on disk when it runs (`pnpm lint` prints "Merge conflict
  detected in pnpm-lock.yaml and successfully merged"), so the block it leaves staged is
  caught on the index side: stage the resolved lockfile again before committing.
- **After a keep-both resolution, run the compiler, not a sweep you wrote.** Command ids,
  preference keys, barrel re-exports, zod literal kinds, `case` labels, script names and
  ignore entries all duplicate silently; `tsc` finds in seconds what a regex misses.
- **Verify the rebased head, never only the branch before it.** The rebased commit is the
  one that lands; a gate green before the rebase judged a different tree. Proofs that reach
  into per-workspace state have passed in the tree they were written in and failed in the
  primary checkout on a directory name alone, so run them on the rebased head in another
  tree: a detached worktree at that head (an orchestrated build's landing worktree is
  one).
- **Remove the worktree once landed**: `git worktree remove ../Rotaris-crw-wt-<short>`
  and `git branch -d <topic>`.

## Line endings are LF

`.gitattributes` sets `* text=auto eol=lf`; `tools/check-line-endings.mjs` fails
`pnpm lint` on a staged CRLF or mixed blob. Write LF and stop thinking about it.

A checkout made before that file landed still holds CRLF on disk until it merges this —
harmless while it lasts, because git normalises on the way in. It heals in two steps, in
this order: convert the files in place (`git checkout-index -f` does not rewrite existing
files), then `git add --renormalize .` to refresh the index's stat cache. If a diff ever
reports a whole file again, `git diff --ignore-cr-at-eol --numstat` separates the endings
from the content.
