# Agent workflow — branch, worktree, merge, line endings

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

## Merge back, and persevere

Work is done when `main` is green with the branch in it — not when the branch is green.
Abandoning a branch because the merge is hard is not an outcome an agent may choose.

- **Re-read `main` before merging.** It moves. A trailer-less commit on `main` authored by
  the owner is theirs — surface a collision with it, never reset it.
- **A register identifier you took while you worked may have been taken on `main` too.** The
  request log, the open questions and the owner decisions have no allocator, and a worktree is
  exactly where that bites. `tools/check-request-log.mjs` fails `pnpm lint` on a duplicate
  `R-NNN`; the others are still read by hand. The settlement is the same either way: **the row
  that reached `main` first keeps the number**, yours takes the next free one, keeps every word,
  and says in its own cell that it moved — renumbering the documents that cite it in the same
  commit. A collision caught before your row reaches `main` is renumbered, not logged as a defect.
- **Resolve every conflict by reading both sides.** The five shapes seen here: disjoint
  blocks in one file (concatenate); a shared array or object literal both sides extended
  (merge the entries); a shared import line naming different symbols (the wider form wins,
  or a symbol binds twice); prose one side revised in place (splice the clause into the
  newer copy, or one side's content is silently dropped); a real implementation against the
  other branch's placeholder (the implementation wins, or the stub shadows it).
- **Never `git add -A` or `git commit -a` during a merge, or in a shared checkout.** Stage
  the conflicted paths by name.
- **A conflict marker left behind fails the lint.** `tools/check-conflict-markers.mjs` reads
  every tracked text file, working copy and index, and fails `pnpm lint` on a line git writes
  as a marker: seven `<`, `|` or `>` at column 0 followed by a space or the line's end, and a
  line of exactly seven `=` between an opening and a closing marker (alone, that line is a
  Markdown heading underline and passes). It names the file and the line. Markdown and JSON
  read as text are where it matters: a marker there broke nothing else the gate runs
  ([the note](../defects/fixed/the-gate-passes-a-committed-merge-conflict-marker.md)).
- **After a keep-both merge, run the compiler, not a sweep you wrote.** Command ids,
  preference keys, barrel re-exports, zod literal kinds, `case` labels, script names and
  ignore entries all duplicate silently; `tsc` finds in seconds what a regex misses.
- **Verify on merged `main`, never in the worktree.** Proofs that reach into per-workspace
  state have passed in the tree they were written in and failed in the primary checkout on
  a directory name alone.
- **Remove the worktree once merged**: `git worktree remove ../Rotaris-crw-wt-<short>`
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
