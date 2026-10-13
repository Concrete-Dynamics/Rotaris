## A cross-file code-intelligence edit is reported by its argument path alone

Since fin32 a call of the code-intelligence EDIT tier (REQ-MCP-015) is a file-writing call, and the paths it changed are read
from its arguments as the binding manifest names them (`editArguments`, `codeIntelligenceEditPaths` in
`packages/config/src/mcp/code-intelligence.ts`). For the five single-file tools and the safe delete that is the file the call
writes. For the two cross-file tools it is not:

- a **symbol rename** (`renameSymbol`) rewrites the declaring file and every file holding a reference, and is listed by
  `relative_path` alone, the declaring file;
- a **cross-file replacement** (`replaceAcrossFiles`) with no `relative_path` (the whole project) is listed by nothing, and one
  with a directory `relative_path` lists the directory as an edited file.

So a child whose only writes are a whole-project replacement that returned `ok` is reported, to its parent, to the summarising
pass and to the Library, exactly as D1's child was before fin32: `ProgressLog` gives the cut-off report `changed_paths: []`
and "Its file-writing calls changed no workspace paths." (`packages/engine/src/children/cut-off.ts`), `reportFacts` gives the
pass "Edited files: (none)" (OQ-111's facts it must not deny), and `edited_files` and the child-report artifact's edited files
are empty (`editedFilesFrom`, `packages/engine/src/children/report.ts`); a rename across thirty files lists one. The server's
results do not fill the gap: in the pinned runtime a rename returns a count of changes and names no file, and a cross-file
replacement names its files only when it succeeds, writing them one at a time, so a failure part-way leaves files written under
an error result, which `editedFilesFrom` drops.

Recorded 2026-10-13 from PD-ORCH-004's report-back ("The changed-paths reading falsified", its literal reading for cross-file
EDIT calls, open for the owner) and the fixed note
[`a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing`](fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md)'s
stated bound; ruled by the R-072 consortium as XE1, opened and ruled as
[OQ-245](../architecture/open-questions.md#oq-245). Recorded before the repair (fin35).

## Specs

- `PD-ORCH-004` revision 1's changed-paths clause ("the workspace paths the child's own file-writing calls changed"): a
  cross-file call changed more paths than its arguments name.
- `REQ-ORCH-109`: a report "cannot conceal files it failed to account for"; OQ-111's ruling, the facts the pass must never deny.
- `REQ-ORCH-108`'s edited files and `REQ-LIBRARY-088`/`REQ-LIBRARY-090`, the artifact's Edited Files: a list of files, which a
  directory is not.
- `REQ-MCP-015`: the EDIT tier, carried by coding-agent, tester and refactorer.

## Relevant files

- `packages/config/src/mcp/code-intelligence.ts` — `codeIntelligenceEditPaths`, the argument reading.
- `apps/desktop/scripts/code-intelligence/manifest.mjs` — `EDIT_ARGUMENTS`, the argument each EDIT tool's path is read from.
- `packages/engine/src/children/report.ts` — `writtenPathsOf`, `editedFilesFrom`, `reportFacts`, `fallbackReport`.
- `packages/engine/src/children/cut-off.ts` — `ProgressLog.completed` and `cutOffReport`'s "changed no workspace paths".
- `apps/desktop/src/run-host/mcp.ts` — the MCP executor, the one place a call's effect on the workspace can be observed.
