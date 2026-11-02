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

## Outcome

**Repaired 2026-10-07 by fin32** (a plain defect against PD-ORCH-004, REQ-MCP-015 and REQ-ORCH-109; no ruling needed).

Confirmed on the branch first: `cut-off.test.ts`'s case "a code-intelligence EDIT-tier call that returned ok changed the
path its arguments name …" and `report.test.ts`'s describe "a code-intelligence EDIT-tier write is an edit" were red on
the code as it stood (the changed paths, the edited files, the facts and the shaped report all empty of the edited file).

The repair has one source and one reading:

- **The manifest names each EDIT-tier tool's path argument.** `apps/desktop/scripts/code-intelligence/manifest.mjs` holds,
  by capability, the argument naming the file the tool writes (for a cross-file capability, the file or directory it is
  confined to) and, for the cross-file replacement, its preview argument; generation checks each against the input schema
  the server lists for that tool, and the regenerated module carries them as `editArguments`. `codeIntelligenceEditPaths`
  (`packages/config/src/mcp/code-intelligence.ts`) reads them: null for a tool outside the tier, the path otherwise, none
  for a preview or a call naming no path. Matched in lower case and under the `code_intelligence_` collision prefix.
- **`writtenPathsOf`** (`packages/engine/src/children/report.ts`) is the one reading of the paths a call writes: the native
  file tools by `path`/`file_path`, the EDIT tier through the manifest. `ProgressLog.completed` (the cut-off's changed paths)
  and `editedFilesFrom` (the report's edited files, the pass's facts, the fallback's "Files touched", the deterministic
  tester report) both read it. A call answered with an error is still not an edit.
- **PD-TOOLS-006's fence is unchanged**: `write-scope.ts` reads `isNativeFileWritingTool`, the three native tools, and the
  terminal stays outside every count.

Pinned by the two engine cases above and `config`'s describe "the paths an EDIT-tier call writes", and shown in the built
app by `pnpm code-intel-proof`'s eighth launch (`child-edit`): a delegated tester's one single-file replacement, the file
changed on disk, and `src/edit.ts` in the child's stored report's `edited_files` and in its child-report artifact's — red
on a build of the unrepaired engine (`edited_files: []`), green after.

The falsified reading is kept beside its replacement in PD-ORCH-004's first execution, with the report-back
("The changed-paths reading falsified"); the row is in `docs/architecture/first-executions.md`.

**The bound, stated:** a cross-file capability is listed by the one file or directory its arguments name — a symbol rename
lists the file declaring the symbol, not the files whose references it rewrote; a replacement across the whole project lists
none — recorded in PD-ORCH-004 as a literal reading open for the owner.
