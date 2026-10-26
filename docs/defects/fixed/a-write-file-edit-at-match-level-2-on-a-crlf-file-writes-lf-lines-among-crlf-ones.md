## A `write_file` edit at match level 2 on a CRLF file writes LF lines among CRLF ones

On a file whose lines end in `\r\n`, a multi-line `old_string` written with `\n` alone never matches at REQ-TOOLS-136 level 1
and matches at level 2, since stripping trailing whitespace from every line strips the `\r`. `applyMatch` then replaces the
window's whole lines with `new_string.split('\n')`, which carry no `\r`, and joins the file with `\n`: the replaced lines end
in `\n` while every other line keeps `\r\n`. Probed on 2026-10-13 against `origin/main` at `d1f081c`: `one\r\ntwo\r\nthree\r\n`
edited with `old_string` `one\ntwo` and `new_string` `ONE\ntwo` succeeds with "Edited c.txt: 2 lines replaced by 2 at line 1
(+2 -2). Match level: 2." and leaves `ONE\ntwo\nthree\r\n` — the unchanged `two` counted as changed, because it lost its `\r`.
Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary. The same apply at level 2 also drops
the trailing spaces of each replaced line that `new_string` does not repeat (a Markdown hard break). `haet_edit` is not
affected: it applies level 1 only, and `PD-TOOLS-014`'s near-miss quote carries the `\r`.

Read from the code by both advocates of OQ-233's ruling (R-072, 2026-10-13) and confirmed by the probe; that ruling does not
decide it. Recorded, not repaired.

**Repaired 2026-10-13 (fin36), under [`PD-TOOLS-016`](../../product/directives/pd-tools-016.md#pd-tools-016)
([OQ-246](../../architecture/open-questions/52-spikes-and-later-questions-19.md#oq-246), ruled under R-072).** `carryWindow`
(`packages/agent-tools/src/tools/files.ts`) runs for every single-window match above level 1: at level 2 each line of
`new_string` paired with an identical line of `old_string` by `linePairs` (`diff.ts`, the diff row's own walk) is written as the
window's own line, and on a CRLF window each replacement line a line break follows gains `\r`, the success adding "new_string
was written with the file's CRLF line endings.". The probe now leaves `ONE\r\ntwo\r\nthree\r\n` and reports "2 lines replaced by
2 at line 1 (+1 -1)", and an unchanged interior hard break keeps its spaces. Pinned by twelve cases under "PD-TOOLS-016" in
`packages/agent-tools/src/tools/tools.test.ts` (ten red on the code before, one of them on the description sentence alone) and `diff.test.ts`'s `linePairs` cases. The level-1
sibling (an exact match writing `new_string`'s LF lines) is not decided by the directive and is recorded on its own as
[`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md).

## Specs

- No requirement's text is contradicted. REQ-TOOLS-136 makes level 2 a match ("exact after trailing whitespace is stripped
  from every line on both sides") and says "a window match replaces whole lines", silent on the line endings and trailing
  whitespace the replacement then carries. Raised as [OQ-246](../../architecture/open-questions/52-spikes-and-later-questions-19.md#oq-246).
- REQ-TOOLS-135's success message reports a line as changed that the caller did not change.

## Relevant files

- `packages/agent-tools/src/tools/files.ts`: `applyMatch` (the whole-line replace of a window match) and `matchEdit`'s level 2;
  `decodeText` keeps the `\r` in the text the edit splits on `\n`.
- `packages/agent-tools/src/tools/tools.test.ts`: "PD-TOOLS-014 … level 2 on a CRLF file" pins `haet_edit`'s side of the case.
