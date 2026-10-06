## A `replace_all` edit reports how many occurrences it replaced, and no lines changed

`write_file`'s `edit` with `replace_all: true`, and `haet_edit`'s, answer `Edited <p>: <n> occurrences replaced.` and
nothing else. A single edit has reported the lines it replaced, how many lines replaced them, where, and the lines added
and removed since 2026-10-06 (`replacementMessage`,
[`fixed/an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md`](fixed/an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md)).
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
