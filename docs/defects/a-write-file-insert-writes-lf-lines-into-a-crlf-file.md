## A `write_file` insert writes its content's LF lines into a CRLF file

`write_file`'s `insert` splits the file and the content into lines with `splitLines` and joins them with `\n`. The file's lines
keep their `\r`, and the inserted lines have none unless the caller sent it, so on a CRLF file the result has LF-only lines among
CRLF ones, and the success ("Inserted 1 line into … at line 1.") says nothing about it. Probed 2026-10-13 by fin38 on its branch
(`origin/main` `4e69b00` plus `PD-TOOLS-017`): `a\r\nb\r\n` with `content` `X` at `insert_line` 1 leaves `a\r\nX\nb\r\n`.
Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary; `PD-TOOLS-016` and `PD-TOOLS-017` keep a
CRLF file's line endings for every `edit` and not for `insert`, so the one write path left mixes endings. Found by the R-072
consortium's ruling of OQ-254, which asked that it be recorded as its own note and question; raised as
[OQ-259](../architecture/open-questions.md#oq-259). Recorded, not repaired.

## Specs

- No requirement's text is contradicted: REQ-TOOLS-135's `insert` names only `insert_line` and its bounds, and says nothing of
  the line endings the inserted lines carry. Whether an insert carries the file's line endings is a question the specification
  leaves open, for a ruling (it would extend REQ-TOOLS-135, as `PD-TOOLS-016` and `PD-TOOLS-017` did for `edit`).

## Relevant files

- `packages/agent-tools/src/tools/files.ts`: `writeFileTool`'s `insert` branch (`splitLines` of the file and of `content`,
  joined with `\n`); `crlfLines`, the test `PD-TOOLS-016` and `PD-TOOLS-017` share, which a repair would read.
- `packages/agent-tools/src/tools/lines.ts`: `splitLines`, which keeps each line's `\r`.
