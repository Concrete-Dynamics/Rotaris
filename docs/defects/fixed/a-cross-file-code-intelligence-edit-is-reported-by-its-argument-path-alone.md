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
[`a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing`](a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md)'s
stated bound; ruled by the R-072 consortium as XE1, opened and ruled as
[OQ-245](../../architecture/open-questions.md#oq-245). Recorded before the repair (fin35).

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
- `packages/engine/src/run/turn.ts`, `packages/model/src/ports.ts` — the tool-result part that carries what was observed.

## Outcome

**Repaired 2026-10-13 by fin35** under OQ-245's ruling (R-072, XE1): a repair of a defect against PD-ORCH-004 and REQ-ORCH-109,
no directive minted.

Confirmed on the branch first: the new cases in `config`'s `code-intelligence.test.ts`, `report.test.ts`, `cut-off.test.ts`, the
run host's `mcp.test.ts` and `agent-tools`' `observe.test.ts` — 13 of them across those files, plus `observe.test.ts` whole —
were red on the code as it stood; and `pnpm code-intel-proof`'s new ninth launch (`child-across`), run on a build of the
unrepaired code, failed with the child's report listing `[]` after a whole-project replacement that changed two files on disk.

The repair:

- **The manifest names each EDIT capability's scope.** `editArguments` gains `scope` — `argument` for the five single-file
  tools and the safe delete, `reach` for the rename (`reach: project`) and the cross-file replacement (`reach: path`) —
  validated by `manifest.mjs` and regenerated (`--check` green against the pinned runtime). `codeIntelligenceEdit`
  (`packages/config/src/mcp/code-intelligence.ts`) returns a reach call's base; a cross-file replacement's path is never
  listed as an edited file, since it may be a directory.
- **The run host observes a reach call.** `observeReach` (`packages/agent-tools/src/tools/observe.ts`) snapshots the files the
  call can reach (size, modification and status-change times in nanoseconds; the search walk's ignore components and the
  workspace `.gitignore` pruned; 200,000 files at most) before and after it, whatever it returned, and leaves out what
  `McpHost.writes` (a `WriteJournal` the tool port fills with every native write that returned `ok`) says another agent wrote
  meanwhile. The MCP executor (`apps/desktop/src/run-host/mcp.ts`) runs every call through it; the result carries
  `observedPaths` through `Observation`, `PortToolResult` and the tool-result part, which the model client never sends.
- **The report reads it.** `writeReadingOf` (`packages/engine/src/children/report.ts`) is the one reading: observed files for a
  reach call, listed whatever it returned; with no observation the argument's file and `unnamed`, which `reportFacts`,
  `fallbackReport` and `cutOffReport` turn into "a <tool> call may have changed files the record cannot name", never "(none)"
  or "changed no workspace paths". `ProgressLog.completed` takes the observation and whether a cut call ran.
- **A walk that cannot be completed is marked** (added by the fin35 review, 2026-10-13). The ruling's `unobserved` mark: when
  `observeReach` cannot take either snapshot (a base outside the root, an unreadable one, a tree past 200,000 files) the result
  carries `unobserved: true` through the same three carriers, and `writeReadingOf`'s caller and `ProgressLog` count such a call
  as having run whatever it returned. As first built the result came back unmarked, so a whole-project replacement that erred
  part-way on such a tree read as refused and its child as having changed nothing — the falsehood this note records. Pinned by
  `observe.test.ts`'s walk-limit case, `report.test.ts`'s "an erred call the run host could not observe" and `mcp.test.ts`'s
  "a call whose reach cannot be walked", each red on the build before the review's repair.

Shown in the built app by `pnpm code-intel-proof`'s ninth launch: a delegated tester's `replace_in_files` across the whole
project, both files changed on disk, and `docs/across-b.md` and `src/across-a.ts` in the child's stored report's
`edited_files` and its child-report artifact's (61.6 s at a load of about 3 on four CPUs; red before, `[]`). Not shown: a
rename through the built app, which needs the TypeScript language server provisioned (IC-7); a live run. PD-ORCH-004's
report-back keeps fin32's literal reading beside its replacement; the row is in `docs/architecture/first-executions.md`.

**Since, 2026-10-13 (fin42, N59):** the rename through the built app is shown by `pnpm code-intel-proof`'s tenth launch
(`child-rename`, both files in the report and the artifact); the "Not shown" sentence above is kept as written, and its reason,
"needs the TypeScript language server provisioned (IC-7)", did not hold — IC-7 was discharged on 2026-09-27 and the runtime
provisions the server on first use (launch 4). The eleventh launch found the rename itself reaching the declaring file alone when
nothing came before it in the server session, a separate defect:
[`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
([OQ-272](../../architecture/open-questions.md#oq-272)). A live run is still not shown.
