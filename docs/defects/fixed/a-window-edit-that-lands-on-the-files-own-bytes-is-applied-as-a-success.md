## A window edit that lands on the file's own bytes is applied as a success

A `write_file` edit that matches one window at REQ-TOOLS-136 level 2, 3 or 4 is carried by `PD-TOOLS-016` (the window's
line endings, and at level 2 the bytes of every line `new_string` repeats from `old_string`). When the carried replacement is
the window itself, the edit rewrites the file's own bytes and answers with a success: an undo entry is pushed, the file is
written, and the reply says lines were replaced. Probed 2026-10-13 by fin38 on its branch (`origin/main` `4e69b00` plus
`PD-TOOLS-017`): `one\r\ntwo\r\nthree\r\n` edited `old_string` `one \ntwo` → `new_string` `one\ntwo` matches at level 2, and
answers `Edited n.txt: 2 lines replaced by 2 at line 1 (+0 -0). Match level: 2. new_string was written with the file's CRLF
line endings.` with the file unchanged; `undo` then "restores" the same content. The sentence is also false in substance: no
byte of the file changed. The caller meant to strip a trailing space it believed was there; the file never had it.

`haet_edit` refuses its no-op (`docs/defects/fixed/haet-edit-applies-an-edit-that-changes-nothing.md`), and `PD-TOOLS-017`
clause 3 refuses an exact or replace-all edit whose carried result equals the file. A window edit has no such refusal, since
`PD-TOOLS-016` does not decide it. Found by the R-072 consortium's ruling of OQ-254, which asked for this probe; raised as
[OQ-260](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-260). Recorded by fin38 (`b6d85c9`), not repaired then.

**Repaired 2026-10-13 (fin39, `fin39-insert-noop-optionals`), under `PD-TOOLS-016` revision 3 clause 4**
([OQ-260](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-260), ruled under R-072). `writeFileTool`'s edit branch compares the window
path's result with the file before `commit`, and a result equal to the file is refused through `windowNoOpMessage`
(`packages/agent-tools/src/tools/files.ts`): nothing written, no undo entry, the read record unchanged, and the reply `old_string
matches n.txt only at match level 2 (lines 1-2), and those lines already hold new_string as this edit would write it; nothing to
change. Use write_file's 'overwrite' to write a file exactly as given.` Pinned by the cases under "PD-TOOLS-016 revision 3" in
`packages/agent-tools/src/tools/tools.test.ts`: the probe, an LF file at level 2 (`foo ` → `foo`, and a window taking in the
element after the final line break, named "line 1"), a level-3 as-given `new_string` equal to the window, and a level-4 retry of an
edit already applied — each red on the code before — and guards green before and after (a level-2 edit changing one byte, and
`PD-TOOLS-017`'s no-op text).

## Specs

- REQ-TOOLS-135 rejects identical strings ("`edit` (old-string/new-string; identical strings rejected)"), and here the strings
  differ, so its text is not contradicted. Whether a window edit whose carried replacement leaves the file unchanged is refused
  (as `PD-TOOLS-017` clause 3 refuses an exact one), or applied with a reply that says nothing changed, is a question the
  specification and `PD-TOOLS-016` leave open, for a ruling.

## Relevant files

- `packages/agent-tools/src/tools/files.ts`: `writeFileTool`'s `edit` branch, the window path (`carryWindow`, then
  `applyWindow`, then `commit`), which compares nothing with `before`; `LINE_ENDINGS_ONLY`, `PD-TOOLS-017`'s refusal beside it.
- `packages/agent-tools/src/tools/tools.test.ts`: "PD-TOOLS-016" cases, none of which sends a window edit equal to the file.
