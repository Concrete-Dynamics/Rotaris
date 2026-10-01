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

## Outcome

**Repaired 2026-10-01** (fin2, REQ-MCP-062 with REQ-ORCH-153). Confirmed first by two failing run-host tests and by the
built app: `pnpm plan-gate-proof`, extended so the entry role carries the MCP fixture server `alpha`, failed on the
pre-repair build because the held cycle's captured prompt printed all five of alpha's tools under `- **\`alpha\`**`.
The same shape held for a server tool dropped for colliding with a native name, which the note did not name. It is
repaired too.

- `createToolPort`'s `ready()` (`apps/desktop/src/run-host/tools.ts`) renders the MCP section, and draws the grant
  REQ-MCP-065 records, from the surface narrowed to the tools that joined the callable map. A tool the loop withheld at
  the plan gate, or dropped for a collision, is neither printed nor granted. The section's tool list for a server whose
  every tool is withheld is empty, the reading the note proposed (the `read_only` and `restricted` withholding already
  printed it so).
- **Traced: the approved segment builds new ports.** A port's readiness is resolved once, under the hold it was built
  with, and nothing re-resolves it. Approval (`Sessions.planDecision`) launches a continuation whose launch reads
  `plan_released` and carries no plan (`planLaunchFor`), so its run never holds and builds every port anew with the gate
  released. No re-resolution was needed.

Pinned by `apps/desktop/src/run-host/tools.test.ts` ("REQ-MCP-062 / REQ-ORCH-153: a server tool withheld at the plan gate
is not printed in the MCP section; on the approved run's port it is printed and callable"; "REQ-MCP-062: a server tool
dropped for colliding with a native tool name is not printed under its server"), and by
`packages/engine/src/run/plan-gate.test.ts` ("approve: the approved segment builds its tool ports anew, with the gate
released…"). Shown in the built app by `pnpm plan-gate-proof` (assertion 10, 2026-10-01, exit 0). The held cycle's
request printed `## MCP servers\n\n- \`alpha\``. The approved run's request printed alpha's five tools, which it may call.
