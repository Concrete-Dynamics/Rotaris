## An edit-diff row of a file past about 2000 lines counts every line as added and removed

`renderDiff` (`packages/agent-tools/src/tools/diff.ts`) builds the user-only edit-diff row from a line LCS over the whole
file before and after, and `lcsChanges` bounds its table: past 4,000,000 cells (about 2000 lines on each side) it returns
every old line as removed and every new line as added. A one-line edit to a 2,001-line file is drawn as
`<path> +2001 -2001`, followed by the file's first 50 lines as `-` and "… +3952 more lines, diff truncated", where the edit
added one line and removed one. The tool's own message counts the replaced region alone (`lineChanges`, since fin18's
G6 repair) and reads "+1 -1", so for such a file the message and the row disagree, the shape live-run finding G6 recorded
(docs/defects/fixed/an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md). Every edit to a large
file shows the user a whole-file rewrite, with none of the changed lines in the 50 it draws unless they sit near the top.

Noticed 2026-10-06 by the fin18 verifier and recorded during repair round 2; not repaired here.

## Specs

- `REQ-CHAT-050`: the row's header is `<path>[ [Created]] +A -R` "where `A` is the number of added lines, `R` the number of
  removed lines", followed by "one `[<line>]± <text>` line per changed line". Past the bound, `A` and `R` are the file's
  line counts and the drawn lines are lines the edit did not change.
- `REQ-TOOLS-135`: "Success messages report lines changed/created/inserted/replaced"; the message is right, and the row
  beside it contradicts it.

## Relevant files

- `packages/agent-tools/src/tools/diff.ts` — `lcsChanges`'s bound and whole-replace fallback (the `n * m > 4_000_000`
  branch), used by `renderDiff` for the row and by `lineChanges` for the message (which passes the region, not the file).
- `packages/agent-tools/src/tools/files.ts` — `replacementMessage` and the edit tools that call `renderDiff` on the whole
  file.
