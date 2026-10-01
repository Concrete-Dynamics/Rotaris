## A child's recorded grant is its declared tools, not the set its controls narrowed it to

A child's execution record keeps `granted_tools` and `granted_mcp` (REQ-MCP-065). `granted_tools` is written from the
persona's declared tools (`grantedTools: persona?.tools ?? []` in the orchestration's spawn), and `granted_mcp` from the
persona's MCP grant evidence (`mcpEvidence`). Neither reads what REQ-TOOLS-006's controls left: a tool that
`coordinator_only`, `read_only` or `tool_restrictions` removed from the agent is still recorded as granted, and a
tool-server tool withheld by `read_only`, the `restricted` preset or an allowed-tool list is still recorded under its
server. The record, and the inspector that reads it, over-report whenever a control removed something. The
`tool_restrictions` repair (OQ-145, 2026-09-29) widened how often that happens; it was already true for the other controls.

Noticed 2026-09-30 by the verifier of the `tool_restrictions` repair, recorded by its repairer. Not reproduced in a
built app.

## Specs

- `REQ-MCP-065`: each child's persisted state records its **granted** native tools and its **granted** MCP tools. The
  grant after REQ-TOOLS-006's controls is what the agent can call; the declared list is not.
- `REQ-TOOLS-006`: the four controls narrow the declared set; what they remove is not granted.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the spawn's `grantedTools: persona?.tools ?? []`.
- `packages/engine/src/children/ledger.ts` — `granted_mcp` from `role.persona.mcpEvidence`.
- `apps/desktop/src/run-host/tools.ts` — `createToolPort`, which knows the narrowed native set (`resolvedTools`) and the
  narrowed MCP surface, and records neither.

## Outcome

**Repaired 2026-10-01** (fin2, REQ-MCP-065 with REQ-TOOLS-006, REQ-MCP-114, REQ-MCP-100; OQ-145's reading of
`tool_restrictions` unchanged). Confirmed first by a failing engine test: the child's row held `coding-agent`'s twelve
declared tools where its port reported two.

- **No grant at spawn.** `ChildLedger.spawn` (`packages/engine/src/children/ledger.ts`) writes `granted_tools` `[]` and
  `granted_mcp` `{ granted: {}, servers: [] }`; `SpawnInput.grantedTools`, the orchestration's
  `grantedTools: persona?.tools ?? []`, `Persona.mcpEvidence`, `personaResolverFor`'s evidence argument and
  `McpHost.evidenceFor` are gone. Until a port reports, REQ-MONITOR-049's stand-in (the declared tools) is the surface's
  presentation, not a recorded grant.
- **The grant in force, recorded once the port is ready.** The run host's port reports `ToolPort.grant()`
  (`apps/desktop/src/run-host/tools.ts`) once `ready()` has resolved: the native set its one resolution kept
  (`resolvedTools`) and, from `grantEvidence` (`apps/desktop/src/run-host/mcp.ts`), every carried server with its fate and,
  under each carried server, only the tools that joined the callable map — none under `read_only` or the `restricted`
  preset, none `tool_restrictions` removed, none withheld at the plan gate or dropped for a name collision. The child's
  execution (`IterationChildren.execute`, `orchestration.ts`) awaits the same readiness before its first model step and
  records it through `ChildLedger.recordGrant` → `SessionWriter.recordChildGrant` → `StoreDal.setChildGrant` (an `UPDATE`
  of the two existing columns; no migration), republished as a `save`. A resumed or followed-up child builds a new port and
  records again.

Pinned by `packages/engine/src/children/children.test.ts` ("REQ-MCP-065 / REQ-TOOLS-006: a child's row records the grant
its port reports once ready…", and "…a child whose port reports no grant has none recorded…"), and
`apps/desktop/src/run-host/tools.test.ts` ("REQ-MCP-065 / REQ-TOOLS-006: the port reports the grant its controls left —
coordinator_only and tool_restrictions removed, an unnamed server tool not granted"; "REQ-MCP-065 / REQ-MCP-114: a
read_only persona's carried server is listed with no granted tool…"). Shown in the built app by `pnpm mcp-proof`
(launch 3, extended: the children's persona carries `tool_restrictions: { coding-agent: [read_file, echo] }`, and each
child's row records `["read_file"]` and `{ alpha: ["echo"] }`; 2026-10-01, all nine launches green, exit 0).

Left as it was: a mid-run tool-list update (REQ-MCP-060) narrows the callable set after the grant was recorded, and the
row is not rewritten; and a grant the controls left empty of native tools reads, on the surface, as no grant recorded
(REQ-MONITOR-049's stand-in), since an empty list is how the record says "none".
