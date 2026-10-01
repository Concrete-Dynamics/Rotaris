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
