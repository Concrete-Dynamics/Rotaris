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
(`git show :<path>`), and every marker line is reported as `<path>:<line>: <marker> (working copy | index)`. A line of
exactly seven `=` counts only between an opening and a closing marker, because alone it is a legal Markdown setext
heading underline; an indented or quoted marker is an example and passes. Reading the index as well catches a block
that was staged and then cleaned on disk without being staged again. Outside a git checkout it prints that it skipped,
as `check-line-endings.mjs` does. Untracked files are not read.

Pinned by `tools/check-conflict-markers.test.ts` (nine cases, the markers built with `repeat` so the file cannot trip
the gate): the three-marker block is named line by line, a diff3 block's base marker and a lone opening or closing
marker are named, a setext heading underline (alone, and after a closed block) and an indented example inside a code
fence pass, a plain text passes; over a throwaway git repository the staged block fails on both sides, the heading,
the example and a JSON file pass, a block staged and then cleaned on disk fails on the index side, a block on disk not
yet staged fails on the working-copy side, an untracked file is ignored, and a directory outside git answers `null`.
The test file fails without the repair (the module does not exist). Shown again after the repair: the same marker block
committed on a scratch branch turns `pnpm lint` red at the new check, naming `docs/scratch-conflict.md` lines 5, 7 and 9,
and removing it turns it green. On the branch itself the check is green from its first run: no tracked file on
origin/main holds a marker.

Recorded in `docs/clean-room/agent-workflow.md` ("Merge back, and persevere"), `docs/architecture/codebase.md` (the
lint's checks) and a row of `docs/architecture/first-executions.md`.
