## On a CRLF file an LF `old_string` one indent off skips match level 3, so `write_file` lands it unshifted at level 4 and `haet_edit` gives no near miss

Found 2026-10-13 by fin42 (N52), building `pnpm edits-proof` on a generated CRLF, tab-indented fixture. `matchEdit`'s level 3
(`packages/agent-tools/src/tools/files.ts`) compares each window line with `old_string`'s shifted line exactly, `\r` included,
while level 2 strips trailing whitespace and so the `\r` too. On a CRLF file every window line ends in `\r` and an `old_string`
a model writes in JSON never does, so an LF `old_string` whose only difference is a uniform indentation shift never matches at
level 3. It falls to level 4 or to no match, both outside `PD-TOOLS-014` and `PD-TOOLS-015`.

Measured with the built tools, one tab shallow, the same three-line block (`\tif (item.visible) {` … `\t}` against the file's
`\t\tif …`), LF file beside CRLF file; the CRLF `write_file` cell is also what `edits-proof`'s `shift-lf` step reads through the
run host (`results.json`, `observed.shiftLf`):

| | LF file | CRLF file |
| --- | --- | --- |
| `write_file` edit | level 3, `new_string was shifted by the same leading prefix "\t"` (PD-TOOLS-015 clause 2), block at the file's depth | **level 4 (similarity 0.91), "Verify the result.", `new_string` written as given: the block lands one tab too shallow beside a success** (`+3 -3`) |
| `haet_edit` | near miss at match level 3, the window quoted (PD-TOOLS-014) | the plain miss, "old_string was not found exactly … Read it again with haet_read." |

A shorter window scores under 0.85 and reads "not found at any of the four match levels": no write, but no near-miss guidance
either — `check`'s `if (name) {` … `}` sent LF one tab shallow, `matchEdit` returns no match (the shape `edits-proof`'s `shift`
step sends WITH the file's `\r`s, and so reaches level 3). Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF
files are ordinary, so the guarantee `PD-TOOLS-015` was ruled for — a mis-indented block never lands beside a success — does not
hold where it matters most, and `PD-TOOLS-014`'s reply is not given.

## Specs

None contradicted word for word; a question the specification leaves open, raised as
[OQ-280](../architecture/open-questions.md#oq-280). REQ-TOOLS-136's level 3 reads "each line equal once one uniform leading prefix
is added or removed", silent on whether a line's `\r` (its line ending) takes part in "equal"; level 2 already ignores it.
`PD-TOOLS-015` and `PD-TOOLS-016` state that REQ-TOOLS-136's levels and their order are unchanged, and `PD-TOOLS-014`'s case
names level 3 as REQ-TOOLS-136 defines it. `PD-TOOLS-015`'s reason (OQ-233: a level-3 apply wrote `new_string` unshifted beside a
success) is what the CRLF case still does, one level down.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `matchEdit` (level 3's exact comparison, `eq(w, shifted)`), `shiftNewString`,
  `nearMissMessage`; the level-4 apply in `writeFileTool`'s edit branch.
- `packages/agent-tools/src/tools/tools.test.ts` — "a level-3 shifted edit on a CRLF file" sends `old_string` WITH `\r`
  (`' x\r\n y\r'`), the only form that reaches level 3 on a CRLF file; "a level-4 LF old_string on a CRLF file" pins the level-4
  write.
- `apps/desktop/scripts/edits-proof.mjs` — `shift` (level 3 reached with a `\r`-carrying `old_string`) and `shift-lf` (the LF
  shape, recorded in `results.json`, not asserted).

*Corrected 2026-10-13 by the bundle's review, before it landed: the shorter window was first attributed to `edits-proof`'s
`shift-lf` step, which is the three-line `render` block of the table and applies at level 4 (similarity 0.91) in every run.*
