## A level-1 edit writes `new_string`'s LF lines into a CRLF file

An edit whose `old_string` matches at REQ-TOOLS-136 level 1 replaces the exact span with `new_string` verbatim. When
`old_string` is a single line (or any text that does not cross a line break) and `new_string` has several lines written with
`\n` alone, the result on a CRLF file has LF-only lines among CRLF ones, and the success reports nothing about it. Probed
2026-10-13 by fin36 on its branch (`origin/main` `4f0dbc0` plus `PD-TOOLS-016`): `write_file` on `one\r\ntwo\r\n` with
`old_string` `one` and `new_string` `ONE\nX` leaves `ONE\nX\r\ntwo\r\n`; `haet_edit` does the same through the same
`applyMatch`, and so does a `replace_all` (`a\r\nb\r\na\r\n`, `a` → `X\nY`, leaves `X\nY\r\nb\r\nX\nY\r\n`). A `haet_edit`
retry after a `PD-TOOLS-014` near miss that sends the quote (which carries the `\r`) with an LF `new_string` meets the same
case. Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary.

`PD-TOOLS-016` (OQ-246) keeps the file's line endings for a window match (levels 2 to 4) and says it does not decide level 1;
the R-072 consortium's ruling asked that this case be probed and recorded on its own. Recorded, not repaired; raised
as [OQ-254](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-254) for a ruling.

**Repaired 2026-10-13 (fin38, `fin38-edits-handoff-classifier`) under [`PD-TOOLS-017`](../../product/directives/pd-tools-017.md#pd-tools-017)**,
the R-072 consortium's ruling of OQ-254. `carryExact` (`packages/agent-tools/src/tools/files.ts`) carries every level-1 match and
every `replace_all` occurrence through `write_file`, `haet_edit` and `haet`: each occurrence is tested on the lines its span
touches by `PD-TOOLS-016` clause 2's test (`crlfLines`, factored out of `carryWindow`), and on a CRLF occurrence every line break
inside the replacement or directly after it gains `\r` when it lacks one, never doubled; the success adds "new_string was
written with the file's CRLF line endings."; a carried result equal to the file is refused with nothing written. The probe now
leaves `ONE\r\nX\r\ntwo\r\n`, the `replace_all` `X\r\nY\r\nb\r\nX\r\nY\r\n`, and the `PD-TOOLS-014` retry (`one\r\ntwo\r` →
`ONE\ntwo`) `ONE\r\ntwo\r\nthree\r\n`. Pinned by the cases under "PD-TOOLS-017" in `packages/agent-tools/src/tools/tools.test.ts`
(eight red on the code before, the guards green before and after) and by the reversed case under "PD-TOOLS-016". The sibling
`insert` path is recorded on its own
([`a-write-file-insert-writes-lf-lines-into-a-crlf-file`](a-write-file-insert-writes-lf-lines-into-a-crlf-file.md), OQ-259).

## Specs

- No requirement's text is contradicted: REQ-TOOLS-136's level 1 is "exact", and replace-all "replaces every exact occurrence
  as plain text"; both write `new_string` as given, which is the build. Whether an exact match should still carry the file's
  line endings into `new_string`'s added lines is a question the specification leaves open, for a ruling (it would narrow
  REQ-TOOLS-136 and REQ-TOOLS-189 for both tools).
- REQ-TOOLS-135's success counts the lines as written, so it is truthful about what it did.

## Relevant files

As they stood when the note was written; since the repair `applyMatch` is `applyWindow`, levels 2 to 4 only.

- `packages/agent-tools/src/tools/files.ts`: `applyMatch`'s level-1 branch (the exact span replaced by `new_string`), the
  `replace_all` branches of `writeFileTool` and `haetEditTool`; `carryWindow`, which `PD-TOOLS-016` applies above level 1 only.
- `packages/agent-tools/src/tools/tools.test.ts`: "PD-TOOLS-016 … level 1, replace_all and haet_edit are unchanged on a CRLF
  file" pins the build as it stands.
