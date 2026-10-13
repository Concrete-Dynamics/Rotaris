## A code-intelligence EDIT tool renamed by `tool_name_map` is not read as a write

An MCP entry's `tool_name_map` (REQ-MCP-005) offers a tool under another callable name (`resolveServerTools`,
`packages/config/src/mcp/persona.ts`). The engine's readers of a child's writes ask `codeIntelligenceEdit` by the callable
the model called (`writeReadingOf`, `packages/engine/src/children/report.ts`), and the manifest knows only the runtime's own
names, so a code-intelligence EDIT tool the workspace's entry renames (say `replace_content` offered as `edit_text`) is no
EDIT call to them: its writes are missing from the child's report, its facts and the cut-off's changed paths, and a
cross-file one's observation, which the run host does take since fin36 (it asks by the reported name), is dropped. The
shipped entry renames nothing, so only a user's own `tool_name_map` on the code-intelligence entry reaches it. Noticed
2026-10-13 by fin36 while keying the readers on the server
([`another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md`](another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md));
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

## Outcome (fin38, 2026-10-13) — repaired

The grant evidence now carries the reported name of every granted callable that differs from it: `grantEvidence`
(`apps/desktop/src/run-host/mcp.ts`) adds `renamed: {server: {callable: reported}}` to `McpGrantEvidence`
(`packages/engine/src/children/personas.ts`) where a `tool_name_map` rename or REQ-MCP-057's collision prefix made one differ,
and nothing where none does. `editTierNamesOf` (`packages/engine/src/children/report.ts`) maps each code-intelligence callable,
in lower case, to that reported name, and `writeReadingOf` asks `codeIntelligenceEdit` by it, so the report's edited files, its
facts, the cut-off's changed paths and a cross-file call's observation all read a renamed EDIT call as the write it is; the
manifest's own name, no longer a callable of the server, is no EDIT call. The field is stored in `children.granted_mcp` with the
rest of the evidence (no migration; readers ignore it). Pinned by `report.test.ts` ("a renamed code-intelligence EDIT tool is
read as a write") and `run-host/mcp.test.ts` ("REQ-MCP-005: the evidence maps a granted renamed callable to its reported
name"), each red without the change. No proof drives a renamed EDIT tool: the shipped entry renames nothing.
