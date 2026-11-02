## A `replace_all` edit reports how many occurrences it replaced, and no lines changed

`write_file`'s `edit` with `replace_all: true`, and `haet_edit`'s, answer `Edited <p>: <n> occurrences replaced.` and
nothing else. A single edit has reported the lines it replaced, how many lines replaced them, where, and the lines added
and removed since 2026-10-06 (`replacementMessage`,
[`an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md`](an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md)).
A replace-all says nothing of lines at all, so a model that replaced a multi-line block in three places, or an
identifier that occurs twice on one line, cannot tell from the result how much of the file moved, and the user-only diff
row beside it (`+A -R`) is the only place that says.

Found by the fin18 verifier and recorded nowhere until now.

## Specs

- `REQ-TOOLS-135`: "Success messages report lines changed/created/inserted/replaced." A replace-all is an `edit`
  success, and its message reports no line count.
- `REQ-TOOLS-136`: "Replace-all replaces every exact occurrence as plain text." Unchanged; what is replaced is right.
- `REQ-TOOLS-189`: `haet_edit` takes `replace_all` and reports its outcomes as the write tool's edit does.

## Relevant files

- `packages/agent-tools/src/tools/files.ts:463` — `write_file`'s replace-all message.
- `packages/agent-tools/src/tools/files.ts:556` — `haet_edit`'s.
- `packages/agent-tools/src/tools/files.ts:328` — `replacementMessage`, the single edit's message.

## Repaired — 2026-10-06 (fin21)

Decided from REQ-TOOLS-135: a replace-all is an `edit` success, and its success message reports lines changed, so the
message gains them. It now reads `Edited <p>: <n> occurrences replaced, <k> lines replaced by <m> (+A -R).`, in the single
edit's own words (`replaceAllMessage`, `packages/agent-tools/src/tools/files.ts`), for `write_file` and `haet_edit` alike.
The lines are counted region by region, as the single edit counts its one region: each occurrence's whole lines, running on
to the line after it when the old string ends in a newline, with regions that overlap or meet joined. So `+A -R` is the
diff row's own and a file past the diff table's bound is still counted line by line. No position is named, since a
replace-all may touch any number of places.

Pinned in `packages/agent-tools/src/tools/tools.test.ts`: five shapes through both tools (two occurrences on one line, a
block that grows in two places, an old string ending in a newline its new string lacks, adjacent lines, an occurrence at
offset 0 that opens with a newline), each checked against the file and the diff header, and 300 seeded random replace-alls
whose counts always equal the diff header's. The older `dup.txt` case now expects the line counts too. Against the code
before the repair, 12 of the file's tests fail.
