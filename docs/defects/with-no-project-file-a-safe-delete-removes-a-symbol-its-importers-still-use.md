## With no project file, a safe delete removes a symbol its importers still use

In a workspace no `tsconfig.json` or `jsconfig.json` covers — the ordinary shape of a Vite or plain Node JavaScript project, the
live run's `todo-app` fixture — the bundled runtime's TypeScript language server holds only the files open in it, and the runtime
opens the declaring file alone for each request. PD-MCP-004 revision 2 (OQ-362, ruled 2026-10-20) gives the **symbol rename** a
`jsconfig.json` of the product's own for its call; two other calls a model makes in such a workspace are left as they were:

- the model's own **referencing-symbol search** (`find_referencing_symbols`, REQ-MCP-015's READ tier) answers `{}` — no
  references — for a symbol two other files import and call;
- the **safe symbol deletion** (`safe_delete_symbol`, the EDIT tier), which refuses while references exist, finds none and
  deletes the symbol, leaving its importers naming a symbol that no longer exists, while its result says `OK`.

Noticed by OQ-362's advocate A and the ruling, which asked that it be recorded and raised and not ruled there; measured
2026-10-20 by loc1's `rename` bundle (`loc1-rename`) on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64, over the bundled
runtime's own stdio server (`serena-agent` 1.7.0, the emulated `win32-x64` bundle built at `0d89e971`, the shipped `--context ide`
arguments), one fresh server per row, in copies of `apps/desktop/scripts/fixtures/todo-app`:

| Workspace | The search for `remaining` in `src/todos.js` answered | `safe_delete_symbol` of `remaining` in `src/todos.js` answered | Files changed |
|---|---|---|---|
| the fixture, no project file | `{}` (7.8 s) | `OK` (0.13 s) | `src/todos.js` — the function deleted; `src/App.jsx` and `src/todos.test.js` still import and call it |
| the fixture with the product's `jsconfig.json` placed for both calls | `src\App.jsx`, `src\todos.test.js` (2.5 s) | `Cannot delete, the symbol remaining is referenced in: {"src\\App.jsx": [1, 48], "src\\todos.test.js": [2, 34]}` | none |

So the deletion the tier calls "safe" breaks the project in that shape, and the model's own look before an edit reports that
nothing uses the symbol. Not repaired: no requirement says what the product does for either call where no project file covers
the workspace, and PD-MCP-004 rules the rename alone. Raised as [OQ-378](../archive/architecture/open-questions/68-spikes-and-later-questions-35.md#oq-378).

## Specs

- `REQ-MCP-015`: the READ tier's referencing-symbol search and the EDIT tier's safe symbol deletion, granted to the personas the
  requirement names; the runtime's own description of the deletion ("Deletes the symbol if it is safe to do so (i.e., if there are
  no references to it) or returns a list of references to it.") is what the model is told. A search that finds no reference to a
  used symbol, and a deletion that removes it, are not what either tool is for.
- `PD-MCP-004` revision 2 (OQ-362): clause 5's project file is the rename's, keyed by capability in the manifest's `projectFiles`;
  extending it to another capability is a ruling's to make.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts` — the MCP executor; `holdProjectFile` places the product's file for the rename alone.
- `packages/config/src/mcp/code-intelligence.ts` — `codeIntelligenceProjectFile`, which answers for the capabilities the manifest's
  `projectFiles` records.
- `apps/desktop/scripts/code-intelligence/manifest.mjs` — `PROJECT_FILES`, keyed by capability.
- `apps/desktop/scripts/fixtures/todo-app` — the workspace shape (`.js`/`.jsx`, no project file).
