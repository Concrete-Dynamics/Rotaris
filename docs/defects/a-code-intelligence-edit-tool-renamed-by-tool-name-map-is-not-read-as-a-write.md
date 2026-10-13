## A code-intelligence EDIT tool renamed by `tool_name_map` is not read as a write

An MCP entry's `tool_name_map` (REQ-MCP-005) offers a tool under another callable name (`resolveServerTools`,
`packages/config/src/mcp/persona.ts`). The engine's readers of a child's writes ask `codeIntelligenceEdit` by the callable
the model called (`writeReadingOf`, `packages/engine/src/children/report.ts`), and the manifest knows only the runtime's own
names, so a code-intelligence EDIT tool the workspace's entry renames (say `replace_content` offered as `edit_text`) is no
EDIT call to them: its writes are missing from the child's report, its facts and the cut-off's changed paths, and a
cross-file one's observation, which the run host does take since fin36 (it asks by the reported name), is dropped. The
shipped entry renames nothing, so only a user's own `tool_name_map` on the code-intelligence entry reaches it. Noticed
2026-10-13 by fin36 while keying the readers on the server
([`another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md`](fixed/another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md));
recorded, not repaired: the grant evidence the engine reads carries callables only, so mapping one back to its reported name
needs the reported name carried to the engine.

## Specs

- REQ-ORCH-109: the report "cannot conceal files it failed to account for"; a renamed EDIT tool's writes are left out.
- REQ-MCP-005 (`tool_name_map`) and REQ-MCP-015 (the EDIT tier is the code-intelligence server's, whatever its tools are called).

## Relevant files

- `packages/engine/src/children/report.ts` — `writeReadingOf`, `editTierNamesOf` (callables of the code-intelligence server).
- `packages/config/src/mcp/code-intelligence.ts` — `codeIntelligenceEdit`, matched against the manifest's names.
- `packages/config/src/mcp/persona.ts` — the rename, `callable: replacement ?? t.name`.
- `apps/desktop/src/run-host/mcp.ts` — `grantEvidence`, which records callables per server.
