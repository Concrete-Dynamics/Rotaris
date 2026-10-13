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

## Outcome

Repaired 2026-10-13 (fin36, branch `fin36-last-notes-and-optionals`); no question was raised, since REQ-MCP-015 already puts the
EDIT tier on the code-intelligence server and only the readers' matching departed from it. **Confirmed first** on the branch by
four cases that fail on `origin/main` at `4f0dbc0`: the MCP executor walked a `notes` server's `replace_in_files` over the
project and put `observedPaths` on its result (`mcp.test.ts`); `ProgressLog` listed a `notes` server's `replace_content` path
(`cut-off.test.ts`); and a delegated child whose grant gave `replace_content` to a server called `notes` stored a report whose
`edited_files` named its `relative_path` (`children.test.ts`, through the real orchestration); `report.test.ts` could not
import the new reader at all.

**Repair.** The two places the server is known now decide by it. The executor (`run-host/mcp.ts`) asks `codeIntelligenceEdit`
only of a tool of the server named `code_intelligence`, by the name the runtime reports, so no other server's tool is
observed. The engine's readers are given the callables the child's grant gives that server — `editTierNamesOf`
(`children/report.ts`) over `McpGrantEvidence.granted`, which is keyed by server and read from `ToolPort.grant()` — and
`writeReadingOf` answers a call whose name is not among them as no EDIT call: the report's edited files and facts
(`ReportInput.editTier`), the fallback report and `ProgressLog`, hence the cut-off's changed paths. Before a port's grant is
known (and for a port with none) the name alone decides, as before. Pinned by those four cases (the code-intelligence
server's own callables still read, in any casing and under the collision prefix, as their positive controls) and by
`pnpm code-intel-proof --steps=8,9` on the repaired build, the real runtime's EDIT calls through a delegated tester: launch 8
`edited_files ["src/edit.ts"]`, launch 9 `["docs/across-b.md","src/across-a.ts"]`, both in the child-report artifact too
(PASSED, load about 3 on 4 CPUs). Still matched by name, and recorded rather than repaired: a code-intelligence tool
renamed by the entry's `tool_name_map` is read by the engine under its callable, which the manifest does not know, so its
writes are not listed — the opposite error, unreachable with the shipped entry, which renames nothing; recorded as
[`a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write.md`](../a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write.md).

## Specs

- REQ-ORCH-109: the report "cannot conceal files it failed to account for" — this is the converse, a file listed that the call
  may not have touched, which the specification does not address; no requirement is contradicted outright.
- REQ-MCP-015: the EDIT tier is the code-intelligence server's; a tool of another server is not in it.

## Relevant files

- `packages/config/src/mcp/code-intelligence.ts` — `EDIT_TOOLS` and `codeIntelligenceEditPaths`, matched by name.
- `packages/engine/src/children/report.ts` — `writtenPathsOf`, `isFileWritingTool`, the report's edited files.
- `packages/engine/src/children/cut-off.ts` — the cut-off's changed paths, through `writtenPathsOf`.
- `apps/desktop/src/run-host/mcp.ts` — the MCP executor's `observeReach`, asked of every server's tool through `codeIntelligenceEdit`.
