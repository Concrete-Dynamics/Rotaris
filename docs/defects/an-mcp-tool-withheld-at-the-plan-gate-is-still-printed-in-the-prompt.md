## An MCP tool withheld at the plan gate is still printed in the prompt

While a run is held at the plan gate, the tool port's MCP loop withholds every tool-server tool (REQ-ORCH-153: a tool
the registry carries no declaration for counts as declaring all three facets): it records the name in
`withheldAtPlanGate` and never adds it to the callable map or the listing. The prompt's MCP section is then rendered from
the surface the loop was given, which still holds that tool, so the section prints a name the agent cannot call. The
port's readiness is resolved once, so the same port never adds the tool after the plan is approved either; whether a new
port is made for the approved segment was not traced.

Noticed 2026-09-30 while repairing the same shape for `tool_restrictions` (the MCP loop in `createToolPort`), whose
repair takes a withheld tool off the surface before the executors and the section are drawn from it. Not reproduced in a
built app, and not repaired: it is outside that repair's scope.

## Specs

- `REQ-MCP-062`: the names printed under a server are set-equal, at the moment the prompt is rendered, to the names the
  persona can call on it — "a printed name SHALL be callable".
- `REQ-ORCH-153`: while the gate is held every agent holds planning grants, less every tool declaring a write or a
  command. How the planning grants and REQ-MCP-062's equality combine in the printed section is not stated; the
  `read_only` and `restricted` withholding empty the section's tool list, which is the reading this would follow.

## Relevant files

- `apps/desktop/src/run-host/tools.ts` — `createToolPort`'s `ready()`: the `planGateHeld() && withheldUnderPlanGate(e.name, false)`
  branch, and `mcpSection = mcp.section(surface)` after the loop.
- `packages/config/src/mcp/prompt.ts` — `renderMcpSection` and `printedNames`.
