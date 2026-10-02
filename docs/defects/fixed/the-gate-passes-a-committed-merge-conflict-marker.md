## The gate passes a committed merge-conflict marker

`pnpm check` is green over a file that still holds a merge's conflict markers. The merge of `origin/main` into
`fin3-setup-words` (`361f71c`) committed `<<<<<<< HEAD`, `=======` and `>>>>>>> origin/main` in
`docs/architecture/first-executions.md`, around four table rows. `pnpm symbols`, `pnpm typecheck`, `pnpm lint`
(record links included) and `pnpm test` all passed, and the markers were found only by the verifier reading the
diff. In TypeScript a marker would fail the typecheck, but in Markdown, JSON read as text, or any other file the
gate does not parse, nothing reads it. Every agent merges `origin/main` into its branch before it hands over, so
this can happen on any branch. The markers in that file were removed in `a720e14`; the gap in the gate is still open.

## Specs

None. The bar this misses is the repository's own process: `docs/clean-room/agent-workflow.md` and the merge rules
in the orchestrated-build references expect a merge to keep both sides, and the record's tables to stay well formed.

## Relevant files

- `package.json`: the `lint` script, which runs the `tools/check-*.mjs` checks before `eslint`. None of them looks
  for a line that starts with `<<<<<<< `, `=======` or `>>>>>>> `.
- `tools/check-line-endings.mjs`: already lists every tracked file through `git ls-files`, though it reads only the
  endings git reports, not the contents; a marker check could take its list.
- `docs/architecture/first-executions.md`: where the markers were found (lines 306 to 312 at `361f71c`).

## Outcome — repaired 2026-10-02 (fin5, branch `fin5-gate-and-scope`)

Confirmed first on a scratch branch cut from origin/main `f2bddcf`: a commit adding a Markdown file whose table rows sit
inside a `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` block left `pnpm lint` at exit 0.

`tools/check-conflict-markers.mjs` now runs in `pnpm lint`, second, after `check-line-endings.mjs`. One `git grep -l -I`
over the working copy and one over the index name the candidate files (a line that begins with seven `<`, seven `|` or
seven `>` followed by a space or the line's end); each candidate is read whole, from disk and from the index
(`git cat-file blob :0:<path>`), and every marker line is reported as `<path>:<line>: <marker> (working copy | index)`. A line of
exactly seven `=` counts only between an opening and a closing marker, because alone it is a legal Markdown setext
heading underline; an indented or quoted marker is an example and passes. Reading the index as well catches a block
that was staged and then cleaned on disk without being staged again. Outside a git checkout it prints that it skipped,
as `check-line-endings.mjs` does. Untracked files are not read.

**Corrected after the first verification (2026-10-02).** The first form ran `git grep` without `--no-color` and
skipped, with a bare `continue`, any candidate it could not read. Under `color.ui=always` or `color.grep=always` (a
user's or a host's configuration, or `GIT_CONFIG_COUNT` in the environment) git wraps each path it names in ANSI
escapes, no file of that name exists, both reads failed, and the check printed that no tracked file held a marker and
exited 0 over a staged block: the false green the gate exists to prevent. The reason the first form gave for the
skip, that a read can fail only for an unmerged path with no stage-0 entry, was false; it is kept here beside its
replacement. Every git call now runs with `-c color.ui=false -c color.grep=false`, and `git grep` with `--no-color`
as well. A candidate it cannot read is a reported problem (`<path>: could not be read (<side>): <reason>`), except on
the index side for a path `git ls-files -u` names as unmerged, whose working copy is read instead. Inside a checkout
(`git rev-parse --is-inside-work-tree`), a `git grep` that fails for any reason other than finding nothing turns the
lint red with git's own message, so a broken checkout cannot read as skipped; only a directory outside git still
skips.

**Corrected after the second verification (2026-10-02).** The sentence just above, that only a directory outside git
still skips, was false and is kept beside its replacement. `git rev-parse --is-inside-work-tree` ran inside a bare
`catch { return false; }`, so every checkout git refuses to operate on read as "not a checkout" and the check printed
that it skipped and exited 0 over a staged block: a checkout owned by another uid (`fatal: detected dubious
ownership`, as a CI container or a mounted checkout meets it), one whose `core.repositoryformatversion` git does not
know, and a `.git` file naming a git directory that is gone. Now only a genuine absence skips: git not installed
(`ENOENT`), or git answering "not a git repository" with no `.git` at or above the root. Every other `rev-parse`
failure, and a root inside a git directory but not a work tree, throws `git rev-parse failed: <git's message>` and the
lint goes red. With the same correction, the index side reads a blob as `:0:<path>`: a bare `:<path>` read a tracked
`1:x.md` as stage 1 of `x.md` and reported it unreadable (red, never green, but red for the wrong reason).

**Corrected after the third verification (2026-10-02).** The claim above and in the records that it reads every
tracked text file was false and is kept beside its replacement. Both `git grep` passes ran with `-I`, and `git grep -I`
treats a path whose `diff` attribute is unset as binary. `.gitattributes` sets `pnpm-lock.yaml text eol=lf -diff`, so
the lockfile, the file a merge in a pnpm workspace conflicts on most, was never a candidate on either side: a staged
`<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` block in it answered `[]` and the lint exited 0. Now both passes run
`git grep --text`, and what counts as binary is decided by content alone: a candidate with a NUL in its first 8000
bytes (git's own test, `FIRST_FEW_BYTES`) is passed over, since git never writes markers into a binary file. With the
same correction, the index side reads `:0:./<path>`: `:0:<path>` resolves from the repository top while `git grep`
names paths from its cwd, so a root below the top would have reported its candidates unreadable (not reachable from
the CLI, which passes the repository root). Shown on the worktree's real `pnpm-lock.yaml`: a block appended and
staged at lines 5305, 5307 and 5309 answers `[]` on the earlier form and six problems (both sides) on this one, and
removing it turns the check green. Under `pnpm lint`, pnpm itself rewrites a conflicted lockfile on disk before the
script runs ("Merge conflict detected in pnpm-lock.yaml and successfully merged"), so the working-copy side is clean by
then and the gate names the three lines on the index side, exit 1.

Pinned by `tools/check-conflict-markers.test.ts` (twelve cases, the markers built with `repeat` so the file cannot trip
the gate): the three-marker block is named line by line, a diff3 block's base marker and a lone opening or closing
marker are named, a setext heading underline (alone, and after a closed block) and an indented example inside a code
fence pass, a plain text passes; over a throwaway git repository the staged block fails on both sides, the heading,
the example and a JSON file pass, a block staged and then cleaned on disk fails on the index side, a block on disk not
yet staged fails on the working-copy side, an untracked file is ignored, and a directory outside git answers `null`.
Three cases were added with the correction: the staged block still fails on the index side with lines 5, 7 and 9 when
the throwaway repository sets `color.ui` and `color.grep` to `always`; a real merge conflict's unmerged path is read
from its working copy (lines 3, 5 and 7) with nothing reported as unreadable; and a checkout whose index is corrupt
throws a `git grep` failure instead of answering. The colour case and the corrupt-index case fail against the first
form (it answered `[]` and `[]`). Three more were added with the second correction, each failing against the form
before it: a repository whose `core.repositoryformatversion` is 99 and a directory whose `.git` file names a missing
git directory both throw `git rev-parse failed` (the earlier form answered `null`), and a staged `1:x.md` holding the
block is read at stage 0 and names lines 5, 7 and 9 (the earlier form reported it unreadable). Fifteen cases in all
after the second correction. Three more were added with the third: a throwaway repository whose `.gitattributes`
sets `pnpm-lock.yaml text eol=lf -diff` and whose staged lockfile holds a block names lines 2, 4 and 6 on both sides
(the earlier form answered `[]`); a root below the repository top names its index side (the earlier form reported
it unreadable); and a file with a NUL in its first bytes and a marker-like line is passed over as binary. Eighteen
cases in all.
The dubious-ownership case was shown by hand, not in the test file (it needs a second uid): after `chown -R
1234:1234` of a scratch repository holding a staged block, the earlier form answered `null` and its CLI printed that
it skipped (exit 0); the corrected one throws, and its CLI exits 1 with git's message. The test file fails without the repair (the module does not exist). Shown again after the repair: the same marker block
committed on a scratch branch turns `pnpm lint` red at the new check, naming `docs/scratch-conflict.md` lines 5, 7 and 9,
and removing it turns it green. On the branch itself the check is green from its first run: no tracked file on
origin/main holds a marker.

Recorded in `docs/clean-room/agent-workflow.md` ("Merge back, and persevere"), `docs/architecture/codebase.md` (the
lint's checks) and a row of `docs/architecture/first-executions.md`.
