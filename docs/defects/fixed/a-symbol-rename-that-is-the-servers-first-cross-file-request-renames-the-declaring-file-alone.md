## A symbol rename that is the server's first cross-file request renames the declaring file alone

**Repaired again 2026-10-20 by loc1 (`loc1-rename`) under OQ-362's ruling (R-072, option (a) refined), recorded as
[`PD-MCP-004`](../../product/directives.md#pd-mcp-004) revision 2, clause 5.** For a rename whose declaring file the runtime serves
with its TypeScript language and which no `tsconfig.json` or `jsconfig.json` covers — in its directory or any up to the root the
server was launched for, none above — the run host places a `jsconfig.json` of the product's own at that root after `connect` and
before clause 2's search (its bytes one constant, `CODE_INTELLIGENCE_PROJECT_FILE_BYTES`: a comment line naming Rotaris, then `{}`,
LF; created exclusively, never over a person's file), keeps it while the search and the rename are answered, and removes it in the
observed call's `finally`, before the reach observation looks again, only while its bytes are still the constant. Renames
overlapping at one root share one file through a per-root count on `McpHost`; a file with the constant's bytes that no rename keeps
is removed at each run start at the root (`prepare`) and adopted, then removed, by the next rename there; each placement and removal
is noted in OQ-245's write journal under a name no agent bears, so no observation lists it, and logged at `info`. The manifest
records the clause by capability (`projectFiles`, the `typescript` language's twelve extensions read from the runtime, refused by
`projectFileRefusals` in `apps/desktop/scripts/lib/code-intelligence-warm-ups.mjs`), read by `codeIntelligenceProjectFile` in
`packages/config/src/mcp/code-intelligence.ts`; the executor is `apps/desktop/src/run-host/mcp.ts`. OQ-362's spike came first:
its four rows (the table below, dated 2026-10-20) each reached every importer.

**Pinned by** seven cases under "PD-MCP-004 revision 2 (OQ-362)" in `apps/desktop/src/run-host/mcp.test.ts`, all red on the code
before (the file placed for the search and the rename and gone at the return; removed after an error result, a thrown fault, a
cancel during the search and a spent allowance; one file for two overlapping renames; a leftover removed at a run's preparation and
adopted then removed by a rename, a person's file kept; changed bytes kept with a warn line; no observation listing the file, the
renaming child's or a sibling's across the placement or the removal) and four guards green before and after (a covering file in the
declaring file's directory, between it and the root, or at the root; a `.py` file; another EDIT tool, the model's own search, another
server's same-named tool; a declaring file outside the root); by the reader's cases in
`packages/config/src/mcp/code-intelligence.test.ts` and the generator's in `code-intelligence-warm-ups.test.ts`, red before.
**Shown in the built app** by `code-intel-proof` (`--skip-build --steps=10,11,13,14,15`, Windows 11 ARM64, the emulated `win32-x64`
bundle, CPU load 50 % with another tree's Electron alive at the start): launch 13 (`child-rename-cold-js`), launch 14
(`child-rename-opened-js`, a symbol overview of the declaring file first) and launch 15 (`child-rename-cold-ts`, two `.ts` files and
no `tsconfig.json`) each "(2 changes applied)", both files changed on disk, the report and the artifact listing exactly those two,
no search row, the log's one placement and one removal, nothing left at the root; launch 11 green with no `jsconfig.json` beside its
`tsconfig.json`; launch 10 unchanged. With the clause switched off in the same build (the run host's file as at `0d89e971`, CPU load
94 % beside two other trees' Electron), launches 13, 14 and 15 each read "(1 changes applied)", the declaring file alone, and the
proof failed on all three. The whole proof then passed in one run (launches 1 to 6 and 8 to 15, the seventh needing a packaged tree;
980 s, CPU load 79 % at the start with eight other trees' Electron alive). Launches 11, 13, 14 and 15 are re-run on every pin change.
**Not shown:** the live `rename` scenario: its
launch (`timeout 3600 node C:/dev/Rotaris-crw-wt-loc1-rename/apps/desktop/scripts/live-run.mjs --confirm --skip-build --only=rename`)
was refused by the session's permission classifier and is the orchestrator's to run; it now also fails when a `jsconfig.json` stands
at the workspace root afterwards.

**Reopened 2026-10-15 by fin47 (`fin47-rename-and-optionals`): PD-MCP-004's reference search does not reach a workspace with no
TypeScript or JavaScript project file.** The opt-in live `rename` scenario at `3c03287` (pack `2026-10-15T05-00-55-983Z`, session
`abb94646`) read "rename: the cold rename reached the importing files on its own (PD-MCP-004)" as **FAIL**: the delegated
coding-agent's one `rename_symbol` call of `remaining` → `countRemaining` in `src/todos.js` was `ok` and answered `Successfully
renamed 'remaining' to 'countRemaining' (1 changes applied)` in 5,320 ms (the run host's reference search included; no warning was
logged, so the search answered); only `src/todos.js` changed, and the child then edited `src/App.jsx` and `src/todos.test.js` by
hand with `haet_edit` (`node --test` green). The same head's `code-intel-proof` launch 11 (`child-rename-cold`) renamed in both of
its files. **What differs is the fixture, not the warm-up's timing or the server's readiness.** Measured 2026-10-15 over the
bundled runtime's own stdio server (`serena-agent` 1.7.0, the `--context ide` arguments the product ships, the runtime of the
`3c03287` build), one fresh server per row, the run host's search reproduced as the same `find_referencing_symbols` call:

| Workspace | Requests before the rename | The search answered | Files the rename changed |
|---|---|---|---|
| `cold-a.ts`/`cold-b.ts` with `tsconfig.json` (launch 11's shape) | the search | both files | both (`2 changes applied`) |
| the live run's `todo-app` fixture (`.js`/`.jsx`, no project file) | the search | `{}` | `src/todos.js` alone (`1 changes applied`) |
| the same fixture | none | — | `src/todos.js` alone |
| the same fixture | the search, 15 s, the search again | `{}` twice | `src/todos.js` alone |
| the same fixture | `get_symbols_overview` of `src/App.jsx` and of `src/todos.test.js`, then the search | `{}` | `src/todos.js` alone |
| the same fixture with an empty `jsconfig.json` added at its root | the search | `src/App.jsx`, `src/todos.test.js` | all three (`3 changes applied`) |
| two `.ts` files, no `tsconfig.json` | the search | `{}` | the declaring file alone |
| 2026-10-20, control: the fixture, no project file (revision 1 as built) | the search | `{}` | `src/todos.js` alone (`1 changes applied`) |
| 2026-10-20, row 1: the fixture; the product's `jsconfig.json` placed once `tools/list` had answered, before any file was opened | the search | `src\App.jsx`, `src\todos.test.js` | all three (`3 changes applied`) |
| 2026-10-20, row 2: the fixture; `get_symbols_overview` of `src/todos.js` first, then the product's file placed | the overview, the search | `src\App.jsx`, `src\todos.test.js` | all three (`3 changes applied`) |
| 2026-10-20, row 3: row 2's server, its file removed after row 2's rename and placed again at once; `filterTodos` → `selectTodos` | the search | `src\App.jsx`, `src\todos.test.js` | all three (`3 changes applied`) |
| 2026-10-20, row 4: two `.ts` files, one importing the other, no `tsconfig.json`; the product's file placed once `tools/list` had answered | the search | `src\cold-a.ts`, `src\cold-b.ts` | both (`2 changes applied`) |

**OQ-362's spike, 2026-10-20 (loc1, `loc1-rename`; the first act of building the ruling, as CLAUDE.md asks).** The five rows dated
2026-10-20 were measured on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64, over the bundled runtime's own stdio server —
`serena-agent` 1.7.0 on Python 3.13.15, the `win32-x64` bundle that host builds and runs under its x64 emulation (OQ-401), built at
`0d89e971` — with the shipped arguments (`start-mcp-server --transport stdio --context ide --project <copy>`), one fresh server per
row except rows 2 and 3, which share one as the ruling asks, each in a fresh copy of `apps/desktop/scripts/fixtures/todo-app` (row
4 in a workspace of two TypeScript files), the search being the run host's own `find_referencing_symbols` call. The file was the
product's exact bytes (`CODE_INTELLIGENCE_PROJECT_FILE_BYTES`: one `//` comment line naming Rotaris, then `{}`, LF), created
exclusively before the search and removed after the rename answered; its bytes were unchanged at every removal. Times: the
control's search 23.0 s (the TypeScript language server provisioned in it), the rename 0.13 s; row 1's search 2.16 s, rename
0.14 s; row 2's overview 1.19 s, search 1.11 s, rename 0.14 s; row 3's search 0.18 s, rename 0.14 s (the runtime sent the language
server three file-change events before it); row 4's search 1.59 s, rename 0.13 s. CPU load 76 % at the start, one other tree's
Electron alive. **No row left an importer behind**, so the clause was built as ruled.

And through the runtime's language-server layer directly (`solidlsp`, the same pin), the `todo-app` fixture with no project file:
the references request and the rename edit named `src/todos.js` alone; with `src/App.jsx` and `src/todos.test.js` held open in the
language server for the two requests, the references named both and the rename edit touched all three files.

**The reading.** The TypeScript language server places a file that no `tsconfig.json` or `jsconfig.json` covers in an *inferred*
project made of the files open in it and what those import; a file that imports the symbol but is not open is in no project the
server searches. The pinned runtime opens only the declaring file for the search and for the rename and closes each after its
request (`open_file` in `solidlsp/ls.py`), so with no project file there is nothing for the search to load and nothing to wait for:
PD-MCP-004's search answers `{}` and the rename stays in the declaring file however long the server has run. The original table
below already held this arrangement (its fourth row, the `todo-app` copy, cold) — the search's effect was measured only on the
third shape, with a `tsconfig.json`, and the repair's claim was generalised from it. A Vite React project, which the live fixture
copies, ships no `jsconfig.json`, so this is the ordinary shape of a JavaScript workspace rather than a corner.

**Why it is not repaired here.** PD-MCP-004 rules the search and nothing else (its clause 2: the referencing-symbol search with the
two shared arguments). Every measured remedy is outside it: a project file written into the person's workspace, the importers held
open by the runtime (a patch of the pinned distribution, which OQ-273 rejected as its option (b)), or the run host telling the model
or mending the files itself (OQ-273's rejected (c), and more). The choice is raised as
[OQ-362](../../architecture/open-questions.md#oq-362) and left for the consortium (R-072). **Pinned red until then** by
`code-intel-proof` launch 13 (`child-rename-cold-js`), the live fixture's shape in the built app, held to the proof's end as launch
11 is; and by the live `rename` scenario's check above, which failed at `3c03287`. Launch 13's first runs, built from fin47's branch
(`--steps=10,11,13`, load 1.98 rising to 4.26 on four CPUs): launches 10 and 11 green ("(2 changes applied)", both files each);
launch 13 red as the live run was — "(1 changes applied)", `src/cold-c.js` alone, `src/cold-d.js` still importing `countLeft`,
report and artifact listing the one file. Its instrument, shown working once by a control run not committed (the same launch with
an empty `jsconfig.json` written into its workspace, load 3.35): "(2 changes applied)", both files, `PASSED`.

**Confirmed again 2026-10-15, still waiting on OQ-362.** fin47's acceptance round 1 swept `cb6d1d5` and read launch 13 red twice
(finding A1, release-blocking): 823 s on a stale bundle, then 821 s alone on a rebuilt one (load 0.18 to 0.76), both "(1 changes
applied)" with `src/cold-c.js` alone. Bundle `fin47-accept1-5`, built at `8baf9e4` (no product, recipe or pin change since
`cb6d1d5`), ran launch 13 alone (`code-intel-proof.mjs --skip-build --steps=13` under `xvfb-run`, the bundle's `--check` current,
load 5.68 rising to 6.95 beside other lanes) and read it red the same way in 44.9 s: "Successfully renamed 'countLeft' to
'tallyLeft' (1 changes applied)"; changed on disk, in the report's `edited_files` and in the artifact: `["src/cold-c.js"]`; and
`src/cold-d.js` still importing and calling `countLeft`. Nothing was repaired: every measured remedy is one of OQ-362's options,
and that question is the consortium's under R-072, not a builder's. The note stays open and launch 13 stays red until OQ-362 is
ruled and built.

*The note's original text, its specs and its first outcome follow unchanged; the outcome's "Repaired" holds for a workspace whose
files a `tsconfig.json` or `jsconfig.json` covers, and is falsified for one with no such file.*


The code-intelligence EDIT tier's symbol rename (`rename_symbol`, REQ-MCP-015's "symbol rename"; the manifest's `renameSymbol`,
reach `project`) renames a symbol in the file that declares it and in no other file when it is the first request of its server
session that needs the language server's cross-file view. Its result still says it succeeded — `Successfully renamed
'countItems' to 'tallyItems' (1 changes applied)` — and the files that import or call the old name are left naming a symbol that
no longer exists, so the project no longer builds and its tests no longer load. The same rename made after a
referencing-symbol search in the same server session reaches every file (`2 changes applied`).

Found 2026-10-13 by fin42 (N59) building `code-intel-proof`'s tenth launch, the first rename ever driven through the built app:
a delegated refactorer's one scripted `rename_symbol` of a TypeScript function declared in `src/rename-a.ts` and imported and
called by `src/rename-b.ts`, against the real bundled runtime and its TypeScript language server. The call row was `ok` and only
`src/rename-a.ts` changed. Measured again over the runtime's own stdio branch, outside the run loop, in four arrangements:

| Workspace | Requests before the rename | Files the rename changed |
|---|---|---|
| two `.ts` files with a `tsconfig.json` | none | the declaring file alone (`1 changes applied`) |
| the same, 20 s after the server was up | none | the declaring file alone |
| two `.ts` files, no `tsconfig.json` | none | the declaring file alone |
| a copy of the live run's `todo-app` fixture, `remaining` → `countRemaining` | none | `src/todos.js` alone; `src/App.jsx` and `src/todos.test.js` untouched |
| two `.ts` files with a `tsconfig.json` | one `find_referencing_symbols` of the same symbol | both files (`2 changes applied`) |

The reading of the pinned runtime's own code (the bundled distribution, `serena-agent` at the manifest's pin): a references
request goes through the TypeScript adapter's `_pre_open_for_cross_file_references` and
`_wait_for_cross_file_references_if_needed`, which wait for the server's project loading after the first file is opened; the
rename request (`request_rename_symbol_edit` in `solidlsp/ls.py`) opens the declaring file and sends `textDocument/rename` at
once, before the project has loaded, so the language server answers with the edits it can see, in that one file. Waiting does not
help, since no file has been opened until the rename itself opens one. The runtime then applies what it was given and reports the
count as a success (`LanguageServerCodeEditor.rename_symbol`, `serena/code_editor.py`).

What the run host records of it is true: OQ-245's reach observation lists exactly the file that changed, so the child's report
and its child-report artifact name `src/rename-a.ts` and nothing else. What is false is the tool's own success, and the model is
told nothing that would send it to the importing files: a rename is the tool a model reaches for precisely so that it does not
have to edit them one by one.

## Specs

- `REQ-MCP-015`: the EDIT tier's "symbol rename", granted to coding-agent, tester and refactorer, whose description the product
  passes to the model as the runtime gives it ("Renames the symbol … throughout the entire codebase"). A rename that leaves the
  references naming a removed symbol is not a rename of the symbol.
- `REQ-ORCH-109`: a report "cannot conceal files it failed to account for" — not contradicted (the report lists the one file the
  call changed), but a report saying the rename succeeded hides that the work is broken.
- No requirement says how the product drives the runtime's language server, or whether it may warm it, so the repair is a
  question: [OQ-273](../../architecture/open-questions.md#oq-273).

## Relevant files

- `apps/desktop/resources/code-intelligence/runtime/…/site-packages/solidlsp/ls.py` — `request_rename_symbol_edit`, which sends the
  rename with no cross-file wait; the references path that waits (built by `pnpm code-intel:bundle`, not in the repository).
- `apps/desktop/resources/code-intelligence/runtime/…/site-packages/solidlsp/language_servers/typescript_language_server.py` —
  `_pre_open_for_cross_file_references`, `_wait_for_cross_file_references_if_needed`.
- `apps/desktop/src/run-host/mcp.ts` — the MCP executor every code-intelligence call goes through, where a product-side warm-up
  would sit.
- `apps/desktop/scripts/code-intelligence/pins.json`, `apps/desktop/scripts/code-intelligence/bundle.mjs` — the pin and the recipe
  a runtime-side repair would change.
- `apps/desktop/scripts/code-intel-proof.mjs` — launch 10 (`child-rename`, after a referencing-symbol search, both files) and
  launch 11 (`child-rename-cold`, the rename alone), which pins this note and is red until it is repaired; and since the reopening
  launch 13 (`child-rename-cold-js`, the rename alone in a JavaScript workspace with no project file), red until OQ-362 was built;
  since PD-MCP-004 revision 2 launches 14 (`child-rename-opened-js`) and 15 (`child-rename-cold-ts`) beside it.
- `apps/desktop/scripts/fixtures/todo-app` — the live run's workspace: `.js`/`.jsx` files and no `tsconfig.json` or
  `jsconfig.json`, the shape the reopening is about.
- `apps/desktop/scripts/live-run.mjs` — the opt-in `rename` scenario, which names a cold rename that reached one file.

## Outcome

*Repaired again 2026-10-20 (PD-MCP-004 revision 2, OQ-362): the outcome is at the head of this note. The first outcome, below,
holds for a workspace a `tsconfig.json` or `jsconfig.json` covers.*

**Repaired 2026-10-14 by fin43** under OQ-273's ruling (R-072, option (a)), recorded as
[`PD-MCP-004`](../../product/directives.md#pd-mcp-004): before the run host forwards a symbol rename to the bundled server it
sends that server's referencing-symbol search for the same `name_path` and `relative_path`, discards the answer, and then
forwards the rename, both within the rename's one REQ-MCP-003 allowance; the search writes no record. The pairing and the
argument names are the binding manifest's `warmUps` (`manifest.mjs`, refused by `scripts/lib/code-intelligence-warm-ups.mjs`
unless the server lists both tools with both arguments), read through `codeIntelligenceWarmUp`
(`packages/config/src/mcp/code-intelligence.ts`) by the MCP executor in `apps/desktop/src/run-host/mcp.ts`.

**Pinned by** eight cases under "PD-MCP-004" in `apps/desktop/src/run-host/mcp.test.ts` (seven red on the code before; the
eighth, another server's same-named tool and another EDIT tool not warmed, is a guard), the resolver's cases in
`packages/config/src/mcp/code-intelligence.test.ts` and the generator's in `code-intelligence-warm-ups.test.ts`. **Shown in the
built app** by `code-intel-proof` launch 11 (`child-rename-cold`): the cold rename said "(2 changes applied)", changed
`src/cold-a.ts` and `src/cold-b.ts`, and the report and the artifact listed both, with no reference-search row; launch 10 stayed
green. With the warm-up switched off in the same build the launch went red as this note describes ("(1 changes applied)",
`src/cold-a.ts` alone). Launch 11 is the directive's acceptance gate and is re-run on every pin change. **Not shown:** the live
`rename` scenario, which is the orchestrator's (`live-run.mjs --only=rename`), where a cold rename that leaves a referencing file
behind is now a finding against PD-MCP-004.
