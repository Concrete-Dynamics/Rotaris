## A child that edits through the code-intelligence edit tools is reported as having changed nothing

The run counts only `write_file`, `haet_edit` and `haet` as file-writing calls (`isFileWritingTool` in
`packages/engine/src/children/report.ts`). REQ-MCP-015 grants coding-agent, tester and refactorer an EDIT tier of seven
code-intelligence tools that replace a file's content; a successful call of one of them changes a workspace file, and
the run does not see it. So a child that edits through them is told to its parent, to the summarising pass, to the
timeline and to the Library as having changed nothing: its cut-off report's `changed_paths` is empty and reads "Its
file-writing calls changed no workspace paths.", its `edited_files` and its artifact's edited files are empty, and the
facts the pass is told never to deny read "Edited files: (none)".

Found by the final duress live run at `a68f121` (session `e6747bd0`, pack `2026-10-07T07-09-30-708Z`, the autopsy's
finding D1), recorded 2026-10-07 before the repair (fin32). wave3b (`wave3b-finish-verification`, a tester continuing
wave3) made 11 single-file content replacements of `docs/verification.md` that returned `ok` (tool calls #367 to #392),
taking it from 387 lines (#334) to 469 (#393). Its report carried `changed_paths: []` and "Its file-writing calls changed
no workspace paths."; the parent read that sentence in #336's result; the pass's facts (request 275) read "Edited files:
(none)", so the summary called the edits "attempted"; artifact `art_NbPzXXmK` lists `edited_files: []`. The coordinator
spent two reasoning paragraphs on the contradiction (rows 751 and 761) and checked by reading the file. wave3's one such
call (#323) was hidden the same way; its path was listed through a `haet_edit`.

## Specs

- `PD-ORCH-004` (revision 1's clause "the workspace paths the child's own file-writing calls changed during its run"):
  the EDIT tier's calls are file-writing calls. Its first execution stated the narrow reading ("A path 'changed' when a
  `write_file`, `haet_edit` or `haet` call naming it returned `ok`") as one of its open literal readings; this run
  falsifies it.
- `REQ-MCP-015`: the EDIT tier is seven tools, among them single-file and cross-file content replacement, carried only by
  coding-agent, tester and refactorer.
- `REQ-ORCH-109` (a summarising model "cannot conceal files it failed to account for") and OQ-111's ruling (the facts the
  pass must never deny); `REQ-ORCH-108`'s edited files; `REQ-LIBRARY-088`, the artifact's edited files.
- Not this defect: terminal writes stay outside the count, as `PD-TOOLS-006` states the terminal and MCP outside its
  fence.

## Relevant files

- `packages/engine/src/children/report.ts` — `WRITE_TOOLS` and `isFileWritingTool` (the native list),
  `editedFilesFrom` (reads `path`/`file_path` only), `reportFacts` (the "Edited files" fact).
- `packages/engine/src/children/cut-off.ts` — `ProgressLog.completed`, which lists a path only for the native list.
- `packages/engine/src/children/orchestration.ts` — `onToolCompleted`, which feeds `ProgressLog`.
- `packages/config/src/mcp/code-intelligence-manifest.generated.ts` — the `edit` tier, the one source of the seven names.
