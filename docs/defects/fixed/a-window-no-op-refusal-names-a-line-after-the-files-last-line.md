## A window edit's no-op refusal names a line after the file's last line

`write_file`'s edit refuses a level-2, 3 or 4 window edit whose carried result equals the file (`PD-TOOLS-016` revision 3
clause 4) through `windowNoOpMessage`, which numbers the window's lines from 1 and cuts them at the file's last line. The cut
reaches only the window's LAST line: a window that lies wholly in the empty element after the file's final line break keeps a
first line past the file's end. `old_string` `' '`, `new_string` `''` on `foo\n` matches at level 2 at element 1 only, and the
reply says "(line 2)" for a one-line file. The refusal itself is right; only the line it names is one the file does not have.

Found by fin39's reviewer (`review:insert-noop-optionals#1`, optional finding, 2026-10-13); recorded by fin40.

## Specs

- `PD-TOOLS-016` revision 3 clause 4 (`docs/product/directives.md`): "The lines are the window's, numbered from 1 and cut at
  the file's last line." Line 2 of a one-line file is past that cut.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `windowNoOpMessage` (`first = start + 1` is never cut).
- `packages/agent-tools/src/tools/tools.test.ts` — "PD-TOOLS-016 revision 3: a window edit whose carried result equals the
  file is refused", which pins the two-element window `foo \n` → `foo\n` ("line 1") but no window wholly past the last line.

## Repaired — 2026-10-13

Repaired by fin40. `windowNoOpMessage` cuts the window's first line at the file's last line as well as its last
(`first = min(start + 1, max(1, fileLineCount))`), so `' '` → `''` on `foo\n` is refused naming "(line 1)". The refusal and
its other readings are unchanged. Pinned by the third refusal in "an LF file at level 2: a trailing space the file never had"
under "PD-TOOLS-016 revision 3" in `packages/agent-tools/src/tools/tools.test.ts`, red before (received "(line 2)"). The
correction is reported beside revision 3's first execution in `docs/product/directives.md`.
