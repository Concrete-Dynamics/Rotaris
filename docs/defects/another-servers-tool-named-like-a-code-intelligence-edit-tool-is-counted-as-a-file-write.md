## Another server's tool named like a code-intelligence EDIT tool is counted as a file write

`codeIntelligenceEditPaths` (`packages/config/src/mcp/code-intelligence.ts`) decides that a call writes a file from the tool's
runtime name alone: the manifest's EDIT-tier names (`replace_content`, `replace_in_files`, `rename_symbol`, …) in lower case,
bare or under the `code_intelligence_` collision prefix. The runtime name carries the prefix only when two servers expose the
same name. So with the shipped code-intelligence entry disabled (or not exposing that tool), a user's own MCP server whose
tool happens to be called `replace_content` reaches `writtenPathsOf` (`packages/engine/src/children/report.ts`) unprefixed,
and the value of its `relative_path` argument — whatever that server means by it — is listed among the child's changed
paths, its report's `edited_files`, the facts the summarizing pass is told never to deny and the cut-off's "Files touched".
The opposite error does not arise (the product's own server is always matched). Found by reading on 2026-10-07 by fin32's
review (`review:child-reports-and-limits#1`) and confirmed by fin35 on `origin/main` at `8457c4f`: neither caller passes the
server — the report reads the conversation's tool-call parts and the cut-off tracker its `completed(at, toolName, args, ok)`
callback, both of which carry the runtime name only. Recorded, not repaired: keying the match on the calling server needs the
server carried to both readers, which is more than a small
repair.

**Since OQ-245's repair (landed on `origin/main` beside this note, 2026-10-13)** the name match is `codeIntelligenceEdit`, and it
has a third reader: the run host's MCP executor (`apps/desktop/src/run-host/mcp.ts`) asks it of every MCP tool, whatever its
server, for the reach to observe (`observeReach`). So another server's tool named like a cross-file EDIT tool
(`replace_in_files`, `rename_symbol`, …) is also walked before and after over the reach the manifest gives that name — the
workspace for a project-wide one — and what it changed is read as an EDIT call's (`writeReadingOf`). There the server is in
hand (the executor is built per server's tool), so that reader at least could be keyed on it.

## Specs

- REQ-ORCH-109: the report "cannot conceal files it failed to account for" — this is the converse, a file listed that the call
  may not have touched, which the specification does not address; no requirement is contradicted outright.
- REQ-MCP-015: the EDIT tier is the code-intelligence server's; a tool of another server is not in it.

## Relevant files

- `packages/config/src/mcp/code-intelligence.ts` — `EDIT_TOOLS` and `codeIntelligenceEditPaths`, matched by name.
- `packages/engine/src/children/report.ts` — `writtenPathsOf`, `isFileWritingTool`, the report's edited files.
- `packages/engine/src/children/cut-off.ts` — the cut-off's changed paths, through `writtenPathsOf`.
- `apps/desktop/src/run-host/mcp.ts` — the MCP executor's `observeReach`, asked of every server's tool through `codeIntelligenceEdit`.
