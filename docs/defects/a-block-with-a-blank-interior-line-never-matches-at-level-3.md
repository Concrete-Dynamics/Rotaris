## A block with a blank interior line never matches at level 3

`matchEdit`'s level 3 (`packages/agent-tools/src/tools/files.ts`) shifts every line of `old_string` by the same leading prefix:
in the deeper direction it prepends the prefix to each line, and in the shallower direction it requires each line to begin with
it. A blank line of `old_string` — empty, or holding only the line ending — is shifted like any other, so it becomes the bare
prefix (deeper) or fails the `startsWith` test (shallower), while the file's blank line in the window is empty. An
indentation-shifted block that holds a blank line therefore never matches at level 3, on LF and CRLF files alike, and falls to
level 4 or to no match, outside `PD-TOOLS-015` (the shift) and `PD-TOOLS-014` (the near miss).

Found 2026-10-14 by fin43 while building `PD-TOOLS-019` (OQ-280), which sets a line's trailing `\r` aside at level 3 and does
not decide this. Measured with `matchEdit` directly, the file `a`, `\t\tx = 1;`, an empty line, `\t\ty = 2;`, `z`:

| `old_string` | LF file | CRLF file |
| --- | --- | --- |
| one tab shallow, `\tx = 1;` / `` / `\ty = 2;` | level 4 (similarity 0.89): `write_file` applies it unshifted beside "Verify the result." | no match |
| one tab deep, `\t\t\tx = 1;` / `` / `\t\t\ty = 2;` | level 4 (similarity 0.90) | no match |

The same block without its blank line matches at level 3. A blank line inside a function body or between two statements is the
commonest shape a multi-line edit carries, so the guarantee `PD-TOOLS-015` was ruled for (a mis-indented block never lands
beside a success) does not hold for it, and `haet_edit` gives the plain miss.

## Specs

None contradicted word for word: REQ-TOOLS-136's level 3 reads "exact after one and the same leading-whitespace prefix is added
to or removed from every line of the candidate", which as built includes a blank line, and is silent on whether a line with no
visible character takes part. `PD-TOOLS-015` already reads a blank `new_string` line as never padded nor stripped; whether level
3 reads `old_string`'s and the window's blank lines the same way is a question, raised as
[OQ-295](../architecture/open-questions.md#oq-295).

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `matchEdit`'s level-3 loop (`shifted`, the prefix prepended or required on every
  line); `shiftNewString`, which already leaves a line with no visible character as given.
- `packages/agent-tools/src/tools/tools.test.ts` — the "PD-TOOLS-015" and "PD-TOOLS-019" cases, none of which carries a blank line.
