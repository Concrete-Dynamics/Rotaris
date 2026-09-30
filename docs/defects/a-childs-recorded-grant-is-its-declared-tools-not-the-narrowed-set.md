## A child's recorded grant is its declared tools, not the set its controls narrowed it to

A child's execution record keeps `granted_tools` and `granted_mcp` (REQ-MCP-065). `granted_tools` is written from the
persona's declared tools (`grantedTools: persona?.tools ?? []` in the orchestration's spawn), and `granted_mcp` from the
persona's MCP grant evidence (`mcpEvidence`). Neither reads what REQ-TOOLS-006's controls left: a tool that
`coordinator_only`, `read_only` or `tool_restrictions` removed from the agent is still recorded as granted, and a
tool-server tool withheld by `read_only`, the `restricted` preset or an allowed-tool list is still recorded under its
server. The record, and the inspector that reads it, over-report whenever a control removed something. The
`tool_restrictions` repair (OQ-141, 2026-09-29) widened how often that happens; it was already true for the other controls.

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
