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
[OQ-280](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280). REQ-TOOLS-136's level 3 reads "each line equal once one uniform leading prefix
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

## Outcome

**Repaired 2026-10-14 by fin43** under OQ-280's ruling (R-072), recorded as
[`PD-TOOLS-019`](../../product/directives/pd-tools-019.md#pd-tools-019) with [`PD-TOOLS-014`](../../product/directives/pd-tools-014.md#pd-tools-014)
revision 3: `matchEdit`'s level 3 compares each line of the window and of `old_string` with one trailing `\r` set aside and
measures the prefix on those lines; levels 1, 2 and 4, `shiftNewString`, `carryWindow` and both tools' branches are unchanged and
still read the window's raw lines. `nearMissMessage`'s level-3 reply adds "The line endings differ too: CRLF in the file and LF in
old_string. The quoted text carries the file's line endings." (or the reverse) when a window line and its `old_string` line
differ by a trailing `\r`.

**Pinned by** eight cases under "PD-TOOLS-019" in `packages/agent-tools/src/tools/tools.test.ts`, seven red on the code before:
both cells of the table's CRLF column (`write_file` shifted at level 3 then carried CRLF, both directions; `haet_edit`'s level-3
near miss naming the endings, its quote retried at level 1, the file wholly CRLF), the as-given and the refused `write_file`
cases, the short `check` window reaching level 3, and a `\r`-carrying `old_string` on an LF file; the eighth guards that agreeing
endings add no sentence and a typo stays at level 4. **Shown in the built app** by `pnpm edits-proof`: `shift-lf` asserted at
"Match level: 3." with the shift sentence then the CRLF sentence and the exact bytes, and the new `near-lf` / `retry-lf` steps
through `haet_edit`. **Not shown:** the live `crlf` scenario, the orchestrator's, which now fails a level-4 window edit whose
`old_string` was a uniform indent off. A neighbouring gap the ruling does not decide — a block with a blank interior line never
reaches level 3 — is
[`a-block-with-a-blank-interior-line-never-matches-at-level-3`](a-block-with-a-blank-interior-line-never-matches-at-level-3.md)
([OQ-295](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295)).
