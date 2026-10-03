## An MCP server whose tool discovery failed reads as connected

Observed 2026-10-03 by the orchestrator's duress live run at origin/main `1763f7f` (pack `2026-10-03T06-15-52-273Z` of the
`wt-live` worktree, git-ignored; finding U3 of its autopsy), a run that passed every check. The code-intelligence server
exited with code 127 at discovery (`duress/app.log:37`, 06:16:07.854: "mcp code_intelligence: tool discovery failed
(Connection closed (code_intelligence exited with code 127 …"), and issues 1 to 3 record "failed tool discovery
(REQ-MCP-042)" for three personas. Yet every child's recorded grant gives that server the fate `connected` with an empty
grant — `children.granted_mcp` reads `{"granted":{"code_intelligence":[]},"servers":[{"name":"code_intelligence",…,
"fate":"connected"},…]}` — and the inspector draws "MCP SERVER CODE_INTELLIGENCE · STDIO · DEFAULT · CONNECTED / No tools
granted" (`duress.early.png`, `duress.mid.png`) for the 76 minutes of the run. A user asking why code intelligence was
never used reads "connected".

The persona surface keeps a server whose discovery failed among its `active` servers, flagged `discoveryFailed`, because
REQ-MCP-048 and REQ-MCP-101 still list it in the persona prompt with no tool details; `grantEvidence` then maps every
`active` server to `connected` without reading the flag.

## Specs

- REQ-MCP-114 — the inspector shows each server's fate for the agent: "carried and connected, or dropped, with the reason
  drawn from the drop rules that apply: … or tool discovery having failed (REQ-MCP-042)", sourced from the run's own
  recorded evidence. A server whose discovery failed is a dropped server with that reason, listed with no granted tools.
- REQ-MCP-042 / REQ-MCP-048 — the failure is warned and remembered, and the persona prompt still lists the server with
  no tool details; that half is right and is not in question here.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts` — `grantEvidence`, which writes `fate: 'connected'` for every active server.
- `packages/config/src/mcp/persona.ts` — `resolvePersonaMcp` keeps the failed server in `active` with
  `discoveryFailed: true` (its comment says "REQ-MCP-114 records it as carried"); `DropReason` already names
  `'discovery-failed'`, which nothing produced.
- `packages/ui/src/agents.ts` (`mcpFateText`), `packages/ui/src/Inspector.tsx`, `packages/ui/src/PersonaWindow.tsx` —
  the readers that print the recorded fate.
- `packages/engine/src/sessions.ts` (`mcpEvidenceOf`) — projects `granted_mcp` into `AgentRecord.mcpServers`.

Noticed 2026-10-03 by the autopsy of the duress live run at `1763f7f`.
