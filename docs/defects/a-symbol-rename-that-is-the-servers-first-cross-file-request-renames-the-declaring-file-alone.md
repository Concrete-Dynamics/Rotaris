## A symbol rename that is the server's first cross-file request renames the declaring file alone

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
  question: [OQ-272](../architecture/open-questions.md#oq-272).

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
  launch 11 (`child-rename-cold`, the rename alone), which pins this note and is red until it is repaired.
- `apps/desktop/scripts/live-run.mjs` — the opt-in `rename` scenario, which names a cold rename that reached one file.
