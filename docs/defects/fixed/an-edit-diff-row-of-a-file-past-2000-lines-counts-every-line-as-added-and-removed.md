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

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

`lcsChanges` (`packages/agent-tools/src/tools/diff.ts`) takes the lines the two sides share at the start and at the end
off before it builds the table, so the table spans the changed region alone and every change keeps its line number in
its own file. A one-line edit to a 2,001-line file now draws `long.txt +1 -1`, `[1500]- …`, `[1500]+ …`, agreeing with
the message's "(+1 -1)". A region still past the 4,000,000-cell bound (changes far apart in a large file, or a large
overwrite) is diffed by Myers' shortest edit script (`shortestEdit`), whose cost grows with the lines changed: it gives
the LCS's counts, and each run of changes is drawn removed lines first, as the table's walk draws them. Only a region
with more than 2,000 changed lines falls back to its own lines (never the file's) as removed and added.

Pinned by `packages/agent-tools/src/tools/tools.test.ts`: "REQ-CHAT-050: an edit to a file past 2000 lines draws the
lines it changed, and its row agrees with its message" (the edit through `write_file`, and a 3,000-line file with one
line removed at line 10 and two added at 2990, drawn `+2 -1` with those three lines), and "REQ-CHAT-050: past the table's
bound the row still counts a least change, and its lines are the ones that changed" (three seeded regions of 2,100 to
2,400 lines a side with 150 edits each: the header equals the LCS's counts, computed in rolling rows, and the drawn lines
are a valid edit). Both red on the unrepaired `lcsChanges` (`+2001 -2001`, `+2982 -2981`). No proof draws this row; a live
run's edit to a long file would show it in the transcript's diff row.
